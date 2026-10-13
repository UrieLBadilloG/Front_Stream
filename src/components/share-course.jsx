import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Link2, MessageCircle, Share2 } from 'lucide-react';

import { copyText } from '../lib/clipboard.js';
import { apiAssetUrl, apiRequest } from '../services/api.js';
import '../styles-share.css';

const trimSlash = (value) => String(value).replace(/\/+$/, '');

// Enlace directo a la página pública del curso (la ruta del frontend, sin vista previa para redes).
export function directCourseUrl(slug) {
  const origin = trimSlash(import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin);
  return `${origin}/curso/${slug}`;
}

// Enlace servido por el backend (GET /c/:slug) con Open Graph para WhatsApp, Facebook y LinkedIn.
export function previewCourseUrl(slug, config) {
  const base = trimSlash(config?.publicApiUrl || apiAssetUrl(''));
  return `${base}/c/${slug}`;
}

let configPromise = null;
function loadShareConfig() {
  if (!configPromise) {
    configPromise = apiRequest('/api/share/config').catch(() => {
      configPromise = null; // permite reintentar en otra visita
      return null;
    });
  }
  return configPromise;
}

// Config del backend (appUrl, publicApiUrl, previewAvailable), cacheada a nivel de módulo. Tolera errores (null).
export function useShareConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadShareConfig().then((result) => { if (!cancelled) setConfig(result); });
    return () => { cancelled = true; };
  }, []);
  return config;
}

const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';
const whatsappUrl = (title, url) => `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`;

// Copia con feedback: devuelve [clave copiada, copiar(clave, texto)].
function useCopyFeedback() {
  const [copied, setCopied] = useState('');
  const [failed, setFailed] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (key, text) => {
    const ok = await copyText(text);
    setFailed(!ok);
    setCopied(ok ? key : '');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setCopied(''); setFailed(false); }, 2500);
  };
  return { copied, failed, copy };
}

function LinkRow({ id, label, url, copied, onCopy, buttonLabel = 'Copiar enlace' }) {
  return (
    <div className="sh-row">
      <label className="sh-label" htmlFor={id}>{label}</label>
      <div className="sh-field">
        <input id={id} className="sh-input" type="text" readOnly value={url} onFocus={(event) => event.target.select()} />
        <button type="button" className="button button-secondary sh-copy" onClick={onCopy}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? 'Copiado' : buttonLabel}
        </button>
      </div>
    </div>
  );
}

export function ShareCourseBlock({ course, variant = 'editor' }) {
  const config = useShareConfig();
  const { copied, failed, copy } = useCopyFeedback();
  if (!course?.slug) return null;

  const compact = variant === 'compact';
  const idBase = `sh-${variant}-${course.id ?? course.slug}`;
  const url = directCourseUrl(course.slug);
  const previewUrl = previewCourseUrl(course.slug, config);
  const unpublished = Boolean(course.status) && course.status !== 'published';
  const previewReady = Boolean(config?.previewAvailable);

  const shareNative = async () => {
    try {
      await navigator.share({ title: course.title, text: course.title, url });
    } catch { /* el usuario canceló */ }
  };

  return (
    <section className={`sh-block sh-${compact ? 'compact' : 'editor'}`} aria-labelledby={`${idBase}-title`}>
      <h3 className="sh-title" id={`${idBase}-title`}><Link2 size={compact ? 15 : 18} aria-hidden="true" /> Compartir este curso</h3>
      {unpublished && <p className="sh-notice" role="note">Publica el curso para que el enlace funcione.</p>}
      <LinkRow id={`${idBase}-url`} label="Enlace directo" url={url} copied={copied === 'direct'} onCopy={() => copy('direct', url)} />
      <div className="sh-actions">
        <a className="button button-secondary sh-action" href={whatsappUrl(course.title, url)} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" /> Compartir por WhatsApp</a>
        {!compact && canNativeShare() && <button type="button" className="button button-secondary sh-action" onClick={shareNative}><Share2 size={16} aria-hidden="true" /> Compartir</button>}
      </div>
      {!compact && (
        <div className="sh-preview">
          <h4 className="sh-subtitle">Enlace con vista previa para redes</h4>
          <p className="sh-help">Úsalo en WhatsApp, Facebook o LinkedIn para que se vea la portada y el título.</p>
          <LinkRow id={`${idBase}-preview`} label="Enlace con vista previa" url={previewUrl} copied={copied === 'preview'} onCopy={() => copy('preview', previewUrl)} />
          {!previewReady && <p className="sh-notice" role="note">Disponible cuando el sitio esté publicado. Mientras tanto el enlace solo funciona desde tu computadora.</p>}
        </div>
      )}
      <p className="sh-live" role="status" aria-live="polite">{copied ? 'Enlace copiado' : failed ? 'No se pudo copiar. Selecciona el enlace y cópialo manualmente.' : ''}</p>
    </section>
  );
}

// Botón "Compartir" de la página pública: usa el menú nativo si existe; si no, copia el enlace.
export function ShareCourseButton({ title, url, className = 'button button-secondary' }) {
  const { copied, failed, copy } = useCopyFeedback();
  const onClick = async () => {
    if (canNativeShare()) {
      try { await navigator.share({ title, text: title, url }); return; } catch (error) { if (error?.name === 'AbortError') return; }
    }
    await copy('page', url);
  };
  return (
    <>
      <button type="button" className={className} onClick={onClick}>
        {copied ? <Check size={17} aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />}
        {copied ? 'Enlace copiado' : 'Compartir'}
      </button>
      <span className="sh-sr" role="status" aria-live="polite">{copied ? 'Enlace copiado' : failed ? 'No se pudo copiar el enlace.' : ''}</span>
    </>
  );
}
