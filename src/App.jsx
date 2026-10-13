import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpDown, Award, BookOpen, Check, CheckCircle2, ClipboardCheck, ChevronRight, CirclePlay, Clock3, Code2, ExternalLink, FileText, Heart, Home, Lightbulb, Link2, LoaderCircle, Lock, Menu, Moon, Pencil, Play, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sparkles, Star, Sun, Trash2, Upload, Users, Video, X } from 'lucide-react';

import { categories, courses, getCourse } from './data/courses.js';
import { isCloudinaryConfigured, uploadImageToCloudinary, uploadMaterialToCloudinary, uploadVideoToCloudinary } from './services/cloudinary.js';
import { apiDownload, apiRequest } from './services/api.js';
import { DEFAULT_ACCESS_DAYS, accessDaysFromPolicy, accessLabel, expiryCopy, firstName, formatShortDate, isCourseComplete, learnerStatus, normalizeText, policyFromAccessDays, relativeTime } from './lib/access.js';
import { AccessChip, AccessPolicyField, ProgressRing, StatusBadge } from './components/ui.jsx';
import { CoursePolicyChips, EnrollmentProgressRow, StudentsPanel } from './components/students.jsx';
import { LandingPage } from './components/landing.jsx';
import { AuthPage } from './components/auth.jsx';
import { AdminPaymentsPanel, CheckoutPage, MyPaymentsPage, PaymentResultPage, TeacherRevenue } from './components/payments.jsx';
import { AppContext, useApp } from './lib/app-context.js';
import { amountToCents, centsToAmount, fractionDigits, formatPrice } from './lib/money.js';
import { MATERIAL_ACCEPT, formatMaterialSize, materialTypeLabel, openMaterialAccess } from './lib/materials.js';
import { COVER_MAX_BYTES, COVER_TYPES, CoverCropModal } from './components/cover-crop.jsx';
import { LessonNumber } from './components/lesson-number.jsx';
import { hasClassPrefix } from './lib/lessons.js';
import { QuizPlayer, LockedItemPanel } from './components/quiz-player.jsx';
import { firstOpenIndex, isQuiz, learnProgress, requirementText } from './lib/quizzes.js';
import { CourseOutline } from './components/course-outline.jsx';
import { QuizEditorDrawer } from './components/quiz-editor.jsx';
import { CourseDocumentsPanel, LearnerDocuments } from './components/course-documents.jsx';
import { PromoGallery } from './components/promo-gallery.jsx';
import { PromoImagesPanel } from './components/promo-images.jsx';
import { CertificateBlock } from './components/certificate.jsx';
import { VerifyPage } from './components/verify.jsx';
import { PublicCoursePage } from './components/course-public.jsx';
import { ShareCourseBlock } from './components/share-course.jsx';

function PageSkeleton({ workspace = false }) {
  return <main className="page"><div className="container skeleton-page"><div className="skeleton skeleton-eyebrow" /><div className="skeleton skeleton-title" /><div className="skeleton skeleton-copy" /><div className="skeleton-metrics">{Array.from({ length: 3 }, (_, index) => <div className="skeleton skeleton-metric" key={index} />)}</div><div className={workspace ? 'skeleton-workspace' : 'skeleton-courses'}>{Array.from({ length: workspace ? 3 : 2 }, (_, index) => <div className="skeleton skeleton-card" key={index} />)}</div></div></main>;
}

function useStoredState(key, fallback) {
  const [value, setValue] = useState(() => {
    try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : fallback; } catch { return fallback; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue];
}

function AppProvider({ children }) {
  const [theme, setTheme] = useStoredState('streamly-theme', document.documentElement.dataset.theme || 'light');
  const [session, setSession] = useStoredState('streamly-session', null);
  const [favorites, setFavorites] = useStoredState('streamly-favorites', []);
  const [enrolled, setEnrolled] = useStoredState('streamly-enrolled', ['react-desde-cero', 'notion-productividad']);
  const [progress, setProgress] = useStoredState('streamly-progress', { 'react-desde-cero': 38, 'notion-productividad': 72 });
  const [toast, setToast] = useState('');
  const [payments, setPayments] = useState({ enabled: false, currency: null, ready: false });
  const user = session?.user ?? null;
  const accessToken = session?.accessToken ?? null;
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(''), 3200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    apiRequest('/api/auth/me', { accessToken }).then(({ user: currentUser }) => {
      if (!cancelled) setSession((current) => current ? { ...current, user: currentUser } : current);
    }).catch(() => { if (!cancelled) setSession(null); });
    return () => { cancelled = true; };
  }, [accessToken, setSession]);
  useEffect(() => {
    let cancelled = false;
    apiRequest('/api/payments/config').then((config) => { if (!cancelled) setPayments({ enabled: Boolean(config.enabled), currency: config.currency || null, ready: true }); }).catch(() => { if (!cancelled) setPayments({ enabled: false, currency: null, ready: true }); });
    return () => { cancelled = true; };
  }, []);
  const notify = (message) => setToast(message);
  const formatMoney = (cents) => formatPrice(cents, payments.currency);
  const api = (path, options = {}) => apiRequest(path, { ...options, accessToken });
  const getUploadSignature = async () => { const { upload } = await api('/api/uploads/signature', { method: 'POST' }); return upload; };
  const login = async ({ email, password }) => { const next = await apiRequest('/api/auth/login', { method: 'POST', body: { email, password } }); setSession(next); return next.user; };
  const register = async ({ fullName, email, password }) => { const next = await apiRequest('/api/auth/register', { method: 'POST', body: { fullName, email, password } }); setSession(next); return next.user; };
  const logout = () => { setSession(null); notify('Sesión cerrada.'); };
  const toggleFavorite = (id) => setFavorites((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const enroll = async (id) => { if (!user) return false; await api(`/api/courses/${id}/enroll`, { method: 'POST' }); setEnrolled((items) => items.includes(id) ? items : [...items, id]); setProgress((values) => ({ ...values, [id]: values[id] ?? 0 })); notify('Curso añadido a Mi aprendizaje.'); return true; };
  const completeLesson = (id) => setProgress((values) => ({ ...values, [id]: Math.min(100, (values[id] ?? 0) + 8) }));
  const download = (path, options = {}) => apiDownload(path, { ...options, accessToken });
  const value = { theme, setTheme, payments, formatMoney, user, favorites, toggleFavorite, enrolled, enroll, progress, completeLesson, notify, api, download, getUploadSignature, login, register, logout };
  return <AppContext.Provider value={value}>{children}{toast && <div className="toast">{toast}</div>}</AppContext.Provider>;
}

function Header() {
  const { theme, setTheme, user, logout } = useApp();
  const navigate = useNavigate(); const location = useLocation(); const [search, setSearch] = useState(''); const [menuOpen, setMenuOpen] = useState(false); const [profileOpen, setProfileOpen] = useState(false); const [scrolled, setScrolled] = useState(false);
  const isLanding = location.pathname === '/' && !user;
  useEffect(() => {
    if (!isLanding) { setScrolled(false); return undefined; }
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isLanding]);
  const isWorkspace = location.pathname.startsWith('/docencia') || location.pathname.startsWith('/administracion');
  const workspaceTitle = location.pathname === '/administracion' ? 'Administración global' : 'Panel docente';
  const canTeach = user && ['admin', 'super_admin'].includes(user.role);
  const submitSearch = (event) => { event.preventDefault(); if (search.trim()) { setMenuOpen(false); navigate(`/explorar?buscar=${encodeURIComponent(search.trim())}`); } };
  const closeProfile = () => setProfileOpen(false);
  return <header className={`header ${isWorkspace ? 'workspace-header' : ''} ${scrolled ? 'is-scrolled' : ''} ${isLanding ? 'landing-nav' : ''}`}><nav className="container nav">
    <Link className="brand" to={user ? '/mi-aprendizaje' : '/'}><span className="brand-mark"><Play size={17} fill="currentColor" /></span><span className="brand-name">Streamly<span className="brand-sub">Academia</span></span></Link>
    {isWorkspace ? <div className="workspace-identity"><span>Espacio de trabajo</span><strong>{workspaceTitle}</strong></div> : <div className={`nav-links ${menuOpen ? 'open' : ''}`}>{isLanding ? <><a href="#areas" onClick={() => setMenuOpen(false)}>Áreas</a><a href="#cursos" onClick={() => setMenuOpen(false)}>Cursos</a><a href="#como-funciona" onClick={() => setMenuOpen(false)}>Cómo funciona</a><a href="#preguntas" onClick={() => setMenuOpen(false)}>Preguntas</a><NavLink to="/explorar" onClick={() => setMenuOpen(false)}>Explorar</NavLink></> : <><NavLink to="/explorar" onClick={() => setMenuOpen(false)}>Explorar</NavLink><NavLink to="/mi-aprendizaje" onClick={() => setMenuOpen(false)}>Mi aprendizaje</NavLink></>}</div>}
    {!isWorkspace && <form className="nav-search" onSubmit={submitSearch}><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="¿Qué quieres aprender?" /></form>}
    <div className="nav-actions">{isWorkspace && <Link className="button button-ghost workspace-back" to="/mi-aprendizaje"><ArrowLeft size={17} /> Mi aprendizaje</Link>}<button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Cambiar tema">{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>{user ? <div className="profile-wrap"><button className="avatar" type="button" onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen} aria-label="Abrir menú de perfil">{(user.fullName || user.name).slice(0, 1).toUpperCase()}</button>{profileOpen && <div className="profile-menu"><div className="profile-summary"><strong>{user.fullName || user.name}</strong><span>{user.role === 'student' ? 'Estudiante' : user.role === 'admin' ? 'Instructor' : 'Super administrador'}</span></div><Link to="/mi-aprendizaje" onClick={closeProfile}>Mi aprendizaje</Link><Link to="/mis-pagos" onClick={closeProfile}>Mis pagos</Link><Link to="/perfil" onClick={closeProfile}>Mi perfil</Link>{canTeach && <Link to="/docencia" onClick={closeProfile}>Panel docente</Link>}{user.role === 'super_admin' && <Link to="/administracion" onClick={closeProfile}>Administración global</Link>}<button type="button" onClick={() => { closeProfile(); logout(); navigate('/'); }}>Cerrar sesión</button></div>}</div> : <Link className="button button-primary" to="/login">Entrar</Link>}{!isWorkspace && <button className="icon-button menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen}>{menuOpen ? <X /> : <Menu />}</button>}</div>
  </nav></header>;
}

function HomePage() {
  const { user, api } = useApp();
  const [featured, setFeatured] = useState(null);
  const [featuredError, setFeaturedError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [promo, setPromo] = useState([]);
  useEffect(() => {
    if (user) return undefined;
    let cancelled = false;
    api('/api/courses/promo').then(({ slides }) => { if (!cancelled) setPromo(Array.isArray(slides) ? slides : []); }).catch(() => { if (!cancelled) setPromo([]); });
    return () => { cancelled = true; };
  }, [user, reloadKey]);
  useEffect(() => {
    if (user) return undefined;
    let cancelled = false;
    setFeaturedError(false);
    api('/api/courses').then(({ courses: list }) => { if (!cancelled) setFeatured((list || []).slice(0, 6)); }).catch(() => { if (!cancelled) { setFeatured([]); setFeaturedError(true); } });
    return () => { cancelled = true; };
  }, [user, reloadKey]);
  const retryFeatured = () => { setFeaturedError(false); setFeatured(null); setReloadKey((key) => key + 1); };
  if (user) return <Navigate to="/mi-aprendizaje" replace />;
  return <LandingPage featured={featured} promo={promo} featuredError={featuredError} onRetry={retryFeatured} renderCourse={(course) => <PublicCourseCard course={course} />} />;
}

function DashboardPage() {
  const { user, enrolled, progress, favorites } = useApp(); const navigate = useNavigate(); if (!user) return <Navigate to="/login" replace />; const myCourses = courses.filter((course) => enrolled.includes(course.id)); const average = myCourses.length ? Math.round(myCourses.reduce((total, course) => total + (progress[course.id] || 0), 0) / myCourses.length) : 0;
  return <main className="page"><div className="container"><div className="dashboard-head"><div><span className="eyebrow"><Sparkles size={15} /> Tu espacio</span><h1 style={{ marginTop: 11 }}>Hola, {user.fullName || user.name} 👋</h1><p>Un paso más cerca de aquello que quieres crear.</p></div><Link className="button button-secondary" to="/explorar"><Search size={17} /> Explorar cursos</Link></div><div className="metrics"><div className="metric"><span>Cursos en progreso</span><strong>{myCourses.length}</strong></div><div className="metric"><span>Progreso promedio</span><strong>{average}%</strong></div><div className="metric"><span>Guardados para después</span><strong>{favorites.length}</strong></div></div><div className="section-heading"><div><h2>Continúa aprendiendo</h2><p>Tus cursos te están esperando.</p></div></div>{myCourses.length ? <div className="learning-list">{myCourses.map((course) => { const value = progress[course.id] || 0; return <article className="learning-card" key={course.id}><img src={course.image} alt="" /><div><span className="course-instructor">{course.category} · {course.instructor}</span><h3>{course.title}</h3><p>{value === 0 ? 'Listo para empezar tu primera lección.' : `Vas por el ${value}% del curso.`}</p><div className="progress-wrap"><i style={{ width: `${value}%` }} /></div><div className="progress-label"><span>{value}% completado</span><span>{course.lessons} lecciones</span></div></div><button className="button button-primary" onClick={() => navigate(`/aprender/${course.id}`)}>{value ? 'Continuar' : 'Comenzar'} <Play size={16} fill="currentColor" /></button></article>; })}</div> : <div className="empty"><BookOpen size={28} style={{ marginBottom: 9 }} /><br />Aún no tienes cursos. <Link className="text-link" to="/explorar">Encuentra el primero</Link>.</div>}</div></main>;
}

function LearnPage() {
  const { id } = useParams(); const course = getCourse(id); const { user, enrolled, progress, completeLesson, notify } = useApp(); const navigate = useNavigate(); const [lesson, setLesson] = useState(0); if (!course) return <Navigate to="/explorar" replace />; if (!user || !enrolled.includes(id)) return <Navigate to={`/curso/${id}`} replace />; const lessons = course.curriculum.flatMap((section) => Array.from({ length: Math.min(section.lessons, 3) }, (_, index) => ({ title: index === 0 ? section.title : `${section.title} · Parte ${index + 1}`, duration: `${8 + index * 5}:2${index}` })));
  const complete = () => { completeLesson(id); notify('¡Lección completada! Tu progreso se actualizó.'); if (lesson < lessons.length - 1) setLesson(lesson + 1); };
  return <main className="learn-page"><div className="container learn-top"><Link to="/mi-aprendizaje" className="text-link" style={{ color: '#d4caff' }}><ArrowLeft size={17} /> Mi aprendizaje</Link><h1>{course.title}</h1><span style={{ color: '#c9c2df', fontSize: '.85rem' }}>{progress[id] || 0}% completado</span></div><div className="learn-grid"><section className="player-zone"><div className="video-placeholder"><button className="play-circle" onClick={complete} aria-label="Completar y continuar"><Play size={31} fill="currentColor" /></button></div><div className="lesson-copy"><span className="eyebrow">Lección {lesson + 1} de {lessons.length}</span><h2 style={{ marginTop: 12 }}>{lessons[lesson].title}</h2><p>En esta lección veremos los conceptos clave y los aplicaremos en una acción pequeña. Cuando termines, marca la lección como completada para actualizar tu avance.</p><button className="button button-primary" onClick={complete}><Check size={17} /> Completar y continuar</button></div></section><aside className="course-sidebar"><h3>Contenido del curso</h3>{lessons.map((item, index) => <button className={`lesson ${lesson === index ? 'active' : ''} ${index < lesson ? 'done' : ''}`} key={`${item.title}-${index}`} onClick={() => setLesson(index)}><CheckCircle2 size={17} /><span>{item.title}<small>{item.duration}</small></span></button>)}</aside></div></main>;
}

function StudioPage() {
  const { user, notify } = useApp(); const navigate = useNavigate(); const [title, setTitle] = useState(''); const [category, setCategory] = useState('Desarrollo'); const [file, setFile] = useState(null); const [uploading, setUploading] = useState(false); const [progress, setProgress] = useState(0); const [uploadedUrl, setUploadedUrl] = useState('');
  if (!user) return <Navigate to="/login" replace />;
  if (!['admin', 'super_admin'].includes(user.role)) return <Navigate to="/gestion" replace />;
  const upload = async () => { if (!file) { notify('Elige un video antes de subirlo.'); return; } setUploading(true); setProgress(14); try { const response = await uploadVideoToCloudinary(file, setProgress); setProgress(100); setUploadedUrl(response.secureUrl); notify('Video subido a Cloudinary correctamente.'); } catch (error) { notify(error.message); } finally { setUploading(false); } };
  const saveDraft = (event) => { event.preventDefault(); if (!title.trim()) { notify('Escribe un título para guardar el borrador.'); return; } notify(uploadedUrl ? 'Borrador guardado con su video.' : 'Borrador guardado localmente.'); };
  return <main className="page"><div className="container"><div className="dashboard-head"><div><span className="eyebrow"><Video size={15} /> Panel del instructor</span><h1 style={{ marginTop: 11 }}>Comparte lo que sabes</h1><p>Construye una experiencia clara y útil para tus próximos estudiantes.</p></div><button className="button button-secondary" onClick={() => navigate('/explorar')}>Ver catálogo</button></div><div className="studio-grid"><form className="studio-card" onSubmit={saveDraft}><h2>Crea un nuevo curso</h2><p style={{ color: 'var(--muted)' }}>Empieza con lo esencial. Podrás añadir lecciones y detalles después.</p><label className="form-field">Título del curso<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Ilustración digital desde cero" /></label><label className="form-field">Categoría<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="form-field">Descripción<textarea rows="4" placeholder="¿Qué transformación obtendrán tus estudiantes?" /></label><div className="upload-drop"><Upload size={28} /><strong>{file ? file.name : 'Sube tu video de bienvenida'}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · listo para subir` : 'MP4, MOV o WebM. Se subirá directamente a Cloudinary.'}</span><label className="button button-secondary" style={{ marginTop: 15 }}><input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event) => { setFile(event.target.files?.[0] || null); setUploadedUrl(''); setProgress(0); }} />Elegir video</label>{file && <button type="button" className="button button-primary" style={{ marginTop: 11 }} disabled={uploading} onClick={upload}>{uploading ? 'Subiendo…' : 'Subir a Cloudinary'} <Upload size={16} /></button>}{(uploading || progress === 100) && <div className="upload-progress"><i style={{ width: `${progress}%` }} /></div>}{uploadedUrl && <span style={{ display: 'block', marginTop: 12, color: '#24a473', fontWeight: 700 }}>✓ Video listo para usar</span>}</div><button className="button button-primary" type="submit"><Plus size={17} /> Guardar borrador</button></form><aside><div className="studio-help"><h3>Tu video y Cloudinary</h3>{isCloudinaryConfigured() ? <p><strong style={{ color: '#24a473' }}>Configurado.</strong> El video se subirá desde el navegador usando el upload preset público.</p> : <p>Falta configurar Cloudinary. Cuando tengas las credenciales, crea <code>.env</code> con el cloud name y un <strong>unsigned upload preset</strong>.</p>}<ul><li>Nunca coloques el API secret en el frontend.</li><li>Para publicar cursos necesitarás el endpoint correspondiente en el backend.</li><li>Este formulario guarda el borrador en modo demo por ahora.</li></ul></div></aside></div></div></main>;
}

function LessonComposer({ course, onSaved }) {
  const { api, getUploadSignature, notify } = useApp();
  const [expanded, setExpanded] = useState(false); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [file, setFile] = useState(null); const [uploading, setUploading] = useState(false); const [progress, setProgress] = useState(0);
  const saveLesson = async (event) => { event.preventDefault(); if (!title.trim() || !file) { notify('Agrega el título y el video de la lección.'); return; } setUploading(true); setProgress(10); try { const signedUpload = await getUploadSignature(); setProgress(25); const video = await uploadVideoToCloudinary(file, signedUpload, setProgress); await api(`/api/admin/courses/${course.id}/lessons`, { method: 'POST', body: { title: title.trim(), description: description.trim(), videoUrl: video.secureUrl, videoPublicId: video.publicId, durationSeconds: video.durationSeconds, position: course.lessonCount + 1 } }); setTitle(''); setDescription(''); setFile(null); setProgress(0); setExpanded(false); notify('Lección guardada y video alojado en Cloudinary.'); await onSaved(); } catch (error) { setProgress(0); notify(error.message); } finally { setUploading(false); } };
  if (!expanded) return <button className="button button-secondary" style={{ marginTop: 10, width: '100%' }} onClick={() => setExpanded(true)}><Video size={16} /> Añadir lección con video</button>;
  return <form onSubmit={saveLesson} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}><label className="form-field">Título de la lección<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Bienvenida al curso" /></label><label className="form-field">Descripción<textarea rows="2" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Qué aprenderá el estudiante" /></label><div className="upload-drop"><Upload size={24} /><strong>{file ? file.name : 'Selecciona el video de esta lección'}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · se guardará en Cloudinary` : 'MP4, MOV o WebM.'}</span><label className="button button-secondary" style={{ marginTop: 12 }}><input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event) => { setFile(event.target.files?.[0] || null); setProgress(0); }} />Elegir video</label>{uploading && <div className="upload-progress"><i style={{ width: `${progress}%` }} /></div>}</div><div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="button button-primary" disabled={uploading}>{uploading ? 'Subiendo video…' : 'Guardar lección'}</button><button className="button button-secondary" type="button" disabled={uploading} onClick={() => setExpanded(false)}>Cancelar</button></div></form>;
}

function ManagementPage() {
  const { user, api, notify } = useApp();
  const [managedCourses, setManagedCourses] = useState([]); const [users, setUsers] = useState([]); const [loading, setLoading] = useState(true);
  const [courseForm, setCourseForm] = useState({ title: '', subtitle: '', description: '', category: 'Desarrollo', level: 'beginner', priceCents: 0, ownerId: '' });
  const [userForm, setUserForm] = useState({ fullName: '', email: '', password: '', role: 'student' });
  const allowed = Boolean(user && ['admin', 'super_admin'].includes(user.role));
  const load = async () => { if (!allowed) return; setLoading(true); try { const result = await api('/api/admin/courses'); setManagedCourses(result.courses); if (user.role === 'super_admin') { const people = await api('/api/super/users'); setUsers(people.users); } } catch (error) { notify(error.message); } finally { setLoading(false); } };
  useEffect(() => { if (allowed) void load(); }, [user?.id]);
  if (!user) return <Navigate to="/login" replace />;
  if (!allowed) return <Navigate to="/mi-aprendizaje" replace />;
  const createCourse = async (event) => { event.preventDefault(); try { const payload = { ...courseForm, priceCents: Number(courseForm.priceCents) || 0, ...(user.role === 'super_admin' && courseForm.ownerId ? { ownerId: Number(courseForm.ownerId) } : {}) }; delete payload.ownerId; if (user.role === 'super_admin' && courseForm.ownerId) payload.ownerId = Number(courseForm.ownerId); await api('/api/admin/courses', { method: 'POST', body: payload }); notify('Curso creado como borrador.'); setCourseForm({ title: '', subtitle: '', description: '', category: 'Desarrollo', level: 'beginner', priceCents: 0, ownerId: '' }); await load(); } catch (error) { notify(error.message); } };
  const publish = async (courseId) => { try { await api(`/api/admin/courses/${courseId}/publish`, { method: 'POST' }); notify('Curso publicado.'); await load(); } catch (error) { notify(error.message); } };
  const createUser = async (event) => { event.preventDefault(); try { await api('/api/super/users', { method: 'POST', body: userForm }); notify('Usuario creado.'); setUserForm({ fullName: '', email: '', password: '', role: 'student' }); await load(); } catch (error) { notify(error.message); } };
  const setRole = async (target, role) => { try { await api(`/api/super/users/${target.id}`, { method: 'PATCH', body: { role } }); notify(`Rol actualizado para ${target.fullName}.`); await load(); } catch (error) { notify(error.message); } };
  const owners = users.filter((item) => ['admin', 'super_admin'].includes(item.role) && item.isActive);
  return <main className="page"><div className="container"><div className="dashboard-head"><div><span className="eyebrow"><ShieldCheck size={15} /> Área docente</span><h1 style={{ marginTop: 11 }}>Biblioteca docente</h1><p>Crea, estructura y publica contenido para tus estudiantes desde un espacio dedicado.</p></div><button className="button button-secondary" onClick={() => void load()}>Actualizar</button></div><div className="studio-grid"><form className="studio-card" onSubmit={createCourse}><h2>Nuevo curso</h2><p style={{ color: 'var(--muted)' }}>Se crea como borrador y solo se publica cuando tenga al menos una lección.</p><label className="form-field">Título<input required value={courseForm.title} onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })} /></label><label className="form-field">Subtítulo<input value={courseForm.subtitle} onChange={(event) => setCourseForm({ ...courseForm, subtitle: event.target.value })} /></label><label className="form-field">Descripción<textarea required rows="4" value={courseForm.description} onChange={(event) => setCourseForm({ ...courseForm, description: event.target.value })} /></label><label className="form-field">Categoría<select value={courseForm.category} onChange={(event) => setCourseForm({ ...courseForm, category: event.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="form-field">Nivel<select value={courseForm.level} onChange={(event) => setCourseForm({ ...courseForm, level: event.target.value })}><option value="beginner">Principiante</option><option value="intermediate">Intermedio</option><option value="advanced">Avanzado</option></select></label>{user.role === 'super_admin' && <label className="form-field">Propietario del curso<select value={courseForm.ownerId} onChange={(event) => setCourseForm({ ...courseForm, ownerId: event.target.value })}><option value="">Yo ({user.fullName})</option>{owners.filter((owner) => owner.id !== user.id).map((owner) => <option key={owner.id} value={owner.id}>{owner.fullName} · {owner.role}</option>)}</select></label>}<button className="button button-primary" type="submit"><Plus size={17} /> Crear borrador</button></form><aside className="studio-help"><h3>Tu espacio docente</h3><p><strong>{user.role === 'super_admin' ? 'Acceso docente global' : 'Propietario de cursos'}</strong></p><p>Crea borradores, organiza lecciones y publica contenido cuando esté listo para tus estudiantes.</p></aside></div><section className="section"><div className="section-heading"><div><h2>{user.role === 'super_admin' ? 'Cursos de la plataforma' : 'Mis cursos'}</h2><p>Gestiona el contenido antes de hacerlo público.</p></div></div>{loading ? <div className="empty">Cargando datos de la plataforma…</div> : managedCourses.length ? <div className="course-grid">{managedCourses.map((course) => <article className="course-card" key={course.id}><div className="course-body"><span className="course-instructor">{course.ownerName} · {course.category}</span><h3 className="course-title">{course.title}</h3><div className="course-meta"><span>{course.level}</span><span>•</span><span>{course.lessonCount} lecciones</span></div><div className="course-price">{course.status === 'published' ? 'Publicado' : 'Borrador'}</div><LessonComposer course={course} onSaved={load} />{course.status !== 'published' && <button className="button button-primary" style={{ marginTop: 12, width: '100%' }} onClick={() => publish(course.id)}>Publicar</button>}</div></article>)}</div> : <div className="empty">Aún no hay cursos en este panel.</div>}</section>{false && <section className="section"><div className="section-heading"><div><h2>Usuarios y roles</h2><p>Crea cuentas y define quién puede ser dueño de cursos.</p></div></div><div className="studio-grid"><form className="studio-card" onSubmit={createUser}><h2>Crear usuario</h2><label className="form-field">Nombre<input required value={userForm.fullName} onChange={(event) => setUserForm({ ...userForm, fullName: event.target.value })} /></label><label className="form-field">Correo<input type="email" required value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} /></label><label className="form-field">Contraseña<input type="password" minLength="10" required value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} /></label><label className="form-field">Rol<select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}><option value="student">student</option><option value="admin">admin</option><option value="super_admin">super_admin</option></select></label><button className="button button-primary">Crear usuario</button></form><div className="studio-card"><h2>Personas registradas</h2>{users.length ? <div className="learning-list">{users.map((person) => <div className="curriculum-item" key={person.id}><div><strong>{person.fullName}</strong><span style={{ display: 'block', fontSize: '.82rem' }}>{person.email}</span></div><select className="select" value={person.role} disabled={person.id === user.id} onChange={(event) => setRole(person, event.target.value)}><option value="student">student</option><option value="admin">admin</option><option value="super_admin">super_admin</option></select></div>)}</div> : <p style={{ color: 'var(--muted)' }}>Sin usuarios todavía.</p>}</div></div></section>}</div></main>;
}

function SuperAdminPage() {
  const { user, api, notify } = useApp();
  const [users, setUsers] = useState([]); const [coursesForAdmin, setCoursesForAdmin] = useState([]); const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({ fullName: '', email: '', password: '', role: 'student' });
  const allowed = user?.role === 'super_admin';
  const load = async () => { if (!allowed) return; setLoading(true); try { const [people, courseData] = await Promise.all([api('/api/super/users'), api('/api/admin/courses')]); setUsers(people.users); setCoursesForAdmin(courseData.courses); } catch (error) { notify(error.message); } finally { setLoading(false); } };
  useEffect(() => { if (allowed) void load(); }, [user?.id]);
  if (!user) return <Navigate to="/login" replace />;
  if (!allowed) return <Navigate to="/mi-aprendizaje" replace />;
  const staff = users.filter((person) => person.isActive && ['admin', 'super_admin'].includes(person.role));
  const createUser = async (event) => { event.preventDefault(); try { await api('/api/super/users', { method: 'POST', body: newUser }); notify('Cuenta creada correctamente.'); setNewUser({ fullName: '', email: '', password: '', role: 'student' }); await load(); } catch (error) { notify(error.message); } };
  const updateRole = async (person, role) => { try { await api(`/api/super/users/${person.id}`, { method: 'PATCH', body: { role } }); notify(`Rol de ${person.fullName} actualizado.`); await load(); } catch (error) { notify(error.message); } };
  const updateActivity = async (person) => { try { await api(`/api/super/users/${person.id}`, { method: 'PATCH', body: { isActive: !person.isActive } }); notify(person.isActive ? 'Cuenta desactivada.' : 'Cuenta activada.'); await load(); } catch (error) { notify(error.message); } };
  const assignOwner = async (courseId, ownerId) => { try { await api(`/api/super/courses/${courseId}/owner`, { method: 'POST', body: { ownerId: Number(ownerId) } }); notify('Responsable del curso actualizado.'); await load(); } catch (error) { notify(error.message); } };
  return <main className="page"><div className="container"><div className="dashboard-head"><div><span className="eyebrow"><ShieldCheck size={15} /> Administración de plataforma</span><h1 style={{ marginTop: 11 }}>Operación global</h1><p>Gestiona acceso, responsabilidades y cuentas. La creación de contenido vive en el Área docente.</p></div><button className="button button-secondary" onClick={() => void load()}>Actualizar</button></div><div className="metrics"><div className="metric"><span>Usuarios</span><strong>{users.length}</strong></div><div className="metric"><span>Instructores activos</span><strong>{staff.length}</strong></div><div className="metric"><span>Cursos en plataforma</span><strong>{coursesForAdmin.length}</strong></div></div><div className="studio-grid"><form className="studio-card" onSubmit={createUser}><h2>Nueva cuenta</h2><p style={{ color: 'var(--muted)' }}>Crea alumnos o asigna a una persona como instructor.</p><label className="form-field">Nombre completo<input required value={newUser.fullName} onChange={(event) => setNewUser({ ...newUser, fullName: event.target.value })} /></label><label className="form-field">Correo<input type="email" required value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} /></label><label className="form-field">Contraseña temporal<input type="password" minLength="10" required value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} /></label><label className="form-field">Rol inicial<select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}><option value="student">Alumno</option><option value="admin">Instructor / dueño de cursos</option><option value="super_admin">Super administrador</option></select></label><button className="button button-primary">Crear cuenta</button></form><aside className="studio-help"><h3>Separación de responsabilidades</h3><p><strong>Área docente:</strong> creación, lecciones y publicación de cursos.</p><p><strong>Administración:</strong> cuentas, roles y responsables de cursos.</p><p>Los cambios de rol se aplican en el servidor y tienen efecto inmediato en la siguiente solicitud.</p></aside></div><section className="section"><div className="section-heading"><div><h2>Personas y permisos</h2><p>Otorga acceso según la responsabilidad de cada persona.</p></div></div><div className="studio-card">{loading ? <div className="empty">Cargando administración…</div> : users.length ? <div className="learning-list">{users.map((person) => <div className="curriculum-item" key={person.id}><div><strong>{person.fullName}</strong><span style={{ display: 'block', fontSize: '.82rem', color: 'var(--muted)' }}>{person.email} · {person.isActive ? 'Activa' : 'Desactivada'}</span></div><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><select className="select" value={person.role} disabled={person.id === user.id} onChange={(event) => updateRole(person, event.target.value)}><option value="student">Alumno</option><option value="admin">Instructor</option><option value="super_admin">Super admin</option></select><button className="button button-secondary" disabled={person.id === user.id} onClick={() => updateActivity(person)}>{person.isActive ? 'Desactivar' : 'Activar'}</button></div></div>)}</div> : <div className="empty">Aún no hay cuentas registradas.</div>}</div></section><section className="section"><div className="section-heading"><div><h2>Responsables de cursos</h2><p>La autoría y la publicación permanecen bajo el responsable asignado.</p></div></div><div className="studio-card">{coursesForAdmin.length ? <div className="learning-list">{coursesForAdmin.map((course) => <div className="curriculum-item" key={course.id}><div><strong>{course.title}</strong><span style={{ display: 'block', fontSize: '.82rem', color: 'var(--muted)' }}>{course.status} · Responsable actual: {course.ownerName}</span></div><select className="select" value={course.ownerId} onChange={(event) => assignOwner(course.id, event.target.value)}>{staff.map((person) => <option key={person.id} value={person.id}>{person.fullName} · {person.role === 'admin' ? 'Instructor' : 'Super admin'}</option>)}</select></div>)}</div> : <div className="empty">No existen cursos aún. Créalo desde Área docente.</div>}</div></section></div></main>;
}

function WorkspaceTabs({ tabs, active, onChange }) {
  return <aside className="workspace-sidebar" aria-label="Navegación del workspace"><span className="workspace-sidebar-label">Secciones</span>{tabs.map((tab) => <button key={tab.id} className={active === tab.id ? 'active' : ''} onClick={() => onChange(tab.id)}>{tab.label}</button>)}</aside>;
}

function InstructorWorkspacePage() {
  const { user, api, notify, payments } = useApp(); const navigate = useNavigate(); const priceLabel = payments.currency ? `Precio (${payments.currency})` : 'Precio'; const priceStep = fractionDigits(payments.currency) === 0 ? 1 : 0.01; const [tab, setTab] = useState('overview'); const [data, setData] = useState(null); const [students, setStudents] = useState([]); const [selectedCourse, setSelectedCourse] = useState(''); const [categoryOptions, setCategoryOptions] = useState([]); const [form, setForm] = useState({ title: '', subtitle: '', description: '', category: '', level: 'beginner', priceAmount: '', accessPolicy: { mode: 'limited', days: String(DEFAULT_ACCESS_DAYS) } }); const [creating, setCreating] = useState(false); const [accessError, setAccessError] = useState(''); const [loading, setLoading] = useState(true); const [openingCourseId, setOpeningCourseId] = useState(null); const [studentsLoadingCourseId, setStudentsLoadingCourseId] = useState(null); const [studentsCourse, setStudentsCourse] = useState(null); const [studentSearch, setStudentSearch] = useState(''); const [studentStatusFilter, setStudentStatusFilter] = useState('all'); const [studentSort, setStudentSort] = useState('activity'); const [expandedStudentId, setExpandedStudentId] = useState(null); const [studentProgressById, setStudentProgressById] = useState({}); const [studentProgressLoadingId, setStudentProgressLoadingId] = useState(null);
  const allowed = Boolean(user && ['admin', 'super_admin'].includes(user.role));
  const load = async () => { if (!allowed) return; setLoading(true); try { setData(await api('/api/admin/overview')); } catch (error) { notify(error.message); } finally { setLoading(false); } };
  useEffect(() => { if (allowed) { void load(); api('/api/categories').then((result) => { setCategoryOptions(result.categories || []); setForm((current) => current.category || !result.categories?.length ? current : { ...current, category: result.categories[0].name }); }).catch((error) => notify(error.message)); } }, [user?.id]);
  if (!user) return <Navigate to="/login" replace />; if (!allowed) return <Navigate to="/mi-aprendizaje" replace />; if (loading) return <PageSkeleton workspace />;
  const createCourse = async (event) => { event.preventDefault(); if (creating) return; const price = Number(form.priceAmount || 0); if (!Number.isFinite(price) || price < 0) { notify('Ingresa un precio válido.'); return; } let accessDays; try { accessDays = accessDaysFromPolicy(form.accessPolicy); setAccessError(''); } catch (policyError) { setAccessError(policyError.message); return; } setCreating(true); try { const { accessPolicy: _accessPolicy, priceAmount: _priceAmount, ...courseFields } = form; const created = await api('/api/admin/courses', { method: 'POST', body: { ...courseFields, priceCents: amountToCents(price), accessDays } }); setForm({ title: '', subtitle: '', description: '', category: categoryOptions[0]?.name || '', level: 'beginner', priceAmount: '', accessPolicy: { mode: 'limited', days: String(DEFAULT_ACCESS_DAYS) } }); notify('Curso creado. Ahora agrega sus secciones y clases.'); await load(); navigate(`/docencia/cursos/${created.course.id}`); } catch (error) { notify(error.message); } finally { setCreating(false); } };
  const publish = async (courseId) => { try { await api(`/api/admin/courses/${courseId}/publish`, { method: 'POST' }); notify('Curso publicado.'); await load(); } catch (error) { notify(error.message); } };
  const viewStudents = async (courseId) => { setSelectedCourse(courseId); setStudentsLoadingCourseId(courseId); setStudentSearch(''); setStudentStatusFilter('all'); setExpandedStudentId(null); setStudentProgressLoadingId(null); try { const result = await api(`/api/admin/courses/${courseId}/students`); setStudents(result.students); setStudentsCourse(result.course); setTab('students'); } catch (error) { notify(error.message); } finally { setStudentsLoadingCourseId(null); } };
  const toggleStudent = async (student) => { if (expandedStudentId === student.id) { setExpandedStudentId(null); return; } setExpandedStudentId(student.id); const courseId = selectedCourse; const cacheKey = `${courseId}:${student.id}`; if (studentProgressById[cacheKey]) return; setStudentProgressLoadingId(student.id); try { const result = await api(`/api/admin/courses/${courseId}/students/${student.id}/progress`); setStudentProgressById((current) => ({ ...current, [cacheKey]: result })); } catch (error) { notify(error.message); setExpandedStudentId((current) => (current === student.id ? null : current)); } finally { setStudentProgressLoadingId((current) => (current === student.id ? null : current)); } };
  const openCourseEditor = async (courseId) => { setOpeningCourseId(courseId); await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))); navigate(`/docencia/cursos/${courseId}`); };
  const metrics = data?.metrics ?? { totalCourses: 0, publishedCourses: 0, draftCourses: 0, totalEnrollments: 0, totalCompletions: 0 }; const coursesData = data?.courses ?? []; const selectedCourseInfo = coursesData.find((course) => Number(course.id) === Number(selectedCourse));
  const studentsView = studentsCourse && Number(studentsCourse.id) === Number(selectedCourse) ? studentsCourse : { id: selectedCourse, title: selectedCourseInfo?.title ?? 'Curso', accessDays: selectedCourseInfo?.accessDays ?? null };
  const studentProgressView = {}; students.forEach((student) => { const entry = studentProgressById[`${selectedCourse}:${student.id}`]; if (entry) studentProgressView[student.id] = entry; });
  return <main className="page"><div className="container"><div className="workspace-page-head"><div><span className="eyebrow"><ShieldCheck size={15} /> Panel docente</span><h1>Tu operación educativa</h1><p>Contenido, alumnos y resultados de los cursos bajo tu responsabilidad.</p></div><button className="button button-secondary" onClick={() => void load()}>Actualizar datos</button></div><WorkspaceTabs active={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Resumen' }, { id: 'create', label: 'Nuevo curso' }, { id: 'courses', label: 'Mis cursos' }, { id: 'students', label: 'Alumnos' }, { id: 'analytics', label: 'Analítica' }]} />{tab === 'overview' && <><div className="metrics"><div className="metric"><span>Cursos publicados</span><strong>{metrics.publishedCourses}</strong></div><div className="metric"><span>Inscripciones</span><strong>{metrics.totalEnrollments}</strong></div><div className="metric"><span>Finalizaciones</span><strong>{metrics.totalCompletions}</strong></div></div><section className="workspace-card"><h2>Salud de tus cursos</h2>{coursesData.length ? <div className="data-list">{coursesData.slice(0, 5).map((course) => <div className="teacher-course-row" key={course.id}><img src={courseImage(course)} alt={`Portada de ${course.title}`} /><div className="teacher-course-copy"><strong>{course.title}</strong><span>{course.status === 'published' ? 'Publicado' : 'Borrador'} · {course.lessonCount} lecciones</span><CoursePolicyChips course={course} /></div><div className="data-row-stats"><span>{course.enrollmentCount} inscritos</span><span>{course.averageProgress}% avance medio</span></div></div>)}</div> : <div className="empty">Crea tu primer curso para comenzar a medir resultados.</div>}</section></>}{tab === 'create' && <div className="workspace-create-layout"><form className="workspace-card" onSubmit={createCourse}><h2>Nuevo curso</h2><label className="form-field">Título<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="form-field">Subtítulo<input value={form.subtitle} onChange={(event) => setForm({ ...form, subtitle: event.target.value })} /></label><label className="form-field">Descripción<textarea required rows="4" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label className="form-field">Categoría<select required disabled={!categoryOptions.length} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="">{categoryOptions.length ? 'Selecciona una categoría' : 'Cargando categorías…'}</option>{categoryOptions.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label><label className="form-field">Nivel<select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}><option value="beginner">Principiante</option><option value="intermediate">Intermedio</option><option value="advanced">Avanzado</option></select></label><label className="form-field">{priceLabel}<input type="number" min="0" step={priceStep} value={form.priceAmount} onChange={(event) => setForm({ ...form, priceAmount: event.target.value })} placeholder={fractionDigits(payments.currency) === 0 ? '0' : '0.00'} /></label><AccessPolicyField value={form.accessPolicy} onChange={(accessPolicy) => { setAccessError(''); setForm({ ...form, accessPolicy }); }} disabled={creating} error={accessError} /><button className="button button-primary" disabled={creating}>{creating ? <><LoaderCircle className="button-spinner" size={17} /> Creando…</> : <><Plus size={16} /> Crear borrador</>}</button></form><section className="workspace-card" style={{ display: 'none' }}><h2>Mis cursos</h2>{coursesData.length ? <div className="course-ops-list">{coursesData.map((course) => <article className="course-op" key={course.id}><div><strong>{course.title}</strong><span>{course.status} · {course.lessonCount} lecciones · {course.enrollmentCount} inscritos</span></div><div className="course-op-actions"><button className="button button-secondary" onClick={() => viewStudents(course.id)}>Alumnos</button>{course.status !== 'published' && <button className="button button-primary" onClick={() => publish(course.id)}>Publicar</button>}<button className="button button-secondary" onClick={() => navigate(`/docencia/cursos/${course.id}`)}>Editar curso</button></div></article>)}</div> : <div className="empty">Aún no hay cursos.</div>}</section></div>}{tab === 'courses' && <section className="workspace-card"><div className="section-heading"><div><h2>Mis cursos</h2><p>Gestiona contenido y revisa quién tiene acceso a cada curso.</p></div></div>{coursesData.length ? <div className="course-ops-list">{coursesData.map((course) => <article className="course-op teacher-course-card" key={course.id}><img src={courseImage(course)} alt={`Portada de ${course.title}`} /><div className="teacher-course-card-body"><div><strong>{course.title}</strong><span>{course.status === 'published' ? 'Publicado' : 'Borrador'} · {course.lessonCount} lecciones · {course.enrollmentCount} inscritos</span><CoursePolicyChips course={course} /><ShareCourseBlock course={course} variant="compact" /></div><div className="course-op-actions"><button className="button button-secondary" disabled={studentsLoadingCourseId === course.id || openingCourseId === course.id} onClick={() => { void viewStudents(course.id); }}>{studentsLoadingCourseId === course.id ? <><LoaderCircle className="button-spinner" size={17} /> Cargando…</> : `Alumnos (${course.enrollmentCount})`}</button><button className="button button-primary" disabled={openingCourseId === course.id || studentsLoadingCourseId === course.id} onClick={() => { void openCourseEditor(course.id); }}>{openingCourseId === course.id ? <><LoaderCircle className="button-spinner" size={17} /> Abriendo…</> : 'Editar curso'}</button></div></div></article>)}</div> : <div className="empty">Aún no tienes cursos. Usa Nuevo curso para crear el primero.</div>}</section>}{tab === 'students' && <section className="workspace-card"><div className="section-heading"><div><h2>{selectedCourseInfo ? `Alumnos de: ${selectedCourseInfo.title}` : 'Alumnos por curso'}</h2><p>{selectedCourseInfo ? `${selectedCourseInfo.enrollmentCount} inscritos · avance y última actividad de cada inscripción.` : 'Selecciona un curso para ver sus alumnos, avance y última actividad.'}</p></div></div><select className="select" value={selectedCourse} onChange={(event) => event.target.value && viewStudents(event.target.value)}><option value="">Selecciona un curso</option>{coursesData.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select>{selectedCourse ? <StudentsPanel course={studentsView} students={students} loading={studentsLoadingCourseId !== null} search={studentSearch} onSearch={setStudentSearch} statusFilter={studentStatusFilter} onStatusFilter={setStudentStatusFilter} sort={studentSort} onSort={setStudentSort} expandedId={expandedStudentId} onToggle={toggleStudent} progressById={studentProgressView} progressLoadingId={studentProgressLoadingId} onEdit={() => { void openCourseEditor(selectedCourse); }} editing={openingCourseId === selectedCourse} /> : <div className="empty" style={{ marginTop: 18 }}>Selecciona un curso para ver sus alumnos.</div>}</section>}{tab === 'analytics' && <section className="workspace-card"><h2>Analítica de aprendizaje</h2><p className="muted-copy">Estas métricas se calculan con inscripciones y avance real de lecciones. Los ingresos corresponden a pagos aprobados con Mercado Pago.</p><TeacherRevenue>{(revenueOf) => <div className="data-list">{coursesData.map((course) => <div className="data-row" key={course.id}><div><strong>{course.title}</strong><span>{course.enrollmentCount} inscritos · {course.completionCount} finalizaron</span></div><div className="data-row-stats"><span>{revenueOf(course.id)}</span><span>{course.averageProgress}% avance medio</span><span>{course.lessonCount} lecciones</span></div></div>)}</div>}</TeacherRevenue></section>}</div></main>;
}

function SuperAdminWorkspacePage() {
  const { user, api, notify } = useApp(); const [tab, setTab] = useState('overview'); const [overview, setOverview] = useState(null); const [users, setUsers] = useState([]); const [coursesData, setCoursesData] = useState([]); const [enrollments, setEnrollments] = useState([]); const [selectedUser, setSelectedUser] = useState(null); const [temporaryPassword, setTemporaryPassword] = useState(''); const [newUser, setNewUser] = useState({ fullName: '', email: '', password: '', role: 'student' }); const [assignment, setAssignment] = useState({ userId: '', courseId: '' }); const [loading, setLoading] = useState(true); const [renewingId, setRenewingId] = useState(null);
  const allowed = user?.role === 'super_admin';
  const load = async () => { if (!allowed) return; setLoading(true); try { const [summary, people, coursesResult, enrollmentResult] = await Promise.all([api('/api/super/overview'), api('/api/super/users'), api('/api/admin/courses'), api('/api/super/enrollments')]); setOverview(summary.metrics); setUsers(people.users); setCoursesData(coursesResult.courses); setEnrollments(enrollmentResult.enrollments); } catch (error) { notify(error.message); } finally { setLoading(false); } };
  useEffect(() => { if (allowed) void load(); }, [user?.id]);
  if (!user) return <Navigate to="/login" replace />; if (!allowed) return <Navigate to="/mi-aprendizaje" replace />; if (loading) return <PageSkeleton workspace />;
  const openUser = async (id) => { try { const detail = await api(`/api/super/users/${id}`); setSelectedUser(detail); setTemporaryPassword(''); setTab('users'); if (window.matchMedia('(max-width: 860px)').matches) requestAnimationFrame(() => document.getElementById('user-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); } catch (error) { notify(error.message); } };
  const updateUser = async (person, body) => { try { await api(`/api/super/users/${person.id}`, { method: 'PATCH', body }); notify('Cuenta actualizada.'); await load(); if (selectedUser?.user.id === person.id) await openUser(person.id); } catch (error) { notify(error.message); } };
  const createUser = async (event) => { event.preventDefault(); try { await api('/api/super/users', { method: 'POST', body: newUser }); setNewUser({ fullName: '', email: '', password: '', role: 'student' }); notify('Cuenta creada correctamente.'); await load(); } catch (error) { notify(error.message); } };
  const assignOwner = async (courseId, ownerId) => { try { await api(`/api/super/courses/${courseId}/owner`, { method: 'POST', body: { ownerId: Number(ownerId) } }); notify('Responsable del curso actualizado.'); await load(); } catch (error) { notify(error.message); } };
  const resetPassword = async (event) => { event.preventDefault(); if (!selectedUser || !temporaryPassword) return; try { await api(`/api/super/users/${selectedUser.user.id}/reset-password`, { method: 'POST', body: { password: temporaryPassword } }); setTemporaryPassword(''); notify('Contraseña temporal restablecida. Comunícala por un canal seguro.'); } catch (error) { notify(error.message); } };
  const removeEnrollment = async (id) => { try { await api(`/api/super/enrollments/${id}`, { method: 'DELETE' }); notify('Inscripción eliminada.'); await load(); } catch (error) { notify(error.message); } };
  const renewEnrollment = async (enrollment, choice) => { if (!choice || renewingId) return; setRenewingId(enrollment.id); try { const result = await api(`/api/super/enrollments/${enrollment.id}`, { method: 'PATCH', body: choice === 'unlimited' ? { unlimited: true } : { extendDays: Number(choice) } }); const access = result.enrollment; const merge = (item) => (item.id === enrollment.id ? { ...item, expiresAt: access.expiresAt, daysRemaining: access.daysRemaining, isExpired: access.isExpired, isExpiringSoon: access.isExpiringSoon, hasLimit: access.hasLimit } : item); setEnrollments((current) => current.map(merge)); setSelectedUser((current) => (current ? { ...current, enrollments: current.enrollments.map(merge) } : current)); notify(choice === 'unlimited' ? 'Acceso sin límite de tiempo.' : `Acceso renovado: +${choice} días.`); } catch (error) { notify(error.message); } finally { setRenewingId(null); } };
  const assignAccess = async (event) => { event.preventDefault(); if (!assignment.userId || !assignment.courseId) { notify('Selecciona alumno y curso para asignar el acceso.'); return; } try { await api('/api/super/enrollments', { method: 'POST', body: { userId: Number(assignment.userId), courseId: Number(assignment.courseId) } }); setAssignment({ userId: '', courseId: '' }); notify('Acceso asignado manualmente.'); await load(); } catch (error) { notify(error.message); } };
  const metrics = overview ?? { totalUsers: 0, activeUsers: 0, students: 0, admins: 0, totalCourses: 0, publishedCourses: 0, totalEnrollments: 0, completedEnrollments: 0 };
  const staff = users.filter((person) => person.isActive && ['admin', 'super_admin'].includes(person.role));
  const students = users.filter((person) => person.isActive && person.role === 'student');
  const publishedCourses = coursesData.filter((course) => course.status === 'published');
  const assignedCourse = publishedCourses.find((course) => String(course.id) === String(assignment.courseId));
  return <main className="page"><div className="container"><div className="workspace-page-head"><div><span className="eyebrow"><ShieldCheck size={15} /> Administración global</span><h1>Control de la plataforma</h1><p>Usuarios, responsables, acceso y actividad educativa desde un único lugar.</p></div><button className="button button-secondary" onClick={() => void load()}>Actualizar datos</button></div><WorkspaceTabs active={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Resumen' }, { id: 'users', label: 'Usuarios' }, { id: 'courses', label: 'Cursos' }, { id: 'enrollments', label: 'Inscripciones' }, { id: 'payments', label: 'Pagos' }]} />{tab === 'overview' && <><div className="metrics"><div className="metric"><span>Usuarios activos</span><strong>{metrics.activeUsers}</strong></div><div className="metric"><span>Instructores</span><strong>{metrics.admins}</strong></div><div className="metric"><span>Inscripciones</span><strong>{metrics.totalEnrollments}</strong></div></div><section className="workspace-card"><h2>Estado de plataforma</h2><div className="data-list"><div className="data-row"><strong>{metrics.totalUsers} cuentas</strong><span>{metrics.students} alumnos · {metrics.superAdmins || 0} super administradores</span></div><div className="data-row"><strong>{metrics.totalCourses} cursos</strong><span>{metrics.publishedCourses} publicados · {metrics.draftCourses} borradores</span></div><div className="data-row"><strong>{metrics.completedEnrollments} finalizaciones</strong><span>Calculadas desde lecciones completadas.</span></div></div></section></>}{tab === 'users' && <div className="workspace-grid"><section className="workspace-card"><h2>Usuarios totales</h2><details className="quick-create"><summary>+ Crear cuenta</summary><form onSubmit={createUser}><label className="form-field">Nombre<input required value={newUser.fullName} onChange={(event) => setNewUser({ ...newUser, fullName: event.target.value })} /></label><label className="form-field">Correo<input type="email" required value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} /></label><label className="form-field">Contraseña temporal<input type="password" minLength="10" required value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} /></label><label className="form-field">Rol<select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}><option value="student">Alumno</option><option value="admin">Instructor</option><option value="super_admin">Super administrador</option></select></label><button className="button button-primary">Crear cuenta</button></form></details><div className="data-list">{users.map((person) => <button className="data-row clickable" key={person.id} onClick={() => openUser(person.id)}><div><strong>{person.fullName}</strong><span>{person.email} · {person.role} · {person.isActive ? 'Activa' : 'Desactivada'}</span></div><ChevronRight size={18} /></button>)}</div></section><section className="workspace-card" id="user-detail"><h2>{selectedUser ? selectedUser.user.fullName : 'Detalle de usuario'}</h2>{selectedUser ? <><p className="muted-copy">{selectedUser.user.email} · {selectedUser.user.role} · {selectedUser.user.isActive ? 'Cuenta activa' : 'Cuenta desactivada'}</p><div className="detail-section"><h3>Datos educativos</h3><p>{selectedUser.ownedCourses.length} cursos propios · {selectedUser.enrollments.length} inscripciones</p>{selectedUser.ownedCourses.length > 0 && <div className="data-list">{selectedUser.ownedCourses.map((course) => <div className="data-row" key={course.id}><div><strong>{course.title}</strong><span>{course.status} · {course.enrollmentCount} inscritos</span></div></div>)}</div>}{selectedUser.enrollments.length > 0 && <div className="enrollment-list">{selectedUser.enrollments.map((enrollment) => <EnrollmentProgressRow key={enrollment.id} enrollment={enrollment} />)}</div>}</div><div className="detail-section"><h3>Acciones de cuenta</h3><select className="select" value={selectedUser.user.role} disabled={selectedUser.user.id === user.id} onChange={(event) => updateUser(selectedUser.user, { role: event.target.value })}><option value="student">Alumno</option><option value="admin">Instructor</option><option value="super_admin">Super administrador</option></select><button className="button button-secondary" disabled={selectedUser.user.id === user.id} onClick={() => updateUser(selectedUser.user, { isActive: !selectedUser.user.isActive })}>{selectedUser.user.isActive ? 'Desactivar cuenta' : 'Activar cuenta'}</button>{selectedUser.user.id !== user.id && <form className="inline-form" onSubmit={resetPassword}><input type="password" minLength="10" required value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} placeholder="Contraseña temporal nueva" /><button className="button button-primary">Restablecer contraseña</button></form>}</div></> : <div className="empty">Selecciona una persona para ver su actividad, cursos e inscripciones.</div>}</section></div>}{tab === 'courses' && <section className="workspace-card"><h2>Cursos y responsables</h2><div className="data-list">{coursesData.map((course) => <div className="data-row" key={course.id}><div><strong>{course.title}</strong><span>{course.status} · Responsable: {course.ownerName} · {course.lessonCount} lecciones · {accessLabel(course.accessDays)}</span></div><select className="select" value={course.ownerId} onChange={(event) => assignOwner(course.id, event.target.value)}>{staff.map((person) => <option key={person.id} value={person.id}>{person.fullName} · {person.role === 'admin' ? 'Instructor' : 'Super administrador'}</option>)}</select></div>)}</div></section>}{tab === 'payments' && <AdminPaymentsPanel />}{tab === 'enrollments' && <section className="workspace-card"><h2>Inscripciones y asignación manual</h2><p className="muted-copy">Cuando confirmes una transferencia, asigna acceso al curso sin procesar pago online.</p><form className="manual-access-form" onSubmit={assignAccess}><label className="form-field">Alumno<select required value={assignment.userId} onChange={(event) => setAssignment({ ...assignment, userId: event.target.value })}><option value="">Selecciona un alumno</option>{students.map((student) => <option key={student.id} value={student.id}>{student.fullName} · {student.email}</option>)}</select></label><label className="form-field">Curso publicado<select required value={assignment.courseId} onChange={(event) => setAssignment({ ...assignment, courseId: event.target.value })}><option value="">Selecciona un curso</option>{publishedCourses.map((course) => <option key={course.id} value={course.id}>{course.title} · {course.ownerName}</option>)}</select></label><button className="button button-primary"><Check size={16} /> Asignar acceso</button><p className="assign-policy-note">{assignedCourse && <strong className="policy-chip">{accessLabel(assignedCourse.accessDays)}</strong>}Si el alumno ya tiene acceso con vencimiento, se renueva sin acortarlo.</p></form><p className="muted-copy renew-help">Sobre una inscripción indefinida, +N días establece un límite de N días desde hoy.</p><div className="enrollment-list">{enrollments.length ? enrollments.map((enrollment) => { const expiry = expiryCopy(enrollment); const renewing = renewingId === enrollment.id; return <div className="enrollment-row enrollment-admin-row" key={enrollment.id}><div className="enrollment-row-main"><strong>{enrollment.student.fullName} → {enrollment.course.title}</strong><span className="enrollment-row-meta">{enrollment.student.email} · Instructor: {enrollment.course.ownerName} · Inscrito el {formatShortDate(enrollment.enrolledAt)}</span><span className="enrollment-row-status"><StatusBadge status={enrollment.isExpired ? 'expired' : enrollment.isExpiringSoon ? 'expiring' : 'current'} /><span className={`expiry-copy expiry-${expiry.tone}`}>{enrollment.hasLimit ? `Vence el ${formatShortDate(enrollment.expiresAt)} · ${expiry.text}` : expiry.text}</span></span></div><div className="enrollment-row-actions"><label className="renew-select">{renewing && <LoaderCircle className="button-spinner" size={16} aria-hidden="true" />}<select aria-label="Renovar acceso" value="" disabled={Boolean(renewingId)} onChange={(event) => { void renewEnrollment(enrollment, event.target.value); }}><option value="">Renovar acceso…</option><option value="30">+30 días</option><option value="45">+45 días</option><option value="90">+90 días</option><option value="180">+180 días</option><option value="unlimited">Sin límite</option></select></label><button className="button button-secondary" disabled={renewing} onClick={() => removeEnrollment(enrollment.id)}>Retirar acceso</button></div></div>; }) : <div className="empty">No hay inscripciones todavía.</div>}</div></section>}</div></main>;
}

function AccountDashboardPage() {
  const { user, api, notify } = useApp(); const [account, setAccount] = useState(null); const [name, setName] = useState(''); const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const load = async () => { if (!user) return; try { const data = await api('/api/account/overview'); setAccount(data); setName(data.user.fullName); } catch (error) { notify(error.message); } };
  useEffect(() => { void load(); }, [user?.id]);
  if (!user) return <Navigate to="/login" replace />;
  const saveProfile = async (event) => { event.preventDefault(); try { await api('/api/account/profile', { method: 'PATCH', body: { fullName: name } }); notify('Perfil actualizado.'); await load(); } catch (error) { notify(error.message); } };
  const changePassword = async (event) => { event.preventDefault(); try { await api('/api/account/change-password', { method: 'POST', body: passwords }); setPasswords({ currentPassword: '', newPassword: '' }); notify('Contraseña actualizada.'); } catch (error) { notify(error.message); } };
  const metrics = account?.metrics ?? { enrolledCourses: 0, completedCourses: 0, averageProgress: 0 };
  return <main className="page"><div className="container"><div className="dashboard-head"><div><span className="eyebrow"><Sparkles size={15} /> Área de usuario</span><h1>Hola, {user.fullName} 👋</h1><p>Tu aprendizaje y tu cuenta, en un solo lugar.</p></div></div><div className="metrics"><div className="metric"><span>Cursos inscritos</span><strong>{metrics.enrolledCourses}</strong></div><div className="metric"><span>Cursos finalizados</span><strong>{metrics.completedCourses}</strong></div><div className="metric"><span>Avance promedio</span><strong>{metrics.averageProgress}%</strong></div></div><div className="workspace-grid"><section className="workspace-card"><h2>Mi aprendizaje</h2>{account?.enrollments?.length ? <div className="data-list">{account.enrollments.map((enrollment) => <div className="data-row" key={enrollment.enrollmentId}><div><strong>{enrollment.course.title}</strong><span>Por {enrollment.course.instructorName || enrollment.course.ownerName} · {enrollment.completedLessons}/{enrollment.lessonCount} lecciones</span></div><span>{enrollment.progressPercent}%</span></div>)}</div> : <div className="empty">Aún no tienes cursos inscritos.</div>}</section><section className="workspace-card"><h2>Mi cuenta</h2><form onSubmit={saveProfile}><label className="form-field">Nombre<input value={name} onChange={(event) => setName(event.target.value)} /></label><button className="button button-secondary">Guardar perfil</button></form><form onSubmit={changePassword} style={{ marginTop: 22 }}><label className="form-field">Contraseña actual<input type="password" required value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /></label><label className="form-field">Nueva contraseña<input type="password" minLength="10" required value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /></label><button className="button button-primary">Cambiar contraseña</button></form></section></div></div></main>;
}

const LEARNING_TABS = [['all', 'Todos'], ['progress', 'En curso'], ['completed', 'Completados'], ['expiring', 'Por vencer'], ['expired', 'Expirados']];
const LEARNING_SORTS = [['recent', 'Actividad reciente'], ['progress', 'Mayor avance'], ['expiry', 'Vence pronto']];
const LEARNING_TAB_FILTERS = {
  all: () => true,
  progress: (item) => !item.isExpired && !isCourseComplete(item),
  completed: (item) => !item.isExpired && isCourseComplete(item),
  expiring: (item) => !item.isExpired && item.isExpiringSoon,
  expired: (item) => item.isExpired,
};
const timeOf = (iso) => { const time = iso ? new Date(iso).getTime() : NaN; return Number.isNaN(time) ? 0 : time; };
const expiryRank = (item) => (item.isExpired ? 2 : item.hasLimit ? 0 : 1);
const LEARNING_SORT_FNS = {
  recent: (a, b) => timeOf(b.lastActivityAt) - timeOf(a.lastActivityAt) || timeOf(b.enrolledAt) - timeOf(a.enrolledAt),
  progress: (a, b) => b.progressPercent - a.progressPercent || timeOf(b.lastActivityAt) - timeOf(a.lastActivityAt),
  expiry: (a, b) => expiryRank(a) - expiryRank(b) || timeOf(a.expiresAt) - timeOf(b.expiresAt),
};

function LearningSkeleton() {
  return <main className="learning-library-page" aria-busy="true"><span className="sr-only" role="status">Cargando tu aprendizaje…</span><div className="skeleton learning-skeleton-hero" /><div className="container learning-library-content"><div className="learning-stats">{Array.from({ length: 4 }, (_, index) => <div className="skeleton learning-skeleton-stat" key={index} />)}</div><div className="skeleton learning-skeleton-featured" /><div className="skeleton learning-skeleton-toolbar" /><div className="library-grid">{Array.from({ length: 3 }, (_, index) => <div className="skeleton learning-skeleton-card" key={index} />)}</div></div></main>;
}

function LearningDashboardPage() {
  const { user, api, notify } = useApp();
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [renewingId, setRenewingId] = useState(null);

  const load = async ({ silent = false } = {}) => {
    if (!user) return;
    if (!silent) { setLoading(true); setLoadError(''); }
    try { setAccount(await api('/api/account/overview')); }
    catch (error) { if (!silent) setLoadError(error.message || 'No se pudo cargar tu aprendizaje.'); notify(error.message); }
    finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { void load(); }, [user?.id]);

  const items = useMemo(() => (account?.enrollments ?? []).map((item) => ({ ...item, status: learnerStatus(item) })), [account]);
  const counts = useMemo(() => Object.fromEntries(LEARNING_TABS.map(([key]) => [key, items.filter(LEARNING_TAB_FILTERS[key]).length])), [items]);
  const featured = useMemo(() => {
    const candidates = items.filter((item) => !item.isExpired && item.progressPercent < 100 && !isCourseComplete(item));
    const withActivity = candidates.filter((item) => item.lastActivityAt).sort(LEARNING_SORT_FNS.recent);
    return withActivity[0] ?? candidates.find((item) => item.status === 'not_started') ?? null;
  }, [items]);
  const visibleTabs = LEARNING_TABS.filter(([key]) => (key !== 'expiring' && key !== 'expired') || counts[key] > 0);
  const activeTab = visibleTabs.some(([key]) => key === tab) ? tab : 'all';
  const list = useMemo(() => {
    const needle = normalizeText(query);
    return items.filter(LEARNING_TAB_FILTERS[activeTab]).filter((item) => !needle || normalizeText(item.course.title).includes(needle)).sort(LEARNING_SORT_FNS[sort]);
  }, [items, activeTab, query, sort]);

  if (!user) return <Navigate to="/login" replace />;
  if (loading) return <LearningSkeleton />;
  if (loadError) return <main className="page"><div className="container empty">{loadError}<button className="button button-secondary" onClick={() => void load()}>Reintentar</button></div></main>;

  const averageProgress = account?.metrics?.averageProgress ?? (items.length ? Math.round(items.reduce((total, item) => total + item.progressPercent, 0) / items.length) : 0);
  const openCourse = (courseId) => navigate(`/aprender/${courseId}`);
  const tabLabel = (LEARNING_TABS.find(([key]) => key === activeTab) ?? LEARNING_TABS[0])[1];
  const hasProgress = (item) => item.completedLessons > 0 || item.progressPercent > 0;
  const actionLabel = (item) => (isCourseComplete(item) ? 'Repasar' : hasProgress(item) ? 'Continuar' : 'Comenzar');

  const renewAccess = async (item) => {
    if (item.course.priceCents > 0) { navigate(`/pago/${item.course.slug}`); return; }
    setRenewingId(item.enrollmentId);
    try {
      await api(`/api/courses/${item.course.id}/enroll`, { method: 'POST' });
      notify('Acceso renovado. Ya puedes seguir aprendiendo.');
      await load({ silent: true });
    } catch (error) { notify(error.message || 'No se pudo renovar el acceso.'); }
    finally { setRenewingId(null); }
  };

  const onTabKeyDown = (event) => {
    const keys = visibleTabs.map(([key]) => key);
    const index = keys.indexOf(activeTab);
    let next = null;
    if (event.key === 'ArrowRight') next = keys[(index + 1) % keys.length];
    else if (event.key === 'ArrowLeft') next = keys[(index - 1 + keys.length) % keys.length];
    else if (event.key === 'Home') next = keys[0];
    else if (event.key === 'End') next = keys[keys.length - 1];
    if (!next) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(`learning-tab-${next}`)?.focus();
  };

  const renderCard = (item) => {
    const { course } = item;
    const expired = item.isExpired;
    const renewing = renewingId === item.enrollmentId;
    const cover = <img src={courseImage(course)} alt="" loading="lazy" />;
    return <article className={`library-card${expired ? ' is-expired' : ''}`} key={item.enrollmentId}>
      <div className="library-card-cover">
        {expired ? <div className="library-card-media">{cover}</div> : <button type="button" className="library-card-media" tabIndex={-1} aria-hidden="true" onClick={() => openCourse(course.id)}>{cover}</button>}
        <span className="library-card-status"><StatusBadge status={item.status} /></span>
        {expired ? <span className="library-card-lock" aria-hidden="true"><Lock size={22} /></span> : <span className="library-card-play" aria-hidden="true">{isCourseComplete(item) ? <CheckCircle2 size={16} /> : <Play size={15} fill="currentColor" />}</span>}
      </div>
      <div className="library-card-body">
        <span className="course-instructor">{course.instructorName || course.ownerName}</span>
        <h3>{course.title}</h3>
        <div className="library-card-progress"><strong className="library-percent">{item.progressPercent}<small>%</small></strong><span>{item.completedLessons} de {item.lessonCount} clases</span></div>
        <div className="library-bar" role="progressbar" aria-valuenow={item.progressPercent} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso de ${course.title}`}><i style={{ width: `${item.progressPercent}%` }} /></div>
        <div className="library-card-foot"><AccessChip item={item} /></div>
        {expired && <p className="library-expired-note">Tu acceso venció. Renueva para seguir aprendiendo. Tu progreso se conserva.</p>}
        {expired
          ? <button type="button" className="button button-primary library-card-action" disabled={renewing} aria-label={`Renovar acceso a ${course.title}`} onClick={() => void renewAccess(item)}>{renewing ? <><LoaderCircle className="button-spinner" size={17} /> Renovando…</> : <><RefreshCw size={16} aria-hidden="true" /> Renovar acceso</>}</button>
          : <button type="button" className="button button-secondary library-card-action" aria-label={`${actionLabel(item)} ${course.title}`} onClick={() => openCourse(course.id)}>{actionLabel(item)} <ArrowRight size={16} aria-hidden="true" /></button>}
      </div>
    </article>;
  };

  return <main className="learning-library-page">
    <section className="learning-hero"><div className="container learning-hero-inner"><div><span className="learning-library-kicker"><BookOpen size={15} aria-hidden="true" /> Mi aprendizaje</span><h1>Hola, {firstName(user.fullName)} <span aria-hidden="true">👋</span></h1><p>Retoma una clase, revisa tu avance y mantén el ritmo.</p></div><Link className="button learning-explore-button" to="/explorar"><Search size={17} aria-hidden="true" /> Explorar cursos</Link></div></section>
    <div className="container learning-library-content">
      <div className="learning-stats">
        <div className="learning-stat"><span className="learning-stat-icon tone-primary"><BookOpen size={22} aria-hidden="true" /></span><div className="learning-stat-text"><strong>{items.length}</strong><span>Cursos</span></div></div>
        <div className="learning-stat"><ProgressRing value={averageProgress} size={56} stroke={6} label={`Avance promedio: ${averageProgress} %`} /><div className="learning-stat-text"><strong className="sr-only">{averageProgress}%</strong><span>Avance promedio</span></div></div>
        <div className="learning-stat"><span className="learning-stat-icon tone-ok"><Award size={22} aria-hidden="true" /></span><div className="learning-stat-text"><strong>{items.filter((item) => isCourseComplete(item)).length}</strong><span>Finalizados</span></div></div>
        <div className={`learning-stat${counts.expiring > 0 ? ' is-warn' : ''}`}><span className="learning-stat-icon tone-warn"><Clock3 size={22} aria-hidden="true" /></span><div className="learning-stat-text"><strong>{counts.expiring}</strong><span>Por vencer{counts.expired > 0 ? ` · ${counts.expired} ${counts.expired === 1 ? 'expirado' : 'expirados'}` : ''}</span></div></div>
      </div>
      {featured && <section className="continue-card" aria-labelledby="continue-title">
        <div className="continue-card-cover"><img src={courseImage(featured.course)} alt="" /><span className="continue-card-pill"><Play size={13} fill="currentColor" aria-hidden="true" /> Tu siguiente paso</span></div>
        <div className="continue-card-body">
          <span className="learning-section-kicker">Continúa donde lo dejaste</span>
          <div className="continue-card-title"><StatusBadge status={featured.status} /><h2 id="continue-title">{featured.course.title}</h2><span className="course-instructor">Curso de {featured.course.instructorName || featured.course.ownerName}</span></div>
          <div className="continue-card-progress">
            <ProgressRing value={featured.progressPercent} size={120} stroke={10} label={`${featured.progressPercent} % completado`} />
            <ul className="continue-card-facts">
              <li><CheckCircle2 size={15} aria-hidden="true" /> {featured.completedLessons} de {featured.lessonCount} clases completadas</li>
              {featured.lastActivityAt && <li><Clock3 size={15} aria-hidden="true" /> Última actividad {relativeTime(featured.lastActivityAt)}</li>}
              {featured.nextLesson && <li className="continue-card-next"><CirclePlay size={15} aria-hidden="true" /> <span>Siguiente: {featured.nextLesson.kind === 'quiz' ? `Evaluación · ${featured.nextLesson.title}` : hasClassPrefix(featured.nextLesson.title) ? featured.nextLesson.title : `Clase ${featured.nextLesson.lessonNumber} · ${featured.nextLesson.title}`}</span></li>}
              {featured.documentCount > 0 && <li><Link className="continue-card-docs" to={`/aprender/${featured.course.id}#documentos`}><FileText size={15} aria-hidden="true" /> Documentos del curso ({featured.documentCount})</Link></li>}
              <li><AccessChip item={featured} /></li>
            </ul>
          </div>
          {featured.course.hasCertificate && <CertificateBlock courseId={featured.course.id} completedLessons={featured.completedLessons} totalLessons={featured.lessonCount} hasCertificate variant="card" />}
          <button type="button" className="button button-primary continue-card-action" onClick={() => openCourse(featured.course.id)}>{hasProgress(featured) ? 'Continuar curso' : 'Comenzar curso'} <ArrowRight size={17} aria-hidden="true" /></button>
        </div>
      </section>}
      <section className="learning-library" aria-labelledby="library-title">
        <div className="learning-section-heading"><div><span>Tu biblioteca</span><h2 id="library-title">Todos mis cursos</h2></div></div>
        {items.length > 0 && <div className="learning-toolbar">
          <div className="learning-tabs" role="tablist" aria-label="Filtrar cursos por estado" onKeyDown={onTabKeyDown}>
            {visibleTabs.map(([key, label]) => <button type="button" role="tab" id={`learning-tab-${key}`} aria-selected={activeTab === key} aria-controls="learning-panel" tabIndex={activeTab === key ? 0 : -1} className={activeTab === key ? 'active' : ''} key={key} onClick={() => setTab(key)}>{label}<span className="learning-tab-count">{counts[key]}</span></button>)}
          </div>
          <div className="learning-tools">
            {items.length >= 4 && <label className="learning-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Buscar en mis cursos</span><input type="search" value={query} placeholder="Buscar curso…" onChange={(event) => setQuery(event.target.value)} /></label>}
            <label className="learning-sort"><ArrowUpDown size={15} aria-hidden="true" /><span className="sr-only">Ordenar por</span><select value={sort} onChange={(event) => setSort(event.target.value)}>{LEARNING_SORTS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
          </div>
        </div>}
        {items.length > 0 && <p className="learning-count" role="status" aria-live="polite">{list.length} {list.length === 1 ? 'curso' : 'cursos'}</p>}
        <div role="tabpanel" id="learning-panel" aria-labelledby={`learning-tab-${activeTab}`}>
          {list.length ? <div className="library-grid">{list.map(renderCard)}</div>
            : items.length === 0 ? <div className="learning-empty"><BookOpen size={34} aria-hidden="true" /><h3>Tu biblioteca está esperando</h3><p>Inscríbete en un curso para empezar a aprender.</p><Link className="button button-primary" to="/explorar">Explorar catálogo</Link></div>
            : query.trim() ? <div className="learning-empty"><Search size={30} aria-hidden="true" /><h3>No encontramos cursos con «{query.trim()}».</h3><p>Revisa la ortografía o prueba con otra palabra.</p><button type="button" className="button button-secondary" onClick={() => setQuery('')}>Limpiar búsqueda</button></div>
            : <div className="learning-empty"><BookOpen size={30} aria-hidden="true" /><h3>No hay cursos en «{tabLabel}».</h3><p>Cuando algún curso entre en este estado, lo verás aquí.</p><button type="button" className="button button-secondary" onClick={() => setTab('all')}>Ver todos</button></div>}
        </div>
      </section>
    </div>
  </main>;
}

function ProfilePage() {
  const { user, api, notify } = useApp(); const [name, setName] = useState(user?.fullName ?? ''); const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  if (!user) return <Navigate to="/login" replace />;
  const saveProfile = async (event) => { event.preventDefault(); try { await api('/api/account/profile', { method: 'PATCH', body: { fullName: name } }); notify('Perfil actualizado.'); } catch (error) { notify(error.message); } };
  const changePassword = async (event) => { event.preventDefault(); try { await api('/api/account/change-password', { method: 'POST', body: passwords }); setPasswords({ currentPassword: '', newPassword: '' }); notify('Contraseña actualizada.'); } catch (error) { notify(error.message); } };
  return <main className="page"><div className="container profile-page"><div className="dashboard-head"><div><span className="eyebrow"><Sparkles size={15} /> Mi perfil</span><h1>Tu cuenta</h1><p>Actualiza tus datos y protege tu acceso.</p></div><Link className="button button-secondary" to="/mi-aprendizaje"><ArrowLeft size={17} /> Mi aprendizaje</Link></div><div className="workspace-grid"><form className="workspace-card" onSubmit={saveProfile}><h2>Información personal</h2><label className="form-field">Nombre<input value={name} onChange={(event) => setName(event.target.value)} /></label><label className="form-field">Correo<input value={user.email} disabled /></label><label className="form-field">Rol<input value={user.role === 'student' ? 'Estudiante' : user.role === 'admin' ? 'Instructor' : 'Super administrador'} disabled /></label><button className="button button-secondary">Guardar cambios</button></form><form className="workspace-card" onSubmit={changePassword}><h2>Seguridad</h2><label className="form-field">Contraseña actual<input type="password" required value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /></label><label className="form-field">Nueva contraseña<input type="password" minLength="10" required value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /></label><button className="button button-primary">Cambiar contraseña</button></form></div></div></main>;
}

function RealLearningPlayerPage() {
  const { id } = useParams();
  const location = useLocation();
  const { user, api, notify } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [lessonIndex, setLessonIndex] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [changingLesson, setChangingLesson] = useState(false);
  const [resourceOpeningId, setResourceOpeningId] = useState(null);
  const videoRef = useRef(null);
  const completingRef = useRef(false);
  const progressQueueRef = useRef(Promise.resolve());
  const lastQueuedPositionRef = useRef(new Map());
  const lesson = data?.lessons?.[lessonIndex] ?? null;

  const load = async () => {
    if (!user) return;
    try {
      const result = await api(`/api/courses/${id}/learn`);
      setData(result);
      setLessonIndex(firstOpenIndex(result.lessons));
    } catch (error) {
      notify(error.message);
      navigate('/mi-aprendizaje');
    }
  };

  // Recarga /learn sin mover al alumno de la posición actual (tras enviar una evaluación).
  const refreshLearn = async () => {
    const result = await api(`/api/courses/${id}/learn`);
    setData(result);
  };

  useEffect(() => { void load(); }, [user?.id, id]);

  const currentPositionSeconds = (media = videoRef.current, fallback = lesson?.lastPositionSeconds) => {
    const currentTime = Number(media?.currentTime);
    if (Number.isFinite(currentTime) && currentTime >= 0) return Math.floor(currentTime);
    const savedPosition = Number(fallback);
    return Number.isSafeInteger(savedPosition) && savedPosition >= 0 ? savedPosition : 0;
  };

  const queueProgress = (lessonId, completed, lastPositionSeconds) => {
    const request = progressQueueRef.current.then(() => api(`/api/courses/lessons/${lessonId}/progress`, {
      method: 'PUT',
      body: { completed, lastPositionSeconds },
    }));
    progressQueueRef.current = request.catch(() => undefined);
    return request;
  };

  const persistProgress = async ({ media = videoRef.current, showError = false } = {}) => {
    if (!lesson || lesson.completedAt || completingRef.current || lesson.kind === 'quiz' || lesson.locked) return;
    const lastPositionSeconds = currentPositionSeconds(media, lesson.lastPositionSeconds);
    if (!Number.isSafeInteger(lastPositionSeconds) || lastPositionSeconds < 0) return;
    if (lastQueuedPositionRef.current.get(lesson.id) === lastPositionSeconds) return;

    lastQueuedPositionRef.current.set(lesson.id, lastPositionSeconds);
    try {
      await queueProgress(lesson.id, false, lastPositionSeconds);
      setData((current) => current ? {
        ...current,
        lessons: current.lessons.map((item) => item.id === lesson.id ? { ...item, lastPositionSeconds } : item),
      } : current);
    } catch (error) {
      if (lastQueuedPositionRef.current.get(lesson.id) === lastPositionSeconds) lastQueuedPositionRef.current.delete(lesson.id);
      if (showError) notify(error.message || 'No se pudo guardar el progreso de la lección.');
    }
  };

  useEffect(() => {
    if (!lesson?.videoUrl || lesson.completedAt) return undefined;
    const interval = window.setInterval(() => { void persistProgress(); }, 10_000);
    return () => window.clearInterval(interval);
  }, [lesson?.id, lesson?.videoUrl, lesson?.completedAt]);

  const restoreSavedPosition = (event) => {
    const media = event.currentTarget;
    const savedPosition = Number(lesson?.lastPositionSeconds);
    const duration = Number(media.duration);
    if (!Number.isSafeInteger(savedPosition) || savedPosition < 0 || Number.isNaN(duration) || duration < 0 || savedPosition > duration) return;
    try {
      media.currentTime = savedPosition;
    } catch {
      // El navegador puede rechazar la búsqueda para algunos formatos de video.
    }
  };

  const changeLesson = async (nextIndex) => {
    if (!lesson || nextIndex === lessonIndex || changingLesson || completing) return;
    setChangingLesson(true);
    try {
      await persistProgress({ showError: true });
      setLessonIndex(nextIndex);
    } finally {
      setChangingLesson(false);
    }
  };

  const completeLesson = async () => {
    if (!lesson || completing || changingLesson) return;
    completingRef.current = true;
    setCompleting(true);
    const lastPositionSeconds = currentPositionSeconds();

    try {
      await queueProgress(lesson.id, true, lastPositionSeconds);
      lastQueuedPositionRef.current.set(lesson.id, lastPositionSeconds);
      setData((current) => current ? {
        ...current,
        lessons: current.lessons.map((item) => item.id === lesson.id ? {
          ...item,
          completedAt: new Date().toISOString(),
          lastPositionSeconds,
        } : item),
      } : current);
      if (lessonIndex < data.lessons.length - 1) setLessonIndex(lessonIndex + 1);
      notify('Lección completada.');
    } catch (error) {
      notify(error.message || 'No se pudo completar la lección.');
    } finally {
      completingRef.current = false;
      setCompleting(false);
    }
  };

  const openLearningMaterial = async (material, scope) => {
    setResourceOpeningId(`${scope}-${material.id}`);
    const endpoint = scope === 'lesson'
      ? `/api/courses/${id}/lessons/${lesson.id}/materials/${material.id}/access`
      : `/api/courses/${id}/materials/${material.id}/access`;
    try { await openMaterialAccess({ material, endpoint, api, notify }); }
    finally { setResourceOpeningId(null); }
  };

  if (!user) return <Navigate to="/login" replace />;
  if (!data) return <PageSkeleton workspace />;
  if (!lesson) return <main className="page"><div className="container"><div className="empty">Este curso aún no tiene lecciones disponibles.</div></div></main>;

  const progress = learnProgress(data.lessons);
  const completed = progress.completed;
  const total = progress.total;
  const progressPercent = progress.percent;
  const videoTotal = data.lessons.filter((item) => !isQuiz(item)).length;
  const unitLabel = data.lessons.some((item) => isQuiz(item) && item.counts) ? 'actividades' : 'clases';
  const specialItem = isQuiz(lesson) || lesson.locked;
  const sectionGroups = data.lessons.reduce((groups, item) => {
    const key = item.sectionId ?? `unsectioned-${item.sectionTitle}`;
    const existing = groups.find((group) => group.key === key);
    if (existing) existing.lessons.push(item);
    else groups.push({ key, title: item.sectionTitle || 'Contenido principal', lessons: [item] });
    return groups;
  }, []);
  const lessonNumber = lesson.lessonNumber ?? (data.lessons.findIndex((item) => item.id === lesson.id) + 1);

  return <main className="learning-shell">
    <header className="learning-header">
      <Link className="learning-brand" to="/mi-aprendizaje"><span className="brand-mark"><Play size={15} fill="currentColor" /></span><span>Streamly <span className="brand-sub">Academia</span></span></Link>
      <div className="learning-course-title"><span>Estás aprendiendo</span><strong>{data.course.title}</strong></div>
      <div className="learning-progress-summary"><span>{completed} de {total} {unitLabel}</span><strong>{progressPercent}%</strong><div><i style={{ width: `${progressPercent}%` }} /></div></div>
    </header>
    {data.access?.isExpiringSoon && <div className="access-strip" role="status"><Clock3 size={15} aria-hidden="true" /> Tu acceso vence en {data.access.daysRemaining} {data.access.daysRemaining === 1 ? 'día' : 'días'}</div>}
    <div className="learning-layout">
      <section className="learning-main">
        <div className="learning-breadcrumb"><Link to="/mi-aprendizaje"><ArrowLeft size={16} /> Mi aprendizaje</Link><span>{isQuiz(lesson) ? 'Evaluación' : `Clase ${lessonNumber} de ${videoTotal}`}</span></div>
        {specialItem && (isQuiz(lesson) && !lesson.locked
          ? <QuizPlayer key={lesson.id} courseId={id} quizId={lesson.id} item={lesson} api={api} notify={notify} onResult={refreshLearn} onContinue={() => { void changeLesson(lessonIndex + 1); }} canContinue={lessonIndex < data.lessons.length - 1} />
          : <LockedItemPanel item={lesson} onGoToQuiz={(quizId) => { const target = data.lessons.findIndex((candidate) => candidate.id === quizId); if (target >= 0) void changeLesson(target); }} />)}
        {!specialItem && <><div className="learning-video-frame">{lesson.videoUrl ? <video key={lesson.id} ref={videoRef} className="real-video" controls controlsList="nodownload noremoteplayback" disablePictureInPicture onContextMenu={(event) => event.preventDefault()} onLoadedMetadata={restoreSavedPosition} onPause={(event) => { void persistProgress({ media: event.currentTarget }); }} onEnded={() => { void completeLesson(); }} poster={data.course?.thumbnailUrl || undefined} src={lesson.videoUrl}>Tu navegador no admite la reproducción de video.</video> : <div className="video-placeholder"><Video size={44} /><span>Esta clase aún no tiene video disponible.</span></div>}</div>
        <article className="learning-lesson-info">
          <div><span className="learning-section-name">{lesson.sectionTitle || 'Contenido principal'}</span><h1><LessonNumber lesson={lesson} className="lesson-pill-title" />{lesson.title}</h1><p>{lesson.description || 'Continúa con esta clase y marca tu avance al terminar.'}</p></div>
          <button className={`button ${lesson.completedAt ? 'button-secondary' : 'button-primary'}`} disabled={completing || changingLesson || Boolean(lesson.completedAt)} onClick={completeLesson}><CheckCircle2 size={17} /> {lesson.completedAt ? 'Clase completada' : completing ? 'Guardando…' : 'Marcar como completada'}</button>
        </article>
        {lesson.materials?.length > 0 && <section className="learning-resources" aria-labelledby="lesson-resources-title"><div className="learning-resources-head"><span><FileText size={18} /></span><div><h2 id="lesson-resources-title">Recursos de esta clase</h2><p>Material complementario específico para esta lección.</p></div></div><div className="learning-resources-list">{lesson.materials.map((material) => <button type="button" className="learning-resource" key={material.id} onClick={() => void openLearningMaterial(material, 'lesson')} disabled={resourceOpeningId !== null}><span className="learning-resource-icon">{material.type === 'link' ? <Link2 size={20} /> : <FileText size={20} />}</span><span className="learning-resource-copy"><strong>{material.title}</strong>{material.description && <span>{material.description}</span>}<small>{material.type === 'file' ? [materialTypeLabel(material), formatMaterialSize(material.sizeBytes)].filter(Boolean).join(' · ') : 'Enlace externo'}</small></span>{resourceOpeningId === `lesson-${material.id}` ? <LoaderCircle className="button-spinner learning-resource-open" size={18} /> : <ExternalLink className="learning-resource-open" size={18} />}</button>)}</div></section>}</>}<LearnerDocuments courseId={id} materials={data.materials} api={api} notify={notify} />{data.course?.hasCertificate && <CertificateBlock courseId={id} completedLessons={completed} totalLessons={total} hasCertificate variant="player" />}
      </section>
      <aside className="learning-syllabus">
        <div className="syllabus-header"><span>Programa del curso</span><h2>{data.course.title}</h2><div className="syllabus-progress"><i style={{ width: `${progressPercent}%` }} /></div><small>{progressPercent}% completado</small></div>
        <div className="syllabus-scroll">{sectionGroups.map((section, sectionIndex) => <section className="syllabus-section" key={section.key}><div className="syllabus-section-title"><span>Sección {sectionIndex + 1}</span><strong>{section.title}</strong></div>{section.lessons.map((item) => { const index = data.lessons.findIndex((candidate) => candidate.id === item.id); const active = item.id === lesson.id; return <button className={`syllabus-lesson ${active ? 'active' : ''} ${item.completedAt ? 'done' : ''}`} key={item.id} disabled={completing || changingLesson} onClick={() => { void changeLesson(index); }}><span className="syllabus-lesson-index" aria-hidden={item.completedAt ? undefined : true}>{item.completedAt ? <><Check size={14} aria-hidden="true" /><span className="sr-only">Completada</span></> : null}</span><span className="syllabus-lesson-copy">{isQuiz(item) ? <span className="qz-pill"><ClipboardCheck size={12} aria-hidden="true" /> EVALUACIÓN</span> : <LessonNumber lesson={item} className="lesson-pill-compact" />}<strong>{item.title}</strong>{isQuiz(item) ? <span className="qz-row-meta"><span className={`qz-badge ${item.quiz?.isRequired ? 'qz-badge-required' : 'qz-badge-optional'}`}>{requirementText(item.quiz?.isRequired)}</span>{item.locked ? <span className="qz-locked-mark"><Lock size={13} aria-hidden="true" /><span aria-hidden="true">Bloqueada</span><span className="sr-only">Bloqueada: aprueba «{item.lockedBy?.title}»</span></span> : item.quiz?.passed ? <span className="qz-state qz-state-ok"><Check size={13} aria-hidden="true" /> Aprobada</span> : item.quiz?.attemptsUsed > 0 ? <span className="qz-state qz-state-warn">Intentada</span> : <span className="qz-state qz-state-muted">Pendiente</span>}</span> : item.locked ? <small className="qz-locked-mark"><Lock size={13} aria-hidden="true" /> <span aria-hidden="true">Bloqueada</span><span className="sr-only">Bloqueada: aprueba «{item.lockedBy?.title}»</span></small> : <small><CirclePlay size={13} /> {item.durationSeconds ? `${Math.ceil(item.durationSeconds / 60)} min` : 'Video'}</small>}</span>{active && <span className="syllabus-now">Ahora</span>}</button>; })}</section>)}</div>
      </aside>
    </div>
  </main>;
}

function TeachEntryPage() {
  const { user } = useApp();
  if (user && ['admin', 'super_admin'].includes(user.role)) return <Navigate to="/docencia" replace />;
  return <main className="page"><div className="container"><div className="feature-band"><div><h2>Comparte lo que sabes.</h2><p>Las personas con rol Instructor pueden crear cursos, organizar lecciones y publicar contenido desde su Área docente.</p></div>{user ? <Link className="button" to="/mi-aprendizaje">Volver a mi aprendizaje</Link> : <Link className="button" to="/login">Iniciar sesión</Link>}</div></div></main>;
}

function Footer() { return <footer className="footer"><div className="container footer-inner"><span className="footer-tagline"><strong>Streamly Academia</strong> · Cursos de IA, derecho y tecnología aplicada.</span><span className="footer-credit"><Sparkles size={13} aria-hidden="true" />Streamly Academia by <strong>Gerald G</strong></span></div></footer>; }

const levelLabels = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' };
const courseImage = (course) => course.thumbnailUrl || course.image || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80';

function PublicCourseCard({ course }) {
  const { favorites, toggleFavorite, formatMoney } = useApp();
  const liked = favorites.includes(course.id);
  return <article className="course-card"><div className="course-image"><img src={courseImage(course)} alt="" loading="lazy" decoding="async" /><span className="course-tag">{course.category}</span><button className={`favorite ${liked ? 'active' : ''}`} onClick={() => toggleFavorite(course.id)} aria-label="Guardar curso" aria-pressed={liked}><Heart size={17} fill={liked ? 'currentColor' : 'none'} /></button></div><div className="course-body"><span className="course-instructor">Por {course.instructorName || course.owner?.fullName || course.instructor || 'Instructor'}</span><Link className="course-title course-link" to={`/curso/${course.slug || course.id}`}>{course.title}</Link><div className="course-meta"><span>{course.lessonCount ?? course.lessons ?? 0} lecciones</span><span>•</span><span>{levelLabels[course.level] || course.level}</span><span>•</span><span className="access-meta"><Clock3 size={13} aria-hidden="true" />{accessLabel(course.accessDays)}</span></div><div className="course-price">{formatMoney(course.priceCents)}</div></div></article>;
}

function ExplorePage() {
  const { api } = useApp();
  const [params, setParams] = useSearchParams(); const query = params.get('buscar') || ''; const selected = params.get('categoria') || ''; const level = params.get('nivel') || '';
  const [filtersOpen, setFiltersOpen] = useState(false); const [catalog, setCatalog] = useState([]); const [categoryOptions, setCategoryOptions] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const update = (name, value) => { const next = new URLSearchParams(params); value ? next.set(name, value) : next.delete(name); setParams(next); };
  useEffect(() => { let cancelled = false; setLoading(true); setError(''); const search = new URLSearchParams(); if (query) search.set('search', query); if (selected) search.set('category', selected); Promise.all([api('/api/categories'), api(`/api/courses${search.size ? `?${search}` : ''}`)]).then(([categoryData, courseData]) => { if (!cancelled) { setCategoryOptions(categoryData.categories || []); setCatalog(courseData.courses || []); } }).catch((requestError) => { if (!cancelled) setError(requestError.message || 'No se pudo cargar el catálogo.'); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [query, selected]);
  const results = catalog.filter((course) => !level || course.level === level);
  return <main className="page"><div className="container"><div className="section-heading"><div><span className="eyebrow"><BookOpen size={15} /> Catálogo</span><h1 style={{ marginTop: 12 }}>Explora el catálogo</h1><p>{query ? `Resultados para “${query}”` : 'Busca por tema, categoría o nivel: IA, derecho, tecnología y más.'}</p></div></div><div className="explore-layout"><aside id="explore-filters" className={`filters${filtersOpen ? ' is-open' : ''}`}><h3>Filtros</h3><div className="filter-group"><strong>Categoría</strong><label><input type="radio" checked={!selected} onChange={() => update('categoria', '')} /> Todas</label>{categoryOptions.map((category) => <label key={category.id}><input type="radio" checked={selected === category.name} onChange={() => update('categoria', category.name)} /> {category.name}</label>)}</div><div className="filter-group"><strong>Nivel</strong>{Object.entries(levelLabels).map(([value, label]) => <label key={value}><input type="radio" checked={level === value} onChange={() => update('nivel', level === value ? '' : value)} /> {label}</label>)}</div><button type="button" className="button button-primary filters-apply" onClick={() => setFiltersOpen(false)}>Ver {results.length} {results.length === 1 ? 'curso' : 'cursos'}</button></aside><div><div className="results-bar"><span><strong>{results.length}</strong> cursos encontrados</span><button type="button" className="filters-toggle" aria-expanded={filtersOpen} aria-controls="explore-filters" onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={18} aria-hidden="true" /> Filtros{(selected ? 1 : 0) + (level ? 1 : 0) > 0 && <span className="filters-toggle-count">{(selected ? 1 : 0) + (level ? 1 : 0)}</span>}</button></div>{loading ? <PageSkeleton /> : error ? <div className="empty">{error}</div> : results.length ? <div className="course-grid">{results.map((course) => <PublicCourseCard key={course.id} course={course} />)}</div> : <div className="empty">No encontramos cursos con esos filtros. Prueba con otra búsqueda.</div>}</div></div></div></main>;
}

function LessonMaterialsPanel({ courseId, sectionId, lesson, api, getUploadSignature, notify, onChanged }) {
  const [form, setForm] = useState({ type: 'file', title: '', description: '', url: '' });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [progress, setProgress] = useState(0);
  const materials = lesson.materials || [];
  const saveMaterial = async (event) => {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) { notify('Escribe un título para el material.'); return; }
    if (form.type === 'file' && !file) { notify('Selecciona un archivo.'); return; }
    let linkUrl = null;
    if (form.type === 'link') {
      try { linkUrl = new URL(form.url.trim()); } catch { notify('Escribe una URL válida.'); return; }
      if (linkUrl.protocol !== 'https:') { notify('La URL del enlace debe usar HTTPS.'); return; }
    }
    setSaving(true); setProgress(form.type === 'file' ? 10 : 0);
    try {
      let body = { type: form.type, title, description: form.description.trim() };
      if (form.type === 'file') {
        const signedUpload = await getUploadSignature(); setProgress(25);
        const uploaded = await uploadMaterialToCloudinary(file, signedUpload, setProgress);
        body = { ...body, url: uploaded.secureUrl, publicId: uploaded.publicId, originalFilename: uploaded.originalFilename, mimeType: uploaded.mimeType, sizeBytes: uploaded.sizeBytes };
      } else body.url = linkUrl.href;
      await api(`/api/admin/sections/${sectionId}/lessons/${lesson.id}/materials`, { method: 'POST', body });
      setForm({ type: 'file', title: '', description: '', url: '' }); setFile(null); setProgress(0);
      notify('Material de clase agregado.'); await onChanged();
    } catch (error) { setProgress(0); notify(error.message || 'No se pudo guardar el material de clase.'); }
    finally { setSaving(false); }
  };

  const deleteMaterial = async (material) => {
    if (deletingId || !window.confirm(`¿Eliminar “${material.title}”? Esta acción no se puede deshacer.`)) return;
    setDeletingId(material.id);
    try { await api(`/api/admin/sections/${sectionId}/lessons/${lesson.id}/materials/${material.id}`, { method: 'DELETE' }); notify('Material de clase eliminado.'); await onChanged(); }
    catch (error) { notify(error.message || 'No se pudo eliminar el material de clase.'); }
    finally { setDeletingId(null); }
  };

  const openMaterial = async (material) => {
    setOpeningId(material.id);
    try { await openMaterialAccess({ material, endpoint: `/api/courses/${courseId}/lessons/${lesson.id}/materials/${material.id}/access`, api, notify }); }
    finally { setOpeningId(null); }
  };

  return <section className="lesson-materials"><div className="lesson-materials-head"><div><span className="eyebrow"><FileText size={14} /> Materiales de esta clase</span><p>Estos recursos se mostrarán solo junto a esta lección.</p></div><span className="materials-count">{materials.length}</span></div>{materials.length > 0 && <div className="materials-list lesson-materials-list">{materials.map((material) => <article className="material-row" key={material.id}><span className="material-icon">{material.type === 'link' ? <Link2 size={20} /> : <FileText size={20} />}</span><div className="material-copy"><div className="material-title-line"><strong>{material.title}</strong><span>{materialTypeLabel(material)}</span></div>{material.description && <p>{material.description}</p>}<small>{material.type === 'file' ? [material.originalFilename, formatMaterialSize(material.sizeBytes)].filter(Boolean).join(' · ') : material.url}</small></div><div className="material-actions"><button type="button" className="button button-secondary" onClick={() => void openMaterial(material)} disabled={openingId !== null}>{openingId === material.id ? <><LoaderCircle className="button-spinner" size={15} /> Abriendo…</> : <><ExternalLink size={15} /> Abrir</>}</button><button type="button" className="icon-button material-delete" onClick={() => void deleteMaterial(material)} disabled={saving || deletingId !== null || openingId !== null} aria-label={`Eliminar ${material.title}`}>{deletingId === material.id ? <LoaderCircle className="button-spinner" size={18} /> : <Trash2 size={18} />}</button></div></article>)}</div>}<form className="lesson-material-form" onSubmit={saveMaterial}><h3>Agregar material</h3><div className="material-type-picker" role="group" aria-label="Tipo de material de clase"><button type="button" className={form.type === 'file' ? 'active' : ''} onClick={() => { setForm({ ...form, type: 'file', url: '' }); setProgress(0); }} disabled={saving}><Upload size={16} /> Archivo</button><button type="button" className={form.type === 'link' ? 'active' : ''} onClick={() => { setForm({ ...form, type: 'link' }); setFile(null); setProgress(0); }} disabled={saving}><Link2 size={16} /> Enlace</button></div><label className="form-field">Título<input required maxLength="180" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ej. Guía de ejercicios" /></label><label className="form-field">Descripción <small>(opcional)</small><textarea rows="2" maxLength="500" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Explica brevemente para qué sirve" /></label>{form.type === 'file' ? <div className="material-upload"><Upload size={23} /><strong title={file?.name}>{file?.name || 'Selecciona un archivo'}</strong><span>{file ? `${formatMaterialSize(file.size)} · listo para subir` : 'PDF, Word, Excel, PowerPoint, TXT o ZIP · Máx. 25 MB'}</span><label className="button button-secondary"><input type="file" required accept={MATERIAL_ACCEPT} onChange={(event) => { setFile(event.target.files?.[0] || null); setProgress(0); }} />Elegir archivo</label>{saving && progress > 0 && <div className="upload-progress" aria-label={`Carga ${progress}%`}><i style={{ width: `${progress}%` }} /></div>}</div> : <label className="form-field">URL HTTPS<input required type="url" inputMode="url" pattern="https://.*" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://ejemplo.com/recurso" /></label>}<button className="button button-secondary material-submit" disabled={saving || deletingId !== null}>{saving ? <><LoaderCircle className="button-spinner" size={17} /> {form.type === 'file' ? 'Subiendo…' : 'Guardando…'}</> : <><Plus size={17} /> Agregar material de clase</>}</button></form></section>;
}

function CourseEditorPage() {
  const { id } = useParams(); const { user, api, getUploadSignature, notify, payments, formatMoney } = useApp(); const navigate = useNavigate(); const [data, setData] = useState(null); const [categoryOptions, setCategoryOptions] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [activeTab, setActiveTab] = useState('Contenido'); const [sectionForm, setSectionForm] = useState({ title: '', description: '' }); const [courseForm, setCourseForm] = useState({ title: '', subtitle: '', category: '', level: 'beginner', priceAmount: '0', accessPolicy: { mode: 'limited', days: String(DEFAULT_ACCESS_DAYS) }, instructorName: '', instructorTitle: '' }); const [accessError, setAccessError] = useState(''); const [coverFile, setCoverFile] = useState(null); const [coverPreview, setCoverPreview] = useState(''); const [coverMode, setCoverMode] = useState('file'); const [coverUrl, setCoverUrl] = useState(''); const [coverUrlLoading, setCoverUrlLoading] = useState(false); const coverUrlAbortRef = useRef(null); const [cropSource, setCropSource] = useState(null); const coverPreviewObjectUrlRef = useRef(''); const cropSourceObjectUrlRef = useRef(''); const [coverUploadedUrl, setCoverUploadedUrl] = useState(''); const [coverProgress, setCoverProgress] = useState(0); const [lessonSectionId, setLessonSectionId] = useState(''); const [lessonEditing, setLessonEditing] = useState(null); const [quizTarget, setQuizTarget] = useState(null); const [lessonForm, setLessonForm] = useState({ title: '', description: '' }); const [lessonFile, setLessonFile] = useState(null); const [pendingLessonFiles, setPendingLessonFiles] = useState([]); const [uploadProgress, setUploadProgress] = useState(0); const [saving, setSaving] = useState(false); const [publishing, setPublishing] = useState(false); const [unpublishing, setUnpublishing] = useState(false); const closeLessonDrawer = () => { if (saving) return; setLessonSectionId(''); setLessonEditing(null); setLessonForm({ title: '', description: '' }); setLessonFile(null); setPendingLessonFiles([]); setUploadProgress(0); }; const openLessonDrawer = (section, lesson = null) => { setLessonSectionId(String(section.id)); setLessonEditing(lesson); setLessonForm({ title: lesson?.title || '', description: lesson?.description || '' }); setLessonFile(null); setPendingLessonFiles([]); setUploadProgress(0); };
  const allowed = Boolean(user && ['admin', 'super_admin'].includes(user.role));
  const load = async ({ silent = false } = {}) => { if (!allowed) return; if (!silent) { setLoading(true); setError(''); } try { const [editor, categoriesData] = await Promise.all([api(`/api/admin/courses/${id}/editor`), silent ? Promise.resolve({ categories: categoryOptions }) : api('/api/categories')]); setData(editor); setCategoryOptions(categoriesData.categories || []); } catch (requestError) { if (!silent) setError(requestError.message || 'No se pudo cargar el editor.'); else throw requestError; } finally { if (!silent) setLoading(false); } };
  const reloadSilently = () => load({ silent: true });
  useEffect(() => { if (allowed) void load(); }, [user?.id, id]);
  useEffect(() => { if (data?.course) { setCourseForm({ title: data.course.title || '', subtitle: data.course.subtitle || '', category: data.course.category || '', level: data.course.level || 'beginner', priceAmount: centsToAmount(data.course.priceCents, payments.currency), accessPolicy: policyFromAccessDays(data.course.accessDays), instructorName: data.course.instructorName || '', instructorTitle: data.course.instructorTitle || '' }); setAccessError(''); if (!coverFile) { if (coverPreviewObjectUrlRef.current) { URL.revokeObjectURL(coverPreviewObjectUrlRef.current); coverPreviewObjectUrlRef.current = ''; } setCoverPreview(data.course.thumbnailUrl || ''); } } }, [data, payments.currency]);
  useEffect(() => () => { coverUrlAbortRef.current?.abort(); if (coverPreviewObjectUrlRef.current) URL.revokeObjectURL(coverPreviewObjectUrlRef.current); if (cropSourceObjectUrlRef.current) URL.revokeObjectURL(cropSourceObjectUrlRef.current); }, []);
  if (!user) return <Navigate to="/login" replace />; if (!allowed) return <Navigate to="/mi-aprendizaje" replace />; if (loading) return <PageSkeleton workspace />;
  const createSection = async (event) => { event.preventDefault(); if (!sectionForm.title.trim()) return; setSaving(true); try { await api(`/api/admin/courses/${id}/sections`, { method: 'POST', body: { title: sectionForm.title.trim(), description: sectionForm.description.trim() } }); setSectionForm({ title: '', description: '' }); notify('Sección creada.'); await load(); } catch (requestError) { notify(requestError.message); } finally { setSaving(false); } };
  const closeCoverCrop = () => { if (cropSourceObjectUrlRef.current) { URL.revokeObjectURL(cropSourceObjectUrlRef.current); cropSourceObjectUrlRef.current = ''; } setCropSource(null); };
  const openCoverCrop = (blob, name) => { if (cropSourceObjectUrlRef.current) URL.revokeObjectURL(cropSourceObjectUrlRef.current); const objectUrl = URL.createObjectURL(blob); cropSourceObjectUrlRef.current = objectUrl; setCropSource({ url: objectUrl, name, type: blob.type }); };
  const selectCover = (file) => { if (!file) return; if (!COVER_TYPES.includes(file.type)) { notify('La portada debe ser JPG, PNG o WebP.'); return; } if (file.size > COVER_MAX_BYTES) { notify('La portada no puede superar 8 MB.'); return; } openCoverCrop(file, file.name); };
  const loadCoverUrl = async () => { let parsed; try { parsed = new URL(coverUrl.trim()); } catch { notify('Escribe una URL de imagen válida.'); return; } if (parsed.protocol !== 'https:') { notify('La URL de la portada debe usar HTTPS.'); return; } setCoverUrlLoading(true); try { const { image } = await api('/api/uploads/image-source', { method: 'POST', body: { url: parsed.href } }); const response = await fetch(image.dataUrl); const blob = await response.blob(); openCoverCrop(blob, image.sourceHost || parsed.hostname); } catch (requestError) { notify(requestError.message || 'No se pudo cargar la imagen desde la URL.'); } finally { setCoverUrlLoading(false); } };
  const applyCoverCrop = (file) => { if (coverPreviewObjectUrlRef.current) URL.revokeObjectURL(coverPreviewObjectUrlRef.current); const previewUrl = URL.createObjectURL(file); coverPreviewObjectUrlRef.current = previewUrl; setCoverFile(file); setCoverUploadedUrl(''); setCoverPreview(previewUrl); setCoverProgress(0); closeCoverCrop(); notify('Portada lista. Guarda la configuración para subir la portada.'); };
  const saveCourseSettings = async (event) => { event.preventDefault(); const priceAmount = Number(courseForm.priceAmount); if (!courseForm.title.trim() || !courseForm.category || !Number.isFinite(priceAmount) || priceAmount < 0) { notify('Completa título, categoría y un precio válido.'); return; } let accessDays; try { accessDays = accessDaysFromPolicy(courseForm.accessPolicy); setAccessError(''); } catch (policyError) { setAccessError(policyError.message); return; } setSaving(true); setCoverProgress(0); try { let thumbnailUrl = data.course.thumbnailUrl || null; if (coverFile) { if (coverUploadedUrl) { thumbnailUrl = coverUploadedUrl; setCoverProgress(100); } else { setCoverProgress(15); const signedUpload = await getUploadSignature(); const image = await uploadImageToCloudinary(coverFile, signedUpload, setCoverProgress); thumbnailUrl = image.secureUrl; setCoverUploadedUrl(image.secureUrl); } } await api(`/api/admin/courses/${id}`, { method: 'PATCH', body: { title: courseForm.title.trim(), subtitle: courseForm.subtitle.trim(), category: courseForm.category, level: courseForm.level, priceCents: amountToCents(priceAmount), thumbnailUrl, accessDays, instructorName: courseForm.instructorName.trim() || null, instructorTitle: courseForm.instructorTitle.trim() || null } }); setCoverFile(null); setCoverUploadedUrl(''); setCoverProgress(0); notify('Configuración y portada guardadas.'); await load(); } catch (requestError) { setCoverProgress(0); notify(requestError.message); } finally { setSaving(false); } };
  const saveLesson = async (event) => { event.preventDefault(); const editing = Boolean(lessonEditing); if (!lessonSectionId || !lessonForm.title.trim() || (!editing && !lessonFile)) { notify(editing ? 'Agrega el título de la clase.' : 'Agrega el título y el video de la clase.'); return; } setSaving(true); setUploadProgress(lessonFile ? 10 : 0); let createdLesson = null; try { const body = { title: lessonForm.title.trim(), description: lessonForm.description.trim() }; if (lessonFile) { const signedUpload = await getUploadSignature(); setUploadProgress(20); const video = await uploadVideoToCloudinary(lessonFile, signedUpload, setUploadProgress); if (!video.durationSeconds) throw new Error('No se pudo obtener la duración del video. Elige un archivo de video válido.'); Object.assign(body, { videoUrl: video.secureUrl, videoPublicId: video.publicId, durationSeconds: video.durationSeconds }); } const result = await api(editing ? `/api/admin/sections/${lessonSectionId}/lessons/${lessonEditing.id}` : `/api/admin/sections/${lessonSectionId}/lessons`, { method: editing ? 'PATCH' : 'POST', body }); createdLesson = result.lesson; if (!editing && pendingLessonFiles.length) { let completedFiles = 0; for (const pendingFile of pendingLessonFiles) { setUploadProgress(Math.round(25 + (completedFiles / pendingLessonFiles.length) * 70)); const signedUpload = await getUploadSignature(); const uploaded = await uploadMaterialToCloudinary(pendingFile, signedUpload); await api(`/api/admin/sections/${lessonSectionId}/lessons/${createdLesson.id}/materials`, { method: 'POST', body: { type: 'file', title: pendingFile.name, description: '', url: uploaded.secureUrl, publicId: uploaded.publicId, originalFilename: uploaded.originalFilename, mimeType: uploaded.mimeType, sizeBytes: uploaded.sizeBytes } }); completedFiles += 1; } } setLessonFile(null); setPendingLessonFiles([]); setUploadProgress(0); if (editing) { setLessonSectionId(''); setLessonEditing(null); setLessonForm({ title: '', description: '' }); notify('Clase actualizada.'); } else { setLessonEditing({ ...createdLesson, description: body.description, materials: [] }); notify(pendingLessonFiles.length ? `Clase creada con ${pendingLessonFiles.length} material${pendingLessonFiles.length === 1 ? '' : 'es'}.` : 'Clase y video guardados.'); } await load(); } catch (requestError) { setUploadProgress(0); if (createdLesson) { setLessonEditing({ ...createdLesson, description: lessonForm.description, materials: [] }); await load(); notify(`La clase se guardó, pero un material falló: ${requestError.message}`); } else notify(requestError.message); } finally { setSaving(false); } };
  if (error) return <main className="page"><div className="container"><div className="empty">{error}<button className="button button-secondary" style={{ marginLeft: 12 }} onClick={() => navigate('/docencia')}>Volver a mis cursos</button></div></div></main>;
  const course = data.course; const selectedSection = data.sections.find((section) => Number(section.id) === Number(lessonSectionId)); const isEditingLesson = Boolean(lessonEditing); const selectedLesson = data.sections.flatMap((section) => section.lessons).find((lesson) => Number(lesson.id) === Number(lessonEditing?.id)); const drawerLesson = selectedLesson ?? lessonEditing; const allItems = data.sections.flatMap((section) => section.lessons); const lessons = allItems.filter((lesson) => lesson.kind !== 'quiz'); const quizItems = allItems.filter((lesson) => lesson.kind === 'quiz'); const emptyQuizzes = quizItems.filter((quiz) => !(quiz.quiz?.questionCount > 0)); const videoLessonCount = lessons.filter((lesson) => Boolean(lesson.videoUrl)).length; const canPublish = data.sections.length > 0 && videoLessonCount > 0; const busy = saving || publishing || unpublishing;
  const publishCourse = async () => { if (course.status === 'published') return; if (!canPublish) { notify('Agrega al menos una sección y una clase con video antes de publicar.'); return; } setPublishing(true); try { await api(`/api/admin/courses/${id}/publish`, { method: 'POST' }); notify('Curso publicado.'); await load(); } catch (requestError) { notify(requestError.message); } finally { setPublishing(false); } };
  const unpublishCourse = async () => { if (course.status !== 'published' || unpublishing) return; const confirmed = window.confirm('¿Retirar este curso del catálogo? Los alumnos que ya están inscritos conservarán el acceso.'); if (!confirmed) return; setUnpublishing(true); try { await api(`/api/admin/courses/${id}/unpublish`, { method: 'POST' }); notify('Curso retirado del catálogo.'); await load(); } catch (requestError) { notify(requestError.message); } finally { setUnpublishing(false); } };
  const tabs = ['Contenido', 'Documentos', 'Promoción', 'Configuración', 'Publicación'];
  return <main className="page"><div className="container"><div className="workspace-page-head"><div><span className="eyebrow"><BookOpen size={15} /> Editor de curso</span><h1>{course.title}</h1><p>{course.category} · {formatMoney(course.priceCents)} · {course.status === 'published' ? 'Publicado' : 'Borrador'}</p></div><Link className="button button-secondary" to="/docencia"><ArrowLeft size={17} /> Mis cursos</Link></div><nav className="course-editor-tabs" aria-label="Secciones del editor" role="tablist">{tabs.map((tab) => <button key={tab} type="button" className={activeTab === tab ? 'active' : ''} role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>{activeTab === 'Contenido' && <div className="editor-layout"><section className="workspace-card"><h2>Programa del curso</h2><p className="muted-copy">Organiza el recorrido y agrega una clase solo cuando esté lista para subir su video.</p><CourseOutline courseId={id} sections={data.sections} busy={busy} api={api} notify={notify} onReload={reloadSilently} onAddLesson={(section) => openLessonDrawer(section)} onEditLesson={(section, lesson) => openLessonDrawer(section, lesson)} onAddQuiz={(section, index) => setQuizTarget({ mode: 'create', sectionId: section.id, index })} onEditQuiz={(quizId) => setQuizTarget({ mode: 'edit', quizId })} /></section><aside className="editor-side"><form className="workspace-card" onSubmit={createSection}><h2>Nueva sección</h2><p className="muted-copy">Define el siguiente bloque de aprendizaje.</p><label className="form-field">Título<input required value={sectionForm.title} onChange={(event) => setSectionForm({ ...sectionForm, title: event.target.value })} placeholder="Ej. Fundamentos" /></label><label className="form-field">Descripción <small>(opcional)</small><textarea rows="3" value={sectionForm.description} onChange={(event) => setSectionForm({ ...sectionForm, description: event.target.value })} /></label><button className="button button-primary" disabled={busy}><Plus size={16} /> {saving ? 'Creando…' : 'Crear sección'}</button></form></aside></div>}{activeTab === 'Contenido' && quizTarget && <QuizEditorDrawer courseId={id} sections={data.sections} target={quizTarget} api={api} notify={notify} onClose={() => setQuizTarget(null)} onChanged={reloadSilently} />}{activeTab === 'Contenido' && lessonSectionId && <div className="course-lesson-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeLessonDrawer(); }}><div className="course-lesson-drawer" role="dialog" aria-modal="true" aria-labelledby="lesson-drawer-title"><div className="section-heading"><div><h2 id="lesson-drawer-title">{isEditingLesson ? 'Editar clase' : 'Nueva clase'}</h2><p>En: {selectedSection?.title}</p></div><button type="button" className="icon-button" onClick={closeLessonDrawer} aria-label="Cerrar" disabled={busy}><X size={18} /></button></div><label className="form-field">Título<input required value={lessonForm.title} onChange={(event) => setLessonForm({ ...lessonForm, title: event.target.value })} placeholder="Ej. Bienvenida" /></label><label className="form-field">Descripción <small>(opcional)</small><textarea rows="3" value={lessonForm.description} onChange={(event) => setLessonForm({ ...lessonForm, description: event.target.value })} /></label><div className="lesson-video-state"><Video size={19} /><div><strong>{isEditingLesson ? (lessonEditing.videoUrl ? 'Video actual listo' : 'Video actual pendiente') : 'Video de la clase'}</strong><span>{isEditingLesson && !lessonFile ? 'Se conservará el video actual. Selecciona otro solo si quieres reemplazarlo.' : lessonFile ? `${(lessonFile.size / 1024 / 1024).toFixed(1)} MB · Video seleccionado` : 'MP4, MOV o WebM.'}</span></div></div><div className="upload-drop"><Upload size={24} /><strong title={lessonFile ? lessonFile.name : undefined}>{lessonFile ? lessonFile.name : isEditingLesson ? 'Conservar video actual' : 'Selecciona el video de esta clase'}</strong><span>{isEditingLesson ? 'Opcional: selecciona un archivo para reemplazar el video.' : 'MP4, MOV o WebM.'}</span><label className="button button-secondary" style={{ marginTop: 12 }}><input type="file" required={!isEditingLesson} accept="video/mp4,video/quicktime,video/webm" onChange={(event) => { setLessonFile(event.target.files?.[0] || null); setUploadProgress(0); }} />{isEditingLesson ? 'Reemplazar video' : 'Elegir video'}</label>{saving && uploadProgress > 0 && <div className="upload-progress"><i style={{ width: `${uploadProgress}%` }} /></div>}</div>{isEditingLesson && drawerLesson ? <LessonMaterialsPanel key={drawerLesson.id} courseId={id} sectionId={lessonSectionId} lesson={drawerLesson} api={api} getUploadSignature={getUploadSignature} notify={notify} onChanged={load} /> : <section className="lesson-materials pending-lesson-materials"><div className="lesson-materials-head"><div><span className="eyebrow"><FileText size={14} /> Materiales de esta clase</span><p>Adjunta archivos ahora; se asociarán automáticamente al guardar la clase.</p></div><span className="materials-count">{pendingLessonFiles.length}</span></div><div className="material-upload"><Upload size={23} /><strong>{pendingLessonFiles.length ? `${pendingLessonFiles.length} archivo${pendingLessonFiles.length === 1 ? '' : 's'} seleccionado${pendingLessonFiles.length === 1 ? '' : 's'}` : 'Selecciona materiales'}</strong><span>PDF, imágenes, Word, Excel, PowerPoint, TXT o ZIP · Máx. 25 MB cada uno</span><label className="button button-secondary"><input type="file" multiple accept={MATERIAL_ACCEPT} onChange={(event) => { const selected = Array.from(event.target.files || []).filter((file) => file.size <= 25 * 1024 * 1024); setPendingLessonFiles((current) => [...current, ...selected.filter((file) => !current.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified))]); event.target.value = ''; }} />Elegir archivos</label></div>{pendingLessonFiles.length > 0 && <div className="pending-material-list">{pendingLessonFiles.map((file) => <div className="pending-material-item" key={`${file.name}-${file.size}-${file.lastModified}`}><FileText size={17} /><div><strong title={file.name}>{file.name}</strong><span>{formatMaterialSize(file.size)}</span></div><button type="button" className="icon-button" onClick={() => setPendingLessonFiles((current) => current.filter((item) => item !== file))} aria-label={`Quitar ${file.name}`} disabled={saving}><X size={16} /></button></div>)}</div>}</section>}<button type="button" className="button button-primary" disabled={busy} onClick={saveLesson}><Upload size={16} /> {saving ? (!isEditingLesson && pendingLessonFiles.length ? 'Guardando clase y materiales…' : lessonFile ? 'Subiendo video…' : 'Guardando…') : isEditingLesson ? 'Guardar cambios' : pendingLessonFiles.length ? `Guardar clase + ${pendingLessonFiles.length} adjunto${pendingLessonFiles.length === 1 ? '' : 's'}` : 'Guardar clase'}</button></div></div>}{activeTab === 'Documentos' && <CourseDocumentsPanel courseId={id} materials={data.materials || []} api={api} getUploadSignature={getUploadSignature} notify={notify} onReload={reloadSilently} />}{activeTab === 'Promoción' && <PromoImagesPanel courseId={id} images={data.promoImages || []} api={api} getUploadSignature={getUploadSignature} notify={notify} onReload={reloadSilently} />}{activeTab === 'Configuración' && <section className="workspace-card editor-settings-card"><div className="editor-panel-head"><div><h2>Configuración del curso</h2><p className="muted-copy">Actualiza la información que verán los estudiantes antes de publicar.</p></div></div><form className="editor-settings-form" onSubmit={saveCourseSettings}><div className="course-cover-field"><span className="course-cover-label">Portada del curso</span><div className={`course-cover-preview ${coverPreview ? 'has-image' : ''}`}>{coverPreview ? <img src={coverPreview} alt="Vista previa de la portada" onError={() => notify('No se pudo mostrar la portada actual. Puedes reemplazarla.')} /> : <div><Upload size={27} /><strong>Añade una portada</strong><span>Recomendado: 1280 × 720 px</span></div>}</div><div className="cover-source-tabs" role="tablist" aria-label="Origen de la portada"><button type="button" role="tab" aria-selected={coverMode === 'file'} className={coverMode === 'file' ? 'active' : ''} onClick={() => { coverUrlAbortRef.current?.abort(); coverUrlAbortRef.current = null; setCoverUrlLoading(false); setCoverMode('file'); }}>Archivo</button><button type="button" role="tab" aria-selected={coverMode === 'url'} className={coverMode === 'url' ? 'active' : ''} onClick={() => setCoverMode('url')}>URL</button></div>{coverMode === 'file' ? <div className="course-cover-actions"><label className="button button-secondary"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { selectCover(event.target.files?.[0]); event.target.value = ''; }} />{coverPreview ? 'Cambiar portada' : 'Elegir imagen'}</label><span>JPG, PNG o WebP · Máx. 8 MB</span></div> : <div className="cover-url-row"><label className="form-field">URL HTTPS de la imagen<input type="url" inputMode="url" value={coverUrl} onChange={(event) => setCoverUrl(event.target.value)} placeholder="https://ejemplo.com/portada.jpg" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void loadCoverUrl(); } }} /></label><button type="button" className="button button-secondary" onClick={() => void loadCoverUrl()} disabled={coverUrlLoading}>{coverUrlLoading ? 'Cargando…' : 'Cargar'}</button></div>}{coverFile && <p className="cover-ready-note">JPEG 1280 × 720 listo para subir al guardar.</p>}{coverProgress > 0 && <div className="upload-progress"><i style={{ width: `${coverProgress}%` }} /></div>}{cropSource && <CoverCropModal source={cropSource} onCancel={closeCoverCrop} onApply={applyCoverCrop} notify={notify} />}</div><label className="form-field">Título<input required value={courseForm.title} onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })} /></label><label className="form-field">Subtítulo <small>(opcional)</small><input value={courseForm.subtitle} onChange={(event) => setCourseForm({ ...courseForm, subtitle: event.target.value })} /></label><label className="form-field">Categoría<select required value={courseForm.category} onChange={(event) => setCourseForm({ ...courseForm, category: event.target.value })}><option value="" disabled>Selecciona una categoría</option>{categoryOptions.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</select></label><label className="form-field">Nivel<select value={courseForm.level} onChange={(event) => setCourseForm({ ...courseForm, level: event.target.value })}><option value="beginner">Principiante</option><option value="intermediate">Intermedio</option><option value="advanced">Avanzado</option></select></label><label className="form-field">{payments.currency ? `Precio (${payments.currency})` : 'Precio'}<input required min="0" step={fractionDigits(payments.currency) === 0 ? 1 : 0.01} type="number" inputMode="decimal" value={courseForm.priceAmount} onChange={(event) => setCourseForm({ ...courseForm, priceAmount: event.target.value })} /></label><label className="form-field">Nombre del instructor que verán los alumnos <small>(opcional)</small><input maxLength={120} placeholder={data.course.ownerName || 'Nombre del propietario del curso'} value={courseForm.instructorName} onChange={(event) => setCourseForm({ ...courseForm, instructorName: event.target.value })} /><small>Si lo dejas vacío se muestra el nombre del propietario del curso.</small></label><label className="form-field">Cargo o descripción del instructor <small>(opcional)</small><input maxLength={160} placeholder="Docente en Streamly Academia" value={courseForm.instructorTitle} onChange={(event) => setCourseForm({ ...courseForm, instructorTitle: event.target.value })} /><small>Aparece debajo del nombre en la tarjeta «Tu instructor».</small></label><AccessPolicyField value={courseForm.accessPolicy} onChange={(accessPolicy) => { setAccessError(''); setCourseForm({ ...courseForm, accessPolicy }); }} disabled={busy} error={accessError} /><div className="editor-settings-actions"><button className="button button-primary" disabled={busy}>{saving ? <><LoaderCircle className="button-spinner" size={17} /> Guardando…</> : 'Guardar configuración'}</button></div></form></section>}{activeTab === 'Publicación' && <section className="workspace-card publish-panel"><div className="editor-panel-head"><div><span className="eyebrow"><CheckCircle2 size={15} /> Listo para publicar</span><h2>Revisa tu curso</h2><p className="muted-copy">Confirma que el programa tenga contenido con video antes de abrirlo a estudiantes.</p></div><span className={`course-status ${course.status === 'published' ? 'is-published' : ''}`}>{course.status === 'published' ? 'Publicado' : 'Borrador'}</span></div><div className="publish-checklist"><div className={data.sections.length ? 'complete' : ''}><CheckCircle2 size={20} /><div><strong>Al menos una sección</strong><span>{data.sections.length ? `${data.sections.length} ${data.sections.length === 1 ? 'sección creada' : 'secciones creadas'}` : 'Crea la estructura del programa en Contenido.'}</span></div></div><div className={videoLessonCount ? 'complete' : ''}><CheckCircle2 size={20} /><div><strong>Al menos una clase con video</strong><span>{videoLessonCount ? `${videoLessonCount} ${videoLessonCount === 1 ? 'clase con video lista' : 'clases con video listas'}` : 'Agrega una clase con video en la pestaña Contenido.'}</span></div></div></div><div className="publish-summary"><span>{lessons.length} {lessons.length === 1 ? 'clase' : 'clases'} en total</span><span>{videoLessonCount} con video</span>{quizItems.length > 0 && <span>{quizItems.length} {quizItems.length === 1 ? 'evaluación' : 'evaluaciones'}</span>}</div>{emptyQuizzes.map((quiz) => <p key={quiz.id} className="publish-help" role="note">Agrega preguntas a «{quiz.title}» o elimínala antes de publicar.</p>)}{course.status === 'published' ? <div className="unpublish-action"><button className="button button-danger publish-button" onClick={() => void unpublishCourse()} disabled={busy}>{unpublishing ? <><LoaderCircle className="button-spinner" size={17} /> Retirando…</> : 'Retirar del catálogo'}</button><p>El curso dejará de aceptar nuevas inscripciones, pero los alumnos actuales conservarán su acceso y progreso.</p></div> : <><button className="button button-primary publish-button" onClick={() => void publishCourse()} disabled={busy || !canPublish}><CheckCircle2 size={17} /> {publishing ? 'Publicando…' : 'Publicar curso'}</button>{!canPublish && <p className="publish-help">Completa los requisitos para habilitar la publicación.</p>}</>}</section>}{activeTab === 'Publicación' && course.certificateTemplate && <CertificateBlock courseId={id} hasCertificate manager variant="editor" />}{activeTab === 'Publicación' && <ShareCourseBlock course={{ ...course, slug: course.slug }} />}</div></main>;
}

function AppShell() {
  const location = useLocation();
  const { user } = useApp();
  const isImmersiveLearning = location.pathname.startsWith('/aprender/');
  const hasLandingFooter = location.pathname === '/' && !user;
  return <>{!isImmersiveLearning && <Header />}<Routes><Route path="/" element={<HomePage />} /><Route path="/explorar" element={<ExplorePage />} /><Route path="/curso/:id" element={<PublicCoursePage />} /><Route path="/pago/resultado" element={<PaymentResultPage />} /><Route path="/pago/:id" element={<CheckoutPage />} /><Route path="/mis-pagos" element={<MyPaymentsPage />} /><Route path="/login" element={<AuthPage />} /><Route path="/mi-aprendizaje" element={<LearningDashboardPage />} /><Route path="/perfil" element={<ProfilePage />} /><Route path="/aprender/:id" element={<RealLearningPlayerPage />} /><Route path="/ensenar" element={<TeachEntryPage />} /><Route path="/docencia" element={<InstructorWorkspacePage />} /><Route path="/docencia/cursos/:id" element={<CourseEditorPage />} /><Route path="/administracion" element={<SuperAdminWorkspacePage />} /><Route path="/gestion" element={<Navigate to="/docencia" replace />} /><Route path="/verificar" element={<VerifyPage />} /><Route path="/verificar/:codigo" element={<VerifyPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>{!isImmersiveLearning && !hasLandingFooter && <Footer />}</>;
}

export default function App() { return <BrowserRouter><AppProvider><AppShell /></AppProvider></BrowserRouter>; }
