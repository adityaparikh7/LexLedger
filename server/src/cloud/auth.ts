import crypto from 'crypto';
import { promisify } from 'util';
import { Router, Request, Response, NextFunction, CookieOptions } from 'express';
import rateLimit from 'express-rate-limit';
import { and, eq, gt, sql } from 'drizzle-orm';
import { getDb } from './db';
import { accounts, users, sessions, firmProfile } from './db/schema';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; accountId: string };
    }
  }
}

const SESSION_COOKIE = 'll_session';
// Long-lived so a phone that is offline for weeks is still signed in when it reconnects
const SESSION_DAYS = 90;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
// Sliding expiry: extend at most once a day so every request doesn't write to the DB
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number, options: crypto.ScryptOptions) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, N, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(actual, expected);
}

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('base64url');

function cookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MS,
  };
}

async function startSession(req: Request, res: Response, userId: string, accountId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  await getDb().insert(sessions).values({
    token_hash: hashToken(token),
    user_id: userId,
    account_id: accountId,
    user_agent: req.get('user-agent')?.slice(0, 300) ?? null,
    expires_at: new Date(Date.now() + SESSION_MS),
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions(req));
}

/** Rejects unauthenticated requests with 401; otherwise sets req.auth. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return res.status(401).json({ error: 'Please sign in' });
    const db = getDb();
    const tokenHash = hashToken(token);
    const [session] = await db.select().from(sessions)
      .where(and(eq(sessions.token_hash, tokenHash), gt(sessions.expires_at, sql`now()`)));
    if (!session) {
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    }
    if (Date.now() - session.last_used_at.getTime() > RENEW_AFTER_MS) {
      await db.update(sessions)
        .set({ last_used_at: sql`now()`, expires_at: new Date(Date.now() + SESSION_MS) })
        .where(eq(sessions.token_hash, tokenHash));
      res.cookie(SESSION_COOKIE, token, cookieOptions(req));
    }
    req.auth = { userId: session.user_id, accountId: session.account_id };
    next();
  } catch (err) {
    next(err);
  }
}

/** The signed-in account. Only call from routes behind requireAuth. */
export function accountId(req: Request): string {
  if (!req.auth) throw new Error('requireAuth must run before this route');
  return req.auth.accountId;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

const router = Router();

// POST create an account (one firm, one login)
router.post('/signup', authLimiter, async (req: Request, res: Response) => {
  try {
    if (process.env.ALLOW_SIGNUP === 'false') {
      return res.status(403).json({ error: 'Sign-ups are closed on this server' });
    }
    const { email, password, firm_name, signup_code } = req.body ?? {};
    if (process.env.SIGNUP_CODE && signup_code !== process.env.SIGNUP_CODE) {
      return res.status(403).json({ error: 'Invalid sign-up code' });
    }
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const firmName = typeof firm_name === 'string' ? firm_name.trim() : '';

    const db = getDb();
    const [existing] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = lower(${cleanEmail})`);
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const passwordHash = await hashPassword(password);
    const { userId, newAccountId } = await db.transaction(async (tx) => {
      const [account] = await tx.insert(accounts).values({ name: firmName }).returning();
      const [user] = await tx.insert(users).values({ account_id: account.id, email: cleanEmail, password_hash: passwordHash }).returning();
      await tx.insert(firmProfile).values({ account_id: account.id, firm_name: firmName, firm_email: cleanEmail });
      return { userId: user.id, newAccountId: account.id };
    });
    await startSession(req, res, userId, newAccountId);
    res.status(201).json({ user: { email: cleanEmail }, account: { id: newAccountId, name: firmName } });
  } catch (err: any) {
    console.error('Error signing up:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST sign in
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const db = getDb();
    const [user] = await db.select().from(users).where(sql`lower(${users.email}) = lower(${email.trim()})`);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }
    const [account] = await db.select().from(accounts).where(eq(accounts.id, user.account_id));
    await startSession(req, res, user.id, user.account_id);
    res.json({ user: { email: user.email }, account: { id: account.id, name: account.name } });
  } catch (err: any) {
    console.error('Error signing in:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST sign out this device
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await getDb().delete(sessions).where(eq(sessions.token_hash, hashToken(token)));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ message: 'Signed out' });
  } catch (err: any) {
    console.error('Error signing out:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET the signed-in user. The client also uses this to tell the cloud server from the desktop one.
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, req.auth!.userId));
    const [account] = await db.select().from(accounts).where(eq(accounts.id, req.auth!.accountId));
    res.json({ user, account: { id: account.id, name: account.name } });
  } catch (err: any) {
    console.error('Error fetching current user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
