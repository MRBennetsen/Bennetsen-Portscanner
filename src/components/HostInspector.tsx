import React from 'react';
import { getPortAction } from '../presets';
import { ClientConfig, HostResult, InspectPortDetail, InspectResult, LaunchProtocol } from '../types';
import { CloseIcon, CopyIcon, RefreshIcon, TerminalIcon } from './Icons';

interface HostInspectorProps {
  host: HostResult;
  inspecting: boolean;
  inspectResult: InspectResult | null;
  inspectError: string | null;
  clients: ClientConfig;
  onClose: () => void;
  onReinspect: (host: HostResult) => void;
  onLaunch: (protocol: LaunchProtocol, ip: string, port: number) => void;
  onCopyIp: (ip: string) => void;
}

export const HostInspector: React.FC<HostInspectorProps> = ({
  host,
  inspecting,
  inspectResult,
  inspectError,
  clients,
  onClose,
  onReinspect,
  onLaunch,
  onCopyIp,
}) => {
  const effectivePorts: InspectPortDetail[] = inspectResult
    ? inspectResult.ports
    : host.ports.map((p) => ({
        port: p.port,
        service: p.service,
        rttMs: p.rttMs,
      }));

  const hostname = inspectResult?.hostname || host.hostname;
  const mac = inspectResult?.mac || host.mac;
  const vendor = inspectResult?.vendor || host.vendor;
  const osHint = inspectResult?.osHint || '';

  const actionPorts = effectivePorts
    .map((p) => {
      const action = getPortAction(p.port);
      return action ? { port: p.port, service: p.service, action } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <aside className="inspector-pane">
      <div className="inspector-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span className="inspector-ip selectable">{host.ip}</span>
          <button
            type="button"
            className="btn btn-subtle btn-icon"
            style={{ height: 24, padding: '0 6px' }}
            onClick={() => onCopyIp(host.ip)}
            title="Copy IP address"
          >
            <CopyIcon />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            className="btn btn-subtle btn-icon"
            style={{ height: 24, padding: '0 6px' }}
            onClick={() => onReinspect(host)}
            disabled={inspecting}
            title="Re-run deep inspection across all predefined service ports"
          >
            <RefreshIcon />
          </button>
          <button
            type="button"
            className="btn btn-subtle btn-icon"
            style={{ height: 24, padding: '0 6px' }}
            onClick={onClose}
            title="Close inspector"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {inspecting && (
        <div className="progress-bar-track">
          <div className="progress-bar-indeterminate" />
        </div>
      )}

      <div className="inspector-body">
        {/* Host Metadata */}
        <div className="meta-grid">
          <span className="meta-key">Hostname</span>
          <span className="meta-val mono selectable">{hostname || '—'}</span>

          <span className="meta-key">MAC</span>
          <span className="meta-val mono selectable">{mac || '—'}</span>

          <span className="meta-key">Vendor</span>
          <span className="meta-val selectable">{vendor || '—'}</span>

          <span className="meta-key">OS / Device</span>
          <span className="meta-val">
            {osHint ? <span className="badge-os">{osHint}</span> : <span className="muted-dash">—</span>}
          </span>

          <span className="meta-key">Probe Time</span>
          <span className="meta-val mono">
            {inspecting
              ? 'Probing predefined ports...'
              : inspectResult
                ? `${inspectResult.durationMs} ms`
                : `${host.rttMs} ms`}
          </span>
        </div>

        {inspectError && (
          <div
            style={{
              padding: '8px 10px',
              background: 'rgba(241, 76, 76, 0.12)',
              border: '1px solid rgba(241, 76, 76, 0.4)',
              borderRadius: 3,
              color: '#f79999',
              fontSize: 12,
            }}
          >
            {inspectError}
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <h3 className="section-heading">
            <span>Session Actions</span>
            <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11 }}>
              SSH: {clients.ssh.mode}
            </span>
          </h3>
          {actionPorts.length > 0 ? (
            <div className="actions-grid">
              {actionPorts.map(({ port, action }) => (
                <button
                  key={`${action.protocol}-${port}`}
                  type="button"
                  className="action-btn"
                  onClick={() => onLaunch(action.protocol, host.ip, port)}
                >
                  <TerminalIcon />
                  <span>{action.buttonLabel}</span>
                  <span className="action-btn-port">:{port}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {inspecting
                ? 'Checking SSH, RDP, HTTP/S, SMB, VNC, FTP, Telnet...'
                : 'No launchable remote-access or web ports detected.'}
            </div>
          )}
        </div>

        {/* Open Ports & Grabbed Banners */}
        <div>
          <h3 className="section-heading">
            <span>Discovered Services ({effectivePorts.length})</span>
          </h3>
          {effectivePorts.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {inspecting ? 'Scanning 42 predefined service ports...' : 'No open ports responded during deep probe.'}
            </div>
          ) : (
            effectivePorts.map((p) => (
              <div key={p.port} className="port-detail-card">
                <div className="port-detail-top">
                  <div className="port-detail-title">
                    <span className="port-num">{p.port}/tcp</span>
                    <span className="port-svc">{p.service}</span>
                  </div>
                  <span className="port-rtt">{p.rttMs} ms</span>
                </div>

                {p.httpStatus ? (
                  <div className="port-meta-line">
                    <span style={{ color: 'var(--status-green)', fontWeight: 600 }}>HTTP {p.httpStatus}</span>
                    {p.httpTitle ? <span> — {p.httpTitle}</span> : null}
                  </div>
                ) : null}

                {p.httpServer ? (
                  <div className="port-meta-line" style={{ color: 'var(--text-muted)' }}>
                    Server: <span className="mono selectable">{p.httpServer}</span>
                  </div>
                ) : null}

                {p.tlsSubject ? (
                  <div className="port-meta-line" style={{ color: 'var(--text-muted)' }}>
                    TLS CN: <span className="mono selectable">{p.tlsSubject}</span>
                    {p.tlsIssuer && p.tlsIssuer !== p.tlsSubject ? ` (${p.tlsIssuer})` : ''}
                  </div>
                ) : null}

                {p.banner ? <pre className="banner-pre selectable">{p.banner}</pre> : null}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
};
