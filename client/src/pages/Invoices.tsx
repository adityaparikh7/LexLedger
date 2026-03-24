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

  // Payment modal state
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; invoice: Invoice | null }>({ open: false, invoice: null });
  const [paymentDatePaid, setPaymentDatePaid] = useState('');
  const [paymentAmountReceived, setPaymentAmountReceived] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

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
  const handleStatusChange = async (inv: Invoice, newStatus: string) => {
    if (newStatus === 'paid') {
      // Open payment modal instead of immediately changing status
      setPaymentModal({ open: true, invoice: inv });
      setPaymentDatePaid(new Date().toISOString().split('T')[0]);
      setPaymentAmountReceived(String(inv.total));
      return;
    }
    try {
      await updateInvoiceStatus(inv.id, newStatus);
      addToast(`Invoice marked as ${newStatus}`, 'success');
      fetchInvoices();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModal.invoice) return;
    const amountReceived = parseFloat(paymentAmountReceived) || 0;
    const tdsAmount = paymentModal.invoice.total - amountReceived;
    setSubmittingPayment(true);
    try {
      await updateInvoiceStatus(paymentModal.invoice.id, 'paid', {
        date_paid: paymentDatePaid,
        amount_received: amountReceived,
        tds_amount: tdsAmount,
      });
      addToast('Invoice marked as paid', 'success');
      setPaymentModal({ open: false, invoice: null });
      fetchInvoices();
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setSubmittingPayment(false);
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
  const formatCurrency = (val: number) =>
    `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const filtered = invoices.filter(inv =>
    inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.client_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const tdsAmount = paymentModal.invoice
    ? paymentModal.invoice.total - (parseFloat(paymentAmountReceived) || 0)
    : 0;

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
                <th>Date Paid</th>
                <th>Amount</th>
                <th>Received</th>
                <th>TDS</th>
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
                  <td>{formatDate(inv.date_paid)}</td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(inv.total)}</td>
                  <td>{inv.amount_received ? formatCurrency(inv.amount_received) : '—'}</td>
                  <td>{inv.tds_amount ? formatCurrency(inv.tds_amount) : '—'}</td>
                  <td>
                    <select
                      className="form-select"
                      value={inv.status}
                      onChange={e => handleStatusChange(inv, e.target.value)}
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

      {/* Payment Details Modal */}
      {paymentModal.open && paymentModal.invoice && (
        <div className="modal-overlay" onClick={() => setPaymentModal({ open: false, invoice: null })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Payment Details</h3>
              <button
                className="btn-icon"
                onClick={() => setPaymentModal({ open: false, invoice: null })}>
                ✕
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Invoice <strong>{paymentModal.invoice.invoice_number}</strong> — Total: <strong>{formatCurrency(paymentModal.invoice.total)}</strong>
            </p>
            <form onSubmit={handlePaymentSubmit}>
              <div className="form-group">
                <label className="form-label">Date Paid *</label>
                <input
                  type="date"
                  className="form-input"
                  value={paymentDatePaid}
                  onChange={(e) => setPaymentDatePaid(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Amount Received (₹) *</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="0.00"
                  value={paymentAmountReceived}
                  onChange={(e) => setPaymentAmountReceived(e.target.value)}
                  min="0"
                  step="0.01"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">TDS Amount (₹)</label>
                <input
                  className="form-input"
                  value={formatCurrency(tdsAmount)}
                  disabled
                  style={{
                    background: 'rgba(79, 142, 255, 0.05)',
                    fontWeight: 600,
                    color: tdsAmount > 0 ? 'var(--accent-amber)' : 'var(--text-primary)',
                  }}
                />
                <p style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                  Auto-calculated: Total ({formatCurrency(paymentModal.invoice.total)}) − Amount Received
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setPaymentModal({ open: false, invoice: null })}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingPayment}>
                  {submittingPayment ? '⏳ Saving...' : '✅ Mark as Paid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}