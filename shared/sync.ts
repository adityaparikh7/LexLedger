// The sync protocol between devices and the cloud server.
//
// Push: a device sends the changes made on it since its last push, as named mutations in the
// order they were made. Each mutation has an id that increases on that device; the server
// applies each one once (a retried push skips ids it has already applied) and reports a
// rejection per mutation instead of failing the whole batch.
//
// Pull: the device asks for every row of its account whose `version` is above its cursor.
// Deleted rows come back with `deleted_at` set so the device can remove them.

export interface LineItemArgs {
  id: string;
  description: string;
  hours: number;
  rate: number;
}

export interface PaymentArgs {
  id: string;
  date: string;
  amount_received: number;
  tds_amount: number;
}

export interface ClientArgs {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export interface InvoiceArgs {
  id: string;
  client_id: string;
  /** Ignored for a new invoice: the server assigns the next number */
  invoice_number?: string | null;
  date: string;
  date_paid: string | null;
  status: 'draft' | 'sent' | 'paid' | 'unpaid' | 'cancelled';
  notes: string | null;
  case_name: string | null;
  case_party1_type: string | null;
  case_plaintiff: string | null;
  case_party2_type: string | null;
  case_defendant: string | null;
  tax_rate: number;
  /** Totals for invoices without payment entries (older data) */
  amount_received?: number;
  tds_amount?: number;
  line_items: LineItemArgs[];
  /** When present, replaces the invoice's payments */
  payments?: PaymentArgs[];
  created_at?: string;
}

export interface FirmProfileArgs {
  firm_name: string;
  firm_address: string;
  firm_phone: string;
  firm_email: string;
  bank_account_name: string;
  bank_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  pan_number: string;
  signature_name: string;
  signature_full: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  /** Omitted, or MASKED_SECRET, to keep the stored password */
  smtp_pass?: string;
  email_client: 'apple_mail' | 'outlook' | 'gmail_web' | 'outlook_web' | 'mailto';
}

export type Mutation =
  | { name: 'upsertClient'; args: ClientArgs }
  | { name: 'deleteClient'; args: { id: string } }
  | { name: 'upsertInvoice'; args: InvoiceArgs }
  | { name: 'deleteInvoice'; args: { id: string } }
  | { name: 'setInvoiceStatus'; args: { id: string; status: InvoiceArgs['status']; payments?: PaymentArgs[] } }
  | { name: 'setPayments'; args: { id: string; payments: PaymentArgs[] } }
  | { name: 'updateFirmProfile'; args: FirmProfileArgs };

export type QueuedMutation = Mutation & { id: number };

export interface PushRequest {
  deviceId: string;
  mutations: QueuedMutation[];
}

export interface PushResponse {
  results: { id: number; error?: string }[];
}

export const SYNC_TABLES = ['clients', 'invoices', 'line_items', 'payments', 'firm_profile'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/** A synced row as the server sends it: its columns plus the sync bookkeeping. */
export type SyncRow = Record<string, unknown> & { id: string; version: number; deleted_at: string | null };

export interface PullResponse {
  cursor: number;
  hasMore: boolean;
  rows: Record<SyncTable, SyncRow[]>;
}

export const MASKED_SECRET = '********';
