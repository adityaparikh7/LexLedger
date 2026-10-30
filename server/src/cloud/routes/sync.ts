import { Router, Request, Response } from 'express';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { getDb, type Tx } from '../db';
import { clients, invoices, lineItems, payments, firmProfile, deviceMutations } from '../db/schema';
import { accountId } from '../auth';
import { applyMutation, isUuid, lockAccountForRead, MutationError, withAccountLock } from '../mutations';
import { MASKED_SECRET, SYNC_TABLES, type PullResponse, type PushResponse, type QueuedMutation, type SyncTable } from '../../../../shared/sync';

const router = Router();

const MAX_MUTATIONS_PER_PUSH = 200;
const PULL_PAGE_SIZE = 1000;

const tables = {
  clients,
  invoices,
  line_items: lineItems,
  payments,
  firm_profile: firmProfile,
} satisfies Record<SyncTable, unknown>;

/** Postgres rejected the values themselves (bad format, constraint): retrying won't help. */
function isDataError(err: any): boolean {
  const code: unknown = err?.code ?? err?.cause?.code;
  return typeof code === 'string' && (code.startsWith('22') || code.startsWith('23'));
}

async function recordApplied(tx: Tx, account: string, deviceId: string, mutationId: number) {
  await tx.insert(deviceMutations)
    .values({ device_id: deviceId, account_id: account, last_mutation_id: mutationId })
    .onConflictDoUpdate({
      target: deviceMutations.device_id,
      set: { last_mutation_id: mutationId, last_seen_at: sql`now()` },
    });
}

// POST apply a device's queued changes, in order
router.post('/push', async (req: Request, res: Response) => {
  try {
    const account = accountId(req);
    const { deviceId, mutations } = req.body ?? {};
    if (!isUuid(deviceId) || !Array.isArray(mutations) || mutations.length > MAX_MUTATIONS_PER_PUSH) {
      return res.status(400).json({ error: 'Invalid sync request' });
    }

    const results: PushResponse['results'] = [];
    for (const m of mutations as QueuedMutation[]) {
      if (!Number.isSafeInteger(m?.id) || m.id <= 0) {
        return res.status(400).json({ error: 'Invalid mutation id' });
      }
      try {
        await withAccountLock(account, async (tx) => {
          const [device] = await tx.select().from(deviceMutations).where(eq(deviceMutations.device_id, deviceId));
          if (device && device.account_id !== account) throw new MutationError('This device is signed in to another account');
          if (device && m.id <= device.last_mutation_id) return; // applied by an earlier push
          await applyMutation(tx, account, m);
          await recordApplied(tx, account, deviceId, m.id);
        });
        results.push({ id: m.id });
      } catch (err: any) {
        if (!(err instanceof MutationError) && !isDataError(err)) throw err;
        if (!(err instanceof MutationError)) console.warn(`Rejected mutation ${m.name}:`, err.cause?.message ?? err.message);
        // Rejected: mark it handled so the device moves on
        await withAccountLock(account, (tx) => recordApplied(tx, account, deviceId, m.id));
        results.push({ id: m.id, error: err instanceof MutationError ? err.message : "Couldn't save a change: the data was invalid" });
      }
    }
    res.json({ results } satisfies PushResponse);
  } catch (err: any) {
    console.error('Error applying sync push:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET rows changed since the device's cursor
router.get('/pull', async (req: Request, res: Response) => {
  try {
    const account = accountId(req);
    const cursor = Math.max(0, Math.floor(Number(req.query.cursor) || 0));

    const pages = await getDb().transaction(async (tx) => {
      await lockAccountForRead(tx, account);
      const entries = await Promise.all(SYNC_TABLES.map(async (name) => {
        const table = tables[name];
        const rows = await tx.select().from(table)
          .where(and(eq(table.account_id, account), gt(table.version, cursor)))
          .orderBy(asc(table.version))
          .limit(PULL_PAGE_SIZE);
        return [name, rows] as const;
      }));
      return Object.fromEntries(entries) as unknown as Record<SyncTable, Record<string, any>[]>;
    });

    // If any table filled a page, stop at the lowest version reached by a full page so the
    // next pull continues from there without skipping rows in other tables
    let next = cursor;
    let hasMore = false;
    for (const name of SYNC_TABLES) {
      const rows = pages[name];
      if (rows.length === PULL_PAGE_SIZE) {
        const last = rows[rows.length - 1].version;
        next = hasMore ? Math.min(next, last) : last;
        hasMore = true;
      }
    }
    if (!hasMore) {
      for (const name of SYNC_TABLES) for (const row of pages[name]) next = Math.max(next, row.version);
    }

    const rows = {} as PullResponse['rows'];
    for (const name of SYNC_TABLES) {
      rows[name] = pages[name]
        .filter((row) => row.version <= next)
        .map(({ account_id: _account, ...row }) => (
          name === 'firm_profile' ? { ...row, smtp_pass: row.smtp_pass ? MASKED_SECRET : '' } : row
        )) as PullResponse['rows'][SyncTable];
    }
    res.json({ cursor: next, hasMore, rows } satisfies PullResponse);
  } catch (err: any) {
    console.error('Error serving sync pull:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
