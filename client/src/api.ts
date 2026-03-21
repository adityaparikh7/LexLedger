const API_BASE = '/api';
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
export interface Invoice {
  id: number;
  invoice_number: string;
  client_id: number;
  client_name: string;
  client_email: string | null;
  client_address?: string | null;
  client_phone?: string | null;
  date: string;
  due_date: string | null;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
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
  line_items?: LineItem[];
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
    total_overdue: number;
    paid_count: number;
    overdue_count: number;
    draft_count: number;
    sent_count: number;
  };
  recentInvoices: Invoice[];
  totalClients: number;
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
export const createInvoice = (data: any): Promise<Invoice> =>
  request('/invoices', { method: 'POST', body: JSON.stringify(data) });
export const updateInvoice = (id: number, data: any): Promise<Invoice> =>
  request(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteInvoice = (id: number): Promise<void> =>
  request(`/invoices/${id}`, { method: 'DELETE' });
export const updateInvoiceStatus = (id: number, status: string): Promise<Invoice> =>
  request(`/invoices/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
// Downloads
export const downloadPDF = async (id: number, invoiceNumber: string) => {
  const blob = await request(`/invoices/${id}/pdf`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${invoiceNumber}.pdf`;
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
// Email
export const sendInvoice = (id: number): Promise<{ message: string; previewUrl?: string }> =>
  request(`/invoices/${id}/send`, { method: 'POST' });
export const sendReminder = (id: number): Promise<{ message: string; previewUrl?: string }> =>
  request(`/invoices/${id}/remind`, { method: 'POST' });