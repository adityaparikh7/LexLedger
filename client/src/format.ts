import { todayLocal } from './dates';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ₹1,75,000.00 — Indian digit grouping. Pass `decimals: false` for whole rupees (KPIs, summaries). */
export function formatINR(value: number | null | undefined, decimals = true): string {
  const n = Number(value) || 0;
  const digits = decimals ? 2 : 0;
  const body = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${n < 0 ? '−' : ''}₹${body}`;
}

/** 2026-04-12 → 12 Apr 2026. Reads the YYYY-MM-DD string as-is, so the result never depends on the timezone. */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('T')[0].split('-');
  const month = MONTHS[Number(m) - 1];
  if (!y || !month || !d) return dateStr;
  return `${d} ${month} ${y}`;
}

/** Indian financial year label for a YYYY-MM-DD date (default today): 2026-11-15 → "2026–27". */
export function financialYearLabel(dateStr: string = todayLocal()): string {
  const [y, m] = dateStr.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}–${String((start + 1) % 100).padStart(2, '0')}`;
}

/** "Mehta & Associates" → "MA" */
export function initials(name: string | null | undefined): string {
  const words = (name || '').split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w));
  return words.slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
}

export function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
