/**
 * FIS Previous Year (period month 00) helpers.
 * e.g. 202600 = reporting year 2026 closing balances (Actual only).
 */

export function isFisPreviousYearPeriod(period: string): boolean {
  const p = period.trim();
  return /^\d{6}$/.test(p) && p.slice(4, 6) === '00';
}

export function fisPreviousYearPeriodForYear(reportYear: number): string {
  return `${reportYear}00`;
}

export function fisReportYearFromPeriod(period: string): number {
  return parseInt(period.trim().slice(0, 4), 10);
}

/** Human label for processing UI, e.g. "Previous Year 2026". */
export function formatFisPreviousYearPeriod(period: string): string {
  if (!isFisPreviousYearPeriod(period)) return period;
  return `Previous Year ${period.slice(0, 4)}`;
}
