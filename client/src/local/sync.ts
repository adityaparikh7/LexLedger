// Keeps the device's copy in step with the cloud server.
//
// A sync pushes the outbox (changes made here, oldest first), then pulls every row changed on
// the server since the last pull. Pulled rows are the truth: they replace the local copies, and
// any changes still in the outbox are replayed on top so nothing typed on this device
// disappears. If the server rejects a change, the device's copy is rebuilt from a full pull.
import { db, DATA_TABLES, getMeta, setMeta, clearLocalData } from './db';
import { applyLocally } from './apply';
import { uuid } from '../uuid';
import { API_BASE, UNAUTHORIZED_EVENT } from '../api';
import type { Mutation, PullResponse, PushResponse, SyncRow, SyncTable } from '../../../shared/sync';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';
export interface SyncState {
  status: SyncStatus;
  /** Changes made on this device that the server hasn't confirmed */
  pending: number;
  lastSyncedAt: number | null;
  error: string | null;
}

/** Fired with `detail: string[]`, the reasons the server refused changes. */
export const SYNC_REJECTED_EVENT = 'lexledger:sync-rejected';

const SYNC_INTERVAL_MS = 30_000;
const PUSH_BATCH = 100;

// ---- Observable state (read with useSyncState) ----

let state: SyncState = { status: 'idle', pending: 0, lastSyncedAt: null, error: null };
const stateListeners = new Set<() => void>();
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  stateListeners.forEach((l) => l());
}
export const getSyncState = () => state;
export function subscribeSyncState(listener: () => void) {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

// ---- Data version: bumps whenever the local data changes, so pages re-read it ----

let dataVersion = 0;
const dataListeners = new Set<() => void>();
export function bumpDataVersion() {
  dataVersion++;
  dataListeners.forEach((l) => l());
}
export const getDataVersion = () => dataVersion;
export function subscribeDataVersion(listener: () => void) {
  dataListeners.add(listener);
  return () => dataListeners.delete(listener);
}

// ---- Network ----

class OfflineError extends Error {}

async function syncFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    throw new OfflineError('Offline');
  }
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Sync failed (${res.status})`);
  }
  return res.json();
}

// ---- Local writes ----

async function refreshPending() {
  setState({ pending: await db.outbox.count() });
}

/** Apply a change on this device and queue it for the server. Throws LocalValidationError for
 *  changes that can't be made (nothing is queued then). */
export async function enqueue(mutation: Mutation): Promise<void> {
  await db.transaction('rw', [...DATA_TABLES.map((t) => db[t]), db.outbox, db.meta], async () => {
    await applyLocally(mutation);
    const id = ((await getMeta<number>('lastMutationId')) ?? 0) + 1;
    await setMeta('lastMutationId', id);
    await db.outbox.add({ mutation: { ...mutation, id } as Mutation & { id: number } });
  });
  bumpDataVersion();
  await refreshPending();
  requestSync();
}

// ---- Push / pull ----

async function deviceId(): Promise<string> {
  let id = await getMeta<string>('deviceId');
  if (!id) {
    id = uuid();
    await setMeta('deviceId', id);
  }
  return id;
}

/** Push the whole outbox. Returns the server's reasons for any rejected changes. */
async function push(): Promise<string[]> {
  const rejected: string[] = [];
  const device = await deviceId();
  for (;;) {
    const batch = await db.outbox.orderBy('seq').limit(PUSH_BATCH).toArray();
    if (batch.length === 0) return rejected;
    const { results } = await syncFetch<PushResponse>('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ deviceId: device, mutations: batch.map((e) => e.mutation) }),
    });
    for (const r of results) if (r.error) rejected.push(r.error);
    await db.outbox.bulkDelete(batch.map((e) => e.seq!));
    await refreshPending();
  }
}

/** Server rows → local rows: drop the sync bookkeeping the device doesn't need. */
function toLocal(row: SyncRow): Record<string, unknown> {
  const local: Record<string, unknown> = { ...row };
  delete local.version;
  delete local.deleted_at;
  return local;
}

async function applyPulled(page: PullResponse) {
  await db.transaction('rw', [...DATA_TABLES.map((t) => db[t]), db.outbox, db.meta], async () => {
    for (const table of DATA_TABLES) {
      const rows = page.rows[table as SyncTable];
      if (rows.length === 0) continue;
      // One firm profile per account: the server's replaces any placeholder made offline
      if (table === 'firm_profile') await db.firm_profile.clear();
      const deleted = rows.filter((r) => r.deleted_at).map((r) => r.id);
      const live = rows.filter((r) => !r.deleted_at).map(toLocal);
      if (deleted.length) await db[table].bulkDelete(deleted);
      if (live.length) await (db[table] as typeof db.clients).bulkPut(live as never[]);
    }
    await setMeta('cursor', page.cursor);
    // Changes queued while this sync ran stay visible on top of the server's rows
    for (const entry of await db.outbox.orderBy('seq').toArray()) {
      try {
        await applyLocally(entry.mutation);
      } catch {
        // The server will reject it too, and the next sync reports why
      }
    }
  });
}

async function pull() {
  for (;;) {
    const cursor = (await getMeta<number>('cursor')) ?? 0;
    const page = await syncFetch<PullResponse>(`/sync/pull?cursor=${cursor}`);
    await applyPulled(page);
    if (!page.hasMore) return;
  }
}

/** Throw away the local copy (keeping unsent changes) and pull everything again. */
async function rebuildFromServer() {
  await db.transaction('rw', [...DATA_TABLES.map((t) => db[t]), db.meta], async () => {
    await Promise.all(DATA_TABLES.map((t) => db[t].clear()));
    await setMeta('cursor', 0);
  });
  await pull();
}

let running: Promise<void> | null = null;
let again = false;

async function runSync() {
  setState({ status: 'syncing' });
  try {
    const rejected = await push();
    if (rejected.length) {
      await rebuildFromServer();
      window.dispatchEvent(new CustomEvent(SYNC_REJECTED_EVENT, { detail: rejected }));
    } else {
      await pull();
    }
    setState({ status: 'idle', lastSyncedAt: Date.now(), error: null });
  } catch (err) {
    if (err instanceof OfflineError) setState({ status: 'offline', error: null });
    else setState({ status: 'error', error: (err as Error).message });
  } finally {
    bumpDataVersion();
    await refreshPending();
  }
}

/** Sync now; resolves when this sync (and any requested while it ran) has finished. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await runSync();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

let debounce: ReturnType<typeof setTimeout> | undefined;
/** Sync shortly, batching changes made in quick succession. */
export function requestSync(delayMs = 400) {
  clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), delayMs);
}

// ---- Lifecycle ----

let interval: ReturnType<typeof setInterval> | undefined;
const onOnline = () => void syncNow();
const onOffline = () => setState({ status: 'offline' });
const onVisible = () => {
  if (document.visibilityState === 'visible') void syncNow();
};

/** True once this device has pulled the account's data at least once. */
export async function hasLocalData(): Promise<boolean> {
  return (await getMeta<number>('cursor')) !== undefined;
}

/** Start syncing for the signed-in account. Data from a different account is cleared first. */
export async function startSync(accountId: string): Promise<void> {
  stopSync();
  if ((await getMeta<string>('accountId')) !== accountId) {
    await clearLocalData();
    await setMeta('accountId', accountId);
  }
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  interval = setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, SYNC_INTERVAL_MS);
  // Ask the browser not to evict the data under storage pressure
  void navigator.storage?.persist?.().catch(() => {});
  await refreshPending();
  if (!navigator.onLine) setState({ status: 'offline' });
  await syncNow();
}

export function stopSync() {
  clearInterval(interval);
  clearTimeout(debounce);
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  document.removeEventListener('visibilitychange', onVisible);
}

/** Make sure the server has every change made here, for actions that run on the server
 *  (PDFs, exports, email). Throws a message for the user when that isn't possible. */
export async function ensureServerUpToDate(): Promise<void> {
  if (!navigator.onLine) throw new Error("You're offline. This needs an internet connection.");
  await syncNow();
  if (state.status === 'offline') throw new Error("Can't reach the server. Check your connection and try again.");
  if (await db.outbox.count()) throw new Error("Some changes haven't synced yet. Please try again in a moment.");
}
