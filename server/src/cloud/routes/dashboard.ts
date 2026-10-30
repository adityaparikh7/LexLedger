import { Router, Request, Response } from 'express';
import { and, count, desc, eq, getTableColumns, gte, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { getDb } from '../db';
import { clients, invoices } from '../db/schema';
import { accountId } from '../auth';
import { dashboardRange } from '../../../../shared/dates';

const router = Router();

// GET dashboard stats
router.get('/', async (req: Request, res: Response) => {
  try {
    const { timeFilter, startDate, endDate } = req.query;
    // Month/quarter/year use the server's local date, so the cloud image runs with TZ=Asia/Kolkata
    const { start, end } = dashboardRange(timeFilter, startDate, endDate);
    const account = accountId(req);
    const where: SQL | undefined = and(
      eq(invoices.account_id, account),
      isNull(invoices.deleted_at),
      start ? gte(invoices.date, start) : undefined,
      end ? lte(invoices.date, end) : undefined,
    );
    const balance = sql`GREATEST(${invoices.total} - ${invoices.amount_received} - ${invoices.tds_amount}, 0)`;
    const db = getDb();

    const [stats] = await db.select({
      total_invoices: sql<number>`COUNT(*)::int`,
      total_billed: sql<number>`COALESCE(SUM(${invoices.total}) FILTER (WHERE ${invoices.status} != 'cancelled'), 0)::float8`,
      // Money actually received. A memo marked paid with no payment recorded counts as fully received.
      total_received: sql<number>`COALESCE(SUM(CASE
        WHEN ${invoices.status} = 'cancelled' THEN 0
        WHEN ${invoices.status} = 'paid' AND ${invoices.amount_received} + ${invoices.tds_amount} = 0 THEN ${invoices.total}
        ELSE ${invoices.amount_received}
      END), 0)::float8`,
      total_tds: sql<number>`COALESCE(SUM(${invoices.tds_amount}) FILTER (WHERE ${invoices.status} != 'cancelled'), 0)::float8`,
      // Remaining balance after part-payments and TDS
      total_outstanding: sql<number>`COALESCE(SUM(${balance}) FILTER (WHERE ${invoices.status} IN ('sent', 'draft', 'unpaid')), 0)::float8`,
      total_unpaid: sql<number>`COALESCE(SUM(${balance}) FILTER (WHERE ${invoices.status} = 'unpaid'), 0)::float8`,
      paid_count: sql<number>`(COUNT(*) FILTER (WHERE ${invoices.status} = 'paid'))::int`,
      unpaid_count: sql<number>`(COUNT(*) FILTER (WHERE ${invoices.status} = 'unpaid'))::int`,
      draft_count: sql<number>`(COUNT(*) FILTER (WHERE ${invoices.status} = 'draft'))::int`,
      sent_count: sql<number>`(COUNT(*) FILTER (WHERE ${invoices.status} = 'sent'))::int`,
    }).from(invoices).where(where);

    const recentInvoices = await db.select({
      ...getTableColumns(invoices),
      client_name: clients.name,
      client_email: clients.email,
    }).from(invoices)
      .leftJoin(clients, eq(invoices.client_id, clients.id))
      .where(where)
      .orderBy(desc(invoices.created_at))
      .limit(10);

    const [{ value: totalClients }] = await db.select({ value: count() }).from(clients)
      .where(and(eq(clients.account_id, account), isNull(clients.deleted_at)));

    res.json({ stats, recentInvoices, totalClients });
  } catch (err: any) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
