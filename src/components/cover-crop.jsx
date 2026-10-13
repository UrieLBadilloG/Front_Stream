import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';

export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const COVER_MAX_BYTES = 8 * 1024 * 1024;
export const COVER_WIDTH = 1280;
export const COVER_HEIGHT = 720;

const MODES = [{ value: 'crop', label: 'Recortar' }, { value: 'fit', label: 'Ajustar completa (sin recortar)' }];
const BACKGROUNDS = [{ value: 'auto', label: 'Automático' }, { value: 'white', label: 'Blanco' }, { value: 'custom', label: 'Color personalizado' }, { value: 'blur', label: 'Difuminado' }];

// Una imagen casi 16:9 se recorta casi sin pérdida; en otro caso se sugiere ajustarla completa.
const isNearSixteenNine = (width, height) => Math.abs((width / height) / (COVER_WIDTH / COVER_HEIGHT) - 1) < 0.02;
const toHex = (value) => value.toString(16).padStart(2, '0');
const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };

// Color de fondo "Automático": mediana por canal de los píxeles del borde de la imagen (compuesta sobre blanco).
export function sampleEdgeColor(image) {
  try {
    const scale = Math.min(1, 96 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(2, Math.round(image.naturalWidth * scale)); const height = Math.max(2, Math.round(image.naturalHeight * scale));
    const probe = document.createElement('canvas'); probe.width = width; probe.height = height;
    const context = probe.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    const channels = [[], [], []];
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      if (x > 1 && y > 1 && x < width - 2 && y < height - 2) { x = width - 3; continue; }
      const offset = (y * width + x) * 4; for (let c = 0; c < 3; c += 1) channels[c].push(data[offset + c]);
    }
    return `#${channels.map((list) => toHex(median(list))).join('')}`;
  } catch { return '#ffffff'; }
}

// Un solo código de dibujo para la vista previa y la exportación.
export function drawCover(canvas, image, { mode, zoom, positionX, positionY, background, customColor, edgeColor, opaque }) {
  const context = canvas.getContext('2d'); const width = canvas.width; const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  if (opaque || mode === 'fit') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); }
  if (mode === 'crop') {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
    const drawWidth = image.naturalWidth * scale; const drawHeight = image.naturalHeight * scale;
    const overflowX = Math.max(0, drawWidth - width); const overflowY = Math.max(0, drawHeight - height);
    context.drawImage(image, -overflowX * ((positionX + 100) / 200), -overflowY * ((positionY + 100) / 200), drawWidth, drawHeight);
    return;
  }
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = Math.round(image.naturalWidth * scale); const drawHeight = Math.round(image.naturalHeight * scale);
  const drawX = Math.round((width - drawWidth) / 2); const drawY = Math.round((height - drawHeight) / 2);
  if (background === 'blur') {
    const coverScale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * 1.15;
    const coverWidth = image.naturalWidth * coverScale; const coverHeight = image.naturalHeight * coverScale;
    if ('filter' in context) {
      context.save(); context.filter = 'blur(36px)'; context.drawImage(image, (width - coverWidth) / 2, (height - coverHeight) / 2, coverWidth, coverHeight); context.restore();
    } else {
      // Navegadores sin ctx.filter (Safari): reducir y ampliar da un desenfoque equivalente.
      const small = document.createElement('canvas'); small.width = 32; small.height = 18;
      small.getContext('2d').drawImage(image, (32 - coverWidth / 40) / 2, (18 - coverHeight / 40) / 2, coverWidth / 40, coverHeight / 40);
      context.drawImage(small, 0, 0, width, height);
    }
  } else {
    context.fillStyle = background === 'custom' ? customColor : background === 'auto' ? edgeColor : '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

export function CoverCropModal({ source, onCancel, onApply, notify }) {
  const canvasRef = useRef(null);
  const modalRef = useRef(null);
  const applyingRef = useRef(false);
  const imageRef = useRef(null);
  const [mode, setMode] = useState('crop');
  const [background, setBackground] = useState('auto');
  const [customColor, setCustomColor] = useState('#ffffff');
  const [edgeColor, setEdgeColor] = useState('#ffffff');
  const [notSixteenNine, setNotSixteenNine] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);
  const [ready, setReady] = useState(false);
  const [applying, setApplying] = useState(false);
  const [cropError, setCropError] = useState('');
  const isPng = source.type === 'image/png' || /\.png$/i.test(source.name || '');

  useEffect(() => {
    const previousOverflow = document.body.style.overflow; const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(modalRef.current?.querySelectorAll(focusableSelector) || []);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !applyingRef.current) { onCancel(); return; }
      if (event.key !== 'Tab') return;
      const items = focusables(); if (!items.length) { event.preventDefault(); modalRef.current?.focus(); return; }
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => { const items = focusables(); (items[0] || modalRef.current)?.focus(); });
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handleKeyDown); previousFocus?.focus?.(); };
  }, []);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      const near = isNearSixteenNine(image.naturalWidth, image.naturalHeight);
      setEdgeColor(sampleEdgeColor(image)); setNotSixteenNine(!near); setMode(near ? 'crop' : 'fit');
      setReady(true); setCropError('');
    };
    image.onerror = () => { setReady(false); setCropError('No se pudo leer la imagen seleccionada.'); };
    image.src = source.url;
    return () => { image.onload = null; image.onerror = null; imageRef.current = null; };
  }, [source.url]);

  const drawOptions = (opaque) => ({ mode, zoom, positionX, positionY, background, customColor, edgeColor, opaque });

  useEffect(() => {
    const canvas = canvasRef.current; const image = imageRef.current;
    if (!canvas || !image || !ready) return;
    drawCover(canvas, image, drawOptions(!isPng));
  }, [ready, mode, zoom, positionX, positionY, background, customColor, edgeColor, isPng]);

  const finish = (message) => { if (message) setCropError(message); applyingRef.current = false; setApplying(false); };

  const applyCrop = async () => {
    const canvas = canvasRef.current; const image = imageRef.current;
    if (!canvas || !image || !ready || applyingRef.current) return;
    applyingRef.current = true; setApplying(true); setCropError('');
    try {
      drawCover(canvas, image, drawOptions(!isPng));
      let blob = isPng ? await canvasToBlob(canvas, 'image/png') : null; let type = 'image/png';
      if (!blob || blob.size > COVER_MAX_BYTES) {
        // Un PNG demasiado pesado (o un formato que no es PNG) se exporta como JPEG.
        drawCover(canvas, image, drawOptions(true)); blob = await canvasToBlob(canvas, 'image/jpeg', 0.92); type = 'image/jpeg';
      }
      if (!blob) { finish('No se pudo generar la portada. Inténtalo de nuevo.'); return; }
      const file = new File([blob], `portada-${Date.now()}.${type === 'image/png' ? 'png' : 'jpg'}`, { type, lastModified: Date.now() });
      if (file.size > COVER_MAX_BYTES) { finish(mode === 'crop' ? 'El recorte generado supera 8 MB. Reduce el zoom e inténtalo de nuevo.' : 'La portada generada supera 8 MB. Usa una imagen más ligera.'); return; }
      onApply(file);
    } catch {
      const message = 'No se pudo exportar la imagen. El origen puede estar bloqueando el acceso (CORS).';
      finish(message); notify(message);
    }
  };

  const fitting = mode === 'fit';
  return <div className="cover-crop-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !applying) onCancel(); }}>
    <section ref={modalRef} tabIndex="-1" className="cover-crop-modal" role="dialog" aria-modal="true" aria-labelledby="cover-crop-title">
      <div className="cover-crop-head"><div><h2 id="cover-crop-title">Ajustar imagen 16:9</h2><p title={source.name}>{source.name}</p></div><button type="button" className="icon-button" onClick={onCancel} aria-label="Cancelar" disabled={applying}><X size={18} /></button></div>
      <div className="cover-crop-canvas-wrap">{!ready && !cropError && <span>Cargando imagen…</span>}<canvas ref={canvasRef} width={COVER_WIDTH} height={COVER_HEIGHT} aria-label={fitting ? 'Vista previa de la imagen completa en 16:9' : 'Vista previa del recorte 16:9'} /></div>
      {notSixteenNine && <p className="cover-crop-notice" role="note">Tu imagen no es 16:9: puedes recortarla o ajustarla completa.</p>}
      {cropError && <p className="cover-crop-error" role="alert">{cropError}</p>}
      <fieldset className="cover-crop-group" disabled={applying}>
        <legend>Modo</legend>
        <div className="cover-crop-chips">{MODES.map((item) => <label key={item.value} className="cover-chip"><input type="radio" name="cover-mode" value={item.value} checked={mode === item.value} onChange={() => setMode(item.value)} /><span>{item.label}</span></label>)}</div>
      </fieldset>
      {fitting
        ? <fieldset className="cover-crop-group" disabled={applying}>
          <legend>Fondo para el espacio sobrante</legend>
          <div className="cover-crop-chips">{BACKGROUNDS.map((item) => <label key={item.value} className="cover-chip"><input type="radio" name="cover-background" value={item.value} checked={background === item.value} onChange={() => setBackground(item.value)} /><span>{item.label}</span></label>)}</div>
          {background === 'custom' && <label className="cover-color-field">Color de fondo personalizado<input type="color" value={customColor} onChange={(event) => setCustomColor(event.target.value)} aria-label="Color de fondo personalizado" /><code>{customColor}</code></label>}
        </fieldset>
        : <div className="cover-crop-controls"><label>Zoom <strong>{zoom.toFixed(1)}×</strong><input type="range" min="1" max="3" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} disabled={applying} /></label><label>Posición horizontal<input type="range" min="-100" max="100" step="1" value={positionX} onChange={(event) => setPositionX(Number(event.target.value))} disabled={applying} /></label><label>Posición vertical<input type="range" min="-100" max="100" step="1" value={positionY} onChange={(event) => setPositionY(Number(event.target.value))} disabled={applying} /></label></div>}
      <p className="cover-crop-help">El resultado será un {isPng ? 'PNG' : 'JPEG'} de exactamente {COVER_WIDTH} × {COVER_HEIGHT} px.</p>
      <div className="cover-crop-actions"><button type="button" className="button button-secondary" onClick={onCancel} disabled={applying}>Cancelar</button><button type="button" className="button button-primary" onClick={() => void applyCrop()} disabled={!ready || applying}>{applying ? <><LoaderCircle className="button-spinner" size={16} aria-hidden="true" /> Generando…</> : fitting ? 'Aplicar ajuste' : 'Aplicar recorte'}</button></div>
    </section>
  </div>;
}
