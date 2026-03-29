import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboard, type DashboardData, type Invoice, downloadPDF, updateInvoiceStatus } from '../api';
import { useToast } from '../context/ToastContext';
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { addToast } = useToast();
  const fetchData = useCallback(async () => {
    try {
      const result = await getDashboard();
      setData(result);
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);
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
  if (loading) {
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
        <button className="btn btn-primary" onClick={() => navigate('/invoices/new')}>
          + New Invoice
        </button>
      </div>
      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card blue">
          <div className="stat-icon">💰</div>
          <div className="stat-value">₹{stats?.total_paid?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</div>
          <div className="stat-label">Total Received</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-icon">📋</div>
          <div className="stat-value">₹{stats?.total_outstanding?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</div>
          <div className="stat-label">Outstanding</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon">⚠️</div>
          <div className="stat-value">{stats?.overdue_count || 0}</div>
          <div className="stat-label">Overdue</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon">👥</div>
          <div className="stat-value">{data?.totalClients || 0}</div>
          <div className="stat-label">Clients</div>
        </div>
      </div>
      {/* Status Summary */}
      <div className="stats-grid" style={{ marginBottom: 32 }}>
        <div className="stat-card blue" style={{ cursor: 'pointer' }} onClick={() => navigate('/invoices')}>
          <div className="stat-value">{stats?.total_invoices || 0}</div>
          <div className="stat-label">Total Invoices</div>
        </div>
        <div className="stat-card green">
          <div className="stat-value">{stats?.paid_count || 0}</div>
          <div className="stat-label">Paid</div>
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
                      <button className="btn-icon" title="Edit" onClick={() => navigate(`/invoices/${inv.id}/edit`)}>✏️</button>
                      <button className="btn-icon" title="Download PDF" onClick={() => downloadPDF(inv.id, inv.invoice_number)}>📥</button>
                      {inv.status !== 'paid' && (
                        <button className="btn-icon" title="Mark Paid" onClick={() => handleMarkPaid(inv.id)}>✅</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📄</div>
            <div className="empty-text">No invoices yet</div>
            <div className="empty-subtext">Create your first invoice to get started</div>
          </div>
        )}
      </div>
    </div>
  );
}