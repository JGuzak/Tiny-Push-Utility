const { execFile } = require('node:child_process');
const os = require('node:os');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

async function getCurrentNetwork() {
  let currentNetwork;

  if (process.platform === 'win32') {
    currentNetwork = await getWindowsNetwork();
  } else if (process.platform === 'darwin') {
    currentNetwork = await getMacNetwork();
  } else {
    currentNetwork = await getLinuxNetwork();
  }

  return withLocalIpAddress(currentNetwork);
}

async function getWindowsNetwork() {
  const wifiNetwork = await tryGetWindowsWifiNetwork();
  if (wifiNetwork) {
    return wifiNetwork;
  }

  const profileNetwork = await tryGetWindowsNetworkProfile();
  if (profileNetwork) {
    return profileNetwork;
  }

  const ipconfigNetwork = await tryGetWindowsIpconfigNetwork();
  if (ipconfigNetwork) {
    return ipconfigNetwork;
  }

  return unknownNetwork('No connected Windows network profile was found.');
}

async function tryGetWindowsWifiNetwork() {
  try {
    const { stdout } = await execFileAsync('netsh.exe', ['wlan', 'show', 'interfaces'], { timeout: 5000 });
    const state = matchFirst(stdout, /^\s*State\s+:\s*(.+)$/im);

    if (state && state.toLowerCase() !== 'connected') {
      return null;
    }

    const ssid = matchFirst(stdout, /^\s*SSID\s+:\s*(.+)$/im);
    if (!ssid) {
      return null;
    }

    return {
      name: ssid,
      interfaceName: matchFirst(stdout, /^\s*Name\s+:\s*(.+)$/im),
      type: 'wifi',
      source: 'netsh'
    };
  } catch {
    return null;
  }
}

async function tryGetWindowsNetworkProfile() {
  try {
    const command = [
      'Get-NetConnectionProfile',
      "| Where-Object { $_.IPv4Connectivity -ne 'Disconnected' -or $_.IPv6Connectivity -ne 'Disconnected' }",
      '| Select-Object -First 1 -Property Name,InterfaceAlias,NetworkCategory',
      '| ConvertTo-Json -Compress'
    ].join(' ');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], { timeout: 5000 });
    const profile = JSON.parse(stdout.trim());

    if (!profile?.Name) {
      return null;
    }

    return {
      name: profile.Name,
      interfaceName: profile.InterfaceAlias,
      type: 'network',
      source: 'Get-NetConnectionProfile'
    };
  } catch {
    return null;
  }
}

async function tryGetWindowsIpconfigNetwork() {
  try {
    const { stdout } = await execFileAsync('ipconfig.exe', ['/all'], { timeout: 5000 });
    const activeAdapter = parseWindowsIpconfig(stdout);

    if (!activeAdapter) {
      return null;
    }

    return {
      name: activeAdapter.dnsSuffix || activeAdapter.name,
      interfaceName: activeAdapter.name,
      ipAddress: activeAdapter.ipAddress,
      gateway: activeAdapter.gateway,
      type: 'network',
      source: 'ipconfig'
    };
  } catch {
    return null;
  }
}

function parseWindowsIpconfig(output) {
  return getWindowsIpconfigAdapterBlocks(output)
    .map(parseWindowsIpconfigAdapter)
    .find((adapter) => adapter && adapter.ipAddress && adapter.gateway && !isVirtualWindowsAdapter(adapter.name));
}

function getWindowsIpconfigAdapterBlocks(output) {
  const blocks = [];
  let currentBlock = [];

  for (const line of output.split(/\r?\n/)) {
    if (/^[^\r\n]* adapter [^\r\n:]+:[ \t]*$/i.test(line)) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
      }

      currentBlock = [line];
      continue;
    }

    if (currentBlock.length > 0) {
      currentBlock.push(line);
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }

  return blocks;
}

function parseWindowsIpconfigAdapter(block) {
  const header = matchFirst(block, /^[^\r\n]* adapter ([^\r\n:]+):[ \t]*$/im);

  if (!header || /Media State[. \t]+:[ \t]*Media disconnected/i.test(block)) {
    return null;
  }

  return {
    name: header,
    dnsSuffix: matchFirst(block, /^[ \t]*Connection-specific DNS Suffix[. \t]+:[ \t]*([^\r\n]*)$/im),
    ipAddress: normalizeIpconfigValue(matchFirst(block, /^[ \t]*IPv4 Address[. \t]+:[ \t]*([^\r\n]*)$/im)),
    gateway: normalizeIpconfigValue(matchFirst(block, /^[ \t]*Default Gateway[. \t]+:[ \t]*([^\r\n]*)$/im))
  };
}

function isVirtualWindowsAdapter(name) {
  return /(vEthernet|WSL|Hyper-V|VPN|Nord|TAP|Loopback)/i.test(name);
}

function normalizeIpconfigValue(value) {
  return value?.replace(/\(Preferred\)/i, '').trim() || null;
}

function withLocalIpAddress(network) {
  if (!network || network.ipAddress) {
    return network;
  }

  const address = findLocalIpAddress(network.interfaceName);
  return address ? { ...network, ipAddress: address } : network;
}

function findLocalIpAddress(interfaceName) {
  if (!interfaceName) {
    return null;
  }

  const interfaces = os.networkInterfaces();
  const interfaceKey = Object.keys(interfaces).find((name) => name.toLowerCase() === interfaceName.toLowerCase());

  if (!interfaceKey) {
    return null;
  }

  const address = interfaces[interfaceKey]?.find((candidate) => candidate.family === 'IPv4' && !candidate.internal);
  return address?.address || null;
}

async function getMacNetwork() {
  const airportDevice = await tryGetMacAirportDevice();

  if (airportDevice) {
    const wifiNetwork = await tryGetMacWifiNetwork(airportDevice);
    if (wifiNetwork) {
      return wifiNetwork;
    }
  }

  return unknownNetwork('No connected macOS Wi-Fi network was found.');
}

async function tryGetMacAirportDevice() {
  try {
    const { stdout } = await execFileAsync('networksetup', ['-listallhardwareports'], { timeout: 5000 });
    const match = stdout.match(/Hardware Port: Wi-Fi[\s\S]*?Device: (.+)/i);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

async function tryGetMacWifiNetwork(device) {
  try {
    const { stdout } = await execFileAsync('networksetup', ['-getairportnetwork', device], { timeout: 5000 });
    const match = stdout.match(/Current Wi-Fi Network: (.+)/i);

    if (!match?.[1]) {
      return null;
    }

    return {
      name: match[1].trim(),
      interfaceName: device,
      type: 'wifi',
      source: 'networksetup'
    };
  } catch {
    return null;
  }
}

async function getLinuxNetwork() {
  const nmcliNetwork = await tryGetLinuxNmcliNetwork();
  if (nmcliNetwork) {
    return nmcliNetwork;
  }

  const iwgetidNetwork = await tryGetLinuxIwgetidNetwork();
  if (iwgetidNetwork) {
    return iwgetidNetwork;
  }

  return unknownNetwork('No connected Linux Wi-Fi network was found.');
}

async function tryGetLinuxNmcliNetwork() {
  try {
    const { stdout } = await execFileAsync('nmcli', ['-t', '-f', 'active,ssid,device', 'dev', 'wifi'], { timeout: 5000 });
    const activeNetwork = stdout
      .split(/\r?\n/)
      .map((line) => line.split(':'))
      .find(([active, ssid]) => active === 'yes' && ssid);

    if (!activeNetwork) {
      return null;
    }

    return {
      name: activeNetwork[1],
      interfaceName: activeNetwork[2],
      type: 'wifi',
      source: 'nmcli'
    };
  } catch {
    return null;
  }
}

async function tryGetLinuxIwgetidNetwork() {
  try {
    const { stdout } = await execFileAsync('iwgetid', ['-r'], { timeout: 5000 });
    const ssid = stdout.trim();

    if (!ssid) {
      return null;
    }

    return {
      name: ssid,
      type: 'wifi',
      source: 'iwgetid'
    };
  } catch {
    return null;
  }
}

function matchFirst(value, pattern) {
  const match = value.match(pattern);
  return match?.[1]?.trim() || null;
}

function unknownNetwork(error) {
  return {
    name: null,
    type: 'unknown',
    error
  };
}

module.exports = {
  getCurrentNetwork
};
