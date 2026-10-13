// Helpers PUROS para "Añadir a LinkedIn" (sin React ni import.meta, para poder probarlos con node:test).

const LINKEDIN_ADD_URL = 'https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME';

export function certificationName(courseTitle) {
  return `Constancia: ${courseTitle}`;
}

export function resolveVerifyUrl(info, origin) {
  return info?.verifyUrl || `${origin}/verificar/${info?.certificateCode}`;
}

// Usa encodeURIComponent en TODOS los valores (URLSearchParams codificaría los espacios como '+').
export function buildLinkedInAddUrl({ name, organizationName, organizationId, issuedAt, certUrl, certId }) {
  const parts = [`name=${encodeURIComponent(name ?? '')}`, `organizationName=${encodeURIComponent(organizationName ?? '')}`];
  if (organizationId !== undefined && organizationId !== null && String(organizationId).trim() !== '') {
    parts.push(`organizationId=${encodeURIComponent(String(organizationId).trim())}`);
  }
  const date = issuedAt ? new Date(issuedAt) : null;
  if (date && !Number.isNaN(date.getTime())) {
    parts.push(`issueYear=${encodeURIComponent(date.getFullYear())}`, `issueMonth=${encodeURIComponent(date.getMonth() + 1)}`);
  }
  parts.push(`certUrl=${encodeURIComponent(certUrl ?? '')}`, `certId=${encodeURIComponent(certId ?? '')}`);
  return `${LINKEDIN_ADD_URL}&${parts.join('&')}`;
}
