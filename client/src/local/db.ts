// The device's copy of the account's data (IndexedDB, via Dexie), plus the outbox of changes
// made on this device that the server hasn't confirmed yet. Used only with the cloud server.
import Dexie, { type Table } from 'dexie';
import type { FirmProfile } from '../api';
import type { QueuedMutation } from '../../../shared/sync';

export interface LocalClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocalInvoice {
  id: string;
  invoice_number: string | null;
  client_id: string;
  date: string;
  date_paid: string | null;
  status: 'draft' | 'sent' | 'paid' | 'unpaid' | 'cancelled';
  notes: string | null;
  case_name: string | null;
  case_party1_type: string | null;
  case_plaintiff: string | null;
  case_party2_type: string | null;
  case_defendant: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_received: number;
  tds_amount: number;
  created_at: string;
  updated_at: string;
}

export interface LocalLineItem {
  id: string;
  invoice_id: string;
  position: number;
  description: string;
  hours: number;
  rate: number;
  amount: number;
}

export interface LocalPayment {
  id: string;
  invoice_id: string;
  date: string;
  amount_received: number;
  tds_amount: number;
}

export type LocalFirmProfile = Omit<FirmProfile, 'backup_enabled' | 'backup_dir' | 'backup_keep'> & { id: string };

export interface OutboxEntry {
  seq?: number;
  mutation: QueuedMutation;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export const db = new Dexie('lexledger') as Dexie & {
  clients: Table<LocalClient, string>;
  invoices: Table<LocalInvoice, string>;
  line_items: Table<LocalLineItem, string>;
  payments: Table<LocalPayment, string>;
  firm_profile: Table<LocalFirmProfile, string>;
  outbox: Table<OutboxEntry, number>;
  meta: Table<MetaEntry, string>;
};

db.version(1).stores({
  clients: 'id',
  invoices: 'id, client_id, created_at',
  line_items: 'id, invoice_id',
  payments: 'id, invoice_id',
  firm_profile: 'id',
  outbox: '++seq',
  meta: 'key',
});

export const DATA_TABLES = ['clients', 'invoices', 'line_items', 'payments', 'firm_profile'] as const;

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Remove all account data and pending changes from this device. */
export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', [...DATA_TABLES.map((t) => db[t]), db.outbox, db.meta], async () => {
    await Promise.all([...DATA_TABLES.map((t) => db[t].clear()), db.outbox.clear(), db.meta.clear()]);
  });
}
