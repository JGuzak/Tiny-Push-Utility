const dns = require('node:dns/promises');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { app } = require('electron');

const DEFAULT_DEVICE_HOSTS = ['push.local'];
const PROBE_PATH = '/ssh';
const PROBE_TIMEOUT_MS = 5000;

function getDeviceStorePath() {
  return path.join(app.getPath('userData'), 'devices.json');
}

function validateHost(host) {
  if (!host || typeof host !== 'string') {
    throw new Error('A hostname or IP address is required.');
  }

  const normalizedHost = host.trim().toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(normalizedHost)) {
    throw new Error('Host can only contain letters, numbers, dots, underscores, and hyphens.');
  }

  return normalizedHost;
}

function getDeviceId(host) {
  return host.replace(/[^a-z0-9_-]+/g, '-');
}

async function readStoredDevices() {
  try {
    const rawDevices = await fs.readFile(getDeviceStorePath(), 'utf8');
    const parsedDevices = JSON.parse(rawDevices);

    if (!Array.isArray(parsedDevices)) {
      return [];
    }

    return parsedDevices.map(normalizeStoredDevice);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

function normalizeStoredDevice(device) {
  if (device.sshStatus !== 'checking') {
    return device;
  }

  return {
    ...device,
    sshStatus: 'not-checked'
  };
}

async function writeStoredDevices(devices) {
  await fs.mkdir(path.dirname(getDeviceStorePath()), { recursive: true });
  await fs.writeFile(getDeviceStorePath(), JSON.stringify(devices, null, 2), 'utf8');
}

async function resolveHost(host) {
  try {
    const result = await dns.lookup(host, { family: 4 });
    return result.address;
  } catch {
    return undefined;
  }
}

function requestProbe(host) {
  return new Promise((resolve) => {
    const request = http.request(
      {
        host,
        method: 'GET',
        path: PROBE_PATH,
        timeout: PROBE_TIMEOUT_MS
      },
      (response) => {
        response.resume();
        response.on('end', () => {
          resolve({
            ok: true,
            statusCode: response.statusCode,
            statusMessage: response.statusMessage
          });
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error(`Timed out after ${PROBE_TIMEOUT_MS}ms`));
    });

    request.on('error', (error) => {
      resolve({
        ok: false,
        error: error.message
      });
    });

    request.end();
  });
}

async function probeDevice(host, options = {}) {
  const hostname = validateHost(host);
  const ipAddress = await resolveHost(hostname);
  const probeResult = await requestProbe(hostname);
  const now = new Date().toISOString();
  const shouldCheckSsh = probeResult.ok && options.sshProbeAvailable;

  return {
    id: getDeviceId(hostname),
    displayName: hostname,
    hostname,
    ipAddress,
    lastSeenAt: probeResult.ok ? now : undefined,
    checkedAt: now,
    connectionState: getConnectionState(probeResult),
    probePath: PROBE_PATH,
    statusCode: probeResult.statusCode,
    statusMessage: probeResult.statusMessage,
    sshStatus: shouldCheckSsh ? 'checking' : 'not-checked',
    sshAvailable: undefined,
    sshCheckedAt: undefined,
    sshError: undefined,
    error: probeResult.ok ? undefined : probeResult.error
  };
}

function getConnectionState(probeResult) {
  if (!probeResult.ok) {
    return 'unreachable';
  }

  return 'reachable';
}

function shouldKeepKnownSshReadyState(existingDevice, probedDevice) {
  return Boolean(
    existingDevice &&
      probedDevice?.connectionState === 'reachable' &&
      probedDevice?.sshStatus === 'checking' &&
      (existingDevice.connectionState === 'ssh-ready' || existingDevice.sshStatus === 'available' || existingDevice.sshAvailable === true)
  );
}

function mergeDevices(existingDevices, probedDevices) {
  const devicesById = new Map();

  for (const device of existingDevices) {
    devicesById.set(device.id, device);
  }

  for (const device of probedDevices) {
    const existingDevice = devicesById.get(device.id);
    const nextDevice = {
      ...existingDevice,
      ...device,
      lastSeenAt: device.lastSeenAt || existingDevice?.lastSeenAt
    };

    if (shouldKeepKnownSshReadyState(existingDevice, device)) {
      nextDevice.connectionState = 'ssh-ready';
      nextDevice.sshAvailable = true;
      nextDevice.sshCheckedAt = existingDevice.sshCheckedAt;
      nextDevice.sshError = undefined;
    }

    devicesById.set(device.id, nextDevice);
  }

  return Array.from(devicesById.values()).sort((left, right) => {
    return left.displayName.localeCompare(right.displayName);
  });
}

async function listDevices() {
  return readStoredDevices();
}

async function probeAndStoreDevice(host, options = {}) {
  const existingDevices = await readStoredDevices();
  const probedDevice = await probeDevice(host, options);
  const devices = mergeDevices(existingDevices, [probedDevice]);
  await writeStoredDevices(devices);
  return probedDevice;
}

async function discoverDevices(options = {}) {
  const existingDevices = await readStoredDevices();
  const hosts = new Set(DEFAULT_DEVICE_HOSTS);

  for (const device of existingDevices) {
    if (device.hostname) {
      hosts.add(device.hostname);
    }
  }

  const probedDevices = await Promise.all(
    Array.from(hosts).map(async (host) => {
      return probeDevice(host, options);
    })
  );

  const devices = mergeDevices(existingDevices, probedDevices);
  await writeStoredDevices(devices);
  return devices;
}

async function updateDeviceSshStatus(host, sshResult) {
  const hostname = validateHost(host);
  const existingDevices = await readStoredDevices();
  const deviceId = getDeviceId(hostname);
  const now = new Date().toISOString();
  let updatedDevice = null;

  const devices = existingDevices.map((device) => {
    if (device.id !== deviceId && device.hostname !== hostname && device.ipAddress !== hostname) {
      return device;
    }

    updatedDevice = {
      ...device,
      checkedAt: now,
      connectionState: sshResult.available ? 'ssh-ready' : getReachableFallbackState(device),
      sshStatus: sshResult.available ? 'available' : 'unavailable',
      sshAvailable: sshResult.available,
      sshCheckedAt: now,
      sshError: sshResult.available ? undefined : sshResult.error,
      lastSeenAt: sshResult.available ? device.lastSeenAt || now : device.lastSeenAt
    };

    return updatedDevice;
  });

  if (!updatedDevice) {
    updatedDevice = {
      id: deviceId,
      displayName: hostname,
      hostname,
      checkedAt: now,
      connectionState: sshResult.available ? 'ssh-ready' : 'reachable',
      sshStatus: sshResult.available ? 'available' : 'unavailable',
      sshAvailable: sshResult.available,
      sshCheckedAt: now,
      sshError: sshResult.available ? undefined : sshResult.error,
      lastSeenAt: sshResult.available ? now : undefined
    };
    devices.push(updatedDevice);
  }

  await writeStoredDevices(devices);
  return updatedDevice;
}

async function resetDeviceSshStatus(host) {
  const hostname = validateHost(host);
  const existingDevices = await readStoredDevices();
  const deviceId = getDeviceId(hostname);
  const now = new Date().toISOString();
  let updatedDevice = null;

  const devices = existingDevices.map((device) => {
    if (device.id !== deviceId && device.hostname !== hostname && device.ipAddress !== hostname) {
      return device;
    }

    updatedDevice = {
      ...device,
      checkedAt: now,
      connectionState: getReachableFallbackState(device),
      sshStatus: 'not-checked',
      sshAvailable: undefined,
      sshCheckedAt: undefined,
      sshError: undefined
    };

    return updatedDevice;
  });

  if (!updatedDevice) {
    updatedDevice = {
      id: deviceId,
      displayName: hostname,
      hostname,
      checkedAt: now,
      connectionState: 'reachable',
      sshStatus: 'not-checked',
      sshAvailable: undefined,
      sshCheckedAt: undefined,
      sshError: undefined
    };
    devices.push(updatedDevice);
  }

  await writeStoredDevices(devices);
  return updatedDevice;
}

function getReachableFallbackState(device) {
  if (device.connectionState === 'unreachable') {
    return 'unreachable';
  }

  return 'reachable';
}

async function markDeviceSshReady(host) {
  const hostname = validateHost(host);
  const existingDevices = await readStoredDevices();
  const deviceId = getDeviceId(hostname);
  const now = new Date().toISOString();
  let updatedDevice = null;

  const devices = existingDevices.map((device) => {
    if (device.id !== deviceId && device.hostname !== hostname && device.ipAddress !== hostname) {
      return device;
    }

    updatedDevice = {
      ...device,
      checkedAt: now,
      connectionState: 'ssh-ready',
      sshStatus: 'available',
      sshAvailable: true,
      sshCheckedAt: now,
      sshError: undefined,
      lastSeenAt: device.lastSeenAt || now
    };

    return updatedDevice;
  });

  if (!updatedDevice) {
    updatedDevice = {
      id: deviceId,
      displayName: hostname,
      hostname,
      checkedAt: now,
      connectionState: 'ssh-ready',
      sshStatus: 'available',
      sshAvailable: true,
      sshCheckedAt: now,
      lastSeenAt: now
    };
    devices.push(updatedDevice);
  }

  await writeStoredDevices(devices);
  return updatedDevice;
}

async function resetAllDeviceSshStatuses() {
  const existingDevices = await readStoredDevices();
  const updatedDevices = existingDevices.map((device) => ({
    ...device,
    connectionState: getReachableFallbackState(device),
    sshStatus: 'not-checked',
    sshAvailable: undefined,
    sshCheckedAt: undefined,
    sshError: undefined
  }));

  await writeStoredDevices(updatedDevices);
  return updatedDevices;
}

module.exports = {
  discoverDevices,
  listDevices,
  markDeviceSshReady,
  probeAndStoreDevice,
  resetAllDeviceSshStatuses,
  resetDeviceSshStatus,
  updateDeviceSshStatus
};
