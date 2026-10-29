import { Router, Request, Response } from 'express';
import { getFirmProfile } from '../routes/settings';
import { BackupError, createBackup, getBackupDir, getDefaultBackupDir, listBackups, restoreBackup } from '../services/backup';
import { chooseFolder } from '../services/folderPicker';

const router = Router();

// GET backup folder and list of backups
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json({
      dir: getBackupDir(),
      defaultDir: getDefaultBackupDir(),
      isDefault: !getFirmProfile().backup_dir,
      backups: listBackups(),
    });
  } catch (err: any) {
    console.error('Error listing backups:', err);
    res.status(500).json({ error: 'Could not read the backup folder' });
  }
});

// POST back up now
router.post('/', async (_req: Request, res: Response) => {
  try {
    const backup = await createBackup('regular');
    res.status(201).json(backup);
  } catch (err: any) {
    console.error('Error creating backup:', err);
    res.status(500).json({ error: `Backup failed: ${err.message}` });
  }
});

// POST open the system folder dialog on this machine (used when not running inside Electron)
router.post('/choose-folder', async (req: Request, res: Response) => {
  const { startDir } = req.body ?? {};
  try {
    const folder = await chooseFolder(typeof startDir === 'string' ? startDir : undefined);
    res.json({ path: folder });
  } catch (err: any) {
    console.error('Error opening folder dialog:', err);
    res.status(500).json({ error: `Could not open the folder dialog: ${err.message}` });
  }
});

// POST restore a backup from the backup folder
router.post('/restore', async (req: Request, res: Response) => {
  const { file } = req.body;
  if (typeof file !== 'string' || !file) return res.status(400).json({ error: 'file is required' });
  try {
    const result = await restoreBackup(file);
    res.json({
      message: `Restored ${result.invoices} memos and ${result.clients} clients`,
      ...result,
    });
  } catch (err: any) {
    if (err instanceof BackupError) return res.status(400).json({ error: err.message });
    console.error('Error restoring backup:', err);
    res.status(500).json({ error: `Restore failed: ${err.message}` });
  }
});

export default router;
