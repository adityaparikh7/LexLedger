import { useState, useEffect, useCallback } from 'react';
import {
  getClients, createClient, updateClient, deleteClient,
  type Client
} from '../api';
import { useToast } from '../context/ToastContext';
import { Search, Edit2, Trash2, Users, X, Save, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { addToast } = useToast();
  const navigate = useNavigate();
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const fetchClients = useCallback(async () => {
    try {
      const data = await getClients();
      setClients(data);
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);
  useEffect(() => { fetchClients(); }, [fetchClients]);
  const openAddModal = () => {
    setEditingClient(null);
    setName('');
    setEmail('');
    setPhone('');
    setAddress('');
    setShowModal(true);
  };
  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setName(client.name);
    setEmail(client.email || '');
    setPhone(client.phone || '');
    setAddress(client.address || '');
    setShowModal(true);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingClient) {
        await updateClient(editingClient.id, { name, email, phone, address });
        addToast('Client updated!', 'success');
      } else {
        await createClient({ name, email, phone, address });
        addToast('Client added!', 'success');
      }
      setShowModal(false);
      fetchClients();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };
  const handleDelete = async (id: number) => {
    if (!confirm('Delete this client? This cannot be undone.')) return;
    try {
      await deleteClient(id);
      addToast('Client deleted', 'success');
      fetchClients();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };
  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  if (loading) {
    return <div className="loading-center"><div className="spinner"></div></div>;
  }
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="page-subtitle">{clients.length} clients</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          + Add Client
        </button>
      </div>
      {/* Search */}
      <div className="filter-bar" style={{ marginBottom: 24 }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-muted)' }} />
          <input
            className="form-input"
            placeholder="Search clients..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: 300, paddingLeft: 36 }}
          />
        </div>
      </div>
      {/* Client table */}
      <div className="table-container">
        {filtered.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(client => (
                <tr key={client.id}>
                  <td 
                    style={{ fontWeight: 600, color: 'var(--accent-blue)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 4 }}
                    onClick={() => navigate('/invoices', { state: { clientName: client.name } })}
                    title={`View invoices for ${client.name}`}
                  >
                    {client.name}
                  </td>
                  <td>{client.email || '—'}</td>
                  <td>{client.phone || '—'}</td>
                  <td>{client.address || '—'}</td>
                  <td>{new Date(client.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="btn-group">
                      <button className="btn-icon btn-icon-blue" title="Edit" onClick={() => openEditModal(client)}><Edit2 size={18} /></button>
                      <button className="btn-icon btn-icon-red" title="Delete" onClick={() => handleDelete(client.id)}><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon"><Users size={48} /></div>
            <div className="empty-text">No clients found</div>
            <div className="empty-subtext">Add your first client to start creating invoices</div>
          </div>
        )}
      </div>
      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingClient ? 'Edit Client' : 'Add Client'}</h3>
              <button type="button" className="btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input
                  className="form-input"
                  placeholder="Client name..."
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="client@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input
                  className="form-input"
                  placeholder="+1 (555) 123-4567"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea
                  className="form-textarea"
                  placeholder="Client address..."
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  rows={2}
                />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingClient ? <><Save size={16} /> Update</> : <><Plus size={16} /> Add Client</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}