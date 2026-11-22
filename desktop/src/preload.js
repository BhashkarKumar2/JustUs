// Preload for the JustUs site view. Exposes a tiny, safe bridge as window.justusDesktop.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('justusDesktop', {
  isDesktop: true,
  platform: process.platform,
  /** @param {{kind?: 'message'|'call'|'call-ended', title: string, body?: string}} payload */
  notify: (payload) => ipcRenderer.send('desktop:notify', {
    kind: payload?.kind,
    title: String(payload?.title ?? ''),
    body: String(payload?.body ?? ''),
  }),
  retry: () => ipcRenderer.send('desktop:retry'),
});
