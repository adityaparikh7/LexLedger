// Firm profile reads; changes arrive through sync (updateFirmProfile in mutations.ts)
import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { firmProfile } from '../db/schema';
import { accountId } from '../auth';
import { MASKED_SECRET } from '../../../../shared/sync';

const router = Router();

type FirmProfileRow = typeof firmProfile.$inferSelect;

/** The account's firm profile (created on sign-up). */
export async function getFirmProfile(account: string): Promise<FirmProfileRow> {
  const db = getDb();
  const [profile] = await db.select().from(firmProfile).where(eq(firmProfile.account_id, account));
  if (profile) return profile;
  const [created] = await db.insert(firmProfile).values({ account_id: account })
    .onConflictDoNothing().returning();
  return created ?? (await db.select().from(firmProfile).where(eq(firmProfile.account_id, account)))[0];
}

/** What devices see: the SMTP password masked. The backup fields exist only on the desktop
 *  server; they're included so the client's FirmProfile type is the same for both. */
function toClient(profile: FirmProfileRow) {
  return {
    ...profile,
    smtp_pass: profile.smtp_pass ? MASKED_SECRET : '',
    backup_enabled: 0,
    backup_dir: '',
    backup_keep: 30,
  };
}

// GET firm profile
router.get('/firm-profile', async (req: Request, res: Response) => {
  try {
    res.json(toClient(await getFirmProfile(accountId(req))));
  } catch (err: any) {
    console.error('Error fetching firm profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
