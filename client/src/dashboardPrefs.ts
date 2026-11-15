/** Which cards the Dashboard shows. Chosen in Settings → Dashboard layout, stored per machine in localStorage. */
export const DASHBOARD_PREFS_KEY = 'dashboardPreferences';

export const defaultDashboardPreferences = {
  // Summary cards
  totalBilled: true,
  totalReceived: true,
  tds: true,
  outstanding: true,
  // Count cards
  clients: false,
  totalInvoices: false,
  paid: false,
  unpaid: false,
  sent: false,
  drafts: false,
  // Sections
  statusOverview: true,
  recentInvoices: true,
};

export type DashboardPreferences = typeof defaultDashboardPreferences;
export type DashboardPrefKey = keyof DashboardPreferences;

export const DASHBOARD_CARD_GROUPS: { title: string; items: [DashboardPrefKey, string][] }[] = [
  {
    title: 'Summary cards',
    items: [['totalBilled', 'Total billed'], ['totalReceived', 'Total received'], ['tds', 'TDS deducted'], ['outstanding', 'Outstanding']],
  },
  {
    title: 'Count cards',
    items: [['clients', 'Clients'], ['totalInvoices', 'Total invoices'], ['paid', 'Paid'], ['unpaid', 'Unpaid'], ['sent', 'Sent'], ['drafts', 'Drafts']],
  },
  {
    title: 'Sections',
    items: [['statusOverview', 'Invoice status overview'], ['recentInvoices', 'Recent invoices']],
  },
];

export function loadDashboardPreferences(): DashboardPreferences {
  try {
    const saved = localStorage.getItem(DASHBOARD_PREFS_KEY);
    if (saved) return { ...defaultDashboardPreferences, ...JSON.parse(saved) };
  } catch {
    // unreadable or blocked storage: fall back to the defaults
  }
  return { ...defaultDashboardPreferences };
}

export function saveDashboardPreferences(prefs: DashboardPreferences) {
  localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(prefs));
}
