import { useEffect, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import type { Invoice } from '../api';
import { formatDate, formatINR, statusLabel } from '../format';

export function StatusBadge({ status }: { status: Invoice['status'] }) {
  return <span className={`badge ${status}`}>{statusLabel(status)}</span>;
}

export function Loading() {
  return (
    <div className="loading-center" role="status">
      <Loader2 size={28} className="spin" />
      <span className="visually-hidden">Loading…</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back, badge }: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-titles">
        {back}
        <div className="page-title-row">
          <h1 className="page-title">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon, right }: {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="card-header">
      {icon && <div className="icon-chip">{icon}</div>}
      <div className="card-titles">
        <h2 className="card-title">{title}</h2>
        {subtitle && <p className="card-subtitle">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: {
  icon: ReactNode;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="icon-chip xl">{icon}</div>
      <h3 className="card-title">{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/** Overlay + dialog shell: closes on Escape and on a click outside the dialog. */
export function Modal({ onClose, className = '', labelledBy, children }: {
  onClose: () => void;
  className?: string;
  labelledBy?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={className || 'modal'} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}

/** Invoice summary card used in place of table rows on phones. */
export function InvoiceCard({ invoice, showBalance, onOpen }: {
  invoice: Invoice;
  showBalance?: boolean;
  onOpen: () => void;
}) {
  const balance = invoice.total - (invoice.amount_received || 0) - (invoice.tds_amount || 0);
  return (
    <button type="button" className="invoice-card" onClick={onOpen}>
      <div className="invoice-card-row">
        <span className="number">{invoice.invoice_number}</span>
        <StatusBadge status={invoice.status} />
      </div>
      <div className="cell-stack">
        <span className="client">{invoice.client_name}</span>
        {invoice.case_name && <span className="cell-sub">{invoice.case_name}</span>}
      </div>
      <div className="invoice-card-row">
        <span className="text-secondary">{formatDate(invoice.date)}</span>
        <span className="cell-num">{formatINR(invoice.total)}</span>
      </div>
      {showBalance && balance > 0.01 && invoice.status !== 'draft' && invoice.status !== 'cancelled' && (
        <div className="invoice-card-row">
          <span className="small text-muted">Balance due</span>
          <span className="cell-num text-accent">{formatINR(balance)}</span>
        </div>
      )}
    </button>
  );
}
