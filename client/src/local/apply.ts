// Applies a mutation to the device's copy of the data, the same way the server will
// (server/src/cloud/mutations.ts), so the change shows immediately, online or not.
// Runs inside a Dexie transaction over the data tables.
import { db, type LocalInvoice, type LocalLineItem, type LocalPayment } from './db';
import { computeInvoiceTotals, lineItemAmount, paymentAggregates, roundMoney } from '../../../shared/invoiceMath';
import { MASKED_SECRET, type Mutation, type PaymentArgs, type LineItemArgs } from '../../../shared/sync';

/** A change refused on the device, before it is queued (shown to the user). */
export class LocalValidationError extends Error {}

const nullable = (v: string | null | undefined) => (v ? v : null);

async function replaceLineItems(invoiceId: string, items: LineItemArgs[]) {
  await db.line_items.where('invoice_id').equals(invoiceId).delete();
  await db.line_items.bulkPut(items.map((item, position): LocalLineItem => ({
    id: item.id,
    invoice_id: invoiceId,
    position,
    description: item.description ?? '',
    hours: Number(item.hours) || 0,
    rate: Number(item.rate) || 0,
    amount: lineItemAmount(item),
  })));
}

async function replacePayments(invoiceId: string, entries: PaymentArgs[]) {
  await db.payments.where('invoice_id').equals(invoiceId).delete();
  await db.payments.bulkPut(entries.map((p): LocalPayment => ({
    id: p.id,
    invoice_id: invoiceId,
    date: p.date,
    amount_received: roundMoney(Number(p.amount_received) || 0),
    tds_amount: roundMoney(Number(p.tds_amount) || 0),
  })));
  await db.invoices.update(invoiceId, paymentAggregates(entries));
}

async function liveInvoice(id: string): Promise<LocalInvoice> {
  const invoice = await db.invoices.get(id);
  if (!invoice) throw new LocalValidationError('Invoice not found');
  return invoice;
}

export async function applyLocally(m: Mutation): Promise<void> {
  const now = new Date().toISOString();
  switch (m.name) {
    case 'upsertClient': {
      const a = m.args;
      if (!a.name?.trim()) throw new LocalValidationError('Client name is required');
      const existing = await db.clients.get(a.id);
      await db.clients.put({
        id: a.id,
        name: a.name.trim(),
        email: nullable(a.email),
        phone: nullable(a.phone),
        address: nullable(a.address),
        created_at: existing?.created_at ?? now,
        updated_at: now,
      });
      return;
    }
    case 'deleteClient': {
      const count = await db.invoices.where('client_id').equals(m.args.id).count();
      if (count > 0) throw new LocalValidationError('Cannot delete client with existing invoices. Delete invoices first.');
      await db.clients.delete(m.args.id);
      return;
    }
    case 'upsertInvoice': {
      const a = m.args;
      if (!(await db.clients.get(a.client_id))) throw new LocalValidationError('Client not found');
      if (!a.line_items?.length) throw new LocalValidationError('At least one service/line item is required');
      const existing = await db.invoices.get(a.id);
      let invoiceNumber = existing?.invoice_number ?? null;
      const requested = a.invoice_number?.trim();
      if (existing && requested && requested !== existing.invoice_number) {
        const clash = await db.invoices.filter((i) => i.invoice_number === requested && i.id !== a.id).first();
        if (clash) throw new LocalValidationError(`Invoice number ${requested} is already used by another invoice`);
        invoiceNumber = requested;
      }
      await db.invoices.put({
        id: a.id,
        invoice_number: invoiceNumber, // a new invoice gets its number from the server
        client_id: a.client_id,
        date: a.date,
        date_paid: a.date_paid || null,
        status: a.status,
        notes: nullable(a.notes),
        case_name: nullable(a.case_name),
        case_party1_type: nullable(a.case_party1_type),
        case_plaintiff: nullable(a.case_plaintiff),
        case_party2_type: nullable(a.case_party2_type),
        case_defendant: nullable(a.case_defendant),
        tax_rate: Number(a.tax_rate) || 0,
        ...computeInvoiceTotals(a.line_items, a.tax_rate),
        amount_received: a.amount_received ?? existing?.amount_received ?? 0,
        tds_amount: a.tds_amount ?? existing?.tds_amount ?? 0,
        created_at: a.created_at ?? existing?.created_at ?? now,
        updated_at: now,
      });
      await replaceLineItems(a.id, a.line_items);
      if (a.payments) await replacePayments(a.id, a.payments);
      return;
    }
    case 'deleteInvoice': {
      await db.invoices.delete(m.args.id);
      await db.line_items.where('invoice_id').equals(m.args.id).delete();
      await db.payments.where('invoice_id').equals(m.args.id).delete();
      return;
    }
    case 'setInvoiceStatus': {
      const invoice = await liveInvoice(m.args.id);
      await db.invoices.update(invoice.id, { status: m.args.status, updated_at: now });
      if (m.args.payments?.length) await replacePayments(invoice.id, m.args.payments);
      return;
    }
    case 'setPayments': {
      const invoice = await liveInvoice(m.args.id);
      await replacePayments(invoice.id, m.args.payments);
      return;
    }
    case 'updateFirmProfile': {
      const current = await db.firm_profile.toCollection().first();
      const { smtp_pass, ...fields } = m.args;
      await db.firm_profile.put({
        ...current,
        ...fields,
        id: current?.id ?? 'local',
        smtp_pass: smtp_pass === undefined || smtp_pass === MASKED_SECRET ? current?.smtp_pass ?? '' : smtp_pass ? MASKED_SECRET : '',
      });
      return;
    }
  }
}
