import { useEffect, useRef, useState } from 'react';
import { Check, Link as LinkIcon, LoaderCircle } from 'lucide-react';
import { copyText } from '../lib/clipboard.js';
import {
  BADGE_FILENAME,
  facebookShareUrl,
  isPublicShareUrl,
  isShareCancel,
  linkedInShareUrl,
  nativeSharePayload,
  shareText,
} from '../lib/share-links.js';
import '../styles-share.css';

const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';
const COPIED = 'Enlace copiado';
const INSTAGRAM_URL = 'https://www.instagram.com/';
const NOTE_LOCAL = 'Facebook y LinkedIn solo pueden mostrar la vista previa cuando el sitio esté publicado en internet (HTTPS). Con localhost los botones abren la red social pero sin imagen.';
const INSTAGRAM_DESKTOP_HINT = 'Instagram no permite publicar desde un enlace. Descargamos tu insignia y copiamos el texto con el enlace: súbela en Instagram (app o instagram.com) y pega el texto en la descripción.';

// Logos sencillos (lucide-react no incluye logos de marcas).
function FacebookGlyph() {
  return <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M14 8.5V7c0-.7.3-1 1-1h1.8V3h-2.4C11.9 3 10.5 4.5 10.5 6.8v1.7h-2V12h2v9H14v-9h2.4l.5-3.5H14z" /></svg>;
}
function LinkedInGlyph() {
  return <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5.4 9.2h3v9.4h-3V9.2zm1.5-4.6a1.7 1.7 0 110 3.4 1.7 1.7 0 010-3.4zM10.4 9.2h2.9v1.3h.1c.4-.8 1.4-1.6 2.9-1.6 3.100 0 3.700 2 3.700 4.700v5h-3v-4.400c0-1.100 0-2.500-1.500-2.500s-1.800 1.200-1.800 2.400v4.500h-3V9.200z" /></svg>;
}
function InstagramGlyph() {
  return <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.500" y="3.500" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17.200" cy="6.800" r="1.200" fill="currentColor" /></svg>;
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name || BADGE_FILENAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Grupo "Compartir tu logro": SOLO Facebook, LinkedIn e Instagram (+ copiar enlace).
// `loadBadge` (opcional) devuelve un Blob PNG de la insignia; `badgeUrl` es la alternativa pública (página de verificación).
// `compact` = misma lista en la página pública de verificación (sin nota de localhost).
export function ShareAchievement({ shareUrl, courseTitle, loadBadge, badgeUrl, compact = false, idBase = 'sa', heading = 'Compartir tu logro' }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [igHint, setIgHint] = useState('');
  const timer = useRef(0);
  const text = shareText(courseTitle);
  const nativeAvailable = canNativeShare();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Descarga la insignia por adelantado: así navigator.share se invoca sin esperar red (conserva el gesto del usuario).
  useEffect(() => {
    if ((!loadBadge && !badgeUrl) || typeof File !== 'function') return undefined;
    let cancelled = false;
    const getBlob = loadBadge ? loadBadge() : fetch(badgeUrl).then((response) => (response.ok ? response.blob() : null));
    Promise.resolve(getBlob).then((blob) => { if (!cancelled && blob) setFile(new File([blob], BADGE_FILENAME, { type: 'image/png' })); }).catch(() => {});
    return () => { cancelled = true; };
  }, [loadBadge, badgeUrl]);

  if (!shareUrl) return null;

  const flash = (message) => {
    setStatus(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus(''), 2800);
  };
  const copyLink = async () => flash((await copyText(shareUrl)) ? COPIED : 'No se pudo copiar el enlace. Cópialo manualmente desde la barra de direcciones.');
  const openFacebook = () => window.open(facebookShareUrl(shareUrl), '_blank', 'noopener,noreferrer');
  const openLinkedIn = () => window.open(linkedInShareUrl(shareUrl), '_blank', 'noopener,noreferrer');

  // Instagram no tiene URL de compartir para web: en el celular se abre el menú nativo con la insignia (eliges Instagram);
  // en computadora se descarga la insignia, se copia el texto con el enlace y se abre Instagram.
  const shareInstagram = async () => {
    setBusy(true);
    setIgHint('');
    try {
      const canShareFile = nativeAvailable && file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      if (canShareFile) {
        await navigator.share(nativeSharePayload({ title: `Constancia: ${courseTitle}`, text, url: shareUrl, file, nav: navigator }));
      } else {
        if (file) downloadFile(file);
        await copyText(`${text} ${shareUrl}`);
        setIgHint(INSTAGRAM_DESKTOP_HINT);
        window.open(INSTAGRAM_URL, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      if (!isShareCancel(error)) flash('No se pudo abrir el menú de compartir. Usa “Copiar enlace para compartir”.');
    } finally { setBusy(false); }
  };

  const titleId = `${idBase}-title`;
  const publicUrl = isPublicShareUrl(shareUrl);
  return <div className={`sa-share${compact ? ' sa-compact' : ''}`} role="group" aria-labelledby={titleId}>
    <p className="sa-title" id={titleId}>{heading}</p>
    <button type="button" className="button sa-facebook" onClick={openFacebook} aria-label="Compartir en Facebook (se abre en una pestaña nueva)"><FacebookGlyph /> Compartir en Facebook</button>
    <button type="button" className="button sa-linkedin" onClick={openLinkedIn} aria-label="Compartir en LinkedIn (se abre en una pestaña nueva)"><LinkedInGlyph /> Compartir en LinkedIn</button>
    <button type="button" className="button sa-instagram" onClick={() => void shareInstagram()} disabled={busy} aria-label="Compartir en Instagram">{busy ? <LoaderCircle className="button-spinner" size={16} aria-hidden="true" /> : <InstagramGlyph />} Compartir en Instagram</button>
    {igHint && <p className="sa-note" role="status">{igHint}</p>}
    <button type="button" className="button button-secondary sa-button" onClick={() => void copyLink()}>{status === COPIED ? <Check size={16} aria-hidden="true" /> : <LinkIcon size={16} aria-hidden="true" />} {status === COPIED ? COPIED : 'Copiar enlace para compartir'}</button>
    {status && status !== COPIED && <p className="sa-note sa-fail" role="alert">{status}</p>}
    {!compact && !publicUrl && <p className="sa-note" role="note">{NOTE_LOCAL}</p>}
    <span className="sa-sr" role="status" aria-live="polite">{status === COPIED ? COPIED : ''}</span>
  </div>;
}
