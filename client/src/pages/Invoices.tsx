import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getInvoices, deleteInvoice, updateInvoiceStatus,
  downloadPDF, downloadExcel, downloadExportExcel, sendInvoice, sendReminder,
  type Invoice, type Payment
} from '../api';
import { useToast } from '../context/ToastContext';

interface FormPayment {
  date: string;
  amount_received: string;
  tds_amount: string;
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const { addToast } = useToast();

  // Payment modal state
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; invoice: Invoice | null }>({ open: false, invoice: null });
  const [paymentEntries, setPaymentEntries] = useState<FormPayment[]>([]);
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Export modal state
  const [exportModal, setExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportPreset, setExportPreset] = useState<'current_fy' | 'previous_fy' | 'custom'>('current_fy');

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
      addToast('Invoice sent successfully!', 'success');
      if (result.previewUrl) {
        addToast(`Preview: ${result.previewUrl}`, 'info');
      }
      fetchInvoices();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };
  const handleRemind = async (id: number) => {
    try {
      const result = await sendReminder(id);
      addToast('Reminder sent!', 'success');
      if (result.previewUrl) {
        addToast(`Preview: ${result.previewUrl}`, 'info');
      }
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
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

  // Financial year helpers
  const getFYDates = (offset: number = 0): { start: string; end: string } => {
    const now = new Date();
    let startYear = now.getFullYear();
    if (now.getMonth() < 3) startYear -= 1; // Jan-Mar belongs to previous FY
    startYear += offset;
    const endYear = startYear + 1;
    return {
      start: `${startYear}-04-01`,
      end: `${endYear}-03-31`,
    };
  };

  const handleExportOpen = () => {
    setExportPreset('current_fy');
    const fy = getFYDates(0);
    setExportStartDate(fy.start);
    setExportEndDate(fy.end);
    setExportModal(true);
  };

  const handleExportPresetChange = (preset: 'current_fy' | 'previous_fy' | 'custom') => {
    setExportPreset(preset);
    if (preset === 'current_fy') {
      const fy = getFYDates(0);
      setExportStartDate(fy.start);
      setExportEndDate(fy.end);
    } else if (preset === 'previous_fy') {
      const fy = getFYDates(-1);
      setExportStartDate(fy.start);
      setExportEndDate(fy.end);
    }
    // 'custom' keeps current values
  };

  const handleExportDownload = async () => {
    if (!exportStartDate || !exportEndDate) {
      addToast('Please select both start and end dates', 'error');
      return;
    }
    if (exportStartDate > exportEndDate) {
      addToast('Start date must be before end date', 'error');
      return;
    }
    setExportLoading(true);
    try {
      await downloadExportExcel(exportStartDate, exportEndDate);
      addToast('Invoice records exported successfully!', 'success');
      setExportModal(false);
    } catch (err: unknown) {
      addToast((err as Error).message || 'Export failed', 'error');
    } finally {
      setExportLoading(false);
    }
  };

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
        <button
          className="btn btn-outline"
          onClick={handleExportOpen}
          style={{ marginLeft: 'auto', gap: 6 }}
          id="export-records-btn"
        >
          📊 Export Records
        </button>
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
                <th>Actions</th>
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
                );
              })}
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
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
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
                          ✕
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
                  {submittingPayment ? '⏳ Saving...' : '✅ Mark as Paid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Export Records Modal */}
      {exportModal && (
        <div className="modal-overlay" onClick={() => setExportModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">📊 Export Invoice Records</h3>
              <button
                className="btn-icon"
                onClick={() => setExportModal(false)}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              Download a complete Excel report of all invoices within the selected time period.
            </p>

            {/* Preset buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[
                { key: 'current_fy' as const, label: 'Current FY' },
                { key: 'previous_fy' as const, label: 'Previous FY' },
                { key: 'custom' as const, label: 'Custom Range' },
              ].map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  className={exportPreset === opt.key ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                  onClick={() => handleExportPresetChange(opt.key)}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Date range */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label className="form-label">Start Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={exportStartDate}
                  onChange={(e) => {
                    setExportStartDate(e.target.value);
                    setExportPreset('custom');
                  }}
                  id="export-start-date"
                />
              </div>
              <div>
                <label className="form-label">End Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={exportEndDate}
                  onChange={(e) => {
                    setExportEndDate(e.target.value);
                    setExportPreset('custom');
                  }}
                  id="export-end-date"
                />
              </div>
            </div>

            {/* Date range summary */}
            <div style={{
              padding: 12,
              borderRadius: 8,
              background: 'var(--bg-tertiary, rgba(0,0,0,0.03))',
              marginBottom: 20,
              fontSize: 13,
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span>📅</span>
              <span>
                {exportStartDate && exportEndDate
                  ? `${formatDate(exportStartDate)} — ${formatDate(exportEndDate)}`
                  : 'Select a date range'}
              </span>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setExportModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExportDownload}
                disabled={exportLoading || !exportStartDate || !exportEndDate}
                id="export-download-btn"
              >
                {exportLoading ? '⏳ Generating...' : '⬇️ Download Excel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}