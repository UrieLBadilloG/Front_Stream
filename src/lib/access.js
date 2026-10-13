// Helpers de acceso y estado de inscripciones (regla única compartida por las vistas).
export const MIN_ACCESS_DAYS = 1;
export const MAX_ACCESS_DAYS = 3650;
export const DEFAULT_ACCESS_DAYS = 45;
export const INACTIVE_AFTER_DAYS = 14;

const DAY_MS = 86400000;

export function accessLabel(accessDays) {
  if (accessDays === null || accessDays === undefined) return 'Acceso de por vida';
  const days = Number(accessDays);
  return `Acceso por ${days} ${days === 1 ? 'día' : 'días'}`;
}

const isComplete = (item) => {
  const total = Number(item?.lessonCount ?? item?.totalLessons ?? 0);
  const done = Number(item?.completedLessons ?? 0);
  return total > 0 && done >= total;
};

export { isComplete as isCourseComplete };

const daysSince = (iso) => {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return (Date.now() - time) / DAY_MS;
};

// Estado de una inscripción para el docente: expired > completed > expiring > inactive > active.
export function enrollmentStatus(item) {
  if (item?.isExpired) return 'expired';
  if (isComplete(item)) return 'completed';
  if (item?.isExpiringSoon) return 'expiring';
  const sinceActivity = daysSince(item?.lastActivityAt || item?.enrolledAt);
  if (sinceActivity !== null && sinceActivity > INACTIVE_AFTER_DAYS) return 'inactive';
  return 'active';
}

// Estado para el alumno: Sin empezar / En curso / Completado / Por vencer / Expirado.
export function learnerStatus(item) {
  if (item?.isExpired) return 'expired';
  if (isComplete(item)) return 'completed';
  if (item?.isExpiringSoon) return 'expiring';
  if (Number(item?.completedLessons ?? 0) > 0 || Number(item?.progressPercent ?? 0) > 0) return 'in_progress';
  return 'not_started';
}

export function formatShortDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeTime(iso) {
  if (!iso) return 'Sin actividad';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return 'Sin actividad';
  const diff = Date.now() - time;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(months / 12);
  return `hace ${years} ${years === 1 ? 'año' : 'años'}`;
}

// Texto de vencimiento: { text, tone: 'ok'|'warn'|'danger'|'muted' }
export function expiryCopy(item) {
  if (!item?.hasLimit) return { text: 'Sin vencimiento', tone: 'muted' };
  if (item.isExpired) {
    const days = Math.max(0, Math.floor((Date.now() - new Date(item.expiresAt).getTime()) / DAY_MS));
    const when = days === 0 ? 'hoy' : `hace ${days} ${days === 1 ? 'día' : 'días'}`;
    return { text: `Venció ${when}`, tone: 'danger' };
  }
  const remaining = Number(item.daysRemaining ?? 0);
  const text = remaining === 1 ? 'Queda 1 día' : `Quedan ${remaining} días`;
  return { text, tone: item.isExpiringSoon ? 'warn' : 'ok' };
}

// Chip de acceso del alumno: { text, tone: 'muted'|'neutral'|'warn'|'danger', icon: 'infinity'|'clock'|'lock' }
export function learnerAccessChip(item) {
  if (!item?.hasLimit) return { text: 'Acceso de por vida', tone: 'muted', icon: 'infinity' };
  if (item.isExpired) return { text: `Venció el ${formatShortDate(item.expiresAt)}`, tone: 'danger', icon: 'lock' };
  const remaining = Number(item.daysRemaining ?? 0);
  return { text: remaining === 1 ? 'Vence en 1 día' : `Vence en ${remaining} días`, tone: item.isExpiringSoon ? 'warn' : 'neutral', icon: 'clock' };
}

export const firstName = (fullName) => String(fullName || '').trim().split(/\s+/)[0] || '';

// Minúsculas sin acentos para búsquedas por texto.
export const normalizeText = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

export function avatarHue(name) {
  let hash = 0;
  for (const char of String(name || '')) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

const INVALID_DAYS_MESSAGE = `Ingresa un número entero de días entre ${MIN_ACCESS_DAYS} y ${MAX_ACCESS_DAYS}.`;

// Devuelve '' si el valor es un entero válido; si no, el mensaje de error.
export function accessDaysError(rawDays) {
  const raw = String(rawDays ?? '').trim();
  if (!/^\d+$/.test(raw)) return INVALID_DAYS_MESSAGE;
  const days = Number(raw);
  return days < MIN_ACCESS_DAYS || days > MAX_ACCESS_DAYS ? INVALID_DAYS_MESSAGE : '';
}

// Devuelve number | null o lanza Error si la política es inválida.
export function accessDaysFromPolicy(policy) {
  if (policy?.mode === 'unlimited') return null;
  const message = accessDaysError(policy?.days);
  if (message) throw new Error(message);
  return Number(String(policy.days).trim());
}

export const policyFromAccessDays = (accessDays) => (accessDays === null || accessDays === undefined
  ? { mode: 'unlimited', days: String(DEFAULT_ACCESS_DAYS) }
  : { mode: 'limited', days: String(accessDays) });
