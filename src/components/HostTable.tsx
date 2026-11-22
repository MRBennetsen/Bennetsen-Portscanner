import React, { useMemo, useState } from 'react';
import { getPortAction } from '../presets';
import { HostResult, LaunchProtocol, NetworkInterface } from '../types';
import { NetworkIcon } from './Icons';

export type SortColumn = 'ip' | 'hostname' | 'mac' | 'vendor' | 'rtt' | 'ports';
export type SortDirection = 'asc' | 'desc';

interface HostTableProps {
  hosts: HostResult[];
  selectedIp: string | null;
  onSelectHost: (host: HostResult) => void;
  onInspectHost: (host: HostResult) => void;
  onQuickLaunch: (protocol: LaunchProtocol, ip: string, port: number) => void;
  interfaces: NetworkInterface[];
  onPickInterfaceScope: (cidr: string) => void;
  hasScanned: boolean;
  isScanning: boolean;
}

function ipToNumber(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) return 0;
  return (
    ((parseInt(parts[0], 10) || 0) << 24) |
    ((parseInt(parts[1], 10) || 0) << 16) |
    ((parseInt(parts[2], 10) || 0) << 8) |
    (parseInt(parts[3], 10) || 0)
  ) >>> 0;
}

export const HostTable: React.FC<HostTableProps> = ({
  hosts,
  selectedIp,
  onSelectHost,
  onInspectHost,
  onQuickLaunch,
  interfaces,
  onPickInterfaceScope,
  hasScanned,
  isScanning,
}) => {
  const [sortCol, setSortCol] = useState<SortColumn>('ip');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const toggleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir(col === 'ports' ? 'desc' : 'asc');
    }
  };

  const sortedHosts = useMemo(() => {
    const copy = [...hosts];
    const dir = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      switch (sortCol) {
        case 'ip':
          return (ipToNumber(a.ip) - ipToNumber(b.ip)) * dir;
        case 'hostname':
          return (a.hostname || '').localeCompare(b.hostname || '') * dir;
        case 'mac':
          return (a.mac || '').localeCompare(b.mac || '') * dir;
        case 'vendor':
          return (a.vendor || '').localeCompare(b.vendor || '') * dir;
        case 'rtt':
          return (a.rttMs - b.rttMs) * dir;
        case 'ports':
          return (a.ports.length - b.ports.length) * dir || (ipToNumber(a.ip) - ipToNumber(b.ip));
      }
    });
    return copy;
  }, [hosts, sortCol, sortDir]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (sortedHosts.length === 0) return;
    const idx = sortedHosts.findIndex((h) => h.ip === selectedIp);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = sortedHosts[Math.min(sortedHosts.length - 1, idx + 1)];
      if (next) onSelectHost(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = sortedHosts[Math.max(0, idx <= 0 ? 0 : idx - 1)];
      if (prev) onSelectHost(prev);
    } else if (e.key === 'Enter' && idx >= 0) {
      e.preventDefault();
      onInspectHost(sortedHosts[idx]);
    }
  };

  const renderSortArrow = (col: SortColumn) => {
    if (sortCol !== col) return null;
    return <span className="sort-indicator">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  if (sortedHosts.length === 0) {
    if (!hasScanned && !isScanning) {
      return (
        <div className="empty-state">
          <div className="empty-card">
            <h2 className="empty-title">
              <NetworkIcon size={16} />
              <span>Ready to Scan</span>
            </h2>
            <p className="empty-desc">
              Select a detected network scope below or enter any CIDR / IP range in the toolbar, choose a port
              preset, and press <strong>Scan</strong>. Double-click any discovered host to run deep service
              inspection and launch SSH, RDP, HTTP/S, or SMB directly.
            </p>
            <div className="nic-list">
              {interfaces.map((nic) => (
                <div
                  key={`${nic.name}-${nic.ip}`}
                  className="nic-row"
                  onClick={() => onPickInterfaceScope(nic.networkCidr)}
                  role="button"
                  tabIndex={0}
                >
                  <div>
                    <div style={{ color: 'var(--text-bright)', fontWeight: 600 }}>
                      {nic.name}{' '}
                      <span style={{ color: nic.isUp ? 'var(--status-green)' : 'var(--text-muted)', fontSize: 11 }}>
                        {nic.isUp ? 'UP' : 'DOWN'}
                      </span>
                    </div>
                    <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      Interface IP: {nic.ip}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
                      {nic.networkCidr}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{nic.hostCount} hosts</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="empty-state">
        <div style={{ fontSize: 13, color: 'var(--text-bright)', marginBottom: 4 }}>
          {isScanning ? 'Scanning network targets...' : 'No hosts match the current view'}
        </div>
        <div style={{ fontSize: 12 }}>
          {isScanning
            ? 'Hosts will stream into this grid as soon as they respond.'
            : 'Try adjusting the filter, switching to All Alive hosts, or expanding your port preset.'}
        </div>
      </div>
    );
  }

  return (
    <div className="table-scroll" tabIndex={0} onKeyDown={handleKeyDown}>
      <table className="host-table">
        <thead>
          <tr>
            <th style={{ width: '160px' }} onClick={() => toggleSort('ip')}>
              IP Address{renderSortArrow('ip')}
            </th>
            <th style={{ width: '190px' }} onClick={() => toggleSort('hostname')}>
              Hostname{renderSortArrow('hostname')}
            </th>
            <th style={{ width: '150px' }} onClick={() => toggleSort('mac')}>
              MAC Address{renderSortArrow('mac')}
            </th>
            <th style={{ width: '155px' }} onClick={() => toggleSort('vendor')}>
              Vendor{renderSortArrow('vendor')}
            </th>
            <th style={{ width: '74px' }} onClick={() => toggleSort('rtt')}>
              RTT{renderSortArrow('rtt')}
            </th>
            <th onClick={() => toggleSort('ports')}>
              Open Ports{renderSortArrow('ports')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedHosts.map((host) => {
            const isSelected = host.ip === selectedIp;
            const hasOpen = host.ports.length > 0;
            return (
              <tr
                key={host.ip}
                className={isSelected ? 'selected' : ''}
                onClick={() => onSelectHost(host)}
                onDoubleClick={() => onInspectHost(host)}
                title="Double-click to inspect services and launch sessions"
              >
                <td className="mono selectable">
                  <div className="ip-cell-inner">
                    <span className={`status-dot ${hasOpen ? '' : 'alive-only'}`} />
                    <span>{host.ip}</span>
                  </div>
                </td>
                <td className="selectable" title={host.hostname || undefined}>
                  {host.hostname ? host.hostname : <span className="muted-dash">—</span>}
                </td>
                <td className="mono selectable">
                  {host.mac ? host.mac : <span className="muted-dash">—</span>}
                </td>
                <td title={host.vendor || undefined}>
                  {host.vendor ? host.vendor : <span className="muted-dash">—</span>}
                </td>
                <td className="mono" style={{ color: 'var(--text-muted)' }}>
                  {host.rttMs > 0 ? `${host.rttMs} ms` : '—'}
                </td>
                <td className="ports-cell">
                  {hasOpen ? (
                    <div className="port-pills">
                      {host.ports.map((p) => {
                        const action = getPortAction(p.port);
                        return (
                          <button
                            key={p.port}
                            type="button"
                            className="port-pill"
                            title={
                              action
                                ? `${action.buttonLabel} (${host.ip}:${p.port})`
                                : `Port ${p.port} (${p.service}) — Double-click row to inspect`
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectHost(host);
                              if (action) {
                                onQuickLaunch(action.protocol, host.ip, p.port);
                              } else {
                                onInspectHost(host);
                              }
                            }}
                          >
                            <span>{p.port}</span>
                            <span className="port-pill-svc">{p.service}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="muted-dash">Alive (no scanned ports open)</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
