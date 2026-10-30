import { Router, Request, Response } from 'express';
import db from '../db';
import { getFinancialYear, toLocalDateString } from '../dates';

const router = Router();

// GET dashboard stats
router.get('/', (req: Request, res: Response) => {
  try {
    const { timeFilter, startDate, endDate } = req.query;
    let dateCondition = '';
    const queryParams: any[] = [];

    if (timeFilter && timeFilter !== 'all') {
      const now = new Date();
      let startDateStr = '';

      if (timeFilter === 'custom') {
        if (startDate && endDate) {
          dateCondition = 'WHERE date >= ? AND date <= ?';
          queryParams.push(startDate as string, endDate as string);
        } else if (startDate) {
          dateCondition = 'WHERE date >= ?';
          queryParams.push(startDate as string);
        } else if (endDate) {
          dateCondition = 'WHERE date <= ?';
          queryParams.push(endDate as string);
        }
      } else {
        let endDateStr = '';
        if (timeFilter === 'month') {
          startDateStr = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
          endDateStr = toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        } else if (timeFilter === 'quarter') {
          // Calendar quarters line up with Indian FY quarters (Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar)
          const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
          startDateStr = toLocalDateString(new Date(now.getFullYear(), quarterMonth, 1));
          endDateStr = toLocalDateString(new Date(now.getFullYear(), quarterMonth + 3, 0));
        } else if (timeFilter === 'year') {
          // Indian Financial Year: April 1st to March 31st
          const fy = getFinancialYear(now);
          startDateStr = fy.start;
          endDateStr = fy.end;
        }

        if (startDateStr && endDateStr) {
          dateCondition = 'WHERE date >= ? AND date <= ?';
          queryParams.push(startDateStr, endDateStr);
        }
      }
    }

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_invoices,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) as total_billed,
        -- Money actually received. A memo marked paid with no payment recorded counts as fully received.
        COALESCE(SUM(CASE
          WHEN status = 'cancelled' THEN 0
          WHEN status = 'paid' AND COALESCE(amount_received, 0) + COALESCE(tds_amount, 0) = 0 THEN total
          ELSE COALESCE(amount_received, 0)
        END), 0) as total_received,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(tds_amount, 0) ELSE 0 END), 0) as total_tds,
        -- Remaining balance after part-payments and TDS
        COALESCE(SUM(CASE WHEN status IN ('sent', 'draft', 'unpaid')
          THEN MAX(total - COALESCE(amount_received, 0) - COALESCE(tds_amount, 0), 0) ELSE 0 END), 0) as total_outstanding,
        COALESCE(SUM(CASE WHEN status = 'unpaid'
          THEN MAX(total - COALESCE(amount_received, 0) - COALESCE(tds_amount, 0), 0) ELSE 0 END), 0) as total_unpaid,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status = 'unpaid' THEN 1 END) as unpaid_count,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count
      FROM invoices
      ${dateCondition}
    `).get(...queryParams);

    let recentCondition = '';
    if (dateCondition) {
      recentCondition = dateCondition.replace(/date/g, 'i.date');
    }

    const recentInvoices = db.prepare(`
      SELECT i.*, c.name as client_name, c.email as client_email
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      ${recentCondition}
      ORDER BY i.created_at DESC
      LIMIT 10
    `).all(...queryParams);

    const totalClients = db.prepare('SELECT COUNT(*) as count FROM clients').get() as { count: number };

    res.json({
      stats,
      recentInvoices,
      totalClients: totalClients.count,
    });
  } catch (err: any) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;