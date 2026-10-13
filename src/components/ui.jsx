import { useEffect, useId, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, Infinity as InfinityIcon, Lock, PlayCircle, Sparkles, Users } from 'lucide-react';
import { MAX_ACCESS_DAYS, MIN_ACCESS_DAYS, accessDaysError, avatarHue, expiryCopy, formatShortDate, initials, learnerAccessChip } from '../lib/access.js';

const toneColors = { primary: ['#6c4cf1', '#ff7b62'], ok: ['#0b9d70', '#5fe0ad'], warn: ['#d98a00', '#ffc56b'], danger: ['#c4253f', '#ff8fa3'], muted: ['#9a94b3', '#b9b4cc'] };

// Anillo de progreso SVG con gradiente y transición de stroke-dashoffset.
export function ProgressRing({ value = 0, size = 56, stroke = 6, tone = 'primary', label }) {
  const gradientId = useId();
  const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const [drawn, setDrawn] = useState(0);
  useEffect(() => { const frame = requestAnimationFrame(() => setDrawn(percent)); return () => cancelAnimationFrame(frame); }, [percent]);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const [from, to] = toneColors[tone] || toneColors.primary;
  return (
    <div className="progress-ring" style={{ width: size, height: size }} role="img" aria-label={label || `${percent} % completado`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={from} /><stop offset="100%" stopColor={to} /></linearGradient></defs>
        <circle className="progress-ring-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} />
        <circle className="progress-ring-bar" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} stroke={`url(#${gradientId})`} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - drawn / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="progress-ring-value" style={{ fontSize: Math.max(11, Math.round(size * (size >= 90 ? 0.26 : percent >= 100 ? 0.22 : 0.27))) }}>{percent}{size >= 90 ? <small>%</small> : '%'}</span>
    </div>
  );
}

const statusMeta = {
  not_started: { label: 'Sin empezar', Icon: CircleDashed, tone: 'muted' },
  in_progress: { label: 'En curso', Icon: PlayCircle, tone: 'primary' },
  active: { label: 'Activo', Icon: Users, tone: 'ok' },
  current: { label: 'Vigente', Icon: CheckCircle2, tone: 'ok' },
  completed: { label: 'Completado', Icon: CheckCircle2, tone: 'ok' },
  expiring: { label: 'Por vencer', Icon: Clock3, tone: 'warn' },
  expired: { label: 'Expirado', Icon: Lock, tone: 'danger' },
  inactive: { label: 'Inactivo', Icon: AlertTriangle, tone: 'warn' },
};

export const statusLabel = (status) => (statusMeta[status] || statusMeta.active).label;

// El estado nunca se comunica solo con color: siempre icono + texto.
export function StatusBadge({ status }) {
  const { label, Icon, tone } = statusMeta[status] || statusMeta.active;
  return <span className={`status-badge status-${tone}`}><Icon size={13} aria-hidden="true" />{label}</span>;
}

// Chip de acceso para el alumno (vence en N días / de por vida / venció el …). Icono + texto.
export function AccessChip({ item }) {
  const { text, tone, icon } = learnerAccessChip(item);
  const Icon = icon === 'infinity' ? InfinityIcon : icon === 'lock' ? Lock : Clock3;
  const title = item?.hasLimit && item?.expiresAt ? `${expiryCopy(item).text} · ${formatShortDate(item.expiresAt)}` : undefined;
  return <span className={`access-chip access-chip-${tone}`} title={title}><Icon size={13} aria-hidden="true" />{text}</span>;
}

export function Avatar({ name, size = 38 }) {
  const hue = avatarHue(name);
  return <span className="person-avatar" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: `linear-gradient(135deg, hsl(${hue} 70% 42%), hsl(${(hue + 40) % 360} 70% 34%))` }}>{initials(name)}</span>;
}

const presets = [45, 90, 180];

// Control de política de acceso. value: { mode: 'limited'|'unlimited', days: string }
export function AccessPolicyField({ value, onChange, disabled = false, error = '' }) {
  const uid = useId();
  const helpId = `${uid}-help`; const errorId = `${uid}-error`;
  const mode = value?.mode === 'unlimited' ? 'unlimited' : 'limited';
  const days = String(value?.days ?? '');
  // Validación en vivo: el navegador bloquea el envío con min/max antes de onSubmit, así el error siempre es visible.
  const shownError = error || (mode === 'limited' && days !== '' ? accessDaysError(days) : '');
  const matchesPreset = presets.some((preset) => String(preset) === days);
  const setMode = (nextMode) => onChange({ ...value, mode: nextMode });
  return (
    <div className="access-policy">
      <span className="access-policy-title" id={`${uid}-label`}>Política de acceso</span>
      <div className="access-segmented" role="radiogroup" aria-labelledby={`${uid}-label`}>
        {[['limited', 'Limitado'], ['unlimited', 'Indefinido']].map(([key, text]) => (
          <button key={key} type="button" role="radio" aria-checked={mode === key} disabled={disabled} className={mode === key ? 'active' : ''} onClick={() => setMode(key)}>{text}</button>
        ))}
      </div>
      {mode === 'limited' && (
        <div className="access-days">
          <div className="access-chips" role="group" aria-label="Atajos de días">
            {presets.map((preset) => (
              <button key={preset} type="button" disabled={disabled} aria-pressed={days === String(preset)} className={days === String(preset) ? 'active' : ''} onClick={() => onChange({ ...value, mode: 'limited', days: String(preset) })}>{preset} días</button>
            ))}
            {!matchesPreset && days !== '' && <span className="access-custom-tag">Personalizado</span>}
          </div>
          <label className="access-days-input">
            <span>Días</span>
            <input type="number" inputMode="numeric" min={MIN_ACCESS_DAYS} max={MAX_ACCESS_DAYS} step={1} value={days} disabled={disabled} aria-invalid={Boolean(shownError)} aria-describedby={`${helpId}${shownError ? ` ${errorId}` : ''}`} onChange={(event) => onChange({ ...value, mode: 'limited', days: event.target.value })} />
          </label>
        </div>
      )}
      <p className="access-help" id={helpId}><Sparkles size={13} aria-hidden="true" /> Se aplica a las inscripciones nuevas. Los alumnos actuales conservan su fecha de vencimiento.</p>
      {shownError && <p className="access-error" id={errorId} role="alert">{shownError}</p>}
    </div>
  );
}
