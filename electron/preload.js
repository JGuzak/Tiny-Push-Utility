const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tinyPush', {
  clipboard: {
    writeText: (text) => ipcRenderer.invoke('clipboard:writeText', text)
  },
  logs: {
    appendEvent: (event) => ipcRenderer.invoke('logs:appendEvent', event),
    exportLatest: () => ipcRenderer.invoke('logs:exportLatest')
  },
  devices: {
    list: () => ipcRenderer.invoke('devices:list'),
    discover: () => ipcRenderer.invoke('devices:discover'),
    probe: (host) => ipcRenderer.invoke('devices:probe', { host }),
    onSshProbeUpdated: (callback) => {
      const listener = (_event, device) => callback(device);
      ipcRenderer.on('devices:sshProbeUpdated', listener);
      return () => ipcRenderer.removeListener('devices:sshProbeUpdated', listener);
    }
  },
  network: {
    getCurrent: () => ipcRenderer.invoke('network:getCurrent'),
    onChanged: (callback) => {
      const listener = (_event, network) => callback(network);
      ipcRenderer.on('network:changed', listener);
      return () => ipcRenderer.removeListener('network:changed', listener);
    }
  },
  pushCookies: {
    prime: (host, storeKey) => ipcRenderer.invoke('pushCookies:prime', { host, storeKey }),
    persist: (host, storeKey) => ipcRenderer.invoke('pushCookies:persist', { host, storeKey })
  },
  tutorials: {
    isDisabled: (tutorialId) => ipcRenderer.invoke('tutorials:isDisabled', { tutorialId }),
    disable: (tutorialId) => ipcRenderer.invoke('tutorials:disable', { tutorialId })
  },
  ssh: {
    getKeyStatus: () => ipcRenderer.invoke('ssh:getKeyStatus'),
    generateKey: () => ipcRenderer.invoke('ssh:generateKey'),
    rotateKey: () => ipcRenderer.invoke('ssh:rotateKey'),
    copyPublicKey: () => ipcRenderer.invoke('ssh:copyPublicKey'),
    clearDeviceKeys: (host, username, mode, alternateHosts) => ipcRenderer.invoke('ssh:clearDeviceKeys', { host, username, mode, alternateHosts }),
    collectAppLogs: (host, appName, username) => ipcRenderer.invoke('ssh:collectAppLogs', { host, appName, username }),
    installAppArchive: (host, fileName, bytes, username) => ipcRenderer.invoke('ssh:installAppArchive', { host, fileName, bytes, username }),
    listInstalledApps: (host, username) => ipcRenderer.invoke('ssh:listInstalledApps', { host, username }),
    uninstallApp: (host, appName, version, username) => ipcRenderer.invoke('ssh:uninstallApp', { host, appName, version, username }),
    getSetupWebviewPreloadUrl: () => ipcRenderer.invoke('ssh:getSetupWebviewPreloadUrl'),
    verify: (host, username) => ipcRenderer.invoke('ssh:verify', { host, username }),
    onKeyStatusChanged: (callback) => {
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('ssh:keyStatusChanged', listener);
      return () => ipcRenderer.removeListener('ssh:keyStatusChanged', listener);
    }
  }
});

