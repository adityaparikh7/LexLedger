import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboard, type DashboardData, type Invoice, downloadPDF, updateInvoiceStatus  } from '../api';
import { useToast } from '../context/ToastContext';
import { Banknote, ClipboardList, Wallet, FileText, Edit2, CheckCircle, Download } from 'lucide-react';
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
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
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select 
            className="form-select" 
            value={timeFilter} 
            onChange={(e) => setTimeFilter(e.target.value)}
            style={{ minWidth: '170px', margin: 0, padding: '10px' }}
          >
            <option value="all">All Time</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Financial Year</option>
            <option value="custom">Custom Date Range</option>
          </select>
          {timeFilter === 'custom' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input 
                type="date" 
                className="form-input" 
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                style={{ padding: '8px 12px', margin: 0, minWidth: '130px' }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>to</span>
              <input 
                type="date" 
                className="form-input" 
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                style={{ padding: '8px 12px', margin: 0, minWidth: '130px' }}
              />
            </div>
          )}
          <button className="btn btn-primary" onClick={() => navigate('/invoices/new')}>
            + New Invoice
          </button>
        </div>
      </div>
      {/* Stats Grid */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card blue">
          <div className="stat-icon"><Wallet size={28} /></div>
          <div className="stat-value">₹{stats?.total_billed?.toLocaleString('en-IN') || '0'}</div>
          <div className="stat-label">Total Billed</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon"><Banknote size={28} /></div>
          <div className="stat-value">₹{stats?.total_paid?.toLocaleString('en-IN')}</div>
          <div className="stat-label">Total Received</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-icon"><ClipboardList size={28} /></div>
          <div className="stat-value">₹{stats?.total_outstanding?.toLocaleString('en-IN')}</div>
          <div className="stat-label">Outstanding</div>
        </div>
        
       
      </div>
      {/* Status Summary */}
      <div className="stats-grid" style={{ marginBottom: 32 }}>
        <div className="stat-card green">
          {/* <div className="stat-icon"><Users size={28} /></div> */}
          <div className="stat-value">{data?.totalClients || 0}</div>
          <div className="stat-label">Clients</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-value">{stats?.total_invoices || 0}</div>
          <div className="stat-label">Total Invoices</div>
        </div>
        <div className="stat-card green">
          <div className="stat-value">{stats?.paid_count || 0}</div>
          <div className="stat-label">Paid</div>
        </div>
        <div className="stat-card red">
          {/* <div className="stat-icon"><AlertTriangle size={28} /></div> */}
          <div className="stat-value">{stats?.unpaid_count || 0}</div>
          <div className="stat-label">Unpaid Invoices</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-value">{stats?.sent_count || 0}</div>
          <div className="stat-label">Sent</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-value">{stats?.draft_count || 0}</div>
          <div className="stat-label">Drafts</div>
        </div>
      </div>
      {/* Recent Invoices */}
      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">Recent Invoices</h3>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/invoices')}>
            View All →
          </button>
        </div>
        {data?.recentInvoices && data.recentInvoices.length > 0 ? (
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
                  <td style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{inv.invoice_number}</td>
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