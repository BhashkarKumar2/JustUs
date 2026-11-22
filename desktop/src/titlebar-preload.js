// Preload for the title bar page (the BrowserWindow's own contents).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('titlebar', {
  onUnread: (cb) => ipcRenderer.on('titlebar:unread', (_e, count) => cb(count)),
  sendBadge: (dataUrl, count) => ipcRenderer.send('titlebar:badge-image', dataUrl, count),
  reload: () => ipcRenderer.send('titlebar:reload'),
});
