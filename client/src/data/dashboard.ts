import type { DashboardData, Invoice } from '../api';
import { dashboardRange } from '../../../shared/dates';
import { roundMoney } from '../../../shared/invoiceMath';

/** Dashboard figures from the device's data, matching the server's SQL
 *  (server/src/cloud/routes/dashboard.ts) and using this device's clock for the period. */
export function computeDashboard(invoices: Invoice[], totalClients: number, timeFilter: string, startDate?: string, endDate?: string): DashboardData {
  const { start, end } = dashboardRange(timeFilter, startDate, endDate);
  const inRange = invoices.filter((i) => (!start || i.date >= start) && (!end || i.date <= end));
  const balance = (i: Invoice) => Math.max(i.total - (i.amount_received || 0) - (i.tds_amount || 0), 0);
  const sum = (rows: Invoice[], f: (i: Invoice) => number) => roundMoney(rows.reduce((s, i) => s + f(i), 0));
  const live = inRange.filter((i) => i.status !== 'cancelled');
  const count = (status: Invoice['status']) => inRange.filter((i) => i.status === status).length;

  return {
    stats: {
      total_invoices: inRange.length,
      total_billed: sum(live, (i) => i.total),
      // A memo marked paid with no payment recorded counts as fully received
      total_received: sum(live, (i) => (i.status === 'paid' && (i.amount_received || 0) + (i.tds_amount || 0) === 0 ? i.total : i.amount_received || 0)),
      total_tds: sum(live, (i) => i.tds_amount || 0),
      total_outstanding: sum(inRange.filter((i) => ['sent', 'draft', 'unpaid'].includes(i.status)), balance),
      total_unpaid: sum(inRange.filter((i) => i.status === 'unpaid'), balance),
      paid_count: count('paid'),
      unpaid_count: count('unpaid'),
      draft_count: count('draft'),
      sent_count: count('sent'),
    },
    recentInvoices: [...inRange].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10),
    totalClients,
  };
}
