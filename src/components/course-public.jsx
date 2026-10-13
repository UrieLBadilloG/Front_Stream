import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Award, BookOpen, CirclePlay, ClipboardCheck, Clock3, Heart, LoaderCircle, RefreshCw, SearchX } from 'lucide-react';

import { useApp } from '../lib/app-context.js';
import { accessLabel } from '../lib/access.js';
import { buildLoginPath } from '../lib/next-path.js';
import { requirementText } from '../lib/quizzes.js';
import { LessonNumber } from './lesson-number.jsx';
import { PromoGallery } from './promo-gallery.jsx';
import { ShareCourseButton, directCourseUrl, previewCourseUrl, useShareConfig } from './share-course.jsx';
import '../styles-share.css';

const FALLBACK_COVER = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80';
const LEVEL_LABELS = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' };
const MAIN_SECTION_TITLE = 'Contenido principal';
const SITE_TITLE = 'Streamly Academia';

const durationLabel = (seconds) => (Number(seconds) > 0 ? `${Math.ceil(Number(seconds) / 60)} min` : 'Clase');

// Agrupa las clases por sección; las que no tienen sección van bajo "Contenido principal".
function groupLessons(course) {
  const byId = new Map((course.sections || []).map((section) => [Number(section.id), { id: Number(section.id), title: section.title, description: section.description, lessons: [] }]));
  const loose = [];
  const place = (entry) => {
    const sectionId = entry.item.sectionId;
    const group = sectionId === null || sectionId === undefined ? null : byId.get(Number(sectionId));
    if (group) group.entries.push(entry);
    else loose.push(entry);
  };
  for (const group of byId.values()) group.entries = [];
  for (const lesson of course.lessons || []) place({ kind: 'lesson', item: lesson });
  // Las posiciones son globales en el curso: se intercalan evaluaciones y clases por `position`.
  for (const quiz of course.quizzes || []) place({ kind: 'quiz', item: quiz });
  const ordered = (entries) => [...entries].sort((a, b) => Number(a.item.position ?? 0) - Number(b.item.position ?? 0));
  const groups = [...byId.values()].filter((group) => group.entries.length > 0).map((group) => ({ ...group, entries: ordered(group.entries) }));
  if (loose.length) groups.unshift({ id: 'main', title: MAIN_SECTION_TITLE, description: '', entries: ordered(loose) });
  return groups;
}

// Precarga la primera imagen promocional para conocer sus proporciones (null = aún no se sabe).
function useImageShape(url) {
  const [shape, setShape] = useState(null);
  useEffect(() => {
    setShape(null);
    if (!url) return undefined;
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => { if (!cancelled) setShape({ width: probe.naturalWidth, height: probe.naturalHeight }); };
    probe.onerror = () => { if (!cancelled) setShape({ width: 0, height: 0 }); };
    probe.src = url;
    return () => { cancelled = true; };
  }, [url]);
  return shape;
}

function CourseSkeleton() {
  return (
    <main className="page" aria-busy="true" aria-label="Cargando curso">
      <div className="container skeleton-page">
        <div className="skeleton skeleton-eyebrow" />
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-copy" />
        <div className="skeleton-courses">{Array.from({ length: 2 }, (_, index) => <div className="skeleton skeleton-card" key={index} />)}</div>
      </div>
    </main>
  );
}

export function PublicCoursePage() {
  const { id: slug } = useParams();
  const { api, user, enroll, favorites, toggleFavorite, notify, formatMoney } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const shareConfig = useShareConfig();
  const [course, setCourse] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  // undefined = cargando, null = sin inscripción, objeto = inscripción (con isExpired).
  const [access, setAccess] = useState(undefined);
  const [enrolling, setEnrolling] = useState(false);
  const autoEnrollKey = useRef('');
  const promoShape = useImageShape(course?.promoImages?.[0]?.url);

  useEffect(() => {
    let cancelled = false;
    setCourse(null);
    setError(null);
    api(`/api/courses/${encodeURIComponent(slug)}`)
      .then((result) => { if (!cancelled) setCourse(result.course); })
      .catch((requestError) => { if (!cancelled) setError({ status: requestError.status ?? 0, message: requestError.message || 'No se pudo cargar el curso.' }); });
    return () => { cancelled = true; };
  }, [slug, attempt]);

  useEffect(() => {
    let cancelled = false;
    if (!user || !course) { setAccess(user ? undefined : null); return undefined; }
    setAccess(undefined);
    api('/api/courses/me/enrollments')
      .then((result) => { if (!cancelled) setAccess((result.courses || []).find((item) => Number(item.id) === Number(course.id)) || null); })
      .catch(() => { if (!cancelled) setAccess(null); });
    return () => { cancelled = true; };
  }, [user?.id, course?.id]);

  useEffect(() => {
    if (!course) return undefined;
    const previous = document.title;
    document.title = `${course.title} | ${SITE_TITLE}`;
    return () => { document.title = previous; };
  }, [course?.title]);

  const isPaid = Boolean(course) && Number(course.priceCents) > 0;
  const isManager = Boolean(user && course) && (user.role === 'super_admin' || Number(course.owner?.id) === Number(user.id));
  const expired = Boolean(access?.isExpired);
  const hasAccess = isManager || (Boolean(access) && !expired);

  // Auto-inscripción tras iniciar sesión desde "Inscribirme gratis" (?accion=inscribir): una sola vez.
  useEffect(() => {
    if (!user || !course || access === undefined) return;
    if (searchParams.get('accion') !== 'inscribir') return;
    const key = `${user.id}:${course.id}`;
    if (autoEnrollKey.current === key) return;
    autoEnrollKey.current = key;
    const cleaned = new URLSearchParams(searchParams);
    cleaned.delete('accion');
    setSearchParams(cleaned, { replace: true });
    if (isPaid) return;
    if (hasAccess) { notify('Ya tienes acceso a este curso.'); return; }
    (async () => {
      try {
        await enroll(course.id);
        navigate('/mi-aprendizaje', { replace: true });
      } catch (requestError) {
        notify(requestError.message || 'No se pudo completar la inscripción.');
      }
    })();
  }, [user?.id, course?.id, access, searchParams]);

  if (error) {
    const notFound = error.status === 404;
    return (
      <main className="page">
        <div className="container">
          <div className="empty cp-empty" role={notFound ? undefined : 'alert'}>
            <SearchX size={30} aria-hidden="true" />
            <h1>{notFound ? 'Este curso no existe o ya no está disponible' : 'No se pudo cargar el curso'}</h1>
            <p>{notFound ? 'Es posible que el enlace esté incompleto o que el curso se haya retirado del catálogo.' : error.message}</p>
            <div className="cp-empty-actions">
              {!notFound && <button type="button" className="button button-secondary" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={16} aria-hidden="true" /> Reintentar</button>}
              <Link className="button button-primary" to="/explorar">Explorar cursos</Link>
            </div>
          </div>
        </div>
      </main>
    );
  }
  if (!course) return <CourseSkeleton />;

  const liked = favorites.includes(course.id);
  const lessons = course.lessons || [];
  const lessonCount = lessons.length || course.lessonCount || 0;
  const groups = groupLessons(course);
  const instructor = course.instructorName || course.owner?.fullName || 'Instructor';
  const checkingAccess = Boolean(user) && !isManager && access === undefined;
  const shareUrl = shareConfig?.previewAvailable ? previewCourseUrl(course.slug, shareConfig) : directCourseUrl(course.slug);

  const enrollFree = async () => {
    setEnrolling(true);
    try {
      await enroll(course.id);
      navigate('/mi-aprendizaje');
    } catch (requestError) {
      notify(requestError.message || 'No se pudo completar la inscripción.');
    } finally {
      setEnrolling(false);
    }
  };

  const handlePrimary = async () => {
    if (!user) {
      notify('Crea tu cuenta o inicia sesión para continuar.');
      navigate(buildLoginPath({ next: isPaid ? `/pago/${course.slug}` : `/curso/${course.slug}?accion=inscribir` }));
      return;
    }
    if (hasAccess) { navigate(`/aprender/${course.id}`); return; }
    if (isPaid) { navigate(`/pago/${course.slug}`); return; }
    await enrollFree();
  };

  let primaryLabel;
  if (enrolling) primaryLabel = <><LoaderCircle className="button-spinner" size={17} aria-hidden="true" /> {expired ? 'Renovando…' : 'Inscribiendo…'}</>;
  else if (checkingAccess) primaryLabel = <><LoaderCircle className="button-spinner" size={17} aria-hidden="true" /> Verificando acceso…</>;
  else if (hasAccess) primaryLabel = <>Continuar curso <ArrowRight size={17} aria-hidden="true" /></>;
  else if (expired) primaryLabel = <><RefreshCw size={16} aria-hidden="true" /> Renovar acceso</>;
  else if (isPaid) primaryLabel = <>Comprar curso <ArrowRight size={17} aria-hidden="true" /></>;
  else primaryLabel = <>Inscribirme gratis <ArrowRight size={17} aria-hidden="true" /></>;

  // Acción principal única: la usan el botón de la tarjeta de compra y el que acompaña al banner.
  const renderPrimary = () => <button type="button" className="button button-primary cp-cta" disabled={enrolling || checkingAccess} onClick={handlePrimary}>{primaryLabel}</button>;

  // Un banner vertical (primera imagen promocional) se muestra entero y destacado; el resto sigue en la galería.
  const promoImages = course.promoImages || [];
  const featuredBanner = promoShape && promoShape.height > promoShape.width * 1.15 ? promoImages[0] : null;
  const galleryImages = featuredBanner ? promoImages.slice(1) : promoImages;

  return (
    <>
      <section className="detail-hero cp-hero">
        <div className="container detail-hero-grid">
          <div>
            <div className="breadcrumb">Explorar / {course.category}</div>
            <h1>{course.title}</h1>
            {course.subtitle && <p>{course.subtitle}</p>}
            <div className="detail-info">
              <span><BookOpen size={15} aria-hidden="true" /> {lessonCount} {lessonCount === 1 ? 'clase' : 'clases'}</span>
              <span>{LEVEL_LABELS[course.level] || course.level}</span>
              <span>Creado por <strong>{instructor}</strong></span>
            </div>
          </div>
          <div className="checkout-card cp-card">
            <img src={course.thumbnailUrl || FALLBACK_COVER} alt={`Portada de ${course.title}`} />
            <div className="checkout-body">
              <div className="checkout-price">{formatMoney(course.priceCents)}</div>
              {renderPrimary()}
              {expired && <div className="checkout-note">Tu acceso venció. Tu progreso se conserva.</div>}
              <div className="cp-secondary">
                <button type="button" className="button button-secondary" aria-pressed={liked} onClick={() => { toggleFavorite(course.id); notify(liked ? 'Curso eliminado de guardados.' : 'Curso guardado para después.'); }}><Heart size={17} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" /> {liked ? 'Guardado' : 'Guardar para después'}</button>
                <ShareCourseButton title={course.title} url={shareUrl} />
              </div>
              <div className="checkout-note">{accessLabel(course.accessDays)}</div>
            </div>
          </div>
        </div>
      </section>
      <main className="container detail-content">
        <div>
          {featuredBanner && (
            <section className="cp-banner" aria-label="Banner promocional del curso">
              <img src={featuredBanner.url} alt={featuredBanner.alt || course.title} width={promoShape.width} height={promoShape.height} loading="eager" decoding="async" />
              <div className="cp-banner-cta">{renderPrimary()}</div>
            </section>
          )}
          {promoShape && galleryImages.length > 0 && (
            <section className="content-card promo-detail-card" aria-labelledby="promo-detail-title">
              <h2 id="promo-detail-title">Galería del curso</h2>
              <PromoGallery variant="detail" labelledBy="promo-detail-title" slides={galleryImages.map((image) => ({ ...image, title: course.title }))} />
            </section>
          )}
          <section className="content-card" aria-labelledby="cp-program-title">
            <h2 id="cp-program-title">Programa del curso</h2>
            <p className="cp-muted">{lessonCount} {lessonCount === 1 ? 'clase disponible' : 'clases disponibles'}</p>
            {groups.length ? groups.map((group) => (
              <div className="cp-section" key={group.id}>
                <h3 className="cp-section-title">{group.title}</h3>
                {group.description && group.id !== 'main' && <p className="cp-muted cp-section-desc">{group.description}</p>}
                {group.entries.map(({ kind, item: lesson }) => (kind === 'quiz'
                  ? (
                    <div className="curriculum-item cp-lesson cp-quiz" key={`quiz-${lesson.id}`}>
                      <strong><ClipboardCheck size={16} aria-hidden="true" /> Evaluación: {lesson.title}</strong>
                      <span>{requirementText(lesson.isRequired)}</span>
                    </div>
                  )
                  : (
                    <div className="curriculum-item cp-lesson" key={lesson.id}>
                      <strong><CirclePlay size={16} aria-hidden="true" /> <LessonNumber lesson={lesson} /> {lesson.title}</strong>
                      <span>{durationLabel(lesson.durationSeconds)}</span>
                    </div>
                  )))}
              </div>
            )) : <p className="muted-copy">El instructor está preparando el contenido.</p>}
          </section>
          <section className="content-card">
            <h2>Sobre este curso</h2>
            <p className="cp-description">{course.description}</p>
          </section>
          <section className="content-card">
            <h2>Tu instructor</h2>
            <div className="instructor-card">
              <span className="big-avatar" aria-hidden="true">{instructor.split(' ').map((name) => name[0]).join('').slice(0, 2)}</span>
              <div>
                <h3>{instructor}</h3>
                <p className="cp-muted">{course.instructorTitle || 'Docente en Streamly Academia'}</p>
              </div>
            </div>
          </section>
        </div>
        <aside>
          <div className="sidebar-facts">
            <h3>Este curso incluye</h3>
            <div className="fact"><BookOpen size={17} aria-hidden="true" /> {lessonCount} {lessonCount === 1 ? 'clase' : 'clases'}</div>
            {course.hasCertificate && <div className="fact"><Award size={17} aria-hidden="true" /> Constancia al completar el curso</div>}
            <div className="fact"><Clock3 size={17} aria-hidden="true" /> {accessLabel(course.accessDays)}</div>
          </div>
        </aside>
      </main>
    </>
  );
}
