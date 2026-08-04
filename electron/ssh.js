const { clipboard, app } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const DEFAULT_USERNAME = 'root';
const KEY_COMMENT = 'tiny-push-utility';
const KEY_NAME = 'tiny_push_utility_rsa';
const KEY_SIZE_BITS = 4096;
const APP_INSTALL_TIMEOUT_MS = 120000;
const APP_INSTALL_MAX_BUFFER_BYTES = 20 * 1024 * 1024;
const KEYGEN_TIMEOUT_MS = 30000;
const LOG_COLLECTION_TIMEOUT_MS = 60000;
const LOG_COLLECTION_MAX_BUFFER_BYTES = 200 * 1024 * 1024;
const SSH_TIMEOUT_MS = 10000;
const CLEAR_DEVICE_KEYS_MODES = new Set(['all', 'except-utility-key']);

function getSshDir() {
  return path.join(app.getPath('userData'), 'ssh');
}

function getKeyPaths() {
  const privateKeyPath = path.join(getSshDir(), KEY_NAME);

  return {
    privateKeyPath,
    publicKeyPath: `${privateKeyPath}.pub`
  };
}

function getProfilesPath() {
  return path.join(app.getPath('userData'), 'ssh-profiles.json');
}

function getKnownHostsPath() {
  return path.join(getSshDir(), 'known_hosts');
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

function validateInstalledAppName(appName) {
  if (!appName || typeof appName !== 'string') {
    throw new Error('An installed app name is required.');
  }

  const normalizedAppName = appName.trim();
  if (!normalizedAppName || normalizedAppName === '.' || normalizedAppName === '..' || /[/\\\0]/.test(normalizedAppName)) {
    throw new Error('Installed app name cannot be empty or include path separators.');
  }

  return normalizedAppName;
}

function validateClearDeviceKeysMode(mode) {
  const normalizedMode = mode || 'all';

  if (!CLEAR_DEVICE_KEYS_MODES.has(normalizedMode)) {
    throw new Error('Clear SSH keys mode is invalid.');
  }

  return normalizedMode;
}

function quoteRemoteShellValue(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function validateInstalledAppVersion(version) {
  if (!version || typeof version !== 'string') {
    throw new Error('An installed app version is required.');
  }

  const normalizedVersion = version.trim();
  if (!normalizedVersion || normalizedVersion === '.' || normalizedVersion === '..' || /[/\\\0]/.test(normalizedVersion)) {
    throw new Error('Installed app version cannot be empty or include path separators.');
  }

  return normalizedVersion;
}

function validateInstallArchiveFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    throw new Error('An app archive file name is required.');
  }

  const normalizedFileName = path.basename(fileName.trim());
  if (normalizedFileName !== fileName.trim()) {
    throw new Error('App archive file name cannot include folders.');
  }

  const match = normalizedFileName.match(/^([A-Za-z0-9][A-Za-z0-9_-]*)-([A-Za-z0-9][A-Za-z0-9._+-]*)\.tar\.gz$/);
  if (!match) {
    throw new Error('Use <app name>-<version>.tar.gz.');
  }

  return {
    appName: match[1],
    fileName: normalizedFileName,
    version: match[2]
  };
}

async function getKeyStatus() {
  const { privateKeyPath, publicKeyPath } = getKeyPaths();
  const privateKeyExists = await fileExists(privateKeyPath);
  let publicKeyExists = await fileExists(publicKeyPath);

  if (privateKeyExists && !publicKeyExists) {
    await regeneratePublicKey(privateKeyPath, publicKeyPath);
    publicKeyExists = await fileExists(publicKeyPath);
  }

  const publicKey = publicKeyExists ? await fs.readFile(publicKeyPath, 'utf8') : null;

  return {
    exists: privateKeyExists && publicKeyExists,
    keyName: KEY_NAME,
    privateKeyPath,
    publicKeyPath,
    publicKey
  };
}

async function ensureKey() {
  const status = await getKeyStatus();

  if (status.exists) {
    return status;
  }

  return generateKey();
}

async function generateKey() {
  const { privateKeyPath, publicKeyPath } = getKeyPaths();
  const privateKeyExists = await fileExists(privateKeyPath);
  const publicKeyExists = await fileExists(publicKeyPath);

  if (privateKeyExists || publicKeyExists) {
    throw new Error(`SSH key is incomplete. Remove ${privateKeyPath} and ${publicKeyPath}, then generate again.`);
  }

  await fs.mkdir(getSshDir(), { recursive: true });
  await execFileAsync(
    'ssh-keygen',
    ['-t', 'rsa', '-b', String(KEY_SIZE_BITS), '-f', privateKeyPath, '-N', '', '-C', KEY_COMMENT],
    { timeout: KEYGEN_TIMEOUT_MS }
  );
  await restrictPrivateKey(privateKeyPath);

  return getKeyStatus();
}

async function rotateKey() {
  const { privateKeyPath, publicKeyPath } = getKeyPaths();

  await fs.rm(privateKeyPath, { force: true });
  await fs.rm(publicKeyPath, { force: true });

  return generateKey();
}

async function copyPublicKey() {
  const status = await ensureKey();

  if (!status.publicKey) {
    throw new Error('Public key is not available.');
  }

  clipboard.writeText(status.publicKey.trim());
  return status;
}


async function verifyConnection({ host, username = DEFAULT_USERNAME }) {
  const hostname = validateHost(host);
  const status = await getKeyStatus();

  if (!status.exists) {
    throw new Error('Generate the Tiny Push Utility SSH key before verifying SSH.');
  }

  await fs.mkdir(getSshDir(), { recursive: true });

  const startedAt = new Date().toISOString();

  try {
    const { stdout } = await execSshWithKnownHostRecovery(status, username, hostname, 'echo tiny-push-utility-ssh-ok');

    if (!stdout.includes('tiny-push-utility-ssh-ok')) {
      throw new Error('SSH verification command did not return the expected response.');
    }

    const verifiedAt = new Date().toISOString();
    const profile = {
      deviceId: hostname.replace(/[^a-z0-9_-]+/g, '-'),
      host: hostname,
      port: 22,
      username,
      keyPath: status.privateKeyPath,
      verifiedAt
    };

    await writeSshProfile(profile);

    return {
      success: true,
      profile,
      startedAt,
      verifiedAt
    };
  } catch (error) {
    return {
      success: false,
      host: hostname,
      username,
      keyPath: status.privateKeyPath,
      startedAt,
      error: formatSshError(error)
    };
  }
}

async function listInstalledApps({ host, username = DEFAULT_USERNAME }) {
  const hostname = validateHost(host);
  const status = await getKeyStatus();

  if (!status.exists) {
    throw new Error('Generate the Tiny Push Utility SSH key before listing installed apps.');
  }

  const { stdout } = await execSshWithKnownHostRecovery(
    status,
    username,
    hostname,
    'install_dir="$HOME/TinySoundSystems"; mkdir -p "$install_dir"; for app_path in "$install_dir"/*; do [ -d "$app_path" ] || continue; versions=""; for version_path in "$app_path"/*; do [ -d "$version_path" ] || continue; version_name="$(basename "$version_path")"; [ "$version_name" = "logs" ] && continue; versions="${versions}${versions:+,}${version_name}"; done; [ -n "$versions" ] || continue; has_log_files=0; if [ -d "$app_path/logs" ]; then log_file="$(find "$app_path/logs" -type f -print -quit 2>/dev/null)"; [ -n "$log_file" ] && has_log_files=1; fi; printf "%s\\t%s\\t%s\\n" "$(basename "$app_path")" "$versions" "$has_log_files"; done'
  );
  const deviceInfo = await collectDeviceInfo(status, username, hostname);
  const installedApps = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .map((line) => {
      const [name, versions = '', hasLogFiles = '0'] = line.split('\t');
      const versionFolders = versions.split(',').map((version) => version.trim()).filter(Boolean);

      return {
        hasLogFiles: hasLogFiles === '1',
        id: name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'),
        name,
        path: `~/TinySoundSystems/${name}`,
        versionFolders
      };
    });

  return {
    apps: installedApps,
    deviceInfo,
    host: hostname,
    installPath: '~/TinySoundSystems',
    username
  };
}

async function clearDeviceSshKeys({ host, username = DEFAULT_USERNAME, mode = 'all', alternateHosts = [] }) {
  const hostname = validateHost(host);
  const hostnames = getUniqueHosts([hostname, ...alternateHosts]);
  const clearMode = validateClearDeviceKeysMode(mode);
  const status = await getKeyStatus();

  if (!status.exists) {
    throw new Error('Generate the Tiny Push Utility SSH key before clearing Push SSH keys.');
  }

  const remoteCommand =
    clearMode === 'except-utility-key'
      ? [
          'set -eu',
          'ssh_dir="/data/settings/ssh"',
          'mkdir -p "$ssh_dir"',
          'umask 077',
          `public_key=${quoteRemoteShellValue(status.publicKey.trim())}`,
          'printf "%s\\n" "$public_key" > "$ssh_dir/authorized_keys"',
          'rm -f "$ssh_dir/authorized_keys2"',
          'chmod 600 "$ssh_dir/authorized_keys"'
        ].join('; ')
      : [
          'set -eu',
          'ssh_dir="/data/settings/ssh"',
          'rm -f "$ssh_dir/authorized_keys" "$ssh_dir/authorized_keys2"'
        ].join('; ');

  let lastError = null;
  for (const candidateHost of hostnames) {
    try {
      await execSshWithKnownHostRecovery(status, username, candidateHost, remoteCommand);

      return {
        clearedAt: new Date().toISOString(),
        host: candidateHost,
        mode: clearMode,
        username
      };
    } catch (error) {
      lastError = error;
      if (!isHostnameResolutionError(error)) {
        break;
      }
    }
  }

  throw new Error(`Clearing SSH keys on Push failed: ${formatSshError(lastError)}`);
}

async function collectDeviceInfo(status, username, hostname) {
  const emptyDeviceInfo = {
    abletonOsVersion: null,
    firmwareVersion: null,
    liveVersion: null,
    pushSoftwareVersion: null
  };
  const remoteCommand = [
    'printf "__LIVE_DIRS__\\n"',
    'find /data/.config/Ableton -maxdepth 1 -type d -name "Live *" 2>/dev/null',
    'printf "__PUSH_VERSION__\\n"',
    'cat /opt/push3/products/push3/python/Push2/version.py 2>/dev/null',
    'printf "__FIRMWARE_DIRS__\\n"',
    'for firmware_dir in /opt/push3/products/push3/python/Push2/firmware/push3/push3_fw_*; do [ -d "$firmware_dir" ] && printf "%s\\n" "$firmware_dir"; done',
    'printf "__OS_RELEASE__\\n"',
    'cat /etc/os-release 2>/dev/null'
  ].join('; ');

  try {
    const { stdout } = await execSshWithKnownHostRecovery(status, username, hostname, remoteCommand);
    return parseDeviceInfo(stdout);
  } catch {
    return emptyDeviceInfo;
  }
}

function parseDeviceInfo(output) {
  const liveVersions = getMarkedSection(output, '__LIVE_DIRS__', '__PUSH_VERSION__')
    .split(/\r?\n/)
    .map((line) => line.trim().match(/\/Live ([^/]+)$/)?.[1] || null)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const liveVersion = liveVersions.at(-1) || null;
  const pushSoftwareVersion = getMarkedSection(output, '__PUSH_VERSION__', '__FIRMWARE_DIRS__').match(/^VERSION\s*=\s*['"]([^'"]+)['"]/m)?.[1] || null;
  const firmwareVersions = getMarkedSection(output, '__FIRMWARE_DIRS__', '__OS_RELEASE__')
    .split(/\r?\n/)
    .map((line) => line.trim().match(/\/push3_fw_([^/]+)$/)?.[1] || null)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const firmwareVersion = firmwareVersions.at(-1) || null;
  const rawOsVersion = getMarkedSection(output, '__OS_RELEASE__').match(/^VERSION_ID="?([^"\n]+)"?/m)?.[1] || null;
  const abletonOsVersion = rawOsVersion?.match(/-v(.+)$/)?.[1] || rawOsVersion;

  return {
    abletonOsVersion,
    firmwareVersion,
    liveVersion,
    pushSoftwareVersion
  };
}

function getMarkedSection(output, startMarker, endMarker = null) {
  const startIndex = output.indexOf(startMarker);
  if (startIndex === -1) {
    return '';
  }

  const sectionStartIndex = startIndex + startMarker.length;
  const endIndex = endMarker ? output.indexOf(endMarker, sectionStartIndex) : -1;
  return output.slice(sectionStartIndex, endIndex === -1 ? undefined : endIndex).trim();
}

async function collectInstalledAppLogs({ host, appName, username = DEFAULT_USERNAME }) {
  const hostname = validateHost(host);
  const installedAppName = validateInstalledAppName(appName);
  const status = await getKeyStatus();

  if (!status.exists) {
    throw new Error('Generate the Tiny Push Utility SSH key before collecting logs.');
  }

  const downloadsPath = app.getPath('downloads');
  const zipFileName = `${getSafeFileName(installedAppName)}-logs-${getFileTimestamp()}.zip`;
  const localZipPath = path.join(downloadsPath, zipFileName);
  const remoteCommand = [
    'set -eu',
    'install_dir="$HOME/TinySoundSystems"',
    `app_dir="$install_dir"/${shellQuote(installedAppName)}`,
    'logs_dir="$app_dir/logs"',
    '[ -d "$logs_dir" ] || { echo "Logs directory was not found." >&2; exit 2; }',
    'command -v tar >/dev/null 2>&1 || { echo "tar is not available on Push." >&2; exit 3; }',
    'find "$logs_dir" -type f | grep -q . || { echo "No log files were found." >&2; exit 4; }',
    'cd "$logs_dir"',
    'tar -cf - .'
  ].join('; ');

  await fs.mkdir(downloadsPath, { recursive: true });
  const { stdout } = await execSshWithKnownHostRecovery(status, username, hostname, remoteCommand, {
    encoding: 'buffer',
    maxBuffer: LOG_COLLECTION_MAX_BUFFER_BYTES,
    timeout: LOG_COLLECTION_TIMEOUT_MS
  });
  const zipArchive = createZipArchive(parseTarArchive(stdout));
  await fs.writeFile(localZipPath, zipArchive);
  await deleteRemoteLogFiles(status, username, hostname, installedAppName, zipFileName);

  return {
    appName: installedAppName,
    fileName: zipFileName,
    localPath: localZipPath
  };
}

async function installAppArchive({ host, fileName, bytes, username = DEFAULT_USERNAME }) {
  const hostname = validateHost(host);
  const archive = validateInstallArchiveFileName(fileName);
  const status = await getKeyStatus();

  if (!status.exists) {
    throw new Error('Generate the Tiny Push Utility SSH key before installing apps.');
  }

  const archiveBytes = Buffer.from(bytes);
  if (archiveBytes.length === 0) {
    throw new Error(`${archive.fileName} is empty.`);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiny-push-install-'));
  const localArchivePath = path.join(tempDir, archive.fileName);
  const remoteAppDir = `TinySoundSystems/${archive.appName}`;
  const remoteArchivePath = `${remoteAppDir}/${archive.fileName}`;
  const remoteVersionDir = `${remoteAppDir}/${archive.version}`;

  try {
    await fs.writeFile(localArchivePath, archiveBytes);
    await execSshWithKnownHostRecovery(status, username, hostname, getPrepareInstallCommand(archive.appName), {
      maxBuffer: APP_INSTALL_MAX_BUFFER_BYTES,
      timeout: APP_INSTALL_TIMEOUT_MS
    });
    await execFileAsync('scp', getScpCommandArgs(status, username, hostname, localArchivePath, remoteArchivePath), {
      maxBuffer: APP_INSTALL_MAX_BUFFER_BYTES,
      timeout: APP_INSTALL_TIMEOUT_MS
    });
    await execSshWithKnownHostRecovery(status, username, hostname, getRunInstallCommand(archive.appName, archive.version, archive.fileName), {
      maxBuffer: APP_INSTALL_MAX_BUFFER_BYTES,
      timeout: APP_INSTALL_TIMEOUT_MS
    });
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }

  return {
    appName: archive.appName,
    fileName: archive.fileName,
    installPath: `~/TinySoundSystems/${archive.appName}/${archive.version}`,
    version: archive.version
  };
}

async function uninstallApp({ host, appName, version, username = DEFAULT_USERNAME }) {
  const hostname = validateHost(host);
  const installedAppName = validateInstalledAppName(appName);
  const installedAppVersion = validateInstalledAppVersion(version);
  const status = await getKeyStatus();

  if (!status.exists) {
    throw new Error('Generate the Tiny Push Utility SSH key before uninstalling apps.');
  }

  await execSshWithKnownHostRecovery(status, username, hostname, getUninstallAppCommand(installedAppName, installedAppVersion), {
    maxBuffer: APP_INSTALL_MAX_BUFFER_BYTES,
    timeout: APP_INSTALL_TIMEOUT_MS
  }).catch((error) => {
    throw new Error(formatRemoteScriptError(error, 'Uninstall failed.'));
  });

  return {
    appName: installedAppName,
    installPath: `~/TinySoundSystems/${installedAppName}/${installedAppVersion}`,
    version: installedAppVersion
  };
}

async function readSshProfiles() {
  try {
    const rawProfiles = await fs.readFile(getProfilesPath(), 'utf8');
    const parsedProfiles = JSON.parse(rawProfiles);
    return Array.isArray(parsedProfiles) ? parsedProfiles : [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

async function writeSshProfile(profile) {
  const profiles = await readSshProfiles();
  const nextProfiles = profiles.filter((existingProfile) => existingProfile.deviceId !== profile.deviceId);
  nextProfiles.push(profile);

  await fs.writeFile(getProfilesPath(), JSON.stringify(nextProfiles, null, 2), 'utf8');
}

async function regeneratePublicKey(privateKeyPath, publicKeyPath) {
  const { stdout } = await execFileAsync('ssh-keygen', ['-y', '-f', privateKeyPath], { timeout: SSH_TIMEOUT_MS });
  await fs.writeFile(publicKeyPath, `${stdout.trim()} ${KEY_COMMENT}\n`, 'utf8');
}

async function restrictPrivateKey(privateKeyPath) {
  if (process.platform === 'win32') {
    return;
  }

  await fs.chmod(privateKeyPath, 0o600);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function execSshWithKnownHostRecovery(status, username, hostname, command, options = {}) {
  const execOptions = { timeout: SSH_TIMEOUT_MS, ...options };

  try {
    return await execFileAsync('ssh', getSshCommandArgs(status, username, hostname, command), execOptions);
  } catch (error) {
    if (!isRemoteHostIdentificationChangedError(error)) {
      throw error;
    }

    await removeKnownHost(hostname);
    return execFileAsync('ssh', getSshCommandArgs(status, username, hostname, command), execOptions);
  }
}

function isRemoteHostIdentificationChangedError(error) {
  return /remote host identification has changed/i.test(formatSshError(error)) || /host key verification failed/i.test(formatSshError(error));
}

function isHostnameResolutionError(error) {
  return /could not resolve hostname|no such host is known|name or service not known|temporary failure in name resolution/i.test(formatSshError(error));
}

function getUniqueHosts(hosts) {
  const uniqueHosts = [];

  for (const rawHost of hosts) {
    if (!rawHost) {
      continue;
    }

    try {
      const host = validateHost(rawHost);
      if (!uniqueHosts.includes(host)) {
        uniqueHosts.push(host);
      }
    } catch {
      continue;
    }
  }

  return uniqueHosts;
}

async function removeKnownHost(hostname) {
  if (!(await fileExists(getKnownHostsPath()))) {
    return;
  }

  await execFileAsync('ssh-keygen', ['-R', hostname, '-f', getKnownHostsPath()], { timeout: SSH_TIMEOUT_MS });
}

function formatSshError(error) {
  const output = [error.message, error.stderr, error.stdout].filter(Boolean).join('\n').trim();

  if (!output) {
    return 'SSH verification failed.';
  }

  return output;
}

function formatRemoteScriptError(error, fallbackMessage) {
  const output = [error.stdout, error.stderr]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  if (output) {
    const outputLines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const failedLine = outputLines.find((line) => line.startsWith('failed: '));
    if (failedLine) {
      return `${fallbackMessage} ${failedLine.slice('failed: '.length)}`;
    }

    const errorLine = [...outputLines].reverse().find((line) => line.startsWith('error: '));
    if (errorLine) {
      return `${fallbackMessage} ${errorLine.slice('error: '.length)}`;
    }

    return output;
  }

  return fallbackMessage;
}

function getSshCommandArgs(status, username, hostname, command) {
  return [
    '-i',
    status.privateKeyPath,
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=8',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    `UserKnownHostsFile=${getKnownHostsPath()}`,
    `${username}@${hostname}`,
    command
  ];
}

function getScpCommandArgs(status, username, hostname, localPath, remotePath) {
  return [
    '-i',
    status.privateKeyPath,
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=8',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    `UserKnownHostsFile=${getKnownHostsPath()}`,
    localPath,
    `${username}@${hostname}:${remotePath}`
  ];
}

function getPrepareInstallCommand(appName) {
  return [
    'set -eu',
    'install_dir="$HOME/TinySoundSystems"',
    `app_dir="$install_dir"/${shellQuote(appName)}`,
    'mkdir -p "$app_dir"',
    getClearAppFolderExceptLogsCommand()
  ].join('; ');
}

function getRunInstallCommand(appName, version, fileName) {
  return [
    'set -eu',
    'install_dir="$HOME/TinySoundSystems"',
    `app_dir="$install_dir"/${shellQuote(appName)}`,
    `version_dir="$app_dir"/${shellQuote(version)}`,
    `archive_path="$app_dir"/${shellQuote(fileName)}`,
    'command -v tar >/dev/null 2>&1 || { echo "tar is not available on Push." >&2; exit 3; }',
    'mkdir -p "$version_dir"',
    'tar -xzf "$archive_path" -C "$version_dir"',
    '[ -f "$version_dir/install.sh" ] || { echo "install.sh was not found in the app archive." >&2; exit 4; }',
    'chmod +x "$version_dir/install.sh"',
    'cd "$version_dir"',
    './install.sh'
  ].join('; ');
}

function getUninstallAppCommand(appName, version) {
  return [
    'set -eu',
    'install_dir="$HOME/TinySoundSystems"',
    `app_dir="$install_dir"/${shellQuote(appName)}`,
    `version_dir="$app_dir"/${shellQuote(version)}`,
    '[ -d "$version_dir" ] || { echo "App version directory was not found." >&2; exit 2; }',
    '[ -f "$version_dir/uninstall.sh" ] || { echo "uninstall.sh was not found in the app version directory." >&2; exit 4; }',
    'chmod +x "$version_dir/uninstall.sh"',
    'cd "$version_dir"',
    './uninstall.sh',
    'cd "$app_dir"',
    getClearAppFolderExceptLogsCommand()
  ].join('; ');
}

function getClearAppFolderExceptLogsCommand() {
  return 'for item in "$app_dir"/* "$app_dir"/.[!.]* "$app_dir"/..?*; do [ -e "$item" ] || continue; [ "$(basename "$item")" = "logs" ] && continue; rm -rf "$item"; done';
}

async function deleteRemoteLogFiles(status, username, hostname, installedAppName, zipFileName) {
  const remoteCommand = [
    'set -eu',
    'install_dir="$HOME/TinySoundSystems"',
    `app_dir="$install_dir"/${shellQuote(installedAppName)}`,
    'logs_dir="$app_dir/logs"',
    '[ -d "$logs_dir" ] || exit 0',
    'find "$logs_dir" -type f -exec rm -f {} \\;'
  ].join('; ');

  try {
    await execSshWithKnownHostRecovery(status, username, hostname, remoteCommand, { timeout: LOG_COLLECTION_TIMEOUT_MS });
  } catch (error) {
    throw new Error(`${zipFileName} saved to Downloads, but deleting logs on Push failed: ${formatSshError(error)}`);
  }
}

function getSafeFileName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'app';
}

function getFileTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function parseTarArchive(archiveBuffer) {
  const files = [];
  let offset = 0;

  while (offset + 512 <= archiveBuffer.length) {
    const header = archiveBuffer.subarray(offset, offset + 512);
    if (isZeroBlock(header)) {
      break;
    }

    const typeFlag = header[156] === 0 ? '\0' : String.fromCharCode(header[156]);
    const size = parseTarOctal(header, 124, 12);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;

    if (dataEnd > archiveBuffer.length) {
      throw new Error('Received an incomplete log archive from Push.');
    }

    if (typeFlag === '0' || typeFlag === '\0') {
      const fileName = normalizeTarPath(getTarPath(header));
      if (fileName) {
        files.push({
          data: archiveBuffer.subarray(dataStart, dataEnd),
          name: fileName
        });
      }
    }

    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  if (files.length === 0) {
    throw new Error('No log files were found.');
  }

  return files;
}

function createZipArchive(files) {
  const localFileRecords = [];
  const centralDirectoryRecords = [];
  let localFileOffset = 0;
  const zipDateTime = getZipDateTime(new Date());

  files.forEach((file) => {
    const nameBuffer = Buffer.from(file.name, 'utf8');
    const crc = getCrc32(file.data);
    const localHeader = Buffer.alloc(30 + nameBuffer.length);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(zipDateTime.time, 10);
    localHeader.writeUInt16LE(zipDateTime.date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(file.data.length, 18);
    localHeader.writeUInt32LE(file.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuffer.copy(localHeader, 30);

    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(zipDateTime.time, 12);
    centralHeader.writeUInt16LE(zipDateTime.date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(file.data.length, 20);
    centralHeader.writeUInt32LE(file.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localFileOffset, 42);
    nameBuffer.copy(centralHeader, 46);

    localFileRecords.push(localHeader, file.data);
    centralDirectoryRecords.push(centralHeader);
    localFileOffset += localHeader.length + file.data.length;
  });

  const centralDirectory = Buffer.concat(centralDirectoryRecords);
  const endOfCentralDirectory = Buffer.alloc(22);

  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(files.length, 8);
  endOfCentralDirectory.writeUInt16LE(files.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(localFileOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([...localFileRecords, centralDirectory, endOfCentralDirectory]);
}

function isZeroBlock(block) {
  return block.every((value) => value === 0);
}

function parseTarOctal(buffer, start, length) {
  const rawValue = buffer.subarray(start, start + length).toString('ascii').replace(/\0.*$/, '').trim();
  return rawValue ? Number.parseInt(rawValue, 8) : 0;
}

function getTarPath(header) {
  const name = readTarString(header, 0, 100);
  const prefix = readTarString(header, 345, 155);
  return prefix ? `${prefix}/${name}` : name;
}

function readTarString(buffer, start, length) {
  return buffer.subarray(start, start + length).toString('utf8').replace(/\0.*$/, '');
}

function normalizeTarPath(tarPath) {
  return tarPath
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

function getZipDateTime(date) {
  return {
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  };
}

function getCrc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_value, index) => {
  let crc = index;

  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }

  return crc >>> 0;
});

module.exports = {
  clearDeviceSshKeys,
  collectInstalledAppLogs,
  copyPublicKey,
  ensureKey,
  generateKey,
  getKeyPaths,
  getKeyStatus,
  installAppArchive,
  listInstalledApps,
  rotateKey,
  uninstallApp,
  verifyConnection
};
