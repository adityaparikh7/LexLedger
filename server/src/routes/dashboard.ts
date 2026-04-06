import { Router, Request, Response } from 'express';
import db from '../db';
const router = Router();
// GET dashboard stats
router.get('/', (_req: Request, res: Response) => {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_invoices,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status IN ('sent', 'draft', 'unpaid') THEN total ELSE 0 END), 0) as total_outstanding,
        COALESCE(SUM(CASE WHEN status = 'unpaid' THEN total ELSE 0 END), 0) as total_unpaid,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status = 'unpaid' THEN 1 END) as unpaid_count,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count
      FROM invoices
    `).get();
    const recentInvoices = db.prepare(`
      SELECT i.*, c.name as client_name, c.email as client_email
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      ORDER BY i.created_at DESC
      LIMIT 10
    `).all();
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