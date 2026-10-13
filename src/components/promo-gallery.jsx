import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';

const AUTO_ADVANCE_MS = 6000;
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const prefersReducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(reducedMotionQuery).matches;

// Carrusel accesible de imágenes promocionales.
// slides: [{ id, url, alt, slug?, title?, category? }]. variant: 'landing' | 'detail'. Sin slides no renderiza nada.
export function PromoGallery({ slides, variant = 'landing', labelledBy, label = 'Cursos en portada' }) {
  const list = Array.isArray(slides) ? slides : [];
  const count = list.length;
  const regionId = useId();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [letterboxed, setLetterboxed] = useState({});
  const rootRef = useRef(null);

  // Si el usuario activa "reducir movimiento" mientras la página está abierta, se detiene el auto-avance.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(reducedMotionQuery);
    const onChange = () => { if (query.matches) setPlaying(false); };
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => { if (index >= count) setIndex(0); }, [count, index]);

  const advancing = playing && !hovered && !focused && count > 1;
  useEffect(() => {
    if (!advancing) return undefined;
    const timer = setInterval(() => setIndex((current) => (current + 1) % count), AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [advancing, count]);

  if (!count) return null;

  const go = (next) => setIndex(((next % count) + count) % count);
  const reduced = prefersReducedMotion();
  const handleKeyDown = (event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); }
  };

  return <section
    ref={rootRef}
    className={`promo-gallery promo-gallery-${variant}`}
    aria-roledescription="carrusel"
    aria-label={labelledBy ? undefined : label}
    aria-labelledby={labelledBy}
    onMouseEnter={() => setHovered(true)}
    onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onKeyDown={handleKeyDown}
  >
    <div className="promo-stage" id={regionId} aria-live={advancing ? 'off' : 'polite'}>
      {list.map((slide, position) => {
        const active = position === index;
        const alt = slide.alt || slide.title || 'Imagen promocional del curso';
        const image = <img src={slide.url} alt={alt} loading={position === 0 ? 'eager' : 'lazy'} decoding="async" draggable="false" onLoad={(event) => { const { naturalWidth, naturalHeight } = event.currentTarget; if (naturalHeight && Math.abs((naturalWidth / naturalHeight) / (16 / 9) - 1) > 0.02) setLetterboxed((current) => (current[slide.url] ? current : { ...current, [slide.url]: true })); }} />;
        return <div key={slide.id ?? position} className={`promo-slide${active ? ' is-active' : ''}${letterboxed[slide.url] ? ' is-letterboxed' : ''}`} role="group" aria-roledescription="diapositiva" aria-label={`${position + 1} de ${count}`} hidden={!active} style={{ '--promo-bg': `url(${JSON.stringify(slide.url)})` }}>
          {slide.slug
            ? <Link className="promo-slide-link" to={`/curso/${slide.slug}`} tabIndex={active ? 0 : -1}>
              {image}
              {variant === 'landing' && slide.title && <span className="promo-caption">{slide.category && <small>{slide.category}</small>}<strong>{slide.title}</strong><span className="promo-caption-cta">Ver curso →</span></span>}
            </Link>
            : <div className="promo-slide-link">{image}</div>}
        </div>;
      })}
      {count > 1 && <>
        <button type="button" className="promo-nav promo-prev" onClick={() => go(index - 1)} aria-label="Anterior" aria-controls={regionId}><ChevronLeft size={22} aria-hidden="true" /></button>
        <button type="button" className="promo-nav promo-next" onClick={() => go(index + 1)} aria-label="Siguiente" aria-controls={regionId}><ChevronRight size={22} aria-hidden="true" /></button>
      </>}
    </div>
    {count > 1 && <div className="promo-controls">
      {!reduced && <button type="button" className="promo-toggle" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pausar carrusel' : 'Reanudar carrusel'}>{playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}<span>{playing ? 'Pausar' : 'Reanudar'}</span></button>}
      <div className="promo-dots" role="group" aria-label="Seleccionar diapositiva">
        {list.map((slide, position) => <button type="button" key={slide.id ?? position} className={`promo-dot${position === index ? ' is-active' : ''}`} onClick={() => go(position)} aria-label={`Ir a la diapositiva ${position + 1} de ${count}`} aria-current={position === index ? 'true' : undefined}><span aria-hidden="true" /></button>)}
      </div>
    </div>}
  </section>;
}
