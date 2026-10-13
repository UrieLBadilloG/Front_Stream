// Helpers puros de evaluaciones (sin React). Espejan las reglas de back-stream/src/lib/quiz-logic.js.

export const QUESTION_LIMITS = Object.freeze({
  promptMax: 2000,
  explanationMax: 2000,
  optionTextMax: 500,
  minOptions: 2,
  maxOptions: 8,
  pointsMin: 1,
  pointsMax: 10,
});

export const TRUE_TEXT = 'Verdadero';
export const FALSE_TEXT = 'Falso';

const LABEL_TEXT = { diagnostica: 'Diagnóstica', repaso: 'Repaso', final: 'Final' };

export const isQuiz = (item) => item?.kind === 'quiz';

export const quizLabelText = (label) => LABEL_TEXT[label] || 'Evaluación';

export const requirementText = (isRequired) => (isRequired ? 'Obligatoria' : 'Opcional');

// Mismo criterio que el servidor: video, o evaluación obligatoria con preguntas.
// Si el servidor manda `counts`, manda él.
const counted = (item) => {
  if (typeof item?.counts === 'boolean') return item.counts;
  if (!isQuiz(item)) return true;
  const questions = Number(item.quiz?.questionCount ?? item.questionCount ?? 0);
  return Boolean(item.quiz?.isRequired ?? item.isRequired) && questions > 0;
};

export function learnProgress(items) {
  const list = Array.isArray(items) ? items.filter(counted) : [];
  const completed = list.filter((item) => item.completedAt).length;
  const total = list.length;
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed * 100) / total) : 0,
    pendingRequired: list.filter((item) => isQuiz(item) && !item.completedAt).map((item) => ({ id: item.id, title: item.title })),
  };
}

// Primer elemento que cuenta, sin completar y sin bloquear. 0 si no hay.
export function firstOpenIndex(items) {
  const index = (Array.isArray(items) ? items : []).findIndex((item) => item.counts !== false && !item.completedAt && !item.locked);
  return index < 0 ? 0 : index;
}

export function attemptsText(attemptsLeft, maxAttempts) {
  if (maxAttempts === null || maxAttempts === undefined) return 'Intentos ilimitados';
  const left = attemptsLeft === null || attemptsLeft === undefined ? maxAttempts : Math.max(0, Number(attemptsLeft));
  const used = Math.max(0, Number(maxAttempts) - left);
  if (left === 0) return `Sin intentos restantes (${used} de ${maxAttempts})`;
  return `${left} ${left === 1 ? 'intento restante' : 'intentos restantes'} de ${maxAttempts}`;
}

export const scoreTone = (passed) => (passed ? 'ok' : 'danger');

export function blankQuestion(type = 'single') {
  const base = { type, prompt: '', explanation: '', points: 1 };
  if (type === 'true_false') {
    return { ...base, options: [{ text: TRUE_TEXT, isCorrect: true }, { text: FALSE_TEXT, isCorrect: false }] };
  }
  return { ...base, options: [{ text: '', isCorrect: false }, { text: '', isCorrect: false }] };
}

// Devuelve { campo: mensaje }. Vacío = válido. Campos: prompt, options, correct, explanation, points, type.
export function validateQuestionDraft(draft) {
  const errors = {};
  const type = draft?.type;
  if (!['single', 'multiple', 'true_false'].includes(type)) errors.type = 'Elige un tipo de pregunta válido.';
  const prompt = String(draft?.prompt ?? '').trim();
  if (!prompt) errors.prompt = 'Escribe el enunciado de la pregunta.';
  else if (prompt.length > QUESTION_LIMITS.promptMax) errors.prompt = `El enunciado no puede superar ${QUESTION_LIMITS.promptMax} caracteres.`;

  if (String(draft?.explanation ?? '').trim().length > QUESTION_LIMITS.explanationMax) {
    errors.explanation = `La explicación no puede superar ${QUESTION_LIMITS.explanationMax} caracteres.`;
  }

  const points = draft?.points;
  if (typeof points !== 'number' || !Number.isInteger(points) || points < QUESTION_LIMITS.pointsMin || points > QUESTION_LIMITS.pointsMax) {
    errors.points = `Los puntos deben ser un número entero entre ${QUESTION_LIMITS.pointsMin} y ${QUESTION_LIMITS.pointsMax}.`;
  }

  const options = Array.isArray(draft?.options) ? draft.options : [];
  const correct = options.filter((option) => option?.isCorrect === true).length;
  if (type === 'true_false') {
    if (options.length !== 2) errors.options = 'Verdadero o falso lleva exactamente dos opciones.';
    else if (correct !== 1) errors.correct = 'Marca si la afirmación es verdadera o falsa.';
  } else if (type === 'single' || type === 'multiple') {
    if (options.length < QUESTION_LIMITS.minOptions || options.length > QUESTION_LIMITS.maxOptions) {
      errors.options = `La pregunta debe tener entre ${QUESTION_LIMITS.minOptions} y ${QUESTION_LIMITS.maxOptions} opciones.`;
    } else {
      const texts = options.map((option) => String(option?.text ?? '').trim());
      if (texts.some((text) => !text)) errors.options = 'Completa el texto de todas las opciones.';
      else if (texts.some((text) => text.length > QUESTION_LIMITS.optionTextMax)) errors.options = `Cada opción puede tener hasta ${QUESTION_LIMITS.optionTextMax} caracteres.`;
      else if (new Set(texts.map((text) => text.toLowerCase())).size !== texts.length) errors.options = 'Las opciones no pueden repetirse.';
    }
    if (type === 'single' && correct !== 1) errors.correct = 'Marca exactamente una respuesta correcta.';
    if (type === 'multiple' && correct < 1) errors.correct = 'Marca al menos una respuesta correcta.';
  }
  return errors;
}
