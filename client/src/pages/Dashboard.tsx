import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsPhone } from '../hooks/useMediaQuery';
import type { DashboardData, Invoice, Id } from '../api';
import { getDashboard, downloadPDF, updateInvoiceStatus, useDataVersion } from '../data';
import { invoiceLabel } from '../invoiceLabel';
import { useToast } from '../context/ToastContext';
import { Banknote, ClipboardList, Wallet, FileText, Edit2, CheckCircle, Download, Receipt } from 'lucide-react';

const defaultPreferences = {
  totalBilled: true,
  totalReceived: true,
  tds: true,
  outstanding: true,
  clients: true,
  totalInvoices: true,
  paid: true,
  unpaid: true,
  sent: true,
  drafts: true
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  const [preferences] = useState(() => {
    const saved = localStorage.getItem('dashboardPreferences');
    if (saved) {
      try {
        return { ...defaultPreferences, ...JSON.parse(saved) };
      } catch (e) {
        return defaultPreferences;
      }
    }
    return defaultPreferences;
  });

  const navigate = useNavigate();

  const isPhone = useIsPhone();
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

  // Re-read when data changes, including changes synced from other devices
  const dataVersion = useDataVersion();
  useEffect(() => { fetchData(); }, [fetchData, dataVersion]);

  const handleMarkPaid = async (id: Id) => {
    try {
      await updateInvoiceStatus(id, 'paid');
      addToast('Invoice marked as paid', 'success');
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };

  if (loading && !data) {
    return <div className="loading-center"><div className="spinner"></div></div>;
  }

  const stats = data?.stats;
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const [year, month, day] = dateStr.split('T')[0].split('-');
    if (year && month && day) return `${day}/${month}/${year}`;
    return dateStr;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your billing activity</p>
        </div>
        <div className="page-header-actions">
          <select
            className="form-select"
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            style={{ width: 'auto', minWidth: '170px', margin: 0, padding: '10px 36px 10px 12px' }}
            aria-label="Time period"
          >
            <option value="all">All Time</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Financial Year</option>
            <option value="custom">Custom Date Range</option>
          </select>
          {timeFilter === 'custom' && (
            <div className="date-range">
              <input
                type="date"
                className="form-input"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                aria-label="From date"
              />
              <span style={{ color: 'var(--text-secondary)' }}>to</span>
              <input
                type="date"
                className="form-input"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                aria-label="To date"
              />
            </div>
          )}
          <button className="btn btn-primary" onClick={() => navigate('/invoices/new')}>
            + New Invoice
          </button>
        </div>
      </div>

      {/* Stats Grid 1 */}
      {(preferences.totalBilled || preferences.totalReceived || preferences.tds || preferences.outstanding) && (
        <div className="stats-grid">
          {preferences.totalBilled && (
            <div className="stat-card blue">
              <div className="stat-icon"><Wallet size={28} /></div>
              <div className="stat-value">₹{stats?.total_billed?.toLocaleString('en-IN') || '0'}</div>
              <div className="stat-label">Total Billed</div>
            </div>
          )}
          {preferences.totalReceived && (
            <div className="stat-card green">
              <div className="stat-icon"><Banknote size={28} /></div>
              <div className="stat-value">₹{stats?.total_received?.toLocaleString('en-IN') || '0'}</div>
              <div className="stat-label">Total Received</div>
            </div>
          )}
          {preferences.tds && (
            <div className="stat-card amber">
              <div className="stat-icon"><Receipt size={28} /></div>
              <div className="stat-value">₹{stats?.total_tds?.toLocaleString('en-IN') || '0'}</div>
              <div className="stat-label">TDS Deducted</div>
            </div>
          )}
          {preferences.outstanding && (
            <div className="stat-card amber">
              <div className="stat-icon"><ClipboardList size={28} /></div>
              <div className="stat-value">₹{stats?.total_outstanding?.toLocaleString('en-IN') || '0'}</div>
              <div className="stat-label">Outstanding</div>
            </div>
          )}
        </div>
      )}

      {/* Stats Grid 2 */}
      {(preferences.clients || preferences.totalInvoices || preferences.paid || preferences.unpaid || preferences.sent || preferences.drafts) && (
        <div className="stats-grid" style={{ marginBottom: 32 }}>
          {preferences.clients && (
            <div className="stat-card green">
              <div className="stat-value">{data?.totalClients || 0}</div>
              <div className="stat-label">Clients</div>
            </div>
          )}
          {preferences.totalInvoices && (
            <div className="stat-card blue">
              <div className="stat-value">{stats?.total_invoices || 0}</div>
              <div className="stat-label">Total Invoices</div>
            </div>
          )}
          {preferences.paid && (
            <div className="stat-card green">
              <div className="stat-value">{stats?.paid_count || 0}</div>
              <div className="stat-label">Paid Invoices</div>
            </div>
          )}
          {preferences.unpaid && (
            <div className="stat-card red">
              <div className="stat-value">{stats?.unpaid_count || 0}</div>
              <div className="stat-label">Unpaid Invoices</div>
            </div>
          )}
          {preferences.sent && (
            <div className="stat-card blue">
              <div className="stat-value">{stats?.sent_count || 0}</div>
              <div className="stat-label">Sent</div>
            </div>
          )}
          {preferences.drafts && (
            <div className="stat-card amber">
              <div className="stat-value">{stats?.draft_count || 0}</div>
              <div className="stat-label">Drafts</div>
            </div>
          )}
        </div>
      )}

      {/* Recent Invoices */}
      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">Recent Invoices</h3>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/invoices')}>
            View All →
          </button>
        </div>
        {data?.recentInvoices && data.recentInvoices.length > 0 && isPhone ? (
          <div className="card-list">
            {data.recentInvoices.map((inv: Invoice) => (
              <div key={inv.id} className="list-card">
                <div className="list-card-main" onClick={() => navigate(`/invoices/${inv.id}/edit`)}>
                  <div>
                    <div className="list-card-title">{invoiceLabel(inv)}</div>
                    <div className="list-card-subtitle">{inv.client_name}</div>
                    <div className="list-card-meta">{formatDate(inv.date)}</div>
                  </div>
                  <div className="list-card-amount">
                    <strong>₹{inv.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    <span className={`badge ${inv.status}`}>{inv.status}</span>
                  </div>
                </div>
                <div className="list-card-actions">
                  <span className="spacer" />
                  <button className="btn-icon btn-icon-green" title="Download PDF" aria-label="Download PDF" onClick={() => downloadPDF(inv.id, inv.invoice_number, inv.client_name, inv.date)}><Download size={18} /></button>
                  {inv.status !== 'paid' && (
                    <button className="btn-icon btn-icon-amber" title="Mark Paid" aria-label="Mark paid" onClick={() => handleMarkPaid(inv.id)}><CheckCircle size={18} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : data?.recentInvoices && data.recentInvoices.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Client</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.recentInvoices.map((inv: Invoice) => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{invoiceLabel(inv)}</td>
                  <td>{inv.client_name}</td>
                  <td>{formatDate(inv.date)}</td>
                  <td style={{ fontWeight: 600 }}>₹{inv.total.toFixed(2)}</td>
                  <td><span className={`badge ${inv.status}`}>{inv.status}</span></td>
                  <td>
                    <div className="btn-group">
                      <button className="btn-icon btn-icon-blue" title="Edit" onClick={() => navigate(`/invoices/${inv.id}/edit`)}><Edit2 size={18} /></button>
                      <button className="btn-icon btn-icon-green" title="Download PDF" onClick={() => downloadPDF(inv.id, inv.invoice_number, inv.client_name, inv.date)}><Download size={18} /></button>
                      {inv.status !== 'paid' && (
                        <button className="btn-icon btn-icon-amber" title="Mark Paid" onClick={() => handleMarkPaid(inv.id)}><CheckCircle size={18} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon"><FileText size={48} /></div>
            <div className="empty-text">No invoices yet</div>
            <div className="empty-subtext">Create your first invoice to get started</div>
          </div>
        )}
      </div>
    </div>
  );
}