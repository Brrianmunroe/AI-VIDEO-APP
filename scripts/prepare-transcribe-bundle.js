/**
 * Prepare bundled Python + faster-whisper for word-level transcription.
 * Run before electron-builder so the packaged app includes word-level sync without user-installed Python.
 *
 * Usage: node scripts/prepare-transcribe-bundle.js
 * Output: resources/python/ (standalone Python + site-packages), resources/transcribe_words.py
 */

import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { get } from 'https';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const resourcesDir = join(projectRoot, 'resources');
const scriptSource = join(projectRoot, 'scripts', 'transcribe_words.py');

const RELEASE_TAG = '20260203';
const BASE_URL = `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE_TAG}`;

function getAssetName() {
  const plat = process.platform;
  const arch = process.arch;
  // Map Node platform/arch to python-build-standalone triple
  if (plat === 'darwin' && arch === 'arm64') return `cpython-3.10.19+${RELEASE_TAG}-aarch64-apple-darwin-install_only.tar.gz`;
  if (plat === 'darwin' && arch === 'x64') return `cpython-3.10.19+${RELEASE_TAG}-x86_64-apple-darwin-install_only.tar.gz`;
  if (plat === 'win32' && arch === 'x64') return `cpython-3.10.19+${RELEASE_TAG}-x86_64-pc-windows-msvc-install_only.tar.gz`;
  if (plat === 'linux' && arch === 'x64') return `cpython-3.10.19+${RELEASE_TAG}-x86_64-unknown-linux-gnu-install_only.tar.gz`;
  if (plat === 'linux' && arch === 'arm64') return `cpython-3.10.19+${RELEASE_TAG}-aarch64-unknown-linux-gnu-install_only.tar.gz`;
  throw new Error(`Unsupported platform: ${plat}/${arch}. Supported: darwin (arm64,x64), win32 (x64), linux (x64,arm64).`);
}

function download(url) {
  return new Promise((resolve, reject) => {
    const dest = join(resourcesDir, 'python-bundle.tar.gz');
    const file = createWriteStream(dest);
    get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirect = res.headers.location;
        if (redirect) return download(redirect).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${res.statusCode} ${res.statusMessage}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', (err) => { file.close(); reject(err); });
  });
}

function extractTarGz(archivePath, outDir) {
  if (process.platform === 'win32') {
    // Windows: use tar if available (Win10+), else fail with a message
    execSync(`tar -xzf "${archivePath}" -C "${outDir}"`, { stdio: 'inherit' });
  } else {
    execSync(`tar -xzf "${archivePath}" -C "${outDir}"`, { stdio: 'inherit' });
  }
}

function getPythonExePath(pythonDir) {
  if (process.platform === 'win32') {
    const exe = join(pythonDir, 'python.exe');
    if (existsSync(exe)) return exe;
    return join(pythonDir, 'install', 'python.exe');
  }
  const binDir = join(pythonDir, 'bin');
  if (existsSync(join(binDir, 'python3'))) return join(binDir, 'python3');
  if (existsSync(join(binDir, 'python'))) return join(binDir, 'python');
  const installBin = join(pythonDir, 'install', 'bin', 'python3');
  if (existsSync(installBin)) return installBin;
  throw new Error(`Could not find Python executable under ${pythonDir}`);
}

async function main() {
  console.log('Preparing transcribe bundle (Python + faster-whisper)...');
  const assetName = getAssetName();
  const url = `${BASE_URL}/${encodeURIComponent(assetName)}`;
  console.log('Platform:', process.platform, process.arch, '->', assetName);

  if (!existsSync(scriptSource)) {
    console.error('Missing scripts/transcribe_words.py');
    process.exit(1);
  }

  mkdirSync(resourcesDir, { recursive: true });

  const pythonDir = join(resourcesDir, 'python');
  if (existsSync(pythonDir)) {
    console.log('Removing existing resources/python/');
    rmSync(pythonDir, { recursive: true });
  }

  const archivePath = join(resourcesDir, 'python-bundle.tar.gz');
  if (!existsSync(archivePath)) {
    console.log('Downloading Python standalone...');
    await download(url);
  } else {
    console.log('Using existing archive (delete resources/python-bundle.tar.gz to re-download).');
  }

  console.log('Extracting...');
  extractTarGz(archivePath, resourcesDir);

  const topLevel = readdirSync(resourcesDir);
  const hasPython = topLevel.includes('python');
  if (!hasPython) {
    const firstDir = topLevel.find((n) => {
      const p = join(resourcesDir, n);
      return n !== 'python-bundle.tar.gz' && statSync(p).isDirectory();
    });
    if (firstDir) {
      renameSync(join(resourcesDir, firstDir), pythonDir);
    } else {
      console.error('Extraction did not produce a python directory. Top-level:', topLevel);
      process.exit(1);
    }
  }

  const pythonExe = getPythonExePath(join(resourcesDir, 'python'));
  if (!existsSync(pythonExe)) {
    console.error('Python executable not found at', pythonExe);
    process.exit(1);
  }
  console.log('Python at', pythonExe);

  console.log('Installing faster-whisper...');
  execSync(`"${pythonExe}" -m pip install --no-warn-script-location faster-whisper`, {
    stdio: 'inherit',
    cwd: projectRoot,
    env: { ...process.env, PYTHONUSERBASE: undefined },
  });

  const scriptDest = join(resourcesDir, 'transcribe_words.py');
  writeFileSync(scriptDest, readFileSync(scriptSource, 'utf8'));
  console.log('Copied transcribe_words.py to resources/');

  try {
    unlinkSync(archivePath);
  } catch (_) {}
  console.log('Done. Run npm run build:electron to package the app.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
