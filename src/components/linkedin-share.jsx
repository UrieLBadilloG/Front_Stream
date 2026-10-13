import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Link as LinkIcon } from 'lucide-react';
import { useApp } from '../lib/app-context.js';
import { copyText } from '../lib/clipboard.js';
import { buildLinkedInAddUrl, certificationName, resolveVerifyUrl } from '../lib/linkedin.js';
import '../styles-share.css';

const BADGE_FILENAME = 'Insignia-Mujer-LegalTech.png';
const longDate = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
};

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.rel = 'noopener';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function CopyField({ id, label, value }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    if (await copyText(value)) { setCopied(true); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setCopied(false), 2200); }
  };
  return <div className="li-field">
    <label htmlFor={id}>{label}</label>
    <div className="li-field-row">
      <input id={id} type="text" readOnly value={value} onFocus={(event) => event.target.select()} />
      <button type="button" className="li-icon-button" onClick={() => void copy()} aria-label={`Copiar ${label.toLowerCase()}`}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}</button>
    </div>
    <span className="li-sr" role="status" aria-live="polite">{copied ? `${label} copiado` : ''}</span>
  </div>;
}

// Acciones para compartir una constancia YA emitida: añadir a LinkedIn, copiar el enlace y descargar la insignia.
export function LinkedInShare({ info, courseId }) {
  const { download, notify } = useApp();
  const [busy, setBusy] = useState(false);
  if (!info?.certificateCode) return null;

  const verifyUrl = resolveVerifyUrl(info, window.location.origin);
  const credentialName = certificationName(info.courseTitle || 'Mujer LegalTech');
  const issuer = info.issuer || 'Mujer LegalTech en México';
  const issued = longDate(info.issuedAt);
  const fieldId = (key) => `li-${key}-${courseId}`;

  const addToLinkedIn = () => {
    const url = buildLinkedInAddUrl({
      name: credentialName,
      organizationName: issuer,
      organizationId: import.meta.env.VITE_LINKEDIN_ORGANIZATION_ID,
      issuedAt: info.issuedAt,
      certUrl: verifyUrl,
      certId: info.certificateCode,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const copyLink = async () => notify((await copyText(verifyUrl)) ? 'Enlace de verificación copiado.' : 'No se pudo copiar el enlace. Cópialo desde “Datos para LinkedIn”.');
  const downloadBadge = async () => {
    setBusy(true);
    try {
      const { blob } = await download(`/api/certificates/badge/${encodeURIComponent(info.certificateCode)}.png`);
      saveBlob(blob, BADGE_FILENAME);
      notify('Tu insignia se descargó como imagen.');
    } catch (error) {
      notify(error?.message || 'No se pudo descargar la insignia.');
    } finally { setBusy(false); }
  };

  return <div className="li-share">
    <button type="button" className="button button-secondary li-button li-primary" onClick={addToLinkedIn}><ExternalLink size={16} aria-hidden="true" /> Añadir a LinkedIn</button>
    <button type="button" className="button button-secondary li-button" onClick={() => void copyLink()}><LinkIcon size={16} aria-hidden="true" /> Copiar enlace de verificación</button>
    <button type="button" className="button button-secondary li-button" onClick={() => void downloadBadge()} disabled={busy}><Download size={16} aria-hidden="true" /> {busy ? 'Descargando…' : 'Descargar insignia'}</button>
    <details className="li-details">
      <summary>Datos para LinkedIn</summary>
      <div className="li-fields">
        <CopyField id={fieldId('name')} label="Nombre" value={credentialName} />
        <CopyField id={fieldId('org')} label="Organización emisora" value={issuer} />
        {issued && <CopyField id={fieldId('date')} label="Fecha de emisión" value={issued} />}
        <CopyField id={fieldId('cert')} label="ID de credencial" value={info.certificateCode} />
        <CopyField id={fieldId('url')} label="URL de la credencial" value={verifyUrl} />
      </div>
      <p className="li-note">LinkedIn mostrará un enlace a la página de verificación de tu constancia. Si no se completan los datos automáticamente, ve a tu perfil &gt; Añadir sección &gt; Licencias y certificaciones y pega estos datos.</p>
    </details>
  </div>;
}
