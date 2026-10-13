export function isCloudinaryConfigured() {
  return true;
}

function assertSignedUpload(signedUpload) {
  if (!signedUpload?.cloudName || !signedUpload?.apiKey || !signedUpload?.signature) {
    throw new Error('No se recibió una autorización de carga válida. Vuelve a iniciar sesión e inténtalo de nuevo.');
  }
}

async function uploadFile(file, signedUpload, resourceType, onProgress) {
  assertSignedUpload(signedUpload);

  const body = new FormData();
  body.append('file', file);
  body.append('api_key', signedUpload.apiKey);
  body.append('timestamp', String(signedUpload.timestamp));
  body.append('signature', signedUpload.signature);
  body.append('folder', signedUpload.folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${signedUpload.cloudName}/${resourceType}/upload`,
    { method: 'POST', body },
  );

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail?.error?.message || 'No se pudo cargar el archivo.');
  }

  const result = await response.json();
  onProgress?.(100);
  return result;
}

export async function uploadVideoToCloudinary(file, signedUpload, onProgress) {
  const result = await uploadFile(file, signedUpload, 'video', onProgress);
  return {
    secureUrl: result.secure_url,
    publicId: result.public_id,
    durationSeconds: Math.round(Number(result.duration) || 0),
  };
}

export async function uploadImageToCloudinary(file, signedUpload, onProgress) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file?.type)) {
    throw new Error('La portada debe ser una imagen JPG, PNG o WebP.');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('La portada no puede superar 8 MB.');
  }

  const result = await uploadFile(file, signedUpload, 'image', onProgress);
  return {
    secureUrl: result.secure_url,
    publicId: result.public_id,
    width: Number(result.width || 0),
    height: Number(result.height || 0),
  };
}

const MATERIAL_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'text/plain',
]);

export async function uploadMaterialToCloudinary(file, signedUpload, onProgress) {
  if (!MATERIAL_TYPES.has(file?.type)) throw new Error('Formato no permitido. Usa PDF, imagen, Word, Excel, PowerPoint, TXT o ZIP.');
  if (file.size > 25 * 1024 * 1024) throw new Error('El material no puede superar 25 MB.');
  const result = await uploadFile(file, signedUpload, 'raw', onProgress);
  return {
    secureUrl: result.secure_url,
    publicId: result.public_id,
    originalFilename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  };
}
