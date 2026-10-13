import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Images, LoaderCircle, Trash2 } from 'lucide-react';
import { uploadImageToCloudinary } from '../services/cloudinary.js';
import { COVER_MAX_BYTES, COVER_TYPES, CoverCropModal } from './cover-crop.jsx';
import { ConfirmDialog } from './dialogs.jsx';

export const PROMO_IMAGE_LIMIT = 8;

const byPosition = (list) => [...(list || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);

// Fila con alt text editable: se guarda (PATCH) al salir del campo si cambió.
function PromoImageRow({ image, index, total, busy, savingAlt, onAltSave, onMove, onDelete }) {
  const [alt, setAlt] = useState(image.altText || '');
  useEffect(() => { setAlt(image.altText || ''); }, [image.altText]);
  const label = image.altText || `imagen ${index + 1}`;
  return <li className="promo-item">
    <div className="promo-thumb"><img src={image.url} alt={image.altText || `Imagen promocional ${index + 1}`} loading="lazy" /></div>
    <div className="promo-item-body">
      <label className="form-field promo-alt">Texto alternativo <small>(opcional)</small>
        <input value={alt} maxLength="180" disabled={busy} onChange={(event) => setAlt(event.target.value)} onBlur={() => { if (alt.trim() !== (image.altText || '')) onAltSave(image, alt.trim()); }} placeholder="Describe la imagen para lectores de pantalla" />
      </label>
      {savingAlt && <span className="promo-saving" role="status"><LoaderCircle className="button-spinner" size={14} aria-hidden="true" /> Guardando…</span>}
    </div>
    <div className="promo-actions">
      <button type="button" className="icon-button outline-icon-button" onClick={() => onMove(index, -1)} disabled={busy || index === 0} aria-label={`Subir ${label}`} title="Subir"><ArrowUp size={17} aria-hidden="true" /></button>
      <button type="button" className="icon-button outline-icon-button" onClick={() => onMove(index, 1)} disabled={busy || index === total - 1} aria-label={`Bajar ${label}`} title="Bajar"><ArrowDown size={17} aria-hidden="true" /></button>
      <button type="button" className="icon-button material-delete outline-icon-button" onClick={() => onDelete(image)} disabled={busy} aria-label={`Eliminar ${label}`} title="Eliminar"><Trash2 size={17} aria-hidden="true" /></button>
    </div>
  </li>;
}

// Pestaña "Promoción" del editor: imágenes publicitarias del curso (máx. 8) que se muestran en la landing y el detalle.
// Props: courseId, images (promoImages de GET /api/admin/courses/:id/editor), api, getUploadSignature, notify, onReload (async).
export function PromoImagesPanel({ courseId, images, api, getUploadSignature, notify, onReload }) {
  const [items, setItems] = useState(() => byPosition(images));
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState('');
  const [reordering, setReordering] = useState(false);
  const [savingAltId, setSavingAltId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [cropSource, setCropSource] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const reorderRef = useRef(false);
  const inputRef = useRef(null);
  const cropUrlRef = useRef('');
  const base = `/api/admin/courses/${courseId}/promo-images`;

  useEffect(() => { if (!reorderRef.current) setItems(byPosition(images)); }, [images]);
  useEffect(() => () => { if (cropUrlRef.current) URL.revokeObjectURL(cropUrlRef.current); }, []);

  const busy = uploading || reordering || deleteBusy || savingAltId !== null;
  const remaining = Math.max(0, PROMO_IMAGE_LIMIT - items.length);
  const full = remaining === 0;

  const closeCrop = () => { if (cropUrlRef.current) URL.revokeObjectURL(cropUrlRef.current); cropUrlRef.current = ''; setCropSource(null); };

  const uploadFiles = async (files) => {
    if (!files.length) return;
    setUploading(true);
    let added = 0;
    try {
      for (const [index, file] of files.entries()) {
        setUploadLabel(files.length > 1 ? `Subiendo ${index + 1} de ${files.length}…` : 'Subiendo…');
        const signedUpload = await getUploadSignature();
        const uploaded = await uploadImageToCloudinary(file, signedUpload);
        await api(base, { method: 'POST', body: { url: uploaded.secureUrl, publicId: uploaded.publicId, altText: '' } });
        added += 1;
      }
      notify(added === 1 ? 'Imagen promocional agregada.' : `${added} imágenes promocionales agregadas.`);
    } catch (error) {
      notify(added ? `Se subieron ${added} de ${files.length}. ${error.message || 'Falló una carga.'}` : (error.message || 'No se pudo subir la imagen.'));
    } finally {
      setUploading(false); setUploadLabel('');
      if (added) { try { await onReload(); } catch { /* la lista se actualizará en la próxima carga */ } }
    }
  };

  const handleSelect = (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length || busy) return;
    const valid = [];
    for (const file of selected) {
      if (!COVER_TYPES.includes(file.type)) { notify(`«${file.name}» no es JPG, PNG ni WebP.`); continue; }
      if (file.size > COVER_MAX_BYTES) { notify(`«${file.name}» supera 8 MB.`); continue; }
      valid.push(file);
    }
    if (!valid.length) return;
    if (valid.length > remaining) notify(`Solo caben ${remaining} imagen${remaining === 1 ? '' : 'es'} más. Se subirán las primeras ${remaining}.`);
    const accepted = valid.slice(0, remaining);
    if (accepted.length === 1) {
      const url = URL.createObjectURL(accepted[0]);
      cropUrlRef.current = url; setCropSource({ url, name: accepted[0].name, type: accepted[0].type });
    } else void uploadFiles(accepted);
  };

  const applyCrop = (file) => { closeCrop(); void uploadFiles([file]); };

  const saveAlt = async (image, altText) => {
    setSavingAltId(image.id);
    try { await api(`${base}/${image.id}`, { method: 'PATCH', body: { altText } }); setItems((list) => list.map((item) => item.id === image.id ? { ...item, altText } : item)); notify('Texto alternativo guardado.'); }
    catch (error) { notify(error.message || 'No se pudo guardar el texto alternativo.'); await onReload().catch(() => {}); }
    finally { setSavingAltId(null); }
  };

  const move = async (index, direction) => {
    const target = index + direction;
    if (busy || reorderRef.current || target < 0 || target >= items.length) return;
    const previous = items; const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    reorderRef.current = true; setReordering(true); setItems(next);
    try {
      await api(`${base}/order`, { method: 'PUT', body: { imageIds: next.map((item) => item.id) } });
      setAnnouncement(`Imagen movida a la posición ${target + 1} de ${next.length}.`);
      try { await onReload(); } catch { /* la vista optimista ya coincide con el servidor */ }
    } catch (error) { setItems(previous); setAnnouncement('No se pudo guardar el nuevo orden.'); notify(error.message || 'No se pudo guardar el orden. Se restauró el orden anterior.'); }
    finally { reorderRef.current = false; setReordering(false); }
  };

  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try { await api(`${base}/${deleting.id}`, { method: 'DELETE' }); notify('Imagen eliminada.'); setDeleting(null); await onReload(); }
    catch (error) { notify(error.message || 'No se pudo eliminar la imagen.'); setDeleting(null); }
    finally { setDeleteBusy(false); }
  };

  return <section className="workspace-card promo-panel" aria-busy={uploading || reordering}>
    <div className="editor-panel-head">
      <div><span className="eyebrow"><Images size={15} aria-hidden="true" /> Promoción</span><h2>Imágenes promocionales</h2><p className="muted-copy">Se muestran en «Cursos en portada» de la página principal y en el detalle público del curso, solo si el curso está publicado.</p></div>
      <span className="materials-count" aria-label={`${items.length} de ${PROMO_IMAGE_LIMIT} imágenes`}>{items.length}/{PROMO_IMAGE_LIMIT}</span>
    </div>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <div className="promo-upload">
      <label className={`button button-secondary promo-file-button${full || busy ? ' is-disabled' : ''}`}>
        <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={handleSelect} disabled={full || busy} />
        {uploading ? <><LoaderCircle className="button-spinner" size={16} aria-hidden="true" /> {uploadLabel || 'Subiendo…'}</> : <><ImagePlus size={16} aria-hidden="true" /> Agregar imágenes</>}
      </label>
      <span>JPG, PNG o WebP · Máx. 8 MB cada una · {full ? 'Llegaste al límite de 8 imágenes. Elimina una para agregar otra.' : `Puedes agregar ${remaining} más. Con una sola imagen podrás recortarla o ajustarla completa en 16:9.`}</span>
    </div>
    {items.length ? <ol className="promo-list">{items.map((image, index) => <PromoImageRow key={image.id} image={image} index={index} total={items.length} busy={busy} savingAlt={savingAltId === image.id} onAltSave={saveAlt} onMove={move} onDelete={setDeleting} />)}</ol>
      : <div className="materials-empty"><Images size={29} aria-hidden="true" /><strong>Aún no hay imágenes promocionales</strong><span>Sube una imagen horizontal para destacar este curso en la página principal.</span></div>}
    {cropSource && <CoverCropModal source={cropSource} onCancel={closeCrop} onApply={applyCrop} notify={notify} />}
    {deleting && <ConfirmDialog title="Eliminar imagen promocional" description="La imagen dejará de mostrarse en la página principal y en el detalle del curso." variant="danger" confirmLabel="Eliminar imagen" busy={deleteBusy} onConfirm={() => void confirmDelete()} onCancel={() => { if (!deleteBusy) setDeleting(null); }} />}
  </section>;
}
