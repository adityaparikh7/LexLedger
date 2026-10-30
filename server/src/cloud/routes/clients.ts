// Client reads; changes arrive through sync (routes/sync.ts → mutations.ts)
import { Router, Request, Response } from 'express';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb } from '../db';
import { clients } from '../db/schema';
import { accountId } from '../auth';
import { idParam, uuidParam } from './common';

const router = Router();
router.param('id', uuidParam);

const liveClient = (req: Request, id: string) =>
  and(eq(clients.id, id), eq(clients.account_id, accountId(req)), isNull(clients.deleted_at));

// GET all clients
router.get('/', async (req: Request, res: Response) => {
  try {
    const rows = await getDb().select().from(clients)
      .where(and(eq(clients.account_id, accountId(req)), isNull(clients.deleted_at)))
      .orderBy(asc(clients.name));
    res.json(rows);
  } catch (err: any) {
    console.error('Error fetching clients:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET single client
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const [client] = await getDb().select().from(clients).where(liveClient(req, idParam(req)));
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err: any) {
    console.error('Error fetching client:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
