import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRightLeft, ArrowUp, ChevronDown, ChevronsDownUp, ChevronsUpDown, CirclePlay, ClipboardCheck, GripVertical, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { lessonNumbersFromSections } from '../lib/lessons.js';
import { LessonNumber } from './lesson-number.jsx';
import { ConfirmDialog, useModalA11y } from './dialogs.jsx';
import { DeleteQuizDialog, InsertQuizButton, QuizRow } from './quiz-outline.jsx';
import '../styles-outline.css';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const isQuizItem = (lesson) => lesson.kind === 'quiz';
// Conteos de una sección: las clases son solo videos; las evaluaciones se cuentan aparte.
const sectionCounts = (section) => {
  const quizzes = section.lessons.filter(isQuizItem).length;
  return { lessons: section.lessons.length - quizzes, quizzes };
};

// Secciones contraídas por curso: arreglo de ids en localStorage (sin datos sensibles). Tolera JSON inválido.
const collapsedKey = (courseId) => `streamly:outline-collapsed:${courseId}`;
const readCollapsed = (courseId) => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(collapsedKey(courseId)));
    return Array.isArray(parsed) ? parsed.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0) : [];
  } catch { return []; }
};
const writeCollapsed = (courseId, ids) => {
  try {
    if (ids.length) window.localStorage.setItem(collapsedKey(courseId), JSON.stringify(ids));
    else window.localStorage.removeItem(collapsedKey(courseId));
  } catch { /* almacenamiento no disponible: el estado sigue vigente mientras la página esté abierta */ }
};

// Selector accesible para mover una clase al final de otra sección (modal: la tarjeta de sección recorta desbordes).
function MoveLessonDialog({ lesson, fromSectionId, sections, onSelect, onCancel }) {
  const titleId = useId();
  const modalRef = useModalA11y({ onEscape: onCancel });
  return <div className="confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section ref={modalRef} tabIndex="-1" className="confirm-dialog ol-move-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="confirm-head"><h2 id={titleId}>{isQuizItem(lesson) ? 'Mover evaluación a otra sección' : 'Mover clase a otra sección'}</h2><button type="button" className="icon-button confirm-close" onClick={onCancel} aria-label="Cerrar" data-autofocus=""><X size={18} aria-hidden="true" /></button></div>
      <p className="confirm-description">«{lesson.title}» se agregará al final de la sección que elijas.</p>
      <ul className="ol-move-list">
        {sections.map((section, index) => section.id === fromSectionId ? null : <li key={section.id}>
          <button type="button" className="ol-move-option" onClick={() => onSelect(section)}>
            <span className="ol-move-option-title">Sección {index + 1} · {section.title}</span>
            <small>{section.lessons.length ? [sectionCounts(section).lessons > 0 && plural(sectionCounts(section).lessons, 'clase', 'clases'), sectionCounts(section).quizzes > 0 && plural(sectionCounts(section).quizzes, 'evaluación', 'evaluaciones')].filter(Boolean).join(' · ') : 'Sin clases'}</small>
          </button>
        </li>)}
      </ul>
      <div className="confirm-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancelar</button></div>
    </section>
  </div>;
}

// Mueve el elemento `from` a la posición `to` (índices) sin mutar el arreglo original.
const moveItem = (list, from, to) => {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

// Programa del curso: secciones y clases con orden (botones, teclado y arrastrar y soltar HTML5 nativo),
// eliminación con confirmación de impacto y numeración "Clase N" derivada en el cliente.
// Props: courseId, sections (de GET /api/admin/courses/:id/editor), busy (bloquea desde el padre), api, notify,
// onReload (async, recarga el editor sin parpadeo), onAddLesson(section), onEditLesson(section, lesson).
// Evaluaciones: onAddQuiz(section, index) abre el editor para crear una en esa posición; onEditQuiz(quizId) lo abre para editar.
// Mover y eliminar evaluaciones se resuelve aquí (mismos controles que las clases).
export function CourseOutline({ courseId, sections, busy = false, api, notify, onReload, onAddLesson, onEditLesson, onAddQuiz, onEditQuiz }) {
  const [items, setItems] = useState(sections);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [impactLoadingId, setImpactLoadingId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(() => readCollapsed(courseId));
  const [moving, setMoving] = useState(null);
  const [quizDeleting, setQuizDeleting] = useState(null);
  const savingRef = useRef(false);
  const rootRef = useRef(null);
  const bodyPrefix = useId();
  const lessonCounts = useRef(new Map(sections.map((section) => [section.id, section.lessons.length])));

  // Mientras se guarda se conserva la vista optimista; al terminar se adopta lo que devuelve el servidor.
  useEffect(() => { if (!savingRef.current) setItems(sections); }, [sections]);

  // Cambia de curso: recarga su estado de secciones contraídas.
  useEffect(() => { setCollapsed(readCollapsed(courseId)); }, [courseId]);

  // Cambia las contraídas y lo guarda por curso; descarta ids de secciones que ya no existen.
  const updateCollapsed = (compute) => {
    setCollapsed((current) => {
      const live = new Set(items.map((section) => section.id));
      const next = [...new Set(compute(current))].filter((id) => live.has(id));
      writeCollapsed(courseId, next);
      return next;
    });
  };
  const toggleSection = (id) => updateCollapsed((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  // Si una sección contraída recibe clases (nueva clase o clase movida) se muestra desplegada.
  useEffect(() => {
    const grown = items.filter((section) => section.lessons.length > (lessonCounts.current.get(section.id) ?? section.lessons.length)).map((section) => section.id);
    lessonCounts.current = new Map(items.map((section) => [section.id, section.lessons.length]));
    if (grown.some((id) => collapsed.includes(id))) updateCollapsed((current) => current.filter((id) => !grown.includes(id)));
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const numbers = useMemo(() => lessonNumbersFromSections(items), [items]);
  const locked = busy || saving || deleteBusy;
  const allCollapsed = items.length > 0 && items.every((section) => collapsed.includes(section.id));
  const noneCollapsed = !items.some((section) => collapsed.includes(section.id));

  const focusAfterMove = (kind, id, direction) => {
    requestAnimationFrame(() => {
      const host = rootRef.current?.querySelector(`[data-outline-${kind}="${id}"]`);
      if (!host) return;
      const preferred = host.querySelector(`[data-move="${direction}"]:not(:disabled)`);
      const fallback = host.querySelector('[data-move]:not(:disabled)') || host.querySelector('[data-handle]');
      (preferred || fallback)?.focus();
    });
  };

  // Aplica `next` de forma optimista, persiste con `persist()` y revierte con aviso si falla.
  const commit = async (next, persist, message, focus, toast) => {
    if (savingRef.current) return;
    const previous = items;
    savingRef.current = true; setSaving(true); setItems(next);
    try {
      await persist();
      setAnnouncement(message);
      if (toast) notify(toast);
      try { await onReload?.(); } catch { /* el estado optimista ya es el correcto */ }
    } catch (error) {
      setItems(previous);
      setAnnouncement('No se pudo guardar el nuevo orden.');
      notify(error.message || 'No se pudo guardar el nuevo orden. Se restauró el orden anterior.');
    } finally {
      savingRef.current = false; setSaving(false);
      if (focus) focusAfterMove(...focus);
    }
  };

  const moveSection = (from, to) => {
    if (locked || to < 0 || to >= items.length || from === to) return;
    const next = moveItem(items, from, to);
    const moved = items[from];
    void commit(
      next,
      () => api(`/api/admin/courses/${courseId}/sections/order`, { method: 'PUT', body: { sectionIds: next.map((section) => section.id) } }),
      `Sección «${moved.title}» movida a la posición ${to + 1} de ${items.length}.`,
      ['section', moved.id, to < from ? 'up' : 'down'],
    );
  };

  const moveLesson = (sectionIndex, from, to) => {
    const section = items[sectionIndex];
    if (locked || !section || to < 0 || to >= section.lessons.length || from === to) return;
    const moved = section.lessons[from];
    const next = items.map((item, index) => index === sectionIndex ? { ...item, lessons: moveItem(item.lessons, from, to) } : item);
    void commit(
      next,
      () => api(`/api/admin/courses/${courseId}/lessons/order`, { method: 'PUT', body: { sections: next.map((item) => ({ id: item.id, lessonIds: item.lessons.map((lesson) => lesson.id) })) } }),
      `${isQuizItem(moved) ? 'Evaluación' : 'Clase'} «${moved.title}» movida a la posición ${to + 1} de ${section.lessons.length} en su sección.`,
      ['lesson', moved.id, to < from ? 'up' : 'down'],
    );
  };

  // Mueve la clase al final de otra sección (el servidor acepta el diseño completo en lessons/order).
  const moveLessonToSection = (fromSectionId, lesson, target) => {
    setMoving(null);
    if (locked || target.id === fromSectionId) return;
    const next = items.map((item) => {
      if (item.id === fromSectionId) return { ...item, lessons: item.lessons.filter((candidate) => candidate.id !== lesson.id) };
      if (item.id === target.id) return { ...item, lessons: [...item.lessons, lesson] };
      return item;
    });
    void commit(
      next,
      () => api(`/api/admin/courses/${courseId}/lessons/order`, { method: 'PUT', body: { sections: next.map((item) => ({ id: item.id, lessonIds: item.lessons.map((candidate) => candidate.id) })) } }),
      `${isQuizItem(lesson) ? 'Evaluación' : 'Clase'} «${lesson.title}» movida a la sección «${target.title}».`,
      ['lesson', lesson.id, 'to'],
      `${isQuizItem(lesson) ? 'Evaluación movida' : 'Clase movida'} a ${target.title}`,
    );
  };

  const onHandleKeyDown = (event, index) => {
    if (event.key === 'ArrowUp') { event.preventDefault(); moveSection(index, index - 1); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); moveSection(index, index + 1); }
  };

  // Arrastrar y soltar nativo: solo el asa inicia el arrastre; la tarjeta completa es zona de destino.
  const onDragStart = (event, index) => {
    if (locked) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `section:${items[index].id}`);
    const card = event.currentTarget.closest('.outline-section');
    if (card) event.dataTransfer.setDragImage(card, 24, 24);
    setDragIndex(index);
  };
  const onDragOver = (event, index) => {
    if (dragIndex === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDropTarget((current) => current && current.index === index && current.position === position ? current : { index, position });
  };
  const endDrag = () => { setDragIndex(null); setDropTarget(null); };
  const onDrop = (event) => {
    event.preventDefault();
    if (dragIndex !== null && dropTarget) {
      let to = dropTarget.index + (dropTarget.position === 'after' ? 1 : 0);
      if (dragIndex < to) to -= 1;
      endDrag();
      moveSection(dragIndex, to);
    } else endDrag();
  };

  const askDelete = async (section) => {
    if (locked || impactLoadingId !== null) return;
    setImpactLoadingId(section.id);
    try {
      const result = await api(`/api/admin/courses/${courseId}/sections/${section.id}/impact`);
      setDeleting({ section, impact: result.impact || { lessons: 0, lessonMaterials: 0, progress: 0, blocked: false } });
    } catch (error) {
      notify(error.message || 'No se pudo calcular el impacto de eliminar la sección.');
    } finally { setImpactLoadingId(null); }
  };

  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const result = await api(`/api/admin/courses/${courseId}/sections/${deleting.section.id}`, { method: 'DELETE' });
      const removed = result?.deleted?.lessons ?? deleting.impact.lessons;
      setItems((current) => current.filter((section) => section.id !== deleting.section.id));
      const removedQuizzes = result?.deleted?.quizzes ?? deleting.impact.quizzes ?? 0;
      notify(removed > 0 || removedQuizzes > 0 ? `Sección eliminada junto con ${[removed > 0 && plural(removed, 'clase', 'clases'), removedQuizzes > 0 && plural(removedQuizzes, 'evaluación', 'evaluaciones')].filter(Boolean).join(' y ')}.` : 'Sección eliminada.');
      setAnnouncement(`Sección «${deleting.section.title}» eliminada.`);
      setDeleting(null);
      await onReload?.();
    } catch (error) {
      notify(error.message || 'No se pudo eliminar la sección.');
      setDeleting(null);
    } finally { setDeleteBusy(false); }
  };

  const impact = deleting?.impact;
  const hasContent = Boolean(impact && (impact.lessons > 0 || impact.lessonMaterials > 0 || impact.quizzes > 0));

  return <div className="outline" ref={rootRef} aria-busy={saving}>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    {saving && <p className="outline-saving" role="status"><LoaderCircle className="button-spinner" size={15} aria-hidden="true" /> Guardando el nuevo orden…</p>}
    {items.length > 0 && <div className="ol-toolbar" role="group" aria-label="Mostrar u ocultar las clases de todas las secciones">
      <button type="button" className="button button-secondary ol-toolbar-button" onClick={() => updateCollapsed(() => items.map((section) => section.id))} disabled={allCollapsed}><ChevronsDownUp size={16} aria-hidden="true" /> Contraer todo</button>
      <button type="button" className="button button-secondary ol-toolbar-button" onClick={() => updateCollapsed(() => [])} disabled={noneCollapsed}><ChevronsUpDown size={16} aria-hidden="true" /> Desplegar todo</button>
    </div>}
    {items.length ? <ol className="outline-list" onDragOver={(event) => { if (dragIndex !== null) event.preventDefault(); }} onDrop={onDrop}>
      {items.map((section, index) => {
        const isCollapsed = collapsed.includes(section.id);
        const bodyId = `${bodyPrefix}-body-${section.id}`;
        const isDragging = dragIndex === index;
        const dropClass = dropTarget && dropTarget.index === index && dragIndex !== null && dragIndex !== index ? ` drop-${dropTarget.position}` : '';
        return <li key={section.id} className={`outline-section${isDragging ? ' is-dragging' : ''}${dropClass}`} data-outline-section={section.id} onDragOver={(event) => onDragOver(event, index)}>
          <div className="outline-section-head">
            <span className="outline-handle" role="button" tabIndex={busy || deleteBusy ? -1 : 0} data-handle draggable={!locked} aria-disabled={locked} onDragStart={(event) => onDragStart(event, index)} onDragEnd={endDrag} onKeyDown={(event) => onHandleKeyDown(event, index)} aria-label={`Arrastrar sección «${section.title}» para reordenarla. También puedes usar las flechas arriba y abajo.`} title="Arrastra para reordenar">
              <GripVertical size={18} aria-hidden="true" />
            </span>
            <div className="outline-section-title">
              <div className="ol-title-row" onClick={(event) => { if (!event.target.closest('button')) toggleSection(section.id); }}>
                <button type="button" className="ol-toggle" onClick={() => toggleSection(section.id)} aria-expanded={!isCollapsed} aria-controls={bodyId} aria-label={`${isCollapsed ? 'Desplegar' : 'Contraer'} sección ${section.title}`} title={isCollapsed ? 'Desplegar sección' : 'Contraer sección'}>
                  <ChevronDown className="ol-chevron" size={20} aria-hidden="true" />
                </button>
                <div className="ol-title-text">
                  <div className="ol-kicker-row">
                    <span className="outline-kicker">Sección {index + 1}</span>
                    <span className="ol-count">{plural(sectionCounts(section).lessons, 'clase', 'clases')}</span>
                    {sectionCounts(section).quizzes > 0 && <span className="ol-count">{plural(sectionCounts(section).quizzes, 'evaluación', 'evaluaciones')}</span>}
                  </div>
                  <h3>{section.title}</h3>
                </div>
              </div>
              {section.description && !isCollapsed && <p>{section.description}</p>}
            </div>
            <div className="outline-actions">
              <button type="button" className="icon-button outline-icon-button" data-move="up" onClick={() => moveSection(index, index - 1)} disabled={locked || index === 0} aria-label={`Subir sección «${section.title}»`} title="Subir sección"><ArrowUp size={17} aria-hidden="true" /></button>
              <button type="button" className="icon-button outline-icon-button" data-move="down" onClick={() => moveSection(index, index + 1)} disabled={locked || index === items.length - 1} aria-label={`Bajar sección «${section.title}»`} title="Bajar sección"><ArrowDown size={17} aria-hidden="true" /></button>
              <button type="button" className="icon-button outline-icon-button outline-delete" onClick={() => void askDelete(section)} disabled={locked || impactLoadingId !== null} aria-label={`Eliminar sección «${section.title}»`} title="Eliminar sección">{impactLoadingId === section.id ? <LoaderCircle className="button-spinner" size={17} aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}</button>
              <button type="button" className="button button-secondary outline-add" onClick={() => onAddLesson(section)} disabled={locked}><Plus size={16} aria-hidden="true" /> Agregar clase</button>
              {onAddQuiz && <button type="button" className="button button-secondary outline-add" onClick={() => onAddQuiz(section, section.lessons.length)} disabled={locked} aria-label={`Agregar evaluación a la sección «${section.title}»`}><ClipboardCheck size={16} aria-hidden="true" /> Agregar evaluación</button>}
            </div>
          </div>
          <div id={bodyId} className={`ol-body${isCollapsed ? ' is-collapsed' : ''}`} role="region" aria-label={`Clases de la sección ${section.title}`}><div className="ol-body-inner">
          {section.lessons.length ? <ol className="outline-lessons">
            {section.lessons.map((lesson, lessonIndex) => {
              const insertFirst = lessonIndex === 0 && onAddQuiz ? <InsertQuizButton section={section} disabled={locked} onInsert={() => onAddQuiz(section, 0)} /> : null;
              const insertAfter = onAddQuiz ? <InsertQuizButton section={section} afterTitle={lesson.title} disabled={locked} onInsert={() => onAddQuiz(section, lessonIndex + 1)} /> : null;
              if (isQuizItem(lesson)) {
                return <Fragment key={lesson.id}>{insertFirst}<QuizRow section={section} quiz={lesson} index={lessonIndex} total={section.lessons.length} locked={locked} items={items} onMoveUp={() => moveLesson(index, lessonIndex, lessonIndex - 1)} onMoveDown={() => moveLesson(index, lessonIndex, lessonIndex + 1)} onMoveTo={() => setMoving({ lesson, sectionId: section.id })} onEdit={() => onEditQuiz?.(lesson.id)} onDelete={() => setQuizDeleting(lesson)} />{insertAfter}</Fragment>;
              }
              const withNumber = { ...lesson, lessonNumber: numbers.get(lesson.id) };
              const count = lesson.materials?.length || 0;
              return <Fragment key={lesson.id}>{insertFirst}<li className="outline-lesson" data-outline-lesson={lesson.id}>
                <CirclePlay className="outline-lesson-icon" size={17} aria-hidden="true" />
                <div className="outline-lesson-main">
                  <div className="outline-lesson-title"><LessonNumber lesson={withNumber} /><strong>{lesson.title}</strong></div>
                  {lesson.description && <span className="outline-lesson-desc">{lesson.description}</span>}
                  <small>{lesson.videoUrl ? 'Video listo' : 'Video pendiente'} · {count} {count === 1 ? 'material' : 'materiales'}</small>
                </div>
                <div className="outline-lesson-actions">
                  <button type="button" className="icon-button outline-icon-button" data-move="up" onClick={() => moveLesson(index, lessonIndex, lessonIndex - 1)} disabled={locked || lessonIndex === 0} aria-label={`Subir clase «${lesson.title}»`} title="Subir clase"><ArrowUp size={16} aria-hidden="true" /></button>
                  <button type="button" className="icon-button outline-icon-button" data-move="down" onClick={() => moveLesson(index, lessonIndex, lessonIndex + 1)} disabled={locked || lessonIndex === section.lessons.length - 1} aria-label={`Bajar clase «${lesson.title}»`} title="Bajar clase"><ArrowDown size={16} aria-hidden="true" /></button>
                  <button type="button" className="button button-secondary ol-move-trigger" data-move="to" onClick={() => setMoving({ lesson, sectionId: section.id })} disabled={locked || items.length < 2} aria-haspopup="dialog" aria-label={`Mover clase «${lesson.title}» a otra sección`} title={items.length < 2 ? 'Crea otra sección para poder mover clases' : 'Mover a otra sección'}><ArrowRightLeft size={15} aria-hidden="true" /> Mover a…</button>
                  <button type="button" className="button button-secondary editor-lesson-edit" onClick={() => onEditLesson(section, lesson)} disabled={locked}><Pencil size={15} aria-hidden="true" /> Editar clase</button>
                </div>
              </li>{insertAfter}</Fragment>;
            })}
          </ol> : <div className="editor-empty">Aún no hay clases en esta sección.</div>}
          </div></div>
        </li>;
      })}
    </ol> : <div className="empty">Aún no hay secciones. Crea la primera desde el panel lateral.</div>}
    {quizDeleting && <DeleteQuizDialog courseId={courseId} quiz={quizDeleting} api={api} notify={notify} onCancel={() => setQuizDeleting(null)} onDone={async () => { setAnnouncement(`Evaluación «${quizDeleting.title}» eliminada.`); setQuizDeleting(null); await onReload?.(); }} />}
    {moving && <MoveLessonDialog lesson={moving.lesson} fromSectionId={moving.sectionId} sections={items} onSelect={(target) => moveLessonToSection(moving.sectionId, moving.lesson, target)} onCancel={() => setMoving(null)} />}
    {deleting && <ConfirmDialog
      title={`Eliminar sección «${deleting.section.title}»`}
      description={hasContent ? 'Esta acción es permanente y no se puede deshacer.' : 'La sección está vacía. ¿Quieres eliminarla?'}
      variant="danger"
      confirmLabel="Eliminar sección"
      busy={deleteBusy}
      confirmDisabled={Boolean(impact?.blocked)}
      onConfirm={() => void confirmDelete()}
      onCancel={() => { if (!deleteBusy) setDeleting(null); }}
    >
      {hasContent && <>
        <ul className="confirm-impact">
          <li>Se borrarán <strong>{plural(impact.lessons, 'clase', 'clases')}</strong>.</li>
          {impact.quizzes > 0 && <li>Se borrarán <strong>{plural(impact.quizzes, 'evaluación', 'evaluaciones')}</strong> con todas sus preguntas.</li>}
          {impact.quizAttempts > 0 && <li>Se perderán <strong>{plural(impact.quizAttempts, 'intento de alumnos', 'intentos de alumnos')}</strong> en las evaluaciones.</li>}
          <li>Se borrarán <strong>{plural(impact.lessonMaterials, 'material de clase', 'materiales de clase')}</strong>.</li>
          {impact.progress > 0 && <li>Se perderán <strong>{plural(impact.progress, 'registro de progreso', 'registros de progreso')}</strong> de los alumnos.</li>}
        </ul>
        <p className="confirm-warning" role="note">El progreso de los alumnos en estas clases se pierde y no se puede recuperar. Los archivos de Cloudinary (videos y materiales) no se eliminan: si ya no los necesitas, bórralos desde Cloudinary.</p>
      </>}
      {impact?.blocked && <p className="confirm-blocked" role="alert">No se puede eliminar: el curso está publicado y se quedaría sin clases con video. Retira el curso del catálogo o agrega otra clase con video primero.</p>}
    </ConfirmDialog>}
  </div>;
}
