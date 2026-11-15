import { useState, useEffect } from 'react';
import { getClients, getInvoices, downloadExportExcel, downloadBulkPDFs, type Client, type Invoice } from '../api';
import { useToast } from '../context/ToastContext';
import { Loader2, Download, FileArchive, FileSpreadsheet, CircleCheck, Info } from 'lucide-react';
import { formatDate, formatINR, plural } from '../format';
import { PageHeader } from '../components/ui';

type ExportPreset = 'current_fy' | 'previous_fy' | 'all_time' | 'custom';
type PdfStatus = 'all' | 'paid' | 'unpaid';

const PRESETS: { key: ExportPreset; label: string }[] = [
  { key: 'current_fy', label: 'Current FY' },
  { key: 'previous_fy', label: 'Previous FY' },
  { key: 'all_time', label: 'All time' },
  { key: 'custom', label: 'Custom range' },
];

const PDF_STATUSES: { key: PdfStatus; label: string }[] = [
  { key: 'all', label: 'All invoices' },
  { key: 'paid', label: 'Paid only' },
  { key: 'unpaid', label: 'Unpaid only' },
];

// Financial year (April–March) boundaries, `offset` years from the current one
const getFYDates = (offset: number = 0): { start: string; end: string } => {
  const now = new Date();
  let startYear = now.getFullYear();
  if (now.getMonth() < 3) startYear -= 1; // Jan–Mar belongs to the previous FY
  startYear += offset;
  return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
};

export default function Export() {
  const { addToast } = useToast();

  const [exportTab, setExportTab] = useState<'excel' | 'pdf'>('excel');
  const [exportStartDate, setExportStartDate] = useState(() => getFYDates(0).start);
  const [exportEndDate, setExportEndDate] = useState(() => getFYDates(0).end);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportPreset, setExportPreset] = useState<ExportPreset>('current_fy');
  const [excelClientId, setExcelClientId] = useState<number | ''>('');

  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);

  const [pdfClientId, setPdfClientId] = useState<number | ''>('');
  const [pdfStatusFilter, setPdfStatusFilter] = useState<PdfStatus>('all');
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    Promise.all([getClients(), getInvoices()])
      .then(([c, i]) => { setClients(c); setInvoices(i); })
      .catch((err: Error) => addToast(err.message, 'error'));
  }, [addToast]);

  const handleExportPresetChange = (preset: ExportPreset) => {
    setExportPreset(preset);
    if (preset === 'current_fy' || preset === 'previous_fy') {
      const fy = getFYDates(preset === 'current_fy' ? 0 : -1);
      setExportStartDate(fy.start);
      setExportEndDate(fy.end);
    } else if (preset === 'all_time') {
      setExportStartDate('');
      setExportEndDate('');
    }
    // 'custom' keeps the current dates
  };

  const isAllTime = exportPreset === 'all_time';
  const excelClient = clients.find(c => c.id === excelClientId);
  const pdfClient = clients.find(c => c.id === pdfClientId);
  const rangeValid = isAllTime || (!!exportStartDate && !!exportEndDate && exportStartDate <= exportEndDate);

  const excelMatches = invoices?.filter(inv =>
    (!excelClient || inv.client_id === excelClient.id) &&
    (isAllTime || (inv.date >= exportStartDate && inv.date <= exportEndDate))
  ) || [];
  const excelBilled = excelMatches.reduce((sum, inv) => sum + inv.total, 0);
  const pdfMatches = invoices?.filter(inv =>
    inv.client_id === pdfClientId && (pdfStatusFilter === 'all' || inv.status === pdfStatusFilter)
  ) || [];

  const handleExportDownload = async () => {
    if (!isAllTime) {
      if (!exportStartDate || !exportEndDate) {
        addToast('Please select both start and end dates', 'error');
        return;
      }
      if (exportStartDate > exportEndDate) {
        addToast('Start date must be before end date', 'error');
        return;
      }
    }
    setExportLoading(true);
    try {
      await downloadExportExcel({
        startDate: isAllTime ? undefined : exportStartDate,
        endDate: isAllTime ? undefined : exportEndDate,
        client: excelClient ? { id: excelClient.id, name: excelClient.name } : undefined,
      });
      addToast(excelClient ? `Invoice records for ${excelClient.name} exported` : 'Invoice records exported', 'success');
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
      await downloadBulkPDFs(pdfClientId, pdfStatusFilter, pdfClient?.name || 'Client');
      addToast('PDF export downloaded', 'success');
    } catch (err: unknown) {
      addToast((err as Error).message || 'PDF export failed', 'error');
    } finally {
      setPdfLoading(false);
    }
  };

  const excelSummary = !rangeValid
    ? 'Choose a start date on or before the end date'
    : invoices === null
      ? `${excelClient ? excelClient.name : 'All clients'} · ${isAllTime ? 'All time' : `${formatDate(exportStartDate)} – ${formatDate(exportEndDate)}`}`
      : excelMatches.length === 0
        ? 'No invoices in this period — the sheet will be empty'
        : `${plural(excelMatches.length, 'invoice')} · ${formatINR(excelBilled, false)} billed will be included`;

  const pdfSummary = !pdfClient
    ? 'Select a client to export their invoices'
    : invoices !== null && pdfMatches.length === 0
      ? `${pdfClient.name} has no ${pdfStatusFilter === 'all' ? '' : `${pdfStatusFilter} `}invoices to export`
      : `${invoices === null ? 'Invoices' : plural(pdfMatches.length, 'invoice')} for ${pdfClient.name} will be zipped into one download`;
  const pdfEmpty = !!pdfClient && invoices !== null && pdfMatches.length === 0;

  return (
    <div className="page">
      <PageHeader title="Export records" subtitle="Download invoice data as Excel, or bundle invoice PDFs" />

      <section className="card flush narrow-col">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={exportTab === 'excel'} className={`tab${exportTab === 'excel' ? ' active' : ''}`} onClick={() => setExportTab('excel')}>
            <FileSpreadsheet size={18} /> Excel records
          </button>
          <button type="button" role="tab" aria-selected={exportTab === 'pdf'} className={`tab${exportTab === 'pdf' ? ' active' : ''}`} onClick={() => setExportTab('pdf')}>
            <FileArchive size={18} /> Bulk PDF export
          </button>
        </div>

        {exportTab === 'excel' ? (
          <div className="card-body" role="tabpanel">
            <p className="text-secondary">Download a complete Excel report of the invoices in the period you choose, for all clients or for one.</p>
            <div className="field" style={{ maxWidth: 456 }}>
              <label className="field-label" htmlFor="export-client">Client</label>
              <select id="export-client" className="input" value={excelClientId}
                onChange={e => setExcelClientId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">All clients</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <span className="field-label">Period</span>
              <div className="chip-row" role="group" aria-label="Period">
                {PRESETS.map(p => (
                  <button key={p.key} type="button" className={`chip${exportPreset === p.key ? ' active' : ''}`}
                    aria-pressed={exportPreset === p.key} onClick={() => handleExportPresetChange(p.key)}>{p.label}</button>
                ))}
              </div>
            </div>
            {!isAllTime && (
              <div className="form-grid cols-2" style={{ maxWidth: 456 }}>
                <div className="field">
                  <label className="field-label" htmlFor="export-start-date">Start date</label>
                  <input id="export-start-date" type="date" className="input" value={exportStartDate}
                    onChange={e => { setExportStartDate(e.target.value); setExportPreset('custom'); }} />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="export-end-date">End date</label>
                  <input id="export-end-date" type="date" className="input" value={exportEndDate}
                    onChange={e => { setExportEndDate(e.target.value); setExportPreset('custom'); }} />
                </div>
              </div>
            )}
            <div className="info-banner" role="status">
              {rangeValid ? <CircleCheck size={20} /> : <Info size={20} />}
              <span>{excelSummary}</span>
            </div>
            <div className="end-row">
              <button type="button" className="btn btn-primary" id="export-download-btn" onClick={handleExportDownload}
                disabled={exportLoading || !rangeValid}>
                {exportLoading ? <Loader2 size={18} className="spin" /> : <Download size={18} />}
                {exportLoading ? 'Generating…' : 'Download Excel'}
              </button>
            </div>
          </div>
        ) : (
          <div className="card-body" role="tabpanel">
            <p className="text-secondary">Export a client’s invoices as individual PDFs, bundled in a ZIP archive.</p>
            <div className="field" style={{ maxWidth: 456 }}>
              <label className="field-label" htmlFor="pdf-export-client">Client</label>
              <select id="pdf-export-client" className="input" value={pdfClientId}
                onChange={e => setPdfClientId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Choose a client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <span className="field-label">Invoice status</span>
              <div className="chip-row" role="group" aria-label="Invoice status">
                {PDF_STATUSES.map(s => (
                  <button key={s.key} type="button" className={`chip${pdfStatusFilter === s.key ? ' active' : ''}`}
                    aria-pressed={pdfStatusFilter === s.key} onClick={() => setPdfStatusFilter(s.key)}>{s.label}</button>
                ))}
              </div>
            </div>
            <div className="info-banner" role="status">
              {pdfClient && !pdfEmpty ? <CircleCheck size={20} /> : <Info size={20} />}
              <span>{pdfSummary}</span>
            </div>
            <div className="end-row">
              <button type="button" className="btn btn-primary" id="pdf-export-download-btn" onClick={handleBulkPdfDownload}
                disabled={pdfLoading || !pdfClientId || pdfEmpty}>
                {pdfLoading ? <Loader2 size={18} className="spin" /> : <Download size={18} />}
                {pdfLoading ? 'Generating PDFs…' : 'Download ZIP'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
