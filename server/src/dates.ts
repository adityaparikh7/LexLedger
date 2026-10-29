/** Format a Date as YYYY-MM-DD using its local calendar date.
 *  (toISOString() converts to UTC first, which in IST gives the previous day before 05:30.) */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface FinancialYear {
  /** First day of the FY, e.g. 2026-04-01 */
  start: string;
  /** Last day of the FY, e.g. 2027-03-31 */
  end: string;
  /** Display label used in invoice numbers, e.g. 2026-27 */
  label: string;
}

/** Indian financial year (1 April – 31 March) containing the given date.
 *  A YYYY-MM-DD string is read as-is, so the result never depends on the machine's timezone. */
export function getFinancialYear(date: string | Date = new Date()): FinancialYear {
  let year: number;
  let month: number; // 1-12
  if (typeof date === 'string') {
    const [y, m] = date.split('T')[0].split('-').map(Number);
    year = y;
    month = m;
  } else {
    year = date.getFullYear();
    month = date.getMonth() + 1;
  }
  const startYear = month >= 4 ? year : year - 1;
  return {
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
    label: `${startYear}-${String(startYear + 1).slice(-2)}`,
  };
}
