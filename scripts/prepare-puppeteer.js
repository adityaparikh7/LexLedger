/**
 * Prepare Puppeteer Chrome binary for Electron bundling.
 * 
 * This script copies the Puppeteer Chrome cache to a local directory
 * that electron-builder will bundle as an extraResource.
 * 
 * Run this before `electron-builder` to ensure Chrome is bundled.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const TARGET_DIR = path.join(PROJECT_ROOT, 'puppeteer-cache');

// Get the Puppeteer cache directory.
// Puppeteer versions differ on Windows: some use %LOCALAPPDATA%\puppeteer\Cache,
// others fall back to ~/.cache/puppeteer (same as macOS/Linux).
// We check all known locations and use whichever exists.
const homeDir = require('os').homedir();

function findCacheDir() {
  if (process.env.PUPPETEER_CACHE_DIR) {
    return process.env.PUPPETEER_CACHE_DIR;
  }
  const candidates = [];
  if (process.platform === 'win32') {
    // Newer Puppeteer versions on Windows
    candidates.push(path.join(
      process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'),
      'puppeteer',
      'Cache'
    ));
  }
  // All platforms: the classic ~/.cache/puppeteer location
  candidates.push(path.join(homeDir, '.cache', 'puppeteer'));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log(`Found Puppeteer cache at: ${candidate}`);
      return candidate;
    }
  }
  // Return first candidate as the expected location for error messages
  return candidates[0];
}

const cacheDir = findCacheDir();

console.log(`Looking for Puppeteer cache at: ${cacheDir}`);

if (!fs.existsSync(cacheDir)) {
  console.log('Puppeteer cache not found. Downloading Chrome...');
  // Trigger Puppeteer to download Chrome
  execSync('npx puppeteer browsers install chrome', {
    cwd: path.join(PROJECT_ROOT, 'server'),
    stdio: 'inherit',
  });
}

if (!fs.existsSync(cacheDir)) {
  console.error('ERROR: Puppeteer cache still not found after download attempt.');
  console.error(`Expected at: ${cacheDir}`);
  process.exit(1);
}

// Clean target directory
if (fs.existsSync(TARGET_DIR)) {
  console.log('Cleaning existing puppeteer-cache directory...');
  fs.rmSync(TARGET_DIR, { recursive: true, force: true });
}

// Copy the cache
console.log(`Copying Puppeteer cache to: ${TARGET_DIR}`);
fs.cpSync(cacheDir, TARGET_DIR, { recursive: true });

// Calculate size
function getDirSize(dir) {
  let totalSize = 0;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      totalSize += getDirSize(fullPath);
    } else {
      totalSize += fs.statSync(fullPath).size;
    }
  }
  return totalSize;
}

const sizeMB = (getDirSize(TARGET_DIR) / 1024 / 1024).toFixed(1);
console.log(`✅ Puppeteer Chrome bundled successfully (${sizeMB} MB)`);
