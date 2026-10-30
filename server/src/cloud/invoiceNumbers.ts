import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Tx } from './db';
import { invoices, invoiceSequences } from './db/schema';
import { getFinancialYear } from '../../../shared/dates';

/** Issue the next invoice number, `{seq}/{FY}` (e.g. `5/2025-26`), for the financial year of
 *  `invoiceDate`. Must run inside the transaction that inserts the invoice: the sequence row
 *  stays locked until it commits, so devices creating invoices at the same time get distinct
 *  numbers. */
export async function nextInvoiceNumber(tx: Tx, accountId: string, invoiceDate: string): Promise<string> {
  const fy = getFinancialYear(invoiceDate).label;

  // First number of a year (or after an import): start after the highest number already used
  await tx.execute(sql`
    INSERT INTO invoice_sequences (account_id, fy, next_seq)
    SELECT ${accountId}, ${fy}, COALESCE(MAX(split_part(invoice_number, '/', 1)::int), 0) + 1
    FROM invoices
    WHERE account_id = ${accountId} AND deleted_at IS NULL
      AND invoice_number LIKE ${'%/' + fy} AND split_part(invoice_number, '/', 1) ~ '^[0-9]{1,9}$'
    ON CONFLICT (account_id, fy) DO NOTHING
  `);

  const [row] = await tx.select({ next_seq: invoiceSequences.next_seq }).from(invoiceSequences)
    .where(and(eq(invoiceSequences.account_id, accountId), eq(invoiceSequences.fy, fy)))
    .for('update');

  // Skip numbers the user has typed in by hand on other invoices
  let seq = row.next_seq;
  for (;;) {
    const [taken] = await tx.select({ id: invoices.id }).from(invoices)
      .where(and(eq(invoices.account_id, accountId), eq(invoices.invoice_number, `${seq}/${fy}`), isNull(invoices.deleted_at)));
    if (!taken) break;
    seq++;
  }

  await tx.update(invoiceSequences).set({ next_seq: seq + 1 })
    .where(and(eq(invoiceSequences.account_id, accountId), eq(invoiceSequences.fy, fy)));
  return `${seq}/${fy}`;
}

/** True if another live invoice in the account already uses this number. */
export async function isInvoiceNumberTaken(tx: Tx, accountId: string, invoiceNumber: string, exceptId?: string): Promise<boolean> {
  const rows = await tx.select({ id: invoices.id }).from(invoices)
    .where(and(eq(invoices.account_id, accountId), eq(invoices.invoice_number, invoiceNumber), isNull(invoices.deleted_at)));
  return rows.some((r) => r.id !== exceptId);
}
