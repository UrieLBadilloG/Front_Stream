import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Award, CircleAlert, Eye, EyeOff, FileText, Infinity as InfinityIcon, LoaderCircle, Lock, Mail, Play, ShieldCheck, TriangleAlert, User, Video } from 'lucide-react';
import { useApp } from '../lib/app-context.js';
import { safeNextPath } from '../lib/next-path.js';
import { ProgressRing } from './ui.jsx';
import '../styles-auth.css';

// Límites que exige el backend (auth.routes.js): nombre 2–120, contraseña 10–128.
const NAME_MAX = 120;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u;

const normalizeName = (value) => value.replace(/\s+/g, ' ').trim();

export function validateFullName(value) {
  const name = normalizeName(value);
  if (!name) return 'Ingresa tu nombre completo.';
  if (name.length > NAME_MAX) return `El nombre puede tener hasta ${NAME_MAX} caracteres.`;
  if (!NAME_PATTERN.test(name)) return 'Usa solo letras, espacios, apóstrofes, puntos o guiones.';
  const words = name.split(' ');
  if (words.length < 2 || !words.every((word) => /\p{L}/u.test(word))) return 'Escribe tu nombre y al menos un apellido.';
  return '';
}

const validateEmail = (value) => {
  const email = value.trim();
  if (!email) return 'Ingresa tu correo electrónico.';
  if (!EMAIL_PATTERN.test(email)) return 'Ingresa un correo válido, por ejemplo tu@correo.com.';
  return '';
};

// Nivel 1–4 calculado con el requisito real del backend (mínimo 10 caracteres) más variedad y largo.
export function passwordStrength(password) {
  if (!password) return { level: 0, label: '' };
  if (password.length < PASSWORD_MIN) return { level: 1, label: 'Muy corta' };
  const variety = [/\p{Ll}/u, /\p{Lu}/u, /\d/, /[^\p{L}\d]/u].filter((test) => test.test(password)).length;
  const points = variety + (password.length >= 14 ? 1 : 0);
  if (points <= 2) return { level: 2, label: 'Aceptable' };
  if (points === 3) return { level: 3, label: 'Buena' };
  return { level: 4, label: 'Fuerte' };
}

function FieldShell({ id, label, optional, help, error, children }) {
  const describedBy = [help ? `${id}-help` : '', `${id}-error`].filter(Boolean).join(' ');
  return (
    <div className={`au-field ${error ? 'has-error' : ''}`}>
      <label className="au-label" htmlFor={id}>{label}{optional && <small> (opcional)</small>}</label>
      {children(describedBy)}
      {help && <p className="au-help" id={`${id}-help`}>{help}</p>}
      <div className="au-msg" id={`${id}-error`} aria-live="polite">{error && <><CircleAlert size={14} aria-hidden="true" /><span>{error}</span></>}</div>
    </div>
  );
}

function TextField({ id, label, icon: Icon, help, error, inputRef, ...inputProps }) {
  return (
    <FieldShell id={id} label={label} help={help} error={error}>
      {(describedBy) => (
        <div className="au-control">
          <Icon className="au-icon" size={18} aria-hidden="true" />
          <input className="au-input" id={id} ref={inputRef} aria-invalid={error ? 'true' : 'false'} aria-describedby={describedBy} {...inputProps} />
        </div>
      )}
    </FieldShell>
  );
}

export function PasswordField({ id, label, optional, help, error, inputRef, children, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const localRef = useRef(null);
  const selection = useRef(null);
  const setRefs = (node) => { localRef.current = node; if (typeof inputRef === 'function') inputRef(node); else if (inputRef) inputRef.current = node; };

  // Conserva cursor y selección al alternar entre password y text.
  useEffect(() => {
    const input = localRef.current;
    const saved = selection.current;
    if (!input || !saved || document.activeElement !== input) return;
    input.setSelectionRange(saved.start, saved.end, saved.direction || 'none');
  }, [visible]);

  const toggle = () => {
    const input = localRef.current;
    if (input) selection.current = { start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length, direction: input.selectionDirection };
    setVisible((current) => !current);
  };
  const trackCaps = (event) => setCapsOn(Boolean(event.getModifierState?.('CapsLock')));

  return (
    <FieldShell id={id} label={label} optional={optional} help={help} error={error}>
      {(describedBy) => (
        <>
          <div className="au-control">
            <Lock className="au-icon" size={18} aria-hidden="true" />
            <input className="au-input au-input-password" id={id} ref={setRefs} type={visible ? 'text' : 'password'} aria-invalid={error ? 'true' : 'false'} aria-describedby={describedBy} autoCapitalize="off" autoCorrect="off" spellCheck="false" onKeyDown={trackCaps} onKeyUp={trackCaps} onBlurCapture={() => setCapsOn(false)} {...inputProps} />
            <button className="au-eye" type="button" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible} onMouseDown={(event) => { if (document.activeElement === localRef.current) event.preventDefault(); }} onClick={toggle}>
              {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          <div className="au-caps" role="status">{capsOn && <><TriangleAlert size={14} aria-hidden="true" /><span>Bloq Mayús está activado.</span></>}</div>
          {children}
        </>
      )}
    </FieldShell>
  );
}

function StrengthMeter({ password }) {
  const { level, label } = passwordStrength(password);
  return (
    <div className="au-strength" data-level={level}>
      <div className="au-strength-bars" aria-hidden="true">{[1, 2, 3, 4].map((step) => <span key={step} className={step <= level ? 'on' : ''} />)}</div>
      <p aria-live="polite">{label ? `Seguridad: ${label}` : ''}</p>
    </div>
  );
}

function BrandPanel({ mode }) {
  return (
    <aside className="au-brand" aria-label="Streamly Academia">
      <div className="au-brand-glow" aria-hidden="true" />
      <Link className="au-logo" to="/"><span className="au-logo-mark"><Play size={17} fill="currentColor" aria-hidden="true" /></span><span>Streamly <b>Academia</b></span></Link>
      <div className="au-brand-copy">
        <h2>{mode === 'login' ? 'Retoma tu aprendizaje donde lo dejaste.' : 'Crea tu cuenta y guarda tu avance, curso a curso.'}</h2>
        <ul className="au-benefits">
          <li><span><Video size={18} aria-hidden="true" /></span><div><strong>Clases en video con progreso guardado</strong><small>Vuelve a la última clase que viste.</small></div></li>
          <li><span><FileText size={18} aria-hidden="true" /></span><div><strong>Materiales descargables por clase</strong><small>Documentos y recursos junto a cada lección.</small></div></li>
          <li><span><InfinityIcon size={18} aria-hidden="true" /></span><div><strong>Acceso por 45 días o indefinido</strong><small>Cada curso indica el suyo antes de inscribirte.</small></div></li>
        </ul>
      </div>
      <div className="au-mock" aria-hidden="true">
        <div className="au-mock-card">
          <div className="au-mock-cover"><Play size={22} fill="currentColor" /></div>
          <div className="au-mock-body">
            <div className="au-mock-lines"><i /><i /></div>
            <ProgressRing value={68} size={52} stroke={6} label="Ejemplo de progreso" />
          </div>
          <div className="au-mock-chips"><span><FileText size={12} /> Materiales</span><span><Award size={12} /> Constancia en cursos que la ofrecen</span></div>
        </div>
      </div>
    </aside>
  );
}

export function AuthPage() {
  const { login, register, notify } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  // Ruta de retorno validada: `siguiente` en la URL o, para los flujos existentes, location.state.from.
  const nextPath = safeNextPath(params.get('siguiente')) ?? safeNextPath(location.state?.from);
  const [mode, setMode] = useState(params.get('modo') === 'registro' || location.state?.mode === 'register' ? 'register' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);
  const isRegister = mode === 'register';
  const nextNote = !nextPath ? '' : nextPath.startsWith('/pago/') ? 'Después de entrar continuarás con tu compra.' : nextPath.includes('accion=inscribir') ? 'Después de entrar te inscribiremos al curso.' : '';

  useEffect(() => { (mode === 'register' ? nameRef : emailRef).current?.focus(); }, [mode]);

  const errors = {
    name: isRegister ? validateFullName(name) : '',
    email: validateEmail(email),
    password: !password ? (isRegister ? 'Crea una contraseña.' : 'Ingresa tu contraseña.')
      : isRegister && password.length < PASSWORD_MIN ? `Usa al menos ${PASSWORD_MIN} caracteres.`
      : password.length > PASSWORD_MAX ? `Usa ${PASSWORD_MAX} caracteres como máximo.` : '',
    confirm: isRegister && confirm && confirm !== password ? 'Las contraseñas no coinciden.' : '',
  };
  const visibleError = (field) => (touched[field] || attempted ? errors[field] : '');
  const touch = (field) => () => setTouched((current) => ({ ...current, [field]: true }));
  const edit = (setter) => (event) => { setter(event.target.value); if (formError) setFormError(''); };

  const switchMode = () => {
    setMode(isRegister ? 'login' : 'register');
    setParams((current) => { const updated = new URLSearchParams(current); updated.set('modo', isRegister ? 'login' : 'registro'); return updated; }, { replace: true, state: location.state });
    setFormError(''); setTouched({}); setAttempted(false); setPassword(''); setConfirm('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setFormError(''); setAttempted(true);
    const order = [['name', nameRef], ['email', emailRef], ['password', passwordRef], ['confirm', confirmRef]];
    const firstInvalid = order.find(([field]) => errors[field]);
    if (firstInvalid) { firstInvalid[1].current?.focus(); return; }
    setSubmitting(true);
    try {
      const credentials = { email: email.trim(), password };
      const currentUser = isRegister ? await register({ fullName: normalizeName(name), ...credentials }) : await login(credentials);
      notify(`Bienvenido, ${currentUser.fullName}.`);
      navigate(nextPath || '/mi-aprendizaje', { replace: true });
    } catch (error) {
      setFormError(error.message || 'No se pudo completar la solicitud. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="au-page">
      <BrandPanel mode={mode} />
      <section className="au-side">
        <form className="au-card" onSubmit={submit} noValidate aria-busy={submitting}>
          <header className="au-head">
            <span className="au-pill"><ShieldCheck size={14} aria-hidden="true" /> Streamly Academia</span>
            <h1>{isRegister ? 'Empieza hoy' : 'Qué gusto verte'}</h1>
            <p>{isRegister ? 'Crea tu cuenta y guarda tu progreso.' : 'Entra para continuar donde lo dejaste.'}</p>
          </header>
          {nextNote && <p className="au-next" role="status"><ArrowRight size={14} aria-hidden="true" /><span>{nextNote}</span></p>}
          {formError && <div className="au-alert" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{formError}</span></div>}
          {isRegister && (
            <TextField id="au-name" label="Nombre completo" icon={User} inputRef={nameRef} value={name} onChange={edit(setName)} onBlur={touch('name')} placeholder="Ej. María Fernanda López García" autoComplete="name" autoCapitalize="words" maxLength={NAME_MAX} required help="Así aparecerá en tus constancias." error={visibleError('name')} />
          )}
          <TextField id="au-email" label="Correo electrónico" icon={Mail} inputRef={emailRef} type="email" inputMode="email" autoComplete="email" autoCapitalize="off" autoCorrect="off" spellCheck="false" value={email} onChange={edit(setEmail)} onBlur={touch('email')} placeholder="tu@correo.com" required error={visibleError('email')} />
          <PasswordField id="au-password" label="Contraseña" inputRef={passwordRef} value={password} onChange={edit(setPassword)} onBlur={touch('password')} autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder={isRegister ? `Mínimo ${PASSWORD_MIN} caracteres` : 'Tu contraseña'} required help={isRegister ? `Usa al menos ${PASSWORD_MIN} caracteres. Mezclar mayúsculas, números y símbolos la hace más segura.` : ''} error={visibleError('password')}>
            {isRegister && <StrengthMeter password={password} />}
          </PasswordField>
          {isRegister && (
            <PasswordField id="au-confirm" label="Confirmar contraseña" optional inputRef={confirmRef} value={confirm} onChange={edit(setConfirm)} onBlur={touch('confirm')} autoComplete="new-password" placeholder="Repite tu contraseña" error={visibleError('confirm')} />
          )}
          <button className="au-submit" type="submit" disabled={submitting}>
            {submitting ? <><LoaderCircle className="button-spinner" size={18} aria-hidden="true" /> {isRegister ? 'Creando tu cuenta…' : 'Validando…'}</> : <>{isRegister ? 'Crear mi cuenta' : 'Entrar a Streamly Academia'} <ArrowRight size={18} aria-hidden="true" /></>}
          </button>
          <div className="au-switch">{isRegister ? '¿Ya tienes cuenta?' : '¿Primera vez?'} <button type="button" onClick={switchMode}>{isRegister ? 'Iniciar sesión' : 'Crear cuenta'}</button></div>
          <p className="au-trust"><Lock size={13} aria-hidden="true" /> Tus datos se usan solo para administrar tu cuenta y tu progreso.</p>
          <Link className="au-back" to="/"><ArrowLeft size={14} aria-hidden="true" /> Volver al inicio</Link>
        </form>
      </section>
    </main>
  );
}
