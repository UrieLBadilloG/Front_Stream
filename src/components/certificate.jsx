import { useCallback, useEffect, useRef, useState } from 'react';
import { Award, Download, Eye, Lock, LoaderCircle } from 'lucide-react';
import { useApp } from '../lib/app-context.js';
import { certificateShareLink } from '../lib/share-links.js';
import { apiAssetUrl } from '../services/api.js';
import { ConfirmDialog } from './dialogs.jsx';
import { LinkedInShare } from './linkedin-share.jsx';
import { ShareAchievement } from './share-achievement.jsx';

export const CERTIFICATE_FILENAME = 'Constancia-Mujer-LegalTech.pdf';
const NAME_MIN = 3;
const NAME_MAX = 80;
// Misma regla que el backend (validateRecipientName): letras, espacios, apóstrofes, guiones y puntos.
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}' .\-’]*$/u;

export function validateCertificateName(value) {
  const name = String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  if ([...name].length < NAME_MIN) return `El nombre debe tener al menos ${NAME_MIN} caracteres.`;
  if ([...name].length > NAME_MAX) return `El nombre no puede superar ${NAME_MAX} caracteres.`;
  if (!NAME_PATTERN.test(name)) return 'El nombre solo puede contener letras, espacios, apóstrofes, guiones y puntos.';
  return '';
}

function errorMessage(error) {
  switch (error?.status) {
    case 429: return 'Hiciste demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.';
    case 403: return error.message || 'Aún no cumples los requisitos para obtener la constancia.';
    case 404: return error.message || 'Este curso no emite constancia.';
    case 400: return error.message || 'Revisa el nombre e inténtalo de nuevo.';
    default: return error?.message || 'No se pudo generar la constancia. Inténtalo de nuevo.';
  }
}

function saveBlob(blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = CERTIFICATE_FILENAME; link.rel = 'noopener';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// "Compartir tu logro" de una constancia emitida: enlace /v/<código> (vista previa Open Graph) y la insignia para el menú nativo.
function IssuedShare({ info, courseId }) {
  const { download } = useApp();
  const code = info.certificateCode;
  // `download` cambia en cada render del proveedor: se guarda en una ref para que loadBadge sea estable (si no, se re-descargaría en bucle).
  const downloadRef = useRef(download);
  downloadRef.current = download;
  const loadBadge = useCallback(async () => (await downloadRef.current(`/api/certificates/badge/${encodeURIComponent(code)}.png`)).blob, [code]);
  if (!code) return null;
  return <ShareAchievement shareUrl={info.shareUrl || certificateShareLink(code, apiAssetUrl(''))} courseTitle={info.courseTitle || 'Mujer LegalTech'} loadBadge={loadBadge} idBase={`sa-${courseId}`} />;
}

// Bloque "Constancia" del curso. variant: 'player' (reproductor, oscuro) | 'card' (compacto, tarjeta) | 'editor'.
// manager=true muestra además "Vista previa" (solo si la API indica canPreview: dueño o super_admin).
// No renderiza nada si el curso no emite constancia.
export function CertificateBlock({ courseId, completedLessons = 0, totalLessons = 0, hasCertificate, manager = false, variant = 'player' }) {
  const { api, download, user, notify } = useApp();
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!hasCertificate || !user) return undefined;
    let cancelled = false;
    setLoadError(false);
    api(`/api/courses/${courseId}/certificate`).then((result) => { if (!cancelled) setInfo(result); }).catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [courseId, hasCertificate, user?.id, completedLessons]);

  if (!hasCertificate || !user) return null;
  if (info && info.available === false) return null;

  const done = info?.completedLessons ?? completedLessons;
  const total = info?.totalLessons ?? totalLessons;
  const issued = Boolean(info?.recipientName);
  const eligible = Boolean(info?.eligible);
  const canPreview = manager && Boolean(info?.canPreview);
  const showLearner = Boolean(info) && (info.enrolled || issued || !manager);
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const pendingQuizzes = Array.isArray(info?.pendingRequiredQuizzes) ? info.pendingRequiredQuizzes : [];

  const request = async (body) => {
    setBusy(true);
    try {
      const { blob } = await download(`/api/courses/${courseId}/certificate`, { method: 'POST', body });
      saveBlob(blob);
      return true;
    } catch (error) {
      const message = errorMessage(error);
      setSubmitError(message); notify(message);
      return false;
    } finally { setBusy(false); }
  };

  const openDialog = () => { setName(user.fullName || user.name || ''); setNameError(''); setSubmitError(''); setDialogOpen(true); };
  const closeDialog = () => { if (!busy) setDialogOpen(false); };

  const confirmName = async () => {
    const problem = validateCertificateName(name);
    if (problem) { setNameError(problem); return; }
    setNameError(''); setSubmitError('');
    const clean = name.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (await request({ recipientName: clean })) {
      setDialogOpen(false); notify('Tu constancia se descargó como PDF.');
      api(`/api/courses/${courseId}/certificate`).then(setInfo).catch(() => {});
    }
  };

  const downloadIssued = async () => { setSubmitError(''); if (await request({})) notify('Tu constancia se descargó como PDF.'); };
  const preview = async () => { setSubmitError(''); if (await request({ preview: true })) notify('Vista previa descargada. No se registró ninguna constancia.'); };

  const Spinner = <LoaderCircle className="button-spinner" size={16} aria-hidden="true" />;
  const heading = <div className="cert-head"><span className="cert-icon"><Award size={variant === 'card' ? 16 : 20} aria-hidden="true" /></span><div><h3 className="cert-title">Constancia</h3>{variant !== 'card' && <p className="cert-sub">Mujer LegalTech</p>}</div></div>;

  return <section className={`cert-block cert-${variant}`} aria-label="Constancia del curso" aria-busy={busy}>
    {heading}
    {!info && !loadError && <p className="cert-text" role="status">{Spinner} Consultando tu constancia…</p>}
    {loadError && !info && <p className="cert-text cert-error" role="alert">No se pudo consultar tu constancia.</p>}
    {info && showLearner && (issued
      ? <>
        <p className="cert-text">Emitida a nombre de <strong className="cert-name">{info.recipientName}</strong>.</p>
        <button type="button" className="button button-primary cert-button" onClick={() => void downloadIssued()} disabled={busy}>{busy ? <>{Spinner} Preparando…</> : <><Download size={16} aria-hidden="true" /> Descargar constancia</>}</button>
        <LinkedInShare info={info} courseId={courseId} />
        <IssuedShare info={info} courseId={courseId} />
      </>
      : eligible
        ? <>
          <p className="cert-text">¡Completaste el curso! Confirma tu nombre para generar tu constancia en PDF.</p>
          <button type="button" className="button button-primary cert-button" onClick={openDialog} disabled={busy}><Award size={16} aria-hidden="true" /> Obtener mi constancia</button>
        </>
        : <>
          <p className="cert-text"><Lock size={14} aria-hidden="true" /> {total && done >= total ? 'Completaste todas las clases, pero tu inscripción en este curso no está activa. Escríbenos para revisarlo.' : total ? `Completa las ${total} ${pendingQuizzes.length > 0 ? 'actividades' : 'clases'} para obtener tu constancia.` : 'Esta constancia se habilita al completar todas las clases.'}</p>
          {total > 0 && <div className="cert-progress"><div className="cert-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(done, total)} aria-label="Clases completadas"><i style={{ width: `${percent}%` }} /></div><span>{Math.min(done, total)} de {total} {pendingQuizzes.length > 0 ? 'actividades' : 'clases'}</span></div>}
          {pendingQuizzes.length > 0 && <div className="cert-text cert-pending"><p>Aprueba las evaluaciones obligatorias para obtener tu constancia:</p><ul>{pendingQuizzes.map((quiz) => <li key={quiz.id}>{quiz.title}</li>)}</ul></div>}
          <button type="button" className="button button-secondary cert-button" disabled aria-disabled="true"><Lock size={15} aria-hidden="true" /> Constancia bloqueada</button>
        </>)}
    {canPreview && <div className="cert-preview">
      <p className="cert-text">Como docente puedes ver cómo se verá la constancia. No se registra ni cuenta como emitida.</p>
      <button type="button" className="button button-secondary cert-button" onClick={() => void preview()} disabled={busy}>{busy && !dialogOpen ? <>{Spinner} Generando…</> : <><Eye size={16} aria-hidden="true" /> Vista previa</>}</button>
    </div>}
    {!dialogOpen && submitError && <p className="cert-text cert-error" role="alert">{submitError}</p>}
    {dialogOpen && <ConfirmDialog title="Confirma tu nombre" description="Así aparecerá en tu constancia. Revísalo con cuidado: una vez emitida no podrás cambiarlo por tu cuenta." confirmLabel="Generar y descargar" busy={busy} confirmDisabled={!name.trim()} onConfirm={() => void confirmName()} onCancel={closeDialog}>
      <div className="cert-dialog-field">
        <label htmlFor={`cert-name-${courseId}`}>Nombre completo</label>
        <input id={`cert-name-${courseId}`} data-autofocus type="text" value={name} maxLength={NAME_MAX + 20} autoComplete="name" disabled={busy} aria-invalid={Boolean(nameError)} aria-describedby={`cert-name-help-${courseId}`} onChange={(event) => { setName(event.target.value); setNameError(''); setSubmitError(''); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void confirmName(); } }} />
        <p id={`cert-name-help-${courseId}`} className="cert-help">Entre {NAME_MIN} y {NAME_MAX} caracteres: letras, espacios, apóstrofes, guiones y puntos.</p>
        {(nameError || submitError) && <p className="cert-error" role="alert">{nameError || submitError}</p>}
      </div>
    </ConfirmDialog>}
  </section>;
}
