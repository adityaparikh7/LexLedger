import { Router, Request, Response } from 'express';
import db, { generateInvoiceNumber } from '../db';
import { generatePDF } from '../services/pdfGenerator';
import { generateExcel } from '../services/excelGenerator';
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
    res.json({ ...invoice, line_items: lineItems, copies });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// POST create invoice
router.post('/', (req: Request, res: Response) => {
  try {
    const { client_id, date, due_date, notes, tax_rate, line_items, case_name, case_party1_type, case_plaintiff, case_party2_type, case_defendant } = req.body;
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
      INSERT INTO invoices (invoice_number, client_id, date, due_date, status, notes, case_name, case_party1_type, case_plaintiff, case_party2_type, case_defendant, subtotal, tax_rate, tax_amount, total)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLineItem = db.prepare(`
      INSERT INTO line_items (invoice_id, description, hours, rate, amount)
      VALUES (?, ?, ?, ?, ?)
    `);
    const transaction = db.transaction(() => {
      const result = insertInvoice.run(
        invoiceNumber, client_id, invoiceDate, due_date || null, notes || null,
        case_name || null, case_party1_type || null, case_plaintiff || null,
        case_party2_type || null, case_defendant || null,
        subtotal, taxRate, taxAmount, total
      );
      const invoiceId = result.lastInsertRowid;
      for (const item of line_items as LineItem[]) {
        insertLineItem.run(invoiceId, item.description, item.hours || 0, item.rate || 0, item.amount);
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
    if (existing.status === 'paid') return res.status(400).json({ error: 'Cannot edit a paid invoice' });
    const { client_id, invoice_number, date, due_date, notes, tax_rate, line_items, created_at, case_name, case_party1_type, case_plaintiff, case_party2_type, case_defendant } = req.body;
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
        UPDATE invoices SET client_id = ?, invoice_number = ?, date = ?, due_date = ?, notes = ?,
        case_name = ?, case_party1_type = ?, case_plaintiff = ?, case_party2_type = ?, case_defendant = ?,
        subtotal = ?, tax_rate = ?, tax_amount = ?, total = ?, created_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        client_id || existing.client_id,
        invoice_number || existing.invoice_number,
        date || existing.date,
        due_date ?? existing.due_date,
        notes ?? existing.notes,
        case_name ?? existing.case_name ?? null,
        case_party1_type ?? existing.case_party1_type ?? null,
        case_plaintiff ?? existing.case_plaintiff ?? null,
        case_party2_type ?? existing.case_party2_type ?? null,
        case_defendant ?? existing.case_defendant ?? null,
        subtotal, taxRate, taxAmount, total,
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
    const { status } = req.body;
    const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
    const result = db.prepare(
      "UPDATE invoices SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(status, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    res.json(invoice);
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