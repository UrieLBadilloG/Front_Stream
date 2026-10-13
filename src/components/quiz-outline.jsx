import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRightLeft, ArrowUp, ClipboardCheck, LoaderCircle, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { quizLabelText, requirementText } from '../lib/quizzes.js';
import { ConfirmDialog } from './dialogs.jsx';
import '../styles-quiz-editor.css';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// Fila de evaluación dentro del programa. Usa la misma estructura/clases que .outline-lesson para que los botones
// (data-move="up|down|to"), el foco tras mover y el diseño responsivo funcionen igual que en las clases.
// `quiz` es el elemento de section.lessons con kind === 'quiz' (quiz.quiz = ajustes). `items` son las secciones.
export function QuizRow({ section, quiz, index, total, locked, items, onMoveUp, onMoveDown, onMoveTo, onEdit, onDelete }) {
  const settings = quiz.quiz || {};
  const questionCount = Number(settings.questionCount ?? 0);
  const required = Boolean(settings.isRequired);
  return <li className="outline-lesson qz-outline-row" data-outline-lesson={quiz.id} data-outline-quiz={quiz.id}>
    <ClipboardCheck className="outline-lesson-icon" size={17} aria-hidden="true" />
    <div className="outline-lesson-main">
      <div className="outline-lesson-title">
        <span className="lesson-pill qz-pill">EVALUACIÓN</span>
        <strong>{quiz.title}</strong>
        <span className={`qz-badge ${required ? 'qz-badge-required' : 'qz-badge-optional'}`}>{requirementText(required)}</span>
      </div>
      {quiz.description && <span className="outline-lesson-desc">{quiz.description}</span>}
      <small className="qz-outline-meta">
        <span>{quizLabelText(settings.label)}</span>
        <span>{plural(questionCount, 'pregunta', 'preguntas')}</span>
        <span>Aprobar con {settings.passingPercent ?? 70} %</span>
      </small>
      {questionCount === 0 && <small className="qz-outline-empty"><TriangleAlert size={14} aria-hidden="true" /> Sin preguntas: los alumnos no la ven</small>}
    </div>
    <div className="outline-lesson-actions">
      <button type="button" className="icon-button outline-icon-button" data-move="up" onClick={onMoveUp} disabled={locked || index === 0} aria-label={`Subir evaluación «${quiz.title}»`} title="Subir evaluación"><ArrowUp size={16} aria-hidden="true" /></button>
      <button type="button" className="icon-button outline-icon-button" data-move="down" onClick={onMoveDown} disabled={locked || index === total - 1} aria-label={`Bajar evaluación «${quiz.title}»`} title="Bajar evaluación"><ArrowDown size={16} aria-hidden="true" /></button>
      <button type="button" className="button button-secondary ol-move-trigger" data-move="to" onClick={onMoveTo} disabled={locked || items.length < 2} aria-haspopup="dialog" aria-label={`Mover evaluación «${quiz.title}» a otra sección`} title={items.length < 2 ? 'Crea otra sección para poder mover evaluaciones' : 'Mover a otra sección'}><ArrowRightLeft size={15} aria-hidden="true" /> Mover a…</button>
      <button type="button" className="button button-secondary editor-lesson-edit" onClick={onEdit} disabled={locked} aria-label={`Editar evaluación «${quiz.title}»`}><Pencil size={15} aria-hidden="true" /> Editar evaluación</button>
      <button type="button" className="icon-button outline-icon-button outline-delete" onClick={onDelete} disabled={locked} aria-label={`Eliminar evaluación «${quiz.title}»`} title="Eliminar evaluación"><Trash2 size={16} aria-hidden="true" /></button>
    </div>
  </li>;
}

// Punto de inserción fino entre elementos: visible al pasar el cursor o al enfocar con teclado, y siempre en pantallas táctiles.
export function InsertQuizButton({ section, afterTitle, disabled, onInsert }) {
  const label = afterTitle ? `Insertar evaluación después de «${afterTitle}»` : `Insertar evaluación al inicio de la sección «${section.title}»`;
  return <li className="qz-insert" role="presentation">
    <button type="button" className="qz-insert-button" onClick={onInsert} disabled={disabled} aria-label={label} title={label}>
      <Plus size={13} aria-hidden="true" /> <span>Insertar evaluación aquí</span>
    </button>
  </li>;
}

// Confirmación de borrado: consulta cuántos intentos de alumnos se perderán antes de habilitar el botón.
export function DeleteQuizDialog({ courseId, quiz, api, notify, onDone, onCancel }) {
  const [attempts, setAttempts] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api(`/api/admin/courses/${courseId}/quizzes/${quiz.id}`)
      .then((data) => { if (!cancelled) setAttempts(Number(data.quiz?.attemptCount ?? 0)); })
      .catch(() => { if (!cancelled) setAttempts(-1); });
    return () => { cancelled = true; };
  }, [courseId, quiz.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/api/admin/courses/${courseId}/quizzes/${quiz.id}`, { method: 'DELETE' });
      notify('Evaluación eliminada.');
      await onDone();
    } catch (error) {
      notify(error.message || 'No se pudo eliminar la evaluación.');
      setBusy(false);
    }
  };

  const known = attempts !== null && attempts >= 0;
  return <ConfirmDialog
    title={`Eliminar evaluación «${quiz.title}»`}
    description="Esta acción es permanente y no se puede deshacer."
    variant="danger"
    confirmLabel="Eliminar evaluación"
    busy={busy}
    confirmDisabled={attempts === null}
    onConfirm={() => void confirm()}
    onCancel={onCancel}
  >
    {attempts === null && <p className="qz-delete-note" role="status"><LoaderCircle className="button-spinner" size={15} aria-hidden="true" /> Calculando el impacto…</p>}
    {attempts === -1 && <p className="qz-delete-note">No pudimos contar los intentos de los alumnos. Si los hay, se perderán junto con la evaluación.</p>}
    {known && <ul className="confirm-impact">
      <li>{Number(quiz.quiz?.questionCount ?? 0) === 1 ? 'Se borrará' : 'Se borrarán'} <strong>{plural(Number(quiz.quiz?.questionCount ?? 0), 'pregunta', 'preguntas')}</strong>.</li>
      <li>{attempts > 0 ? <><strong>{plural(attempts, 'intento de alumnos', 'intentos de alumnos')}</strong> se perderán.</> : 'Ningún alumno la ha intentado todavía.'}</li>
    </ul>}
  </ConfirmDialog>;
}
