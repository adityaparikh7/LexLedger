import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';

const PROMPT = 'Choose a folder for LexLedger backups';

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run a command and resolve with its exit code (rejects only if the command could not be started). */
function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { env: { ...process.env, ...env }, windowsHide: true }, (err, stdout, stderr) => {
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (err && typeof code !== 'number') return reject(err); // e.g. ENOENT: command not installed
      resolve({ code: typeof code === 'number' ? code : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** macOS: AppleScript "choose folder". The folder path is passed as an argument, so it needs no escaping. */
async function pickWithAppleScript(startDir?: string): Promise<string | null> {
  const script = [
    'on run argv',
    'activate', // bring the dialog in front of other windows
    'if (count of argv) > 0 then',
    `return POSIX path of (choose folder with prompt "${PROMPT}" default location (POSIX file (item 1 of argv)))`,
    'else',
    `return POSIX path of (choose folder with prompt "${PROMPT}")`,
    'end if',
    'end run',
  ];
  const args = script.flatMap((line) => ['-e', line]);
  if (startDir) args.push(startDir);
  const result = await run('osascript', args);
  if (result.code !== 0) {
    if (result.stderr.includes('-128')) return null; // user cancelled
    throw new Error(result.stderr.trim() || `osascript exited with code ${result.code}`);
  }
  return result.stdout.trim();
}

/** Windows: WinForms FolderBrowserDialog. The start folder is passed via an env var, so it needs no escaping. */
async function pickWithPowerShell(startDir?: string): Promise<string | null> {
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    `$dialog.Description = '${PROMPT}'`,
    '$dialog.ShowNewFolderButton = $true',
    'if ($env:LEXLEDGER_START_DIR) { $dialog.SelectedPath = $env:LEXLEDGER_START_DIR }',
    // An invisible top-most owner keeps the dialog in front of the app window
    '$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }',
    'if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }',
    '$owner.Dispose()',
  ].join('; ');
  const result = await run(
    'powershell',
    ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { LEXLEDGER_START_DIR: startDir ?? '' }
  );
  if (result.code !== 0) throw new Error(result.stderr.trim() || `PowerShell exited with code ${result.code}`);
  return result.stdout.trim() || null; // empty output = cancelled
}

/** Linux: zenity (exit code 1 = cancelled). */
async function pickWithZenity(startDir?: string): Promise<string | null> {
  const args = ['--file-selection', '--directory', `--title=${PROMPT}`];
  if (startDir) args.push(`--filename=${startDir}/`);
  const result = await run('zenity', args);
  if (result.code === 1) return null;
  if (result.code !== 0) throw new Error(result.stderr.trim() || `zenity exited with code ${result.code}`);
  return result.stdout.trim() || null;
}

/** Open the system folder dialog on this machine. Resolves to the chosen folder, or null if cancelled. */
export async function chooseFolder(startDir?: string): Promise<string | null> {
  const start = startDir && fs.existsSync(startDir) && fs.statSync(startDir).isDirectory() ? startDir : undefined;
  let picked: string | null;
  switch (os.platform()) {
    case 'darwin':
      picked = await pickWithAppleScript(start);
      break;
    case 'win32':
      picked = await pickWithPowerShell(start);
      break;
    default:
      picked = await pickWithZenity(start);
  }
  // AppleScript returns folders with a trailing slash
  return picked ? picked.replace(/[\\/]+$/, '') || picked : null;
}
