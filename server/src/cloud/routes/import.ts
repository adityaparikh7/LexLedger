import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { DatabaseSync } from 'node:sqlite';
import { getDb, type Tx } from '../db';
import { clients, invoices, lineItems, payments, firmProfile, invoiceSequences, INVOICE_STATUSES, EMAIL_CLIENTS, type InvoiceStatus, type EmailClient } from '../db/schema';
import { accountId } from '../auth';
import { canEncryptSecrets, encryptSecret } from '../secrets';
import { withAccountLock } from '../mutations';

// Imports a desktop LexLedger database (legalbill.db, or a backup file from the desktop app's
// Backups section) into the signed-in account. Old schemas are read defensively: columns added
// by later desktop migrations may be missing, and are filled with their defaults.

const router = Router();

class ImportError extends Error {}

type Row = Record<string, unknown>;

interface LegacyData {
  clients: Row[];
  invoices: Row[];
  lineItems: Row[];
  payments: Row[];
  firm: Row | null;
}

const text = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const num = (v: unknown): number => Number(v) || 0;
const day = (v: unknown, fallback: string): string => {
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
};
/** SQLite datetime('now') text is UTC without a zone ("2025-04-01 10:30:00"). */
const timestamp = (v: unknown): Date | undefined => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(v)) return undefined;
  const iso = v.replace(' ', 'T');
  const date = new Date(/([zZ]|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`);
  return isNaN(date.getTime()) ? undefined : date;
};
const status = (v: unknown): InvoiceStatus => {
  if (v === 'overdue') return 'unpaid';
  return INVOICE_STATUSES.includes(v as InvoiceStatus) ? (v as InvoiceStatus) : 'draft';
};

function readLegacy(legacy: DatabaseSync): LegacyData {
  const tables = new Set((legacy.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name));
  if (!tables.has('clients') || !tables.has('invoices')) throw new ImportError("This file isn't a LexLedger database");
  const all = (table: string) => (tables.has(table) ? legacy.prepare(`SELECT * FROM ${table} ORDER BY id`).all() as Row[] : []);
  return {
    clients: all('clients'),
    invoices: all('invoices'),
    lineItems: all('line_items'),
    payments: all('payments'),
    firm: tables.has('firm_profile') ? (legacy.prepare('SELECT * FROM firm_profile LIMIT 1').get() as Row | undefined) ?? null : null,
  };
}

async function insertChunked<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += 500) await insert(rows.slice(i, i + 500));
}

async function insertLegacy(tx: Tx, account: string, data: LegacyData) {
  const today = new Date().toISOString().slice(0, 10);
  const clientIds = new Map<unknown, string>();
  const invoiceIds = new Map<unknown, string>();
  const invoiceDates = new Map<string, string>();

  await insertChunked(data.clients, (chunk) => tx.insert(clients).values(chunk.map((c) => {
    const id = crypto.randomUUID();
    clientIds.set(c.id, id);
    return {
      id,
      account_id: account,
      name: text(c.name) ?? 'Unnamed client',
      email: text(c.email),
      phone: text(c.phone),
      address: text(c.address),
      created_at: timestamp(c.created_at),
    };
  })));

  let skipped = 0;
  const invoiceRows = data.invoices.flatMap((inv) => {
    const clientId = clientIds.get(inv.client_id);
    if (!clientId) {
      skipped++;
      return [];
    }
    const id = crypto.randomUUID();
    invoiceIds.set(inv.id, id);
    const date = day(inv.date, day(inv.created_at, today));
    invoiceDates.set(id, date);
    return [{
      id,
      account_id: account,
      invoice_number: text(inv.invoice_number),
      client_id: clientId,
      date,
      date_paid: text(inv.date_paid ?? inv.due_date) ? day(inv.date_paid ?? inv.due_date, date) : null,
      status: status(inv.status),
      notes: text(inv.notes),
      case_name: text(inv.case_name),
      case_party1_type: text(inv.case_party1_type),
      case_plaintiff: text(inv.case_plaintiff),
      case_party2_type: text(inv.case_party2_type),
      case_defendant: text(inv.case_defendant),
      subtotal: num(inv.subtotal),
      tax_rate: num(inv.tax_rate),
      tax_amount: num(inv.tax_amount),
      total: num(inv.total),
      // Kept as stored: databases from before the payments table only have these totals
      amount_received: num(inv.amount_received),
      tds_amount: num(inv.tds_amount),
      created_at: timestamp(inv.created_at),
    }];
  });
  await insertChunked(invoiceRows, (chunk) => tx.insert(invoices).values(chunk));

  const positions = new Map<string, number>();
  const itemRows = data.lineItems.flatMap((item) => {
    const invoiceId = invoiceIds.get(item.invoice_id);
    if (!invoiceId) return [];
    const position = positions.get(invoiceId) ?? 0;
    positions.set(invoiceId, position + 1);
    return [{
      account_id: account,
      invoice_id: invoiceId,
      position,
      description: text(item.description) ?? '',
      hours: num(item.hours),
      rate: num(item.rate),
      amount: num(item.amount),
    }];
  });
  await insertChunked(itemRows, (chunk) => tx.insert(lineItems).values(chunk));

  const paymentRows = data.payments.flatMap((p) => {
    const invoiceId = invoiceIds.get(p.invoice_id);
    if (!invoiceId) return [];
    return [{
      account_id: account,
      invoice_id: invoiceId,
      date: day(p.date, invoiceDates.get(invoiceId)!),
      amount_received: num(p.amount_received),
      tds_amount: num(p.tds_amount),
      created_at: timestamp(p.created_at),
    }];
  });
  await insertChunked(paymentRows, (chunk) => tx.insert(payments).values(chunk));

  if (data.firm) {
    const f = data.firm;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const smtpPass = str(f.smtp_pass);
    const profile = {
      firm_name: str(f.firm_name),
      firm_address: str(f.firm_address),
      firm_phone: str(f.firm_phone),
      firm_email: str(f.firm_email),
      bank_account_name: str(f.bank_account_name),
      bank_name: str(f.bank_name),
      bank_account_number: str(f.bank_account_number),
      bank_ifsc: str(f.bank_ifsc),
      pan_number: str(f.pan_number),
      signature_name: str(f.signature_name),
      signature_full: str(f.signature_full),
      smtp_host: str(f.smtp_host),
      smtp_port: Number(f.smtp_port) || 587,
      smtp_user: str(f.smtp_user),
      // The desktop app stored this in plain text; keep it only if it can be encrypted here
      smtp_pass: smtpPass && canEncryptSecrets() ? encryptSecret(smtpPass) : '',
      email_client: EMAIL_CLIENTS.includes(f.email_client as EmailClient) ? (f.email_client as EmailClient) : 'mailto',
    };
    await tx.insert(firmProfile).values({ account_id: account, ...profile })
      .onConflictDoUpdate({ target: firmProfile.account_id, set: profile });
  }

  // Invoice numbering restarts from the highest imported number on the next invoice
  await tx.delete(invoiceSequences).where(eq(invoiceSequences.account_id, account));

  return {
    clients: data.clients.length,
    invoices: invoiceRows.length,
    lineItems: itemRows.length,
    payments: paymentRows.length,
    skippedInvoices: skipped,
    firmProfile: !!data.firm,
  };
}

// POST import a desktop database file (raw bytes) into this account, which must be empty
router.post('/', express.raw({ type: 'application/octet-stream', limit: '200mb' }), async (req: Request, res: Response) => {
  const account = accountId(req);
  const file = req.body;
  if (!Buffer.isBuffer(file) || file.length < 100 || file.subarray(0, 16).toString('latin1') !== 'SQLite format 3\u0000') {
    return res.status(400).json({ error: 'Choose a LexLedger database file (legalbill.db or a backup .db file)' });
  }

  const tmpPath = path.join(os.tmpdir(), `lexledger-import-${crypto.randomUUID()}.db`);
  try {
    const db = getDb();
    const [{ value: clientCount }] = await db.select({ value: count() }).from(clients)
      .where(and(eq(clients.account_id, account), isNull(clients.deleted_at)));
    const [{ value: invoiceCount }] = await db.select({ value: count() }).from(invoices)
      .where(and(eq(invoices.account_id, account), isNull(invoices.deleted_at)));
    if (clientCount > 0 || invoiceCount > 0) {
      return res.status(409).json({ error: 'This account already has clients or invoices. Import only works into an empty account.' });
    }

    fs.writeFileSync(tmpPath, file);
    // Node's built-in SQLite: no native module to rebuild for each Node/Electron version
    const { DatabaseSync } = await import('node:sqlite');
    const legacy = new DatabaseSync(tmpPath, { readOnly: true });
    let data: LegacyData;
    try {
      data = readLegacy(legacy);
    } finally {
      legacy.close();
    }

    const summary = await withAccountLock(account, (tx) => insertLegacy(tx, account, data));
    res.json({ message: 'Import complete', ...summary });
  } catch (err: any) {
    if (err instanceof ImportError) return res.status(400).json({ error: err.message });
    console.error('Error importing desktop database:', err);
    res.status(500).json({ error: 'Import failed' });
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
});

export default router;
