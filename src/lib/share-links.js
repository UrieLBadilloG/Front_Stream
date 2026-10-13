// Helpers PUROS para "Compartir tu logro" (sin React ni import.meta, para poder probarlos con node:test).

export const BADGE_FILENAME = 'Insignia-Mujer-LegalTech.png';
export const SHARE_ORGANIZATION = 'Mujer LegalTech en México';

// Texto sugerido para la publicación (editable aquí). Termina en ":" porque después va el enlace.
export function shareText(courseTitle) {
  const course = String(courseTitle ?? '').trim() || 'Mujer LegalTech';
  return `¡Completé el curso ${course} de ${SHARE_ORGANIZATION}! Verifica mi constancia aquí:`;
}

// Enlace con vista previa (GET /v/<CÓDIGO> del backend). `apiBase` = PUBLIC_API_URL o el origen del API.
export function certificateShareLink(code, apiBase) {
  return `${String(apiBase ?? '').replace(/\/+$/, '')}/v/${encodeURIComponent(String(code ?? ''))}`;
}

export const facebookShareUrl = (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
export const linkedInShareUrl = (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
export const whatsappShareUrl = (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
export const twitterShareUrl = (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

// true si Facebook & cía. podrían leer la vista previa: host público (no localhost, loopback, IP privada ni nombre sin punto).
export function isPublicShareUrl(value) {
  let host;
  try {
    const parsed = new URL(String(value));
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host.includes(':')) return !(host === '::1' || host === '::' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host));
  const octets = host.split('.');
  if (octets.length === 4 && octets.every((part) => /^\d{1,3}$/.test(part))) {
    const [a, b] = octets.map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    return true;
  }
  return host.includes('.');
}

// Datos para navigator.share. Adjunta la insignia solo si el navegador confirma que puede compartir archivos.
export function nativeSharePayload({ title, text, url, file, nav }) {
  const payload = { title, text, url };
  if (file && typeof nav?.canShare === 'function') {
    try {
      if (nav.canShare({ files: [file] })) payload.files = [file];
    } catch { /* sin archivos: se comparte solo el enlace */ }
  }
  return payload;
}

export const isShareCancel = (error) => error?.name === 'AbortError';
