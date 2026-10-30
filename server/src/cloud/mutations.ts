// Every change to an account's data goes through here: sync pushes from devices, and the few
// server-side writes (marking a memo sent, importing). Writes run inside withAccountLock so
// row versions for an account are committed in order, which is what lets a device pull
// "everything above my cursor" without missing a row.
import crypto from 'crypto';
import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { getDb, type DB, type Tx } from './db';
import { clients, invoices, lineItems, payments, firmProfile, INVOICE_STATUSES, EMAIL_CLIENTS, type InvoiceStatus, type EmailClient } from './db/schema';
import { nextInvoiceNumber, isInvoiceNumberTaken } from './invoiceNumbers';
import { canEncryptSecrets, encryptSecret } from './secrets';
import { computeInvoiceTotals, lineItemAmount, paymentAggregates, roundMoney } from '../../../shared/invoiceMath';
import { toLocalDateString } from '../../../shared/dates';
import { MASKED_SECRET, type ClientArgs, type InvoiceArgs, type FirmProfileArgs, type LineItemArgs, type PaymentArgs, type Mutation } from '../../../shared/sync';

/** A change the server refuses (shown to the user); the device drops it and resyncs. */
export class MutationError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);
export const isStatus = (s: unknown): s is InvoiceStatus => INVOICE_STATUSES.includes(s as InvoiceStatus);
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE_RE.test(v) && !isNaN(Date.parse(v));
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function requireId(id: unknown, what: string): string {
  if (!isUuid(id)) throw new MutationError(`Invalid ${what} id`);
  return id;
}

/** Run `fn` in a transaction holding the account's write lock. */
export function withAccountLock<T>(account: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${account}, 0))`);
    return fn(tx);
  });
}

/** The shared side of the account lock: waits for writes in progress to commit. */
export async function lockAccountForRead(tx: Tx, account: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${account}, 0))`);
}

export function loadLineItems(db: DB | Tx, invoiceIds: string[]) {
  if (invoiceIds.length === 0) return Promise.resolve([]);
  return db.select().from(lineItems)
    .where(and(inArray(lineItems.invoice_id, invoiceIds), isNull(lineItems.deleted_at)))
    .orderBy(asc(lineItems.position));
}

export function loadPayments(db: DB | Tx, invoiceIds: string[]) {
  if (invoiceIds.length === 0) return Promise.resolve([]);
  return db.select().from(payments)
    .where(and(inArray(payments.invoice_id, invoiceIds), isNull(payments.deleted_at)))
    .orderBy(asc(payments.date));
}

/** Make an invoice's live child rows match `entries`. Rows whose id is sent back are updated in
 *  place, new ids are inserted (devices create the ids, so their local copy matches), and rows
 *  no longer present are tombstoned. */
async function replaceChildren<V extends Record<string, unknown>>(
  tx: Tx,
  table: typeof lineItems | typeof payments,
  account: string,
  invoiceId: string,
  existingIds: Set<string>,
  entries: { id?: unknown; values: V }[],
) {
  const kept: string[] = [];
  for (const { id, values } of entries) {
    if (isUuid(id) && existingIds.has(id)) {
      await tx.update(table).set(values).where(eq(table.id, id));
      kept.push(id);
      continue;
    }
    // An id already used elsewhere (it shouldn't be) gets a fresh one rather than failing
    const row = { ...values, account_id: account, invoice_id: invoiceId } as any;
    let inserted = isUuid(id)
      ? await tx.insert(table).values({ ...row, id }).onConflictDoNothing().returning({ id: table.id })
      : [];
    if (inserted.length === 0) {
      inserted = await tx.insert(table).values({ ...row, id: crypto.randomUUID() }).returning({ id: table.id });
    }
    kept.push(inserted[0].id);
  }
  await tx.update(table).set({ deleted_at: sql`now()` }).where(and(
    eq(table.invoice_id, invoiceId),
    isNull(table.deleted_at),
    ...(kept.length ? [notInArray(table.id, kept)] : []),
  ));
}

async function replaceLineItems(tx: Tx, account: string, invoiceId: string, items: LineItemArgs[]) {
  const existing = new Set((await loadLineItems(tx, [invoiceId])).map((r) => r.id));
  await replaceChildren(tx, lineItems, account, invoiceId, existing, items.map((item, position) => ({
    id: item.id,
    values: {
      description: str(item.description),
      hours: num(item.hours),
      rate: num(item.rate),
      amount: lineItemAmount(item),
      position,
    },
  })));
}

async function replacePayments(tx: Tx, account: string, invoiceId: string, entries: PaymentArgs[]) {
  const valid = entries.filter((p) => isDate(p?.date));
  const existing = new Set((await loadPayments(tx, [invoiceId])).map((r) => r.id));
  await replaceChildren(tx, payments, account, invoiceId, existing, valid.map((p) => ({
    id: p.id,
    values: {
      date: p.date,
      amount_received: roundMoney(num(p.amount_received)),
      tds_amount: roundMoney(num(p.tds_amount)),
    },
  })));
  await tx.update(invoices).set(paymentAggregates(valid)).where(eq(invoices.id, invoiceId));
}

async function liveInvoice(tx: Tx, account: string, id: string) {
  const [invoice] = await tx.select().from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.account_id, account), isNull(invoices.deleted_at)));
  if (!invoice) throw new MutationError('Invoice not found. It may have been deleted on another device.');
  return invoice;
}

async function upsertClient(tx: Tx, account: string, a: ClientArgs) {
  const id = requireId(a.id, 'client');
  const name = str(a.name).trim();
  if (!name) throw new MutationError('Client name is required');
  const values = { name, email: text(a.email), phone: text(a.phone), address: text(a.address) };
  const [existing] = await tx.select({ account_id: clients.account_id, deleted_at: clients.deleted_at }).from(clients).where(eq(clients.id, id));
  if (!existing) {
    await tx.insert(clients).values({ id, account_id: account, ...values });
  } else if (existing.account_id !== account) {
    throw new MutationError('Client not found');
  } else if (existing.deleted_at) {
    throw new MutationError(`${name} was deleted on another device`);
  } else {
    await tx.update(clients).set(values).where(eq(clients.id, id));
  }
}

async function deleteClient(tx: Tx, account: string, a: { id: string }) {
  const id = requireId(a.id, 'client');
  const [invoice] = await tx.select({ id: invoices.id }).from(invoices)
    .where(and(eq(invoices.client_id, id), eq(invoices.account_id, account), isNull(invoices.deleted_at)))
    .limit(1);
  if (invoice) throw new MutationError('Cannot delete client with existing invoices. Delete invoices first.');
  await tx.update(clients).set({ deleted_at: sql`now()` })
    .where(and(eq(clients.id, id), eq(clients.account_id, account), isNull(clients.deleted_at)));
}

async function upsertInvoice(tx: Tx, account: string, a: InvoiceArgs) {
  const id = requireId(a.id, 'invoice');
  const clientId = requireId(a.client_id, 'client');
  const [client] = await tx.select({ id: clients.id }).from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.account_id, account), isNull(clients.deleted_at)));
  if (!client) throw new MutationError('Client not found. It may have been deleted on another device.');
  if (!Array.isArray(a.line_items) || a.line_items.length === 0) {
    throw new MutationError('At least one service/line item is required');
  }

  const date = isDate(a.date) ? a.date : toLocalDateString(new Date());
  const taxRate = num(a.tax_rate);
  const fields = {
    client_id: clientId,
    date,
    date_paid: isDate(a.date_paid) ? a.date_paid : null,
    status: isStatus(a.status) ? a.status : 'draft',
    notes: text(a.notes),
    case_name: text(a.case_name),
    case_party1_type: text(a.case_party1_type),
    case_plaintiff: text(a.case_plaintiff),
    case_party2_type: text(a.case_party2_type),
    case_defendant: text(a.case_defendant),
    tax_rate: taxRate,
    ...computeInvoiceTotals(a.line_items, taxRate),
    ...(a.amount_received !== undefined ? { amount_received: num(a.amount_received) } : {}),
    ...(a.tds_amount !== undefined ? { tds_amount: num(a.tds_amount) } : {}),
    ...(typeof a.created_at === 'string' && !isNaN(Date.parse(a.created_at)) ? { created_at: new Date(a.created_at) } : {}),
  };

  const [existing] = await tx.select({ account_id: invoices.account_id, deleted_at: invoices.deleted_at, invoice_number: invoices.invoice_number })
    .from(invoices).where(eq(invoices.id, id));
  if (!existing) {
    await tx.insert(invoices).values({
      id,
      account_id: account,
      invoice_number: await nextInvoiceNumber(tx, account, date),
      ...fields,
    });
  } else {
    if (existing.account_id !== account) throw new MutationError('Invoice not found');
    if (existing.deleted_at) throw new MutationError(`Invoice ${existing.invoice_number} was deleted on another device`);
    let invoiceNumber = existing.invoice_number;
    const requested = str(a.invoice_number).trim();
    if (requested && requested !== existing.invoice_number) {
      if (await isInvoiceNumberTaken(tx, account, requested, id)) {
        throw new MutationError(`Invoice number ${requested} is already used by another invoice`);
      }
      invoiceNumber = requested;
    }
    await tx.update(invoices).set({ ...fields, invoice_number: invoiceNumber }).where(eq(invoices.id, id));
  }

  await replaceLineItems(tx, account, id, a.line_items);
  if (Array.isArray(a.payments)) await replacePayments(tx, account, id, a.payments);
}

async function deleteInvoice(tx: Tx, account: string, a: { id: string }) {
  const id = requireId(a.id, 'invoice');
  const deleted = await tx.update(invoices).set({ deleted_at: sql`now()` })
    .where(and(eq(invoices.id, id), eq(invoices.account_id, account), isNull(invoices.deleted_at)))
    .returning({ id: invoices.id });
  if (deleted.length === 0) return; // already gone
  await tx.update(lineItems).set({ deleted_at: sql`now()` }).where(and(eq(lineItems.invoice_id, id), isNull(lineItems.deleted_at)));
  await tx.update(payments).set({ deleted_at: sql`now()` }).where(and(eq(payments.invoice_id, id), isNull(payments.deleted_at)));
}

async function setInvoiceStatus(tx: Tx, account: string, a: { id: string; status: unknown; payments?: PaymentArgs[] }) {
  const invoice = await liveInvoice(tx, account, requireId(a.id, 'invoice'));
  if (!isStatus(a.status)) throw new MutationError(`Invalid status. Must be one of: ${INVOICE_STATUSES.join(', ')}`);
  await tx.update(invoices).set({ status: a.status }).where(eq(invoices.id, invoice.id));
  if (Array.isArray(a.payments) && a.payments.length > 0) await replacePayments(tx, account, invoice.id, a.payments);
}

async function setPayments(tx: Tx, account: string, a: { id: string; payments: PaymentArgs[] }) {
  const invoice = await liveInvoice(tx, account, requireId(a.id, 'invoice'));
  if (!Array.isArray(a.payments)) throw new MutationError('payments array is required');
  await replacePayments(tx, account, invoice.id, a.payments);
}

const PROFILE_TEXT_FIELDS = [
  'firm_name', 'firm_address', 'firm_phone', 'firm_email',
  'bank_account_name', 'bank_name', 'bank_account_number', 'bank_ifsc', 'pan_number',
  'signature_name', 'signature_full', 'smtp_host', 'smtp_user',
] as const;

async function updateFirmProfile(tx: Tx, account: string, a: FirmProfileArgs) {
  const update: Partial<typeof firmProfile.$inferInsert> = {};
  for (const field of PROFILE_TEXT_FIELDS) update[field] = str(a[field]);
  update.smtp_port = num(a.smtp_port) || 587;
  update.email_client = EMAIL_CLIENTS.includes(a.email_client as EmailClient) ? a.email_client : 'mailto';
  if (a.smtp_pass !== undefined && a.smtp_pass !== MASKED_SECRET) {
    if (a.smtp_pass && !canEncryptSecrets()) {
      throw new MutationError("This server isn't set up to store SMTP passwords (SMTP_ENCRYPTION_KEY is missing)");
    }
    update.smtp_pass = encryptSecret(str(a.smtp_pass));
  }
  await tx.insert(firmProfile).values({ account_id: account, ...update })
    .onConflictDoUpdate({ target: firmProfile.account_id, set: update });
}

export async function applyMutation(tx: Tx, account: string, m: Mutation): Promise<void> {
  const args = (m.args ?? {}) as any;
  switch (m.name) {
    case 'upsertClient': return upsertClient(tx, account, args);
    case 'deleteClient': return deleteClient(tx, account, args);
    case 'upsertInvoice': return upsertInvoice(tx, account, args);
    case 'deleteInvoice': return deleteInvoice(tx, account, args);
    case 'setInvoiceStatus': return setInvoiceStatus(tx, account, args);
    case 'setPayments': return setPayments(tx, account, args);
    case 'updateFirmProfile': return updateFirmProfile(tx, account, args);
    default: throw new MutationError(`Unknown change "${(m as { name: unknown }).name}". Please update the app.`);
  }
}
