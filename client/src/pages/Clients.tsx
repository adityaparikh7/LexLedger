import { useState, useEffect } from 'react';
import {
  getClients, createClient, updateClient, deleteClient,
  type Client
} from '../api';
import { useToast } from '../App';
export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { addToast } = useToast();
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const fetchClients = async () => {
    try {
      const data = await getClients();
      setClients(data);
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchClients(); }, []);
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
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };
  const handleDelete = async (id: number) => {
    if (!confirm('Delete this client? This cannot be undone.')) return;
    try {
      await deleteClient(id);
      addToast('Client deleted', 'success');
      fetchClients();
    } catch (err: any) {
      addToast(err.message, 'error');
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
        <input
          className="form-input"
          placeholder="🔍 Search clients..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ width: 300 }}
        />
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
                  <td style={{ fontWeight: 600 }}>{client.name}</td>
                  <td>{client.email || '—'}</td>
                  <td>{client.phone || '—'}</td>
                  <td>{client.address || '—'}</td>
                  <td>{new Date(client.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="btn-group">
                      <button className="btn-icon" title="Edit" onClick={() => openEditModal(client)}>✏️</button>
                      <button className="btn-icon" title="Delete" onClick={() => handleDelete(client.id)} style={{ color: 'var(--accent-red)' }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
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
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
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
                  {editingClient ? '💾 Update' : '+ Add Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}