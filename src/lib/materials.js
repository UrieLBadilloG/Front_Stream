// Helpers compartidos de materiales y documentos del curso (editor, reproductor y paneles).

export const MATERIAL_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip';

export const DOCUMENT_CATEGORY_OPTIONS = [['terms', 'Términos y condiciones'], ['document', 'Documento'], ['guide', 'Guía']];
export const documentCategoryLabel = (category) => (DOCUMENT_CATEGORY_OPTIONS.find(([key]) => key === category) || DOCUMENT_CATEGORY_OPTIONS[1])[1];

export const formatMaterialSize = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

export const materialTypeLabel = (material) => material.type === 'link' ? 'Enlace' : (material.originalFilename?.split('.').pop()?.toUpperCase() || 'Archivo');

// 'link' | 'pdf' | 'image' | 'file' para elegir el icono.
export const materialKind = (material) => {
  if (material.type === 'link') return 'link';
  const extension = material.originalFilename?.split('.').pop()?.toLowerCase() || '';
  if (material.mimeType === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (material.mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp'].includes(extension)) return 'image';
  return 'file';
};

// Abre un material: enlaces directo; archivos mediante URL firmada (POST al endpoint de acceso).
export const openMaterialAccess = async ({ material, endpoint, api, notify }) => {
  if (material.type === 'link') { window.open(material.url, '_blank', 'noopener,noreferrer'); return; }
  const viewer = window.open('about:blank', '_blank');
  if (!viewer) { notify('Permite ventanas emergentes para abrir el material.'); return; }
  viewer.opener = null;
  try {
    viewer.document.title = 'Abriendo material…';
    viewer.document.body.innerHTML = '<p style="font:16px sans-serif;padding:24px">Abriendo material…</p>';
    const { access } = await api(endpoint, { method: 'POST' });
    viewer.location.replace(access.url);
  } catch (error) {
    viewer.close();
    notify(error.message || 'No se pudo abrir el material.');
  }
};
