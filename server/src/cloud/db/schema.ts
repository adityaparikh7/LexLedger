import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, text, timestamp, bigint, numeric, integer, date,
  index, uniqueIndex, primaryKey, check,
} from 'drizzle-orm/pg-core';

// Column keys are snake_case so rows serialise to the same JSON shape the client already uses.

const money = () => numeric({ precision: 14, scale: 2, mode: 'number' }).notNull().default(0);
// Date mode: serialised to JSON as ISO 8601, which every browser parses (Postgres' own text
// format, "2026-04-01 10:30:00+00", isn't parsed by Safari)
const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' });

export const accounts = pgTable('accounts', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().default(''),
  created_at: timestamptz().notNull().defaultNow(),
});

// One user per account (one login per firm, used on many devices)
export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  account_id: uuid().notNull().unique().references(() => accounts.id, { onDelete: 'cascade' }),
  email: text().notNull(),
  password_hash: text().notNull(),
  created_at: timestamptz().notNull().defaultNow(),
}, (t) => [uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`)]);

export const sessions = pgTable('sessions', {
  // sha256 of the cookie token; the token itself is never stored
  token_hash: text().primaryKey(),
  user_id: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  account_id: uuid().notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  user_agent: text(),
  created_at: timestamptz().notNull().defaultNow(),
  last_used_at: timestamptz().notNull().defaultNow(),
  expires_at: timestamptz().notNull(),
}, (t) => [index('sessions_user_idx').on(t.user_id)]);

/** Columns on every table that devices sync. `version` is set from a global sequence by a
 *  trigger on every insert/update (see the sync_versions migration) and is the pull cursor;
 *  rows are tombstoned with `deleted_at` instead of deleted so devices learn about removals. */
const synced = () => ({
  id: uuid().primaryKey().defaultRandom(),
  account_id: uuid().notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  created_at: timestamptz().notNull().defaultNow(),
  updated_at: timestamptz().notNull().defaultNow(),
  deleted_at: timestamptz(),
  version: bigint({ mode: 'number' }).notNull().default(0),
});

export const clients = pgTable('clients', {
  ...synced(),
  name: text().notNull(),
  email: text(),
  phone: text(),
  address: text(),
}, (t) => [
  index('clients_account_version_idx').on(t.account_id, t.version),
  index('clients_account_name_idx').on(t.account_id, t.name),
]);

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'unpaid', 'cancelled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const invoices = pgTable('invoices', {
  ...synced(),
  // Null while an invoice created offline waits for the server to assign its number
  invoice_number: text(),
  client_id: uuid().notNull().references(() => clients.id, { onDelete: 'restrict' }),
  date: date({ mode: 'string' }).notNull(),
  date_paid: date({ mode: 'string' }),
  status: text().$type<InvoiceStatus>().notNull().default('draft'),
  notes: text(),
  case_name: text(),
  case_party1_type: text(),
  case_plaintiff: text(),
  case_party2_type: text(),
  case_defendant: text(),
  subtotal: money(),
  tax_rate: numeric({ precision: 6, scale: 3, mode: 'number' }).notNull().default(0),
  tax_amount: money(),
  total: money(),
  amount_received: money(),
  tds_amount: money(),
}, (t) => [
  check('invoices_status_check', sql`${t.status} IN ('draft','sent','paid','unpaid','cancelled')`),
  uniqueIndex('invoices_account_number_idx').on(t.account_id, t.invoice_number).where(sql`${t.deleted_at} IS NULL`),
  index('invoices_account_version_idx').on(t.account_id, t.version),
  index('invoices_account_date_idx').on(t.account_id, t.date),
  index('invoices_client_idx').on(t.client_id),
]);

export const lineItems = pgTable('line_items', {
  ...synced(),
  invoice_id: uuid().notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  position: integer().notNull().default(0),
  description: text().notNull(),
  hours: numeric({ precision: 10, scale: 2, mode: 'number' }).notNull().default(0),
  rate: money(),
  amount: money(),
}, (t) => [
  index('line_items_invoice_idx').on(t.invoice_id),
  index('line_items_account_version_idx').on(t.account_id, t.version),
]);

export const payments = pgTable('payments', {
  ...synced(),
  invoice_id: uuid().notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  date: date({ mode: 'string' }).notNull(),
  amount_received: money(),
  tds_amount: money(),
}, (t) => [
  index('payments_invoice_idx').on(t.invoice_id),
  index('payments_account_version_idx').on(t.account_id, t.version),
]);

export const EMAIL_CLIENTS = ['apple_mail', 'outlook', 'gmail_web', 'outlook_web', 'mailto'] as const;
export type EmailClient = (typeof EMAIL_CLIENTS)[number];

export const firmProfile = pgTable('firm_profile', {
  ...synced(),
  firm_name: text().notNull().default(''),
  firm_address: text().notNull().default(''),
  firm_phone: text().notNull().default(''),
  firm_email: text().notNull().default(''),
  bank_account_name: text().notNull().default(''),
  bank_name: text().notNull().default(''),
  bank_account_number: text().notNull().default(''),
  bank_ifsc: text().notNull().default(''),
  pan_number: text().notNull().default(''),
  signature_name: text().notNull().default(''),
  signature_full: text().notNull().default(''),
  smtp_host: text().notNull().default(''),
  smtp_port: integer().notNull().default(587),
  smtp_user: text().notNull().default(''),
  // AES-GCM encrypted (see secrets.ts); never sent to devices
  smtp_pass: text().notNull().default(''),
  email_client: text().$type<EmailClient>().notNull().default('mailto'),
}, (t) => [
  uniqueIndex('firm_profile_account_idx').on(t.account_id),
  index('firm_profile_account_version_idx').on(t.account_id, t.version),
]);

// A log of generated PDF/Excel files. The files themselves aren't kept: the server's disk is
// temporary, and a memo can be regenerated at any time.
export const invoiceCopies = pgTable('invoice_copies', {
  id: uuid().primaryKey().defaultRandom(),
  account_id: uuid().notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  invoice_id: uuid().notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  file_type: text().notNull(),
  file_name: text().notNull(),
  created_at: timestamptz().notNull().defaultNow(),
}, (t) => [index('invoice_copies_invoice_idx').on(t.invoice_id)]);

// Next invoice sequence number per financial year; rows are locked while a number is issued
export const invoiceSequences = pgTable('invoice_sequences', {
  account_id: uuid().notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  fy: text().notNull(),
  next_seq: integer().notNull(),
}, (t) => [primaryKey({ columns: [t.account_id, t.fy] })]);

// The last mutation applied from each device, so a push that is retried after a dropped
// connection doesn't apply the same changes twice
export const deviceMutations = pgTable('device_mutations', {
  device_id: uuid().primaryKey(),
  account_id: uuid().notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  last_mutation_id: bigint({ mode: 'number' }).notNull().default(0),
  last_seen_at: timestamptz().notNull().defaultNow(),
});
