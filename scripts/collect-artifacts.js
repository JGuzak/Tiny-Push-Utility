const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');
const artifactsDir = path.join(rootDir, 'artifacts');

const filePatterns = [
  /\.(exe|msi|zip|dmg|pkg|deb|rpm|AppImage)$/i,
  /^builder-(effective-config|debug)\.ya?ml$/i
];

function shouldCollect(fileName) {
  return filePatterns.some((pattern) => pattern.test(fileName));
}

function getSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

if (!fs.existsSync(releaseDir)) {
  throw new Error(`Release directory does not exist: ${releaseDir}`);
}

fs.rmSync(artifactsDir, { force: true, recursive: true });
fs.mkdirSync(artifactsDir, { recursive: true });

const copiedFiles = fs
  .readdirSync(releaseDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && shouldCollect(entry.name))
  .map((entry) => {
    const sourcePath = path.join(releaseDir, entry.name);
    const targetPath = path.join(artifactsDir, entry.name);
    fs.copyFileSync(sourcePath, targetPath);
    return {
      fileName: entry.name,
      targetPath
    };
  });

if (copiedFiles.length === 0) {
  throw new Error(`No distributable artifacts found in ${releaseDir}`);
}

const checksumLines = copiedFiles
  .filter((file) => !/^builder-(effective-config|debug)\.ya?ml$/i.test(file.fileName))
  .map((file) => `${getSha256(file.targetPath)}  ${file.fileName}`);

if (checksumLines.length > 0) {
  fs.writeFileSync(path.join(artifactsDir, 'checksums.txt'), `${checksumLines.join('\n')}\n`, 'utf8');
}

console.log(`Collected ${copiedFiles.length} artifact(s) in ${artifactsDir}`);
copiedFiles.forEach((file) => console.log(`- ${file.fileName}`));
