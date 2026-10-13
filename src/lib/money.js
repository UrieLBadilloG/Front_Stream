// Monedas sin decimales en Mercado Pago. Debe coincidir con ZERO_DECIMAL del backend.
const ZERO_DECIMAL = new Set(['CLP', 'COP']);

export const fractionDigits = (currency) => (ZERO_DECIMAL.has(currency) ? 0 : 2);

// Los precios se guardan en centésimas de la moneda de la cuenta (courses.price_cents).
// Se redondea igual que el backend: en monedas sin decimales, Math.round(cents / 100).
export function formatPrice(priceCents, currency) {
  const cents = Number(priceCents) || 0;
  if (cents <= 0) return 'Gratis';
  const digits = fractionDigits(currency);
  const major = digits === 0 ? Math.round(cents / 100) : Number((cents / 100).toFixed(2));
  if (!currency) {
    return new Intl.NumberFormat('es-MX', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(major);
  }
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(major);
  } catch {
    return new Intl.NumberFormat('es-MX', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(major);
  }
}

// Convierte el valor del input del editor (moneda principal) a centésimas.
export const amountToCents = (amount) => Math.round(Number(amount || 0) * 100);
export const centsToAmount = (cents, currency) => {
  const major = Number(cents || 0) / 100;
  return fractionDigits(currency) === 0 ? String(Math.round(major)) : major.toFixed(2);
};
