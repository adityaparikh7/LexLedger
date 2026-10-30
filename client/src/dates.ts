/** Today's local date as YYYY-MM-DD.
 *  (toISOString() converts to UTC first, which in IST gives yesterday's date before 05:30.) */
export function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
