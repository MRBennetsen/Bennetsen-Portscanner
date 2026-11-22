export interface NetworkInterface {
  name: string;
  ip: string;
  mask: string;
  cidr: string;
  networkCidr: string;
  prefixLen: number;
  hostCount: number;
  isUp: boolean;
}

export interface PortInfo {
  port: number;
  service: string;
  rttMs: number;
}

export interface HostResult {
  ip: string;
  hostname: string;
  mac: string;
  vendor: string;
  rttMs: number;
  alive: boolean;
  ports: PortInfo[];
  finalized: boolean;
}

export interface InspectPortDetail {
  port: number;
  service: string;
  rttMs: number;
  banner?: string;
  httpStatus?: number;
  httpServer?: string;
  httpTitle?: string;
  tlsSubject?: string;
  tlsIssuer?: string;
}

export interface InspectResult {
  ip: string;
  hostname: string;
  mac: string;
  vendor: string;
  osHint: string;
  durationMs: number;
  ports: InspectPortDetail[];
}

export interface ClientConfig {
  ssh: {
    mode:
      | 'auto'
      | 'wt'
      | 'cmd'
      | 'powershell'
      | 'putty'
      | 'gnome-terminal'
      | 'konsole'
      | 'xfce4-terminal'
      | 'kitty'
      | 'xterm'
      | 'custom';
    defaultUser: string;
    customCommand: string;
  };
  rdp: {
    mode: 'auto' | 'mstsc' | 'remmina' | 'xfreerdp' | 'custom';
    customCommand: string;
  };
  smb: {
    mode: 'auto' | 'explorer' | 'filemanager' | 'custom';
    customCommand: string;
  };
  vnc: {
    mode: 'auto' | 'vncviewer' | 'remmina' | 'custom';
    customCommand: string;
  };
  ftp: {
    mode: 'auto' | 'terminal' | 'filezilla' | 'browser' | 'custom';
    customCommand: string;
  };
  telnet: {
    mode: 'auto' | 'terminal' | 'putty' | 'custom';
    customCommand: string;
  };
}

export interface ScannerSettings {
  concurrency: number;
  timeoutMs: number;
  inspectTimeoutMs: number;
  resolveDns: boolean;
  icmpPing: boolean;
  arpDiscovery: boolean;
}

export interface UpdateSettings {
  autoCheck: boolean;
}

export interface ScanProfile {
  id: string;
  name: string;
  scope: string;
  presetId: string;
  ports: string;
}

export interface AppConfig {
  clients: ClientConfig;
  scanner: ScannerSettings;
  updates: UpdateSettings;
  profiles: ScanProfile[];
  recentScopes: string[];
}

export interface LaunchRequest {
  protocol: 'ssh' | 'rdp' | 'smb' | 'vnc' | 'ftp' | 'telnet' | 'http' | 'https';
  ip: string;
  port: number;
  user?: string;
}

export interface LaunchResult {
  ok: boolean;
  error?: string;
}

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string;
  releaseNotes?: string;
  checkedAt: string;
  noReleasesYet?: boolean;
  error?: string;
}
