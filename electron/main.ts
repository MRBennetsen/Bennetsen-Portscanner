import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { ChildProcess, execFile, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { launchClient } from './launcher';
import { loadConfig, saveConfig } from './store';
import { AppConfig, HostResult, InspectResult, LaunchRequest, NetworkInterface, ScanProfile } from './types';
import { checkForUpdates, REPO_URL } from './updater';

let mainWindow: BrowserWindow | null = null;
let activeScanProc: ChildProcess | null = null;

function getScannerBinaryPath(): string {
  const binName = process.platform === 'win32' ? 'portscanner.exe' : 'portscanner';
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', binName);
  }
  return path.join(app.getAppPath(), 'scanner', 'bin', binName);
}

function getAppIconPath(): string | undefined {
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const devPath = path.join(app.getAppPath(), 'build', iconFile);
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  return undefined;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#1e1e1e',
    title: 'Bennetsen Portscanner',
    autoHideMenuBar: true,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL || !app.isPackaged) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    // In local preview without Vite running, fall back to built dist/index.html
    const distHtml = path.join(app.getAppPath(), 'dist', 'index.html');
    mainWindow.loadURL(devUrl).catch(() => {
      if (fs.existsSync(distHtml) && mainWindow) {
        void mainWindow.loadFile(distHtml);
      }
    });
  } else {
    void mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    stopActiveScan();
    mainWindow = null;
  });
}

function stopActiveScan() {
  if (!activeScanProc) return;
  try {
    activeScanProc.kill('SIGTERM');
  } catch {
    try {
      activeScanProc.kill();
    } catch {
      // ignore
    }
  }
  activeScanProc = null;
}

function runInterfaces(): Promise<NetworkInterface[]> {
  return new Promise((resolve, reject) => {
    const bin = getScannerBinaryPath();
    execFile(bin, ['interfaces'], { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
        return;
      }
      try {
        const list = JSON.parse(stdout) as NetworkInterface[];
        resolve(Array.isArray(list) ? list : []);
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

function runInspect(ip: string, extraPorts: string, timeoutMs: number): Promise<InspectResult> {
  return new Promise((resolve, reject) => {
    const bin = getScannerBinaryPath();
    const args = ['inspect', '--ip', ip, '--timeout', String(timeoutMs)];
    if (extraPorts.trim()) {
      args.push('--ports', extraPorts.trim());
    }
    execFile(bin, args, { timeout: Math.max(15000, timeoutMs * 8) }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as InspectResult);
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

interface StartScanPayload {
  targets: string;
  ports: string;
  concurrency?: number;
  timeoutMs?: number;
  resolveDns?: boolean;
  icmpPing?: boolean;
  arpDiscovery?: boolean;
}

function registerIPC() {
  ipcMain.handle('app:getInfo', () => ({
    version: app.getVersion(),
    platform: process.platform,
    repoUrl: REPO_URL,
  }));

  ipcMain.handle('app:openExternal', async (_evt, url: string) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle('scanner:interfaces', async () => {
    return runInterfaces();
  });

  ipcMain.handle('scanner:inspect', async (_evt, ip: string, extraPorts: string) => {
    const cfg = loadConfig();
    return runInspect(ip, extraPorts || '', cfg.scanner.inspectTimeoutMs);
  });

  ipcMain.handle('scanner:start', (_evt, payload: StartScanPayload) => {
    stopActiveScan();

    const cfg = loadConfig();
    const bin = getScannerBinaryPath();
    if (!fs.existsSync(bin)) {
      return {
        ok: false,
        error: `Scanner binary not found at ${bin}. Run "npm run build:scanner" first.`,
      };
    }

    const args = [
      'scan',
      '--targets',
      payload.targets,
      '--ports',
      payload.ports,
      '--concurrency',
      String(payload.concurrency ?? cfg.scanner.concurrency),
      '--timeout',
      String(payload.timeoutMs ?? cfg.scanner.timeoutMs),
      '--rdns',
      String(payload.resolveDns ?? cfg.scanner.resolveDns),
      '--icmp',
      String(payload.icmpPing ?? cfg.scanner.icmpPing),
      '--arp',
      String(payload.arpDiscovery ?? cfg.scanner.arpDiscovery),
    ];

    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    activeScanProc = proc;

    let hostBatch: HostResult[] = [];
    let latestProgress: Record<string, unknown> | null = null;
    let stderrBuf = '';

    const flushBatch = () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (hostBatch.length > 0) {
        mainWindow.webContents.send('scanner:hosts-batch', hostBatch);
        hostBatch = [];
      }
      if (latestProgress) {
        mainWindow.webContents.send('scanner:progress', latestProgress);
        latestProgress = null;
      }
    };

    const batchTimer = setInterval(flushBatch, 60);

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const ev = JSON.parse(trimmed) as {
          type: string;
          host?: HostResult;
          [key: string]: unknown;
        };

        if (ev.type === 'host' && ev.host) {
          hostBatch.push(ev.host);
        } else if (ev.type === 'progress') {
          latestProgress = ev;
        } else if (ev.type === 'start') {
          mainWindow?.webContents.send('scanner:start', ev);
        } else if (ev.type === 'done') {
          flushBatch();
          mainWindow?.webContents.send('scanner:done', ev);
        } else if (ev.type === 'error') {
          flushBatch();
          mainWindow?.webContents.send('scanner:error', ev.message ?? 'Scan error');
        }
      } catch {
        // Ignore non-JSON lines
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf-8');
    });

    proc.on('error', (err) => {
      clearInterval(batchTimer);
      flushBatch();
      if (activeScanProc === proc) {
        activeScanProc = null;
      }
      mainWindow?.webContents.send('scanner:error', err.message);
    });

    proc.on('close', (code, signal) => {
      clearInterval(batchTimer);
      flushBatch();
      if (activeScanProc === proc) {
        activeScanProc = null;
      }
      if (code !== 0 && signal !== 'SIGTERM' && stderrBuf.trim()) {
        mainWindow?.webContents.send('scanner:error', stderrBuf.trim());
      }
      mainWindow?.webContents.send('scanner:exit', { code, signal });
    });

    return { ok: true };
  });

  ipcMain.handle('scanner:stop', () => {
    stopActiveScan();
    return { ok: true };
  });

  ipcMain.handle('launcher:open', async (_evt, req: LaunchRequest) => {
    const cfg = loadConfig();
    return launchClient(req, cfg.clients);
  });

  ipcMain.handle('settings:get', () => loadConfig());

  ipcMain.handle('settings:save', (_evt, next: AppConfig) => saveConfig(next));

  ipcMain.handle('profiles:save', (_evt, profile: ScanProfile) => {
    const cfg = loadConfig();
    const idx = cfg.profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      cfg.profiles[idx] = profile;
    } else {
      cfg.profiles.unshift(profile);
    }
    return saveConfig(cfg);
  });

  ipcMain.handle('profiles:delete', (_evt, profileId: string) => {
    const cfg = loadConfig();
    cfg.profiles = cfg.profiles.filter((p) => p.id !== profileId);
    return saveConfig(cfg);
  });

  ipcMain.handle('scopes:addRecent', (_evt, scope: string) => {
    const trimmed = scope.trim();
    if (!trimmed) return loadConfig();
    const cfg = loadConfig();
    cfg.recentScopes = [trimmed, ...cfg.recentScopes.filter((s) => s !== trimmed)].slice(0, 15);
    return saveConfig(cfg);
  });

  ipcMain.handle('scopes:clearRecent', () => {
    const cfg = loadConfig();
    cfg.recentScopes = [];
    return saveConfig(cfg);
  });

  ipcMain.handle('export:save', async (_evt, format: 'csv' | 'json', hosts: HostResult[]) => {
    if (!mainWindow) return { ok: false, canceled: true };
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const ext = format === 'csv' ? 'csv' : 'json';
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: `Export Scan Results (${ext.toUpperCase()})`,
      defaultPath: `bennetsen-scan-${stamp}.${ext}`,
      filters: [
        format === 'csv'
          ? { name: 'CSV Files', extensions: ['csv'] }
          : { name: 'JSON Files', extensions: ['json'] },
      ],
    });

    if (canceled || !filePath) {
      return { ok: false, canceled: true };
    }

    if (format === 'json') {
      fs.writeFileSync(filePath, JSON.stringify(hosts, null, 2), 'utf-8');
      return { ok: true, filePath };
    }

    const escapeCsv = (val: string) => `"${val.replaceAll('"', '""')}"`;
    const header = ['IP', 'Hostname', 'MAC', 'Vendor', 'RTT_ms', 'Open_Ports'].join(',');
    const rows = hosts.map((h) => {
      const portsStr = h.ports.map((p) => `${p.port}/${p.service}`).join('; ');
      return [
        escapeCsv(h.ip),
        escapeCsv(h.hostname || ''),
        escapeCsv(h.mac || ''),
        escapeCsv(h.vendor || ''),
        String(h.rttMs),
        escapeCsv(portsStr),
      ].join(',');
    });
    fs.writeFileSync(filePath, [header, ...rows].join('\n'), 'utf-8');
    return { ok: true, filePath };
  });

  ipcMain.handle('updater:check', async () => checkForUpdates());
}

app.whenReady().then(() => {
  registerIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopActiveScan();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
