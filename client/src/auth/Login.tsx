import { useState, type FormEvent } from 'react';
import { Scale } from 'lucide-react';
import { login, signup, type SessionUser } from '../api';

export default function Login({ onSignedIn }: { onSignedIn: (user: SessionUser) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firmName, setFirmName] = useState('');
  const [signupCode, setSignupCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = mode === 'signin'
        ? await login(email, password)
        : await signup({ email, password, firm_name: firmName, signup_code: signupCode || undefined });
      onSignedIn(user);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
  };

  return (
    <div className="auth-screen">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <div className="sidebar-logo auth-logo">
          <div className="logo-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Scale size={20} color="white" />
          </div>
          <span className="logo-text">LexLedger</span>
        </div>
        <h1 className="auth-title">{mode === 'signin' ? 'Sign in' : 'Create your firm account'}</h1>
        <p className="auth-subtitle">
          {mode === 'signin'
            ? 'Your clients and fee memos, on every device.'
            : 'One account per firm. Sign in with it on your phone, laptop and desktop.'}
        </p>

        {mode === 'signup' && (
          <div className="form-group">
            <label className="form-label" htmlFor="firm-name">Firm name</label>
            <input id="firm-name" className="form-input" value={firmName} onChange={(e) => setFirmName(e.target.value)} autoComplete="organization" />
          </div>
        )}
        <div className="form-group">
          <label className="form-label" htmlFor="email">Email</label>
          <input id="email" className="form-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="password">Password</label>
          <input
            id="password" className="form-input" type="password" required minLength={mode === 'signup' ? 8 : undefined}
            value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </div>
        {mode === 'signup' && (
          <div className="form-group">
            <label className="form-label" htmlFor="signup-code">Sign-up code <span className="auth-optional">(if you were given one)</span></label>
            <input id="signup-code" className="form-input" value={signupCode} onChange={(e) => setSignupCode(e.target.value)} autoComplete="off" />
          </div>
        )}

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <button type="button" className="auth-switch" onClick={switchMode}>
          {mode === 'signin' ? 'New to LexLedger? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
