import { contextBridge, ipcRenderer } from 'electron';
import {
  AppConfig,
  HostResult,
  InspectResult,
  LaunchRequest,
  LaunchResult,
  NetworkInterface,
  ScanProfile,
  UpdateStatus,
} from './types';

export interface ScanStartPayload {
  targets: string;
  ports: string;
  concurrency?: number;
  timeoutMs?: number;
  resolveDns?: boolean;
  icmpPing?: boolean;
  arpDiscovery?: boolean;
}

export interface ScanProgressEvent {
  type: 'progress';
  completed: number;
  total: number;
  hostsUp: number;
  openPorts: number;
}

export interface ScanStartEvent {
  type: 'start';
  totalTargets: number;
  totalChecks: number;
}

export interface ScanDoneEvent {
  type: 'done';
  durationMs: number;
  completed: number;
  total: number;
  hostsUp: number;
  openPorts: number;
}

const api = {
  getAppInfo: (): Promise<{ version: string; platform: NodeJS.Platform; repoUrl: string }> =>
    ipcRenderer.invoke('app:getInfo'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),

  getInterfaces: (): Promise<NetworkInterface[]> => ipcRenderer.invoke('scanner:interfaces'),
  startScan: (payload: ScanStartPayload): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('scanner:start', payload),
  stopScan: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('scanner:stop'),
  inspectHost: (ip: string, extraPorts: string): Promise<InspectResult> =>
    ipcRenderer.invoke('scanner:inspect', ip, extraPorts),

  launchClient: (req: LaunchRequest): Promise<LaunchResult> => ipcRenderer.invoke('launcher:open', req),

  getSettings: (): Promise<AppConfig> => ipcRenderer.invoke('settings:get'),
  saveSettings: (config: AppConfig): Promise<AppConfig> => ipcRenderer.invoke('settings:save', config),
  saveProfile: (profile: ScanProfile): Promise<AppConfig> => ipcRenderer.invoke('profiles:save', profile),
  deleteProfile: (profileId: string): Promise<AppConfig> => ipcRenderer.invoke('profiles:delete', profileId),
  addRecentScope: (scope: string): Promise<AppConfig> => ipcRenderer.invoke('scopes:addRecent', scope),
  clearRecentScopes: (): Promise<AppConfig> => ipcRenderer.invoke('scopes:clearRecent'),

  exportResults: (
    format: 'csv' | 'json',
    hosts: HostResult[]
  ): Promise<{ ok: boolean; canceled?: boolean; filePath?: string }> =>
    ipcRenderer.invoke('export:save', format, hosts),

  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('updater:check'),

  onScanStart: (cb: (ev: ScanStartEvent) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, ev: ScanStartEvent) => cb(ev);
    ipcRenderer.on('scanner:start', handler);
    return () => ipcRenderer.removeListener('scanner:start', handler);
  },
  onHostsBatch: (cb: (hosts: HostResult[]) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, hosts: HostResult[]) => cb(hosts);
    ipcRenderer.on('scanner:hosts-batch', handler);
    return () => ipcRenderer.removeListener('scanner:hosts-batch', handler);
  },
  onScanProgress: (cb: (ev: ScanProgressEvent) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, ev: ScanProgressEvent) => cb(ev);
    ipcRenderer.on('scanner:progress', handler);
    return () => ipcRenderer.removeListener('scanner:progress', handler);
  },
  onScanDone: (cb: (ev: ScanDoneEvent) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, ev: ScanDoneEvent) => cb(ev);
    ipcRenderer.on('scanner:done', handler);
    return () => ipcRenderer.removeListener('scanner:done', handler);
  },
  onScanError: (cb: (msg: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, msg: string) => cb(msg);
    ipcRenderer.on('scanner:error', handler);
    return () => ipcRenderer.removeListener('scanner:error', handler);
  },
  onScanExit: (cb: (info: { code: number | null; signal: string | null }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { code: number | null; signal: string | null }) =>
      cb(info);
    ipcRenderer.on('scanner:exit', handler);
    return () => ipcRenderer.removeListener('scanner:exit', handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
