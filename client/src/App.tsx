import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useState, createContext, useContext, useCallback } from 'react';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import InvoiceForm from './pages/InvoiceForm';
import Clients from './pages/Clients';
import Settings from './pages/Settings';

// Toast context
interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextType {
  addToast: (message: string, type: Toast['type']) => void;
}

export const ToastContext = createContext<ToastContextType>({ addToast: () => { } });
export const useToast = () => useContext(ToastContext);

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
      <BrowserRouter>
        <div className="app-layout">
          {/* Mobile Header */}
          <div className="mobile-header">
            <button className="btn-icon menu-button" onClick={() => setIsSidebarOpen(true)}>
              ☰
            </button>
            <NavLink to="/" className="sidebar-logo" onClick={() => setIsSidebarOpen(false)}>
              <div className="logo-icon small">⚖️</div>
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
                <div className="logo-icon">⚖️</div>
                <span className="logo-text">LexLedger</span>
              </NavLink>
              <button className="btn-icon close-mobile-menu" onClick={() => setIsSidebarOpen(false)}>
                ✕
              </button>
            </div>
            <nav className="sidebar-nav">
              <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                <span className="nav-icon">📊</span>
                <span>Dashboard</span>
              </NavLink>
              <NavLink to="/invoices" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                <span className="nav-icon">🧾</span>
                <span>Invoices</span>
              </NavLink>
              <NavLink to="/invoices/new" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                <span className="nav-icon">➕</span>
                <span>New Invoice</span>
              </NavLink>
              <NavLink to="/clients" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                <span className="nav-icon">👥</span>
                <span>Clients</span>
              </NavLink>
              <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                <span className="nav-icon">⚙️</span>
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
            <div key={toast.id} className={`toast ${toast.type}`}>
              <span>{toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}</span>
              {toast.message}
            </div>
          ))}
        </div>
      </BrowserRouter>
    </ToastContext.Provider>
  );
}

export default App;
