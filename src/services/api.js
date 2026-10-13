const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
export const apiAssetUrl = (path) => `${apiUrl}${path}`;

function filenameFromDisposition(header) {
  if (!header) return '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) { try { return decodeURIComponent(encoded[1]); } catch { /* usa el nombre simple */ } }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : '';
}

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest(path, { accessToken, method = 'GET', body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.message || 'No se pudo completar la solicitud.', response.status, payload.code);
  return payload;
}

// Descarga un archivo binario con el token en la cabecera Authorization (nunca en la URL).
export async function apiDownload(path, { accessToken, method = 'GET', body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.message || 'No se pudo completar la descarga.', response.status, payload.code);
  }
  const blob = await response.blob();
  return { blob, filename: filenameFromDisposition(response.headers.get('Content-Disposition')) };
}
