import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  getClients, getInvoice, createInvoice, updateInvoice, updateInvoiceStatus,
  type Client, type Invoice, type LineItem, type Payment
} from '../api';
import { useToast } from '../context/ToastContext';
import { todayLocal } from '../dates';
import { formatINR } from '../format';
import { ArrowLeft, X, Loader2, Plus, Eye } from 'lucide-react';
import { CardHeader, Loading, PageHeader, StatusBadge } from '../components/ui';
import ClientModal from '../components/ClientModal';
import PdfPreviewModal from '../components/PdfPreviewModal';

interface FormLineItem {
  description: string;
  hours: string;
  rate: string;
}
interface FormPayment {
  date: string;
  amount_received: string;
  tds_amount: string;
}

const PARTY1_TYPES = ['None', 'Plaintiff', 'Appellant', 'Applicant', 'Petitioner', 'Claimant'];
const PARTY2_TYPES = ['None', 'Defendant', 'Respondent'];

function PartyFields({ id, label, types, type, setType, details, setDetails }: {
  id: string;
  label: string;
  types: string[];
  type: string;
  setType: (v: string) => void;
  details: string;
  setDetails: (v: string) => void;
}) {
  const isCustom = !types.includes(type);
  return (
    <div className="party-col">
      <div className="field">
        <label className="field-label" htmlFor={`${id}-type`}>{label}</label>
        <div className="party-type">
          <select id={`${id}-type`} className="input" value={isCustom ? 'Custom' : type}
            onChange={e => setType(e.target.value === 'Custom' ? '' : e.target.value)}>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
            <option value="Custom">Custom…</option>
          </select>
          {isCustom && (
            <input className="input" placeholder="Custom type" aria-label={`${label} custom type`} value={type}
              onChange={e => setType(e.target.value)} />
          )}
        </div>
      </div>
      {type !== 'None' && (
        <div className="field">
          <label className="field-label" htmlFor={`${id}-details`}>{type || 'Party'} details</label>
          <textarea id={`${id}-details`} className="input" rows={2} value={details} onChange={e => setDetails(e.target.value)}
            placeholder={`Name(s) and details of the ${(type || 'party').toLowerCase()}`} />
        </div>
      )}
    </div>
  );
}

export default function InvoiceForm() {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [datePaid, setDatePaid] = useState('');
  const [notes, setNotes] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [caseName, setCaseName] = useState('');
  const [caseParty1Type, setCaseParty1Type] = useState('Plaintiff');
  const [casePlaintiff, setCasePlaintiff] = useState('');
  const [caseParty2Type, setCaseParty2Type] = useState('Defendant');
  const [caseDefendant, setCaseDefendant] = useState('');
  const [lineItems, setLineItems] = useState<FormLineItem[]>([
    { description: '', hours: '', rate: '' }
  ]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [payments, setPayments] = useState<FormPayment[]>([]);
  const [savedInvoice, setSavedInvoice] = useState<Invoice | null>(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const clientList = await getClients();
        setClients(clientList);
        if (isEditing) {
          const invoice = await getInvoice(Number(id));
          setSavedInvoice(invoice);
          setClientId(String(invoice.client_id));
          setDate(invoice.date);
          setDatePaid(invoice.date_paid || '');
          setNotes(invoice.notes || '');
          setTaxRate(String(invoice.tax_rate));
          setInvoiceNumber(invoice.invoice_number);
          setCaseName(invoice.case_name || '');
          setCaseParty1Type(invoice.case_party1_type || 'None');
          setCasePlaintiff(invoice.case_plaintiff || '');
          setCaseParty2Type(invoice.case_party2_type || 'None');
          setCaseDefendant(invoice.case_defendant || '');
          if (invoice.line_items && invoice.line_items.length > 0) {
            setLineItems(invoice.line_items.map((li: LineItem) => ({
              description: li.description,
              hours: String(li.hours || ''),
              rate: String(li.rate || ''),
            })));
          }
          if (invoice.payments && invoice.payments.length > 0) {
            setPayments(invoice.payments.map((p: Payment) => ({
              date: p.date || '',
              amount_received: String(p.amount_received || ''),
              tds_amount: String(p.tds_amount || ''),
            })));
          }
        }
      } catch (err: unknown) {
        addToast((err as Error).message, 'error');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id, addToast, isEditing]);

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', hours: '', rate: '' }]);
  };
  const removeLineItem = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };
  const updateLineItem = (index: number, field: keyof FormLineItem, value: string) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };
  const calculateAmount = (item: FormLineItem): number => {
    const hours = parseFloat(item.hours) || 0;
    const rate = parseFloat(item.rate) || 0;
    if (hours > 0) return hours * rate;
    return rate; // No hours: the rate is a flat fee
  };
  const subtotal = lineItems.reduce((sum, item) => sum + calculateAmount(item), 0);
  const taxAmount = subtotal * (parseFloat(taxRate) || 0) / 100;
  const total = subtotal + taxAmount;

  const totalReceived = payments.reduce((sum, p) => sum + (parseFloat(p.amount_received) || 0), 0);
  const totalTds = payments.reduce((sum, p) => sum + (parseFloat(p.tds_amount) || 0), 0);
  const remainingBalance = total - totalReceived - totalTds;

  const addPayment = () => {
    setPayments([...payments, { date: todayLocal(), amount_received: '', tds_amount: '' }]);
  };
  const removePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };
  const updatePayment = (index: number, field: keyof FormPayment, value: string) => {
    const updated = [...payments];
    updated[index] = { ...updated[index], [field]: value };
    // Auto-calculate TDS as the remainder when the amount received changes
    if (field === 'amount_received') {
      const received = parseFloat(value) || 0;
      const otherReceived = updated.reduce((sum, p, i) => i !== index ? sum + (parseFloat(p.amount_received) || 0) : sum, 0);
      const otherTds = updated.reduce((sum, p, i) => i !== index ? sum + (parseFloat(p.tds_amount) || 0) : sum, 0);
      const remaining = total - otherReceived - otherTds - received;
      updated[index].tds_amount = String(Math.max(0, remaining));
    }
    setPayments(updated);
  };

  const handleClientSaved = async (client: Client) => {
    setShowClientModal(false);
    try {
      setClients(await getClients());
    } catch {
      setClients(prev => [...prev, client]);
    }
    setClientId(String(client.id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      addToast('Please select a client', 'error');
      return;
    }
    const validItems = lineItems.filter(li => li.description.trim());
    if (validItems.length === 0) {
      addToast('Please add at least one service', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        client_id: Number(clientId),
        invoice_number: isEditing ? invoiceNumber : undefined,
        date,
        date_paid: datePaid || null,
        notes: notes || null,
        case_name: caseName || null,
        case_party1_type: caseParty1Type === 'None' ? null : (caseParty1Type || null),
        case_plaintiff: caseParty1Type === 'None' ? null : (casePlaintiff || null),
        case_party2_type: caseParty2Type === 'None' ? null : (caseParty2Type || null),
        case_defendant: caseParty2Type === 'None' ? null : (caseDefendant || null),
        tax_rate: parseFloat(taxRate) || 0,
        line_items: validItems.map(li => ({
          description: li.description,
          hours: parseFloat(li.hours) || 0,
          rate: parseFloat(li.rate) || 0,
          amount: calculateAmount(li),
        })),
        payments: payments
          .filter(p => parseFloat(p.amount_received) > 0 || parseFloat(p.tds_amount) > 0)
          .map(p => ({
            date: p.date,
            amount_received: parseFloat(p.amount_received) || 0,
            tds_amount: parseFloat(p.tds_amount) || 0,
          })),
      };
      if (isEditing) {
        await updateInvoice(Number(id), payload);
        if (remainingBalance <= 0.01 && (totalReceived > 0 || totalTds > 0)) {
          await updateInvoiceStatus(Number(id), 'paid');
        }
        addToast('Invoice updated', 'success');
      } else {
        const result = await createInvoice(payload);
        if (remainingBalance <= 0.01 && (totalReceived > 0 || totalTds > 0)) {
          await updateInvoiceStatus(result.id, 'paid');
        }
        addToast(`Invoice ${result.invoice_number} created`, 'success');
      }
      navigate('/invoices');
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  const clientName = clients.find(c => String(c.id) === clientId)?.name;
  const hasPayments = payments.length > 0;

  return (
    <div className="page">
      <PageHeader
        back={<Link to="/invoices" className="back-link"><ArrowLeft size={20} /> Back to invoices</Link>}
        title={isEditing ? 'Edit invoice' : 'New invoice'}
        badge={savedInvoice && <StatusBadge status={savedInvoice.status} />}
        subtitle={isEditing
          ? `Invoice ${savedInvoice?.invoice_number || invoiceNumber}${clientName ? ` · ${clientName}` : ''}`
          : 'The invoice number is assigned when you save'}
      />

      <form className="form-layout" onSubmit={handleSubmit}>
        <div className="form-column">
          <section className="card">
            <CardHeader title="Client & dates" />
            <div className={`client-dates${isEditing ? ' with-number' : ''}`}>
              {isEditing && (
                <div className="field">
                  <label className="field-label" htmlFor="inv-number">Invoice number</label>
                  <input id="inv-number" className="input" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} required />
                </div>
              )}
              <div className="field">
                <label className="field-label" htmlFor="inv-client">Client *</label>
                <select id="inv-client" className="input" value={clientId} onChange={e => setClientId(e.target.value)} required>
                  <option value="">Select a client…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" className="btn btn-link" style={{ alignSelf: 'flex-start' }} onClick={() => setShowClientModal(true)}>
                  + Add a new client
                </button>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="inv-date">Invoice date *</label>
                <input id="inv-date" type="date" className="input" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="inv-date-paid">Date paid</label>
                <input id="inv-date-paid" type="date" className="input" value={datePaid} onChange={e => setDatePaid(e.target.value)} />
              </div>
            </div>
          </section>

          <section className="card">
            <CardHeader title="Case details" subtitle="Appears on the invoice memo" />
            <div className="field">
              <label className="field-label" htmlFor="inv-case">Case name / title</label>
              <input id="inv-case" className="input" placeholder="e.g. Commercial Suit No. 214 of 2026" value={caseName} onChange={e => setCaseName(e.target.value)} />
            </div>
            <div className="party-grid">
              <PartyFields id="party1" label="First party" types={PARTY1_TYPES} type={caseParty1Type} setType={setCaseParty1Type}
                details={casePlaintiff} setDetails={setCasePlaintiff} />
              <PartyFields id="party2" label="Second party" types={PARTY2_TYPES} type={caseParty2Type} setType={setCaseParty2Type}
                details={caseDefendant} setDetails={setCaseDefendant} />
            </div>
          </section>

          <section className="card">
            <CardHeader title="Services performed" subtitle="Leave hours empty to charge a fixed fee"
              right={<button type="button" className="btn btn-secondary" onClick={addLineItem}><Plus size={18} /> Add service</button>} />
            <div className="line-items">
              <div className="line-grid line-head" aria-hidden="true">
                <span>Description</span><span>Hours</span><span>Rate</span><span className="right">Amount</span><span />
              </div>
              {lineItems.map((item, idx) => (
                <div key={idx} className="line-grid">
                  <div className="line-desc">
                    <label className="field-label line-label" htmlFor={`li-desc-${idx}`}>Service {idx + 1}</label>
                    <input id={`li-desc-${idx}`} className="input" placeholder="Service description" value={item.description}
                      onChange={e => updateLineItem(idx, 'description', e.target.value)} required aria-label={`Service ${idx + 1} description`} />
                  </div>
                  <div>
                    <label className="field-label line-label" htmlFor={`li-hours-${idx}`}>Hours</label>
                    <input id={`li-hours-${idx}`} type="number" className="input no-spin" placeholder="—" value={item.hours}
                      onChange={e => updateLineItem(idx, 'hours', e.target.value)} min="0" step="0.5" aria-label={`Service ${idx + 1} hours`} />
                  </div>
                  <div>
                    <label className="field-label line-label" htmlFor={`li-rate-${idx}`}>Rate</label>
                    <div className="input-wrap has-prefix">
                      <span className="prefix">₹</span>
                      <input id={`li-rate-${idx}`} type="number" className="input no-spin" placeholder="0" value={item.rate}
                        onChange={e => updateLineItem(idx, 'rate', e.target.value)} min="0" step="0.01" required aria-label={`Service ${idx + 1} rate`} />
                    </div>
                  </div>
                  <div className="line-amount">
                    <span className="field-label line-label">Amount</span>
                    <span className="cell-num">{formatINR(calculateAmount(item))}</span>
                  </div>
                  <button type="button" className="icon-btn" onClick={() => removeLineItem(idx)} disabled={lineItems.length === 1}
                    title="Remove service" aria-label={`Remove service ${idx + 1}`}>
                    <X size={20} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {isEditing && (
            <section className="card">
              <CardHeader title="Payments" subtitle="Record each receipt with the TDS the client withheld"
                right={<button type="button" className="btn btn-secondary" onClick={addPayment}><Plus size={18} /> Add payment</button>} />
              {hasPayments ? payments.map((entry, idx) => (
                <div key={idx} className="payment-row plain">
                  <div className="field">
                    <label className="field-label" htmlFor={`p-date-${idx}`}>Date</label>
                    <input id={`p-date-${idx}`} type="date" className="input" value={entry.date} onChange={e => updatePayment(idx, 'date', e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor={`p-amt-${idx}`}>Amount received</label>
                    <div className="input-wrap has-prefix">
                      <span className="prefix">₹</span>
                      <input id={`p-amt-${idx}`} type="number" className="input no-spin" placeholder="0.00" value={entry.amount_received}
                        onChange={e => updatePayment(idx, 'amount_received', e.target.value)} min="0" step="0.01" />
                    </div>
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor={`p-tds-${idx}`}>TDS withheld</label>
                    <div className="input-wrap has-prefix">
                      <span className="prefix">₹</span>
                      <input id={`p-tds-${idx}`} type="number" className="input no-spin" placeholder="0.00" value={entry.tds_amount}
                        onChange={e => updatePayment(idx, 'tds_amount', e.target.value)} min="0" step="0.01" />
                    </div>
                  </div>
                  <button type="button" className="icon-btn" onClick={() => removePayment(idx)} title="Remove payment"
                    aria-label={`Remove payment ${idx + 1}`} style={{ marginBottom: 2 }}>
                    <X size={20} />
                  </button>
                </div>
              )) : (
                <p className="text-muted">No payments recorded yet. Use “Add payment” when the client pays.</p>
              )}
            </section>
          )}

          <section className="card">
            <CardHeader title="Notes / terms" />
            <textarea className="input" rows={3} aria-label="Notes or terms" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Payment terms, notes or special instructions…" />
          </section>
        </div>

        <aside className="card summary-card" aria-label="Invoice summary">
          <CardHeader title="Summary" />
          <div className="summary-line"><span>Subtotal</span><span className="value">{formatINR(subtotal)}</span></div>
          <div className="summary-line">
            <span>Tax</span>
            <div className="input-wrap tax-input">
              <input type="number" className="input no-spin" value={taxRate} onChange={e => setTaxRate(e.target.value)}
                min="0" max="100" step="0.5" aria-label="Tax rate in percent" />
              <span className="suffix">%</span>
            </div>
            <span className="value" style={{ minWidth: 88, textAlign: 'right' }}>{formatINR(taxAmount)}</span>
          </div>
          <div className="summary-divider" />
          <div className="summary-line total"><span>Total</span><span className="value">{formatINR(total)}</span></div>
          {isEditing && hasPayments && <>
            <div className="summary-line"><span>Received + TDS</span><span className="value">{formatINR(totalReceived + totalTds)}</span></div>
            <div className={`summary-line ${remainingBalance > 0.01 ? 'due' : 'settled'}`}>
              <span>{remainingBalance > 0.01 ? 'Balance due' : 'Fully paid'}</span>
              <span className="value">{formatINR(Math.max(0, remainingBalance))}</span>
            </div>
          </>}
          <div className="summary-actions">
            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={saving}>
              {saving && <Loader2 size={18} className="spin" />}
              {saving ? 'Saving…' : isEditing ? 'Update invoice' : 'Create invoice'}
            </button>
            {isEditing && savedInvoice && (
              <button type="button" className="btn btn-secondary btn-block" onClick={() => setShowPreview(true)} title="Shows the last saved version">
                <Eye size={18} /> Preview PDF
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-block" onClick={() => navigate('/invoices')}>Cancel</button>
          </div>
        </aside>
      </form>

      {showClientModal && <ClientModal onClose={() => setShowClientModal(false)} onSaved={handleClientSaved} />}
      {showPreview && savedInvoice && <PdfPreviewModal invoice={savedInvoice} onClose={() => setShowPreview(false)} />}
    </div>
  );
}
