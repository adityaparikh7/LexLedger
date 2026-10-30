import { contextBridge, ipcRenderer } from 'electron';

// Expose a minimal API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  // Native folder picker, opened at defaultPath if given; resolves to the chosen path, or null if cancelled
  selectFolder: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('dialog:select-folder', defaultPath),
  // Data left by earlier desktop versions (a local SQLite database), for importing into the cloud account
  findLegacyData: (): Promise<{ source: 'database' | 'backup'; modifiedAt: string; size: number } | null> =>
    ipcRenderer.invoke('legacy:find'),
  readLegacyData: (): Promise<Uint8Array | null> => ipcRenderer.invoke('legacy:read'),
});
