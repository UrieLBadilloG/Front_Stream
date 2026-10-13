import { lessonBadge } from '../lib/lessons.js';

// Pill discreta "CLASE N". No renderiza nada si el título ya empieza por "Clase N".
export function LessonNumber({ lesson, className = '' }) {
  const text = lessonBadge(lesson);
  if (!text) return null;
  return <span className={`lesson-pill${className ? ` ${className}` : ''}`}>{text}</span>;
}
