const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const MAX_SESSION_LOG_COUNT = 10;
const MAX_LOG_BYTES = 500 * 1024;
const SESSION_LOG_PATTERN = /^tiny-push-utility-\d+-.*\.log$/;
const LOG_LIMIT_MESSAGE = '[Tiny Push Utility] Log size limit reached. Additional notification events were not written.\n';

let currentLogPath = null;
let didWriteLimitMessage = false;

async function initialize() {
  const logPath = getLogPath();
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.writeFile(logPath, '', { flag: 'a' });
  await pruneOldSessionLogs();

  return {
    logPath,
    maxLogBytes: MAX_LOG_BYTES,
    maxSessionLogCount: MAX_SESSION_LOG_COUNT
  };
}

function getLogPath() {
  if (!currentLogPath) {
    currentLogPath = path.join(app.getPath('temp'), `tiny-push-utility-${process.pid}-${getFileTimestamp()}.log`);
  }

  return currentLogPath;
}

async function appendEvent(event) {
  const appEvent = validateAppEvent(event);
  const logPath = getLogPath();
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  const writeResult = await appendLogLine(logPath, `${formatAppEvent(appEvent)}\n`);

  return {
    logPath,
    ...writeResult
  };
}

async function exportLatestLog() {
  const sourcePath = getLogPath();
  const downloadsPath = app.getPath('downloads');
  const fileName = `tiny-push-utility-log-${getFileTimestamp()}.log`;
  const localPath = path.join(downloadsPath, fileName);

  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.mkdir(downloadsPath, { recursive: true });

  try {
    await fs.access(sourcePath);
  } catch {
    await fs.writeFile(sourcePath, '', 'utf8');
  }

  await fs.copyFile(sourcePath, localPath);

  return {
    fileName,
    localPath,
    sourcePath
  };
}

async function appendLogLine(logPath, line) {
  const lineBuffer = Buffer.from(line, 'utf8');
  const currentSize = await getFileSize(logPath);

  if (currentSize + lineBuffer.byteLength <= MAX_LOG_BYTES) {
    await fs.appendFile(logPath, lineBuffer);
    return {
      bytesWritten: lineBuffer.byteLength,
      isTruncated: false,
      maxLogBytes: MAX_LOG_BYTES
    };
  }

  await writeLimitMessage(logPath, currentSize);

  return {
    bytesWritten: 0,
    isTruncated: true,
    maxLogBytes: MAX_LOG_BYTES
  };
}

async function writeLimitMessage(logPath, currentSize) {
  if (didWriteLimitMessage || currentSize >= MAX_LOG_BYTES) {
    didWriteLimitMessage = true;
    return;
  }

  const messageBuffer = Buffer.from(LOG_LIMIT_MESSAGE, 'utf8');
  const remainingBytes = MAX_LOG_BYTES - currentSize;
  await fs.appendFile(logPath, messageBuffer.subarray(0, remainingBytes));
  didWriteLimitMessage = true;
}

async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return 0;
    }

    throw error;
  }
}

async function pruneOldSessionLogs() {
  const logsDirectory = app.getPath('temp');
  const entries = await fs.readdir(logsDirectory, { withFileTypes: true });
  const sessionLogs = [];

  for (const entry of entries) {
    if (!entry.isFile() || !SESSION_LOG_PATTERN.test(entry.name)) {
      continue;
    }

    const filePath = path.join(logsDirectory, entry.name);
    const stats = await fs.stat(filePath);
    sessionLogs.push({
      filePath,
      modifiedAt: stats.mtimeMs,
      name: entry.name
    });
  }

  sessionLogs.sort((left, right) => right.modifiedAt - left.modifiedAt || right.name.localeCompare(left.name));

  for (const staleLog of sessionLogs.slice(MAX_SESSION_LOG_COUNT)) {
    await fs.rm(staleLog.filePath, { force: true });
  }
}

function validateAppEvent(event) {
  if (!event || typeof event !== 'object') {
    throw new Error('A notification event is required.');
  }

  const id = validateString(event.id, 'Notification event id');
  const createdAt = validateString(event.createdAt, 'Notification event timestamp');
  const kind = validateString(event.kind, 'Notification event kind');
  const message = validateString(event.message, 'Notification event message');
  const details = optionalString(event.details, 'Notification event details');
  const source = optionalString(event.source, 'Notification event source');

  return {
    id,
    createdAt,
    kind,
    message,
    details,
    source
  };
}

function validateString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function optionalString(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }

  return value;
}

function formatAppEvent(event) {
  const source = event.source ? ` ${event.source}` : '';
  const details = event.details ? `\n${event.details}` : '';
  return `[${event.createdAt}] [${event.kind}${source}] ${event.message}${details}`;
}

function getFileTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

module.exports = {
  appendEvent,
  exportLatestLog,
  initialize
};
