import React, { useState } from 'react';
import { AppConfig, ClientConfig, UpdateStatus } from '../types';
import { CloseIcon } from './Icons';

interface SettingsModalProps {
  config: AppConfig;
  platform: string;
  appVersion: string;
  repoUrl: string;
  updateStatus: UpdateStatus | null;
  checkingUpdates: boolean;
  onCheckUpdates: () => void;
  onOpenExternal: (url: string) => void;
  onSave: (next: AppConfig) => void;
  onClose: () => void;
}

type SettingsTab = 'clients' | 'scanner' | 'updates';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  config,
  platform,
  appVersion,
  repoUrl,
  updateStatus,
  checkingUpdates,
  onCheckUpdates,
  onOpenExternal,
  onSave,
  onClose,
}) => {
  const [tab, setTab] = useState<SettingsTab>('clients');
  const [draft, setDraft] = useState<AppConfig>(() => JSON.parse(JSON.stringify(config)) as AppConfig);
  const isWin = platform === 'win32';

  const updateClient = <K extends keyof ClientConfig>(
    key: K,
    patch: Partial<ClientConfig[K]>
  ) => {
    setDraft((prev) => ({
      ...prev,
      clients: {
        ...prev.clients,
        [key]: { ...prev.clients[key], ...patch },
      },
    }));
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Settings</span>
          <button type="button" className="btn btn-subtle btn-icon" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-split">
          <nav className="modal-nav">
            <button
              type="button"
              className={`modal-nav-item ${tab === 'clients' ? 'active' : ''}`}
              onClick={() => setTab('clients')}
            >
              External Clients
            </button>
            <button
              type="button"
              className={`modal-nav-item ${tab === 'scanner' ? 'active' : ''}`}
              onClick={() => setTab('scanner')}
            >
              Scanner Engine
            </button>
            <button
              type="button"
              className={`modal-nav-item ${tab === 'updates' ? 'active' : ''}`}
              onClick={() => setTab('updates')}
            >
              Updates & About
            </button>
          </nav>

          <div className="modal-content">
            {tab === 'clients' && (
              <>
                <div className="setting-hint">
                  Placeholders for custom commands:{' '}
                  <code className="mono">{'{ip}'}</code>, <code className="mono">{'{port}'}</code>,{' '}
                  <code className="mono">{'{user}'}</code>, <code className="mono">{'{dest}'}</code>
                </div>

                {/* SSH */}
                <div className="setting-row">
                  <label className="setting-title">SSH Client</label>
                  <div className="setting-inline">
                    <select
                      className="select-control"
                      style={{ flex: 1 }}
                      value={draft.clients.ssh.mode}
                      onChange={(e) =>
                        updateClient('ssh', { mode: e.target.value as ClientConfig['ssh']['mode'] })
                      }
                    >
                      <option value="auto">
                        {isWin
                          ? 'Auto (Windows Terminal -> CMD)'
                          : 'Auto (System Default Terminal)'}
                      </option>
                      {isWin ? (
                        <>
                          <option value="wt">Windows Terminal (wt.exe)</option>
                          <option value="cmd">Command Prompt (cmd.exe)</option>
                          <option value="powershell">PowerShell (powershell.exe)</option>
                          <option value="putty">PuTTY (putty.exe)</option>
                        </>
                      ) : (
                        <>
                          <option value="gnome-terminal">GNOME Terminal</option>
                          <option value="konsole">Konsole</option>
                          <option value="xfce4-terminal">XFCE Terminal</option>
                          <option value="kitty">Kitty</option>
                          <option value="xterm">XTerm</option>
                          <option value="putty">PuTTY</option>
                        </>
                      )}
                      <option value="custom">Custom Command...</option>
                    </select>
                    <input
                      type="text"
                      className="input-control mono"
                      style={{ width: 170 }}
                      placeholder="Default user (optional)"
                      value={draft.clients.ssh.defaultUser}
                      onChange={(e) => updateClient('ssh', { defaultUser: e.target.value })}
                    />
                  </div>
                  {draft.clients.ssh.mode === 'custom' && (
                    <input
                      type="text"
                      className="input-control mono"
                      placeholder={isWin ? 'putty.exe -ssh {dest} -P {port}' : 'alacritty -e ssh -p {port} {dest}'}
                      value={draft.clients.ssh.customCommand}
                      onChange={(e) => updateClient('ssh', { customCommand: e.target.value })}
                    />
                  )}
                </div>

                {/* RDP */}
                <div className="setting-row">
                  <label className="setting-title">RDP Client</label>
                  <select
                    className="select-control"
                    value={draft.clients.rdp.mode}
                    onChange={(e) =>
                      updateClient('rdp', { mode: e.target.value as ClientConfig['rdp']['mode'] })
                    }
                  >
                    <option value="auto">
                      {isWin ? 'Auto (mstsc.exe)' : 'Auto (Remmina -> xfreerdp)'}
                    </option>
                    {isWin ? (
                      <option value="mstsc">Windows Remote Desktop (mstsc.exe)</option>
                    ) : (
                      <>
                        <option value="remmina">Remmina</option>
                        <option value="xfreerdp">FreeRDP (xfreerdp)</option>
                      </>
                    )}
                    <option value="custom">Custom Command...</option>
                  </select>
                  {draft.clients.rdp.mode === 'custom' && (
                    <input
                      type="text"
                      className="input-control mono"
                      placeholder="xfreerdp /v:{ip}:{port} /u:{user}"
                      value={draft.clients.rdp.customCommand}
                      onChange={(e) => updateClient('rdp', { customCommand: e.target.value })}
                    />
                  )}
                </div>

                {/* SMB */}
                <div className="setting-row">
                  <label className="setting-title">SMB / File Share Client</label>
                  <select
                    className="select-control"
                    value={draft.clients.smb.mode}
                    onChange={(e) =>
                      updateClient('smb', { mode: e.target.value as ClientConfig['smb']['mode'] })
                    }
                  >
                    <option value="auto">
                      {isWin ? 'Auto (Windows Explorer \\\\ip)' : 'Auto (System File Manager smb://)'}
                    </option>
                    <option value="custom">Custom Command...</option>
                  </select>
                  {draft.clients.smb.mode === 'custom' && (
                    <input
                      type="text"
                      className="input-control mono"
                      placeholder={isWin ? 'explorer.exe \\\\{ip}' : 'nautilus smb://{ip}'}
                      value={draft.clients.smb.customCommand}
                      onChange={(e) => updateClient('smb', { customCommand: e.target.value })}
                    />
                  )}
                </div>

                {/* VNC */}
                <div className="setting-row">
                  <label className="setting-title">VNC Client</label>
                  <select
                    className="select-control"
                    value={draft.clients.vnc.mode}
                    onChange={(e) =>
                      updateClient('vnc', { mode: e.target.value as ClientConfig['vnc']['mode'] })
                    }
                  >
                    <option value="auto">Auto (Remmina / VNC Viewer / URI)</option>
                    <option value="vncviewer">VNC Viewer (vncviewer)</option>
                    {!isWin && <option value="remmina">Remmina</option>}
                    <option value="custom">Custom Command...</option>
                  </select>
                  {draft.clients.vnc.mode === 'custom' && (
                    <input
                      type="text"
                      className="input-control mono"
                      placeholder="vncviewer {ip}:{port}"
                      value={draft.clients.vnc.customCommand}
                      onChange={(e) => updateClient('vnc', { customCommand: e.target.value })}
                    />
                  )}
                </div>

                {/* FTP */}
                <div className="setting-row">
                  <label className="setting-title">FTP Client</label>
                  <select
                    className="select-control"
                    value={draft.clients.ftp.mode}
                    onChange={(e) =>
                      updateClient('ftp', { mode: e.target.value as ClientConfig['ftp']['mode'] })
                    }
                  >
                    <option value="auto">Auto (Terminal FTP)</option>
                    <option value="filezilla">FileZilla</option>
                    <option value="browser">Default Browser / Handler</option>
                    <option value="custom">Custom Command...</option>
                  </select>
                  {draft.clients.ftp.mode === 'custom' && (
                    <input
                      type="text"
                      className="input-control mono"
                      placeholder="filezilla ftp://{ip}:{port}"
                      value={draft.clients.ftp.customCommand}
                      onChange={(e) => updateClient('ftp', { customCommand: e.target.value })}
                    />
                  )}
                </div>

                {/* Telnet */}
                <div className="setting-row">
                  <label className="setting-title">Telnet Client</label>
                  <select
                    className="select-control"
                    value={draft.clients.telnet.mode}
                    onChange={(e) =>
                      updateClient('telnet', { mode: e.target.value as ClientConfig['telnet']['mode'] })
                    }
                  >
                    <option value="auto">Auto (Terminal Telnet)</option>
                    <option value="putty">PuTTY</option>
                    <option value="custom">Custom Command...</option>
                  </select>
                  {draft.clients.telnet.mode === 'custom' && (
                    <input
                      type="text"
                      className="input-control mono"
                      placeholder="putty -telnet {ip} -P {port}"
                      value={draft.clients.telnet.customCommand}
                      onChange={(e) => updateClient('telnet', { customCommand: e.target.value })}
                    />
                  )}
                </div>
              </>
            )}

            {tab === 'scanner' && (
              <>
                <div className="setting-row">
                  <label className="setting-title">
                    Max Concurrency ({draft.scanner.concurrency} goroutines)
                  </label>
                  <div className="setting-inline">
                    <input
                      type="range"
                      min={100}
                      max={5000}
                      step={100}
                      style={{ flex: 1 }}
                      value={draft.scanner.concurrency}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          scanner: { ...prev.scanner, concurrency: Number(e.target.value) },
                        }))
                      }
                    />
                    <input
                      type="number"
                      min={50}
                      max={10000}
                      className="input-control mono"
                      style={{ width: 90 }}
                      value={draft.scanner.concurrency}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          scanner: {
                            ...prev.scanner,
                            concurrency: Math.max(50, Math.min(10000, Number(e.target.value) || 1500)),
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="setting-inline" style={{ marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ height: 24, fontSize: 11.5 }}
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, scanner: { ...prev.scanner, concurrency: 1000 } }))
                      }
                    >
                      Balanced (1000)
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ height: 24, fontSize: 11.5 }}
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, scanner: { ...prev.scanner, concurrency: 2000 } }))
                      }
                    >
                      Aggressive (2000)
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ height: 24, fontSize: 11.5 }}
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, scanner: { ...prev.scanner, concurrency: 4500 } }))
                      }
                    >
                      Max Throughput (4500)
                    </button>
                  </div>
                  <span className="setting-hint">
                    Runs asynchronously in the Go engine across all CPU cores without freezing the UI.
                  </span>
                </div>

                <div className="setting-row">
                  <label className="setting-title">TCP Connect Timeout (ms)</label>
                  <input
                    type="number"
                    min={100}
                    max={10000}
                    step={50}
                    className="input-control mono"
                    style={{ width: 140 }}
                    value={draft.scanner.timeoutMs}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        scanner: {
                          ...prev.scanner,
                          timeoutMs: Math.max(100, Math.min(10000, Number(e.target.value) || 600)),
                        },
                      }))
                    }
                  />
                  <span className="setting-hint">
                    Use 250–500 ms for fast local gigabit LANs; 800–1500 ms over VPNs or slower links.
                  </span>
                </div>

                <div className="setting-row">
                  <label className="setting-title">Deep Inspect Timeout (ms)</label>
                  <input
                    type="number"
                    min={200}
                    max={10000}
                    step={100}
                    className="input-control mono"
                    style={{ width: 140 }}
                    value={draft.scanner.inspectTimeoutMs}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        scanner: {
                          ...prev.scanner,
                          inspectTimeoutMs: Math.max(200, Math.min(10000, Number(e.target.value) || 1500)),
                        },
                      }))
                    }
                  />
                  <span className="setting-hint">
                    Timeout used when double-clicking a host to probe all 42 predefined service ports and grab
                    banners.
                  </span>
                </div>

                <div className="setting-row">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={draft.scanner.resolveDns}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          scanner: { ...prev.scanner, resolveDns: e.target.checked },
                        }))
                      }
                    />
                    <span>Resolve Reverse DNS Hostnames (PTR)</span>
                  </label>
                </div>

                <div
                  style={{
                    borderTop: '1px solid var(--border)',
                    paddingTop: 12,
                    marginTop: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div className="setting-title">Silent Host Discovery (Opt-In)</div>

                  <div className="setting-row">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={draft.scanner.arpDiscovery}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            scanner: { ...prev.scanner, arpDiscovery: e.target.checked },
                          }))
                        }
                      />
                      <span>ARP Host Discovery (LAN)</span>
                    </label>
                    <span className="setting-hint">
                      Detect firewalled local LAN hosts via the OS ARP table even when all scanned TCP
                      ports drop packets. No admin/root required.
                    </span>
                  </div>

                  <div className="setting-row">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={draft.scanner.icmpPing}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            scanner: { ...prev.scanner, icmpPing: e.target.checked },
                          }))
                        }
                      />
                      <span>ICMP Ping Sweep</span>
                    </label>
                    <span className="setting-hint">
                      Send ICMP echo probes to find silent or firewalled hosts. Uses fast raw ICMP sockets
                      automatically when run as Admin/root, and falls back to standard OS ping without
                      UAC/root.
                    </span>
                  </div>
                </div>
              </>
            )}

            {tab === 'updates' && (
              <>
                <div className="setting-row">
                  <div className="setting-title">Bennetsen Portscanner</div>
                  <div className="setting-hint mono">
                    Installed Version: v{appVersion} ({platform})
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => onOpenExternal(repoUrl)}
                    >
                      Open GitHub Repository
                    </button>
                  </div>
                </div>

                <div className="setting-row">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={draft.updates.autoCheck}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          updates: { ...prev.updates, autoCheck: e.target.checked },
                        }))
                      }
                    />
                    <span>Automatically check GitHub Releases for updates on startup</span>
                  </label>
                </div>

                <div className="setting-row">
                  <div className="setting-inline">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={checkingUpdates}
                      onClick={onCheckUpdates}
                    >
                      {checkingUpdates ? 'Checking...' : 'Check for Updates'}
                    </button>
                    {updateStatus?.updateAvailable && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => onOpenExternal(updateStatus.releaseUrl)}
                      >
                        Download v{updateStatus.latestVersion}
                      </button>
                    )}
                  </div>

                  {updateStatus && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: '8px 10px',
                        background: 'var(--bg-editor)',
                        border: '1px solid var(--border)',
                        borderRadius: 3,
                        fontSize: 12,
                      }}
                    >
                      {updateStatus.error ? (
                        <span style={{ color: 'var(--status-amber)' }}>
                          Check failed: {updateStatus.error}
                        </span>
                      ) : updateStatus.noReleasesYet ? (
                        <span style={{ color: 'var(--text-muted)' }}>
                          No GitHub releases published yet. Current build: v{updateStatus.currentVersion}.
                        </span>
                      ) : updateStatus.updateAvailable ? (
                        <span style={{ color: 'var(--status-green)', fontWeight: 600 }}>
                          Update available: v{updateStatus.latestVersion} (installed: v
                          {updateStatus.currentVersion})
                        </span>
                      ) : (
                        <span style={{ color: 'var(--status-green)' }}>
                          You are running the latest version (v{updateStatus.currentVersion}).
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
