import { useLayoutEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BrainCircuit, Check, CheckCircle2, ChevronRight, CirclePlay, Clock3, FileText, Infinity as InfinityIcon, Laptop, LayoutDashboard, LogIn, Play, RefreshCw, Scale, Search, ShieldCheck, Sparkles, Video } from 'lucide-react';
import { Avatar } from './ui.jsx';
import { PromoGallery } from './promo-gallery.jsx';

// Contenido de la landing: solo funciones que la plataforma tiene hoy.
const LANDING_AREAS = [
  { id: 'ia', tone: 'violet', icon: BrainCircuit, title: 'Inteligencia Artificial', text: 'Usa la IA como herramienta de trabajo: entiende qué hace, cuándo conviene y cómo revisar sus resultados.', cta: 'Ver cursos de IA', term: 'IA', topics: [['IA generativa', 'IA generativa'], ['Prompts efectivos', 'prompts'], ['Automatización', 'automatización'], ['IA para abogados y profesionales', 'IA']] },
  { id: 'derecho', tone: 'coral', icon: Scale, title: 'Derecho y legaltech', text: 'Formación jurídica práctica para quienes trabajan con tecnología, datos y contenido digital.', cta: 'Ver cursos de Derecho', term: 'derecho', topics: [['Derecho digital', 'derecho digital'], ['Protección de datos', 'datos'], ['Contratos', 'contratos'], ['Propiedad intelectual', 'propiedad intelectual'], ['Ética y regulación de la IA', 'regulación']] },
  { id: 'tecnologia', tone: 'teal', icon: Laptop, title: 'Productividad y tecnología', text: 'Herramientas digitales y métodos para ordenar el trabajo y ahorrar tiempo en tareas repetitivas.', cta: 'Ver cursos de tecnología', term: 'tecnología', topics: [['Herramientas digitales', 'herramientas'], ['Organización del trabajo', 'productividad'], ['Tecnología aplicada', 'tecnología']] },
];
const LANDING_STRIP = [
  { icon: Video, title: 'Clases en video', text: 'Por secciones, sin horarios fijos' },
  { icon: FileText, title: 'Materiales por clase', text: 'PDF, archivos y enlaces del docente' },
  { icon: RefreshCw, title: 'Retoma donde quedaste', text: 'Tu progreso se guarda en tu cuenta' },
  { icon: Clock3, title: 'Acceso por curso', text: '45 días o indefinido, según el curso' },
];
const LANDING_STEPS = [
  { icon: Search, title: 'Explora', text: 'Busca en el catálogo por tema, categoría o nivel y revisa el contenido de cada curso antes de inscribirte.' },
  { icon: LogIn, title: 'Accede', text: 'Si el curso es gratuito, te inscribes al instante. Si tiene costo, pagas por transferencia y el equipo te asigna el acceso al validar el pago.' },
  { icon: CirclePlay, title: 'Aprende a tu ritmo', text: 'Mira las clases en video, descarga los materiales y retoma donde quedaste: tu progreso se guarda en tu cuenta.' },
];
const LANDING_EXPERIENCE = [
  { icon: Video, title: 'Clases por secciones', text: 'Cada curso se organiza en secciones y clases en video que ves cuando te convenga.' },
  { icon: FileText, title: 'Materiales en cada clase', text: 'El docente puede adjuntar PDF y otros archivos o enlaces de apoyo a cada clase.' },
  { icon: CheckCircle2, title: 'Marca y retoma', text: 'Marca tus clases completadas y vuelve al punto donde lo dejaste.' },
  { icon: LayoutDashboard, title: 'Panel Mi aprendizaje', text: 'Filtra tus cursos en curso, completados o por vencer y mira cuánto llevas de cada uno.' },
];
const LANDING_CRITERIA = [
  { icon: BrainCircuit, title: 'Inteligencia Artificial', items: ['Verifica siempre los resultados, datos y citas que genera una herramienta de IA antes de usarlos.', 'No pegues información confidencial o personal en una herramienta sin revisar sus condiciones de uso.', 'La IA apoya tu criterio profesional; no lo sustituye.'] },
  { icon: Scale, title: 'Derecho', items: ['Conoce la regulación aplicable y la protección de datos antes de automatizar un proceso.', 'Respeta la propiedad intelectual y atribuye las fuentes que utilices.', 'Contrasta lo aprendido con la normativa vigente de tu jurisdicción.'] },
];
const LANDING_FAQ = [
  { q: '¿Cómo accedo a un curso?', a: 'Crea tu cuenta, entra al curso que te interese y pulsa “Inscribirme ahora”. Los cursos gratuitos se activan al momento; en los de pago continúas al checkout.' },
  { q: '¿Necesito pagar para empezar?', a: 'No necesariamente. Cada curso muestra su precio antes de inscribirte y los cursos gratuitos se activan al momento.' },
  { q: '¿Cuánto dura el acceso?', a: 'Depende del curso. Cada docente define si el acceso dura 45 días o es indefinido, y lo verás en la página del curso y en el checkout. En Mi aprendizaje te avisamos cuando un acceso está por vencer.' },
  { q: '¿Cómo se paga?', a: 'Hoy el pago se hace por transferencia: el checkout te da una referencia única, un administrador valida el comprobante y te asigna el acceso. El pago con tarjeta todavía no está activo.' },
  { q: '¿Puedo descargar los materiales?', a: 'Sí, cuando el docente los adjunta. Cada clase puede incluir PDF u otros archivos y enlaces de apoyo.' },
  { q: '¿Qué pasa con mi progreso?', a: 'Se guarda en tu cuenta. Puedes cerrar sesión y volver más tarde para continuar desde la última clase.' },
];

// Revela con IntersectionObserver los elementos [data-reveal]. Sin soporte o con reduced-motion no se oculta nada.
function useReveal(dependency) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const pending = Array.from(root.querySelectorAll('[data-reveal]:not(.is-visible)'));
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) { pending.forEach((node) => node.classList.add('is-visible')); return undefined; }
    root.classList.add('lp-js');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    pending.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [dependency]);
  return ref;
}

const delay = (index, step = 90) => ({ '--d': `${index * step}ms` });

// Brillo que sigue al puntero (solo ratón; en táctil y reduced-motion no hace nada).
function trackPointer(event) {
  if (event.pointerType !== 'mouse') return;
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
}

function HeroMockup() {
  return <div className="lp-stage" aria-hidden="true">
    <span className="lp-stage-label">Vista ilustrativa</span>
    <div className="lp-chip lp-chip-a"><Sparkles size={14} />IA generativa</div>
    <div className="lp-chip lp-chip-b"><Scale size={14} />Derecho digital</div>
    <div className="lp-chip lp-chip-c"><ShieldCheck size={14} />Protección de datos</div>
    <div className="lp-window">
      <div className="lp-window-bar"><i /><i /><i /><span>Introducción a la IA generativa</span></div>
      <div className="lp-video">
        <svg className="lp-video-art" viewBox="0 0 400 190" preserveAspectRatio="xMidYMid slice" focusable="false">
          <defs>
            <linearGradient id="lpv-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3a2a8f" /><stop offset=".6" stopColor="#6c4cf1" /><stop offset="1" stopColor="#c0446f" /></linearGradient>
            <radialGradient id="lpv-b" cx=".8" cy=".1" r=".7"><stop offset="0" stopColor="#ffb4a2" stopOpacity=".55" /><stop offset="1" stopColor="#ffb4a2" stopOpacity="0" /></radialGradient>
          </defs>
          <rect width="400" height="190" fill="url(#lpv-a)" /><rect width="400" height="190" fill="url(#lpv-b)" />
          <g stroke="#fff" strokeOpacity=".28" strokeWidth="1.2" fill="none"><path d="M40 150 L110 90 L180 120 L260 55 L350 95" /><path d="M60 40 L130 70 L210 30 L300 140" /></g>
          <g fill="#fff" fillOpacity=".7"><circle cx="110" cy="90" r="4" /><circle cx="180" cy="120" r="4" /><circle cx="260" cy="55" r="4" /><circle cx="350" cy="95" r="4" /><circle cx="130" cy="70" r="3" /><circle cx="210" cy="30" r="3" /></g>
        </svg>
        <span className="lp-play"><Play size={22} fill="currentColor" /></span>
        <div className="lp-scrub"><i /></div>
      </div>
      <ul className="lp-lessons">
        <li className="is-done"><Check size={14} /><span>Clase 1 · Primeros pasos</span></li>
        <li className="is-now"><Play size={12} fill="currentColor" /><span>Clase 2 · Casos de uso reales</span></li>
        <li><i /><span>Clase 3 · Buenas prácticas</span></li>
      </ul>
    </div>
    <div className="lp-float lp-float-progress">
      <svg width="46" height="46" viewBox="0 0 46 46" focusable="false"><circle cx="23" cy="23" r="18" fill="none" strokeWidth="5" className="lp-ring-track" /><circle cx="23" cy="23" r="18" fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray="113" strokeDashoffset="38" transform="rotate(-90 23 23)" className="lp-ring-bar" /></svg>
      <div><strong>Progreso guardado</strong><span>Retoma donde quedaste</span></div>
    </div>
    <div className="lp-float lp-float-pdf">
      <span className="lp-float-icon"><FileText size={18} /></span>
      <div><strong>Material de la clase</strong><span>PDF adjunto</span></div>
    </div>
  </div>;
}

function LessonScreen() {
  return <div className="lp-screen" aria-hidden="true">
    <div className="lp-screen-main">
      <div className="lp-screen-video"><span className="lp-play"><Play size={20} fill="currentColor" /></span><div className="lp-scrub"><i /></div></div>
      <div className="lp-screen-meta"><span className="lp-pill"><Clock3 size={13} />Acceso de 45 días</span><span className="lp-pill lp-pill-alt"><InfinityIcon size={13} />o indefinido</span></div>
      <div className="lp-screen-lines"><i /><i /></div>
      <div className="lp-screen-file"><FileText size={16} /><span>Guía de la clase.pdf</span></div>
    </div>
    <div className="lp-screen-side">
      <div className="lp-screen-ring">
        <svg width="64" height="64" viewBox="0 0 64 64" focusable="false"><circle cx="32" cy="32" r="26" fill="none" strokeWidth="7" className="lp-ring-track" /><circle cx="32" cy="32" r="26" fill="none" strokeWidth="7" strokeLinecap="round" strokeDasharray="163" strokeDashoffset="60" transform="rotate(-90 32 32)" className="lp-ring-bar" /></svg>
        <span>Tu avance</span>
      </div>
      <ul>
        <li className="is-done"><Check size={13} />Sección 1</li>
        <li className="is-done"><Check size={13} />Sección 2</li>
        <li className="is-now"><Play size={11} fill="currentColor" />Sección 3</li>
        <li><i />Sección 4</li>
      </ul>
    </div>
  </div>;
}

function CourseSkeletons() {
  return <div className="lp-course-grid" aria-busy="true"><span className="sr-only" role="status">Cargando cursos…</span>{Array.from({ length: 3 }, (_, index) => <div className="lp-skel-card" key={index} aria-hidden="true"><div className="skeleton lp-skel-img" /><div className="lp-skel-body"><div className="skeleton lp-skel-line short" /><div className="skeleton lp-skel-line" /><div className="skeleton lp-skel-line mid" /></div></div>)}</div>;
}

function CoursesEmpty() {
  return <div className="lp-empty" data-reveal>
    <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true" focusable="false"><rect x="10" y="16" width="56" height="40" rx="9" fill="none" stroke="currentColor" strokeWidth="2.4" opacity=".55" /><path d="M32 29l15 7-15 7z" fill="currentColor" opacity=".8" /><path d="M22 64h32" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity=".4" /></svg>
    <h3>Estamos preparando los primeros cursos</h3>
    <p>Todavía no hay cursos publicados para mostrar aquí. Puedes crear tu cuenta y revisar el catálogo cuando se publiquen.</p>
    <div className="lp-empty-actions"><Link className="button button-primary" to="/explorar">Ver el catálogo <ArrowRight size={17} aria-hidden="true" /></Link></div>
  </div>;
}

function CoursesError({ onRetry }) {
  return <div className="lp-empty" role="alert">
    <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true" focusable="false"><circle cx="38" cy="38" r="24" fill="none" stroke="currentColor" strokeWidth="2.4" opacity=".55" /><path d="M38 26v14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><circle cx="38" cy="49" r="2.2" fill="currentColor" /></svg>
    <h3>No pudimos cargar los cursos ahora</h3>
    <p>Revisa tu conexión e inténtalo de nuevo. También puedes ir directo al catálogo.</p>
    <div className="lp-empty-actions"><button type="button" className="button button-primary" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" /> Reintentar</button><Link className="button button-secondary" to="/explorar">Ver el catálogo</Link></div>
  </div>;
}

export function LandingFooter() {
  return <footer className="lp-footer">
    <div className="container lp-footer-grid">
      <div className="lp-footer-brand">
        <Link className="brand" to="/"><span className="brand-mark"><Play size={17} fill="currentColor" aria-hidden="true" /></span><span className="brand-name">Streamly<span className="brand-sub">Academia</span></span></Link>
        <p>Cursos de IA, derecho y tecnología aplicada, en video y a tu ritmo.</p>
      </div>
      <nav aria-label="Explorar"><h2>Explorar</h2><ul><li><Link to="/explorar">Catálogo de cursos</Link></li><li><a href="#areas">Áreas de enfoque</a></li><li><a href="#cursos">Cursos disponibles</a></li><li><a href="#como-funciona">Cómo funciona</a></li></ul></nav>
      <nav aria-label="Tu cuenta"><h2>Tu cuenta</h2><ul><li><Link to="/login" state={{ mode: 'register' }}>Crear cuenta</Link></li><li><Link to="/login">Entrar</Link></li><li><a href="#preguntas">Preguntas frecuentes</a></li></ul></nav>
    </div>
    <div className="container lp-footer-bottom"><span>© Streamly Academia</span><span className="footer-credit"><Sparkles size={13} aria-hidden="true" />Streamly Academia by <strong>Gerald G</strong></span></div>
  </footer>;
}

export function LandingPage({ featured, promo = [], featuredError, onRetry, renderCourse }) {
  const ref = useReveal(`${featured === null ? 'loading' : featured.length}-${promo?.length || 0}`);
  const teachers = useMemo(() => {
    const seen = new Map();
    (featured || []).forEach((course) => { const name = course.instructorName || course.owner?.fullName; if (name && !seen.has(name)) seen.set(name, course.title); });
    return Array.from(seen, ([name, title]) => ({ name, title })).slice(0, 4);
  }, [featured]);
  const loading = featured === null && !featuredError;
  return <div className="landing" ref={ref}>
    <a className="sr-only lp-skip" href="#areas">Saltar al contenido</a>

    <section className="lp-hero" id="inicio" aria-labelledby="hero-title">
      <div className="lp-hero-bg" aria-hidden="true"><i className="lp-orb lp-orb-a" /><i className="lp-orb lp-orb-b" /><i className="lp-orb lp-orb-c" /><i className="lp-gridlines" /></div>
      <div className="container lp-hero-grid">
        <div className="lp-hero-copy" data-reveal>
          <span className="lp-eyebrow"><Sparkles size={15} aria-hidden="true" /> Cursos en video de IA y Derecho</span>
          <h1 id="hero-title">Aprende <span className="lp-grad">IA</span> y <span className="lp-grad">Derecho</span> con cursos que puedes aplicar en tu trabajo.</h1>
          <p className="lp-lead">Streamly Academia reúne cursos en video de inteligencia artificial, formación jurídica práctica y tecnología aplicada, impartidos por docentes especializados. Avanza a tu ritmo y retoma donde quedaste.</p>
          <div className="lp-actions"><Link className="button button-primary button-large lp-btn-glow" to="/login" state={{ mode: 'register' }}>Crear mi cuenta <ArrowRight size={18} aria-hidden="true" /></Link><Link className="button button-secondary button-large" to="/explorar">Explorar cursos</Link></div>
          <p className="lp-note">¿Ya tienes cuenta? <Link className="text-link" to="/login">Entrar</Link></p>
          <ul className="lp-facts" aria-label="Qué incluye cada curso">
            <li><Video size={15} aria-hidden="true" />Clases en video</li>
            <li><FileText size={15} aria-hidden="true" />Materiales por clase</li>
            <li><CheckCircle2 size={15} aria-hidden="true" />Progreso guardado</li>
            <li><Clock3 size={15} aria-hidden="true" />Acceso de 45 días o indefinido</li>
          </ul>
        </div>
        <div className="lp-hero-visual" data-reveal style={delay(2, 120)}><HeroMockup /></div>
      </div>
    </section>

    <section className="lp-strip-wrap" aria-label="Lo que ofrece la plataforma"><div className="container">
      <ul className="lp-strip" data-reveal>{LANDING_STRIP.map((item) => { const Icon = item.icon; return <li key={item.title}><span className="lp-strip-icon"><Icon size={19} aria-hidden="true" /></span><div><strong>{item.title}</strong><span>{item.text}</span></div></li>; })}</ul>
    </div></section>
    {promo?.length > 0 && <section className="lp-section lp-promo" id="portada" aria-labelledby="portada-title"><div className="container">
      <div className="lp-heading" data-reveal><span className="lp-kicker">Destacados</span><h2 id="portada-title">Cursos en portada</h2><p>Una mirada rápida a los cursos publicados. Toca una imagen para ver el curso.</p></div>
      <div className="lp-promo-frame" data-reveal><PromoGallery slides={promo} variant="landing" labelledBy="portada-title" /></div>
    </div></section>}
    <section className="lp-section" id="areas" aria-labelledby="areas-title"><div className="container">
      <div className="lp-heading" data-reveal><span className="lp-kicker">Áreas de enfoque</span><h2 id="areas-title">Tres áreas para aprender con criterio</h2><p>Elige un tema para ver en el catálogo los cursos publicados sobre él.</p></div>
      <div className="lp-bento">{LANDING_AREAS.map((area, index) => { const Icon = area.icon; return <article className={`lp-area lp-area-${area.id} tone-${area.tone}`} key={area.id} data-reveal style={delay(index)} onPointerMove={trackPointer}>
        <span className="lp-area-art" aria-hidden="true">{area.id === 'ia' && <svg viewBox="0 0 200 200" focusable="false"><g fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20 150h50l20-40h40l20-50h30" /><path d="M20 100h40l25-35h45l30 60h20" /><path d="M20 50h30l30 30h40" /></g><g fill="currentColor"><circle cx="70" cy="150" r="5" /><circle cx="90" cy="110" r="5" /><circle cx="130" cy="110" r="5" /><circle cx="150" cy="60" r="5" /><circle cx="85" cy="65" r="5" /><circle cx="125" cy="125" r="5" /></g></svg>}{area.id === 'derecho' && <svg viewBox="0 0 200 200" focusable="false"><g fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M100 28v140M60 168h80M42 62h116" /><path d="M42 62l-20 50a20 14 0 0 0 40 0zM158 62l-20 50a20 14 0 0 0 40 0z" /></g></svg>}{area.id === 'tecnologia' && <svg viewBox="0 0 200 200" focusable="false"><g fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="30" y="50" width="140" height="92" rx="10" /><path d="M16 160h168M70 82l-16 14 16 14M130 82l16 14-16 14M112 76l-24 40" /></g></svg>}</span>
        <div className="lp-area-head"><span className="lp-area-icon"><Icon size={24} aria-hidden="true" /></span><h3>{area.title}</h3></div>
        <p>{area.text}</p>
        <ul className="lp-topics" aria-label={`Temas de ${area.title}`}>{area.topics.map(([label, term]) => <li key={label}><Link to={`/explorar?buscar=${encodeURIComponent(term)}`}>{label}</Link></li>)}</ul>
        <Link className="lp-area-link" to={`/explorar?buscar=${encodeURIComponent(area.term)}`}>{area.cta} <ArrowRight size={16} aria-hidden="true" /></Link>
      </article>; })}</div>
    </div></section>

    <section className="lp-section lp-section-soft" id="cursos" aria-labelledby="courses-title"><div className="container">
      <div className="lp-heading lp-heading-row" data-reveal><div><span className="lp-kicker">Catálogo</span><h2 id="courses-title">Cursos disponibles ahora</h2><p>Cursos publicados por docentes de la plataforma.</p></div><Link className="text-link" to="/explorar">Ver todo el catálogo <ChevronRight size={17} aria-hidden="true" /></Link></div>
      {loading ? <CourseSkeletons /> : featuredError ? <CoursesError onRetry={onRetry} /> : featured?.length ? <div className="lp-course-grid">{featured.map((course, index) => <div className="lp-course-item" key={course.id} data-reveal style={delay(index % 3)}>{renderCourse(course)}</div>)}</div> : <CoursesEmpty />}
    </div></section>

    <section className="lp-section" id="como-funciona" aria-labelledby="how-title"><div className="container">
      <div className="lp-heading lp-heading-center" data-reveal><span className="lp-kicker">Cómo funciona</span><h2 id="how-title">De la búsqueda a la primera clase</h2><p>Tres pasos, sin horarios ni sesiones en vivo.</p></div>
      <ol className="lp-steps">{LANDING_STEPS.map((step, index) => { const Icon = step.icon; return <li className="lp-step" key={step.title} data-reveal style={delay(index, 120)}><span className="lp-step-num" aria-hidden="true">{index + 1}</span><span className="lp-step-icon"><Icon size={22} aria-hidden="true" /></span><h3>{step.title}</h3><p>{step.text}</p></li>; })}</ol>
    </div></section>

    <section className="lp-dark" id="experiencia" aria-labelledby="exp-title">
      <div className="lp-dark-bg" aria-hidden="true"><i className="lp-orb lp-orb-d" /><i className="lp-gridlines" /></div>
      <div className="container lp-exp">
        <div data-reveal>
          <span className="lp-kicker lp-kicker-light">Experiencia de aprendizaje</span>
          <h2 id="exp-title">Todo lo que necesitas para avanzar, en un mismo lugar</h2>
          <ul className="lp-exp-list">{LANDING_EXPERIENCE.map((item) => { const Icon = item.icon; return <li key={item.title}><span><Icon size={19} aria-hidden="true" /></span><div><h3>{item.title}</h3><p>{item.text}</p></div></li>; })}</ul>
        </div>
        <div data-reveal style={delay(2, 120)}><LessonScreen /><p className="lp-caption">Ilustración de la experiencia de aprendizaje.</p></div>
      </div>
    </section>

    {teachers.length > 0 && <section className="lp-section" id="docentes" aria-labelledby="teachers-title"><div className="container">
      <div className="lp-heading" data-reveal><span className="lp-kicker">Docentes</span><h2 id="teachers-title">Cursos creados por docentes</h2><p>Cada curso muestra el nombre de su docente, para que sepas quién lo imparte.</p></div>
      <ul className="lp-teachers">{teachers.map((teacher, index) => <li className="lp-teacher" key={teacher.name} data-reveal style={delay(index)}><Avatar name={teacher.name} size={48} /><div><strong>{teacher.name}</strong><span>Autor de “{teacher.title}”</span></div></li>)}</ul>
    </div></section>}

    <section className="lp-section lp-section-soft" id="criterio" aria-labelledby="criteria-title"><div className="container">
      <div className="lp-heading lp-heading-center" data-reveal><span className="lp-kicker">Enfoque práctico</span><h2 id="criteria-title">IA y Derecho, con criterio</h2><p>Aprender estas herramientas también es aprender a usarlas con responsabilidad. Estas son ideas de uso responsable que guían nuestro enfoque.</p></div>
      <div className="lp-criteria">{LANDING_CRITERIA.map((block, index) => { const Icon = block.icon; return <article className="lp-criteria-card" key={block.title} data-reveal style={delay(index, 120)}><div className="lp-criteria-head"><span><Icon size={20} aria-hidden="true" /></span><h3>{block.title}</h3></div><ul>{block.items.map((item) => <li key={item}><Check size={16} aria-hidden="true" /><span>{item}</span></li>)}</ul></article>; })}</div>
      <p className="lp-disclaimer" data-reveal><ShieldCheck size={16} aria-hidden="true" /> Contenido informativo, no constituye asesoría legal.</p>
    </div></section>

    <section className="lp-section" id="preguntas" aria-labelledby="faq-title"><div className="container lp-faq-wrap">
      <div className="lp-heading lp-heading-center" data-reveal><span className="lp-kicker">Preguntas frecuentes</span><h2 id="faq-title">Respuestas directas</h2><p>Sobre el acceso, los pagos y tu progreso.</p></div>
      <div className="lp-faq" data-reveal>{LANDING_FAQ.map((item) => <details className="lp-faq-item" name="faq" key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
        <details className="lp-faq-item" name="faq"><summary>¿Qué temas hay?</summary><p>Los cursos se agrupan en inteligencia artificial, derecho y tecnología. Revisa los publicados en el <Link className="text-link" to="/explorar">catálogo</Link> y filtra por categoría o nivel.</p></details>
      </div>
    </div></section>

    <section className="lp-cta" aria-labelledby="cta-title">
      <div className="lp-cta-bg" aria-hidden="true"><i className="lp-orb lp-orb-e" /><i className="lp-orb lp-orb-f" /><i className="lp-gridlines" /></div>
      <div className="container lp-cta-inner" data-reveal>
        <h2 id="cta-title">Empieza por el tema que más te sirva.</h2>
        <p>Crea tu cuenta, explora el catálogo y guarda tu avance curso a curso.</p>
        <div className="lp-actions lp-actions-center"><Link className="button lp-btn-white button-large" to="/login" state={{ mode: 'register' }}>Crear mi cuenta <ArrowRight size={18} aria-hidden="true" /></Link><Link className="button lp-btn-outline button-large" to="/explorar">Explorar cursos</Link></div>
        <small>Cada curso indica su tipo de acceso antes de inscribirte.</small>
      </div>
    </section>

    <LandingFooter />
  </div>;
}
