// Same origin in every setup: Vite proxies /api in development, and the server (cloud or
// desktop) serves the built app itself
export const API_BASE = '/api';
/** Record ids: integers from the desktop server, UUIDs from the cloud server. */
export type Id = string | number;
/** Fired when the cloud server says the session is missing or expired; AuthGate shows sign-in. */
export const UNAUTHORIZED_EVENT = 'lexledger:unauthorized';
export interface Client {
  id: Id;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}
export interface LineItem {
  id?: Id;
  description: string;
  hours: number;
  rate: number;
  amount: number;
}
export interface Payment {
  id?: Id;
  date: string;
  amount_received: number;
  tds_amount: number;
}
export interface Invoice {
  id: Id;
  /** Null for an invoice created offline, until the server assigns its number */
  invoice_number: string | null;
  client_id: Id;
  client_name: string;
  client_email: string | null;
  client_address?: string | null;
  client_phone?: string | null;
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
  line_items?: LineItem[];
  payments?: Payment[];
  copies?: InvoiceCopy[];
  created_at: string;
  updated_at: string;
}
export interface InvoiceCopy {
  id: Id;
  invoice_id: Id;
  file_type: string;
  file_name: string;
  file_path?: string;
  created_at: string;
}
export interface DashboardData {
  stats: {
    total_invoices: number;
    total_billed: number;
    total_received: number;
    total_tds: number;
    total_outstanding: number;
    total_unpaid: number;
    paid_count: number;
    unpaid_count: number;
    draft_count: number;
    sent_count: number;
  };
  recentInvoices: Invoice[];
  totalClients: number;
}
export interface FirmProfile {
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
  smtp_pass: string;
  email_client: 'apple_mail' | 'outlook' | 'gmail_web' | 'outlook_web' | 'mailto';
  backup_enabled: number;
  backup_dir: string;
  backup_keep: number;
}
export interface BackupFile {
  file: string;
  kind: 'regular' | 'pre-restore';
  created_at: string;
  size: number;
}
export interface BackupInfo {
  dir: string;
  defaultDir: string;
  isDefault: boolean;
  backups: BackupFile[];
}
async function request(url: string, options?: RequestInit) {
  const maxRetries = 5;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${url}`, {
        ...options,
        cache: 'no-store', // Prevent browser caching of API responses
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });
      if (!res.ok) {
        if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Request failed');
      }
      // Handle blob responses for file downloads and previews
      if (res.headers.get('content-type')?.includes('application/pdf') ||
          res.headers.get('content-type')?.includes('spreadsheetml')) {
        return res.blob();
      }
      return res.json();
    } catch (err: unknown) {
      lastError = err;
      // Only retry on network errors (TypeError = fetch failed / connection refused).
      // Do NOT retry on HTTP errors (e.g. 404, 500) — those are real errors.
      const isNetworkError = err instanceof TypeError;
      if (isNetworkError && attempt < maxRetries) {
        const delay = 300 * Math.pow(2, attempt); // 300ms, 600ms, 1200ms, 2400ms, 4800ms
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
// Dashboard
export const getDashboard = (timeFilter: string = 'all', startDate?: string, endDate?: string): Promise<DashboardData> => {
  const query = new URLSearchParams({ timeFilter });
  if (startDate) query.set('startDate', startDate);
  if (endDate) query.set('endDate', endDate);
  return request(`/dashboard?${query.toString()}`);
};
// Clients
export const getClients = (): Promise<Client[]> => request('/clients');
export const getClient = (id: Id): Promise<Client> => request(`/clients/${id}`);
export const createClient = (data: Partial<Client>): Promise<Client> =>
  request('/clients', { method: 'POST', body: JSON.stringify(data) });
export const updateClient = (id: Id, data: Partial<Client>): Promise<Client> =>
  request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteClient = (id: Id): Promise<void> =>
  request(`/clients/${id}`, { method: 'DELETE' });
// Invoices
export const getInvoices = (params?: { status?: string; client_id?: string }): Promise<Invoice[]> => {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.client_id) query.set('client_id', params.client_id);
  const qs = query.toString();
  return request(`/invoices${qs ? `?${qs}` : ''}`);
};
export const getInvoice = (id: Id): Promise<Invoice> => request(`/invoices/${id}`);
export const createInvoice = (data: Partial<Invoice>): Promise<Invoice> =>
  request('/invoices', { method: 'POST', body: JSON.stringify(data) });
export const updateInvoice = (id: Id, data: Partial<Invoice>): Promise<Invoice> =>
  request(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteInvoice = (id: Id): Promise<void> =>
  request(`/invoices/${id}`, { method: 'DELETE' });
export const updateInvoiceStatus = (id: Id, status: string, payments?: Payment[]): Promise<Invoice> =>
  request(`/invoices/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, payments }) });
export const updateInvoicePayments = (id: Id, payments: Payment[]): Promise<Invoice> =>
  request(`/invoices/${id}/payments`, { method: 'PUT', body: JSON.stringify({ payments }) });
// Downloads
function formatDateDMY(isoDate: string): string {
  const parts = isoDate.split('T')[0].split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return isoDate;
}
/** Save a downloaded file. The object URL is released later rather than straight after the
 *  click, which can cancel the download in mobile browsers. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
function feeMemoFileName(invoiceNumber: string | null, clientName: string, date: string): string {
  const safeName = `Fee Memo No- ${invoiceNumber ?? ''} ${clientName} ${formatDateDMY(date)}`
    .replace(/[/\\:*?"<>|]/g, '-')
    .trim();
  return `${safeName}.pdf`;
}
export const downloadPDF = async (id: Id, invoiceNumber: string | null, clientName: string, date: string) => {
  const blob = await request(`/invoices/${id}/pdf`);
  saveBlob(blob, feeMemoFileName(invoiceNumber, clientName, date));
};
// The fee memo as a File, for the share sheet
export const fetchPDFFile = async (id: Id, invoiceNumber: string | null, clientName: string, date: string): Promise<File> => {
  const blob: Blob = await request(`/invoices/${id}/pdf`);
  return new File([blob], feeMemoFileName(invoiceNumber, clientName, date), { type: 'application/pdf' });
};
// Preview — returns a blob URL for embedding in an iframe (caller must revoke when done)
export const fetchPDFPreviewUrl = async (id: Id): Promise<{ url: string; revoke: () => void }> => {
  const res = await fetch(`${API_BASE}/invoices/${id}/pdf/preview`);
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    const err = await res.json().catch(() => ({ error: 'Preview failed' }));
    throw new Error(err.error || 'Preview failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
};
export const downloadExcel = async (id: Id, invoiceNumber: string | null) => {
  const blob = await request(`/invoices/${id}/excel`);
  saveBlob(blob, `${(invoiceNumber ?? 'memo').replace(/[/\\]/g, '-')}.xlsx`);
};
export const downloadExportExcel = async (startDate: string, endDate: string) => {
  const blob = await request(`/invoices/export?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
  saveBlob(blob, `Invoice_Records_${startDate}_to_${endDate}.xlsx`);
};
export const downloadBulkPDFs = async (clientId: Id, status: string, clientName: string) => {
  const statusParam = status || 'all';
  const res = await fetch(`${API_BASE}/invoices/export-pdfs?client_id=${clientId}&status=${statusParam}`);
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    const err = await res.json().catch(() => ({ error: 'Export failed' }));
    throw new Error(err.error || 'Export failed');
  }
  const blob = await res.blob();
  const safeName = clientName.replace(/[^a-zA-Z0-9_\- ]/g, '');
  const statusLabel = statusParam !== 'all' ? `_${statusParam}` : '';
  saveBlob(blob, `${safeName}${statusLabel}_Invoices.zip`);
};
// Email. The desktop server opens the mail app itself; the cloud server returns `compose` for
// the device to open (see share.ts).
export interface ComposeRequest {
  to: string;
  subject: string;
  body: string;
  emailClient: FirmProfile['email_client'];
}
export const sendInvoice = (id: Id): Promise<{ message: string; method: string; autoAttached: boolean; triggerPdfDownload?: boolean; compose?: ComposeRequest }> =>
  request(`/invoices/${id}/send`, { method: 'POST' });
export const sendReminder = (id: Id): Promise<{ message: string; method: string; compose?: ComposeRequest }> =>
  request(`/invoices/${id}/remind`, { method: 'POST' });
// Settings — Firm Profile
export const getFirmProfile = (): Promise<FirmProfile> => request('/settings/firm-profile');
export const updateFirmProfile = (data: Partial<FirmProfile>): Promise<FirmProfile> =>
  request('/settings/firm-profile', { method: 'PUT', body: JSON.stringify(data) });
// Backups
export const getBackups = (): Promise<BackupInfo> => request('/backups');
export const createBackupNow = (): Promise<BackupFile> =>
  request('/backups', { method: 'POST' });
// Opens the system folder dialog on this machine (the server is always local)
export const chooseBackupFolder = (startDir?: string): Promise<{ path: string | null }> =>
  request('/backups/choose-folder', { method: 'POST', body: JSON.stringify({ startDir }) });
export const restoreBackup = (file: string): Promise<{ message: string; invoices: number; clients: number; safetyBackup: string }> =>
  request('/backups/restore', { method: 'POST', body: JSON.stringify({ file }) });
// Session (cloud server only)
export interface SessionUser {
  user: { email: string };
  account: { id: string; name: string };
}
export type Session =
  | { mode: 'desktop' }
  | { mode: 'cloud'; user: SessionUser | null };
/** Which server the app is talking to, and who is signed in. The desktop server has no
 *  /api/auth routes, so anything other than a JSON answer or a 401 means desktop. */
export async function getSession(): Promise<Session> {
  const res = await fetch(`${API_BASE}/auth/me`, { cache: 'no-store' });
  if (res.status === 401) return { mode: 'cloud', user: null };
  if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
    return { mode: 'cloud', user: await res.json() };
  }
  return { mode: 'desktop' };
}
export const login = (email: string, password: string): Promise<SessionUser> =>
  request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const signup = (data: { email: string; password: string; firm_name: string; signup_code?: string }): Promise<SessionUser> =>
  request('/auth/signup', { method: 'POST', body: JSON.stringify(data) });
export const logout = (): Promise<void> => request('/auth/logout', { method: 'POST' });
// Copies a desktop database (legalbill.db or a backup file) into the signed-in cloud account
export const importDesktopDatabase = (file: Blob): Promise<{ message: string; clients: number; invoices: number; payments: number }> =>
  request('/import', { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } });
// Everything in the signed-in cloud account as one JSON file
export const downloadAccountExport = async () => {
  const res = await fetch(`${API_BASE}/export-all`, { cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    const err = await res.json().catch(() => ({ error: 'Export failed' }));
    throw new Error(err.error || 'Export failed');
  }
  const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'LexLedger-export.json';
  saveBlob(await res.blob(), name);
};
