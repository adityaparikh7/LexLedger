import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  getInvoices, getInvoice, deleteInvoice, updateInvoiceStatus,
  downloadPDF, downloadExcel, sendInvoice, sendReminder,
  type Invoice, type Payment
} from '../api';
import { useToast } from '../context/ToastContext';
import { todayLocal } from '../dates';
import { formatDate, formatINR, plural, financialYearLabel } from '../format';
import {
  Pencil, FileText, FileSpreadsheet, Send, BellRing, Trash2, Search, X, Loader2, Check, Download, Eye, Ellipsis,
  Plus, CircleCheck, Undo2, Ban, Calendar,
} from 'lucide-react';
import { EmptyState, InvoiceCard, Loading, Modal, PageHeader, StatusBadge } from '../components/ui';
import ConfirmDialog from '../components/ConfirmDialog';
import PdfPreviewModal from '../components/PdfPreviewModal';

interface FormPayment {
  date: string;
  amount_received: string;
  tds_amount: string;
}

type StatusFilter = '' | Invoice['status'];
type SortKey = 'newest' | 'oldest' | 'amount' | 'balance';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'paid', label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' },
];

const MENU_WIDTH = 224;

const balanceOf = (inv: Invoice) => inv.total - (inv.amount_received || 0) - (inv.tds_amount || 0);
const isOpen = (inv: Invoice) => inv.status !== 'paid' && inv.status !== 'cancelled';

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [sort, setSort] = useState<SortKey>('newest');
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState<string>(location.state?.clientName || '');
  const navigate = useNavigate();
  const { addToast } = useToast();

  // Row overflow menu — positioned with `fixed` so the table's scroll container can't clip it
  const [menu, setMenu] = useState<{ invoice: Invoice; top?: number; bottom?: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Modals
  const [paymentModal, setPaymentModal] = useState<Invoice | null>(null);
  const [paymentEntries, setPaymentEntries] = useState<FormPayment[]>([]);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [toDelete, setToDelete] = useState<Invoice | null>(null);

  const fetchInvoices = useCallback(async () => {
    try {
      setInvoices(await getInvoices());
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);
  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    document.querySelector('.main-content')?.addEventListener('scroll', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      document.querySelector('.main-content')?.removeEventListener('scroll', close);
    };
  }, [menu]);

  // Flip the menu above its button when it would run off the bottom of the window
  useLayoutEffect(() => {
    if (!menu || menu.bottom !== undefined || !menuRef.current || menu.top === undefined) return;
    const h = menuRef.current.offsetHeight;
    if (menu.top + h > window.innerHeight - 8) {
      // top = button bottom + 6 and the button is 40px tall, so its top edge sits at top − 46
      setMenu(m => m && ({ ...m, top: undefined, bottom: window.innerHeight - (m.top! - 46) + 6 }));
    }
  }, [menu]);

  const openMenu = (inv: Invoice, button: HTMLElement) => {
    if (menu?.invoice.id === inv.id) { setMenu(null); return; }
    const r = button.getBoundingClientRect();
    setMenu({ invoice: inv, top: r.bottom + 6, left: Math.max(8, r.right - MENU_WIDTH) });
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteInvoice(toDelete.id);
      addToast(`Invoice ${toDelete.invoice_number} deleted`, 'success');
      fetchInvoices();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };

  const openPaymentModal = async (inv: Invoice) => {
    try {
      const fullInv = await getInvoice(inv.id);
      if (fullInv.payments && fullInv.payments.length > 0) {
        const entries = fullInv.payments.map(p => ({
          date: p.date,
          amount_received: String(p.amount_received),
          tds_amount: String(p.tds_amount)
        }));
        const balance = balanceOf(fullInv);
        if (balance > 0.01) {
          entries.push({ date: todayLocal(), amount_received: String(balance), tds_amount: '0' });
        }
        setPaymentEntries(entries);
      } else {
        setPaymentEntries([{ date: todayLocal(), amount_received: String(fullInv.total), tds_amount: '0' }]);
      }
      setPaymentModal(fullInv);
    } catch {
      addToast('Failed to load invoice details', 'error');
    }
  };

  const handleStatusChange = async (inv: Invoice, newStatus: Invoice['status']) => {
    if (newStatus === 'paid') return openPaymentModal(inv);
    try {
      await updateInvoiceStatus(inv.id, newStatus);
      addToast(newStatus === 'cancelled' ? `Invoice ${inv.invoice_number} cancelled` : `Invoice marked as ${newStatus}`, 'success');
      fetchInvoices();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };

  const addPaymentEntry = () => {
    setPaymentEntries([...paymentEntries, { date: todayLocal(), amount_received: '', tds_amount: '' }]);
  };

  const removePaymentEntry = (index: number) => {
    if (paymentEntries.length === 1) return;
    setPaymentEntries(paymentEntries.filter((_, i) => i !== index));
  };

  const updatePaymentEntry = (index: number, field: keyof FormPayment, value: string) => {
    const updated = [...paymentEntries];
    updated[index] = { ...updated[index], [field]: value };
    // Auto-calculate TDS as the remainder when the amount received changes
    if (field === 'amount_received' && paymentModal) {
      const received = parseFloat(value) || 0;
      const otherReceived = updated.reduce((sum, p, i) => i !== index ? sum + (parseFloat(p.amount_received) || 0) : sum, 0);
      const otherTds = updated.reduce((sum, p, i) => i !== index ? sum + (parseFloat(p.tds_amount) || 0) : sum, 0);
      const remaining = paymentModal.total - otherReceived - otherTds - received;
      updated[index].tds_amount = String(Math.max(0, remaining));
    }
    setPaymentEntries(updated);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModal) return;
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
      await updateInvoiceStatus(paymentModal.id, 'paid', payments);
      addToast('Invoice marked as paid', 'success');
      setPaymentModal(null);
      fetchInvoices();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleSend = async (inv: Invoice) => {
    try {
      const result = await sendInvoice(inv.id);
      if (result.autoAttached) {
        addToast('Invoice opened in your mail app with the PDF attached', 'success');
      } else if (result.triggerPdfDownload) {
        downloadPDF(inv.id, inv.invoice_number, inv.client_name, inv.date);
        addToast('Compose opened in your browser — the PDF is downloading for you to attach', 'info');
      } else {
        addToast('Mail app opened — attach the invoice PDF manually', 'info');
      }
      fetchInvoices();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleRemind = async (id: number) => {
    try {
      await sendReminder(id);
      addToast('Reminder opened in your mail app', 'success');
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };

  const term = searchTerm.trim().toLowerCase();
  const matchesSearch = (inv: Invoice) => !term ||
    inv.invoice_number.toLowerCase().includes(term) ||
    inv.client_name.toLowerCase().includes(term) ||
    (inv.case_name || '').toLowerCase().includes(term);

  const searched = invoices.filter(matchesSearch);
  const counts = searched.reduce<Record<string, number>>((acc, inv) => { acc[inv.status] = (acc[inv.status] || 0) + 1; return acc; }, {});
  const filtered = searched
    .filter(inv => !statusFilter || inv.status === statusFilter)
    .sort((a, b) => {
      if (sort === 'amount') return b.total - a.total;
      if (sort === 'balance') return balanceOf(b) - balanceOf(a);
      const byDate = a.date.localeCompare(b.date) || a.id - b.id;
      return sort === 'oldest' ? byDate : -byDate;
    });
  const outstanding = filtered.filter(isOpen).reduce((sum, inv) => sum + Math.max(0, balanceOf(inv)), 0);

  // Payment modal summary
  const modalTotalReceived = paymentEntries.reduce((sum, p) => sum + (parseFloat(p.amount_received) || 0), 0);
  const modalTotalTds = paymentEntries.reduce((sum, p) => sum + (parseFloat(p.tds_amount) || 0), 0);
  const modalRemaining = paymentModal ? paymentModal.total - modalTotalReceived - modalTotalTds : 0;

  if (loading) return <Loading />;

  const clearFilters = () => { setSearchTerm(''); setStatusFilter(''); };
  const menuInv = menu?.invoice;

  return (
    <div className="page">
      <PageHeader
        title="Invoices"
        subtitle={`${plural(invoices.length, 'invoice')} · FY ${financialYearLabel()}`}
        actions={
          <select className="input input-sm" value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label="Sort invoices" style={{ width: 190 }}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="amount">Highest amount</option>
            <option value="balance">Highest balance</option>
          </select>
        }
      />

      <div className="toolbar">
        <div className="input-wrap has-leading has-suffix search-field">
          <span className="leading-icon"><Search size={20} /></span>
          <input className="input input-sm" placeholder="Search invoices, clients or matters" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} aria-label="Search invoices" />
          {searchTerm && <button type="button" className="icon-btn clear-btn" onClick={() => setSearchTerm('')} aria-label="Clear search"><X size={18} /></button>}
        </div>
        <span className="toolbar-divider" />
        <div className="chip-row" role="group" aria-label="Filter by status">
          {FILTERS.filter(f => f.key !== 'cancelled' || counts.cancelled).map(f => (
            <button key={f.key} type="button" className={`chip${statusFilter === f.key ? ' active' : ''}`}
              aria-pressed={statusFilter === f.key} onClick={() => setStatusFilter(f.key)}>
              {f.label} <span className="count">{f.key ? counts[f.key] || 0 : searched.length}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="table-card list-card">
        {filtered.length > 0 ? (
          <>
            <div className="table-scroll hide-mobile">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Client &amp; matter</th>
                    <th>Date</th>
                    <th className="right">Amount</th>
                    <th className="right">Received</th>
                    <th className="right">Balance</th>
                    <th>Status</th>
                    <th className="actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inv => {
                    const balance = balanceOf(inv);
                    const paidSomething = (inv.amount_received || 0) > 0 || (inv.tds_amount || 0) > 0;
                    return (
                      <tr key={inv.id}>
                        <td><button type="button" className="invoice-link" onClick={() => navigate(`/invoices/${inv.id}/edit`)}>{inv.invoice_number}</button></td>
                        <td>
                          <div className="cell-stack">
                            <span className="cell-title">{inv.client_name}</span>
                            {inv.case_name && <span className="cell-sub">{inv.case_name}</span>}
                          </div>
                        </td>
                        <td className="nowrap text-secondary">{formatDate(inv.date)}</td>
                        <td className="right cell-num">{formatINR(inv.total)}</td>
                        <td className="right">
                          {paidSomething ? (
                            <div className="cell-stack right">
                              <span className="cell-num">{formatINR(inv.amount_received)}</span>
                              <span className="cell-sub nowrap">TDS {formatINR(inv.tds_amount, false)}</span>
                            </div>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td className={`right cell-num ${balance > 0.01 && isOpen(inv) && inv.status !== 'draft' ? 'text-accent' : 'text-muted'}`}>
                          {formatINR(Math.max(0, balance))}
                        </td>
                        <td><StatusBadge status={inv.status} /></td>
                        <td className="actions-col">
                          <div className="row-actions">
                            <button className="icon-btn" title="Preview PDF" aria-label={`Preview ${inv.invoice_number}`} onClick={() => setPreview(inv)}><Eye size={20} /></button>
                            <button className="icon-btn" title="Edit" aria-label={`Edit ${inv.invoice_number}`} onClick={() => navigate(`/invoices/${inv.id}/edit`)}><Pencil size={20} /></button>
                            <button className={`icon-btn${menu?.invoice.id === inv.id ? ' active' : ''}`} title="More actions"
                              aria-label={`More actions for ${inv.invoice_number}`} aria-haspopup="menu" aria-expanded={menu?.invoice.id === inv.id}
                              onMouseDown={e => e.stopPropagation()} onClick={e => openMenu(inv, e.currentTarget)}>
                              <Ellipsis size={20} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="invoice-cards show-mobile">
              {filtered.map(inv => (
                <InvoiceCard key={inv.id} invoice={inv} showBalance onOpen={() => navigate(`/invoices/${inv.id}/edit`)} />
              ))}
            </div>
            <div className="table-footer">
              <span className="grow small text-muted">
                {filtered.length === invoices.length ? `Showing all ${plural(invoices.length, 'invoice')}` : `Showing ${filtered.length} of ${plural(invoices.length, 'invoice')}`}
              </span>
              <span className="text-secondary">Total outstanding</span>
              <span className="cell-num text-accent">{formatINR(outstanding, false)}</span>
            </div>
          </>
        ) : invoices.length === 0 ? (
          <EmptyState icon={<FileText size={24} />} title="No invoices yet" text="Create your first invoice to get started."
            action={<Link to="/invoices/new" className="btn btn-primary"><Plus size={18} /> New invoice</Link>} />
        ) : (
          <EmptyState icon={<Search size={24} />}
            title={term ? `No invoices match “${searchTerm.trim()}”` : 'No invoices with this status'}
            text={`Check the spelling, or clear the ${term ? 'search' : 'filter'} to see all ${plural(invoices.length, 'invoice')}.`}
            action={<button type="button" className="btn btn-secondary" onClick={clearFilters}>{term ? 'Clear search' : 'Show all invoices'}</button>} />
        )}
      </section>

      {/* Row actions menu */}
      {menu && menuInv && (
        <div ref={menuRef} className="dropdown-menu" role="menu"
          style={{ position: 'fixed', top: menu.top ?? 'auto', bottom: menu.bottom ?? 'auto', left: menu.left, right: 'auto' }}
          onClick={() => setMenu(null)}>
          <button role="menuitem" className="dropdown-item" onClick={() => setPreview(menuInv)}><Eye size={18} /> Preview PDF</button>
          <button role="menuitem" className="dropdown-item" onClick={() => downloadPDF(menuInv.id, menuInv.invoice_number, menuInv.client_name, menuInv.date)}><Download size={18} /> Download PDF</button>
          <button role="menuitem" className="dropdown-item" onClick={() => downloadExcel(menuInv.id, menuInv.invoice_number)}><FileSpreadsheet size={18} /> Download Excel</button>
          <button role="menuitem" className="dropdown-item" onClick={() => handleSend(menuInv)}><Send size={18} /> Send by email</button>
          {(menuInv.status === 'sent' || menuInv.status === 'unpaid') && (
            <button role="menuitem" className="dropdown-item" onClick={() => handleRemind(menuInv.id)}><BellRing size={18} /> Send reminder</button>
          )}
          <div className="dropdown-divider" />
          {menuInv.status !== 'paid' && (
            <button role="menuitem" className="dropdown-item" onClick={() => handleStatusChange(menuInv, 'paid')}><CircleCheck size={18} /> Mark as paid</button>
          )}
          {menuInv.status !== 'sent' && menuInv.status !== 'cancelled' && (
            <button role="menuitem" className="dropdown-item" onClick={() => handleStatusChange(menuInv, 'sent')}><Send size={18} /> Mark as sent</button>
          )}
          {menuInv.status !== 'unpaid' && menuInv.status !== 'draft' && menuInv.status !== 'cancelled' && (
            <button role="menuitem" className="dropdown-item" onClick={() => handleStatusChange(menuInv, 'unpaid')}><Calendar size={18} /> Mark as unpaid</button>
          )}
          {menuInv.status !== 'draft' && (
            <button role="menuitem" className="dropdown-item" onClick={() => handleStatusChange(menuInv, 'draft')}><Undo2 size={18} /> Move back to draft</button>
          )}
          {menuInv.status !== 'cancelled' && (
            <button role="menuitem" className="dropdown-item" onClick={() => handleStatusChange(menuInv, 'cancelled')}><Ban size={18} /> Cancel invoice</button>
          )}
          <div className="dropdown-divider" />
          <button role="menuitem" className="dropdown-item danger" onClick={() => setToDelete(menuInv)}><Trash2 size={18} /> Delete invoice</button>
        </div>
      )}

      {/* Record payment */}
      {paymentModal && (
        <Modal onClose={() => setPaymentModal(null)} className="modal wide" labelledBy="payment-title">
          <div className="modal-header">
            <div className="modal-titles">
              <h2 className="modal-title" id="payment-title">Record payment</h2>
              <p className="modal-subtitle">Invoice {paymentModal.invoice_number} · Total {formatINR(paymentModal.total)}</p>
            </div>
            <button type="button" className="icon-btn" onClick={() => setPaymentModal(null)} aria-label="Close"><X size={20} /></button>
          </div>
          <form onSubmit={handlePaymentSubmit}>
            <div className="section-head">
              <h3 className="card-title">Payments received</h3>
              <button type="button" className="btn btn-secondary" onClick={addPaymentEntry}><Plus size={18} /> Add payment</button>
            </div>
            {paymentEntries.map((entry, idx) => (
              <div key={idx} className="payment-row">
                <div className="field">
                  <label className="field-label" htmlFor={`pay-date-${idx}`}>Date</label>
                  <input id={`pay-date-${idx}`} type="date" className="input" value={entry.date}
                    onChange={e => updatePaymentEntry(idx, 'date', e.target.value)} required />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={`pay-amt-${idx}`}>Amount received</label>
                  <div className="input-wrap has-prefix">
                    <span className="prefix">₹</span>
                    <input id={`pay-amt-${idx}`} type="number" className="input no-spin" placeholder="0.00" value={entry.amount_received}
                      onChange={e => updatePaymentEntry(idx, 'amount_received', e.target.value)} min="0" step="0.01" required />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={`pay-tds-${idx}`}>TDS withheld</label>
                  <div className="input-wrap has-prefix">
                    <span className="prefix">₹</span>
                    <input id={`pay-tds-${idx}`} type="number" className="input no-spin" placeholder="0.00" value={entry.tds_amount}
                      onChange={e => updatePaymentEntry(idx, 'tds_amount', e.target.value)} min="0" step="0.01" />
                  </div>
                </div>
                <button type="button" className="icon-btn" onClick={() => removePaymentEntry(idx)} disabled={paymentEntries.length === 1}
                  aria-label={`Remove payment ${idx + 1}`} title="Remove" style={{ marginBottom: 2 }}>
                  <X size={20} />
                </button>
              </div>
            ))}
            <div className="totals-box">
              <div className="totals-line"><span>Total received</span><span className="value">{formatINR(modalTotalReceived)}</span></div>
              <div className="totals-line"><span>Total TDS withheld</span><span className="value">{formatINR(modalTotalTds)}</span></div>
              <div className={`totals-line ${modalRemaining > 0.01 ? 'due' : 'strong'}`}>
                <span>Remaining balance</span><span className="value">{formatINR(modalRemaining)}</span>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPaymentModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submittingPayment}>
                {submittingPayment ? <Loader2 size={18} className="spin" /> : <Check size={18} />}
                {submittingPayment ? 'Saving…' : 'Mark as paid'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {preview && <PdfPreviewModal invoice={preview} onClose={() => setPreview(null)} />}

      {toDelete && (
        <ConfirmDialog
          title={`Delete invoice ${toDelete.invoice_number}?`}
          body={<>This permanently removes the invoice, its line items and any recorded payments for {toDelete.client_name}{toDelete.client_name.endsWith('.') ? '' : '.'} This can’t be undone.</>}
          confirmLabel="Delete invoice"
          cancelLabel="Keep invoice"
          onConfirm={handleDelete}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
