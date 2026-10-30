import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Scale, BarChart3, FileText, PlusCircle, Users, Settings as SettingsIcon, Info, Download, MoreHorizontal, X, LogOut } from 'lucide-react';
import { useSession } from '../auth/SessionContext';
import SyncIndicator from './SyncIndicator';
import { useSyncRejectionToasts } from '../hooks/useSyncRejectionToasts';

const navClass = ({ isActive }: { isActive: boolean }) => `nav-item ${isActive ? 'active' : ''}`;
const tabClass = ({ isActive }: { isActive: boolean }) => `bottom-nav-item ${isActive ? 'active' : ''}`;

// Secondary pages live in the "More" sheet on phones
const MORE_PATHS = ['/export', '/settings', '/support'];

function Logo({ small }: { small?: boolean }) {
  return (
    <NavLink to="/" className="sidebar-logo" aria-label="LexLedger home">
      <div className={`logo-icon${small ? ' small' : ''}`}>
        <Scale size={small ? 16 : 20} color="white" />
      </div>
      <span className="logo-text">LexLedger</span>
    </NavLink>
  );
}

/** Sidebar on tablets (icon rail) and desktops; top bar, bottom tab bar and "More" sheet on phones. */
export default function Navigation() {
  const { pathname } = useLocation();
  const { mode, signOut } = useSession();
  const [moreOpen, setMoreOpen] = useState(false);
  useSyncRejectionToasts();

  // Close the sheet whenever the route changes
  const [sheetPath, setSheetPath] = useState(pathname);
  if (sheetPath !== pathname) {
    setSheetPath(pathname);
    setMoreOpen(false);
  }

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  // "Invoices" covers the list and editing a memo, but not the New tab
  const invoicesActive = pathname.startsWith('/invoices') && pathname !== '/invoices/new';
  const moreActive = MORE_PATHS.some((p) => pathname.startsWith(p));

  return (
    <>
      <header className="mobile-header">
        <Logo small />
        {mode === 'cloud' && <SyncIndicator />}
      </header>

      <aside className="sidebar">
        <div className="sidebar-header">
          <Logo />
        </div>
        <nav className="sidebar-nav" aria-label="Main">
          <NavLink to="/" end className={navClass} title="Dashboard">
            <span className="nav-icon"><BarChart3 size={18} /></span>
            <span className="nav-label">Dashboard</span>
          </NavLink>
          <NavLink to="/invoices" className={() => navClass({ isActive: invoicesActive })} title="Invoices">
            <span className="nav-icon"><FileText size={18} /></span>
            <span className="nav-label">Invoices</span>
          </NavLink>
          <NavLink to="/invoices/new" className={navClass} title="New Invoice">
            <span className="nav-icon"><PlusCircle size={18} /></span>
            <span className="nav-label">New Invoice</span>
          </NavLink>
          <NavLink to="/clients" className={navClass} title="Clients">
            <span className="nav-icon"><Users size={18} /></span>
            <span className="nav-label">Clients</span>
          </NavLink>
          <NavLink to="/export" className={navClass} title="Export records">
            <span className="nav-icon"><Download size={18} /></span>
            <span className="nav-label">Export records</span>
          </NavLink>
          <NavLink to="/settings" className={navClass} title="Settings">
            <span className="nav-icon"><SettingsIcon size={18} /></span>
            <span className="nav-label">Settings</span>
          </NavLink>
          <NavLink to="/support" className={navClass} title="Support">
            <span className="nav-icon"><Info size={18} /></span>
            <span className="nav-label">Support</span>
          </NavLink>
        </nav>
        {mode === 'cloud' && (
          <div className="sidebar-footer">
            <SyncIndicator />
          </div>
        )}
      </aside>

      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/" end className={tabClass}>
          <BarChart3 size={22} />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/invoices" className={() => tabClass({ isActive: invoicesActive })}>
          <FileText size={22} />
          <span>Invoices</span>
        </NavLink>
        <NavLink to="/invoices/new" className={({ isActive }) => `bottom-nav-item bottom-nav-new ${isActive ? 'active' : ''}`} aria-label="New invoice">
          <span className="bottom-nav-new-icon"><PlusCircle size={24} /></span>
          <span>New</span>
        </NavLink>
        <NavLink to="/clients" className={tabClass}>
          <Users size={22} />
          <span>Clients</span>
        </NavLink>
        <button
          type="button"
          className={`bottom-nav-item ${moreActive || moreOpen ? 'active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <MoreHorizontal size={22} />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="sheet-overlay" onClick={() => setMoreOpen(false)}>
          <div className="sheet" role="dialog" aria-label="More" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <span className="sheet-title">More</span>
              <button type="button" className="btn-icon" onClick={() => setMoreOpen(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <NavLink to="/export" className="sheet-item"><Download size={20} /> Export records</NavLink>
            <NavLink to="/settings" className="sheet-item"><SettingsIcon size={20} /> Settings</NavLink>
            <NavLink to="/support" className="sheet-item"><Info size={20} /> Support</NavLink>
            {mode === 'cloud' && (
              <button type="button" className="sheet-item" onClick={signOut}><LogOut size={20} /> Sign out</button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
