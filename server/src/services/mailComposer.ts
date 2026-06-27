import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export type EmailClient =
  | 'apple_mail'
  | 'outlook'
  | 'mailto'
  | 'gmail'
  | 'outlook_web'
  | 'yahoo_mail';

interface ComposeEmailOptions {
  to: string;
  subject: string;
  body: string;
  attachmentPath?: string;
  emailClient: EmailClient;
}

export interface ComposeEmailResult {
  method: EmailClient;
  autoAttached: boolean;
  /** For browser-based clients: the compose URL to open in a new tab */
  composeUrl?: string;
  /** True when the PDF was silently downloaded and must be attached manually */
  pdfDownloaded?: boolean;
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

  await execFileAsync('osascript', ['-e', script]);
}

/** Compose an email in Microsoft Outlook on macOS via AppleScript, optionally with a PDF attachment. */
async function composeWithOutlookMac(opts: ComposeEmailOptions): Promise<void> {
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

  await execFileAsync('osascript', ['-e', script]);
}

/**
 * Compose an email in Microsoft Outlook on Windows using PowerShell COM automation.
 * Opens a draft compose window with the PDF auto-attached.
 * Throws if Outlook is not installed or PowerShell fails.
 */
async function composeWithOutlookWindows(opts: ComposeEmailOptions): Promise<void> {
  const { to, subject, body, attachmentPath } = opts;

  // Escape single-quotes for PowerShell string embedding
  const escapePwsh = (str: string) => str.replace(/'/g, "''").replace(/\r?\n/g, '`n');

  const attachmentCmd = attachmentPath
    ? `$mail.Attachments.Add('${escapePwsh(attachmentPath)}')`
    : '';

  const script = `
$outlook = New-Object -ComObject Outlook.Application
$mail = $outlook.CreateItem(0)
$mail.To = '${escapePwsh(to)}'
$mail.Subject = '${escapePwsh(subject)}'
$mail.Body = '${escapePwsh(body)}'
${attachmentCmd}
$mail.Display()
  `.trim();

  // Run via PowerShell
  await execAsync(`powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`);
}

/** Open a mailto: link using the system default handler. Cannot attach files. */
async function composeWithMailto(opts: ComposeEmailOptions): Promise<void> {
  const { to, subject, body } = opts;
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const platform = os.platform();
  if (platform === 'win32') {
    await execAsync(`start "" "${mailto}"`);
  } else if (platform === 'linux') {
    await execFileAsync('xdg-open', [mailto]);
  } else {
    await execFileAsync('open', [mailto]);
  }
}

/**
 * Build a browser-based compose URL for Gmail, Outlook Web, or Yahoo Mail.
 * These URLs pre-fill recipient, subject, and body in the web compose window.
 * Attachments cannot be added via URL — the PDF must be downloaded separately.
 */
function buildBrowserComposeUrl(opts: ComposeEmailOptions): string {
  const { to, subject, body, emailClient } = opts;

  switch (emailClient) {
    case 'gmail':
      return (
        'https://mail.google.com/mail/?view=cm' +
        `&to=${encodeURIComponent(to)}` +
        `&su=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`
      );

    case 'outlook_web':
      return (
        'https://outlook.live.com/mail/0/deeplink/compose' +
        `?to=${encodeURIComponent(to)}` +
        `&subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`
      );

    case 'yahoo_mail':
      return (
        'https://compose.mail.yahoo.com/' +
        `?to=${encodeURIComponent(to)}` +
        `&subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`
      );

    default:
      throw new Error(`Unsupported browser client: ${emailClient}`);
  }
}

/**
 * Compose an email using the user's chosen mail client.
 *
 * - macOS Apple Mail / Outlook: AppleScript with auto-attach
 * - Windows Outlook: PowerShell COM with auto-attach (falls back to mailto on failure)
 * - Browser clients (Gmail, Outlook Web, Yahoo Mail): returns a composeUrl to open in browser
 * - mailto: system default handler, no attachment
 */
export async function composeEmail(opts: ComposeEmailOptions): Promise<ComposeEmailResult> {
  const platform = os.platform();

  // ── Browser-based clients ───────────────────────────────────────────────────
  if (
    opts.emailClient === 'gmail' ||
    opts.emailClient === 'outlook_web' ||
    opts.emailClient === 'yahoo_mail'
  ) {
    const composeUrl = buildBrowserComposeUrl(opts);
    return {
      method: opts.emailClient,
      autoAttached: false,
      composeUrl,
      pdfDownloaded: !!opts.attachmentPath,
    };
  }

  // ── mailto (system default) ────────────────────────────────────────────────
  if (opts.emailClient === 'mailto') {
    await composeWithMailto(opts);
    return { method: 'mailto', autoAttached: false };
  }

  // ── Apple Mail (macOS only) ────────────────────────────────────────────────
  if (opts.emailClient === 'apple_mail') {
    if (platform !== 'darwin') {
      // Fallback to mailto on non-macOS
      await composeWithMailto(opts);
      return { method: 'mailto', autoAttached: false };
    }
    try {
      await composeWithAppleMail(opts);
      return { method: 'apple_mail', autoAttached: !!opts.attachmentPath };
    } catch (err: any) {
      console.error('Apple Mail AppleScript failed, falling back to mailto:', err.message);
      await composeWithMailto(opts).catch(() => {});
      return { method: 'mailto', autoAttached: false };
    }
  }

  // ── Microsoft Outlook ──────────────────────────────────────────────────────
  if (opts.emailClient === 'outlook') {
    if (platform === 'darwin') {
      // macOS: use AppleScript
      try {
        await composeWithOutlookMac(opts);
        return { method: 'outlook', autoAttached: !!opts.attachmentPath };
      } catch (err: any) {
        console.error('Outlook AppleScript failed, falling back to mailto:', err.message);
        await composeWithMailto(opts).catch(() => {});
        return { method: 'mailto', autoAttached: false };
      }
    } else if (platform === 'win32') {
      // Windows: use PowerShell COM automation
      try {
        await composeWithOutlookWindows(opts);
        return { method: 'outlook', autoAttached: !!opts.attachmentPath };
      } catch (err: any) {
        console.error('Windows Outlook PowerShell COM failed, falling back to mailto:', err.message);
        // Fallback to mailto — caller will show Download PDF button in UI
        try {
          await composeWithMailto(opts);
        } catch (_) {}
        return { method: 'mailto', autoAttached: false, pdfDownloaded: !!opts.attachmentPath };
      }
    } else {
      // Linux or other: just use mailto
      await composeWithMailto(opts).catch(() => {});
      return { method: 'mailto', autoAttached: false };
    }
  }

  // ── Unrecognised client ────────────────────────────────────────────────────
  await composeWithMailto(opts).catch(() => {});
  return { method: 'mailto', autoAttached: false };
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
