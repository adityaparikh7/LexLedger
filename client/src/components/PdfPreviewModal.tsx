import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { downloadPDF, fetchPDFPreviewUrl, type Invoice } from '../api';
import { useToast } from '../context/ToastContext';
import { Modal } from './ui';

type PreviewInvoice = Pick<Invoice, 'id' | 'invoice_number' | 'client_name' | 'date'>;

/** Inline preview of an invoice's fee memo (the saved version; no copy is stored). */
export default function PdfPreviewModal({ invoice, onClose }: { invoice: PreviewInvoice; onClose: () => void }) {
  const { addToast } = useToast();
  const [url, setUrl] = useState<string | null>(null);
  // Parents pass inline callbacks; keep the latest without re-running the fetch effect.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    let revoked = false;
    let blobUrl: string | null = null;
    fetchPDFPreviewUrl(invoice.id)
      .then(({ url }) => {
        if (revoked) { URL.revokeObjectURL(url); return; }
        blobUrl = url;
        setUrl(url);
      })
      .catch((err: Error) => { addToast(err.message, 'error'); onCloseRef.current(); });
    return () => { revoked = true; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [invoice.id, addToast]);

  const download = useCallback(
    () => downloadPDF(invoice.id, invoice.invoice_number, invoice.client_name, invoice.date),
    [invoice],
  );

  return (
    <Modal onClose={onClose} className="modal-pdf" labelledBy="pdf-title">
      <div className="modal-pdf-toolbar">
        <div className="modal-pdf-title">
          <strong id="pdf-title">Fee memo {invoice.invoice_number}</strong>
          <span className="small text-muted">{invoice.client_name}</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={download} disabled={!url}>
          <Download size={18} /> Download PDF
        </button>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close preview"><X size={20} /></button>
      </div>
      <div className="modal-pdf-body">
        {url
          ? <iframe src={url} title={`Preview of ${invoice.invoice_number}`} />
          : <div className="modal-pdf-loading"><Loader2 size={32} className="spin" /><span>Generating preview…</span></div>}
      </div>
    </Modal>
  );
}
