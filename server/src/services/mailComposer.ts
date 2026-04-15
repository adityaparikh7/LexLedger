import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export type EmailClient = 'apple_mail' | 'outlook' | 'mailto';

interface ComposeEmailOptions {
  to: string;
  subject: string;
  body: string;
  attachmentPath?: string;
  emailClient: EmailClient;
}

/** Escape a string for safe use inside an AppleScript double-quoted string. */
function escapeAppleScript(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/** Compose an email in Apple Mail via AppleScript, optionally with a PDF attachment. */
async function composeWithAppleMail(opts: ComposeEmailOptions): Promise<void> {
  const { to, subject, body, attachmentPath } = opts;

  const attachmentLine = attachmentPath
    ? `make new attachment with properties {file name:POSIX file "${escapeAppleScript(attachmentPath)}"} at after the last paragraph`
    : '';

  const script = `
tell application "Mail"
  set newMessage to make new outgoing message with properties {subject:"${escapeAppleScript(subject)}", content:"${escapeAppleScript(body)}", visible:true}
  tell newMessage
    make new to recipient at end of to recipients with properties {address:"${escapeAppleScript(to)}"}
    ${attachmentLine}
  end tell
  activate
end tell
  `.trim();

  await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
}

/** Compose an email in Microsoft Outlook via AppleScript, optionally with a PDF attachment. */
async function composeWithOutlook(opts: ComposeEmailOptions): Promise<void> {
  const { to, subject, body, attachmentPath } = opts;

  const attachmentLine = attachmentPath
    ? `make new attachment at newMessage with properties {file:POSIX file "${escapeAppleScript(attachmentPath)}"}`
    : '';

  const script = `
tell application "Microsoft Outlook"
  set newMessage to make new outgoing message with properties {subject:"${escapeAppleScript(subject)}", content:"${escapeAppleScript(body)}"}
  make new recipient at newMessage with properties {email address:{address:"${escapeAppleScript(to)}"}}
  ${attachmentLine}
  open newMessage
  activate
end tell
  `.trim();

  await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
}

/** Open a mailto: link using the system default handler. Cannot attach files. */
async function composeWithMailto(opts: ComposeEmailOptions): Promise<void> {
  const { to, subject, body } = opts;
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  await execAsync(`open "${mailto}"`);
}

/**
 * Compose an email using the user's chosen mail client.
 * On macOS, Apple Mail and Outlook support auto-attaching PDFs via AppleScript.
 * Falls back to mailto: (no auto-attachment) on unsupported platforms.
 */
export async function composeEmail(opts: ComposeEmailOptions): Promise<{ method: EmailClient; autoAttached: boolean }> {
  const platform = os.platform();

  // Only macOS supports AppleScript-based composition
  if (platform !== 'darwin') {
    await composeWithMailto(opts);
    return { method: 'mailto', autoAttached: false };
  }

  try {
    switch (opts.emailClient) {
      case 'apple_mail':
        await composeWithAppleMail(opts);
        return { method: 'apple_mail', autoAttached: !!opts.attachmentPath };

      case 'outlook':
        await composeWithOutlook(opts);
        return { method: 'outlook', autoAttached: !!opts.attachmentPath };

      case 'mailto':
      default:
        await composeWithMailto(opts);
        return { method: 'mailto', autoAttached: false };
    }
  } catch (err: any) {
    console.error(`Failed to compose with ${opts.emailClient}, falling back to mailto:`, err.message);
    // Fallback to mailto if the chosen client fails
    try {
      await composeWithMailto(opts);
    } catch (_) {
      // Ignore fallback errors
    }
    return { method: 'mailto', autoAttached: false };
  }
}

/**
 * Save a PDF buffer to a temporary file and return the path.
 * The file is saved in the OS temp directory for the mail client to pick up.
 */
export function saveTempPDF(pdfBuffer: Buffer, filename: string): string {
  const tempDir = path.join(os.tmpdir(), 'lexledger-mail');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  // Clean the filename
  const safeName = filename.replace(/[/\\:*?"<>|]/g, '-').trim();
  const filePath = path.join(tempDir, safeName);
  fs.writeFileSync(filePath, pdfBuffer);
  return filePath;
}
