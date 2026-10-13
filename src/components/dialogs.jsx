import { useEffect, useId, useRef } from 'react';
import { LoaderCircle, X } from 'lucide-react';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

// Foco atrapado, Escape y restauración del foco para un diálogo modal (mismo patrón que CoverCropModal).
// `onEscape` se ignora mientras `locked` sea true (p. ej. durante una operación en curso).
export function useModalA11y({ onEscape, locked = false }) {
  const modalRef = useRef(null);
  const escapeRef = useRef(onEscape);
  const lockedRef = useRef(locked);
  escapeRef.current = onEscape;
  lockedRef.current = locked;
  useEffect(() => {
    const previousOverflow = document.body.style.overflow; const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    const focusables = () => Array.from(modalRef.current?.querySelectorAll(FOCUSABLE) || []);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') { if (!lockedRef.current) { event.stopPropagation(); escapeRef.current?.(); } return; }
      if (event.key !== 'Tab') return;
      const items = focusables(); if (!items.length) { event.preventDefault(); modalRef.current?.focus(); return; }
      const first = items[0]; const last = items[items.length - 1];
      if (!modalRef.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    const frame = requestAnimationFrame(() => { const items = focusables(); (modalRef.current?.querySelector('[data-autofocus]') || items[0] || modalRef.current)?.focus(); });
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handleKeyDown, true); previousFocus?.focus?.(); };
  }, []);
  return modalRef;
}

// Diálogo de confirmación accesible. `children` se muestra bajo la descripción (listas de impacto, avisos).
// variant: 'danger' | 'primary'. `busy` bloquea Escape/cierre y muestra el loader en el botón de confirmar.
export function ConfirmDialog({ title, description, children, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', variant = 'primary', busy = false, confirmDisabled = false, onConfirm, onCancel }) {
  const titleId = useId(); const descId = useId();
  const modalRef = useModalA11y({ onEscape: onCancel, locked: busy });
  return <div className="confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <section ref={modalRef} tabIndex="-1" className={`confirm-dialog confirm-${variant}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined} aria-busy={busy}>
      <div className="confirm-head"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button confirm-close" onClick={onCancel} aria-label="Cerrar" disabled={busy}><X size={18} aria-hidden="true" /></button></div>
      {description && <p id={descId} className="confirm-description">{description}</p>}
      {children && <div className="confirm-body">{children}</div>}
      <div className="confirm-actions">
        <button type="button" className="button button-secondary" onClick={onCancel} disabled={busy} data-autofocus={variant === 'danger' ? '' : undefined}>{cancelLabel}</button>
        <button type="button" className={`button ${variant === 'danger' ? 'button-danger' : 'button-primary'}`} onClick={onConfirm} disabled={busy || confirmDisabled}>{busy ? <><LoaderCircle className="button-spinner" size={16} aria-hidden="true" /> Procesando…</> : confirmLabel}</button>
      </div>
    </section>
  </div>;
}
