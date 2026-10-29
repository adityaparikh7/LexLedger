import { contextBridge, ipcRenderer } from 'electron';

// Expose a minimal API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  // Native folder picker; resolves to the chosen path, or null if cancelled
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:select-folder'),
});
