import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attemptsText, blankQuestion, firstOpenIndex, isQuiz, learnProgress, quizLabelText, requirementText, scoreTone, validateQuestionDraft,
} from '../src/lib/quizzes.js';
import { lessonBadge, lessonNumbersFromSections, numberLessons } from '../src/lib/lessons.js';

const video = (id, extra = {}) => ({ id, kind: 'video', title: `V${id}`, completedAt: null, locked: false, ...extra });
const quiz = (id, extra = {}) => ({ id, kind: 'quiz', title: `Q${id}`, completedAt: null, locked: false, quiz: { isRequired: true, questionCount: 3 }, ...extra });

test('etiquetas de texto', () => {
  assert.equal(quizLabelText('diagnostica'), 'Diagnóstica');
  assert.equal(quizLabelText('repaso'), 'Repaso');
  assert.equal(quizLabelText('final'), 'Final');
  assert.equal(quizLabelText('otro'), 'Evaluación');
  assert.equal(quizLabelText(undefined), 'Evaluación');
  assert.equal(requirementText(true), 'Obligatoria');
  assert.equal(requirementText(false), 'Opcional');
  assert.equal(isQuiz(quiz(1)), true);
  assert.equal(isQuiz(video(1)), false);
  assert.equal(isQuiz(null), false);
});

test('learnProgress sin evaluaciones cuenta solo videos', () => {
  const progress = learnProgress([video(1, { completedAt: 'x' }), video(2), video(3)]);
  assert.deepEqual({ completed: progress.completed, total: progress.total, percent: progress.percent }, { completed: 1, total: 3, percent: 33 });
  assert.deepEqual(progress.pendingRequired, []);
  assert.deepEqual(learnProgress([]), { completed: 0, total: 0, percent: 0, pendingRequired: [] });
  assert.equal(learnProgress(undefined).total, 0);
});

test('learnProgress cuenta evaluaciones obligatorias con preguntas', () => {
  const items = [video(1, { completedAt: 'x' }), quiz(2, { completedAt: 'x' }), quiz(3), quiz(4, { quiz: { isRequired: false, questionCount: 2 } }), quiz(5, { quiz: { isRequired: true, questionCount: 0 } }), video(6)];
  const progress = learnProgress(items);
  assert.equal(progress.total, 4);
  assert.equal(progress.completed, 2);
  assert.equal(progress.percent, 50);
  assert.deepEqual(progress.pendingRequired, [{ id: 3, title: 'Q3' }]);
});

test('learnProgress sube al marcar una clase como completada', () => {
  const items = [video(1, { completedAt: 'x' }), video(2), video(3)];
  const before = learnProgress(items);
  const after = learnProgress(items.map((item) => (item.id === 2 ? { ...item, completedAt: 'y' } : item)));
  assert.equal(after.completed, before.completed + 1);
  assert.ok(after.percent > before.percent);
  assert.equal(learnProgress(items.map((item) => ({ ...item, completedAt: 'z' }))).percent, 100);
});

test('learnProgress respeta item.counts del servidor', () => {
  const items = [video(1, { counts: true }), quiz(2, { counts: false, completedAt: 'x' }), quiz(3, { counts: true, quiz: { isRequired: false, questionCount: 0 } })];
  assert.equal(learnProgress(items).total, 2);
  assert.equal(learnProgress(items).completed, 0);
});

test('firstOpenIndex salta completados, bloqueados y no contados', () => {
  assert.equal(firstOpenIndex([]), 0);
  assert.equal(firstOpenIndex(undefined), 0);
  assert.equal(firstOpenIndex([video(1, { completedAt: 'x' }), video(2), video(3)]), 1);
  assert.equal(firstOpenIndex([video(1, { completedAt: 'x' }), video(2, { locked: true }), video(3)]), 2);
  assert.equal(firstOpenIndex([video(1, { completedAt: 'x' }), quiz(2, { counts: false }), video(3)]), 2);
  assert.equal(firstOpenIndex([video(1, { completedAt: 'x' }), video(2, { completedAt: 'x' })]), 0);
  assert.equal(firstOpenIndex([video(1, { completedAt: 'x' }), quiz(2)]), 1);
});

test('attemptsText y scoreTone', () => {
  assert.equal(attemptsText(null, null), 'Intentos ilimitados');
  assert.equal(attemptsText(2, 3), '2 intentos restantes de 3');
  assert.equal(attemptsText(1, 3), '1 intento restante de 3');
  assert.equal(attemptsText(null, 3), '3 intentos restantes de 3');
  assert.equal(attemptsText(0, 3), 'Sin intentos restantes (3 de 3)');
  assert.equal(scoreTone(true), 'ok');
  assert.equal(scoreTone(false), 'danger');
});

test('blankQuestion y validateQuestionDraft', () => {
  assert.equal(blankQuestion('single').options.length, 2);
  const tf = blankQuestion('true_false');
  assert.deepEqual(tf.options.map((o) => o.isCorrect), [true, false]);
  assert.deepEqual(Object.keys(validateQuestionDraft(tf)), ['prompt']);
  assert.deepEqual(validateQuestionDraft({ ...tf, prompt: 'Afirmacion' }), {});

  const errors = validateQuestionDraft(blankQuestion('single'));
  assert.ok(errors.prompt && errors.options && errors.correct);

  const ok = { type: 'single', prompt: 'P', points: 1, options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] };
  assert.deepEqual(validateQuestionDraft(ok), {});
  assert.ok(validateQuestionDraft({ ...ok, options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: true }] }).correct);
  assert.ok(validateQuestionDraft({ ...ok, options: [{ text: 'a', isCorrect: true }] }).options);
  assert.ok(validateQuestionDraft({ ...ok, options: Array.from({ length: 9 }, (_, i) => ({ text: `o${i}`, isCorrect: i === 0 })) }).options);
  assert.ok(validateQuestionDraft({ ...ok, options: [{ text: 'A', isCorrect: true }, { text: 'a', isCorrect: false }] }).options);
  assert.ok(validateQuestionDraft({ ...ok, prompt: 'x'.repeat(2001) }).prompt);
  assert.deepEqual(validateQuestionDraft({ ...ok, prompt: 'x'.repeat(2000) }), {});
  assert.ok(validateQuestionDraft({ ...ok, explanation: 'x'.repeat(2001) }).explanation);
  assert.ok(validateQuestionDraft({ ...ok, points: 0 }).points);
  assert.ok(validateQuestionDraft({ ...ok, points: 11 }).points);
  assert.ok(validateQuestionDraft({ ...ok, points: 1.5 }).points);
  assert.deepEqual(validateQuestionDraft({ ...ok, points: 10 }), {});

  const multi = { ...ok, type: 'multiple', options: [{ text: 'a', isCorrect: false }, { text: 'b', isCorrect: false }] };
  assert.ok(validateQuestionDraft(multi).correct);
  assert.deepEqual(validateQuestionDraft({ ...multi, options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: true }] }), {});

  assert.ok(validateQuestionDraft({ ...tf, options: [{ text: 'Verdadero', isCorrect: false }, { text: 'Falso', isCorrect: false }] }).correct);
  assert.ok(validateQuestionDraft({ ...tf, options: [{ text: 'Verdadero', isCorrect: true }] }).options);
  assert.ok(validateQuestionDraft({ ...ok, type: 'otro' }).type);
});

test('numeracion de clases salta evaluaciones', () => {
  const rows = [
    { id: 1, kind: 'video', sectionPosition: 1, position: 1 },
    { id: 2, kind: 'quiz', sectionPosition: 1, position: 2 },
    { id: 3, kind: 'video', sectionPosition: 1, position: 3 },
    { id: 4, kind: 'quiz', sectionPosition: 2, position: 4 },
    { id: 5, kind: 'video', sectionPosition: 2, position: 5 },
  ];
  assert.deepEqual(numberLessons(rows).map((row) => row.lessonNumber), [1, null, 2, null, 3]);

  const sections = [
    { id: 10, lessons: [{ id: 1, kind: 'video' }, { id: 2, kind: 'quiz' }, { id: 3 }] },
    { id: 11, lessons: [{ id: 4, kind: 'quiz' }, { id: 5, kind: 'video' }] },
  ];
  const map = lessonNumbersFromSections(sections);
  assert.deepEqual([1, 2, 3, 4, 5].map((id) => map.get(id)), [1, null, 2, null, 3]);
});

test('lessonBadge vacio para evaluaciones', () => {
  assert.equal(lessonBadge({ kind: 'quiz', lessonNumber: 2, title: 'Examen' }), '');
  assert.equal(lessonBadge({ kind: 'quiz', lessonNumber: null, title: 'Examen' }), '');
  assert.equal(lessonBadge({ kind: 'video', lessonNumber: 2, title: 'Intro' }), 'CLASE 2');
});
