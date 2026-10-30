// Invoice reads and the files made from them (PDF, Excel, ZIP), which devices fetch from the
// server. Changes to invoices arrive through sync (routes/sync.ts → mutations.ts).
import { Router, Request, Response } from 'express';
import { and, asc, desc, eq, getTableColumns, gte, isNull, lte, type SQL } from 'drizzle-orm';
import archiver from 'archiver';
import { getDb, type DB, type Tx } from '../db';
import { clients, invoices, invoiceCopies } from '../db/schema';
import { accountId } from '../auth';
import { getFirmProfile } from './settings';
import { buildFeeMemoName, idParam, isUuid, uuidParam } from './common';
import { isStatus, loadLineItems, loadPayments, withAccountLock } from '../mutations';
import { generatePDF, launchBrowser } from '../../services/pdfGenerator';
import { generateExcel } from '../../services/excelGenerator';
import { generateExportExcel } from '../../services/exportGenerator';

const router = Router();
router.param('id', uuidParam);

const withClient = {
  ...getTableColumns(invoices),
  client_name: clients.name,
  client_email: clients.email,
  client_address: clients.address,
  client_phone: clients.phone,
};

const liveInvoices = (req: Request, ...conditions: (SQL | undefined)[]) =>
  and(eq(invoices.account_id, accountId(req)), isNull(invoices.deleted_at), ...conditions);

function selectInvoices(db: DB | Tx) {
  return db.select(withClient).from(invoices).leftJoin(clients, eq(invoices.client_id, clients.id));
}

async function loadInvoice(db: DB | Tx, req: Request, id: string) {
  const [invoice] = await selectInvoices(db).where(liveInvoices(req, eq(invoices.id, id)));
  return invoice;
}

function groupBy<T extends { invoice_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(row.invoice_id, [...(map.get(row.invoice_id) ?? []), row]);
  return map;
}

// GET all invoices
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, client_id } = req.query;
    const rows = await selectInvoices(getDb())
      .where(liveInvoices(req,
        isStatus(status) ? eq(invoices.status, status) : undefined,
        isUuid(client_id) ? eq(invoices.client_id, client_id) : undefined,
      ))
      .orderBy(desc(invoices.created_at));
    res.json(rows);
  } catch (err: any) {
    console.error('Error fetching invoices:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET export invoices as Excel for a date range
router.get('/export', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    if (typeof startDate !== 'string' || typeof endDate !== 'string') {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    const db = getDb();
    const rows = await selectInvoices(db)
      .where(liveInvoices(req, gte(invoices.date, startDate), lte(invoices.date, endDate)))
      .orderBy(asc(invoices.date));
    const ids = rows.map((r) => r.id);
    const itemsByInvoice = groupBy(await loadLineItems(db, ids));
    const paymentsByInvoice = groupBy(await loadPayments(db, ids));
    const enriched = rows.map((inv) => ({
      ...inv,
      line_items: itemsByInvoice.get(inv.id) ?? [],
      payments: paymentsByInvoice.get(inv.id) ?? [],
    }));

    const excelBuffer = await generateExportExcel(enriched as any[]);
    const safeStart = startDate.replace(/[\\/]/g, '-');
    const safeEnd = endDate.replace(/[\\/]/g, '-');
    const fileName = `Invoice_Records_${safeStart}_to_${safeEnd}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(excelBuffer);
  } catch (err: any) {
    console.error('Error exporting invoices:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET export invoices as PDFs (ZIP) for a client
router.get('/export-pdfs', async (req: Request, res: Response) => {
  try {
    const { client_id, status } = req.query;
    if (!isUuid(client_id)) {
      return res.status(400).json({ error: 'client_id is required' });
    }
    const db = getDb();
    const rows = await selectInvoices(db)
      .where(liveInvoices(req,
        eq(invoices.client_id, client_id),
        isStatus(status) ? eq(invoices.status, status) : undefined,
      ))
      .orderBy(asc(invoices.date));
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No invoices found for the selected criteria' });
    }
    const itemsByInvoice = groupBy(await loadLineItems(db, rows.map((r) => r.id)));
    const profile = await getFirmProfile(accountId(req));

    const clientName = (rows[0].client_name || 'Client').replace(/[^a-zA-Z0-9_\- ]/g, '');
    const statusLabel = isStatus(status) ? `_${status}` : '';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${clientName}${statusLabel}_Invoices.zip"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.on('error', (err: Error) => {
      throw err;
    });
    archive.pipe(res);

    // One browser for the whole batch
    const browser = await launchBrowser();
    try {
      for (const invoice of rows) {
        const pdfBuffer = await generatePDF(invoice, itemsByInvoice.get(invoice.id) ?? [], profile, browser);
        const entryName = buildFeeMemoName(invoice.invoice_number ?? '', invoice.client_name || 'Client', invoice.date);
        archive.append(pdfBuffer, { name: `${entryName}.pdf` });
      }
    } finally {
      await browser.close().catch(console.error);
    }
    await archive.finalize();
  } catch (err: any) {
    console.error('Error exporting bulk PDFs:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF export' });
    }
  }
});

// GET single invoice with line items
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const invoice = await loadInvoice(db, req, idParam(req));
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const [items, paymentRows, copies] = await Promise.all([
      loadLineItems(db, [invoice.id]),
      loadPayments(db, [invoice.id]),
      db.select().from(invoiceCopies).where(eq(invoiceCopies.invoice_id, invoice.id)).orderBy(desc(invoiceCopies.created_at)),
    ]);
    res.json({ ...invoice, line_items: items, copies, payments: paymentRows });
  } catch (err: any) {
    console.error('Error fetching invoice:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** Invoice, its line items and the firm profile: everything a memo needs. */
async function loadMemo(req: Request) {
  const db = getDb();
  const invoice = await loadInvoice(db, req, idParam(req));
  if (!invoice) return null;
  const [items, profile] = await Promise.all([loadLineItems(db, [invoice.id]), getFirmProfile(accountId(req))]);
  return { invoice, items, profile };
}

// GET preview PDF (inline)
router.get('/:id/pdf/preview', async (req: Request, res: Response) => {
  try {
    const memo = await loadMemo(req);
    if (!memo) return res.status(404).json({ error: 'Invoice not found' });
    const { invoice, items, profile } = memo;
    const pdfBuffer = await generatePDF(invoice, items, profile);
    const feeMemoName = buildFeeMemoName(invoice.invoice_number ?? '', invoice.client_name || 'Client', invoice.date);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${feeMemoName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('Error generating invoice PDF preview:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET download PDF
router.get('/:id/pdf', async (req: Request, res: Response) => {
  try {
    const memo = await loadMemo(req);
    if (!memo) return res.status(404).json({ error: 'Invoice not found' });
    const { invoice, items, profile } = memo;
    const pdfBuffer = await generatePDF(invoice, items, profile);
    const feeMemoName = buildFeeMemoName(invoice.invoice_number ?? '', invoice.client_name || 'Client', invoice.date);
    await getDb().insert(invoiceCopies).values({
      account_id: accountId(req), invoice_id: invoice.id, file_type: 'pdf', file_name: `${feeMemoName}.pdf`,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${feeMemoName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('Error generating invoice PDF:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET download Excel
router.get('/:id/excel', async (req: Request, res: Response) => {
  try {
    const memo = await loadMemo(req);
    if (!memo) return res.status(404).json({ error: 'Invoice not found' });
    const { invoice, items, profile } = memo;
    const excelBuffer = await generateExcel(invoice as any, items, profile);
    const fileName = `${(invoice.invoice_number ?? 'memo').replace(/[\/\\]/g, '-')}.xlsx`;
    await getDb().insert(invoiceCopies).values({
      account_id: accountId(req), invoice_id: invoice.id, file_type: 'xlsx', file_name: fileName,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(excelBuffer);
  } catch (err: any) {
    console.error('Error generating invoice Excel:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// The cloud server can't open a mail app on the user's device, so /send and /remind return the
// message and the device composes it (client/src/share.ts).

// POST prepare the invoice email; marks a draft as sent
router.post('/:id/send', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const invoice = await loadInvoice(db, req, idParam(req));
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!invoice.client_email) return res.status(400).json({ error: 'Client has no email address' });
    const profile = await getFirmProfile(accountId(req));

    const subject = `Fee Memo ${invoice.invoice_number} - ₹${invoice.total.toFixed(2)}`;
    const body = `Dear ${invoice.client_name},\n\nPlease find attached fee memo for ₹${invoice.total.toFixed(2)}.\n\nFee Memo Number: ${invoice.invoice_number}\nDate: ${invoice.date}\nAmount Due: ₹${invoice.total.toFixed(2)}\n\n`;

    await withAccountLock(accountId(req), (tx) => tx.update(invoices).set({ status: 'sent' })
      .where(and(eq(invoices.id, invoice.id), eq(invoices.status, 'draft'))));
    res.json({
      message: 'Email ready to compose',
      method: 'client',
      autoAttached: false,
      triggerPdfDownload: true,
      compose: { to: invoice.client_email, subject, body, emailClient: profile.email_client },
    });
  } catch (err: any) {
    console.error('Error preparing invoice email:', err);
    res.status(500).json({ error: 'Failed to prepare the email' });
  }
});

// POST prepare a payment reminder
router.post('/:id/remind', async (req: Request, res: Response) => {
  try {
    const invoice = await loadInvoice(getDb(), req, idParam(req));
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!invoice.client_email) return res.status(400).json({ error: 'Client has no email address' });

    // Quote the remaining balance, not the full memo total, once part-payments or TDS are recorded
    const received = invoice.amount_received || 0;
    const tds = invoice.tds_amount || 0;
    const balance = invoice.total - received - tds;
    if (balance <= 0.01) return res.status(400).json({ error: 'This memo has no outstanding balance' });
    const profile = await getFirmProfile(accountId(req));

    const details = [
      `Fee Memo Number: ${invoice.invoice_number}`,
      `Original Date: ${invoice.date}`,
    ];
    if (received > 0 || tds > 0) details.push(`Memo Amount: ₹${invoice.total.toFixed(2)}`);
    if (received > 0) details.push(`Received: ₹${received.toFixed(2)}`);
    if (tds > 0) details.push(`TDS Deducted: ₹${tds.toFixed(2)}`);
    details.push(`Amount Due: ₹${balance.toFixed(2)}`);

    const subject = `Payment Reminder: Fee Memo ${invoice.invoice_number} - ₹${balance.toFixed(2)}`;
    const body = `Dear ${invoice.client_name},\n\nI request you to kindly process payment of my pending fee memo.\n\nThe details of the pending fee memo are set out below:\n\n${details.join('\n')}\n\nPlease arrange payment at your earliest convenience. If you have already made the payment, please provide the payment details for updating my record.`;

    res.json({
      message: 'Reminder ready to compose',
      method: 'client',
      compose: { to: invoice.client_email, subject, body, emailClient: profile.email_client },
    });
  } catch (err: any) {
    console.error('Error preparing reminder email:', err);
    res.status(500).json({ error: 'Failed to prepare the reminder' });
  }
});

export default router;
