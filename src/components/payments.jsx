import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, Ban, CheckCircle2, ChevronLeft, ChevronRight, Clock3, CreditCard, LoaderCircle, RefreshCw, ShieldCheck, Undo2, XCircle } from 'lucide-react';

import { useApp } from '../lib/app-context.js';
import { accessLabel, formatShortDate } from '../lib/access.js';
import { formatPrice, fractionDigits } from '../lib/money.js';
import { buildLoginPath } from '../lib/next-path.js';

const FALLBACK_COVER = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80';
const RETRY_DELAYS_MS = [2000, 4000, 8000];
const MP_HOST = /^([a-z0-9-]+\.)*(mercadopago|mercadolibre)\.com(\.[a-z]{2})?$/i;

// El backend entrega importes en moneda principal (p. ej. 49.99); formatPrice espera centésimas.
const formatAmount = (amount, currency) => formatPrice(Math.round(Number(amount || 0) * 100), currency);

// Los totales muestran 0 en lugar de "Gratis".
const formatTotal = (amount, currency) => {
  if (Number(amount) > 0) return formatAmount(amount, currency);
  const digits = fractionDigits(currency);
  const zero = digits === 0 ? '0' : '0.00';
  try { return currency ? new Intl.NumberFormat('es-MX', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(0) : zero; } catch { return zero; }
};

// Solo se redirige a https en un dominio de Mercado Pago o Mercado Libre.
const isSafeCheckoutUrl = (value) => {
  try { const url = new URL(value); return url.protocol === 'https:' && MP_HOST.test(url.hostname); } catch { return false; }
};

const statusMeta = {
  approved: { label: 'Aprobado', Icon: CheckCircle2, tone: 'ok' },
  pending: { label: 'Pendiente', Icon: Clock3, tone: 'warn' },
  in_process: { label: 'En proceso', Icon: Clock3, tone: 'warn' },
  authorized: { label: 'Autorizado', Icon: Clock3, tone: 'warn' },
  in_mediation: { label: 'En mediación', Icon: AlertTriangle, tone: 'warn' },
  rejected: { label: 'Rechazado', Icon: XCircle, tone: 'danger' },
  cancelled: { label: 'Cancelado', Icon: Ban, tone: 'muted' },
  refunded: { label: 'Reembolsado', Icon: Undo2, tone: 'muted' },
  charged_back: { label: 'Contracargo', Icon: AlertTriangle, tone: 'danger' },
};
const reviewReasonLabels = {
  amount_mismatch: 'El monto no coincide',
  metadata_mismatch: 'Los datos no coinciden',
  duplicate_payment: 'Pago duplicado',
  refunded: 'Reembolsado tras aprobar',
  charged_back: 'Contracargo tras aprobar',
  cancelled_after_approval: 'Cancelado tras aprobar',
};
const isOpenStatus = (status) => ['pending', 'in_process', 'authorized', 'in_mediation'].includes(status);

// El estado nunca se comunica solo con color: siempre icono + texto.
function PaymentStatusChip({ status }) {
  const { label, Icon, tone } = statusMeta[status] || { label: status || 'Desconocido', Icon: Clock3, tone: 'muted' };
  return <span className={`status-badge status-${tone}`}><Icon size={13} aria-hidden="true" />{label}</span>;
}

function PaymentsSkeleton({ rows = 3 }) {
  return <div className="pay-skeleton" aria-hidden="true">{Array.from({ length: rows }, (_, index) => <div className="skeleton" key={index} />)}</div>;
}

function CheckoutSkeleton() {
  return <main className="page"><div className="container skeleton-page"><div className="skeleton skeleton-eyebrow" /><div className="skeleton skeleton-title" /><div className="skeleton skeleton-copy" /><div className="skeleton-workspace" style={{ marginTop: 28 }}><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /></div></div></main>;
}

export function CheckoutPage() {
  const { id: slug } = useParams();
  const { user, api, notify, payments, formatMoney } = useApp();
  const navigate = useNavigate();
  const [choice, setChoice] = useState(null);
  const [course, setCourse] = useState(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setCourse(null); setError('');
    api(`/api/courses/${slug}`).then(({ course: next }) => { if (!cancelled) setCourse(next); }).catch((requestError) => { if (!cancelled) setError(requestError.message || 'No se pudo cargar el curso.'); });
    return () => { cancelled = true; };
  }, [slug, userId]);
  if (!user) return <Navigate to={buildLoginPath({ next: `/pago/${slug}` })} replace />;
  if (error) return <main className="page"><div className="container empty">{error} <Link className="text-link" to="/explorar">Volver al catálogo</Link></div></main>;
  if (!course || !payments.ready) return <CheckoutSkeleton />;
  const price = formatMoney(course.priceCents);
  const isFree = !(Number(course.priceCents) > 0);
  // Mismo criterio que el backend (isCourseManager): super administrador o propietario del curso.
  const isManager = user.role === 'super_admin' || Number(course.owner?.id) === Number(user.id);
  const method = choice || (payments.enabled ? 'mp' : 'transfer');
  const transferReference = `STR-${course.id}-${user.id}`.toUpperCase();
  const startPayment = async () => {
    if (paying) return;
    setPaying(true); setPayError('');
    try {
      const result = await api(`/api/payments/courses/${course.id}/checkout`, { method: 'POST' });
      if (!isSafeCheckoutUrl(result.initPoint)) throw new Error('No pudimos abrir Mercado Pago. Intenta de nuevo en unos minutos.');
      window.location.assign(result.initPoint);
    } catch (requestError) {
      if (requestError.code === 'COURSE_MANAGER') { setPayError('Eres administrador de este curso, no necesitas comprarlo.'); setPaying(false); return; }
      if (requestError.code === 'ALREADY_ENROLLED') { notify('Ya tienes acceso a este curso.'); navigate('/mi-aprendizaje'); return; }
      setPayError(requestError.message || 'No pudimos iniciar el pago. Intenta de nuevo.');
      setPaying(false);
    }
  };
  return <main className="page checkout-page"><div className="container checkout-layout"><section className="checkout-main"><Link className="text-link" to={`/curso/${course.slug}`}><ArrowLeft size={17} aria-hidden="true" /> Volver al curso</Link><span className="eyebrow" style={{ marginTop: 18 }}><ShieldCheck size={15} aria-hidden="true" /> Pago seguro</span><h1>Completa tu inscripción</h1><p>Elige cómo quieres obtener acceso a <strong>{course.title}</strong>.</p>
    {isFree ? <section className="payment-panel"><h2>Este curso es gratuito</h2><p>No necesitas pagar. Inscríbete desde la página del curso.</p><Link className="button button-primary" to={`/curso/${course.slug}`}>Ir al curso <ArrowRight size={17} aria-hidden="true" /></Link></section> : isManager ? <section className="payment-panel" role="status"><h2>Eres administrador de este curso</h2><p>Eres administrador de este curso, no necesitas comprarlo. Ya tienes acceso completo desde tu panel.</p><Link className="button button-primary" to={`/aprender/${course.id}`}>Ir al curso <ArrowRight size={17} aria-hidden="true" /></Link></section> : <>
      {!payments.enabled && <p className="pay-notice" role="status"><AlertTriangle size={18} aria-hidden="true" /><span>El pago en línea no está disponible por ahora. Puedes pagar por transferencia.</span></p>}
      <div className="payment-methods">{payments.enabled && <button type="button" className={`payment-method ${method === 'mp' ? 'active' : ''}`} aria-pressed={method === 'mp'} onClick={() => setChoice('mp')}><span><CreditCard size={20} aria-hidden="true" /></span><div><strong>Mercado Pago</strong><small>Tarjeta, saldo y más medios</small></div></button>}<button type="button" className={`payment-method ${method === 'transfer' ? 'active' : ''}`} aria-pressed={method === 'transfer'} onClick={() => setChoice('transfer')}><span>↗</span><div><strong>Transferencia</strong><small>Acceso asignado tras validación</small></div></button></div>
      {method === 'mp' && payments.enabled ? <section className="payment-panel pay-mp-panel"><h2>Pagar con Mercado Pago</h2><p>Te llevaremos a Mercado Pago para completar el pago. En Streamly Academia no pedimos ni guardamos los datos de tu tarjeta.</p><ul className="pay-steps"><li>Pagas en el sitio seguro de Mercado Pago.</li><li>Al volver verificamos el pago y activamos tu acceso.</li></ul>{payError && <p className="form-error" role="alert">{payError}</p>}<button type="button" className="button button-primary" disabled={paying} onClick={() => { void startPayment(); }}>{paying ? <><LoaderCircle className="button-spinner" size={17} aria-hidden="true" /> Abriendo Mercado Pago…</> : <>Pagar con Mercado Pago · {price}</>}</button><p className="pay-seal"><ShieldCheck size={16} aria-hidden="true" /> Pago procesado por Mercado Pago</p></section> : <section className="payment-panel"><h2>Pagar por transferencia</h2><p>Usa esta referencia. Un administrador validará el comprobante y asignará tu acceso.</p><div className="transfer-reference"><span>Referencia única</span><strong>{transferReference}</strong><small>Inclúyela en el concepto de la transferencia.</small></div><div className="transfer-note"><ShieldCheck size={20} aria-hidden="true" /><span>El acceso se activa después de validar la transferencia.</span></div></section>}</>}
    </section><aside className="checkout-summary"><img className="checkout-summary-image" src={course.thumbnailUrl || FALLBACK_COVER} alt={`Portada de ${course.title}`} /><span className="course-instructor">{course.instructorName || course.owner?.fullName}</span><h2>{course.title}</h2><div className="checkout-summary-row"><span>Curso</span><strong>{price}</strong></div><div className="checkout-summary-row"><span>Acceso</span><strong>{accessLabel(course.accessDays)}</strong></div><div className="checkout-summary-row total"><span>Total</span><strong>{price}</strong></div></aside></div></main>;
}

// outcome del backend + accessGranted -> estado visual.
const resultState = (result) => {
  if (!result) return 'pending';
  if (result.outcome === 'approved') return result.accessGranted ? 'approved' : 'review';
  if (result.outcome === 'rejected' || result.outcome === 'refunded') return 'rejected';
  return 'pending';
};

export function PaymentResultPage() {
  const { user, api } = useApp();
  const location = useLocation();
  const [params] = useSearchParams();
  const externalReference = params.get('external_reference') || '';
  const rawPaymentId = params.get('payment_id') || params.get('collection_id') || '';
  const paymentId = /^\d{1,20}$/.test(rawPaymentId) ? rawPaymentId : '';
  const [state, setState] = useState({ phase: 'loading', result: null, error: '', checking: true });
  const apiRef = useRef(api); apiRef.current = api;
  const timerRef = useRef(null);
  const runRef = useRef(0);
  const userId = user?.id;
  // La URL de retorno nunca se toma como verdad: siempre se consulta al backend.
  const verify = useCallback(() => {
    const run = ++runRef.current;
    clearTimeout(timerRef.current);
    setState((current) => ({ ...current, phase: current.result ? 'done' : 'loading', error: '', checking: true }));
    const attempt = async (index) => {
      try {
        const result = await apiRef.current('/api/payments/verify', { method: 'POST', body: { externalReference, ...(paymentId ? { paymentId } : {}) } });
        if (runRef.current !== run) return;
        const waiting = resultState(result) !== 'approved' && resultState(result) !== 'rejected';
        if (waiting && index < RETRY_DELAYS_MS.length) {
          setState({ phase: 'done', result, error: '', checking: true });
          timerRef.current = setTimeout(() => { void attempt(index + 1); }, RETRY_DELAYS_MS[index]);
          return;
        }
        setState({ phase: 'done', result, error: '', checking: false });
      } catch (requestError) {
        if (runRef.current !== run) return;
        setState({ phase: 'error', result: null, error: requestError.status === 404 ? 'No encontramos este pago en tu cuenta.' : (requestError.message || 'No pudimos verificar tu pago.'), checking: false });
      }
    };
    void attempt(0);
  }, [externalReference, paymentId]);
  useEffect(() => {
    if (!userId || !externalReference) return undefined;
    verify();
    return () => { runRef.current += 1; clearTimeout(timerRef.current); };
  }, [userId, externalReference, verify]);
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  const noReference = !externalReference;
  const kind = noReference || state.phase === 'error' ? 'error' : state.phase === 'loading' ? 'loading' : resultState(state.result);
  const result = state.result;
  const course = result?.course;
  const payment = result?.payment;
  const spinning = state.checking && kind === 'pending';
  const view = {
    loading: { title: 'Verificando tu pago…', copy: 'Estamos confirmando tu pago con Mercado Pago. Puede tardar unos segundos.', tone: 'pending', Icon: LoaderCircle },
    approved: { title: '¡Pago aprobado!', copy: course ? `Ya tienes acceso a ${course.title}.` : 'Ya tienes acceso al curso.', tone: 'ok', Icon: CheckCircle2 },
    review: { title: 'Recibimos tu pago', copy: 'Lo estamos validando antes de activar tu acceso. Si en unos minutos no ves el curso, escríbenos con tu referencia.', tone: 'pending', Icon: Clock3 },
    pending: { title: 'Tu pago está pendiente', copy: spinning ? 'Seguimos verificando con Mercado Pago…' : 'Mercado Pago aún no confirma el pago. Algunos medios, como efectivo o transferencia, tardan más. Te daremos acceso apenas se apruebe.', tone: 'pending', Icon: Clock3 },
    rejected: { title: result?.outcome === 'refunded' ? 'Este pago fue reembolsado' : 'El pago no se completó', copy: result?.outcome === 'refunded' ? 'El importe volvió a tu medio de pago.' : 'Mercado Pago no aprobó el pago. No se te cobró o el cobro se revirtió. Puedes intentarlo de nuevo con otro medio.', tone: 'danger', Icon: XCircle },
    error: { title: noReference ? 'No encontramos tu pago' : 'No pudimos verificar tu pago', copy: noReference ? 'El enlace no incluye la referencia del pago. Revisa tu historial para ver el estado de tus compras.' : state.error, tone: 'danger', Icon: AlertTriangle },
  }[kind];
  const Icon = view.Icon;
  return <main className="page"><div className="container pay-result-wrap"><section className={`pay-result pay-result-${view.tone}`} role="status" aria-live="polite" aria-busy={kind === 'loading' || spinning}>
    {kind === 'loading' ? <div className="skeleton pay-result-skeleton" aria-hidden="true" /> : <span className="pay-result-icon" aria-hidden="true"><Icon size={34} className={spinning ? 'button-spinner' : undefined} /></span>}
    <h1>{view.title}</h1><p>{view.copy}</p>
    {payment && kind !== 'loading' && kind !== 'error' && <dl className="pay-result-summary">{course && <div><dt>Curso</dt><dd>{course.title}</dd></div>}<div><dt>Importe</dt><dd>{formatAmount(payment.amount, payment.currency)}</dd></div><div><dt>Estado</dt><dd><PaymentStatusChip status={payment.status} /></dd></div></dl>}
    <div className="pay-result-actions">
      {kind === 'approved' && course && <Link className="button button-primary" to={`/aprender/${course.id}`}>Ir al curso <ArrowRight size={17} aria-hidden="true" /></Link>}
      {kind === 'rejected' && course && <Link className="button button-primary" to={`/pago/${course.slug}`}>Intentar de nuevo</Link>}
      {(kind === 'pending' || kind === 'review' || (kind === 'error' && !noReference)) && !spinning && <button type="button" className="button button-primary" onClick={verify}><RefreshCw size={16} aria-hidden="true" /> Verificar de nuevo</button>}
      {kind !== 'loading' && <Link className="button button-secondary" to="/mis-pagos">Ver mis pagos</Link>}
    </div>
  </section></div></main>;
}

export function MyPaymentsPage() {
  const { user, api, notify } = useApp();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [checkingId, setCheckingId] = useState(null);
  const userId = user?.id;
  const load = useCallback(() => {
    setError('');
    api('/api/payments/mine').then((result) => setItems(result.payments || [])).catch((requestError) => setError(requestError.message || 'No se pudo cargar tu historial de pagos.'));
  }, [userId]);
  useEffect(() => { if (userId) load(); }, [userId, load]);
  if (!user) return <Navigate to="/login" replace state={{ from: '/mis-pagos' }} />;
  const check = async (item) => {
    if (checkingId) return;
    setCheckingId(item.id);
    try {
      const result = await api('/api/payments/verify', { method: 'POST', body: { externalReference: item.externalReference } });
      setItems((current) => current.map((row) => (row.id === item.id ? { ...row, status: result.payment.status, statusDetail: result.payment.statusDetail, approvedAt: result.payment.approvedAt, accessGranted: result.accessGranted } : row)));
      notify(result.outcome === 'approved' && result.accessGranted ? 'Pago aprobado. Tu acceso ya está activo.' : result.outcome === 'pending' ? 'El pago sigue pendiente en Mercado Pago.' : 'Estado del pago actualizado.');
    } catch (requestError) { notify(requestError.message || 'No se pudo verificar el pago.'); } finally { setCheckingId(null); }
  };
  return <main className="page"><div className="container"><div className="workspace-page-head"><div><span className="eyebrow"><CreditCard size={15} aria-hidden="true" /> Pagos</span><h1>Mis pagos</h1><p>Historial de tus compras y estado de cada pago.</p></div><button type="button" className="button button-secondary" onClick={load}><RefreshCw size={16} aria-hidden="true" /> Actualizar</button></div>
    {error ? <div className="empty">{error}</div> : !items ? <PaymentsSkeleton /> : items.length ? <section className="workspace-card pay-list" aria-label="Historial de pagos">{items.map((item) => <article className="pay-row" key={item.id}><div className="pay-row-course"><Link className="text-link" to={`/curso/${item.course.slug}`}>{item.course.title}</Link><span>{formatShortDate(item.createdAt)}</span></div><strong className="pay-row-amount">{formatAmount(item.amount, item.currency)}</strong><div className="pay-row-status"><PaymentStatusChip status={item.status} />{item.status === 'approved' && item.accessGranted && <Link className="text-link" to={`/aprender/${item.course.id}`}>Ir al curso</Link>}</div><div className="pay-row-action">{isOpenStatus(item.status) && <button type="button" className="button button-secondary" disabled={Boolean(checkingId)} onClick={() => { void check(item); }}>{checkingId === item.id ? <><LoaderCircle className="button-spinner" size={16} aria-hidden="true" /> Verificando…</> : 'Verificar estado'}</button>}</div></article>)}</section> : <div className="empty">Aún no tienes pagos. Cuando compres un curso aparecerá aquí. <Link className="text-link" to="/explorar">Explorar cursos</Link></div>}
  </div></main>;
}

const FILTERS = [['', 'Todos'], ['approved', 'Aprobados'], ['pending', 'Pendientes'], ['in_process', 'En proceso'], ['rejected', 'Rechazados'], ['cancelled', 'Cancelados'], ['refunded', 'Reembolsados'], ['charged_back', 'Contracargos'], ['review', 'Requieren revisión']];
const TOTAL_ORDER = ['approved', 'pending', 'in_process', 'rejected', 'refunded', 'charged_back', 'cancelled'];

export function AdminPaymentsPanel() {
  const { api, notify } = useApp();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    const query = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (status) query.set('status', status);
    api(`/api/super/payments?${query}`).then((result) => { if (!cancelled) setData(result); }).catch((requestError) => { if (!cancelled) { setError(requestError.message || 'No se pudieron cargar los pagos.'); notify(requestError.message || 'No se pudieron cargar los pagos.'); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status, page, reloadKey]);
  const changeStatus = (next) => { setStatus(next); setPage(1); };
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const currency = data?.currency || null;
  const totals = data ? TOTAL_ORDER.map((key) => data.totals.find((row) => row.status === key) || { status: key, count: 0, amount: 0 }) : [];
  return <section className="workspace-card pay-admin"><div className="section-heading"><div><h2>Pagos con Mercado Pago</h2><p>Estado de cada cobro, ingresos aprobados y pagos que requieren revisión.</p></div><button type="button" className="button button-secondary" onClick={() => setReloadKey((key) => key + 1)}><RefreshCw size={16} aria-hidden="true" /> Actualizar</button></div>
    {data && <div className="pay-totals">{totals.map((row) => <div className="pay-total" key={row.status}><PaymentStatusChip status={row.status} /><strong>{formatTotal(row.amount, currency)}</strong><span>{row.count} {row.count === 1 ? 'pago' : 'pagos'}</span></div>)}</div>}
    <div className="pay-filters" role="group" aria-label="Filtrar por estado">{FILTERS.map(([key, label]) => <button type="button" key={key || 'all'} className={status === key ? 'active' : ''} aria-pressed={status === key} onClick={() => changeStatus(key)}>{label}</button>)}</div>
    {error && !data ? <div className="empty">{error}</div> : !data ? <PaymentsSkeleton /> : <div aria-busy={loading} className={loading ? 'pay-loading' : undefined}>{data.payments.length ? <div className="pay-list">{data.payments.map((item) => <article className="pay-row pay-row-admin" key={item.id}><div className="pay-row-course"><strong>{item.course.title}</strong><span>{item.student.fullName} · {item.student.email}</span><span>Instructor: {item.course.ownerName} · {formatShortDate(item.createdAt)}</span></div><strong className="pay-row-amount">{formatAmount(item.amount, item.currency)}</strong><div className="pay-row-status"><PaymentStatusChip status={item.status} />{item.needsReview && <span className="status-badge status-danger" title={reviewReasonLabels[item.reviewReason] || item.reviewReason || undefined}><AlertTriangle size={13} aria-hidden="true" />Requiere revisión{item.reviewReason ? `: ${reviewReasonLabels[item.reviewReason] || item.reviewReason}` : ''}</span>}</div></article>)}</div> : <div className="empty">No hay pagos con este filtro.</div>}
      <div className="pay-pager"><button type="button" className="button button-secondary" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} aria-hidden="true" /> Anterior</button><span>Página {data.page} de {totalPages} · {data.total} {data.total === 1 ? 'pago' : 'pagos'}</span><button type="button" className="button button-secondary" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>Siguiente <ChevronRight size={16} aria-hidden="true" /></button></div></div>}
  </section>;
}

// Ingresos aprobados por curso para la pestaña Analítica del docente. Si falla, la analítica sigue funcionando.
export function TeacherRevenue({ children }) {
  const { api } = useApp();
  const [state, setState] = useState({ status: 'loading', byCourse: {}, currency: null });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const byCourse = {}; let currency = null;
      for (let page = 1; page <= 10; page += 1) {
        const result = await api(`/api/admin/payments?status=approved&page=${page}&pageSize=50`);
        currency = result.currency || currency;
        result.payments.forEach((item) => { byCourse[item.course.id] = (byCourse[item.course.id] || 0) + item.amount; });
        if (page * result.pageSize >= result.total) break;
      }
      if (!cancelled) setState({ status: 'ready', byCourse, currency });
    })().catch(() => { if (!cancelled) setState({ status: 'error', byCourse: {}, currency: null }); });
    return () => { cancelled = true; };
  }, []);
  const revenueOf = (courseId) => {
    if (state.status === 'loading') return 'Ingresos…';
    if (state.status === 'error') return 'Ingresos no disponibles';
    const total = state.byCourse[courseId] || 0;
    return total > 0 ? `Ingresos ${formatAmount(total, state.currency)}` : 'Sin ingresos aún';
  };
  return children(revenueOf);
}
