// Numeración "Clase N": misma lógica que back-stream/src/lib/course-structure.js.
// El número se calcula (no se guarda): orden por (posición de sección, posición de clase, id).

const CLASS_PREFIX = /^\s*clase\s*\d+/i;

export const hasClassPrefix = (title) => CLASS_PREFIX.test(String(title ?? ''));

const numeric = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

// Devuelve las filas ordenadas con lessonNumber 1..N continuo. Acepta camelCase o snake_case.
export function numberLessons(rows) {
  const sectionOf = (row) => numeric(row.sectionPosition ?? row.section_position ?? 0);
  let next = 0;
  return [...rows]
    .sort((a, b) => sectionOf(a) - sectionOf(b) || numeric(a.position) - numeric(b.position) || numeric(a.id) - numeric(b.id))
    .map((row) => (row.kind === 'quiz' ? { ...row, lessonNumber: null } : { ...row, lessonNumber: ++next }));
}

// Texto de la pill ("CLASE 3") o '' si no hay número o el título ya empieza por "Clase N".
export function lessonBadge(lesson) {
  if (lesson?.kind === 'quiz') return '';
  const number = Number(lesson?.lessonNumber);
  if (!Number.isFinite(number) || number < 1 || hasClassPrefix(lesson?.title)) return '';
  return `CLASE ${number}`;
}

// Mapa id de clase -> número para un árbol de secciones del editor ([{ id, position, lessons: [...] }]).
export function lessonNumbersFromSections(sections) {
  const rows = sections.flatMap((section, sectionIndex) => (section.lessons || []).map((lesson, lessonIndex) => ({ id: lesson.id, kind: lesson.kind, sectionPosition: sectionIndex + 1, position: lessonIndex + 1 })));
  return new Map(numberLessons(rows).map((row) => [row.id, row.lessonNumber]));
}
