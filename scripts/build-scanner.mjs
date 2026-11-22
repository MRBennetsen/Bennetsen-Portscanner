import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const scannerDir = join(rootDir, 'scanner');
const binDir = join(scannerDir, 'bin');

mkdirSync(binDir, { recursive: true });

const isWin = process.platform === 'win32';
const outFile = join(binDir, isWin ? 'portscanner.exe' : 'portscanner');

console.log(`Building Go scanner -> ${outFile}`);
execFileSync('go', ['build', '-ldflags=-s -w', '-o', outFile, '.'], {
  cwd: scannerDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    CGO_ENABLED: '0',
  },
});
