import { Router, Request, Response } from 'express';
import db, { generateInvoiceNumber } from '../db';
import { generatePDF } from '../services/pdfGenerator';
import { generateExcel } from '../services/excelGenerator';
import { generateExportExcel } from '../services/exportGenerator';
import { sendInvoiceEmail, sendReminderEmail } from '../services/emailService';
import path from 'path';
import fs from 'fs';
const router = Router();
const COPIES_DIR = path.join(__dirname, '..', '..', '..', 'copies');
if (!fs.existsSync(COPIES_DIR)) {
  fs.mkdirSync(COPIES_DIR, { recursive: true });
}
interface LineItem {
  id?: number;
  description: string;
  hours: number;
  rate: number;
  amount: number;
}
interface PaymentEntry {
  id?: number;
  date: string;
  amount_received: number;
  tds_amount: number;
}

// Helper: sync invoice aggregate payment fields from payments table
function syncInvoicePaymentAggregates(invoiceId: number | string) {
  const payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ?').all(invoiceId) as any[];
  const totalReceived = payments.reduce((sum: number, p: any) => sum + (p.amount_received || 0), 0);
  const totalTds = payments.reduce((sum: number, p: any) => sum + (p.tds_amount || 0), 0);
  const latestPayment = payments.length > 0 ? payments.sort((a: any, b: any) => b.date.localeCompare(a.date))[0] : null;
  db.prepare(
    "UPDATE invoices SET amount_received = ?, tds_amount = ?, date_paid = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(totalReceived, totalTds, latestPayment ? latestPayment.date : null, invoiceId);
}

// Helper: replace all payments for an invoice
function replacePayments(invoiceId: number | string, payments: PaymentEntry[]) {
  db.prepare('DELETE FROM payments WHERE invoice_id = ?').run(invoiceId);
  const insertPayment = db.prepare(
    'INSERT INTO payments (invoice_id, date, amount_received, tds_amount) VALUES (?, ?, ?, ?)'
  );
  for (const p of payments) {
    insertPayment.run(invoiceId, p.date, p.amount_received || 0, p.tds_amount || 0);
  }
  syncInvoicePaymentAggregates(invoiceId);
}
// GET all invoices
router.get('/', (req: Request, res: Response) => {
  try {
    const { status, client_id } = req.query;
    let query = `
      SELECT i.*, c.name as client_name, c.email as client_email
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
    `;
    const conditions: string[] = [];
    const params: any[] = [];
    if (status) {
      conditions.push('i.status = ?');
      params.push(status);
    }
    if (client_id) {
      conditions.push('i.client_id = ?');
      params.push(client_id);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY i.created_at DESC';
    const invoices = db.prepare(query).all(...params);
    res.json(invoices);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// GET export invoices as Excel for a date range
router.get('/export', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    // Query invoices in the date range
    const invoices = db.prepare(`
      SELECT i.*, c.name as client_name, c.email as client_email, c.address as client_address, c.phone as client_phone
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.date >= ? AND i.date <= ?
      ORDER BY i.date ASC
    `).all(startDate, endDate) as any[];

    // Enrich each invoice with line_items and payments
    const enriched = invoices.map((inv: any) => {
      const lineItems = db.prepare('SELECT * FROM line_items WHERE invoice_id = ?').all(inv.id) as any[];
      const payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY date ASC').all(inv.id) as any[];
      return { ...inv, line_items: lineItems, payments };
    });

    const excelBuffer = await generateExportExcel(enriched);

    const safeStart = (startDate as string).replace(/[\\/]/g, '-');
    const safeEnd = (endDate as string).replace(/[\\/]/g, '-');
    const fileName = `Invoice_Records_${safeStart}_to_${safeEnd}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(excelBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// GET single invoice with line items
router.get('/:id', (req: Request, res: Response) => {
  try {
    const invoice = db.prepare(`
      SELECT i.*, c.name as client_name, c.email as client_email, c.address as client_address, c.phone as client_phone
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.id = ?
    `).get(req.params.id) as any;
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const lineItems = db.prepare('SELECT * FROM line_items WHERE invoice_id = ?').all(req.params.id);
    const copies = db.prepare('SELECT * FROM invoice_copies WHERE invoice_id = ? ORDER BY created_at DESC').all(req.params.id);
    const payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY date ASC').all(req.params.id);
    res.json({ ...invoice, line_items: lineItems, copies, payments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// POST create invoice
router.post('/', (req: Request, res: Response) => {
  try {
    const { client_id, date, date_paid, notes, tax_rate, line_items, case_name, case_party1_type, case_plaintiff, case_party2_type, case_defendant, amount_received, tds_amount, payments } = req.body;
    if (!client_id) return res.status(400).json({ error: 'Client is required' });
    if (!line_items || line_items.length === 0) return res.status(400).json({ error: 'At least one service/line item is required' });
    const invoiceDate = date || new Date().toISOString().split('T')[0];
    const invoiceNumber = generateInvoiceNumber(invoiceDate);
    const taxRate = tax_rate || 0;
    // Calculate totals
    let subtotal = 0;
    for (const item of line_items as LineItem[]) {
      item.amount = (item.hours || 0) * (item.rate || 0);
      if (item.amount === 0 && item.rate) item.amount = item.rate;
      subtotal += item.amount;
    }
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;
    const insertInvoice = db.prepare(`
      INSERT INTO invoices (invoice_number, client_id, date, date_paid, status, notes, case_name, case_party1_type, case_plaintiff, case_party2_type, case_defendant, subtotal, tax_rate, tax_amount, total, amount_received, tds_amount)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLineItem = db.prepare(`
      INSERT INTO line_items (invoice_id, description, hours, rate, amount)
      VALUES (?, ?, ?, ?, ?)
    `);
    const transaction = db.transaction(() => {
      const result = insertInvoice.run(
        invoiceNumber, client_id, invoiceDate, date_paid || null, notes || null,
        case_name || null, case_party1_type || null, case_plaintiff || null,
        case_party2_type || null, case_defendant || null,
        subtotal, taxRate, taxAmount, total,
        amount_received || 0, tds_amount || 0
      );
      const invoiceId = result.lastInsertRowid;
      for (const item of line_items as LineItem[]) {
        insertLineItem.run(invoiceId, item.description, item.hours || 0, item.rate || 0, item.amount);
      }
      if (payments && payments.length > 0) {
        replacePayments(invoiceId as number, payments);
      }
      return invoiceId;
    });
    const invoiceId = transaction();
    const invoice = db.prepare(`
      SELECT i.*, c.name as client_name, c.email as client_email
      FROM invoices i LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.id = ?
    `).get(invoiceId) as any;
    const items = db.prepare('SELECT * FROM line_items WHERE invoice_id = ?').all(invoiceId);
    res.status(201).json({ ...invoice, line_items: items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// PUT update invoice
router.put('/:id', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    const { client_id, invoice_number, date, date_paid, notes, tax_rate, line_items, created_at, case_name, case_party1_type, case_plaintiff, case_party2_type, case_defendant, amount_received, tds_amount, payments } = req.body;
    const taxRate = tax_rate ?? existing.tax_rate;
    let subtotal = 0;
    if (line_items) {
      for (const item of line_items as LineItem[]) {
        item.amount = (item.hours || 0) * (item.rate || 0);
        if (item.amount === 0 && item.rate) item.amount = item.rate;
        subtotal += item.amount;
      }
    } else {
      subtotal = existing.subtotal;
    }
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE invoices SET client_id = ?, invoice_number = ?, date = ?, date_paid = ?, notes = ?,
        case_name = ?, case_party1_type = ?, case_plaintiff = ?, case_party2_type = ?, case_defendant = ?,
        subtotal = ?, tax_rate = ?, tax_amount = ?, total = ?, amount_received = ?, tds_amount = ?,
        created_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        client_id || existing.client_id,
        invoice_number || existing.invoice_number,
        date || existing.date,
        date_paid ?? existing.date_paid,
        notes ?? existing.notes,
        case_name ?? existing.case_name ?? null,
        case_party1_type ?? existing.case_party1_type ?? null,
        case_plaintiff ?? existing.case_plaintiff ?? null,
        case_party2_type ?? existing.case_party2_type ?? null,
        case_defendant ?? existing.case_defendant ?? null,
        subtotal, taxRate, taxAmount, total,
        amount_received ?? existing.amount_received ?? 0,
        tds_amount ?? existing.tds_amount ?? 0,
        created_at || existing.created_at,
        req.params.id
      );
      if (line_items) {
        db.prepare('DELETE FROM line_items WHERE invoice_id = ?').run(req.params.id);
        const insertLineItem = db.prepare(
          'INSERT INTO line_items (invoice_id, description, hours, rate, amount) VALUES (?, ?, ?, ?, ?)'
        );
        for (const item of line_items as LineItem[]) {
          insertLineItem.run(req.params.id, item.description, item.hours || 0, item.rate || 0, item.amount);
        }
      }
      if (payments && Array.isArray(payments)) {
        replacePayments(req.params.id as string, payments);
      }
    });
    transaction();
    const invoice = db.prepare(`
      SELECT i.*, c.name as client_name, c.email as client_email
      FROM invoices i LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.id = ?
    `).get(req.params.id) as any;
    const items = db.prepare('SELECT * FROM line_items WHERE invoice_id = ?').all(req.params.id);
    res.json({ ...invoice, line_items: items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// PATCH update status
router.patch('/:id/status', (req: Request, res: Response) => {
  try {
    const { status, payments: paymentEntries } = req.body;
    const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });

    const transaction = db.transaction(() => {
      db.prepare(
        "UPDATE invoices SET status = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(status, req.params.id);
      if (paymentEntries && Array.isArray(paymentEntries) && paymentEntries.length > 0) {
        replacePayments(req.params.id as string, paymentEntries);
      }
    });
    transaction();
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    const paymentsResult = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY date ASC').all(req.params.id);
    res.json({ ...(invoice as any), payments: paymentsResult });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// PUT update payments for an invoice
router.put('/:id/payments', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    const { payments: paymentEntries } = req.body;
    if (!paymentEntries || !Array.isArray(paymentEntries)) {
      return res.status(400).json({ error: 'payments array is required' });
    }
    const transaction = db.transaction(() => {
      replacePayments(req.params.id as string, paymentEntries);
    });
    transaction();
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    const paymentsResult = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY date ASC').all(req.params.id);
    res.json({ ...(invoice as any), payments: paymentsResult });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// DELETE invoice
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ message: 'Invoice deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// GET download PDF
router.get('/:id/pdf', async (req: Request, res: Response) => {
  try {
    const invoice = db.prepare(`
      SELECT i.*, c.name as client_name, c.email as client_email, c.address as client_address, c.phone as client_phone
      FROM invoices i LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.id = ?
    `).get(req.params.id) as any;
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const lineItems = db.prepare('SELECT * FROM line_items WHERE invoice_id = ?').all(req.params.id) as any[];
    // Generate PDF
    const pdfBuffer = await generatePDF(invoice, lineItems);
    // Save redundant copy
    const safeInvoiceNumber = invoice.invoice_number.replace(/[\/\\]/g, '-');
    const fileName = `${safeInvoiceNumber}_${Date.now()}.pdf`;
    const filePath = path.join(COPIES_DIR, fileName);
    fs.writeFileSync(filePath, pdfBuffer);
    db.prepare(
      'INSERT INTO invoice_copies (invoice_id, file_type, file_name, file_path) VALUES (?, ?, ?, ?)'
    ).run(invoice.id, 'pdf', fileName, filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// GET download Excel
router.get('/:id/excel', async (req: Request, res: Response) => {
  try {
    const invoice = db.prepare(`
      SELECT i.*, c.name as client_name, c.email as client_email, c.address as client_address, c.phone as client_phone
      FROM invoices i LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.id = ?
    `).get(req.params.id) as any;
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const lineItems = db.prepare('SELECT * FROM line_items WHERE invoice_id = ?').all(req.params.id) as any[];
    const excelBuffer = await generateExcel(invoice, lineItems);
    // Save redundant copy
    const safeInvoiceNumber = invoice.invoice_number.replace(/[\/\\]/g, '-');
    const fileName = `${safeInvoiceNumber}_${Date.now()}.xlsx`;
    const filePath = path.join(COPIES_DIR, fileName);
    fs.writeFileSync(filePath, excelBuffer);
    db.prepare(
      'INSERT INTO invoice_copies (invoice_id, file_type, file_name, file_path) VALUES (?, ?, ?, ?)'
    ).run(invoice.id, 'xlsx', fileName, filePath);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.xlsx"`);
    res.send(excelBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// POST send invoice via email
router.post('/:id/send', async (req: Request, res: Response) => {
  try {
    const invoice = db.prepare(`
      SELECT i.*, c.name as client_name, c.email as client_email, c.address as client_address
      FROM invoices i LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.id = ?
    `).get(req.params.id) as any;
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!invoice.client_email) return res.status(400).json({ error: 'Client has no email address' });
    const lineItems = db.prepare('SELECT * FROM line_items WHERE invoice_id = ?').all(req.params.id) as any[];
    const pdfBuffer = await generatePDF(invoice, lineItems);
    const result = await sendInvoiceEmail(invoice, pdfBuffer);
    // Update status to sent
    db.prepare("UPDATE invoices SET status = 'sent', updated_at = datetime('now') WHERE id = ? AND status = 'draft'").run(req.params.id);
    res.json({ message: 'Invoice sent successfully', ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// POST send payment reminder
router.post('/:id/remind', async (req: Request, res: Response) => {
  try {
    const invoice = db.prepare(`
      SELECT i.*, c.name as client_name, c.email as client_email
      FROM invoices i LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.id = ?
    `).get(req.params.id) as any;
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!invoice.client_email) return res.status(400).json({ error: 'Client has no email address' });
    const result = await sendReminderEmail(invoice);
    res.json({ message: 'Reminder sent successfully', ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
export default router;