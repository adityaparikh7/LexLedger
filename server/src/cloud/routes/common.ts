import { Request, Response, NextFunction } from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);

/** router.param handler: a malformed id is a 404, not a database error. */
export function uuidParam(_req: Request, res: Response, next: NextFunction, value: string) {
  if (!isUuid(value)) return res.status(404).json({ error: 'Not found' });
  next();
}

/** Builds the standardised fee-memo base name (no extension).
 *  Format: "Fee Memo No- {invoice_number} {client_name} {dd-mm-yyyy}"
 *  Special characters unsafe for filenames are stripped/replaced. */
export function buildFeeMemoName(invoiceNumber: string, clientName: string, date: string): string {
  // Reformat yyyy-mm-dd → dd-mm-yyyy
  const parts = date.split('T')[0].split('-');
  const formattedDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : date;
  return `Fee Memo No- ${invoiceNumber} ${clientName} ${formattedDate}`
    .replace(/[\/\\:*?"<>|]/g, '-') // replace chars illegal on Windows/macOS
    .trim();
}

/** The `:id` route parameter (already checked by uuidParam). */
export const idParam = (req: Request): string => String(req.params.id);
