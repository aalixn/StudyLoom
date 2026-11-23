const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setAppUserModelId('com.aalian.studyloom'); // lets break and focus notifications show on Windows
function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 760, minWidth: 640, minHeight: 420, backgroundColor: '#000000', title: 'Studyloom',
    icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (e, input) => { if (input.key === 'F11' && input.type === 'keyDown') win.setFullScreen(!win.isFullScreen()); });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
