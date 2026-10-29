import { contextBridge, ipcRenderer } from 'electron';

// Expose a minimal API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  // Native folder picker, opened at defaultPath if given; resolves to the chosen path, or null if cancelled
  selectFolder: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('dialog:select-folder', defaultPath),
});
