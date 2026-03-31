import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useState, useCallback } from 'react';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import InvoiceForm from './pages/InvoiceForm';
import Clients from './pages/Clients';
import Settings from './pages/Settings';

import { ToastContext, type Toast } from './context/ToastContext';
import { Menu, Scale, X, BarChart3, FileText, PlusCircle, Users, Settings as SettingsIcon, CheckCircle, XCircle, Info } from 'lucide-react';

function App() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const addToast = useCallback((message: string, type: Toast['type']) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      <HashRouter>
        <div className="app-layout">
          {/* Mobile Header */}
          <div className="mobile-header">
            <button className="btn-icon menu-button" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <NavLink to="/" className="sidebar-logo" onClick={() => setIsSidebarOpen(false)}>
              <div className="logo-icon small" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Scale size={16} color="white" />
              </div>
              <span className="logo-text">LexLedger</span>
            </NavLink>
            <div style={{ width: 36 }}></div>
          </div>

          {/* Sidebar Overlay */}
          {isSidebarOpen && (
            <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
          )}

          {/* Sidebar */}
          <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
            <div className="sidebar-header">
              <NavLink to="/" className="sidebar-logo" onClick={() => setIsSidebarOpen(false)}>
                <div className="logo-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Scale size={20} color="white" />
                </div>
                <span className="logo-text">LexLedger</span>
              </NavLink>
              <button className="btn-icon close-mobile-menu" onClick={() => setIsSidebarOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <nav className="sidebar-nav">
              <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                <span className="nav-icon"><BarChart3 size={18} /></span>
                <span>Dashboard</span>
              </NavLink>
              <NavLink to="/invoices" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                <span className="nav-icon"><FileText size={18} /></span>
                <span>Invoices</span>
              </NavLink>
              <NavLink to="/invoices/new" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                <span className="nav-icon"><PlusCircle size={18} /></span>
                <span>New Invoice</span>
              </NavLink>
              <NavLink to="/clients" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                <span className="nav-icon"><Users size={18} /></span>
                <span>Clients</span>
              </NavLink>
              <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                <span className="nav-icon"><SettingsIcon size={18} /></span>
                <span>Settings</span>
              </NavLink>
            </nav>
          </aside>

          {/* Main content */}
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/invoices/new" element={<InvoiceForm />} />
              <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>

        {/* Toast notifications */}
        <div className="toast-container">
          {toasts.map(toast => (
            <div key={toast.id} className={`toast ${toast.type}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {toast.type === 'success' ? <CheckCircle size={18} /> : toast.type === 'error' ? <XCircle size={18} /> : <Info size={18} />}
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      </HashRouter>
    </ToastContext.Provider>
  );
}

export default App;
