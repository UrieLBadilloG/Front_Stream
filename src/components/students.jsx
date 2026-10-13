import { Fragment, useMemo } from 'react';
import { ArrowUpDown, Award, CheckCircle2, ChevronDown, ClipboardCheck, CircleDashed, Clock3, Infinity as InfinityIcon, LoaderCircle, Lock, Pencil, PlayCircle, Search, Users } from 'lucide-react';
import { accessLabel, enrollmentStatus, expiryCopy, formatShortDate, normalizeText, relativeTime } from '../lib/access.js';
import { Avatar, ProgressRing, StatusBadge } from './ui.jsx';
import { LessonNumber } from './lesson-number.jsx';
import { isQuiz, learnProgress, requirementText } from '../lib/quizzes.js';

export const STUDENT_STATUS_FILTERS = [['all', 'Todos'], ['active', 'Activos'], ['completed', 'Completados'], ['inactive', 'Inactivos'], ['expiring', 'Por vencer'], ['expired', 'Expirados']];

export const STUDENT_SORTS = [
  ['activity', 'Última actividad'],
  ['progress_desc', 'Mayor progreso'],
  ['progress_asc', 'Menor progreso'],
  ['expiry', 'Vence pronto'],
  ['enrolled', 'Inscripción reciente'],
  ['name', 'Nombre A–Z'],
];

const time = (iso) => { const value = iso ? new Date(iso).getTime() : NaN; return Number.isNaN(value) ? null : value; };

// Vigentes con límite (más próximos primero), luego expirados (más recientes primero) y al final los sin límite.
const expiryRank = (student) => {
  if (!student.hasLimit) return [2, 0];
  const expires = time(student.expiresAt) ?? 0;
  return student.isExpired ? [1, -expires] : [0, expires];
};

const SORT_FNS = {
  activity: (a, b) => (time(b.lastActivityAt) ?? -Infinity) - (time(a.lastActivityAt) ?? -Infinity),
  progress_desc: (a, b) => b.progressPercent - a.progressPercent || a.fullName.localeCompare(b.fullName, 'es'),
  progress_asc: (a, b) => a.progressPercent - b.progressPercent || a.fullName.localeCompare(b.fullName, 'es'),
  expiry: (a, b) => { const [ga, va] = expiryRank(a); const [gb, vb] = expiryRank(b); return ga - gb || va - vb; },
  enrolled: (a, b) => (time(b.enrolledAt) ?? 0) - (time(a.enrolledAt) ?? 0),
  name: (a, b) => a.fullName.localeCompare(b.fullName, 'es'),
};

const fullDate = (iso) => { const value = time(iso); return value === null ? '' : new Date(value).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' }); };
const clock = (seconds) => { const total = Math.max(0, Math.floor(Number(seconds) || 0)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; };

// Chips de política y de vencimientos para las listas de cursos del docente.
export function CoursePolicyChips({ course }) {
  const expiring = Number(course.expiringSoonCount || 0);
  const expired = Number(course.expiredCount || 0);
  return (
    <div className="policy-chips">
      <span className="policy-chip">{course.accessDays === null || course.accessDays === undefined ? <InfinityIcon size={13} aria-hidden="true" /> : <Clock3 size={13} aria-hidden="true" />}{accessLabel(course.accessDays)}</span>
      {expiring > 0 && <span className="policy-chip policy-chip-warn"><Clock3 size={13} aria-hidden="true" />{expiring} por vencer</span>}
      {expired > 0 && <span className="policy-chip policy-chip-danger"><Lock size={13} aria-hidden="true" />{expired} {expired === 1 ? 'expirado' : 'expirados'}</span>}
    </div>
  );
}

// Fila compacta de una inscripción con su progreso y vencimiento (detalle de usuario del super admin).
export function EnrollmentProgressRow({ enrollment }) {
  const status = enrollmentStatus(enrollment);
  const expiry = expiryCopy(enrollment);
  return (
    <div className="enrollment-row enrollment-progress-row">
      <ProgressRing value={enrollment.progressPercent} size={48} stroke={5} />
      <div className="enrollment-row-main">
        <strong>{enrollment.course.title}</strong>
        <span className="enrollment-row-meta">{enrollment.completedLessons} de {enrollment.lessonCount} clases · {enrollment.lastActivityAt ? `Última actividad ${relativeTime(enrollment.lastActivityAt)}` : 'Sin actividad'}</span>
        <span className={`expiry-copy expiry-${expiry.tone}`}>{enrollment.hasLimit ? `Vence el ${formatShortDate(enrollment.expiresAt)} · ${expiry.text}` : expiry.text}</span>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

function LessonBreakdown({ detail, loading, certificateIssued = false }) {
  if (loading) return <div className="student-detail-loading" role="status"><LoaderCircle className="button-spinner" size={17} aria-hidden="true" /> Cargando clases…</div>;
  if (!detail) return null;
  if (!detail.lessons.length) return <p className="student-detail-empty">Este curso aún no tiene clases.</p>;
  const sections = [];
  for (const lesson of detail.lessons) {
    const last = sections[sections.length - 1];
    if (last && last.title === lesson.sectionTitle) last.lessons.push(lesson); else sections.push({ title: lesson.sectionTitle, lessons: [lesson] });
  }
  const { completed: done, total: countedTotal } = learnProgress(detail.lessons);
  const unit = detail.lessons.some((lesson) => isQuiz(lesson) && lesson.quiz?.isRequired && Number(lesson.quiz?.questionCount) > 0) ? 'actividades' : 'clases';
  return (
    <>
      <p className="student-detail-summary">{detail.student.fullName}: {done} de {countedTotal} {unit} completadas{certificateIssued && <span className="policy-chip policy-chip-ok cert-issued-chip"><Award size={13} aria-hidden="true" />Constancia emitida</span>}</p>
      <div className="student-detail-sections">
        {sections.map((section, index) => (
          <section key={`${section.title}-${index}`} aria-label={section.title}>
            <h4>{section.title}</h4>
            <ul>
              {section.lessons.map((lesson) => {
                const completed = Boolean(lesson.completedAt);
                if (isQuiz(lesson)) {
                  const quiz = lesson.quiz ?? {};
                  const attempts = Number(quiz.attempts ?? 0);
                  const best = quiz.bestScorePercent === null || quiz.bestScorePercent === undefined ? '' : ` (mejor ${Number(quiz.bestScorePercent).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %)`;
                  const attemptsLabel = `${attempts} ${attempts === 1 ? 'intento' : 'intentos'}`;
                  return (
                    <li key={lesson.id} className={quiz.passed ? 'is-done' : 'is-pending'}>
                      <ClipboardCheck size={17} aria-hidden="true" />
                      <span className="lesson-name"><span className="qz-pill">EVALUACIÓN</span>{lesson.title} <span className={`qz-badge ${quiz.isRequired ? 'qz-badge-required' : 'qz-badge-optional'}`}>{requirementText(quiz.isRequired)}</span></span>
                      <span className="lesson-state">{attempts === 0 ? 'Sin intentos' : quiz.passed ? `Aprobada${best} · ${attemptsLabel}` : `No aprobada${best} · ${attemptsLabel}`}</span>
                    </li>
                  );
                }
                const inProgress = !completed && lesson.lastPositionSeconds > 0;
                const Icon = completed ? CheckCircle2 : inProgress ? PlayCircle : CircleDashed;
                return (
                  <li key={lesson.id} className={completed ? 'is-done' : inProgress ? 'is-progress' : 'is-pending'}>
                    <Icon size={17} aria-hidden="true" />
                    <span className="lesson-name"><LessonNumber lesson={lesson} className="lesson-pill-compact" />{lesson.title}</span>
                    <span className="lesson-state">{completed ? `Completada el ${formatShortDate(lesson.completedAt)}` : inProgress ? `En curso · quedó en el minuto ${clock(lesson.lastPositionSeconds)}` : 'Pendiente'}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function StudentsSkeleton() {
  return <div className="student-skeleton" aria-busy="true" aria-label="Cargando alumnos">{Array.from({ length: 5 }, (_, index) => <div className="skeleton student-skeleton-row" key={index} />)}</div>;
}

// Panel de alumnos de un curso. El estado vive en InstructorWorkspacePage; aquí solo se deriva y se pinta.
export function StudentsPanel({ course, students, loading, search, onSearch, statusFilter, onStatusFilter, sort, onSort, expandedId, onToggle, progressById, progressLoadingId, onEdit, editing }) {
  const rows = useMemo(() => students.map((student) => ({ ...student, status: enrollmentStatus(student) })), [students]);
  const counts = useMemo(() => { const result = { all: rows.length, active: 0, completed: 0, inactive: 0, expiring: 0, expired: 0 }; rows.forEach((row) => { result[row.status] += 1; }); return result; }, [rows]);
  const summary = useMemo(() => {
    const total = rows.length;
    return {
      total,
      average: total ? Math.round(rows.reduce((sum, row) => sum + row.progressPercent, 0) / total) : 0,
      completed: counts.completed,
      completedPercent: total ? Math.round((counts.completed / total) * 100) : 0,
      expiring: rows.filter((row) => row.isExpiringSoon && !row.isExpired).length,
      expired: rows.filter((row) => row.isExpired).length,
    };
  }, [rows, counts]);
  const visible = useMemo(() => {
    const query = normalizeText(search);
    return rows
      .filter((row) => (statusFilter === 'all' || row.status === statusFilter) && (!query || normalizeText(`${row.fullName} ${row.email}`).includes(query)))
      .sort(SORT_FNS[sort] || SORT_FNS.activity);
  }, [rows, search, statusFilter, sort]);
  const filtered = search.trim() !== '' || statusFilter !== 'all';
  const clearFilters = () => { onSearch(''); onStatusFilter('all'); };

  if (loading) return <StudentsSkeleton />;
  return (
    <div className="student-panel">
      <div className="student-course-head">
        <div>
          <h3>{course.title}</h3>
          <span className="policy-chip">{course.accessDays === null || course.accessDays === undefined ? <InfinityIcon size={13} aria-hidden="true" /> : <Clock3 size={13} aria-hidden="true" />}{accessLabel(course.accessDays)}</span>
        </div>
        <button type="button" className="button button-secondary" disabled={editing} onClick={onEdit}>{editing ? <><LoaderCircle className="button-spinner" size={17} /> Abriendo…</> : <><Pencil size={15} aria-hidden="true" /> Editar curso</>}</button>
      </div>
      {!rows.length ? <div className="empty">Aún no hay alumnos inscritos en este curso.</div> : <>
        <div className="student-summary">
          <div className="learning-stat"><span className="learning-stat-icon tone-primary"><Users size={22} aria-hidden="true" /></span><div className="learning-stat-text"><strong>{summary.total}</strong><span>Alumnos</span></div></div>
          <div className="learning-stat"><ProgressRing value={summary.average} size={56} stroke={6} label={`Avance promedio: ${summary.average} %`} /><div className="learning-stat-text"><strong className="sr-only">{summary.average}%</strong><span>Avance promedio</span></div></div>
          <div className="learning-stat"><span className="learning-stat-icon tone-ok"><Award size={22} aria-hidden="true" /></span><div className="learning-stat-text"><strong>{summary.completed}</strong><span>Completados</span><small>{summary.completedPercent}% del total</small></div></div>
          <div className={`learning-stat${summary.expiring > 0 ? ' is-warn' : ''}`}><span className="learning-stat-icon tone-warn"><Clock3 size={22} aria-hidden="true" /></span><div className="learning-stat-text"><strong>{summary.expiring}</strong><span>Por vencer</span><small>{summary.expired} {summary.expired === 1 ? 'expirado' : 'expirados'}</small></div></div>
        </div>
        <div className="student-toolbar">
          <div className="status-chips" role="group" aria-label="Filtrar alumnos por estado">
            {STUDENT_STATUS_FILTERS.map(([key, label]) => <button type="button" key={key} aria-pressed={statusFilter === key} className={statusFilter === key ? 'active' : ''} onClick={() => onStatusFilter(key)}>{label}<span className="status-chip-count">{counts[key]}</span></button>)}
          </div>
          <div className="learning-tools">
            <label className="learning-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Buscar alumno por nombre o correo</span><input type="search" value={search} placeholder="Buscar alumno…" onChange={(event) => onSearch(event.target.value)} /></label>
            <label className="learning-sort"><ArrowUpDown size={15} aria-hidden="true" /><span className="sr-only">Ordenar alumnos por</span><select value={sort} onChange={(event) => onSort(event.target.value)}>{STUDENT_SORTS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
          </div>
        </div>
        <p className="learning-count" role="status" aria-live="polite">{visible.length} {visible.length === 1 ? 'alumno' : 'alumnos'}</p>
        {!visible.length ? <div className="learning-empty student-empty"><Search size={30} aria-hidden="true" /><h3>Sin resultados</h3><p>Ningún alumno coincide con la búsqueda o el filtro actual.</p>{filtered && <button type="button" className="button button-secondary" onClick={clearFilters}>Limpiar filtros</button>}</div> : (
          <div className="student-table-wrap">
            <table className="student-table">
              <caption className="sr-only">Alumnos de {course.title} con progreso, última actividad, estado, inscripción y vencimiento</caption>
              <thead><tr><th scope="col">Alumno</th><th scope="col">Progreso</th><th scope="col">Última actividad</th><th scope="col">Estado</th><th scope="col">Inscripción</th><th scope="col">Vencimiento</th><th scope="col"><span className="sr-only">Desglose por clase</span></th></tr></thead>
              <tbody>
                {visible.map((student) => {
                  const open = expandedId === student.id;
                  const expiry = expiryCopy(student);
                  const detailId = `student-detail-${student.id}`;
                  return (
                    <Fragment key={student.enrollmentId}>
                      <tr className={open ? 'is-open' : ''}>
                        <th scope="row" className="student-cell"><div className="student-person"><Avatar name={student.fullName} size={40} /><span className="student-person-text"><strong>{student.fullName}</strong><span title={student.email}>{student.email}</span></span></div></th>
                        <td data-label="Progreso"><div className="student-progress"><ProgressRing value={student.progressPercent} size={52} stroke={5} /><span>{student.completedLessons} de {student.lessonCount} clases</span></div></td>
                        <td data-label="Última actividad">{student.lastActivityAt ? <span title={fullDate(student.lastActivityAt)}>{relativeTime(student.lastActivityAt)}</span> : <span className="muted-text">Sin actividad</span>}</td>
                        <td data-label="Estado"><StatusBadge status={student.status} />{student.certificateIssued && <span className="policy-chip policy-chip-ok cert-issued-chip"><Award size={13} aria-hidden="true" />Constancia emitida</span>}</td>
                        <td data-label="Inscripción">{formatShortDate(student.enrolledAt)}</td>
                        <td data-label="Vencimiento">{student.hasLimit ? <div className="student-expiry"><span>{formatShortDate(student.expiresAt)}</span><small className={`expiry-${expiry.tone}`}>{expiry.text}</small></div> : <span className="muted-text">{expiry.text}</span>}</td>
                        <td className="student-actions"><button type="button" className="button button-secondary student-toggle" aria-expanded={open} aria-controls={open ? detailId : undefined} disabled={progressLoadingId === student.id} onClick={() => onToggle(student)}>{progressLoadingId === student.id ? <LoaderCircle className="button-spinner" size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}Clases<span className="sr-only"> de {student.fullName}</span></button></td>
                      </tr>
                      {open && <tr className="student-detail-row"><td colSpan={7}><div className="student-detail" id={detailId}><LessonBreakdown detail={progressById[student.id]} loading={progressLoadingId === student.id && !progressById[student.id]} certificateIssued={Boolean(student.certificateIssued)} /></div></td></tr>}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </>}
    </div>
  );
}
