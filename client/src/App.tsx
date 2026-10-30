import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState, useCallback, useRef } from 'react';
import Navigation from './components/Navigation';
import UpdateBanner from './components/UpdateBanner';
import LegacyImportPrompt from './components/LegacyImportPrompt';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import InvoiceForm from './pages/InvoiceForm';
import Clients from './pages/Clients';
import Settings from './pages/Settings';
import Export from './pages/Export';
import Support from './pages/Support';

import { ToastContext, type Toast } from './context/ToastContext';
import { CheckCircle, XCircle, Info } from 'lucide-react';

declare global {
  interface Window {
    electronAPI?: {
      isElectron?: boolean;
      platform?: string;
      selectFolder?: (defaultPath?: string) => Promise<string | null>;
      findLegacyData?: () => Promise<{ source: 'database' | 'backup'; modifiedAt: string; size: number } | null>;
      readLegacyData?: () => Promise<Uint8Array | null>;
    };
  }
}

const isMacElectron = typeof window !== 'undefined' && 
  !!window.electronAPI?.isElectron && 
  window.electronAPI?.platform === 'darwin';

const isWinElectron = typeof window !== 'undefined' &&
  !!window.electronAPI?.isElectron &&
  window.electronAPI?.platform === 'win32';

function App() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const nextToastId = useRef(0);
  const addToast = useCallback((message: string, type: Toast['type']) => {
    const id = ++nextToastId.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      <BrowserRouter>
        <div className={`app-layout ${isMacElectron ? 'platform-mac-electron' : ''} ${isWinElectron ? 'platform-win-electron' : ''}`}>
          <Navigation />

          {/* Main content */}
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
        </div>

        <UpdateBanner />
        <LegacyImportPrompt />

        {/* Toast notifications */}
        <div className="toast-container">
          {toasts.map(toast => (
            <div key={toast.id} className={`toast ${toast.type}`} role="status">
              {toast.type === 'success' ? <CheckCircle size={18} /> : toast.type === 'error' ? <XCircle size={18} /> : <Info size={18} />}
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      </BrowserRouter>
    </ToastContext.Provider>
  );
}

export default App;
