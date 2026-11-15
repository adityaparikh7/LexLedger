import { HashRouter, Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import { useState, useCallback, useEffect, type ReactNode } from 'react';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import InvoiceForm from './pages/InvoiceForm';
import Clients from './pages/Clients';
import Settings from './pages/Settings';
import Export from './pages/Export';
import Support from './pages/Support';
import { getFirmProfile } from './api';
import { financialYearLabel, initials } from './format';
import { FIRM_PROFILE_EVENT } from './events';

import { ToastContext, type Toast } from './context/ToastContext';
import {
  Scale, LayoutDashboard, FileText, Users, Download, SlidersHorizontal, LifeBuoy, Plus, Ellipsis,
  CircleCheck, CircleX, Info,
} from 'lucide-react';

declare global {
  interface Window {
    electronAPI?: {
      isElectron?: boolean;
      platform?: string;
      selectFolder?: (defaultPath?: string) => Promise<string | null>;
    };
  }
}

const isMacElectron = typeof window !== 'undefined' &&
  !!window.electronAPI?.isElectron &&
  window.electronAPI?.platform === 'darwin';

const isWinElectron = typeof window !== 'undefined' &&
  !!window.electronAPI?.isElectron &&
  window.electronAPI?.platform === 'win32';

const navClass = ({ isActive }: { isActive: boolean }) => `nav-item${isActive ? ' active' : ''}`;

function FirmCard({ firmName, onClick }: { firmName: string; onClick?: () => void }) {
  return (
    <Link to="/settings" className="firm-card" onClick={onClick} title="Firm settings">
      <span className="avatar">{firmName ? initials(firmName) : <Scale size={18} />}</span>
      <span className="firm-card-text">
        <span className="firm-card-name">{firmName || 'Set up your firm'}</span>
        <span className="small text-muted">Financial year {financialYearLabel()}</span>
      </span>
    </Link>
  );
}

function Sidebar({ firmName }: { firmName: string }) {
  const group = (label: string, items: ReactNode) => (
    <nav className="nav-group" aria-label={label}>
      <span className="nav-group-label">{label}</span>
      {items}
    </nav>
  );
  return (
    <aside className="sidebar">
      <Link to="/" className="brand">
        <span className="logo-mark"><Scale size={20} /></span>
        <span className="wordmark">LexLedger</span>
      </Link>
      <Link to="/invoices/new" className="btn btn-primary btn-block"><Plus size={18} /> New invoice</Link>
      {group('Workspace', <>
        <NavLink to="/" end className={navClass}><LayoutDashboard size={20} /> Dashboard</NavLink>
        <NavLink to="/invoices" className={navClass}><FileText size={20} /> Invoices</NavLink>
        <NavLink to="/clients" className={navClass}><Users size={20} /> Clients</NavLink>
      </>)}
      {group('Tools', <NavLink to="/export" className={navClass}><Download size={20} /> Export records</NavLink>)}
      <div className="sidebar-spacer" />
      {group('Account', <>
        <NavLink to="/settings" className={navClass}><SlidersHorizontal size={20} /> Settings</NavLink>
        <NavLink to="/support" className={navClass}><LifeBuoy size={20} /> Support</NavLink>
      </>)}
      <FirmCard firmName={firmName} />
    </aside>
  );
}

/** Phone layout: bottom tab bar with a "More" sheet for the less-used pages. */
function PhoneNav({ firmName }: { firmName: string }) {
  const { pathname } = useLocation();
  // Remember which page the sheet was opened on, so any navigation closes it
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const moreOpen = openedOn === pathname;
  const setMoreOpen = (open: boolean) => setOpenedOn(open ? pathname : null);
  const inMore = ['/export', '/settings', '/support'].includes(pathname);
  const close = () => setMoreOpen(false);

  const tab = ({ isActive }: { isActive: boolean }) => `tab-link${isActive ? ' active' : ''}`;
  return (
    <>
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end className={tab}><LayoutDashboard size={20} /> Dashboard</NavLink>
        <NavLink to="/invoices" end className={tab}><FileText size={20} /> Invoices</NavLink>
        <NavLink to="/invoices/new" className="tab-link" aria-label="New invoice"><span className="tab-new"><Plus size={20} /></span></NavLink>
        <NavLink to="/clients" className={tab}><Users size={20} /> Clients</NavLink>
        <button type="button" className={`tab-link${inMore || moreOpen ? ' active' : ''}`} onClick={() => setMoreOpen(true)}>
          <Ellipsis size={20} /> More
        </button>
      </nav>
      {moreOpen && (
        <>
          <div className="sheet-overlay" onClick={close} />
          <div className="sheet" role="dialog" aria-label="More">
            <div className="sheet-handle" />
            <NavLink to="/export" className={({ isActive }) => `sheet-item${isActive ? ' active' : ''}`} onClick={close}><Download size={20} /> Export records</NavLink>
            <NavLink to="/settings" className={({ isActive }) => `sheet-item${isActive ? ' active' : ''}`} onClick={close}><SlidersHorizontal size={20} /> Settings</NavLink>
            <NavLink to="/support" className={({ isActive }) => `sheet-item${isActive ? ' active' : ''}`} onClick={close}><LifeBuoy size={20} /> Support</NavLink>
            <FirmCard firmName={firmName} onClick={close} />
          </div>
        </>
      )}
    </>
  );
}

function App() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [firmName, setFirmName] = useState('');

  const addToast = useCallback((message: string, type: Toast['type']) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    const load = () => getFirmProfile().then(p => setFirmName(p.firm_name || '')).catch(() => {});
    load();
    window.addEventListener(FIRM_PROFILE_EVENT, load);
    return () => window.removeEventListener(FIRM_PROFILE_EVENT, load);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      <HashRouter>
        <div className={`app-layout ${isMacElectron ? 'platform-mac-electron' : ''} ${isWinElectron ? 'platform-win-electron' : ''}`}>
          <header className="mobile-topbar">
            <Link to="/" className="brand">
              <span className="logo-mark"><Scale size={18} /></span>
              <span className="wordmark">LexLedger</span>
            </Link>
            <Link to="/settings" className="avatar" aria-label="Firm settings" style={{ textDecoration: 'none' }}>
              {firmName ? initials(firmName) : <Scale size={18} />}
            </Link>
          </header>

          <Sidebar firmName={firmName} />

          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/invoices/new" element={<InvoiceForm />} />
              <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/export" element={<Export />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/support" element={<Support />} />
            </Routes>
          </main>

          <PhoneNav firmName={firmName} />
        </div>

        <div className="toast-container" aria-live="polite">
          {toasts.map(toast => (
            <div key={toast.id} className={`toast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
              {toast.type === 'success' ? <CircleCheck size={20} /> : toast.type === 'error' ? <CircleX size={20} /> : <Info size={20} />}
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      </HashRouter>
    </ToastContext.Provider>
  );
}

export default App;
