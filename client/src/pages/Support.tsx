import { Mail, LifeBuoy } from 'lucide-react';
import { CardHeader, PageHeader } from '../components/ui';

const SUPPORT_EMAIL = 'lexledgersupport@gmail.com';
const APP_VERSION = '1.3.2';

export default function Support() {
  return (
    <div className="page">
      <PageHeader title="Support" subtitle="Get help with LexLedger" />

      <section className="card narrow-col support">
        <CardHeader title="Technical assistance" icon={<LifeBuoy size={18} />} />
        <div className="panel">
          <Mail size={20} className="text-muted" />
          <div className="panel-text">
            <span className="text-strong">Email us</span>
            <span className="text-secondary" style={{ wordBreak: 'break-all' }}>{SUPPORT_EMAIL}</span>
          </div>
          <a className="btn btn-secondary" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`LexLedger v${APP_VERSION} support`)}`}>
            Send email
          </a>
        </div>
        <p className="small text-muted">
          Tip: include your app version (v{APP_VERSION}) and what you were doing when the problem happened.
        </p>
      </section>
    </div>
  );
}
