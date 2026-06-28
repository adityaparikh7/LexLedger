import { Mail, ExternalLink, LifeBuoy } from 'lucide-react';

export default function Support() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Support & Contact</h1>
          <p className="page-subtitle">Reach out to us for assistance</p>
        </div>
      </div>

      <div className="card">
        <div className="settings-section" style={{ marginBottom: 0 }}>
          <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LifeBuoy size={20} /> Technical Assistance
          </h3>
          {/* <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, marginTop: -8 }}>
            We're here to help you resolve any issues.
          </p> */}
          
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: 'var(--bg-glass)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Mail size={20} color="var(--text-secondary)" />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Email us</div>
                  {/* <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Average response time: 24 hours</div> */}
                </div>
              </div>
              <a href="mailto:lexledgersupport@gmail.com" className="badge sent" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                lexledgersupport@gmail.com
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
