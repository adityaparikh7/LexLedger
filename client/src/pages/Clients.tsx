import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClients, getInvoices, deleteClient, type Client, type Invoice } from '../api';
import { useToast } from '../context/ToastContext';
import { Search, Pencil, Trash2, Users, Plus, X } from 'lucide-react';
import { formatINR, initials, plural } from '../format';
import { EmptyState, Loading, PageHeader } from '../components/ui';
import ClientModal from '../components/ClientModal';
import ConfirmDialog from '../components/ConfirmDialog';

interface ClientTotals { count: number; billed: number; outstanding: number }

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ client: Client | null } | null>(null);
  const [toDelete, setToDelete] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { addToast } = useToast();
  const navigate = useNavigate();

  const fetchClients = useCallback(async () => {
    try {
      const [clientList, invoiceList] = await Promise.all([getClients(), getInvoices()]);
      setClients(clientList);
      setInvoices(invoiceList);
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);
  useEffect(() => { fetchClients(); }, [fetchClients]);

  const totals = useMemo(() => {
    const map = new Map<number, ClientTotals>();
    for (const inv of invoices) {
      const t = map.get(inv.client_id) || { count: 0, billed: 0, outstanding: 0 };
      t.count += 1;
      if (inv.status !== 'cancelled') t.billed += inv.total;
      if (inv.status !== 'paid' && inv.status !== 'cancelled') {
        t.outstanding += Math.max(0, inv.total - (inv.amount_received || 0) - (inv.tds_amount || 0));
      }
      map.set(inv.client_id, t);
    }
    return map;
  }, [invoices]);

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteClient(toDelete.id);
      addToast(`${toDelete.name} deleted`, 'success');
      fetchClients();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };

  const term = searchTerm.trim().toLowerCase();
  const filtered = clients.filter(c =>
    !term ||
    c.name.toLowerCase().includes(term) ||
    (c.email || '').toLowerCase().includes(term) ||
    (c.phone || '').toLowerCase().includes(term)
  );

  if (loading) return <Loading />;

  return (
    <div className="page">
      <PageHeader
        title="Clients"
        subtitle={plural(clients.length, 'client')}
        actions={<button className="btn btn-secondary" onClick={() => setModal({ client: null })}><Plus size={18} /> Add client</button>}
      />

      <div className="toolbar">
        <div className="input-wrap has-leading has-suffix search-field">
          <span className="leading-icon"><Search size={20} /></span>
          <input className="input input-sm" placeholder="Search clients" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} aria-label="Search clients" />
          {searchTerm && <button type="button" className="icon-btn clear-btn" onClick={() => setSearchTerm('')} aria-label="Clear search"><X size={18} /></button>}
        </div>
      </div>

      <section className="table-card">
        {filtered.length > 0 ? (
          <div className="table-scroll">
            <table className="data-table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th className="right">Invoices</th>
                  <th className="right">Billed</th>
                  <th className="right">Outstanding</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(client => {
                  const t = totals.get(client.id) || { count: 0, billed: 0, outstanding: 0 };
                  return (
                    <tr key={client.id}>
                      <td>
                        <div className="client-cell">
                          <span className="avatar soft">{initials(client.name)}</span>
                          <div className="cell-stack" style={{ minWidth: 0 }}>
                            <button type="button" className="invoice-link" style={{ color: 'var(--text-primary)', textAlign: 'left', whiteSpace: 'normal' }}
                              onClick={() => navigate('/invoices', { state: { clientName: client.name } })}
                              title={`View invoices for ${client.name}`}>
                              {client.name}
                            </button>
                            {client.address && <span className="cell-sub">{client.address}</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <span>{client.email || <span className="text-muted">No email</span>}</span>
                          {client.phone && <span className="cell-sub">{client.phone}</span>}
                        </div>
                      </td>
                      <td className="right cell-num">{t.count}</td>
                      <td className="right cell-num">{formatINR(t.billed, false)}</td>
                      <td className={`right cell-num ${t.outstanding > 0.01 ? 'text-accent' : 'text-muted'}`}>{formatINR(t.outstanding, false)}</td>
                      <td className="actions-col">
                        <div className="row-actions">
                          <button className="icon-btn" title="Edit" aria-label={`Edit ${client.name}`} onClick={() => setModal({ client })}><Pencil size={20} /></button>
                          <button className="icon-btn danger" aria-label={`Delete ${client.name}`}
                            title={t.count ? 'Clients with invoices can’t be deleted' : 'Delete'}
                            disabled={t.count > 0} onClick={() => setToDelete(client)}>
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : clients.length === 0 ? (
          <EmptyState icon={<Users size={24} />} title="No clients yet" text="Add your first client to start creating invoices."
            action={<button className="btn btn-primary" onClick={() => setModal({ client: null })}><Plus size={18} /> Add client</button>} />
        ) : (
          <EmptyState icon={<Search size={24} />} title={`No clients match “${searchTerm.trim()}”`}
            text={`Check the spelling, or clear the search to see all ${plural(clients.length, 'client')}.`}
            action={<button className="btn btn-secondary" onClick={() => setSearchTerm('')}>Clear search</button>} />
        )}
      </section>

      {modal && (
        <ClientModal client={modal.client} onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchClients(); }} />
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Delete ${toDelete.name}?`}
          body="This permanently removes the client and their contact details. This can’t be undone."
          confirmLabel="Delete client"
          cancelLabel="Keep client"
          onConfirm={handleDelete}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
