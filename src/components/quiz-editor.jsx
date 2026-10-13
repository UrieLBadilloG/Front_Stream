import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ClipboardCheck, LoaderCircle, Pencil, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import { QUESTION_LIMITS, blankQuestion, quizLabelText, validateQuestionDraft } from '../lib/quizzes.js';
import { useModalA11y } from './dialogs.jsx';
import { QuizPlayer } from './quiz-player.jsx';
import '../styles-quiz.css';
import '../styles-quiz-editor.css';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const TYPE_TEXT = { single: 'Una respuesta', multiple: 'Varias respuestas', true_false: 'Verdadero o falso' };
const LABEL_OPTIONS = ['diagnostica', 'repaso', 'final', 'otro'];
const SHOW_ANSWERS_OPTIONS = [
  { value: 'after_submit', text: 'Después de cada envío', help: 'El alumno ve las respuestas correctas y la explicación apenas envía, aunque no apruebe.' },
  { value: 'after_pass', text: 'Solo después de aprobar', help: 'Si reprueba solo ve qué preguntas falló. Las respuestas correctas aparecen cuando aprueba.' },
  { value: 'never', text: 'Nunca', help: 'El alumno solo ve qué preguntas acertó o falló, sin las respuestas correctas ni la explicación.' },
];
const TABS = [
  { id: 'settings', label: 'Ajustes' },
  { id: 'questions', label: 'Preguntas' },
  { id: 'preview', label: 'Probar como alumno' },
  { id: 'results', label: 'Resultados' },
];

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);
const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
};

const toDraft = (question) => ({
  id: question.id,
  type: question.type,
  prompt: question.prompt,
  explanation: question.explanation || '',
  points: question.points,
  options: question.options.map((option) => ({ text: option.text, isCorrect: Boolean(option.isCorrect) })),
});

// Cuerpo que espera el servidor (verdadero/falso solo manda la respuesta correcta).
function draftPayload(draft) {
  const base = { type: draft.type, prompt: draft.prompt.trim(), explanation: draft.explanation.trim(), points: draft.points };
  if (draft.type === 'true_false') return { ...base, correct: Boolean(draft.options[0]?.isCorrect) };
  return { ...base, options: draft.options.map((option) => ({ text: option.text.trim(), isCorrect: option.isCorrect })) };
}

// Cambia el tipo conservando enunciado, explicación y puntos.
function changeDraftType(draft, type) {
  if (type === draft.type) return draft;
  const keep = { id: draft.id, prompt: draft.prompt, explanation: draft.explanation, points: draft.points };
  if (type === 'true_false' || draft.type === 'true_false') return { ...blankQuestion(type), ...keep };
  if (type === 'single') {
    const first = draft.options.findIndex((option) => option.isCorrect);
    return { ...draft, type, options: draft.options.map((option, index) => ({ ...option, isCorrect: index === first })) };
  }
  return { ...draft, type };
}

function ErrorText({ id, children }) {
  return children ? <p id={id} className="qz-ed-error"><TriangleAlert size={14} aria-hidden="true" /> <span>{children}</span></p> : null;
}

// Campo con <label for> real: el mensaje de error queda fuera de la etiqueta y se asocia con aria-describedby.
function Field({ label, hint, error, errorId, className = '', children }) {
  const id = useId();
  return <div className={`form-field ${className}`.trim()}>
    <label htmlFor={id}>{label}{hint && <small> {hint}</small>}</label>
    {children(id)}
    <ErrorText id={errorId}>{error}</ErrorText>
  </div>;
}

// Formulario de una pregunta (crear o editar) con validación inline y guardado por pregunta.
function QuestionForm({ initial, saving, saveError, onSave, onCancel }) {
  const [draft, setDraft] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [summary, setSummary] = useState([]);
  const summaryRef = useRef(null);
  const promptRef = useRef(null);
  const baseId = useId();
  const errors = validateQuestionDraft(draft);
  const shown = attempted ? errors : {};
  const isTrueFalse = draft.type === 'true_false';
  const isMultiple = draft.type === 'multiple';

  useEffect(() => { promptRef.current?.focus(); }, []);
  useEffect(() => { if (summary.length && !Object.keys(errors).length) setSummary([]); }, [summary, errors]);

  const update = (changes) => setDraft((current) => ({ ...current, ...changes }));
  const setOption = (index, changes) => setDraft((current) => ({ ...current, options: current.options.map((option, position) => (position === index ? { ...option, ...changes } : option)) }));
  const chooseCorrect = (index, checked) => setDraft((current) => ({
    ...current,
    options: current.options.map((option, position) => {
      if (current.type === 'multiple') return position === index ? { ...option, isCorrect: checked } : option;
      return { ...option, isCorrect: position === index };
    }),
  }));
  const addOption = () => setDraft((current) => (current.options.length >= QUESTION_LIMITS.maxOptions ? current : { ...current, options: [...current.options, { text: '', isCorrect: false }] }));
  const removeOption = (index) => setDraft((current) => (current.options.length <= QUESTION_LIMITS.minOptions ? current : { ...current, options: current.options.filter((_, position) => position !== index) }));

  const submit = (event) => {
    event.preventDefault();
    if (saving) return;
    setAttempted(true);
    const found = Object.values(errors);
    if (found.length) {
      setSummary(found);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    void onSave(draft);
  };

  const describedBy = (...keys) => keys.filter((key) => shown[key]).map((key) => `${baseId}-err-${key}`).join(' ') || undefined;

  return <form className="qz-ed-form" onSubmit={submit} noValidate aria-label={draft.id ? 'Editar pregunta' : 'Nueva pregunta'}>
    <h3 className="qz-ed-form-title">{draft.id ? 'Editar pregunta' : 'Nueva pregunta'}</h3>
    {summary.length > 0 && <div className="qz-ed-summary" role="alert" tabIndex={-1} ref={summaryRef}>
      <strong>Revisa la pregunta antes de guardar:</strong>
      <ul>{summary.map((message) => <li key={message}>{message}</li>)}</ul>
    </div>}
    {saveError && <p className="qz-alert" role="alert"><TriangleAlert size={16} aria-hidden="true" /> {saveError}</p>}

    <Field label="Tipo de pregunta">
      {(id) => <select id={id} value={draft.type} onChange={(event) => setDraft((current) => changeDraftType(current, event.target.value))} disabled={saving}>
        {Object.entries(TYPE_TEXT).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>}
    </Field>

    <Field label="Enunciado" error={shown.prompt} errorId={`${baseId}-err-prompt`}>
      {(id) => <textarea id={id} ref={promptRef} rows="3" value={draft.prompt} onChange={(event) => update({ prompt: event.target.value })} maxLength={QUESTION_LIMITS.promptMax + 200} aria-invalid={Boolean(shown.prompt)} aria-describedby={describedBy('prompt')} disabled={saving} />}
    </Field>

    {isTrueFalse ? <fieldset className="qz-ed-fieldset" aria-describedby={describedBy('correct', 'options')}>
      <legend>Respuesta correcta</legend>
      <div className="qz-ed-tf">
        {draft.options.map((option, index) => <label key={option.text} className={`qz-ed-choice${option.isCorrect ? ' is-selected' : ''}`}>
          <input type="radio" name={`${baseId}-tf`} checked={option.isCorrect} onChange={() => chooseCorrect(index, true)} disabled={saving} />
          <span>{option.text}</span>
        </label>)}
      </div>
      <ErrorText id={`${baseId}-err-correct`}>{shown.correct}</ErrorText>
      <ErrorText id={`${baseId}-err-options`}>{shown.options}</ErrorText>
    </fieldset> : <fieldset className="qz-ed-fieldset" aria-describedby={describedBy('correct', 'options')}>
      <legend>Opciones de respuesta</legend>
      <p className="qz-ed-help">{isMultiple ? 'Marca todas las respuestas correctas (al menos una).' : 'Marca la única respuesta correcta.'} Entre {QUESTION_LIMITS.minOptions} y {QUESTION_LIMITS.maxOptions} opciones.</p>
      <ul className="qz-ed-options">
        {draft.options.map((option, index) => <li key={index} className="qz-ed-option">
          <label className={`qz-ed-correct${option.isCorrect ? ' is-selected' : ''}`}>
            <input type={isMultiple ? 'checkbox' : 'radio'} name={`${baseId}-correct`} checked={option.isCorrect} onChange={(event) => chooseCorrect(index, event.target.checked)} aria-label={`La opción ${index + 1} es correcta`} disabled={saving} />
            <span>Correcta</span>
          </label>
          <input type="text" className="qz-ed-option-text" value={option.text} onChange={(event) => setOption(index, { text: event.target.value })} aria-label={`Texto de la opción ${index + 1}`} placeholder={`Opción ${index + 1}`} aria-invalid={Boolean(shown.options) && !option.text.trim()} disabled={saving} />
          <button type="button" className="icon-button outline-icon-button" onClick={() => removeOption(index)} disabled={saving || draft.options.length <= QUESTION_LIMITS.minOptions} aria-label={`Quitar la opción ${index + 1}`} title="Quitar opción"><X size={16} aria-hidden="true" /></button>
        </li>)}
      </ul>
      <ErrorText id={`${baseId}-err-options`}>{shown.options}</ErrorText>
      <ErrorText id={`${baseId}-err-correct`}>{shown.correct}</ErrorText>
      <button type="button" className="button button-secondary qz-ed-small" onClick={addOption} disabled={saving || draft.options.length >= QUESTION_LIMITS.maxOptions}><Plus size={15} aria-hidden="true" /> Agregar opción</button>
    </fieldset>}

    <Field label="Explicación" hint="(opcional, se muestra según la configuración de respuestas)" error={shown.explanation} errorId={`${baseId}-err-explanation`}>
      {(id) => <textarea id={id} rows="2" value={draft.explanation} onChange={(event) => update({ explanation: event.target.value })} aria-invalid={Boolean(shown.explanation)} aria-describedby={describedBy('explanation')} disabled={saving} />}
    </Field>

    <Field label="Puntos" className="qz-ed-points" error={shown.points} errorId={`${baseId}-err-points`}>
      {(id) => <input id={id} type="number" inputMode="numeric" min={QUESTION_LIMITS.pointsMin} max={QUESTION_LIMITS.pointsMax} step="1" value={Number.isNaN(draft.points) ? '' : draft.points} onChange={(event) => update({ points: event.target.value === '' ? Number.NaN : Number(event.target.value) })} aria-invalid={Boolean(shown.points)} aria-describedby={describedBy('points')} disabled={saving} />}
    </Field>

    <div className="qz-ed-actions">
      <button type="submit" className="button button-primary" disabled={saving}>{saving ? <><LoaderCircle className="button-spinner" size={16} aria-hidden="true" /> Guardando…</> : <><Check size={16} aria-hidden="true" /> Guardar pregunta</>}</button>
      <button type="button" className="button button-secondary" onClick={onCancel} disabled={saving}>Cancelar</button>
    </div>
  </form>;
}

function QuestionsPanel({ courseId, quiz, api, notify, onMutated, onEditingChange, cancelRef, announce }) {
  const [editing, setEditing] = useState(null);
  const [newType, setNewType] = useState('single');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const listRef = useRef(null);
  const typeId = useId();
  const questions = quiz.questions || [];
  const base = `/api/admin/courses/${courseId}/quizzes/${quiz.id}/questions`;

  useEffect(() => { onEditingChange(Boolean(editing)); return () => onEditingChange(false); }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  // Escape con el formulario abierto cancela el formulario (no cierra el drawer ni pierde otras preguntas).
  useEffect(() => { cancelRef.current = () => { setEditing(null); setSaveError(''); }; return () => { cancelRef.current = null; }; }, [cancelRef]);

  // El botón que abrió la confirmación desaparece: el foco pasa explícitamente a «No» (la opción segura).
  useEffect(() => {
    if (confirmId === null) return undefined;
    const frame = requestAnimationFrame(() => listRef.current?.querySelector(`[data-question="${confirmId}"] .qz-ed-confirm button:last-child`)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [confirmId]);

  const focusRow = (questionId, selector) => requestAnimationFrame(() => {
    const row = listRef.current?.querySelector(`[data-question="${questionId}"]`);
    (row?.querySelector(`${selector}:not(:disabled)`) || row?.querySelector('button:not(:disabled)'))?.focus();
  });

  const save = async (draft) => {
    setSaving(true); setSaveError('');
    try {
      await api(draft.id ? `${base}/${draft.id}` : base, { method: draft.id ? 'PUT' : 'POST', body: draftPayload(draft) });
      setEditing(null); setSaving(false);
      announce(draft.id ? 'Pregunta actualizada.' : 'Pregunta agregada.');
      await onMutated();
    } catch (error) {
      setSaveError(error.message || 'No se pudo guardar la pregunta.');
    } finally { setSaving(false); }
  };

  const move = async (index, direction) => {
    const target = index + direction;
    if (busyId !== null || target < 0 || target >= questions.length) return;
    const ids = questions.map((question) => question.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const movedId = questions[index].id;
    setBusyId(movedId);
    try {
      await api(`${base}/order`, { method: 'PUT', body: { questionIds: ids } });
      announce(`Pregunta ${index + 1} movida a la posición ${target + 1} de ${questions.length}.`);
      await onMutated();
      focusRow(movedId, direction < 0 ? '[data-qmove="up"]' : '[data-qmove="down"]');
    } catch (error) {
      notify(error.message || 'No se pudo cambiar el orden de las preguntas.');
    } finally { setBusyId(null); }
  };

  const remove = async (question, index) => {
    setBusyId(question.id);
    try {
      await api(`${base}/${question.id}`, { method: 'DELETE' });
      setConfirmId(null);
      announce(`Pregunta ${index + 1} eliminada.`);
      await onMutated();
      requestAnimationFrame(() => document.getElementById(`${typeId}-add`)?.focus());
    } catch (error) {
      notify(error.message || 'No se pudo eliminar la pregunta.');
    } finally { setBusyId(null); }
  };

  if (editing) return <QuestionForm key={editing.id ?? 'new'} initial={editing} saving={saving} saveError={saveError} onSave={save} onCancel={() => { setEditing(null); setSaveError(''); }} />;

  return <div className="qz-ed-questions">
    <div className="qz-ed-add">
      <label className="qz-ed-add-label" htmlFor={typeId}>Tipo de pregunta nueva</label>
      <select id={typeId} value={newType} onChange={(event) => setNewType(event.target.value)}>
        {Object.entries(TYPE_TEXT).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
      <button type="button" id={`${typeId}-add`} className="button button-primary" onClick={() => { setSaveError(''); setEditing(blankQuestion(newType)); }} disabled={questions.length >= 100}><Plus size={16} aria-hidden="true" /> Agregar pregunta</button>
    </div>
    {questions.length === 0 ? <p className="qz-ed-empty" role="note">Aún no hay preguntas. Una evaluación sin preguntas no la ven los alumnos y no se puede publicar el curso con ella.</p>
      : <ol className="qz-ed-qlist" ref={listRef}>
        {questions.map((question, index) => {
          const problems = Object.keys(validateQuestionDraft(toDraft(question))).length;
          const confirming = confirmId === question.id;
          const busy = busyId === question.id;
          return <li key={question.id} className="qz-ed-qcard" data-question={question.id}>
            <div className="qz-ed-qmain">
              <div className="qz-ed-qmeta">
                <span className="qz-qnum">Pregunta {index + 1}</span>
                <span className="qz-ed-tag">{TYPE_TEXT[question.type]}</span>
                <span className="qz-ed-tag">{plural(question.points, 'punto', 'puntos')}</span>
                <span className="qz-ed-tag">{plural(question.options.length, 'opción', 'opciones')}</span>
                {problems > 0 && <span className="qz-ed-tag qz-ed-tag-warn"><TriangleAlert size={13} aria-hidden="true" /> Revisar</span>}
              </div>
              <p className="qz-ed-qprompt">{truncate(question.prompt, 140)}</p>
            </div>
            {confirming ? <div className="qz-ed-confirm" role="group" aria-label={`Confirmar eliminar la pregunta ${index + 1}`}>
              <span>¿Eliminar pregunta?</span>
              <button type="button" className="button button-danger qz-ed-small" onClick={() => void remove(question, index)} disabled={busy}>{busy ? 'Eliminando…' : 'Sí'}</button>
              <button type="button" className="button button-secondary qz-ed-small" onClick={() => setConfirmId(null)} disabled={busy} autoFocus>No</button>
            </div> : <div className="qz-ed-qactions">
              <button type="button" className="icon-button outline-icon-button" data-qmove="up" onClick={() => void move(index, -1)} disabled={busyId !== null || index === 0} aria-label={`Subir pregunta ${index + 1}`} title="Subir pregunta"><ArrowUp size={16} aria-hidden="true" /></button>
              <button type="button" className="icon-button outline-icon-button" data-qmove="down" onClick={() => void move(index, 1)} disabled={busyId !== null || index === questions.length - 1} aria-label={`Bajar pregunta ${index + 1}`} title="Bajar pregunta"><ArrowDown size={16} aria-hidden="true" /></button>
              <button type="button" className="button button-secondary qz-ed-small" onClick={() => { setSaveError(''); setEditing(toDraft(question)); }} disabled={busyId !== null} aria-label={`Editar pregunta ${index + 1}`}><Pencil size={14} aria-hidden="true" /> Editar</button>
              <button type="button" className="icon-button outline-icon-button outline-delete" onClick={() => setConfirmId(question.id)} disabled={busyId !== null} aria-label={`Eliminar pregunta ${index + 1}`} title="Eliminar pregunta"><Trash2 size={16} aria-hidden="true" /></button>
            </div>}
          </li>;
        })}
      </ol>}
  </div>;
}

function SettingsPanel({ courseId, sections, mode, quiz, placement, api, notify, onCreated, onSaved, announce }) {
  const baseId = useId();
  const [form, setForm] = useState(() => ({
    title: quiz?.title ?? '',
    description: quiz?.description ?? '',
    label: quiz?.label ?? 'otro',
    passingPercent: String(quiz?.passingPercent ?? 70),
    isRequired: Boolean(quiz?.isRequired),
    unlimited: quiz ? quiz.maxAttempts === null : true,
    maxAttempts: String(quiz?.maxAttempts ?? 3),
    showAnswers: quiz?.showAnswers ?? 'after_submit',
    placement: placement || '',
  }));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const set = (changes) => setForm((current) => ({ ...current, ...changes }));

  const errors = {};
  if (!form.title.trim()) errors.title = 'Escribe el título de la evaluación.';
  else if (form.title.trim().length > 180) errors.title = 'El título no puede superar 180 caracteres.';
  const passing = Number(form.passingPercent);
  if (form.passingPercent === '' || !Number.isInteger(passing) || passing < 1 || passing > 100) errors.passingPercent = 'Indica un porcentaje entero entre 1 y 100.';
  const attempts = Number(form.maxAttempts);
  if (!form.unlimited && (form.maxAttempts === '' || !Number.isInteger(attempts) || attempts < 1 || attempts > 99)) errors.maxAttempts = 'Indica un número de intentos entre 1 y 99.';
  const shown = attempted ? errors : {};
  const describedBy = (key) => (shown[key] ? `${baseId}-err-${key}` : undefined);

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setAttempted(true); setServerError('');
    if (Object.keys(errors).length) return;
    const body = {
      title: form.title.trim(),
      description: form.description.trim(),
      label: form.label,
      passingPercent: passing,
      isRequired: form.isRequired,
      maxAttempts: form.unlimited ? null : attempts,
      showAnswers: form.showAnswers,
    };
    setSaving(true);
    try {
      if (mode === 'create') {
        const [sectionId, index] = form.placement.split(':').map(Number);
        const data = await api(`/api/admin/courses/${courseId}/quizzes`, { method: 'POST', body: { ...body, sectionId, index } });
        notify('Evaluación creada. Ahora agrega las preguntas.');
        await onCreated(data.quiz);
      } else {
        await api(`/api/admin/courses/${courseId}/quizzes/${quiz.id}`, { method: 'PATCH', body });
        announce('Ajustes guardados.');
        notify('Ajustes de la evaluación guardados.');
        await onSaved();
      }
    } catch (error) {
      setServerError(error.message || 'No se pudo guardar la evaluación.');
    } finally { setSaving(false); }
  };

  const answersHelp = SHOW_ANSWERS_OPTIONS.find((option) => option.value === form.showAnswers)?.help;

  return <form className="qz-ed-form" onSubmit={submit} noValidate>
    {serverError && <p className="qz-alert" role="alert"><TriangleAlert size={16} aria-hidden="true" /> {serverError}</p>}
    <Field label="Título" error={shown.title} errorId={`${baseId}-err-title`}>
      {(id) => <input id={id} type="text" value={form.title} onChange={(event) => set({ title: event.target.value })} maxLength={200} aria-invalid={Boolean(shown.title)} aria-describedby={describedBy('title')} disabled={saving} data-autofocus={mode === 'create' ? '' : undefined} placeholder="Ej. Evaluación diagnóstica" />}
    </Field>
    <Field label="Descripción o instrucciones" hint="(opcional)">
      {(id) => <textarea id={id} rows="3" value={form.description} onChange={(event) => set({ description: event.target.value })} disabled={saving} />}
    </Field>
    {mode === 'create' && <div className="form-field">
      <label htmlFor={`${baseId}-placement`}>Ubicación en el programa</label>
      <select id={`${baseId}-placement`} value={form.placement} onChange={(event) => set({ placement: event.target.value })} aria-describedby={`${baseId}-placement-help`} disabled={saving}>
        {sections.map((section, sectionIndex) => <optgroup key={section.id} label={`Sección ${sectionIndex + 1} · ${section.title}`}>
          <option value={`${section.id}:0`}>Al inicio de la sección</option>
          {section.lessons.map((lesson, index) => <option key={lesson.id} value={`${section.id}:${index + 1}`}>Después de: {lesson.title}</option>)}
        </optgroup>)}
      </select>
      <small id={`${baseId}-placement-help`} className="qz-ed-help">La numeración «Clase N» de los videos no cambia.</small>
    </div>}
    <div className="qz-ed-grid">
      <Field label="Tipo">
        {(id) => <select id={id} value={form.label} onChange={(event) => set({ label: event.target.value })} disabled={saving}>
          {LABEL_OPTIONS.map((value) => <option key={value} value={value}>{quizLabelText(value)}</option>)}
        </select>}
      </Field>
      <Field label="Porcentaje para aprobar" error={shown.passingPercent} errorId={`${baseId}-err-passingPercent`}>
        {(id) => <input id={id} type="number" inputMode="numeric" min="1" max="100" step="1" value={form.passingPercent} onChange={(event) => set({ passingPercent: event.target.value })} aria-invalid={Boolean(shown.passingPercent)} aria-describedby={describedBy('passingPercent')} disabled={saving} />}
      </Field>
    </div>

    <fieldset className="qz-ed-fieldset">
      <legend>Al reprobar</legend>
      <div className="qz-ed-radios">
        <label className={`qz-ed-choice${form.isRequired ? ' is-selected' : ''}`}>
          <input type="radio" name={`${baseId}-required`} checked={form.isRequired} onChange={() => set({ isRequired: true })} disabled={saving} />
          <span><strong>Obligatoria</strong><small>No puede avanzar hasta aprobar</small></span>
        </label>
        <label className={`qz-ed-choice${!form.isRequired ? ' is-selected' : ''}`}>
          <input type="radio" name={`${baseId}-required`} checked={!form.isRequired} onChange={() => set({ isRequired: false })} disabled={saving} />
          <span><strong>Opcional</strong><small>Puede continuar aunque no apruebe</small></span>
        </label>
      </div>
    </fieldset>

    <fieldset className="qz-ed-fieldset">
      <legend>Intentos</legend>
      <label className="qz-ed-check"><input type="checkbox" checked={form.unlimited} onChange={(event) => set({ unlimited: event.target.checked })} disabled={saving} /> <span>Intentos ilimitados</span></label>
      {!form.unlimited && <Field label="Máximo de intentos" error={shown.maxAttempts} errorId={`${baseId}-err-maxAttempts`}>
        {(id) => <input id={id} type="number" inputMode="numeric" min="1" max="99" step="1" value={form.maxAttempts} onChange={(event) => set({ maxAttempts: event.target.value })} aria-invalid={Boolean(shown.maxAttempts)} aria-describedby={describedBy('maxAttempts')} disabled={saving} />}
      </Field>}
    </fieldset>

    <div className="form-field">
      <label htmlFor={`${baseId}-answers`}>Mostrar respuestas</label>
      <select id={`${baseId}-answers`} value={form.showAnswers} onChange={(event) => set({ showAnswers: event.target.value })} aria-describedby={`${baseId}-answers-help`} disabled={saving}>
        {SHOW_ANSWERS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
      </select>
      <small id={`${baseId}-answers-help`} className="qz-ed-help">{answersHelp}</small>
    </div>

    <div className="qz-ed-actions">
      <button type="submit" className="button button-primary" disabled={saving}>
        {saving ? <><LoaderCircle className="button-spinner" size={16} aria-hidden="true" /> Guardando…</> : mode === 'create' ? 'Crear evaluación' : 'Guardar ajustes'}
      </button>
    </div>
  </form>;
}

function ResultsPanel({ courseId, quizId, api }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    api(`/api/admin/courses/${courseId}/quizzes/${quizId}/results?page=${page}&pageSize=20`)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || 'No se pudieron cargar los resultados.'); });
    return () => { cancelled = true; };
  }, [courseId, quizId, page]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="qz-alert" role="alert"><TriangleAlert size={16} aria-hidden="true" /> {error}</p>;
  if (!data) return <p className="qz-ed-loading" role="status"><LoaderCircle className="button-spinner" size={16} aria-hidden="true" /> Cargando resultados…</p>;
  const pages = Math.max(1, Math.ceil(data.totalAttempts / data.pageSize));
  const { summary } = data;
  return <div className="qz-ed-results">
    <dl className="qz-ed-summary-stats">
      <div><dt>Alumnos</dt><dd>{summary.students}</dd></div>
      <div><dt>Intentos</dt><dd>{summary.attempts}</dd></div>
      <div><dt>Aprobaron</dt><dd>{summary.passedStudents}</dd></div>
      <div><dt>Promedio</dt><dd>{summary.averageScore === null ? '—' : `${summary.averageScore.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`}</dd></div>
    </dl>
    {data.attempts.length === 0 ? <p className="qz-ed-empty">Ningún alumno ha enviado esta evaluación todavía.</p> : <div className="qz-ed-table-wrap" tabIndex={0} role="region" aria-label="Intentos de los alumnos">
      <table className="qz-ed-table">
        <caption className="sr-only">Intentos de los alumnos, del más reciente al más antiguo</caption>
        <thead><tr><th scope="col">Alumno</th><th scope="col">Intento</th><th scope="col">Puntaje</th><th scope="col">Aprobado</th><th scope="col">Fecha</th></tr></thead>
        <tbody>
          {data.attempts.map((attempt) => <tr key={`${attempt.userId}-${attempt.attemptNo}`}>
            <th scope="row"><span>{attempt.fullName}</span><small>{attempt.email}</small></th>
            <td>{attempt.attemptNo}</td>
            <td>{attempt.scorePercent.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %</td>
            <td>{attempt.passed ? 'Sí' : 'No'}</td>
            <td>{formatDate(attempt.submittedAt)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>}
    {pages > 1 && <nav className="qz-ed-pager" aria-label="Paginación de resultados">
      <button type="button" className="button button-secondary qz-ed-small" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Anterior</button>
      <span>Página {page} de {pages}</span>
      <button type="button" className="button button-secondary qz-ed-small" onClick={() => setPage((current) => Math.min(pages, current + 1))} disabled={page >= pages}>Siguiente</button>
    </nav>}
  </div>;
}

// Drawer del docente para crear/editar una evaluación. target: {mode:'create', sectionId, index} | {mode:'edit', quizId}.
export function QuizEditorDrawer({ courseId, sections, target, api, notify, onClose, onChanged }) {
  const titleId = useId();
  const tabsId = useId();
  const [quizId, setQuizId] = useState(target.mode === 'edit' ? target.quizId : null);
  const [quiz, setQuiz] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('settings');
  const [version, setVersion] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [justCreated, setJustCreated] = useState(false);
  const editingRef = useRef(false);
  const cancelFormRef = useRef(null);
  const creating = quizId === null;
  const base = `/api/admin/courses/${courseId}`;

  const closeOrCancel = () => {
    if (editingRef.current) { cancelFormRef.current?.(); return; }
    onClose();
  };
  const modalRef = useModalA11y({ onEscape: closeOrCancel });

  const announce = useCallback((message) => { setAnnouncement(''); requestAnimationFrame(() => setAnnouncement(message)); }, []);

  const load = useCallback(async (id) => {
    const data = await api(`${base}/quizzes/${id}`);
    setQuiz(data.quiz);
    return data.quiz;
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (quizId === null) return undefined;
    let cancelled = false;
    setLoadError('');
    load(quizId).catch((error) => { if (!cancelled) setLoadError(error.message || 'No se pudo cargar la evaluación.'); });
    return () => { cancelled = true; };
  }, [quizId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tras cada mutación: recarga el detalle, reinicia la vista previa y avisa al editor del curso (recarga silenciosa).
  const refresh = useCallback(async () => {
    if (quizId !== null) { try { await load(quizId); } catch (error) { notify(error.message || 'No se pudo actualizar la evaluación.'); } }
    setVersion((current) => current + 1);
    try { await onChanged?.(); } catch { /* el editor del curso ya avisa si falla */ }
  }, [quizId, load, onChanged, notify]);

  const created = async (newQuiz) => {
    setQuizId(Number(newQuiz.id));
    setJustCreated(true);
    setTab('questions');
    announce('Evaluación creada. Ahora agrega las preguntas.');
    try { await onChanged?.(); } catch { /* ignorado */ }
  };

  const placement = (() => {
    if (target.mode !== 'create') return '';
    const section = sections.find((item) => item.id === target.sectionId) || sections[0];
    if (!section) return '';
    const index = Math.max(0, Math.min(Number.isInteger(target.index) ? target.index : section.lessons.length, section.lessons.length));
    return `${section.id}:${index}`;
  })();

  const onTabKeyDown = (event) => {
    const available = TABS.filter((item) => !(creating && item.id !== 'settings'));
    const current = available.findIndex((item) => item.id === tab);
    let next = -1;
    if (event.key === 'ArrowRight') next = (current + 1) % available.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + available.length) % available.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = available.length - 1;
    if (next < 0) return;
    event.preventDefault();
    setTab(available[next].id);
    requestAnimationFrame(() => document.getElementById(`${tabsId}-tab-${available[next].id}`)?.focus());
  };

  const questionCount = quiz?.questions?.length ?? 0;
  const heading = creating ? 'Nueva evaluación' : quiz ? quiz.title : 'Evaluación';

  return <div className="course-lesson-drawer-backdrop qz-ed-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={modalRef} tabIndex={-1} className="course-lesson-drawer qz-ed" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <div className="section-heading">
        <div>
          <span className="qz-pill"><ClipboardCheck size={13} aria-hidden="true" /> EVALUACIÓN</span>
          <h2 id={titleId}>{heading}</h2>
          {!creating && quiz && <p>{quiz.attemptCount > 0 ? `${plural(quiz.attemptCount, 'intento de alumnos', 'intentos de alumnos')}` : 'Sin intentos de alumnos todavía'} · {plural(questionCount, 'pregunta', 'preguntas')}</p>}
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar editor de evaluación" data-autofocus={creating ? undefined : ''}><X size={18} aria-hidden="true" /></button>
      </div>

      <div className="qz-ed-tabs" role="tablist" aria-label="Secciones del editor de evaluación" onKeyDown={onTabKeyDown}>
        {TABS.map((item) => {
          const disabled = creating && item.id !== 'settings';
          return <button key={item.id} id={`${tabsId}-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`${tabsId}-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} disabled={disabled} className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>;
        })}
      </div>

      {loadError ? <p className="qz-alert" role="alert"><TriangleAlert size={16} aria-hidden="true" /> {loadError}</p>
        : !creating && !quiz ? <p className="qz-ed-loading" role="status"><LoaderCircle className="button-spinner" size={16} aria-hidden="true" /> Cargando evaluación…</p>
        : <div role="tabpanel" id={`${tabsId}-panel-${tab}`} aria-labelledby={`${tabsId}-tab-${tab}`} className="qz-ed-panel">
          {tab === 'settings' && <SettingsPanel key={quiz?.id ?? 'new'} courseId={courseId} sections={sections} mode={creating ? 'create' : 'edit'} quiz={quiz} placement={placement} api={api} notify={notify} onCreated={created} onSaved={refresh} announce={announce} />}
          {tab === 'questions' && quiz && <>
            {justCreated && <p className="qz-note qz-note-ok" role="note"><Check size={16} aria-hidden="true" /> Evaluación creada. Ahora agrega las preguntas.</p>}
            <QuestionsPanel courseId={courseId} quiz={quiz} api={api} notify={notify} onMutated={refresh} announce={announce} onEditingChange={(value) => { editingRef.current = value; }} cancelRef={cancelFormRef} />
          </>}
          {tab === 'preview' && quiz && <div className="qz-ed-preview">
            <p className="qz-ed-banner" role="note">Vista previa: no se guarda ningún intento</p>
            {questionCount === 0 ? <p className="qz-ed-empty">Agrega al menos una pregunta para probar la evaluación.</p> : <QuizPlayer key={`${quiz.id}-${version}`} courseId={courseId} quizId={quiz.id} item={quiz} api={api} notify={notify} preview />}
          </div>}
          {tab === 'results' && quiz && <ResultsPanel key={`${quiz.id}-${version}`} courseId={courseId} quizId={quiz.id} api={api} />}
        </div>}
    </div>
  </div>;
}
