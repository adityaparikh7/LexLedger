import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export type EmailClient = 'apple_mail' | 'outlook' | 'gmail_web' | 'outlook_web' | 'mailto';

interface ComposeEmailOptions {
  to: string;
  subject: string;
  body: string;
  attachmentPath?: string;
  emailClient: EmailClient;
}

interface ComposeResult {
  method: EmailClient;
  autoAttached: boolean;
  triggerPdfDownload: boolean;
}

/** Escape a string for safe use inside an AppleScript double-quoted string. */
function escapeAppleScript(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/** Escape a string for safe use inside a PowerShell single-quoted string. */
function escapePowerShell(str: string): string {
  return str.replace(/'/g, "''");
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

/** Compose an email in Microsoft Outlook via AppleScript (macOS), optionally with a PDF attachment. */
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

/** Compose an email in Microsoft Outlook on Windows via PowerShell COM automation, with PDF auto-attachment. */
async function composeWithOutlookWindows(opts: ComposeEmailOptions): Promise<void> {
  const { to, subject, body, attachmentPath } = opts;

  const lines = [
    `$outlook = New-Object -ComObject Outlook.Application`,
    `$mail = $outlook.CreateItem(0)`,
    `$mail.To = '${escapePowerShell(to)}'`,
    `$mail.Subject = '${escapePowerShell(subject)}'`,
    `$mail.Body = '${escapePowerShell(body)}'`,
  ];
  if (attachmentPath) {
    // Convert forward slashes to backslashes for Windows paths
    const winPath = attachmentPath.replace(/\//g, '\\');
    lines.push(`$mail.Attachments.Add('${escapePowerShell(winPath)}')`);
  }
  lines.push(`$mail.Display()`);

  const psCommand = lines.join('; ');
  await execAsync(`powershell -NoProfile -Command "${psCommand.replace(/"/g, '\\"')}"`);
}

/** Open a URL in the system default browser, cross-platform. */
async function openUrl(url: string): Promise<void> {
  const platform = os.platform();
  if (platform === 'win32') {
    await execAsync(`start "" "${url}"`);
  } else if (platform === 'linux') {
    await execFileAsync('xdg-open', [url]);
  } else {
    await execFileAsync('open', [url]);
  }
}

/** Compose an email via Gmail Web compose URL. Cannot attach files. */
async function composeWithGmailWeb(opts: ComposeEmailOptions): Promise<void> {
  const { to, subject, body } = opts;
  const url = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  await openUrl(url);
}

/** Compose an email via Outlook Web compose URL. Cannot attach files. */
async function composeWithOutlookWeb(opts: ComposeEmailOptions): Promise<void> {
  const { to, subject, body } = opts;
  const url = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  await openUrl(url);
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
 * Compose an email using the user's chosen mail client.
 * Handles per-platform dispatch: AppleScript on macOS, PowerShell COM on Windows,
 * browser URLs for web clients, and mailto: as the universal fallback.
 */
export async function composeEmail(opts: ComposeEmailOptions): Promise<ComposeResult> {
  const platform = os.platform();

  try {
    switch (opts.emailClient) {
      case 'apple_mail':
        if (platform === 'darwin') {
          await composeWithAppleMail(opts);
          return { method: 'apple_mail', autoAttached: !!opts.attachmentPath, triggerPdfDownload: false };
        }
        // Apple Mail not available on non-macOS — fallback to mailto
        await composeWithMailto(opts);
        return { method: 'mailto', autoAttached: false, triggerPdfDownload: false };

      case 'outlook':
        if (platform === 'darwin') {
          await composeWithOutlookMac(opts);
          return { method: 'outlook', autoAttached: !!opts.attachmentPath, triggerPdfDownload: false };
        }
        if (platform === 'win32') {
          try {
            await composeWithOutlookWindows(opts);
            return { method: 'outlook', autoAttached: !!opts.attachmentPath, triggerPdfDownload: false };
          } catch (winErr: any) {
            console.error('Outlook COM failed, falling back to mailto:', winErr.message);
            await composeWithMailto(opts);
            return { method: 'mailto', autoAttached: false, triggerPdfDownload: false };
          }
        }
        // Linux — fallback to mailto
        await composeWithMailto(opts);
        return { method: 'mailto', autoAttached: false, triggerPdfDownload: false };

      case 'gmail_web':
        await composeWithGmailWeb(opts);
        return { method: 'gmail_web', autoAttached: false, triggerPdfDownload: true };

      case 'outlook_web':
        await composeWithOutlookWeb(opts);
        return { method: 'outlook_web', autoAttached: false, triggerPdfDownload: true };

      case 'mailto':
      default:
        await composeWithMailto(opts);
        return { method: 'mailto', autoAttached: false, triggerPdfDownload: false };
    }
  } catch (err: any) {
    console.error(`Failed to compose with ${opts.emailClient}, falling back to mailto:`, err.message);
    // Fallback to mailto if the chosen client fails
    try {
      await composeWithMailto(opts);
    } catch (_) {
      // Ignore fallback errors
    }
    return { method: 'mailto', autoAttached: false, triggerPdfDownload: false };
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
