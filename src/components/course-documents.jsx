import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, File, FileImage, FileText, Link2, LoaderCircle, Plus, ScrollText, Trash2, Upload } from 'lucide-react';
import { uploadMaterialToCloudinary } from '../services/cloudinary.js';
import { DOCUMENT_CATEGORY_OPTIONS, MATERIAL_ACCEPT, documentCategoryLabel, formatMaterialSize, materialKind, materialTypeLabel, openMaterialAccess } from '../lib/materials.js';
import { ConfirmDialog } from './dialogs.jsx';

export { MATERIAL_ACCEPT, formatMaterialSize, materialTypeLabel, openMaterialAccess };

const KIND_ICONS = { link: Link2, pdf: FileText, image: FileImage, file: File };
const KIND_LABELS = { link: 'Enlace', pdf: 'PDF', image: 'Imagen', file: 'Archivo' };

// Icono por tipo de documento (PDF, imagen, archivo, enlace); los términos usan un icono propio.
export function DocumentIcon({ material, size = 20 }) {
  const Icon = material.category === 'terms' ? ScrollText : (KIND_ICONS[materialKind(material)] || File);
  return <Icon size={size} aria-hidden="true" />;
}

const documentMeta = (material) => material.type === 'file'
  ? [KIND_LABELS[materialKind(material)] === 'Archivo' ? materialTypeLabel(material) : KIND_LABELS[materialKind(material)], formatMaterialSize(material.sizeBytes)].filter(Boolean).join(' · ')
  : 'Enlace externo';

// Términos primero y, dentro de cada grupo, el orden que entrega la API (position).
const sortDocuments = (list) => [...list].sort((a, b) => Number(b.category === 'terms') - Number(a.category === 'terms'));

const EMPTY_FORM = { type: 'file', title: '', description: '', category: 'document', url: '' };

// Documentos del curso (editor): alta, categoría, orden, apertura con URL firmada y eliminación.
// Props: courseId, materials (de GET /api/admin/courses/:id/editor), api, getUploadSignature, notify, onReload (async).
export function CourseDocumentsPanel({ courseId, materials, api, getUploadSignature, notify, onReload }) {
  const [items, setItems] = useState(() => sortDocuments(materials || []));
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [changingId, setChangingId] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const reorderRef = useRef(false);
  const fileInputRef = useRef(null);
  const base = `/api/admin/courses/${courseId}/materials`;

  useEffect(() => { if (!reorderRef.current) setItems(sortDocuments(materials || [])); }, [materials]);

  const busy = saving || reordering || changingId !== null || deleteBusy;

  const saveDocument = async (event) => {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) { notify('Escribe un título para el documento.'); return; }
    if (form.type === 'file' && !file) { notify('Selecciona un archivo.'); return; }
    let linkUrl = null;
    if (form.type === 'link') {
      try { linkUrl = new URL(form.url.trim()); } catch { notify('Escribe una URL válida.'); return; }
      if (linkUrl.protocol !== 'https:') { notify('La URL del enlace debe usar HTTPS.'); return; }
    }
    setSaving(true); setProgress(form.type === 'file' ? 10 : 0);
    try {
      let body = { type: form.type, category: form.category, title, description: form.description.trim() };
      if (form.type === 'file') {
        const signedUpload = await getUploadSignature(); setProgress(25);
        const uploaded = await uploadMaterialToCloudinary(file, signedUpload, setProgress);
        body = { ...body, url: uploaded.secureUrl, publicId: uploaded.publicId, originalFilename: uploaded.originalFilename, mimeType: uploaded.mimeType, sizeBytes: uploaded.sizeBytes };
      } else body.url = linkUrl.href;
      await api(base, { method: 'POST', body });
      setForm(EMPTY_FORM); setFile(null); setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      notify('Documento agregado.'); await onReload();
    } catch (error) { setProgress(0); notify(error.message || 'No se pudo guardar el documento.'); }
    finally { setSaving(false); }
  };

  const changeCategory = async (material, category) => {
    if (busy || category === material.category) return;
    setChangingId(material.id);
    try { await api(`${base}/${material.id}`, { method: 'PATCH', body: { category } }); notify(`«${material.title}» ahora es ${documentCategoryLabel(category).toLowerCase()}.`); await onReload(); }
    catch (error) { notify(error.message || 'No se pudo cambiar la categoría.'); }
    finally { setChangingId(null); }
  };

  // Actualización optimista del orden con reversión si la API falla.
  const move = async (index, direction) => {
    const target = index + direction;
    if (busy || reorderRef.current || target < 0 || target >= items.length) return;
    if ((items[index].category === 'terms') !== (items[target].category === 'terms')) return;
    const previous = items; const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    reorderRef.current = true; setReordering(true); setItems(next);
    try {
      await api(`${base}/order`, { method: 'PUT', body: { materialIds: next.map((item) => item.id) } });
      setAnnouncement(`«${next[target].title}» movido a la posición ${target + 1} de ${next.length}.`);
      try { await onReload(); } catch { /* la vista optimista ya coincide con el servidor */ }
    } catch (error) { setItems(previous); setAnnouncement('No se pudo guardar el nuevo orden.'); notify(error.message || 'No se pudo guardar el orden. Se restauró el orden anterior.'); }
    finally { reorderRef.current = false; setReordering(false); }
  };

  const open = async (material) => {
    setOpeningId(material.id);
    try { await openMaterialAccess({ material, endpoint: `/api/courses/${courseId}/materials/${material.id}/access`, api, notify }); }
    finally { setOpeningId(null); }
  };

  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try { await api(`${base}/${deleting.id}`, { method: 'DELETE' }); notify('Documento eliminado.'); setDeleting(null); await onReload(); }
    catch (error) { notify(error.message || 'No se pudo eliminar el documento.'); setDeleting(null); }
    finally { setDeleteBusy(false); }
  };

  return <div className="materials-editor-layout docs-editor">
    <section className="workspace-card materials-list-card" aria-busy={reordering}>
      <div className="editor-panel-head"><div><span className="eyebrow"><ScrollText size={15} aria-hidden="true" /> Documentos del curso</span><h2>Documentos</h2><p className="muted-copy">Los alumnos inscritos los verán en el reproductor. Los términos y condiciones aparecen destacados primero.</p></div><span className="materials-count" aria-label={`${items.length} documentos`}>{items.length}</span></div>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      {items.length ? <ol className="materials-list docs-list">{items.map((material, index) => {
        const terms = material.category === 'terms';
        const sameAbove = index > 0 && (items[index - 1].category === 'terms') === terms;
        const sameBelow = index < items.length - 1 && (items[index + 1].category === 'terms') === terms;
        return <li key={material.id} className={`material-row docs-row${terms ? ' is-terms' : ''}`}>
          <span className="material-icon"><DocumentIcon material={material} /></span>
          <div className="material-copy">
            <div className="material-title-line"><strong>{material.title}</strong><span>{documentCategoryLabel(material.category)}</span></div>
            {material.description && <p>{material.description}</p>}
            <small>{material.type === 'file' ? [material.originalFilename, formatMaterialSize(material.sizeBytes)].filter(Boolean).join(' · ') : material.url}</small>
            <label className="docs-category"><span>Categoría</span><select value={material.category || 'document'} onChange={(event) => void changeCategory(material, event.target.value)} disabled={busy} aria-label={`Categoría de «${material.title}»`}>{DOCUMENT_CATEGORY_OPTIONS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
          </div>
          <div className="material-actions docs-actions">
            <button type="button" className="icon-button outline-icon-button" onClick={() => void move(index, -1)} disabled={busy || !sameAbove} aria-label={`Subir documento «${material.title}»`} title="Subir"><ArrowUp size={17} aria-hidden="true" /></button>
            <button type="button" className="icon-button outline-icon-button" onClick={() => void move(index, 1)} disabled={busy || !sameBelow} aria-label={`Bajar documento «${material.title}»`} title="Bajar"><ArrowDown size={17} aria-hidden="true" /></button>
            <button type="button" className="button button-secondary" onClick={() => void open(material)} disabled={openingId !== null} aria-label={`Abrir «${material.title}»`}>{openingId === material.id ? <><LoaderCircle className="button-spinner" size={15} aria-hidden="true" /> Abriendo…</> : <><ExternalLink size={15} aria-hidden="true" /> Abrir</>}</button>
            <button type="button" className="icon-button material-delete outline-icon-button" onClick={() => setDeleting(material)} disabled={busy} aria-label={`Eliminar «${material.title}»`} title="Eliminar">{changingId === material.id ? <LoaderCircle className="button-spinner" size={17} aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}</button>
          </div>
        </li>;
      })}</ol> : <div className="materials-empty"><FileText size={29} aria-hidden="true" /><strong>Aún no hay documentos</strong><span>Agrega los términos y condiciones, guías u otros archivos desde el formulario.</span></div>}
    </section>
    <aside className="workspace-card material-form-card">
      <h2>Agregar documento</h2>
      <p className="muted-copy">Estará disponible para todos los alumnos inscritos en el curso.</p>
      <form onSubmit={saveDocument}>
        <div className="material-type-picker" role="group" aria-label="Tipo de documento">
          <button type="button" className={form.type === 'file' ? 'active' : ''} aria-pressed={form.type === 'file'} onClick={() => { setForm({ ...form, type: 'file', url: '' }); setProgress(0); }} disabled={saving}><Upload size={16} aria-hidden="true" /> Archivo</button>
          <button type="button" className={form.type === 'link' ? 'active' : ''} aria-pressed={form.type === 'link'} onClick={() => { setForm({ ...form, type: 'link' }); setFile(null); setProgress(0); }} disabled={saving}><Link2 size={16} aria-hidden="true" /> Enlace</button>
        </div>
        <label className="form-field">Título<input required maxLength="180" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ej. Términos y condiciones" /></label>
        <label className="form-field">Categoría<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{DOCUMENT_CATEGORY_OPTIONS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label className="form-field">Descripción <small>(opcional)</small><textarea rows="3" maxLength="500" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Explica brevemente para qué sirve" /></label>
        {form.type === 'file'
          ? <div className="material-upload"><Upload size={23} aria-hidden="true" /><strong title={file?.name}>{file?.name || 'Selecciona un archivo'}</strong><span>{file ? `${formatMaterialSize(file.size)} · listo para subir` : 'PDF, imagen, Word, Excel, PowerPoint, TXT o ZIP · Máx. 25 MB'}</span><label className="button button-secondary docs-file-button"><input ref={fileInputRef} type="file" required accept={MATERIAL_ACCEPT} onChange={(event) => { setFile(event.target.files?.[0] || null); setProgress(0); }} />Elegir archivo</label>{saving && progress > 0 && <div className="upload-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Progreso de la carga"><i style={{ width: `${progress}%` }} /></div>}</div>
          : <label className="form-field">URL HTTPS<input required type="url" inputMode="url" pattern="https://.*" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://ejemplo.com/documento" /></label>}
        <button className="button button-primary material-submit" disabled={busy}>{saving ? <><LoaderCircle className="button-spinner" size={17} aria-hidden="true" /> {form.type === 'file' ? 'Subiendo…' : 'Guardando…'}</> : <><Plus size={17} aria-hidden="true" /> Agregar documento</>}</button>
      </form>
    </aside>
    {deleting && <ConfirmDialog title={`Eliminar «${deleting.title}»`} description="El documento dejará de mostrarse a los alumnos. El archivo de Cloudinary no se elimina." variant="danger" confirmLabel="Eliminar documento" busy={deleteBusy} onConfirm={() => void confirmDelete()} onCancel={() => { if (!deleteBusy) setDeleting(null); }} />}
  </div>;
}

// Vista del alumno: "Documentos del curso" con los términos y condiciones destacados arriba.
// Props: courseId, materials (de GET /api/courses/:id/learn), api, notify, id (ancla, por defecto "documentos").
export function LearnerDocuments({ courseId, materials, api, notify, id = 'documentos' }) {
  const [openingId, setOpeningId] = useState(null);
  const [failedId, setFailedId] = useState(null);
  if (!materials?.length) return null;
  const sorted = sortDocuments(materials);
  const terms = sorted.filter((material) => material.category === 'terms');
  const others = sorted.filter((material) => material.category !== 'terms');

  const open = async (material) => {
    setOpeningId(material.id); setFailedId(null);
    try {
      let failed = false;
      await openMaterialAccess({ material, endpoint: `/api/courses/${courseId}/materials/${material.id}/access`, api, notify: (message) => { failed = true; notify(message); } });
      if (failed) setFailedId(material.id);
    } finally { setOpeningId(null); }
  };

  const renderItem = (material, featured) => <li key={material.id}>
    <button type="button" className={`learning-resource docs-item${featured ? ' is-featured' : ''}`} onClick={() => void open(material)} disabled={openingId !== null} aria-label={`${material.type === 'link' ? 'Abrir' : 'Abrir o descargar'} ${material.title}`}>
      <span className="learning-resource-icon"><DocumentIcon material={material} size={featured ? 22 : 20} /></span>
      <span className="learning-resource-copy">
        <strong>{material.title}</strong>
        {material.description && <span>{material.description}</span>}
        <small>{[documentCategoryLabel(material.category), documentMeta(material)].filter(Boolean).join(' · ')}</small>
        {failedId === material.id && <span className="docs-error" role="alert">No se pudo abrir. Inténtalo de nuevo.</span>}
      </span>
      {openingId === material.id ? <LoaderCircle className="button-spinner learning-resource-open" size={18} aria-hidden="true" /> : <ExternalLink className="learning-resource-open" size={18} aria-hidden="true" />}
    </button>
  </li>;

  return <section className="learning-resources docs-learner" id={id} aria-labelledby={`${id}-title`} tabIndex={-1}>
    <div className="learning-resources-head"><span><FileText size={18} aria-hidden="true" /></span><div><h2 id={`${id}-title`}>Documentos del curso</h2><p>Términos y condiciones, guías y material disponible durante todo el curso.</p></div></div>
    {terms.length > 0 && <div className="docs-terms"><span className="docs-terms-label"><ScrollText size={14} aria-hidden="true" /> Importante · Términos y condiciones</span><ul className="docs-list-learner">{terms.map((material) => renderItem(material, true))}</ul></div>}
    {others.length > 0 && <ul className="learning-resources-list docs-list-learner">{others.map((material) => renderItem(material, false))}</ul>}
  </section>;
}
