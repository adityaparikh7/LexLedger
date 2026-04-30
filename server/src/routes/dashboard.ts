import { Router, Request, Response } from 'express';
import db from '../db';

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
        if (timeFilter === 'month') {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          startDateStr = startOfMonth.toISOString().split('T')[0];
        } else if (timeFilter === 'quarter') {
          const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
          const startOfQuarter = new Date(now.getFullYear(), quarterMonth, 1);
          startDateStr = startOfQuarter.toISOString().split('T')[0];
        } else if (timeFilter === 'year') {
          // Indian Financial Year starts April 1st
          const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
          const startOfFY = new Date(startYear, 3, 1);
          startDateStr = startOfFY.toISOString().split('T')[0];
        }

        if (startDateStr) {
          dateCondition = 'WHERE date >= ?';
          queryParams.push(startDateStr);
        }
      }
    }

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_invoices,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) as total_billed,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status IN ('sent', 'draft', 'unpaid') THEN total ELSE 0 END), 0) as total_outstanding,
        COALESCE(SUM(CASE WHEN status = 'unpaid' THEN total ELSE 0 END), 0) as total_unpaid,
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