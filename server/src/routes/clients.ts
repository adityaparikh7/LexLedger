import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

// GET all clients
router.get('/', (_req: Request, res: Response) => {
  try {
    const clients = db.prepare('SELECT * FROM clients ORDER BY name ASC').all();
    res.json(clients);
  } catch (err: any) {
    console.error('Error fetching clients:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET single client
router.get('/:id', (req: Request, res: Response) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err: any) {
    console.error('Error fetching client:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create client
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, email, phone, address } = req.body;
    if (!name) return res.status(400).json({ error: 'Client name is required' });

    const result = db.prepare(
      'INSERT INTO clients (name, email, phone, address) VALUES (?, ?, ?, ?)'
    ).run(name, email || null, phone || null, address || null);

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(client);
  } catch (err: any) {
    console.error('Error creating client:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update client
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, email, phone, address } = req.body;
    if (!name) return res.status(400).json({ error: 'Client name is required' });

    const result = db.prepare(
      'UPDATE clients SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?'
    ).run(name, email || null, phone || null, address || null, req.params.id);

    if (result.changes === 0) return res.status(404).json({ error: 'Client not found' });

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    res.json(client);
  } catch (err: any) {
    console.error('Error updating client:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE client
router.delete('/:id', (req: Request, res: Response) => {
  try {
    // Check if client has invoices
    const invoiceCount = db.prepare(
      'SELECT COUNT(*) as count FROM invoices WHERE client_id = ?'
    ).get(req.params.id) as { count: number };

    if (invoiceCount.count > 0) {
      return res.status(400).json({
        error: 'Cannot delete client with existing invoices. Delete invoices first.'
      });
    }

    const result = db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Client not found' });

    res.json({ message: 'Client deleted successfully' });
  } catch (err: any) {
    console.error('Error deleting client:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
