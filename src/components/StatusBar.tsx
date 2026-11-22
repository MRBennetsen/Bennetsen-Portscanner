import React from 'react';
import { UpdateStatus } from '../types';

interface StatusBarProps {
  isScanning: boolean;
  completedChecks: number;
  totalChecks: number;
  hostsCount: number;
  openPortsCount: number;
  durationMs: number | null;
  concurrency: number;
  appVersion: string;
  updateStatus: UpdateStatus | null;
  onUpdateClick: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  isScanning,
  completedChecks,
  totalChecks,
  hostsCount,
  openPortsCount,
  durationMs,
  concurrency,
  appVersion,
  updateStatus,
  onUpdateClick,
}) => {
  const pct = totalChecks > 0 ? Math.min(100, Math.round((completedChecks / totalChecks) * 100)) : 0;

  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        <span className={`status-mode-badge ${isScanning ? 'scanning' : ''}`}>
          {isScanning ? `SCANNING ${pct}%` : 'READY'}
        </span>
        <span className="status-item mono">
          {totalChecks > 0 ? `${completedChecks.toLocaleString()} / ${totalChecks.toLocaleString()} checks` : 'Idle'}
        </span>
        <span className="status-item">Hosts: {hostsCount}</span>
        <span className="status-item">Open Ports: {openPortsCount}</span>
        {durationMs !== null && !isScanning && (
          <span className="status-item mono">Last Scan: {(durationMs / 1000).toFixed(2)}s</span>
        )}
      </div>

      <div className="statusbar-right">
        <span className="status-item mono" style={{ borderRight: 'none', borderLeft: '1px solid var(--border)' }}>
          {concurrency} workers
        </span>
        {updateStatus?.updateAvailable ? (
          <button
            type="button"
            className="status-item clickable status-update-badge"
            style={{ border: 'none' }}
            onClick={onUpdateClick}
            title="A newer release is available on GitHub"
          >
            Update Available: v{updateStatus.latestVersion}
          </button>
        ) : (
          <button
            type="button"
            className="status-item clickable mono"
            style={{ border: 'none', background: 'transparent' }}
            onClick={onUpdateClick}
            title="Check GitHub Releases for updates"
          >
            v{appVersion}
          </button>
        )}
      </div>
    </footer>
  );
};
