const {
  app, BrowserWindow, WebContentsView, Tray, Menu, Notification,
  nativeImage, ipcMain, session, shell, screen,
} = require('electron');
const path = require('path');
const fs = require('fs');
const {
  APP_URL, APP_ORIGIN, TITLEBAR_HEIGHT, TITLEBAR_COLOR, TITLEBAR_SYMBOL_COLOR,
} = require('./config');

const APP_ID = 'app.justus.desktop';
const ICON_PATH = path.join(__dirname, 'tray.png');
const WINDOW_ICON = path.join(__dirname, '..', 'build', 'icon.ico');
const OFFLINE_PAGE = path.join(__dirname, 'offline.html');
const OFFLINE_URL = require('url').pathToFileURL(OFFLINE_PAGE).href;
const STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json');
const ALLOWED_PERMISSIONS = new Set([
  'media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write',
  'fullscreen', 'pointerLock', 'speaker-selection', 'geolocation',
]);

let win = null;
let view = null;
let tray = null;
let isQuitting = false;
let unread = 0;
let pendingMaximize = false; // hidden (tray) start that should open maximized
const LOGIN_ARGS = ['--hidden'];
const liveNotifications = new Set(); // keep refs so click handlers aren't GC'd

// ---------- single instance ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => showWindow());
app.setAppUserModelId(APP_ID);

// ---------- helpers ----------
const isAppUrl = (url) => {
  try { return new URL(url).origin === APP_ORIGIN; } catch { return false; }
};

// the window can be torn down during quit (or unexpectedly); never touch a destroyed one
const winAlive = () => !!win && !win.isDestroyed();
const viewAlive = () => !!view && !view.webContents.isDestroyed();

const isAppBlob = (url) => url.startsWith('blob:') && isAppUrl(url);

function openExternal(url) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') shell.openExternal(url);
  } catch { /* ignore malformed */ }
}

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
    // make sure the saved position is still on a connected display
    const area = screen.getDisplayMatching(s).workArea;
    const visible = s.x < area.x + area.width && s.x + s.width > area.x
      && s.y < area.y + area.height && s.y + s.height > area.y;
    return visible ? s : { width: s.width, height: s.height, isMaximized: s.isMaximized };
  } catch {
    return { width: 1200, height: 800 };
  }
}

let saveTimer = null;
function saveWindowState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    try {
      fs.writeFileSync(STATE_FILE(), JSON.stringify({ ...bounds, isMaximized: win.isMaximized() }));
    } catch { /* non-fatal */ }
  }, 400);
}

function layoutView() {
  if (!winAlive() || !viewAlive()) return;
  const [width, height] = win.getContentSize();
  const top = isFullScreen() ? 0 : TITLEBAR_HEIGHT;
  view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
}

function showWindow() {
  if (!winAlive()) { if (app.isReady() && !isQuitting) createWindow({ hidden: false }); return; }
  if (win.isMinimized()) win.restore();
  if (pendingMaximize) { pendingMaximize = false; win.maximize(); } // maximize() also shows
  win.show();
  win.focus();
}

function setUnread(count) {
  unread = count;
  if (!winAlive()) return;
  win.setTitle(count > 0 ? `JustUs (${count})` : 'JustUs');
  win.webContents.send('titlebar:unread', count);
  if (tray) tray.setToolTip(count > 0 ? `JustUs — ${count} unread` : 'JustUs');
  if (count === 0) {
    win.setOverlayIcon(null, '');
    win.flashFrame(false);
  }
  // non-zero: titlebar renderer draws the badge and replies with 'titlebar:badge-image'
}

// load failures are handled by 'did-fail-load'; swallow the promise rejection
const ignore = () => {};

function loadApp() {
  if (!viewAlive()) return;
  view.webContents.loadURL(APP_URL).catch(ignore);
}

// layout: title bar strip on top, site below (full window while fullscreen)
function isFullScreen() { return winAlive() && (win.isFullScreen() || htmlFullScreen); }
let htmlFullScreen = false;

// ---------- window ----------
function createWindow({ hidden }) {
  const state = loadWindowState();

  win = new BrowserWindow({
    x: state.x, y: state.y, width: state.width, height: state.height,
    minWidth: 420, minHeight: 500,
    show: false,
    title: 'JustUs',
    icon: WINDOW_ICON,
    backgroundColor: TITLEBAR_COLOR,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: TITLEBAR_COLOR, symbolColor: TITLEBAR_SYMBOL_COLOR, height: TITLEBAR_HEIGHT },
    webPreferences: {
      preload: path.join(__dirname, 'titlebar-preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'titlebar.html')).catch(ignore);

  view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
      backgroundThrottling: false, // keep the socket + notifications alive while hidden in the tray
    },
  });
  view.setBackgroundColor('#ffffff');
  win.contentView.addChildView(view);
  layoutView();

  win.webContents.once('did-finish-load', () => {
    if (hidden) {
      pendingMaximize = !!state.isMaximized; // maximize() would show the window; defer to first show
    } else {
      if (state.isMaximized) win.maximize();
      win.show();
    }
  });

  for (const ev of ['resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen']) {
    win.on(ev, () => { layoutView(); saveWindowState(); });
  }
  win.on('move', saveWindowState);
  win.on('focus', () => {
    setUnread(0);
    closeCallToasts(); // the in-app call screen takes over
    if (viewAlive()) view.webContents.focus();
  });
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
  // if the window is destroyed anyway (not via quit), drop it; showWindow() rebuilds it from the tray
  win.on('closed', () => {
    if (viewAlive()) view.webContents.close();
    win = null;
    view = null;
  });

  wireSiteView();
  loadApp();
}

function wireSiteView() {
  const wc = view.webContents;

  // links / popups that leave the app go to the system browser
  // except blob: URLs the app creates for image/document previews, which open in an app window
  wc.setWindowOpenHandler(({ url }) => {
    if (isAppBlob(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1000, height: 750, autoHideMenuBar: true,
          backgroundColor: '#ffffff', icon: WINDOW_ICON,
          webPreferences: { contextIsolation: true, sandbox: true },
        },
      };
    }
    openExternal(url);
    return { action: 'deny' };
  });
  wc.on('did-create-window', (child) => {
    child.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
    child.webContents.on('will-navigate', (e, url) => {
      if (isAppBlob(url)) return; // the preview itself
      e.preventDefault();
      openExternal(url);
    });
  });

  // HTML fullscreen (videos): drop the title bar and fill the window/screen
  wc.on('enter-html-full-screen', () => { htmlFullScreen = true; if (winAlive()) win.setFullScreen(true); layoutView(); });
  wc.on('leave-html-full-screen', () => { htmlFullScreen = false; if (winAlive()) win.setFullScreen(false); layoutView(); });
  wc.on('will-navigate', (e, url) => {
    if (!isAppUrl(url) && url !== OFFLINE_URL && !url.startsWith(OFFLINE_URL + '?')) {
      e.preventDefault();
      openExternal(url);
    }
  });

  // offline / backend-unreachable page
  wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 /* ABORTED */) return;
    wc.loadFile(OFFLINE_PAGE, {
      query: { reason: errorDescription || String(errorCode) },
    }).catch(ignore);
  });

  wc.on('page-title-updated', (e) => e.preventDefault()); // title is managed by the shell

  // keyboard shortcuts (there's no app menu)
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const key = input.key.toLowerCase();
    if (input.key === 'F5' || (ctrl && key === 'r')) { e.preventDefault(); loadApp(); }
    else if (input.key === 'F12' || (ctrl && input.shift && key === 'i')) { e.preventDefault(); wc.toggleDevTools(); }
    else if (ctrl && (key === '=' || key === '+')) { e.preventDefault(); wc.setZoomLevel(wc.getZoomLevel() + 0.5); }
    else if (ctrl && key === '-') { e.preventDefault(); wc.setZoomLevel(wc.getZoomLevel() - 0.5); }
    else if (ctrl && key === '0') { e.preventDefault(); wc.setZoomLevel(0); }
  });

  // right-click menu: spelling suggestions, clipboard, links, images
  wc.on('context-menu', (_e, p) => {
    const items = [];
    if (p.misspelledWord) {
      for (const s of p.dictionarySuggestions.slice(0, 5)) {
        items.push({ label: s, click: () => wc.replaceMisspelling(s) });
      }
      items.push({ label: 'Add to dictionary', click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
      items.push({ type: 'separator' });
    }
    if (p.linkURL) {
      items.push({ label: 'Open link in browser', click: () => openExternal(p.linkURL) });
      items.push({ label: 'Copy link', click: () => require('electron').clipboard.writeText(p.linkURL) });
      items.push({ type: 'separator' });
    }
    if (p.mediaType === 'image') {
      items.push({ label: 'Copy image', click: () => wc.copyImageAt(p.x, p.y) });
      items.push({ type: 'separator' });
    }
    if (p.isEditable) {
      items.push({ role: 'undo', enabled: p.editFlags.canUndo }, { role: 'redo', enabled: p.editFlags.canRedo }, { type: 'separator' });
      items.push({ role: 'cut', enabled: p.editFlags.canCut });
    }
    if (p.isEditable || p.selectionText) items.push({ role: 'copy', enabled: p.editFlags.canCopy });
    if (p.isEditable) items.push({ role: 'paste', enabled: p.editFlags.canPaste }, { role: 'selectAll' });
    while (items.length && items[items.length - 1].type === 'separator') items.pop();
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
}

// ---------- permissions: only the JustUs origin gets mic/camera/notifications ----------
function setupPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = details.requestingUrl || wc.getURL();
    callback(isAppUrl(origin) && ALLOWED_PERMISSIONS.has(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    isAppUrl(requestingOrigin) && ALLOWED_PERMISSIONS.has(permission));
}

// ---------- tray ----------
function buildTrayMenu() {
  // Windows matches the registered command line, so query with the same args we register with
  const openAtLogin = app.getLoginItemSettings({ args: LOGIN_ARGS }).openAtLogin;
  return Menu.buildFromTemplate([
    { label: 'Open JustUs', click: showWindow },
    { label: 'Reload', click: loadApp },
    { type: 'separator' },
    {
      label: 'Launch on startup',
      type: 'checkbox',
      checked: openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, args: LOGIN_ARGS });
        tray.setContextMenu(buildTrayMenu());
      },
    },
    { type: 'separator' },
    { label: 'Quit JustUs', click: () => { isQuitting = true; app.quit(); } },
  ]);
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON_PATH));
  tray.setToolTip('JustUs');
  tray.setContextMenu(buildTrayMenu());
  // (clicking the tray steals focus from the window, so toggle on visibility only)
  tray.on('click', () => (winAlive() && win.isVisible() && !win.isMinimized() ? win.hide() : showWindow()));
}

function closeCallToasts() {
  for (const n of [...liveNotifications]) {
    if (n.isCall) { liveNotifications.delete(n); n.close(); }
  }
}

// ---------- IPC ----------
const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

function setupIpc() {
  // from the JustUs site (via preload.js)
  ipcMain.on('desktop:notify', (e, payload) => {
    const frameUrl = e.senderFrame?.url; // senderFrame is null if the frame navigated away
    if (!winAlive() || !viewAlive()) return;
    if (e.sender !== view.webContents || !frameUrl || !isAppUrl(frameUrl)) return;
    if (!payload || typeof payload !== 'object') return;

    if (payload.kind === 'call-ended') { closeCallToasts(); return; } // caller hung up
    const kind = payload.kind === 'call' ? 'call' : 'message';
    const title = clip(payload.title, 80) || 'JustUs';
    const body = clip(payload.body, 200);

    const appFocused = win.isVisible() && win.isFocused() && !win.isMinimized();
    if (appFocused) return; // user is looking at the app; no toast, no badge

    if (kind === 'message') {
      setUnread(unread + 1);
      win.flashFrame(true);
    } else {
      // incoming call: surface the window without stealing focus
      if (!win.isVisible() || win.isMinimized()) win.showInactive();
      win.flashFrame(true);
    }

    if (!Notification.isSupported()) return;
    const n = new Notification({
      title, body, icon: nativeImage.createFromPath(ICON_PATH),
      silent: false,
      urgency: kind === 'call' ? 'critical' : 'normal',
      timeoutType: kind === 'call' ? 'never' : 'default',
    });
    n.isCall = kind === 'call';
    liveNotifications.add(n);
    const drop = () => liveNotifications.delete(n);
    n.on('click', () => { drop(); showWindow(); });  // showWindow() is destroy-safe
    n.on('close', drop);
    n.show();
  });

  ipcMain.on('desktop:retry', (e) => {
    if (viewAlive() && e.sender === view.webContents) loadApp();
  });

  // from the title bar renderer: rendered badge PNG for the taskbar overlay
  ipcMain.on('titlebar:badge-image', (e, dataUrl, count) => {
    if (!winAlive() || e.sender !== win.webContents || count !== unread || unread === 0) return;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return;
    win.setOverlayIcon(nativeImage.createFromDataURL(dataUrl), `${count} unread messages`);
  });

  ipcMain.on('titlebar:reload', (e) => {
    if (winAlive() && e.sender === win.webContents) loadApp();
  });
}

// ---------- lifecycle ----------
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  setupPermissions();
  setupIpc();
  createWindow({ hidden: process.argv.includes('--hidden') });
  createTray();
});

app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => { /* stay alive in the tray */ });
