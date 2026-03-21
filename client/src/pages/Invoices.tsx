import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getInvoices, deleteInvoice, updateInvoiceStatus,
  downloadPDF, downloadExcel, sendInvoice, sendReminder,
  type Invoice
} from '../api';
import { useToast } from '../App';
export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const { addToast } = useToast();
  const fetchInvoices = async () => {
    try {
      const data = await getInvoices(statusFilter ? { status: statusFilter } : undefined);
      setInvoices(data);
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchInvoices(); }, [statusFilter]);
  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;
    try {
      await deleteInvoice(id);
      addToast('Invoice deleted', 'success');
      fetchInvoices();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };
  const handleStatusChange = async (id: number, status: string) => {
    try {
      await updateInvoiceStatus(id, status);
      addToast(`Invoice marked as ${status}`, 'success');
      fetchInvoices();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };
  const handleSend = async (id: number) => {
    try {
      const result = await sendInvoice(id);
      addToast('Invoice sent successfully!', 'success');
      if (result.previewUrl) {
        addToast(`Preview: ${result.previewUrl}`, 'info');
      }
      fetchInvoices();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };
  const handleRemind = async (id: number) => {
    try {
      const result = await sendReminder(id);
      addToast('Reminder sent!', 'success');
      if (result.previewUrl) {
        addToast(`Preview: ${result.previewUrl}`, 'info');
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const [year, month, day] = dateStr.split('T')[0].split('-');
    if (year && month && day) return `${day}/${month}/${year}`;
    return dateStr;
  };

  const filtered = invoices.filter(inv =>
    inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.client_name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  if (loading) {
    return <div className="loading-center"><div className="spinner"></div></div>;
  }
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">{invoices.length} total invoices</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/invoices/new')}>
          + New Invoice
        </button>
      </div>
      {/* Filter bar */}
      <div className="filter-bar" style={{ marginBottom: 24 }}>
        <input
          className="form-input"
          placeholder="🔍 Search invoices..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ width: 280 }}
        />
        <select
          className="form-select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      {/* Invoice table */}
      <div className="table-container">
        {filtered.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Client</th>
                <th>Date</th>
                <th>Due Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600, color: 'var(--accent-blue)', cursor: 'pointer' }}
                      onClick={() => navigate(`/invoices/${inv.id}/edit`)}>
                    {inv.invoice_number}
                  </td>
                  <td>{inv.client_name}</td>
                  <td>{formatDate(inv.date)}</td>
                  <td>{formatDate(inv.due_date)}</td>
                  <td style={{ fontWeight: 600 }}>₹{inv.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>
                    <select
                      className="form-select"
                      value={inv.status}
                      onChange={e => handleStatusChange(inv.id, e.target.value)}
                      style={{ width: 'auto', minWidth: 100, padding: '4px 28px 4px 10px', fontSize: 12 }}
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="paid">Paid</option>
                      <option value="overdue">Overdue</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                  <td>
                    <div className="btn-group">
                      <button className="btn-icon" title="Edit" onClick={() => navigate(`/invoices/${inv.id}/edit`)}>✍️</button>
                      <button className="btn-icon" title="PDF" onClick={() => downloadPDF(inv.id, inv.invoice_number)}>PDF</button>
                      <button className="btn-icon" title="Excel" onClick={() => downloadExcel(inv.id, inv.invoice_number)}>Excel</button>
                      <button className="btn-icon" title="Send Email" onClick={() => handleSend(inv.id)}>✉️</button>
                      {(inv.status === 'sent' || inv.status === 'overdue') && (
                        <button className="btn-icon" title="Send Reminder" onClick={() => handleRemind(inv.id)}>🔔</button>
                      )}
                      <button className="btn-icon" title="Delete" onClick={() => handleDelete(inv.id)} style={{ color: 'var(--accent-red)' }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📄</div>
            <div className="empty-text">No invoices found</div>
            <div className="empty-subtext">
              {statusFilter ? 'Try changing your filter' : 'Create your first invoice to get started'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}