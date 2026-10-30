// Reads and writes against the device's copy of the data (cloud mode). Writes are applied
// here at once and queued for the server (local/sync.ts).
import type { Client, DashboardData, FirmProfile, Id, Invoice, Payment } from '../api';
import { db, type LocalClient, type LocalInvoice } from '../local/db';
import { enqueue } from '../local/sync';
import { uuid } from '../uuid';
import { todayLocal } from '../../../shared/dates';
import type { InvoiceArgs, PaymentArgs } from '../../../shared/sync';
import { computeDashboard } from './dashboard';

function joinClient(inv: LocalInvoice, clientsById: Map<string, LocalClient>): Invoice {
  const c = clientsById.get(inv.client_id);
  return {
    ...inv,
    client_name: c?.name ?? '',
    client_email: c?.email ?? null,
    client_address: c?.address ?? null,
    client_phone: c?.phone ?? null,
  };
}

async function clientsById() {
  return new Map((await db.clients.toArray()).map((c) => [c.id, c]));
}

export async function getClients(): Promise<Client[]> {
  const rows = await db.clients.toArray();
  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export async function getClient(id: Id): Promise<Client> {
  const client = await db.clients.get(String(id));
  if (!client) throw new Error('Client not found');
  return client;
}

export async function getInvoices(params?: { status?: string; client_id?: string }): Promise<Invoice[]> {
  const [rows, byId] = await Promise.all([db.invoices.toArray(), clientsById()]);
  return rows
    .filter((i) => (!params?.status || i.status === params.status) && (!params?.client_id || i.client_id === params.client_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((i) => joinClient(i, byId));
}

export async function getInvoice(id: Id): Promise<Invoice> {
  const invoice = await db.invoices.get(String(id));
  if (!invoice) throw new Error('Invoice not found');
  const [byId, items, payments] = await Promise.all([
    clientsById(),
    db.line_items.where('invoice_id').equals(invoice.id).toArray(),
    db.payments.where('invoice_id').equals(invoice.id).toArray(),
  ]);
  return {
    ...joinClient(invoice, byId),
    line_items: items.sort((a, b) => a.position - b.position),
    payments: payments.sort((a, b) => a.date.localeCompare(b.date)),
    copies: [],
  };
}

export async function getDashboard(timeFilter = 'all', startDate?: string, endDate?: string): Promise<DashboardData> {
  const [invoices, clientCount] = await Promise.all([getInvoices(), db.clients.count()]);
  return computeDashboard(invoices, clientCount, timeFilter, startDate, endDate);
}

const EMPTY_PROFILE: FirmProfile = {
  firm_name: '', firm_address: '', firm_phone: '', firm_email: '',
  bank_account_name: '', bank_name: '', bank_account_number: '', bank_ifsc: '', pan_number: '',
  signature_name: '', signature_full: '',
  smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '',
  email_client: 'mailto',
  backup_enabled: 0, backup_dir: '', backup_keep: 30,
};

export async function getFirmProfile(): Promise<FirmProfile> {
  const row = await db.firm_profile.toCollection().first();
  // Backups are a desktop feature; the fields keep the FirmProfile shape the same
  return { ...EMPTY_PROFILE, ...row, backup_enabled: 0, backup_dir: '', backup_keep: 30 };
}

// ---- Writes ----

export async function createClient(data: Partial<Client>): Promise<Client> {
  const id = uuid();
  await enqueue({ name: 'upsertClient', args: { id, name: data.name ?? '', email: data.email ?? null, phone: data.phone ?? null, address: data.address ?? null } });
  return getClient(id);
}

export async function updateClient(id: Id, data: Partial<Client>): Promise<Client> {
  await enqueue({ name: 'upsertClient', args: { id: String(id), name: data.name ?? '', email: data.email ?? null, phone: data.phone ?? null, address: data.address ?? null } });
  return getClient(id);
}

export async function deleteClient(id: Id): Promise<void> {
  await enqueue({ name: 'deleteClient', args: { id: String(id) } });
}

const toPaymentArgs = (payments: Payment[]): PaymentArgs[] => payments.map((p) => ({
  id: p.id ? String(p.id) : uuid(),
  date: p.date,
  amount_received: Number(p.amount_received) || 0,
  tds_amount: Number(p.tds_amount) || 0,
}));

/** Full invoice for the server: fields not in `data` keep their current values. */
function invoiceArgs(id: string, data: Partial<Invoice>, existing?: Invoice): InvoiceArgs {
  const pick = <K extends keyof Invoice>(key: K): Invoice[K] | undefined => (data[key] !== undefined ? data[key] : existing?.[key]);
  return {
    id,
    client_id: String(pick('client_id') ?? ''),
    invoice_number: data.invoice_number ?? undefined,
    date: pick('date') || todayLocal(),
    date_paid: pick('date_paid') ?? null,
    status: pick('status') ?? 'draft',
    notes: pick('notes') ?? null,
    case_name: pick('case_name') ?? null,
    case_party1_type: pick('case_party1_type') ?? null,
    case_plaintiff: pick('case_plaintiff') ?? null,
    case_party2_type: pick('case_party2_type') ?? null,
    case_defendant: pick('case_defendant') ?? null,
    tax_rate: Number(pick('tax_rate')) || 0,
    amount_received: data.amount_received,
    tds_amount: data.tds_amount,
    line_items: (data.line_items ?? existing?.line_items ?? []).map((li) => ({
      id: li.id ? String(li.id) : uuid(),
      description: li.description,
      hours: Number(li.hours) || 0,
      rate: Number(li.rate) || 0,
    })),
    payments: data.payments ? toPaymentArgs(data.payments) : undefined,
    created_at: data.created_at,
  };
}

export async function createInvoice(data: Partial<Invoice>): Promise<Invoice> {
  const id = uuid();
  await enqueue({ name: 'upsertInvoice', args: invoiceArgs(id, data) });
  return getInvoice(id);
}

export async function updateInvoice(id: Id, data: Partial<Invoice>): Promise<Invoice> {
  const existing = await getInvoice(id);
  await enqueue({ name: 'upsertInvoice', args: invoiceArgs(String(id), data, existing) });
  return getInvoice(id);
}

export async function deleteInvoice(id: Id): Promise<void> {
  await enqueue({ name: 'deleteInvoice', args: { id: String(id) } });
}

export async function updateInvoiceStatus(id: Id, status: string, payments?: Payment[]): Promise<Invoice> {
  await enqueue({
    name: 'setInvoiceStatus',
    args: { id: String(id), status: status as Invoice['status'], payments: payments ? toPaymentArgs(payments) : undefined },
  });
  return getInvoice(id);
}

export async function updateInvoicePayments(id: Id, payments: Payment[]): Promise<Invoice> {
  await enqueue({ name: 'setPayments', args: { id: String(id), payments: toPaymentArgs(payments) } });
  return getInvoice(id);
}

export async function updateFirmProfile(data: Partial<FirmProfile>): Promise<FirmProfile> {
  const p = { ...(await getFirmProfile()), ...data };
  await enqueue({
    name: 'updateFirmProfile',
    args: {
      firm_name: p.firm_name, firm_address: p.firm_address, firm_phone: p.firm_phone, firm_email: p.firm_email,
      bank_account_name: p.bank_account_name, bank_name: p.bank_name, bank_account_number: p.bank_account_number,
      bank_ifsc: p.bank_ifsc, pan_number: p.pan_number, signature_name: p.signature_name, signature_full: p.signature_full,
      smtp_host: p.smtp_host, smtp_port: Number(p.smtp_port) || 587, smtp_user: p.smtp_user, smtp_pass: data.smtp_pass,
      email_client: p.email_client,
    },
  });
  return getFirmProfile();
}
