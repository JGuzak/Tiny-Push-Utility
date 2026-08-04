const { app, BrowserWindow, Menu, ipcMain, powerMonitor, session, clipboard } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const nodeFs = require('node:fs');
const fs = require('node:fs/promises');
const devices = require('./devices');
const logs = require('./logs');
const tutorials = require('./tutorials');
const network = require('./network');
const ssh = require('./ssh');

const IS_SMOKE_TEST = process.argv.includes('--smoke-test');
const NETWORK_POLL_INTERVAL_MS = 5000;

let mainWindow = null;
let networkWatcher = null;
let sshKeyWatcher = null;
let sshKeyStatusPublishTimer = null;
let lastSshKeyStatusSignature = null;
let lastNetworkSignature = null;
const activeSshProbes = new Set();

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });
}

const PUSH_COOKIE_STORE_RETENTION_MS = 10 * 60 * 1000;
const pushCookieStores = new Map();
const pushHostStoreKeys = new Map();

function getSshSetupWebviewPreloadUrl() {
  return pathToFileURL(path.join(__dirname, 'ssh-setup-webview-preload.js')).toString();
}

function getPushCookieStorePath() {
  return path.join(app.getPath('userData'), 'push-cookies.json');
}

function getPushCookieUrl(host) {
  const normalizedHost = validatePushHost(host);
  return `http://${normalizedHost}`;
}

function validatePushHost(host) {
  if (!host || typeof host !== 'string') {
    throw new Error('A Push hostname or IP address is required.');
  }

  const normalizedHost = host.trim().toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(normalizedHost)) {
    throw new Error('Push host can only contain letters, numbers, dots, underscores, and hyphens.');
  }

  return normalizedHost;
}

function validatePushCookieStoreKey(storeKey) {
  if (!storeKey || typeof storeKey !== 'string') {
    throw new Error('A Push cookie store key is required.');
  }

  return validatePushHost(storeKey);
}

function getHeaderValue(headers, headerName) {
  const requestedName = headerName.toLowerCase();
  const headerKey = Object.keys(headers).find((key) => key.toLowerCase() === requestedName);
  return headerKey ? headers[headerKey] : undefined;
}

function setHeaderValue(headers, headerName, value) {
  const existingKey = Object.keys(headers).find((key) => key.toLowerCase() === headerName.toLowerCase());
  headers[existingKey || headerName] = value;
}

function getRequestHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function getRequestPath(url) {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return '/';
  }
}

function normalizePushCookieStore(storeKey) {
  const normalizedStoreKey = validatePushCookieStoreKey(storeKey);
  const existingStore = pushCookieStores.get(normalizedStoreKey);

  if (existingStore) {
    existingStore.lastConnectedAt = Date.now();
    existingStore.expiresAfter = null;
    return existingStore;
  }

  const nextStore = {
    cookies: new Map(),
    expiresAfter: null,
    lastConnectedAt: Date.now(),
    storeKey: normalizedStoreKey
  };
  pushCookieStores.set(normalizedStoreKey, nextStore);
  return nextStore;
}

function mapPushHostToStore(host, storeKey) {
  const normalizedHost = validatePushHost(host);
  const normalizedStoreKey = validatePushCookieStoreKey(storeKey);
  normalizePushCookieStore(normalizedStoreKey);
  pushHostStoreKeys.set(normalizedHost, normalizedStoreKey);
  return {
    host: normalizedHost,
    storeKey: normalizedStoreKey
  };
}

function getPushCookieStoreForHost(host) {
  const storeKey = pushHostStoreKeys.get(host);
  return storeKey ? pushCookieStores.get(storeKey) || null : null;
}

function parseSetCookieHeader(setCookieHeader, requestHost) {
  const parts = setCookieHeader.split(';').map((part) => part.trim()).filter(Boolean);
  const [nameValue, ...attributes] = parts;
  const separatorIndex = nameValue.indexOf('=');

  if (separatorIndex <= 0) {
    return null;
  }

  const cookie = {
    domain: null,
    expiresAt: null,
    hostOnlyHost: requestHost,
    name: nameValue.slice(0, separatorIndex),
    path: '/',
    value: nameValue.slice(separatorIndex + 1)
  };

  attributes.forEach((attribute) => {
    const attributeSeparatorIndex = attribute.indexOf('=');
    const attributeName = (attributeSeparatorIndex === -1 ? attribute : attribute.slice(0, attributeSeparatorIndex)).trim().toLowerCase();
    const attributeValue = attributeSeparatorIndex === -1 ? '' : attribute.slice(attributeSeparatorIndex + 1).trim();

    if (attributeName === 'domain') {
      cookie.domain = attributeValue.replace(/^\./, '').toLowerCase();
      cookie.hostOnlyHost = null;
    }

    if (attributeName === 'path' && attributeValue) {
      cookie.path = attributeValue;
    }

    if (attributeName === 'max-age') {
      const maxAgeSeconds = Number(attributeValue);
      if (Number.isFinite(maxAgeSeconds)) {
        cookie.expiresAt = Date.now() + maxAgeSeconds * 1000;
      }
    }

    if (attributeName === 'expires') {
      const expiresAt = Date.parse(attributeValue);
      if (Number.isFinite(expiresAt)) {
        cookie.expiresAt = expiresAt;
      }
    }
  });

  return cookie;
}

function getPushCookieKey(cookie) {
  return `${cookie.domain || cookie.hostOnlyHost}\t${cookie.path}\t${cookie.name}`;
}

function isExpiredPushCookie(cookie) {
  return cookie.expiresAt !== null && cookie.expiresAt <= Date.now();
}

function storePushCookie(store, cookie) {
  const key = getPushCookieKey(cookie);

  if (!cookie.value || isExpiredPushCookie(cookie)) {
    store.cookies.delete(key);
    return;
  }

  store.cookies.set(key, cookie);
}

function importElectronCookie(store, cookie, fallbackHost) {
  if (!cookie.name || !cookie.value) {
    return;
  }

  storePushCookie(store, {
    domain: cookie.domain ? cookie.domain.replace(/^\./, '').toLowerCase() : null,
    expiresAt: cookie.expirationDate ? cookie.expirationDate * 1000 : null,
    hostOnlyHost: cookie.domain ? null : fallbackHost,
    name: cookie.name,
    path: cookie.path || '/',
    value: cookie.value
  });
}

function cookieMatchesRequest(cookie, host, requestPath) {
  if (isExpiredPushCookie(cookie)) {
    return false;
  }

  if (cookie.domain) {
    if (host !== cookie.domain && !host.endsWith(`.${cookie.domain}`)) {
      return false;
    }
  } else if (cookie.hostOnlyHost !== host) {
    return false;
  }

  return requestPath.startsWith(cookie.path || '/');
}

function getPushCookieHeader(store, host, requestPath) {
  const pairs = [];

  store.cookies.forEach((cookie, key) => {
    if (isExpiredPushCookie(cookie)) {
      store.cookies.delete(key);
      return;
    }

    if (cookieMatchesRequest(cookie, host, requestPath)) {
      pairs.push(`${cookie.name}=${cookie.value}`);
    }
  });

  return pairs.join('; ');
}

function markDisconnectedPushCookieStores(activeStoreKeys) {
  const activeKeys = new Set([...activeStoreKeys].map((storeKey) => validatePushCookieStoreKey(storeKey)));
  const now = Date.now();

  pushCookieStores.forEach((store, storeKey) => {
    if (activeKeys.has(storeKey)) {
      store.lastConnectedAt = now;
      store.expiresAfter = null;
      return;
    }

    if (store.expiresAfter === null) {
      store.expiresAfter = now + PUSH_COOKIE_STORE_RETENTION_MS;
    }
  });
}

function pruneExpiredPushCookieStores() {
  const now = Date.now();

  pushCookieStores.forEach((store, storeKey) => {
    if (store.expiresAfter !== null && store.expiresAfter <= now) {
      pushCookieStores.delete(storeKey);
      [...pushHostStoreKeys.entries()].forEach(([host, mappedStoreKey]) => {
        if (mappedStoreKey === storeKey) {
          pushHostStoreKeys.delete(host);
        }
      });
    }
  });
}

async function syncVisiblePushCookieStores() {
  const visibleDevices = (await devices.listDevices()).filter((device) => device.connectionState === 'reachable' || device.connectionState === 'ssh-ready');
  const activeStoreKeys = [];

  visibleDevices.forEach((device) => {
    const storeKey = device.ipAddress || device.hostname || device.displayName;
    const hosts = [device.ipAddress, device.hostname, device.displayName].filter(Boolean);
    activeStoreKeys.push(storeKey);
    hosts.forEach((host) => mapPushHostToStore(host, storeKey));
  });

  markDisconnectedPushCookieStores(activeStoreKeys);
  pruneExpiredPushCookieStores();
  await writeStoredPushCookies();
}

async function readStoredPushCookies() {
  try {
    const rawCookies = await fs.readFile(getPushCookieStorePath(), 'utf8');
    const parsedCookies = JSON.parse(rawCookies);

    if (Array.isArray(parsedCookies.stores)) {
      parsedCookies.stores.forEach((storedStore) => {
        if (!storedStore || typeof storedStore.storeKey !== 'string') {
          return;
        }

        const store = normalizePushCookieStore(storedStore.storeKey);
        store.expiresAfter = typeof storedStore.expiresAfter === 'number' ? storedStore.expiresAfter : null;
        store.lastConnectedAt = typeof storedStore.lastConnectedAt === 'number' ? storedStore.lastConnectedAt : store.lastConnectedAt;

        if (Array.isArray(storedStore.cookies)) {
          storedStore.cookies.forEach((cookie) => {
            if (cookie && typeof cookie.name === 'string' && typeof cookie.value === 'string') {
              storePushCookie(store, cookie);
            }
          });
        }
      });
    }

    if (Array.isArray(parsedCookies.hosts)) {
      parsedCookies.hosts.forEach((mapping) => {
        if (mapping && typeof mapping.host === 'string' && typeof mapping.storeKey === 'string') {
          try {
            mapPushHostToStore(mapping.host, mapping.storeKey);
          } catch {
          }
        }
      });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function writeStoredPushCookies() {
  pruneExpiredPushCookieStores();
  await fs.writeFile(
    getPushCookieStorePath(),
    JSON.stringify(
      {
        hosts: [...pushHostStoreKeys.entries()].map(([host, storeKey]) => ({ host, storeKey })),
        stores: [...pushCookieStores.values()].map((store) => ({
          cookies: [...store.cookies.values()].filter((cookie) => !isExpiredPushCookie(cookie)),
          expiresAfter: store.expiresAfter,
          lastConnectedAt: store.lastConnectedAt,
          storeKey: store.storeKey
        }))
      },
      null,
      2
    ),
    'utf8'
  );
}

async function primePushCookies(host, storeKey) {
  const mapping = mapPushHostToStore(host, storeKey);
  const store = normalizePushCookieStore(mapping.storeKey);
  const cookieSession = session.defaultSession;
  const cookies = await cookieSession.cookies.get({ url: getPushCookieUrl(mapping.host) });

  cookies.forEach((cookie) => importElectronCookie(store, cookie, mapping.host));
  await writeStoredPushCookies();

  return {
    count: cookies.length + store.cookies.size,
    host: mapping.host,
    storeKey: mapping.storeKey
  };
}

async function persistPushCookies(host, storeKey) {
  const mapping = mapPushHostToStore(host, storeKey);
  const store = normalizePushCookieStore(mapping.storeKey);
  const cookieSession = session.defaultSession;
  const cookies = await cookieSession.cookies.get({ url: getPushCookieUrl(mapping.host) });
  cookies.forEach((cookie) => importElectronCookie(store, cookie, mapping.host));
  await writeStoredPushCookies();
  await cookieSession.cookies.flushStore();

  return {
    count: cookies.length + store.cookies.size,
    host: mapping.host,
    storeKey: mapping.storeKey
  };
}

async function startPushCookiePersistence() {
  await readStoredPushCookies();
  await syncVisiblePushCookieStores();

  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const requestHost = getRequestHost(details.url);
    const store = requestHost ? getPushCookieStoreForHost(requestHost) : null;

    if (!requestHost || !store) {
      callback({ requestHeaders: details.requestHeaders });
      return;
    }

    const cookieHeader = getPushCookieHeader(store, requestHost, getRequestPath(details.url));
    if (cookieHeader) {
      const existingCookieHeader = getHeaderValue(details.requestHeaders, 'Cookie');
      setHeaderValue(details.requestHeaders, 'Cookie', existingCookieHeader ? `${existingCookieHeader}; ${cookieHeader}` : cookieHeader);
    }

    callback({ requestHeaders: details.requestHeaders });
  });

  session.defaultSession.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const requestHost = getRequestHost(details.url);
    const store = requestHost ? getPushCookieStoreForHost(requestHost) : null;
    const setCookieHeaders = getHeaderValue(details.responseHeaders || {}, 'set-cookie');
    const nextSetCookieHeaders = typeof setCookieHeaders === 'string' ? [setCookieHeaders] : setCookieHeaders;

    if (requestHost && store && Array.isArray(nextSetCookieHeaders)) {
      nextSetCookieHeaders.forEach((setCookieHeader) => {
        const cookie = parseSetCookieHeader(setCookieHeader, requestHost);
        if (cookie) {
          storePushCookie(store, cookie);
        }
      });
      store.lastConnectedAt = Date.now();
      store.expiresAfter = null;
      writeStoredPushCookies().catch(() => {});
    }

    callback({ responseHeaders: details.responseHeaders });
  });
}function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#f7f7f3',
    title: 'Tiny Push Utility',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  });
  mainWindow.setMenu(null);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'electron', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  if (IS_SMOKE_TEST) {
    mainWindow.webContents.once('did-finish-load', () => {
      BrowserWindow.getAllWindows().forEach((window) => window.destroy());
      app.exit(0);
    });
  }
}

function startNetworkWatcher() {
  if (networkWatcher) {
    return;
  }

  const publishIfChanged = async () => {
    try {
      const currentNetwork = await network.getCurrentNetwork();
      const signature = getNetworkSignature(currentNetwork);

      if (signature === lastNetworkSignature) {
        return;
      }

      lastNetworkSignature = signature;
      BrowserWindow.getAllWindows().forEach((window) => {
        if (!window.isDestroyed()) {
          window.webContents.send('network:changed', currentNetwork);
        }
      });
    } catch {
      // Network state is advisory UI data. Keep the app running if detection fails.
    }
  };

  networkWatcher = setInterval(publishIfChanged, NETWORK_POLL_INTERVAL_MS);
  networkWatcher.unref?.();

  app.on('browser-window-focus', publishIfChanged);
  powerMonitor.on('resume', publishIfChanged);
}

async function startSshKeyWatcher() {
  if (sshKeyWatcher) {
    return;
  }

  const keyPaths = ssh.getKeyPaths();
  const sshDir = path.dirname(keyPaths.privateKeyPath);
  const userDataDir = app.getPath('userData');

  await fs.mkdir(sshDir, { recursive: true });
  await publishSshKeyStatusIfChanged();

  const appDataWatcher = nodeFs.watch(userDataDir, { persistent: false }, (_eventType, filename) => {
    if (filename && filename.toString() !== path.basename(sshDir)) {
      return;
    }

    scheduleSshKeyStatusPublish();
    scheduleSshKeyWatcherRefresh();
  });
  const sshDirWatcher = watchSshKeyDirectory(sshDir, keyPaths);

  sshKeyWatcher = {
    appDataWatcher,
    sshDirWatcher
  };
}

function watchSshKeyDirectory(sshDir, keyPaths) {
  const watcher = nodeFs.watch(sshDir, { persistent: false }, (_eventType, filename) => {
    if (!isWatchedSshKeyFile(filename, keyPaths)) {
      return;
    }

    scheduleSshKeyStatusPublish();
  });
  watcher.on('error', scheduleSshKeyWatcherRefresh);
  return watcher;
}

function isWatchedSshKeyFile(filename, keyPaths) {
  if (!filename) {
    return true;
  }

  const changedFileName = filename.toString();
  return changedFileName === path.basename(keyPaths.privateKeyPath) || changedFileName === path.basename(keyPaths.publicKeyPath);
}

function scheduleSshKeyStatusPublish() {
  if (sshKeyStatusPublishTimer) {
    clearTimeout(sshKeyStatusPublishTimer);
  }

  sshKeyStatusPublishTimer = setTimeout(() => {
    sshKeyStatusPublishTimer = null;
    publishSshKeyStatusIfChanged().catch(() => {});
  }, 100);
  sshKeyStatusPublishTimer.unref?.();
}

function scheduleSshKeyWatcherRefresh() {
  setTimeout(() => {
    refreshSshKeyDirectoryWatcher().catch(() => {});
  }, 100).unref?.();
}

async function refreshSshKeyDirectoryWatcher() {
  if (!sshKeyWatcher) {
    return;
  }

  const keyPaths = ssh.getKeyPaths();
  const sshDir = path.dirname(keyPaths.privateKeyPath);
  await fs.mkdir(sshDir, { recursive: true });
  sshKeyWatcher.sshDirWatcher?.close();
  sshKeyWatcher.sshDirWatcher = watchSshKeyDirectory(sshDir, keyPaths);
}

async function publishSshKeyStatusIfChanged() {
  const keyStatus = await ssh.getKeyStatus();
  const nextSignature = JSON.stringify({
    exists: keyStatus.exists,
    publicKey: keyStatus.publicKey
  });

  if (nextSignature === lastSshKeyStatusSignature) {
    return;
  }

  lastSshKeyStatusSignature = nextSignature;
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('ssh:keyStatusChanged', keyStatus);
    }
  });
}

function getNetworkSignature(currentNetwork) {
  return JSON.stringify({
    name: currentNetwork?.name || null,
    interfaceName: currentNetwork?.interfaceName || null,
    ipAddress: currentNetwork?.ipAddress || null,
    gateway: currentNetwork?.gateway || null,
    type: currentNetwork?.type || null,
    error: currentNetwork?.error || null
  });
}

async function hasSshKey() {
  try {
    const keyStatus = await ssh.getKeyStatus();
    return keyStatus.exists;
  } catch {
    return false;
  }
}

function refreshPushCookieStores() {
  syncVisiblePushCookieStores().catch(() => {});
}

function publishDeviceUpdated(device) {
  refreshPushCookieStores();
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('devices:sshProbeUpdated', device);
    }
  });
}

function scheduleSshProbe(device) {
  if (!isSshProbeCandidate(device)) {
    return;
  }

  const host = device.hostname || device.ipAddress || device.displayName;
  const probeKey = device.id || host;

  if (activeSshProbes.has(probeKey)) {
    return;
  }

  activeSshProbes.add(probeKey);
  runSshProbe(host, probeKey);
}

function isSshProbeCandidate(device) {
  return (device?.connectionState === 'reachable' || device?.connectionState === 'ssh-ready') && device?.sshStatus === 'checking';
}

async function runSshProbe(host, probeKey) {
  try {
    const result = await ssh.verifyConnection({ host, username: 'root' });
    const updatedDevice = result.success ? await devices.updateDeviceSshStatus(host, { available: true }) : await updateRejectedKeyOrSshFailure(host, result.error);
    publishDeviceUpdated(updatedDevice);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const updatedDevice = await updateRejectedKeyOrSshFailure(host, errorMessage);
    publishDeviceUpdated(updatedDevice);
  } finally {
    activeSshProbes.delete(probeKey);
  }
}

async function updateRejectedKeyOrSshFailure(host, errorMessage) {
  if (isRejectedKeyResponse(errorMessage) && (await isFirstSshAttempt(host))) {
    return devices.resetDeviceSshStatus(host);
  }

  return devices.updateDeviceSshStatus(host, {
    available: false,
    error: errorMessage
  });
}

async function isFirstSshAttempt(host) {
  const normalizedHost = normalizeDeviceHost(host);
  const deviceId = normalizedHost.replace(/[^a-z0-9_-]+/g, '-');
  const existingDevices = await devices.listDevices();
  const device = existingDevices.find((existingDevice) => {
    return existingDevice.id === deviceId || existingDevice.hostname === normalizedHost || existingDevice.ipAddress === normalizedHost;
  });

  if (!device) {
    return true;
  }

  return !device.sshCheckedAt && device.sshStatus !== 'available' && device.sshStatus !== 'unavailable' && device.sshAvailable === undefined;
}

function normalizeDeviceHost(host) {
  return String(host || '').trim().toLowerCase();
}

function isRejectedKeyResponse(errorMessage) {
  return /permission denied/i.test(errorMessage) && /publickey/i.test(errorMessage);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await logs.initialize();

  ipcMain.handle('clipboard:writeText', (_event, text) => {
    if (typeof text !== 'string') {
      throw new Error('Clipboard text must be a string.');
    }

    clipboard.writeText(text);
    return { copied: true };
  });
  ipcMain.handle('logs:appendEvent', (_event, event) => logs.appendEvent(event));
  ipcMain.handle('logs:exportLatest', () => logs.exportLatestLog());
  ipcMain.handle('devices:list', () => devices.listDevices());
  ipcMain.handle('devices:discover', async () => {
    const discoveredDevices = await devices.discoverDevices({
      sshProbeAvailable: await hasSshKey()
    });
    await syncVisiblePushCookieStores();
    discoveredDevices.forEach(scheduleSshProbe);
    return discoveredDevices;
  });
  ipcMain.handle('devices:probe', async (_event, { host }) => {
    const probedDevice = await devices.probeAndStoreDevice(host, {
      sshProbeAvailable: await hasSshKey()
    });
    await syncVisiblePushCookieStores();
    scheduleSshProbe(probedDevice);
    return probedDevice;
  });
  ipcMain.handle('network:getCurrent', () => network.getCurrentNetwork());
  ipcMain.handle('pushCookies:prime', (_event, { host, storeKey }) => primePushCookies(host, storeKey));
  ipcMain.handle('pushCookies:persist', (_event, { host, storeKey }) => persistPushCookies(host, storeKey));
  ipcMain.handle('tutorials:isDisabled', (_event, { tutorialId }) => tutorials.isDisabled(tutorialId));
  ipcMain.handle('tutorials:disable', (_event, { tutorialId }) => tutorials.disable(tutorialId));
  ipcMain.handle('ssh:getKeyStatus', () => ssh.getKeyStatus());
  ipcMain.handle('ssh:generateKey', () => ssh.generateKey());
  ipcMain.handle('ssh:rotateKey', async () => {
    const keyStatus = await ssh.rotateKey();
    const updatedDevices = await devices.resetAllDeviceSshStatuses();
    updatedDevices.forEach(publishDeviceUpdated);
    return keyStatus;
  });
  ipcMain.handle('ssh:copyPublicKey', () => ssh.copyPublicKey());
  ipcMain.handle('ssh:clearDeviceKeys', async (_event, { host, username, mode, alternateHosts }) => {
    const result = await ssh.clearDeviceSshKeys({ host, username, mode, alternateHosts });
    const updatedDevice = mode === 'except-utility-key' ? await devices.markDeviceSshReady(result.host) : await devices.resetDeviceSshStatus(result.host);
    publishDeviceUpdated(updatedDevice);

    return {
      ...result,
      device: updatedDevice
    };
  });
  ipcMain.handle('ssh:collectAppLogs', (_event, { host, appName, username }) => ssh.collectInstalledAppLogs({ host, appName, username }));
  ipcMain.handle('ssh:installAppArchive', (_event, { host, fileName, bytes, username }) => ssh.installAppArchive({ host, fileName, bytes, username }));
  ipcMain.handle('ssh:listInstalledApps', (_event, { host, username }) => ssh.listInstalledApps({ host, username }));
  ipcMain.handle('ssh:uninstallApp', (_event, { host, appName, version, username }) => ssh.uninstallApp({ host, appName, version, username }));
  ipcMain.handle('ssh:getSetupWebviewPreloadUrl', () => getSshSetupWebviewPreloadUrl());
  ipcMain.handle('ssh:verify', async (_event, { host, username }) => {
    const result = await ssh.verifyConnection({ host, username });

    if (!result.success) {
      const shouldResetSshState = isRejectedKeyResponse(result.error) && (await isFirstSshAttempt(host));
      const updatedDevice = shouldResetSshState
        ? await devices.resetDeviceSshStatus(host)
        : await devices.updateDeviceSshStatus(host, {
            available: false,
            error: result.error
          });
      publishDeviceUpdated(updatedDevice);

      return {
        ...result,
        device: updatedDevice,
        resetSshState: shouldResetSshState
      };
    }

    const updatedDevice = await devices.markDeviceSshReady(result.profile.host);
    publishDeviceUpdated(updatedDevice);

    return {
      ...result,
      device: updatedDevice
    };
  });

  await startPushCookiePersistence();
  await startSshKeyWatcher();
  startNetworkWatcher();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (sshKeyWatcher) {
    sshKeyWatcher.appDataWatcher?.close();
    sshKeyWatcher.sshDirWatcher?.close();
    sshKeyWatcher = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

