import { useState, useEffect } from 'react';
import { getClients, downloadExportExcel, downloadBulkPDFs, type Client } from '../api';
import { useToast } from '../context/ToastContext';
import { Loader2, Calendar, Download, Users, FileArchive, FileSpreadsheet } from 'lucide-react';

export default function Export() {
  const { addToast } = useToast();

  const [exportTab, setExportTab] = useState<'excel' | 'pdf'>('excel');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportPreset, setExportPreset] = useState<'current_fy' | 'previous_fy' | 'custom'>('current_fy');

  // Bulk PDF export state
  const [clients, setClients] = useState<Client[]>([]);
  const [pdfClientId, setPdfClientId] = useState<number | ''>('');
  const [pdfStatusFilter, setPdfStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [pdfLoading, setPdfLoading] = useState(false);

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

  useEffect(() => {
    // Set initial dates
    const fy = getFYDates(0);
    setExportStartDate(fy.start);
    setExportEndDate(fy.end);

    // Fetch clients
    const fetchClientsData = async () => {
      try {
        const data = await getClients();
        setClients(data);
      } catch (err: unknown) {
        addToast((err as Error).message, 'error');
      }
    };
    fetchClientsData();
  }, [addToast]);

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
    } catch (err: unknown) {
      addToast((err as Error).message || 'Export failed', 'error');
    } finally {
      setExportLoading(false);
    }
  };

  const handleBulkPdfDownload = async () => {
    if (!pdfClientId) {
      addToast('Please select a client', 'error');
      return;
    }
    setPdfLoading(true);
    try {
      const client = clients.find(c => c.id === pdfClientId);
      await downloadBulkPDFs(pdfClientId, pdfStatusFilter, client?.name || 'Client');
      addToast('PDF export downloaded successfully!', 'success');
    } catch (err: unknown) {
      addToast((err as Error).message || 'PDF export failed', 'error');
    } finally {
      setPdfLoading(false);
    }
  };

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
          <h1 className="page-title">Export Records</h1>
          <p className="page-subtitle">Download invoice records and bulk PDFs</p>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="card">
          {/* Tab switcher */}
          <div style={{
            display: 'flex',
            gap: 4,
            marginBottom: 24,
            padding: 4,
            borderRadius: 10,
            background: 'var(--bg-tertiary, rgba(0,0,0,0.06))',
          }}>
            <button
              type="button"
              onClick={() => setExportTab('excel')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                transition: 'all 0.2s ease',
                background: exportTab === 'excel' ? 'var(--accent-blue)' : 'transparent',
                color: exportTab === 'excel' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              <FileSpreadsheet size={15} /> Excel Records
            </button>
            <button
              type="button"
              onClick={() => setExportTab('pdf')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                transition: 'all 0.2s ease',
                background: exportTab === 'pdf' ? 'var(--accent-blue)' : 'transparent',
                color: exportTab === 'pdf' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              <FileArchive size={15} /> Bulk PDF Export
            </button>
          </div>

          {/* Excel Records Tab */}
          {exportTab === 'excel' && (
            <>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
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
                marginBottom: 24,
                fontSize: 13,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <Calendar size={16} />
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
                  className="btn btn-primary"
                  onClick={handleExportDownload}
                  disabled={exportLoading || !exportStartDate || !exportEndDate}
                  id="export-download-btn"
                >
                  {exportLoading ? <><Loader2 size={16} className="spinner" style={{ borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white', width: 16, height: 16 }} /> Generating...</> : <><Download size={16} /> Download Excel</>}
                </button>
              </div>
            </>
          )}

          {/* Bulk PDF Export Tab */}
          {exportTab === 'pdf' && (
            <>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
                Export all invoices for a client as individual PDFs, bundled in a ZIP archive.
              </p>

              {/* Client selector */}
              <div style={{ marginBottom: 20 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Users size={14} /> Select Client
                </label>
                <select
                  className="form-select"
                  value={pdfClientId}
                  onChange={(e) => setPdfClientId(e.target.value ? Number(e.target.value) : '')}
                  style={{ width: '100%' }}
                  id="pdf-export-client"
                >
                  <option value="">— Choose a client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Invoice status filter */}
              <div style={{ marginBottom: 20 }}>
                <label className="form-label" style={{ marginBottom: 8 }}>Invoice Status</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { key: 'all' as const, label: 'All Invoices' },
                    { key: 'paid' as const, label: 'Paid Only' },
                    { key: 'unpaid' as const, label: 'Unpaid Only' },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      className={pdfStatusFilter === opt.key ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                      onClick={() => setPdfStatusFilter(opt.key)}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary info */}
              <div style={{
                padding: 12,
                borderRadius: 8,
                background: 'var(--bg-tertiary, rgba(0,0,0,0.03))',
                marginBottom: 24,
                fontSize: 13,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <FileArchive size={16} />
                <span>
                  {pdfClientId
                    ? `${clients.find(c => c.id === pdfClientId)?.name} — ${pdfStatusFilter === 'all' ? 'All' : pdfStatusFilter.charAt(0).toUpperCase() + pdfStatusFilter.slice(1)} invoices → ZIP download`
                    : 'Select a client to export their invoices'}
                </span>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleBulkPdfDownload}
                  disabled={pdfLoading || !pdfClientId}
                  id="pdf-export-download-btn"
                >
                  {pdfLoading ? <><Loader2 size={16} className="spinner" style={{ borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white', width: 16, height: 16 }} /> Generating PDFs...</> : <><Download size={16} /> Download ZIP</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
