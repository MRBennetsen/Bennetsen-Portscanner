import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppConfig } from './types';

export const DEFAULT_CONFIG: AppConfig = {
  clients: {
    ssh: {
      mode: 'auto',
      defaultUser: '',
      customCommand: '',
    },
    rdp: {
      mode: 'auto',
      customCommand: '',
    },
    smb: {
      mode: 'auto',
      customCommand: '',
    },
    vnc: {
      mode: 'auto',
      customCommand: '',
    },
    ftp: {
      mode: 'auto',
      customCommand: '',
    },
    telnet: {
      mode: 'auto',
      customCommand: '',
    },
  },
  scanner: {
    concurrency: 1500,
    timeoutMs: 600,
    inspectTimeoutMs: 1500,
    resolveDns: true,
    icmpPing: false,
    arpDiscovery: false,
  },
  updates: {
    autoCheck: true,
  },
  profiles: [],
  recentScopes: [],
};

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function mergeConfig(raw: Partial<AppConfig> | null | undefined): AppConfig {
  const src = raw ?? {};
  return {
    clients: {
      ssh: { ...DEFAULT_CONFIG.clients.ssh, ...(src.clients?.ssh ?? {}) },
      rdp: { ...DEFAULT_CONFIG.clients.rdp, ...(src.clients?.rdp ?? {}) },
      smb: { ...DEFAULT_CONFIG.clients.smb, ...(src.clients?.smb ?? {}) },
      vnc: { ...DEFAULT_CONFIG.clients.vnc, ...(src.clients?.vnc ?? {}) },
      ftp: { ...DEFAULT_CONFIG.clients.ftp, ...(src.clients?.ftp ?? {}) },
      telnet: { ...DEFAULT_CONFIG.clients.telnet, ...(src.clients?.telnet ?? {}) },
    },
    scanner: {
      ...DEFAULT_CONFIG.scanner,
      ...(src.scanner ?? {}),
    },
    updates: {
      ...DEFAULT_CONFIG.updates,
      ...(src.updates ?? {}),
    },
    profiles: Array.isArray(src.profiles) ? src.profiles : [],
    recentScopes: Array.isArray(src.recentScopes) ? src.recentScopes.slice(0, 15) : [],
  };
}

export function loadConfig(): AppConfig {
  const filePath = getConfigPath();
  try {
    if (!fs.existsSync(filePath)) {
      return mergeConfig(null);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<AppConfig>;
    return mergeConfig(parsed);
  } catch {
    return mergeConfig(null);
  }
}

export function saveConfig(next: AppConfig): AppConfig {
  const merged = mergeConfig(next);
  const filePath = getConfigPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}
