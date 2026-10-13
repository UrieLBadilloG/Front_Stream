import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BadgeCheck, Check, Copy, RefreshCw, SearchX } from 'lucide-react';
import { apiAssetUrl, apiRequest } from '../services/api.js';
import { copyText } from '../lib/clipboard.js';
import { certificateShareLink } from '../lib/share-links.js';
import { ShareAchievement } from './share-achievement.jsx';
import { useShareConfig } from './share-course.jsx';
import '../styles-share.css';

// Misma regla que el backend (CERTIFICATE_CODE_PATTERN): prefijo + 1-3 grupos, solo A-Z/0-9, máx. 32.
const CODE_PATTERN = /^[A-Z0-9]{2,8}(?:-[A-Z0-9]{3,8}){1,3}$/;
const normalizeCode = (value) => String(value ?? '').trim().toUpperCase();
const isValidCode = (value) => value.length <= 32 && CODE_PATTERN.test(value);
const NOT_FOUND = 'No encontramos una constancia con ese código.';

const longDate = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
};

function useNoIndex(title) {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    const previous = document.title;
    document.title = title;
    return () => { meta.remove(); document.title = previous; };
  }, [title]);
}

function CodeForm({ initial = '', autoFocus = false }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const submit = (event) => {
    event.preventDefault();
    const code = normalizeCode(value);
    if (!isValidCode(code)) { setError('Escribe un código válido, por ejemplo MLT-ABCD-EF23.'); return; }
    setError('');
    navigate(`/verificar/${encodeURIComponent(code)}`);
  };
  return <form className="vf-form" onSubmit={submit} noValidate>
    <label htmlFor="vf-code">Código de la constancia</label>
    <div className="vf-form-row">
      <input id="vf-code" type="text" value={value} autoFocus={autoFocus} autoComplete="off" autoCapitalize="characters" spellCheck="false" maxLength={40} placeholder="MLT-ABCD-EF23" aria-invalid={Boolean(error)} aria-describedby={error ? 'vf-code-error' : undefined} onChange={(event) => { setValue(event.target.value.toUpperCase()); setError(''); }} />
      <button type="submit" className="button button-primary">Verificar</button>
    </div>
    {error && <p id="vf-code-error" className="vf-error" role="alert">{error}</p>}
  </form>;
}

function CopyId({ code }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    if (await copyText(code)) { setCopied(true); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setCopied(false), 2200); }
  };
  return <>
    <button type="button" className="vf-copy" onClick={() => void copy()} aria-label="Copiar ID de credencial">{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {copied ? 'Copiado' : 'Copiar'}</button>
    <span className="vf-sr" role="status" aria-live="polite">{copied ? 'ID copiado' : ''}</span>
  </>;
}

function Detail({ label, children }) {
  return <div className="vf-detail"><dt>{label}</dt><dd>{children}</dd></div>;
}

function ValidResult({ data, code }) {
  const [badgeHidden, setBadgeHidden] = useState(false);
  const config = useShareConfig();
  const shareUrl = certificateShareLink(code, config?.publicApiUrl || apiAssetUrl(''));
  return <article className="vf-card vf-valid" aria-labelledby="vf-valid-title">
    <div className="vf-seal"><BadgeCheck size={20} aria-hidden="true" /> <span id="vf-valid-title">Constancia auténtica</span></div>
    <div className="vf-main">
      <div className="vf-who">
        <p className="vf-kicker">Se otorga a</p>
        <h1 className="vf-name">{data.recipientName}</h1>
        <p className="vf-course">por completar <strong>{data.courseTitle}</strong></p>
      </div>
      {!badgeHidden && <img className="vf-badge" src={apiAssetUrl(`/api/certificates/badge/${encodeURIComponent(code)}.png`)} alt="Insignia Mujer LegalTech en México" width="150" height="150" onError={() => setBadgeHidden(true)} />}
    </div>
    <dl className="vf-details">
      <Detail label="Fecha de emisión">{longDate(data.issuedAt)}</Detail>
      {data.durationHours ? <Detail label="Duración">{data.durationHours} horas</Detail> : null}
      {data.modality ? <Detail label="Modalidad">{data.modality}</Detail> : null}
      <Detail label="Emisor">{data.issuer}</Detail>
      {data.instructorName ? <Detail label="Docente">{data.instructorName}</Detail> : null}
      <Detail label="ID de credencial"><span className="vf-code">{data.certificateCode}</span> <CopyId code={data.certificateCode} /></Detail>
    </dl>
    <ShareAchievement compact shareUrl={shareUrl} courseTitle={data.courseTitle} badgeUrl={apiAssetUrl(`/api/certificates/badge/${encodeURIComponent(code)}.png`)} idBase="vf-share" heading="Compartir esta constancia" />
  </article>;
}

export function VerifyPage() {
  const { codigo } = useParams();
  const raw = codigo ? normalizeCode(codigo) : '';
  const [state, setState] = useState({ status: raw ? 'loading' : 'idle', data: null, message: '' });
  const [attempt, setAttempt] = useState(0);
  useNoIndex(raw ? `Verificar constancia ${raw}` : 'Verificar constancia');

  useEffect(() => {
    if (!raw) { setState({ status: 'idle', data: null, message: '' }); return undefined; }
    if (!isValidCode(raw)) { setState({ status: 'invalid', data: null, message: NOT_FOUND }); return undefined; }
    let cancelled = false;
    setState({ status: 'loading', data: null, message: '' });
    apiRequest(`/api/certificates/verify/${encodeURIComponent(raw)}`)
      .then((data) => { if (!cancelled) setState({ status: 'valid', data, message: '' }); })
      .catch((error) => {
        if (cancelled) return;
        if (error?.status === 404) setState({ status: 'invalid', data: null, message: NOT_FOUND });
        else if (error?.status === 429) setState({ status: 'error', data: null, message: 'Hiciste demasiadas consultas. Espera un minuto e inténtalo de nuevo.' });
        else setState({ status: 'error', data: null, message: 'No pudimos consultar la constancia. Revisa tu conexión e inténtalo de nuevo.' });
      });
    return () => { cancelled = true; };
  }, [raw, attempt]);

  return <main className="vf-page">
    <div className="vf-wrap">
      {state.status === 'idle' && <section className="vf-card" aria-labelledby="vf-title">
        <p className="vf-kicker">Verificación de constancias</p>
        <h1 id="vf-title" className="vf-title">Verifica una constancia</h1>
        <p className="vf-text">Escribe el código que aparece en la constancia para comprobar que es auténtica.</p>
        <CodeForm autoFocus />
      </section>}
      {state.status === 'loading' && <section className="vf-card" aria-busy="true" aria-live="polite">
        <p className="vf-sr" role="status">Verificando constancia…</p>
        <div className="vf-skeleton" aria-hidden="true"><i /><i /><i /><i /></div>
      </section>}
      {state.status === 'valid' && <ValidResult data={state.data} code={raw} />}
      {state.status === 'invalid' && <section className="vf-card vf-invalid" aria-labelledby="vf-invalid-title">
        <span className="vf-icon" aria-hidden="true"><SearchX size={26} /></span>
        <h1 id="vf-invalid-title" className="vf-title" role="alert">{state.message}</h1>
        <p className="vf-text">Revisa que el código esté completo, tal como aparece en la constancia.</p>
        <CodeForm initial={raw} />
        <Link className="vf-link" to="/">Ir al inicio</Link>
      </section>}
      {state.status === 'error' && <section className="vf-card vf-invalid" aria-labelledby="vf-error-title">
        <h1 id="vf-error-title" className="vf-title" role="alert">{state.message}</h1>
        <button type="button" className="button button-primary" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={16} aria-hidden="true" /> Reintentar</button>
        <Link className="vf-link" to="/">Ir al inicio</Link>
      </section>}
    </div>
  </main>;
}
