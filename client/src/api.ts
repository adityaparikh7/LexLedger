// When running in Electron (file:// protocol), API calls need absolute URL
const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:';
const API_BASE = isElectron ? 'http://localhost:3000/api' : '/api';
export interface Client {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}
export interface LineItem {
  id?: number;
  description: string;
  hours: number;
  rate: number;
  amount: number;
}
export interface Payment {
  id?: number;
  date: string;
  amount_received: number;
  tds_amount: number;
}
export interface Invoice {
  id: number;
  invoice_number: string;
  client_id: number;
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
  id: number;
  invoice_id: number;
  file_type: string;
  file_name: string;
  file_path: string;
  created_at: string;
}
export interface DashboardData {
  stats: {
    total_invoices: number;
    total_paid: number;
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
}
async function request(url: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  // Handle blob responses for file downloads
  if (res.headers.get('content-type')?.includes('application/pdf') ||
      res.headers.get('content-type')?.includes('spreadsheetml')) {
    return res.blob();
  }
  return res.json();
}
// Dashboard
export const getDashboard = (): Promise<DashboardData> => request('/dashboard');
// Clients
export const getClients = (): Promise<Client[]> => request('/clients');
export const getClient = (id: number): Promise<Client> => request(`/clients/${id}`);
export const createClient = (data: Partial<Client>): Promise<Client> =>
  request('/clients', { method: 'POST', body: JSON.stringify(data) });
export const updateClient = (id: number, data: Partial<Client>): Promise<Client> =>
  request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteClient = (id: number): Promise<void> =>
  request(`/clients/${id}`, { method: 'DELETE' });
// Invoices
export const getInvoices = (params?: { status?: string; client_id?: string }): Promise<Invoice[]> => {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.client_id) query.set('client_id', params.client_id);
  const qs = query.toString();
  return request(`/invoices${qs ? `?${qs}` : ''}`);
};
export const getInvoice = (id: number): Promise<Invoice> => request(`/invoices/${id}`);
export const createInvoice = (data: Partial<Invoice>): Promise<Invoice> =>
  request('/invoices', { method: 'POST', body: JSON.stringify(data) });
export const updateInvoice = (id: number, data: Partial<Invoice>): Promise<Invoice> =>
  request(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteInvoice = (id: number): Promise<void> =>
  request(`/invoices/${id}`, { method: 'DELETE' });
export const updateInvoiceStatus = (id: number, status: string, payments?: Payment[]): Promise<Invoice> =>
  request(`/invoices/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, payments }) });
export const updateInvoicePayments = (id: number, payments: Payment[]): Promise<Invoice> =>
  request(`/invoices/${id}/payments`, { method: 'PUT', body: JSON.stringify({ payments }) });
// Downloads
function formatDateDMY(isoDate: string): string {
  const parts = isoDate.split('T')[0].split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return isoDate;
}
export const downloadPDF = async (id: number, invoiceNumber: string, clientName: string, date: string) => {
  const blob = await request(`/invoices/${id}/pdf`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const formattedDate = formatDateDMY(date);
  const safeName = `Fee Memo No- ${invoiceNumber} ${clientName} ${formattedDate}`
    .replace(/[/\\:*?"<>|]/g, '-')
    .trim();
  a.download = `${safeName}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};
export const downloadExcel = async (id: number, invoiceNumber: string) => {
  const blob = await request(`/invoices/${id}/excel`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${invoiceNumber}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};
export const downloadExportExcel = async (startDate: string, endDate: string) => {
  const blob = await request(`/invoices/export?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Invoice_Records_${startDate}_to_${endDate}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};
export const downloadBulkPDFs = async (clientId: number, status: string, clientName: string) => {
  const statusParam = status || 'all';
  const res = await fetch(`${API_BASE}/invoices/export-pdfs?client_id=${clientId}&status=${statusParam}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Export failed' }));
    throw new Error(err.error || 'Export failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = clientName.replace(/[^a-zA-Z0-9_\- ]/g, '');
  const statusLabel = statusParam !== 'all' ? `_${statusParam}` : '';
  a.download = `${safeName}${statusLabel}_Invoices.zip`;
  a.click();
  URL.revokeObjectURL(url);
};
// Email
export const sendInvoice = (id: number): Promise<{ message: string; previewUrl?: string }> =>
  request(`/invoices/${id}/send`, { method: 'POST' });
export const sendReminder = (id: number): Promise<{ message: string; previewUrl?: string }> =>
  request(`/invoices/${id}/remind`, { method: 'POST' });
// Settings — Firm Profile
export const getFirmProfile = (): Promise<FirmProfile> => request('/settings/firm-profile');
export const updateFirmProfile = (data: Partial<FirmProfile>): Promise<FirmProfile> =>
  request('/settings/firm-profile', { method: 'PUT', body: JSON.stringify(data) });