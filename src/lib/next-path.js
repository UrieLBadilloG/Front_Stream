// PURO (sin React ni import.meta): valida la ruta de retorno `siguiente` para evitar redirecciones abiertas.

export const ALLOWED_PREFIXES = ['/pago/', '/curso/', '/mi-aprendizaje', '/aprender/', '/explorar', '/mis-pagos'];

const BASE = 'http://streamly.invalid';
const MAX_LENGTH = 300;

function matchesAllowList(pathname) {
  return ALLOWED_PREFIXES.some((prefix) => {
    if (prefix.endsWith('/')) return pathname.startsWith(prefix);
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

// Devuelve la ruta segura (pathname + search + hash) o `fallback`.
export function safeNextPath(value, fallback = null) {
  if (typeof value !== 'string' || !value || value.length > MAX_LENGTH) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return fallback;

  const rawPath = value.split(/[?#]/, 1)[0];
  if (/%2f|%5c/i.test(rawPath)) return fallback;
  if (rawPath.split('/').some((segment) => ['.', '..'].includes(segment.replace(/%2e/gi, '.')))) return fallback;
  // Los prefijos sin '/' final (p. ej. /mi-aprendizaje) exigen igualdad o continuar con '/'; ?/# ya se separaron arriba.
  if (!matchesAllowList(rawPath)) return fallback;

  let parsed;
  try {
    parsed = new URL(value, BASE);
  } catch {
    return fallback;
  }
  if (parsed.origin !== BASE || !matchesAllowList(parsed.pathname)) return fallback;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

// Ruta hacia /login con el modo y, si es segura, la ruta de retorno codificada.
export function buildLoginPath({ mode = 'registro', next } = {}) {
  const safeMode = mode === 'login' ? 'login' : 'registro';
  const safeNext = safeNextPath(next);
  return `/login?modo=${safeMode}${safeNext ? `&siguiente=${encodeURIComponent(safeNext)}` : ''}`;
}

// 'register' | 'login' | null según el parámetro `modo` de la URL.
export function parseAuthMode(params) {
  const mode = params?.get?.('modo');
  if (mode === 'registro') return 'register';
  if (mode === 'login') return 'login';
  return null;
}
