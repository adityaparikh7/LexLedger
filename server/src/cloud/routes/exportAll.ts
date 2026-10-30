import { Router, Request, Response } from 'express';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb } from '../db';
import { accounts, clients, invoices, lineItems, payments } from '../db/schema';
import { accountId } from '../auth';
import { getFirmProfile } from './settings';
import { toLocalDateString } from '../../../../shared/dates';

// A complete copy of the account's data as JSON, for the user's own records. The database
// itself is backed up by the managed Postgres provider.
const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const account = accountId(req);
    const db = getDb();
    const live = <T extends typeof clients | typeof invoices | typeof lineItems | typeof payments>(table: T) =>
      and(eq(table.account_id, account), isNull(table.deleted_at));
    const [[acct], profile, clientRows, invoiceRows, itemRows, paymentRows] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.id, account)),
      getFirmProfile(account),
      db.select().from(clients).where(live(clients)).orderBy(asc(clients.name)),
      db.select().from(invoices).where(live(invoices)).orderBy(asc(invoices.date)),
      db.select().from(lineItems).where(live(lineItems)).orderBy(asc(lineItems.position)),
      db.select().from(payments).where(live(payments)).orderBy(asc(payments.date)),
    ]);
    const strip = <R extends { account_id: string; version: number; deleted_at: Date | null }>({ account_id: _a, version: _v, deleted_at: _d, ...row }: R) => row;
    const { smtp_pass: _secret, ...firm } = strip(profile);

    const snapshot = {
      format: 'lexledger-export',
      version: 1,
      exported_at: new Date().toISOString(),
      account: { id: acct.id, name: acct.name },
      firm_profile: firm,
      clients: clientRows.map(strip),
      invoices: invoiceRows.map((inv) => ({
        ...strip(inv),
        line_items: itemRows.filter((li) => li.invoice_id === inv.id).map(strip),
        payments: paymentRows.filter((p) => p.invoice_id === inv.id).map(strip),
      })),
    };
    const day = toLocalDateString(new Date());
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="LexLedger-export-${day}.json"`);
    res.send(JSON.stringify(snapshot, null, 2));
  } catch (err: any) {
    console.error('Error exporting account data:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
