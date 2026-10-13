import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ClipboardCheck, Lock, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { attemptsText, quizLabelText, requirementText } from '../lib/quizzes.js';
import '../styles-quiz.css';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const formatPercent = (value) => `${Number(value ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`;

// Mensaje en español según el código público del servidor.
function submitErrorMessage(error) {
  if (error?.code === 'ATTEMPTS_EXHAUSTED') return 'Ya usaste todos los intentos de esta evaluación.';
  if (error?.code === 'QUIZ_ALREADY_PASSED') return 'Ya aprobaste esta evaluación. No necesitas enviarla de nuevo.';
  if (error?.code === 'QUIZ_REQUIRED') return 'Primero debes aprobar la evaluación obligatoria anterior.';
  if (error?.status === 429) return 'Enviaste demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.';
  return error?.message || 'No pudimos enviar tus respuestas. Inténtalo de nuevo.';
}

function QuizChips({ quiz }) {
  return <ul className="qz-chips" aria-label="Datos de la evaluación">
    <li className={`qz-chip ${quiz.isRequired ? 'qz-chip-required' : 'qz-chip-optional'}`}>{requirementText(quiz.isRequired)}</li>
    <li className="qz-chip">{quizLabelText(quiz.label)}</li>
    <li className="qz-chip">{plural(quiz.questionCount ?? quiz.questions?.length ?? 0, 'pregunta', 'preguntas')}</li>
    <li className="qz-chip">Aprobar con {quiz.passingPercent} %</li>
  </ul>;
}

export function QuizPlayer({ courseId, quizId, item, api, notify, onResult, onContinue, canContinue = false, preview = false }) {
  const [quiz, setQuiz] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState('intro');
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [confirmPartial, setConfirmPartial] = useState(false);
  const titleRef = useRef(null);
  const resultRef = useRef(null);
  const warningId = useId();
  const progressId = useId();
  const baseId = useId();

  const basePath = `/api/courses/${courseId}/quizzes/${quizId}`;

  useEffect(() => {
    let cancelled = false;
    setQuiz(null); setLoadError(''); setView('intro'); setAnswers({}); setResult(null); setError(''); setConfirmPartial(false);
    api(basePath)
      .then((data) => { if (!cancelled) setQuiz(data.quiz); })
      .catch((requestError) => { if (!cancelled) setLoadError(requestError?.message || 'No pudimos cargar la evaluación.'); });
    return () => { cancelled = true; };
  }, [courseId, quizId]);

  // Mueve el foco al encabezado de la vista nueva (resultado o formulario) para lectores de pantalla y teclado.
  useEffect(() => {
    if (view === 'result') resultRef.current?.focus();
    else if (view === 'form') titleRef.current?.focus();
  }, [view]);

  const questions = quiz?.questions ?? [];
  const answeredCount = useMemo(() => questions.filter((question) => (answers[question.id] ?? []).length > 0).length, [questions, answers]);
  const unanswered = questions.length - answeredCount;

  const startAttempt = () => {
    setAnswers({}); setResult(null); setError(''); setConfirmPartial(false); setView('form');
  };

  const setSingle = (questionId, optionId) => {
    setAnswers((current) => ({ ...current, [questionId]: [optionId] }));
    setConfirmPartial(false);
  };

  const toggleMultiple = (questionId, optionId) => {
    setAnswers((current) => {
      const selected = current[questionId] ?? [];
      return { ...current, [questionId]: selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId] };
    });
    setConfirmPartial(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    if (unanswered > 0 && !confirmPartial) { setConfirmPartial(true); return; }
    setSubmitting(true); setError('');
    const payload = Object.fromEntries(questions.filter((question) => (answers[question.id] ?? []).length > 0).map((question) => [question.id, answers[question.id]]));
    try {
      const data = await api(`${basePath}/attempts`, { method: 'POST', body: { answers: payload, preview } });
      setResult(data);
      setQuiz((current) => current ? {
        ...current,
        attemptsUsed: preview ? current.attemptsUsed : (current.attemptsUsed ?? 0) + 1,
        attemptsLeft: preview ? current.attemptsLeft : data.attemptsLeft,
        passed: preview ? current.passed : Boolean(current.passed || data.passed),
        bestScorePercent: preview ? current.bestScorePercent : Math.max(Number(current.bestScorePercent ?? 0), Number(data.scorePercent ?? 0)),
      } : current);
      setView('result');
      try { await onResult?.(data); } catch { /* el padre ya avisa si no pudo recargar */ }
    } catch (requestError) {
      setError(submitErrorMessage(requestError));
      if (['QUIZ_ALREADY_PASSED', 'QUIZ_REQUIRED', 'ATTEMPTS_EXHAUSTED'].includes(requestError?.code)) {
        try { await onResult?.(null); } catch { /* el padre ya avisa */ }
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) return <section className="qz-root qz-card" aria-labelledby={`${baseId}-title`}>
    <h1 id={`${baseId}-title`} className="qz-title">{item?.title || 'Evaluación'}</h1>
    <p role="alert" className="qz-alert"><AlertCircle size={18} aria-hidden="true" /> {loadError}</p>
  </section>;
  if (!quiz) return <section className="qz-root qz-card" aria-busy="true" aria-label="Cargando evaluación"><div className="qz-skeleton" /><div className="qz-skeleton qz-skeleton-short" /></section>;

  const exhausted = !preview && !quiz.passed && quiz.attemptsLeft === 0;

  if (view === 'form') {
    return <section className="qz-root qz-card" aria-labelledby={`${baseId}-title`}>
      <header className="qz-head">
        <h1 id={`${baseId}-title`} className="qz-title" tabIndex={-1} ref={titleRef}>{quiz.title}</h1>
        {preview && <p className="qz-preview-note">Vista previa: tus respuestas no se guardan.</p>}
      </header>
      <form className="qz-form" onSubmit={submit} noValidate>
        {questions.map((question, index) => {
          const multiple = question.type === 'multiple';
          const selected = answers[question.id] ?? [];
          const hintId = `${baseId}-hint-${question.id}`;
          return <fieldset className="qz-question" key={question.id} aria-describedby={multiple ? hintId : undefined}>
            <legend className="qz-legend"><span className="qz-qnum">Pregunta {index + 1} de {questions.length}</span><span className="qz-points">{plural(question.points, 'punto', 'puntos')}</span><span className="qz-prompt">{question.prompt}</span></legend>
            {multiple && <p className="qz-hint" id={hintId}>Selecciona todas las que apliquen.</p>}
            <div className="qz-options">
              {question.options.map((option) => {
                const checked = selected.includes(option.id);
                return <label className={`qz-option ${checked ? 'is-selected' : ''}`} key={option.id}>
                  <input type={multiple ? 'checkbox' : 'radio'} name={`${baseId}-q-${question.id}`} value={option.id} checked={checked} onChange={() => (multiple ? toggleMultiple(question.id, option.id) : setSingle(question.id, option.id))} />
                  <span className="qz-option-text">{option.text}</span>
                </label>;
              })}
            </div>
          </fieldset>;
        })}
        <div className="qz-submit-bar">
          <p className="qz-progress" id={progressId} role="status" aria-live="polite">{answeredCount} de {questions.length} respondidas</p>
          {confirmPartial && unanswered > 0 && <p className="qz-warning" id={warningId} role="alert"><AlertCircle size={18} aria-hidden="true" /> Te {unanswered === 1 ? 'falta' : 'faltan'} {plural(unanswered, 'pregunta sin responder', 'preguntas sin responder')}. Contarán como incorrectas si envías así.</p>}
          {error && <p className="qz-alert" role="alert"><AlertCircle size={18} aria-hidden="true" /> {error}</p>}
          <div className="qz-actions">
            <button type="button" className="button button-secondary qz-btn" onClick={() => { setView('intro'); setConfirmPartial(false); setError(''); }} disabled={submitting}>Cancelar</button>
            <button type="submit" className="button button-primary qz-btn" disabled={submitting} aria-describedby={confirmPartial && unanswered > 0 ? warningId : progressId}>
              {submitting ? <><LoaderCircle className="button-spinner" size={17} aria-hidden="true" /> Enviando…</> : confirmPartial && unanswered > 0 ? 'Enviar de todos modos' : 'Enviar respuestas'}
            </button>
          </div>
        </div>
      </form>
    </section>;
  }

  if (view === 'result' && result) {
    const byId = new Map(questions.map((question) => [question.id, question]));
    const passed = Boolean(result.passed);
    const canRetry = !passed && result.attemptsLeft !== 0;
    const mayContinue = (result.unlocked || !quiz.isRequired) && canContinue;
    return <section className="qz-root qz-card" aria-labelledby={`${baseId}-title`}>
      <p className="qz-eyebrow" id={`${baseId}-title`}>{quiz.title}</p>
      <div className={`qz-result ${passed ? 'qz-result-ok' : 'qz-result-fail'}`} role="status">
        <span className="qz-result-icon" aria-hidden="true">{passed ? <Check size={26} /> : <X size={26} />}</span>
        <div>
          <h2 className="qz-result-title" tabIndex={-1} ref={resultRef}>{passed ? 'Aprobaste' : `No alcanzaste el ${result.passingPercent} % necesario`}</h2>
          <p className="qz-score">Tu puntaje: <strong>{formatPercent(result.scorePercent)}</strong> · {result.correctCount} de {result.totalCount} correctas{result.preview ? ' · Vista previa' : ''}</p>
          {!passed && quiz.isRequired && <p className="qz-note">Esta evaluación es obligatoria: apruébala para seguir con el contenido siguiente y obtener tu constancia.</p>}
          {!passed && !quiz.isRequired && <p className="qz-note">Esta evaluación es opcional. Puedes continuar con el curso cuando quieras.</p>}
          {!passed && result.attemptsLeft === 0 && <p className="qz-note">Ya no te quedan intentos disponibles.</p>}
          {!passed && result.attemptsLeft > 0 && <p className="qz-note">{attemptsText(result.attemptsLeft, quiz.maxAttempts)}.</p>}
        </div>
      </div>
      <h3 className="qz-review-title">Revisión por pregunta</h3>
      <ol className="qz-review">
        {(result.results ?? []).map((entry, index) => {
          const question = byId.get(entry.questionId);
          if (!question) return null;
          const chosen = new Set(entry.selectedOptionIds ?? []);
          const correctIds = new Set(entry.correctOptionIds ?? []);
          const reveals = Array.isArray(entry.correctOptionIds);
          return <li className={`qz-review-item ${entry.isCorrect ? 'is-correct' : 'is-wrong'}`} key={entry.questionId}>
            <p className="qz-review-head">
              <span className="qz-verdict">{entry.isCorrect ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}{entry.isCorrect ? 'Correcta' : 'Incorrecta'}</span>
              <span className="qz-qnum">Pregunta {index + 1}</span>
            </p>
            <p className="qz-prompt">{question.prompt}</p>
            <ul className="qz-review-options">
              {question.options.map((option) => {
                const isChosen = chosen.has(option.id);
                const isRight = correctIds.has(option.id);
                return <li key={option.id} className={`${isChosen ? 'is-chosen' : ''} ${reveals && isRight ? 'is-right' : ''}`}>
                  <span>{option.text}</span>
                  {isChosen && <em className="qz-tag">Tu respuesta</em>}
                  {reveals && isRight && <em className="qz-tag qz-tag-ok">Respuesta correcta</em>}
                </li>;
              })}
              {chosen.size === 0 && <li className="qz-unanswered">No respondiste esta pregunta.</li>}
            </ul>
            {entry.explanation && <p className="qz-explanation"><strong>Explicación:</strong> {entry.explanation}</p>}
          </li>;
        })}
      </ol>
      <div className="qz-actions">
        {canRetry && <button type="button" className="button button-secondary qz-btn" onClick={startAttempt}><RotateCcw size={17} aria-hidden="true" /> Reintentar</button>}
        {mayContinue && <button type="button" className="button button-primary qz-btn" onClick={() => onContinue?.()}>Continuar</button>}
      </div>
    </section>;
  }

  return <section className="qz-root qz-card" aria-labelledby={`${baseId}-title`}>
    <header className="qz-head">
      <span className="qz-pill"><ClipboardCheck size={14} aria-hidden="true" /> EVALUACIÓN</span>
      <h1 id={`${baseId}-title`} className="qz-title" tabIndex={-1} ref={titleRef}>{quiz.title}</h1>
      {quiz.description && <p className="qz-description">{quiz.description}</p>}
    </header>
    <QuizChips quiz={quiz} />
    <dl className="qz-stats">
      <div><dt>Intentos</dt><dd>{quiz.maxAttempts === null || quiz.maxAttempts === undefined ? `${quiz.attemptsUsed ?? 0} realizados · ilimitados` : `${quiz.attemptsUsed ?? 0} de ${quiz.maxAttempts} usados`}</dd></div>
      <div><dt>Mejor puntaje</dt><dd>{quiz.bestScorePercent === null || quiz.bestScorePercent === undefined ? 'Aún sin intentos' : formatPercent(quiz.bestScorePercent)}</dd></div>
    </dl>
    {preview && <p className="qz-preview-note">Vista previa como alumno: los envíos no se guardan.</p>}
    {quiz.isRequired && !quiz.passed && <p className="qz-note">Debes aprobarla para acceder al contenido que sigue y para obtener tu constancia.</p>}
    {quiz.passed && !preview && <p className="qz-note qz-note-ok" role="status"><Check size={16} aria-hidden="true" /> Ya aprobaste esta evaluación.</p>}
    {exhausted && <p className="qz-alert" role="alert"><AlertCircle size={18} aria-hidden="true" /> Ya usaste todos los intentos disponibles.</p>}
    {error && <p className="qz-alert" role="alert"><AlertCircle size={18} aria-hidden="true" /> {error}</p>}
    <div className="qz-actions">
      {(!quiz.passed || preview) && !exhausted && <button type="button" className="button button-primary qz-btn" onClick={startAttempt}>{(quiz.attemptsUsed ?? 0) > 0 && !preview ? 'Reintentar' : 'Comenzar evaluación'}</button>}
      {quiz.passed && !preview && canContinue && <button type="button" className="button button-primary qz-btn" onClick={() => onContinue?.()}>Continuar</button>}
      {exhausted && !quiz.isRequired && canContinue && <button type="button" className="button button-secondary qz-btn" onClick={() => onContinue?.()}>Continuar</button>}
    </div>
  </section>;
}

export function LockedItemPanel({ item, onGoToQuiz }) {
  const gate = item?.lockedBy;
  return <section className="qz-root qz-card qz-locked" aria-labelledby="qz-locked-title">
    <span className="qz-locked-icon" aria-hidden="true"><Lock size={28} /></span>
    <h1 id="qz-locked-title" className="qz-title">{item?.title || 'Contenido bloqueado'}</h1>
    <p className="qz-description">{gate?.title ? <>Este contenido se desbloquea cuando apruebes la evaluación «{gate.title}».</> : 'Este contenido está bloqueado hasta que apruebes la evaluación obligatoria anterior.'}</p>
    {gate && onGoToQuiz && <div className="qz-actions"><button type="button" className="button button-primary qz-btn" onClick={() => onGoToQuiz(gate.quizId)}><ClipboardCheck size={17} aria-hidden="true" /> Ir a la evaluación</button></div>}
  </section>;
}
