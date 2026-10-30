import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ComposeRequest, Invoice, Payment, Id } from '../api';
import {
  getInvoices, getInvoice, deleteInvoice, updateInvoiceStatus,
  downloadPDF, downloadExcel, sendInvoice, sendReminder,
  fetchPDFPreviewUrl, fetchPDFFile, useDataVersion,
} from '../data';
import ShareMemoDialog from '../components/ShareMemoDialog';
import { invoiceLabel } from '../invoiceLabel';
import { canShareFiles, openCompose } from '../share';
import { useIsPhone } from '../hooks/useMediaQuery';
import { useToast } from '../context/ToastContext';
import { todayLocal } from '../dates';
import { Edit2, FileText, FileSpreadsheet, Send, Bell, Trash2, Search, X, Loader2, Check, FileDown, Eye, CircleEllipsis } from 'lucide-react';

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
  const isPhone = useIsPhone();

  // Overflow dropdown state
  const [openMenuId, setOpenMenuId] = useState<Id | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (openMenuId === null) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [openMenuId]);

  // Payment modal state
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; invoice: Invoice | null }>({ open: false, invoice: null });
  const [paymentEntries, setPaymentEntries] = useState<FormPayment[]>([]);
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Phone "send" flow: the fee memo PDF, ready for the share sheet
  const [shareMemo, setShareMemo] = useState<{ file: File; compose: ComposeRequest } | null>(null);

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
  // Re-read when data changes, including changes synced from other devices
  const dataVersion = useDataVersion();
  useEffect(() => { fetchInvoices(); }, [fetchInvoices, dataVersion]);
  const handleDelete = async (id: Id) => {
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
      try {
        const fullInv = await getInvoice(inv.id);
        setPaymentModal({ open: true, invoice: fullInv });
        
        if (fullInv.payments && fullInv.payments.length > 0) {
          const entries = fullInv.payments.map(p => ({
            date: p.date,
            amount_received: String(p.amount_received),
            tds_amount: String(p.tds_amount)
          }));
          
          const totalReceived = fullInv.payments.reduce((sum, p) => sum + (p.amount_received || 0), 0);
          const totalTds = fullInv.payments.reduce((sum, p) => sum + (p.tds_amount || 0), 0);
          const balance = fullInv.total - totalReceived - totalTds;
          
          if (balance > 0.01) {
            entries.push({
              date: todayLocal(),
              amount_received: String(balance),
              tds_amount: '0'
            });
          }
          setPaymentEntries(entries);
        } else {
          setPaymentEntries([{
            date: todayLocal(),
            amount_received: String(fullInv.total),
            tds_amount: '0',
          }]);
        }
      } catch (err: unknown) {
        addToast('Failed to load invoice details', 'error');
      }
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
      date: todayLocal(),
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

  const handleSend = async (id: Id) => {
    try {
      const result = await sendInvoice(id);
      if (result.compose && canShareFiles()) {
        // Phone: attach the PDF through the share sheet
        const inv = invoices.find(i => i.id === id);
        if (inv) setShareMemo({ file: await fetchPDFFile(inv.id, inv.invoice_number, inv.client_name, inv.date), compose: result.compose });
      } else if (result.compose) {
        // Cloud server: compose on this device and download the PDF to attach
        const inv = invoices.find(i => i.id === id);
        const inBrowser = openCompose(result.compose);
        if (inv) await downloadPDF(inv.id, inv.invoice_number, inv.client_name, inv.date);
        addToast(inBrowser
          ? 'Mail compose opened in a new tab — the PDF is downloading. Please attach it to the email.'
          : 'Mail app opened — the PDF is downloading. Please attach it to the email.', 'info');
      } else if (result.autoAttached) {
        addToast('Invoice opened in mail client with PDF attached!', 'success');
      } else if (result.triggerPdfDownload) {
        // For browser-based mail clients, auto-download the PDF
        const inv = invoices.find(i => i.id === id);
        if (inv) {
          downloadPDF(inv.id, inv.invoice_number, inv.client_name, inv.date);
        }
        addToast('Mail compose opened in browser — the PDF is downloading. Please attach it to the email.', 'info');
      } else {
        addToast('Mail client opened — please attach the invoice PDF manually', 'info');
      }
      fetchInvoices();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };
  const handleRemind = async (id: Id) => {
    try {
      const result = await sendReminder(id);
      if (result.compose) openCompose(result.compose);
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
    invoiceLabel(inv).toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.client_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Payment modal summary calculations
  const modalTotalReceived = paymentEntries.reduce((sum, p) => sum + (parseFloat(p.amount_received) || 0), 0);
  const modalTotalTds = paymentEntries.reduce((sum, p) => sum + (parseFloat(p.tds_amount) || 0), 0);
  const modalRemaining = paymentModal.invoice
    ? paymentModal.invoice.total - modalTotalReceived - modalTotalTds
    : 0;

  const renderStatusSelect = (inv: Invoice, style?: CSSProperties) => (
    <select
      className="form-select"
      value={inv.status}
      onChange={e => handleStatusChange(inv, e.target.value)}
      style={style}
      aria-label={`Status of invoice ${invoiceLabel(inv)}`}
    >
      <option value="draft">Draft</option>
      <option value="sent">Sent</option>
      <option value="paid">Paid</option>
      <option value="unpaid">Unpaid</option>
      <option value="cancelled">Cancelled</option>
    </select>
  );

  // Row actions, shared by the desktop table and the phone cards (where tapping the card edits)
  const renderActions = (inv: Invoice, inCard = false) => (
      <div className="btn-group">
        {/* Primary actions — always visible */}
        {!inCard && (
          <button className="btn-icon btn-icon-blue" title="Edit Invoice" onClick={() => navigate(`/invoices/${inv.id}/edit`)}>
            <Edit2 size={18} />
          </button>
        )}
        <button className="btn-icon" title="Preview PDF" style={{ color: 'var(--text-secondary)' }} onClick={() => handleOpenPreview(inv)}>
          <Eye size={18} />
        </button>
        <button className="btn-icon btn-icon-amber" title="Send via Mail" onClick={() => handleSend(inv.id)}>
          <Send size={18} />
        </button>

        {/* Overflow menu */}
        <div className="action-menu" ref={openMenuId === inv.id ? dropdownRef : undefined}>
          <button
            className="btn-icon"
            title="More actions"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => setOpenMenuId(openMenuId === inv.id ? null : inv.id)}
          >
            <CircleEllipsis size={18} />
          </button>
          {openMenuId === inv.id && (
            <div className="dropdown-menu">
              <button
                className="dropdown-item"
                onClick={() => { downloadPDF(inv.id, inv.invoice_number, inv.client_name, inv.date); setOpenMenuId(null); }}
              >
                <FileDown size={15} /> Download PDF
              </button>
              <button
                className="dropdown-item"
                onClick={() => { downloadExcel(inv.id, inv.invoice_number); setOpenMenuId(null); }}
              >
                <FileSpreadsheet size={15} /> Download Excel
              </button>
              {(inv.status === 'sent' || inv.status === 'unpaid') && (
                <button
                  className="dropdown-item amber"
                  onClick={() => { handleRemind(inv.id); setOpenMenuId(null); }}
                >
                  <Bell size={15} /> Send Reminder
                </button>
              )}
              <div className="dropdown-divider" />
              <button
                className="dropdown-item danger"
                onClick={() => { handleDelete(inv.id); setOpenMenuId(null); }}
              >
                <Trash2 size={15} /> Delete Invoice
              </button>
            </div>
          )}
        </div>
      </div>
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
        <div className="search-field">
          <Search size={16} />
          <input
            className="form-input"
            type="search"
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
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
      <div className={`table-container${isPhone ? ' has-cards' : ''}`}>
        {filtered.length > 0 && !isPhone ? (
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
                      {invoiceLabel(inv)}
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
                      {renderStatusSelect(inv, { width: 'auto', minWidth: 100, padding: '4px 28px 4px 10px', fontSize: 12 })}
                    </td>
                    <td className={`sticky-right${openMenuId === inv.id ? ' menu-open' : ''}`}>
                      {renderActions(inv)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : filtered.length > 0 ? (
          <div className="card-list">
            {filtered.map(inv => {
              const balance = inv.total - (inv.amount_received || 0) - (inv.tds_amount || 0);
              return (
                <div key={inv.id} className="list-card">
                  <div className="list-card-main" onClick={() => navigate(`/invoices/${inv.id}/edit`)}>
                    <div>
                      <div className="list-card-title">{invoiceLabel(inv)}</div>
                      <div className="list-card-subtitle">{inv.client_name}</div>
                      <div className="list-card-meta">{formatDate(inv.date)}{inv.case_name ? ` · ${inv.case_name}` : ''}</div>
                    </div>
                    <div className="list-card-amount">
                      <strong>{formatCurrency(inv.total)}</strong>
                      {(inv.amount_received || inv.tds_amount) && balance > 0.01 ? <span className="due">{formatCurrency(balance)} due</span> : null}
                    </div>
                  </div>
                  <div className={`list-card-actions${openMenuId === inv.id ? ' menu-open' : ''}`}>
                    {renderStatusSelect(inv)}
                    <span className="spacer" />
                    {renderActions(inv, true)}
                  </div>
                </div>
              );
            })}
          </div>
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
              Invoice <strong>{invoiceLabel(paymentModal.invoice)}</strong> — Total: <strong>{formatCurrency(paymentModal.invoice.total)}</strong>
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
                  <div key={idx} className="payment-row">
                    <div>
                      <label>Date</label>
                      <input
                        type="date"
                        className="form-input"
                        value={entry.date}
                        onChange={(e) => updatePaymentEntry(idx, 'date', e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label>Amount Received (₹)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        className="form-input"
                        placeholder="0.00"
                        value={entry.amount_received}
                        onChange={(e) => updatePaymentEntry(idx, 'amount_received', e.target.value)}
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>
                    <div>
                      <label>TDS Amount (₹)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        className="form-input"
                        placeholder="0.00"
                        value={entry.tds_amount}
                        onChange={(e) => updatePaymentEntry(idx, 'tds_amount', e.target.value)}
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div className="payment-row-remove">
                      {paymentEntries.length > 1 && (
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => removePaymentEntry(idx)}
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

      {shareMemo && (
        <ShareMemoDialog file={shareMemo.file} compose={shareMemo.compose} onClose={() => setShareMemo(null)} />
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
                  <strong>{invoiceLabel(previewModal.invoice)}</strong>
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
                <>
                  <iframe
                    src={previewModal.blobUrl}
                    title={`Preview – ${invoiceLabel(previewModal.invoice)}`}
                  />
                  {/* Phone browsers can't display a PDF inside the page */}
                  <div className="pdf-mobile-fallback">
                    <FileText size={40} style={{ color: 'var(--accent-blue)' }} />
                    <span>The fee memo is ready.</span>
                    <a className="btn btn-primary" href={previewModal.blobUrl} target="_blank" rel="noopener">
                      <Eye size={16} /> Open PDF
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}