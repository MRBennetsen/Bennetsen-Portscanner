import React, { useEffect, useRef, useState } from 'react';
import { PORT_PRESETS } from '../presets';
import { NetworkInterface, ScanProfile } from '../types';
import {
  BookmarkIcon,
  ChevronDownIcon,
  DownloadIcon,
  PlayIcon,
  RefreshIcon,
  SettingsIcon,
  StopIcon,
} from './Icons';

interface ToolbarProps {
  scope: string;
  onScopeChange: (val: string) => void;
  presetId: string;
  ports: string;
  onPresetSelect: (presetId: string, ports: string) => void;
  onPortsChange: (val: string) => void;
  interfaces: NetworkInterface[];
  onRefreshInterfaces: () => void;
  profiles: ScanProfile[];
  recentScopes: string[];
  isScanning: boolean;
  onStartScan: () => void;
  onStopScan: () => void;
  onOpenSettings: () => void;
  onOpenProfiles: () => void;
  onExport: (format: 'csv' | 'json') => void;
  hasResults: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  scope,
  onScopeChange,
  presetId,
  ports,
  onPresetSelect,
  onPortsChange,
  interfaces,
  onRefreshInterfaces,
  profiles,
  recentScopes,
  isScanning,
  onStartScan,
  onStopScan,
  onOpenSettings,
  onOpenProfiles,
  onExport,
  hasResults,
}) => {
  const [scopeOpen, setScopeOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const scopeAnchorRef = useRef<HTMLDivElement>(null);
  const presetAnchorRef = useRef<HTMLDivElement>(null);
  const exportAnchorRef = useRef<HTMLDivElement>(null);
  const portsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (scopeAnchorRef.current && !scopeAnchorRef.current.contains(target)) {
        setScopeOpen(false);
      }
      if (presetAnchorRef.current && !presetAnchorRef.current.contains(target)) {
        setPresetOpen(false);
      }
      if (exportAnchorRef.current && !exportAnchorRef.current.contains(target)) {
        setExportOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setScopeOpen(false);
        setPresetOpen(false);
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const currentPreset = PORT_PRESETS.find((p) => p.id === presetId) ?? PORT_PRESETS[PORT_PRESETS.length - 1];
  const allDetectedCidr = interfaces
    .filter((i) => i.isUp)
    .map((i) => i.networkCidr)
    .filter((v, idx, arr) => arr.indexOf(v) === idx)
    .join(', ');

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isScanning) {
      onStartScan();
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar-row">
        {/* Target / Network Scope */}
        <div className="field-group scope-group dropdown-anchor" ref={scopeAnchorRef}>
          <span className="field-label">Scope</span>
          <input
            type="text"
            className="input-control mono scope-input"
            value={scope}
            onChange={(e) => onScopeChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="192.168.1.0/24 or 192.168.1.1-254"
            title="Enter CIDR, dash range, comma-separated targets, or pick a detected network card"
            spellCheck={false}
          />
          <button
            type="button"
            className="btn btn-icon btn-joined-mid"
            onClick={() => setScopeOpen((prev) => !prev)}
            title="Select detected network card scope, profile, or recent target"
          >
            <ChevronDownIcon />
          </button>
          <button
            type="button"
            className="btn btn-icon btn-joined-right"
            onClick={onRefreshInterfaces}
            title="Refresh network interfaces"
          >
            <RefreshIcon />
          </button>

          {scopeOpen && (
            <div className="dropdown-menu" style={{ width: '100%' }}>
              <div className="dropdown-section-title">Detected Network Interfaces</div>
              {interfaces.length === 0 ? (
                <div className="dropdown-item" style={{ cursor: 'default', opacity: 0.7 }}>
                  <span className="dropdown-item-meta">No active IPv4 interfaces detected</span>
                </div>
              ) : (
                <>
                  {interfaces.filter((i) => i.isUp).length > 1 && (
                    <button
                      type="button"
                      className="dropdown-item"
                      onClick={() => {
                        onScopeChange(allDetectedCidr);
                        setScopeOpen(false);
                      }}
                    >
                      <div className="dropdown-item-row">
                        <span className="dropdown-item-title">All Active Interfaces</span>
                        <span className="dropdown-item-meta mono">{interfaces.filter((i) => i.isUp).length} NICs</span>
                      </div>
                      <span className="dropdown-item-meta mono">{allDetectedCidr}</span>
                    </button>
                  )}
                  {interfaces.map((nic) => (
                    <button
                      key={`${nic.name}-${nic.ip}`}
                      type="button"
                      className={`dropdown-item ${scope === nic.networkCidr ? 'active' : ''}`}
                      onClick={() => {
                        onScopeChange(nic.networkCidr);
                        setScopeOpen(false);
                      }}
                    >
                      <div className="dropdown-item-row">
                        <span className="dropdown-item-title">
                          {nic.name} {!nic.isUp ? '(Down)' : ''}
                        </span>
                        <span className="dropdown-item-meta mono">{nic.networkCidr}</span>
                      </div>
                      <span className="dropdown-item-meta mono">
                        Local IP: {nic.ip} · {nic.hostCount} hosts
                      </span>
                    </button>
                  ))}
                </>
              )}

              {profiles.length > 0 && (
                <>
                  <div className="dropdown-divider" />
                  <div className="dropdown-section-title">Saved Profiles</div>
                  {profiles.map((prof) => (
                    <button
                      key={prof.id}
                      type="button"
                      className="dropdown-item"
                      onClick={() => {
                        onScopeChange(prof.scope);
                        onPresetSelect(prof.presetId, prof.ports);
                        setScopeOpen(false);
                      }}
                    >
                      <div className="dropdown-item-row">
                        <span className="dropdown-item-title">{prof.name}</span>
                        <span className="dropdown-item-meta mono">{prof.scope}</span>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {recentScopes.length > 0 && (
                <>
                  <div className="dropdown-divider" />
                  <div className="dropdown-section-title">Recent Scopes</div>
                  {recentScopes.slice(0, 6).map((rec) => (
                    <button
                      key={rec}
                      type="button"
                      className="dropdown-item"
                      onClick={() => {
                        onScopeChange(rec);
                        setScopeOpen(false);
                      }}
                    >
                      <span className="dropdown-item-title mono">{rec}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Ports Preset + Custom Input */}
        <div className="field-group ports-group dropdown-anchor" ref={presetAnchorRef}>
          <span className="field-label">Ports</span>
          <button
            type="button"
            className="ports-preset-btn"
            onClick={() => setPresetOpen((prev) => !prev)}
            title="Choose predefined service preset or custom ports"
          >
            <span>{currentPreset.label}</span>
            <ChevronDownIcon />
          </button>
          <input
            ref={portsInputRef}
            type="text"
            className="input-control mono ports-input"
            value={ports}
            onChange={(e) => onPortsChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="22,80,443,3389 or 1-1024"
            title="TCP ports or ranges (e.g. 22,80,443,8000-8080)"
            spellCheck={false}
          />

          {presetOpen && (
            <div className="dropdown-menu" style={{ width: '360px' }}>
              <div className="dropdown-section-title">Predefined Service Profiles</div>
              {PORT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`dropdown-item ${presetId === preset.id ? 'active' : ''}`}
                  onClick={() => {
                    setPresetOpen(false);
                    if (preset.id === 'custom') {
                      onPresetSelect('custom', ports);
                      setTimeout(() => portsInputRef.current?.focus(), 0);
                    } else {
                      onPresetSelect(preset.id, preset.ports);
                    }
                  }}
                >
                  <div className="dropdown-item-row">
                    <span className="dropdown-item-title">{preset.label}</span>
                    {preset.ports && (
                      <span className="dropdown-item-meta mono">
                        {preset.ports.length > 26 ? `${preset.ports.slice(0, 26)}...` : preset.ports}
                      </span>
                    )}
                  </div>
                  <span className="dropdown-item-meta">{preset.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scan / Stop + Tools */}
        {isScanning ? (
          <button type="button" className="btn btn-danger" onClick={onStopScan}>
            <StopIcon />
            <span>Stop</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onStartScan}
            disabled={!scope.trim() || !ports.trim()}
          >
            <PlayIcon />
            <span>Scan</span>
          </button>
        )}

        <button type="button" className="btn" onClick={onOpenProfiles} title="Saved Profiles & Recent Scopes">
          <BookmarkIcon />
          <span>Profiles</span>
        </button>

        <div className="dropdown-anchor" ref={exportAnchorRef}>
          <button
            type="button"
            className="btn"
            disabled={!hasResults}
            onClick={() => setExportOpen((prev) => !prev)}
            title="Export scan results"
          >
            <DownloadIcon />
            <span>Export</span>
            <ChevronDownIcon size={11} />
          </button>
          {exportOpen && (
            <div className="dropdown-menu align-right">
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  setExportOpen(false);
                  onExport('csv');
                }}
              >
                <span className="dropdown-item-title">Export as CSV</span>
                <span className="dropdown-item-meta">Spreadsheet-ready table</span>
              </button>
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  setExportOpen(false);
                  onExport('json');
                }}
              >
                <span className="dropdown-item-title">Export as JSON</span>
                <span className="dropdown-item-meta">Full structured host data</span>
              </button>
            </div>
          )}
        </div>

        <button type="button" className="btn btn-icon" onClick={onOpenSettings} title="Settings">
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
};
