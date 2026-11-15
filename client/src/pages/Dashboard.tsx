import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getDashboard, type DashboardData, downloadPDF, updateInvoiceStatus } from '../api';
import { useToast } from '../context/ToastContext';
import { Banknote, ClipboardList, Wallet, FileText, Pencil, CircleCheck, Download, Receipt, Users, ArrowRight, SlidersHorizontal } from 'lucide-react';
import { formatDate, formatINR, financialYearLabel, plural } from '../format';
import { CardHeader, EmptyState, InvoiceCard, Loading, PageHeader, StatusBadge } from '../components/ui';
import { loadDashboardPreferences } from '../dashboardPrefs';

const PERIOD_LABELS: Record<string, string> = {
  all: 'All time',
  month: 'This month',
  quarter: 'This quarter',
  year: `FY ${financialYearLabel()}`,
};

function KpiCard({ label, shortLabel, value, caption, icon, accent }: {
  label: string; shortLabel?: string; value: string; caption: string; icon: ReactNode; accent?: boolean;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-top">
        <div className={`icon-chip lg${accent ? ' accent' : ''}`}>{icon}</div>
        <span className="kpi-label">
          {shortLabel ? <><span className="hide-mobile">{label}</span><span className="show-mobile">{shortLabel}</span></> : label}
        </span>
      </div>
      <div className="kpi-body">
        <span className="kpi-value">{value}</span>
        <span className="kpi-caption">{caption}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [preferences] = useState(loadDashboardPreferences);

  const navigate = useNavigate();
  const { addToast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getDashboard(timeFilter, customStartDate, customEndDate);
      setData(result);
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, timeFilter, customStartDate, customEndDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMarkPaid = async (id: number) => {
    try {
      await updateInvoiceStatus(id, 'paid');
      addToast('Invoice marked as paid', 'success');
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };

  if (loading && !data) return <Loading />;

  const stats = data?.stats;
  // The server's outstanding total includes drafts, so count them too
  const openCount = (stats?.sent_count || 0) + (stats?.unpaid_count || 0) + (stats?.draft_count || 0);
  const periodLabel = timeFilter === 'custom'
    ? (customStartDate && customEndDate ? `${formatDate(customStartDate)} – ${formatDate(customEndDate)}` : 'Custom range')
    : PERIOD_LABELS[timeFilter];

  const segments = [
    ['draft', 'Draft', stats?.draft_count || 0],
    ['sent', 'Sent', stats?.sent_count || 0],
    ['unpaid', 'Unpaid', stats?.unpaid_count || 0],
    ['paid', 'Paid', stats?.paid_count || 0],
  ] as const;
  const statusTotal = segments.reduce((sum, s) => sum + s[2], 0);

  const countCards = ([
    ['clients', 'Clients', data?.totalClients || 0, null, '/clients'],
    ['totalInvoices', 'Total invoices', stats?.total_invoices || 0, null, '/invoices'],
    ['paid', 'Paid', stats?.paid_count || 0, 'paid', '/invoices'],
    ['unpaid', 'Unpaid', stats?.unpaid_count || 0, 'unpaid', '/invoices'],
    ['sent', 'Sent', stats?.sent_count || 0, 'sent', '/invoices'],
    ['drafts', 'Drafts', stats?.draft_count || 0, 'draft', '/invoices'],
  ] as const).filter(([key]) => preferences[key]);
  const showKpis = preferences.totalBilled || preferences.totalReceived || preferences.tds || preferences.outstanding;
  const nothingShown = !showKpis && countCards.length === 0 && !preferences.statusOverview && !preferences.recentInvoices;

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        subtitle={`Overview of your billing activity · ${periodLabel}`}
        actions={<>
          <select className="input input-sm" value={timeFilter} onChange={e => setTimeFilter(e.target.value)}
            aria-label="Period" style={{ width: 220 }}>
            <option value="all">All time</option>
            <option value="month">This month</option>
            <option value="quarter">This quarter</option>
            <option value="year">This financial year</option>
            <option value="custom">Custom date range</option>
          </select>
          {timeFilter === 'custom' && <>
            <input type="date" className="input input-sm" value={customStartDate} aria-label="Start date"
              onChange={e => setCustomStartDate(e.target.value)} style={{ width: 160 }} />
            <span className="text-muted hide-mobile">to</span>
            <input type="date" className="input input-sm" value={customEndDate} aria-label="End date"
              onChange={e => setCustomEndDate(e.target.value)} style={{ width: 160 }} />
          </>}
        </>}
      />

      {showKpis && (
        <div className="kpi-grid">
          {preferences.totalBilled && (
            <KpiCard label="Total billed" shortLabel="Billed" value={formatINR(stats?.total_billed, false)} icon={<Wallet size={20} />}
              caption={plural(stats?.total_invoices || 0, 'invoice')} />
          )}
          {preferences.totalReceived && (
            <KpiCard label="Total received" shortLabel="Received" value={formatINR(stats?.total_received, false)} icon={<Banknote size={20} />}
              caption={`${plural(stats?.paid_count || 0, 'invoice')} fully paid`} />
          )}
          {preferences.tds && (
            <KpiCard label="TDS deducted" shortLabel="TDS" value={formatINR(stats?.total_tds, false)} icon={<Receipt size={20} />}
              caption="Withheld at source by clients" />
          )}
          {preferences.outstanding && (
            <KpiCard label="Outstanding" value={formatINR(stats?.total_outstanding, false)} icon={<ClipboardList size={20} />} accent
              caption={`Across ${plural(openCount, 'open invoice')}`} />
          )}
        </div>
      )}

      {countCards.length > 0 && (
        <div className="count-grid">
          {countCards.map(([key, label, value, status, to]) => (
            <Link key={key} to={to} className="count-card">
              <span className="count-label">
                {status ? <span className={`legend-dot dot-${status}`} /> : key === 'clients' ? <Users size={18} /> : <FileText size={18} />}
                {label}
              </span>
              <span className="count-value">{value}</span>
            </Link>
          ))}
        </div>
      )}

      {preferences.statusOverview && (
        <section className="card">
          <CardHeader
            title="Invoice status"
            subtitle={plural(stats?.total_invoices || 0, 'invoice')}
            right={
              <Link to="/clients" className="legend-item" style={{ textDecoration: 'none', fontWeight: 500 }}>
                <Users size={20} className="text-muted" /> {plural(data?.totalClients || 0, 'client')}
              </Link>
            }
          />
          <div className="status-bar" aria-hidden="true">
            {statusTotal === 0
              ? <span className="empty" />
              : segments.filter(s => s[2] > 0).map(([key, , count]) => <span key={key} className={`seg-${key}`} style={{ flexGrow: count }} />)}
          </div>
          <div className="legend">
            {segments.map(([key, label, count]) => (
              <span key={key} className="legend-item">
                <span className={`legend-dot dot-${key}`} /> {label} <strong>{count}</strong>
              </span>
            ))}
          </div>
        </section>
      )}

      {nothingShown && (
        <section className="card">
          <EmptyState icon={<SlidersHorizontal size={24} />} title="All dashboard cards are hidden"
            text="Choose the cards you want to see in Settings → Dashboard layout."
            action={<Link to="/settings" className="btn btn-secondary">Open settings</Link>} />
        </section>
      )}

      {preferences.recentInvoices && (
        <section className="table-card list-card">
          <div className="table-card-header">
            <h2 className="card-title">Recent invoices</h2>
            <Link to="/invoices" className="btn-link btn" style={{ gap: 6 }}>View all <ArrowRight size={18} /></Link>
          </div>
          {data?.recentInvoices && data.recentInvoices.length > 0 ? (
            <>
              <div className="table-scroll hide-mobile">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Client &amp; matter</th>
                      <th>Date</th>
                      <th className="right">Amount</th>
                      <th>Status</th>
                      <th className="actions-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentInvoices.map(inv => (
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
                        <td><StatusBadge status={inv.status} /></td>
                        <td className="actions-col">
                          <div className="row-actions">
                            <button className="icon-btn" title="Edit" aria-label={`Edit ${inv.invoice_number}`} onClick={() => navigate(`/invoices/${inv.id}/edit`)}><Pencil size={20} /></button>
                            <button className="icon-btn" title="Download PDF" aria-label={`Download PDF of ${inv.invoice_number}`} onClick={() => downloadPDF(inv.id, inv.invoice_number, inv.client_name, inv.date)}><Download size={20} /></button>
                            {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                              <button className="icon-btn" title="Mark as paid" aria-label={`Mark ${inv.invoice_number} as paid`} onClick={() => handleMarkPaid(inv.id)}><CircleCheck size={20} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="invoice-cards show-mobile">
                {data.recentInvoices.slice(0, 5).map(inv => (
                  <InvoiceCard key={inv.id} invoice={inv} onOpen={() => navigate(`/invoices/${inv.id}/edit`)} />
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon={<FileText size={24} />} title="No invoices yet" text="Create your first invoice to get started."
              action={<Link to="/invoices/new" className="btn btn-primary">Create invoice</Link>} />
          )}
        </section>
      )}
    </div>
  );
}
