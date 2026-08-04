const fs = require('node:fs');
const path = require('node:path');

const buildPaths = [
  { path: path.join(__dirname, '..', 'dist', 'renderer'), required: true, keepRoot: true },
  { path: path.join(__dirname, '..', 'release'), required: true, keepRoot: true },
  { path: path.join(__dirname, '..', 'artifacts'), required: true, keepRoot: true },
  { path: path.join(__dirname, '..', 'dist', 'win-unpacked'), required: false, keepRoot: false }
];

function makeWritable(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  const stats = fs.lstatSync(targetPath);
  if (stats.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath)) {
      makeWritable(path.join(targetPath, entry));
    }
    fs.chmodSync(targetPath, 0o777);
    return;
  }

  fs.chmodSync(targetPath, 0o666);
}

function removePath(targetPath) {
  makeWritable(targetPath);
  fs.rmSync(targetPath, {
    force: true,
    maxRetries: 20,
    recursive: true,
    retryDelay: 500
  });
}

function emptyDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
  makeWritable(targetPath);

  for (const entry of fs.readdirSync(targetPath)) {
    removePath(path.join(targetPath, entry));
  }
}

for (const buildPath of buildPaths) {
  try {
    if (buildPath.keepRoot) {
      emptyDirectory(buildPath.path);
    } else {
      removePath(buildPath.path);
    }
  } catch (error) {
    if (buildPath.required) {
      throw error;
    }

    console.warn(`Warning: unable to remove legacy build output ${buildPath.path}: ${error.message}`);
  }
}
