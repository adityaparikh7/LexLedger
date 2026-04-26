import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  getInvoices, deleteInvoice, updateInvoiceStatus,
  downloadPDF, downloadExcel, sendInvoice, sendReminder,
  fetchPDFPreviewUrl,
  type Invoice, type Payment
} from '../api';
import { useToast } from '../context/ToastContext';
import { Edit2, FileText, FileSpreadsheet, Send, Bell, Trash2, Search, X, Loader2, Check, FileDown, Eye } from 'lucide-react';

interface FormPayment {
  date: string;
  amount_received: string;
  tds_amount: string;
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState(location.state?.clientName || '');
  const navigate = useNavigate();
  const { addToast } = useToast();

  // Payment modal state
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; invoice: Invoice | null }>({ open: false, invoice: null });
  const [paymentEntries, setPaymentEntries] = useState<FormPayment[]>([]);
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // PDF Preview modal state
  const [previewModal, setPreviewModal] = useState<{ open: boolean; invoice: Invoice | null; blobUrl: string | null; loading: boolean }>(
    { open: false, invoice: null, blobUrl: null, loading: false }
  );

  const fetchInvoices = useCallback(async () => {
    try {
      const data = await getInvoices(statusFilter ? { status: statusFilter } : undefined);
      setInvoices(data);
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, addToast]);
  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;
    try {
      await deleteInvoice(id);
      addToast('Invoice deleted', 'success');
      fetchInvoices();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };
  const handleStatusChange = async (inv: Invoice, newStatus: string) => {
    if (newStatus === 'paid') {
      setPaymentModal({ open: true, invoice: inv });
      setPaymentEntries([{
        date: new Date().toISOString().split('T')[0],
        amount_received: String(inv.total),
        tds_amount: '0',
      }]);
      return;
    }
    try {
      await updateInvoiceStatus(inv.id, newStatus);
      addToast(`Invoice marked as ${newStatus}`, 'success');
      fetchInvoices();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };

  const addPaymentEntry = () => {
    setPaymentEntries([...paymentEntries, {
      date: new Date().toISOString().split('T')[0],
      amount_received: '',
      tds_amount: '',
    }]);
  };

  const removePaymentEntry = (index: number) => {
    if (paymentEntries.length === 1) return;
    setPaymentEntries(paymentEntries.filter((_, i) => i !== index));
  };

  const updatePaymentEntry = (index: number, field: keyof FormPayment, value: string) => {
    const updated = [...paymentEntries];
    updated[index] = { ...updated[index], [field]: value };
    // Auto-calculate TDS when amount_received changes (only if TDS hasn't been manually edited)
    if (field === 'amount_received' && paymentModal.invoice) {
      const received = parseFloat(value) || 0;
      const invoiceTotal = paymentModal.invoice.total;
      const otherReceived = updated.reduce((sum, p, i) => i !== index ? sum + (parseFloat(p.amount_received) || 0) : sum, 0);
      const otherTds = updated.reduce((sum, p, i) => i !== index ? sum + (parseFloat(p.tds_amount) || 0) : sum, 0);
      const remaining = invoiceTotal - otherReceived - otherTds - received;
      updated[index].tds_amount = String(Math.max(0, remaining));
    }
    setPaymentEntries(updated);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModal.invoice) return;
    const payments: Payment[] = paymentEntries
      .filter(p => parseFloat(p.amount_received) > 0 || parseFloat(p.tds_amount) > 0)
      .map(p => ({
        date: p.date,
        amount_received: parseFloat(p.amount_received) || 0,
        tds_amount: parseFloat(p.tds_amount) || 0,
      }));
    if (payments.length === 0) {
      addToast('Please enter at least one payment', 'error');
      return;
    }
    setSubmittingPayment(true);
    try {
      await updateInvoiceStatus(paymentModal.invoice.id, 'paid', payments);
      addToast('Invoice marked as paid', 'success');
      setPaymentModal({ open: false, invoice: null });
      fetchInvoices();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleSend = async (id: number) => {
    try {
      const result = await sendInvoice(id);
      if (result.autoAttached) {
        addToast('Invoice opened in mail client with PDF attached!', 'success');
      } else {
        addToast('Mail client opened — please attach the downloaded PDF manually', 'info');
      }
      fetchInvoices();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };
  const handleRemind = async (id: number) => {
    try {
      await sendReminder(id);
      addToast('Reminder opened in mail client!', 'success');
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleOpenPreview = async (inv: Invoice) => {
    setPreviewModal({ open: true, invoice: inv, blobUrl: null, loading: true });
    try {
      const { url } = await fetchPDFPreviewUrl(inv.id);
      setPreviewModal(prev => ({ ...prev, blobUrl: url, loading: false }));
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
      setPreviewModal({ open: false, invoice: null, blobUrl: null, loading: false });
    }
  };

  const handleClosePreview = () => {
    if (previewModal.blobUrl) URL.revokeObjectURL(previewModal.blobUrl);
    setPreviewModal({ open: false, invoice: null, blobUrl: null, loading: false });
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

  // Payment modal summary calculations
  const modalTotalReceived = paymentEntries.reduce((sum, p) => sum + (parseFloat(p.amount_received) || 0), 0);
  const modalTotalTds = paymentEntries.reduce((sum, p) => sum + (parseFloat(p.tds_amount) || 0), 0);
  const modalRemaining = paymentModal.invoice
    ? paymentModal.invoice.total - modalTotalReceived - modalTotalTds
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
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-muted)' }} />
          <input
            className="form-input"
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: 280, paddingLeft: 36 }}
          />
        </div>
        <select
          className="form-select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
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
                <th>Balance</th>
                <th>Status</th>
                <th className="sticky-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const balance = inv.total - (inv.amount_received || 0) - (inv.tds_amount || 0);
                return (
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
                    <td style={{
                      fontWeight: 600,
                      color: balance > 0.01 ? 'var(--accent-red)' : 'var(--accent-green, #2E5E4E)',
                    }}>
                      {inv.amount_received || inv.tds_amount ? formatCurrency(balance) : '—'}
                    </td>
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
                        <option value="unpaid">Unpaid</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                    <td className="sticky-right">
                      <div className="btn-group">
                        <button className="btn-icon btn-icon-blue" title="Edit" onClick={() => navigate(`/invoices/${inv.id}/edit`)}>
                          <Edit2 size={18} />
                        </button>
                        <button className="btn-icon" title="Preview PDF" style={{ color: 'var(--text-secondary)' }} onClick={() => handleOpenPreview(inv)}>
                          <Eye size={18} />
                        </button>
                        <button className="btn-icon btn-icon-green" title="Download PDF" onClick={() => downloadPDF(inv.id, inv.invoice_number, inv.client_name, inv.date)}>
                          <FileDown size={18} />
                        </button>
                        <button className="btn-icon btn-icon-green" title="Download Excel" onClick={() => downloadExcel(inv.id, inv.invoice_number)}>
                          <FileSpreadsheet size={18} />
                        </button>
                        <button className="btn-icon btn-icon-amber" title="Send via Email" onClick={() => handleSend(inv.id)}>
                          <Send size={18} />
                        </button>
                        {(inv.status === 'sent' || inv.status === 'unpaid') && (
                        <button className="btn-icon btn-icon-amber" title="Send Reminder" onClick={() => handleRemind(inv.id)}>
                          <Bell size={18} />
                        </button>
                      )}
                        <button className="btn-icon btn-icon-red" title="Delete" onClick={() => handleDelete(inv.id)}>
                          <Trash2 size={18} style={{ color: 'var(--accent-red)' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon"><FileText size={48} /></div>
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
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h3 className="modal-title">Payment Details</h3>
              <button
                className="btn-icon"
                onClick={() => setPaymentModal({ open: false, invoice: null })}>
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Invoice <strong>{paymentModal.invoice.invoice_number}</strong> — Total: <strong>{formatCurrency(paymentModal.invoice.total)}</strong>
            </p>
            <form onSubmit={handlePaymentSubmit}>
              {/* Payment entries */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Payment Entries
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={addPaymentEntry}
                    style={{ fontSize: 11, padding: '4px 10px' }}>
                    + Add Payment
                  </button>
                </div>
                {paymentEntries.map((entry, idx) => (
                  <div key={idx} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr auto',
                    gap: 8,
                    marginBottom: 8,
                    padding: 12,
                    borderRadius: 8,
                    background: 'var(--bg-tertiary, rgba(0,0,0,0.03))',
                  }}>
                    <div>
                      {idx === 0 && <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Date</label>}
                      <input
                        type="date"
                        className="form-input"
                        value={entry.date}
                        onChange={(e) => updatePaymentEntry(idx, 'date', e.target.value)}
                        required
                        style={{ fontSize: 13, padding: '6px 8px' }}
                      />
                    </div>
                    <div>
                      {idx === 0 && <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Amount Received (₹)</label>}
                      <input
                        type="number"
                        className="form-input"
                        placeholder="0.00"
                        value={entry.amount_received}
                        onChange={(e) => updatePaymentEntry(idx, 'amount_received', e.target.value)}
                        min="0"
                        step="0.01"
                        required
                        style={{ fontSize: 13, padding: '6px 8px' }}
                      />
                    </div>
                    <div>
                      {idx === 0 && <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>TDS Amount (₹)</label>}
                      <input
                        type="number"
                        className="form-input"
                        placeholder="0.00"
                        value={entry.tds_amount}
                        onChange={(e) => updatePaymentEntry(idx, 'tds_amount', e.target.value)}
                        min="0"
                        step="0.01"
                        style={{ fontSize: 13, padding: '6px 8px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      {paymentEntries.length > 1 && (
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => removePaymentEntry(idx)}
                          style={{ color: 'var(--accent-red)', padding: 4 }}
                          title="Remove">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div style={{
                padding: 12,
                borderRadius: 8,
                background: 'var(--bg-tertiary, rgba(0,0,0,0.03))',
                marginBottom: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span>Total Received</span>
                  <span style={{ fontWeight: 600 }}>{formatCurrency(modalTotalReceived)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span>Total TDS</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent-amber)' }}>{formatCurrency(modalTotalTds)}</span>
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', fontSize: 14,
                  fontWeight: 700, paddingTop: 6, borderTop: '1px solid var(--border-color, #ddd)',
                  color: modalRemaining > 0.01 ? 'var(--accent-red)' : 'var(--accent-green, #2E5E4E)',
                }}>
                  <span>Remaining Balance</span>
                  <span>{formatCurrency(modalRemaining)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
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
                  {submittingPayment ? <><Loader2 size={16} className="spinner" style={{ borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white', width: 16, height: 16 }} /> Saving...</> : <><Check size={16} /> Mark as Paid</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewModal.open && previewModal.invoice && (
        <div className="modal-overlay" onClick={handleClosePreview}>
          <div className="modal-pdf" onClick={(e) => e.stopPropagation()}>
            <div className="modal-pdf-toolbar">
              <div className="modal-pdf-title">
                <FileText size={18} style={{ color: 'var(--accent-blue)' }} />
                <span>
                  Fee Memo&nbsp;
                  <strong>{previewModal.invoice.invoice_number}</strong>
                  &nbsp;—&nbsp;{previewModal.invoice.client_name}
                </span>
              </div>
              <div className="modal-pdf-actions">
                <button
                  className="btn btn-primary btn-sm"
                  style={{ gap: 6 }}
                  onClick={() => downloadPDF(
                    previewModal.invoice!.id,
                    previewModal.invoice!.invoice_number,
                    previewModal.invoice!.client_name,
                    previewModal.invoice!.date,
                  )}
                  disabled={previewModal.loading}
                  title="Download PDF"
                >
                  <FileDown size={15} /> Download
                </button>
                <button
                  className="btn-icon"
                  onClick={handleClosePreview}
                  title="Close preview"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="modal-pdf-body">
              {previewModal.loading && (
                <div className="modal-pdf-loading">
                  <div className="spinner" style={{ borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)', borderTopColor: '#fff', width: 36, height: 36 }} />
                  <span>Generating preview…</span>
                </div>
              )}
              {previewModal.blobUrl && (
                <iframe
                  src={previewModal.blobUrl}
                  title={`Preview – ${previewModal.invoice.invoice_number}`}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}