import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HostInspector } from './components/HostInspector';
import { HostTable } from './components/HostTable';
import { CloseIcon, SearchIcon } from './components/Icons';
import { ProfilesModal } from './components/ProfilesModal';
import { SettingsModal } from './components/SettingsModal';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import { PORT_PRESETS } from './presets';
import {
  AppConfig,
  HostResult,
  InspectResult,
  LaunchProtocol,
  NetworkInterface,
  ScanProfile,
  UpdateStatus,
} from './types';

interface ToastState {
  message: string;
  kind: 'info' | 'error' | 'success';
}

export const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [appInfo, setAppInfo] = useState({
    version: '1.0.0',
    platform: 'linux',
    repoUrl: 'https://github.com/MRBennetsen/Bennetsen-Portscanner',
  });
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);

  const [scope, setScope] = useState('');
  const [presetId, setPresetId] = useState('sysadmin');
  const [ports, setPorts] = useState(PORT_PRESETS[0].ports);

  const [filterText, setFilterText] = useState('');
  const [viewMode, setViewMode] = useState<'all' | 'open'>('all');

  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [totalChecks, setTotalChecks] = useState(0);
  const [completedChecks, setCompletedChecks] = useState(0);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const hostsMapRef = useRef<Map<string, HostResult>>(new Map());
  const [hosts, setHosts] = useState<HostResult[]>([]);

  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [inspectedHost, setInspectedHost] = useState<HostResult | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const inspectSeqRef = useRef(0);

  const [showSettings, setShowSettings] = useState(false);
  const [showProfiles, setShowProfiles] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, kind: ToastState['kind'] = 'info') => {
    setToast({ message, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const refreshInterfaces = useCallback(async (fillIfEmpty = false) => {
    try {
      const list = await window.api.getInterfaces();
      setInterfaces(list);
      if (fillIfEmpty && list.length > 0) {
        const primary = list.find((i) => i.isUp) ?? list[0];
        setScope((prev) => (prev.trim() ? prev : primary.networkCidr));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to detect network interfaces', 'error');
    }
  }, [showToast]);

  const runUpdateCheck = useCallback(async () => {
    setCheckingUpdates(true);
    try {
      const status = await window.api.checkForUpdates();
      setUpdateStatus(status);
    } finally {
      setCheckingUpdates(false);
    }
  }, []);

  // Bootstrap initial state & IPC subscriptions
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [info, loadedCfg] = await Promise.all([
        window.api.getAppInfo(),
        window.api.getSettings(),
      ]);
      if (!mounted) return;
      setAppInfo(info);
      setConfig(loadedCfg);
      await refreshInterfaces(true);
      if (loadedCfg.updates.autoCheck) {
        void runUpdateCheck();
      }
    })();

    const offStart = window.api.onScanStart((ev) => {
      setTotalChecks(ev.totalChecks);
      setCompletedChecks(0);
    });

    const offHosts = window.api.onHostsBatch((batch) => {
      const map = hostsMapRef.current;
      for (const h of batch) {
        map.set(h.ip, h);
      }
      setHosts(Array.from(map.values()));
    });

    const offProgress = window.api.onScanProgress((ev) => {
      setCompletedChecks(ev.completed);
      if (ev.total > 0) setTotalChecks(ev.total);
    });

    const offDone = window.api.onScanDone((ev) => {
      setCompletedChecks(ev.completed);
      if (ev.total > 0) setTotalChecks(ev.total);
      setDurationMs(ev.durationMs);
      setIsScanning(false);
    });

    const offError = window.api.onScanError((msg) => {
      showToast(msg, 'error');
      setIsScanning(false);
    });

    const offExit = window.api.onScanExit(() => {
      setIsScanning(false);
    });

    return () => {
      mounted = false;
      offStart();
      offHosts();
      offProgress();
      offDone();
      offError();
      offExit();
    };
  }, [refreshInterfaces, runUpdateCheck, showToast]);

  const handleStartScan = useCallback(async () => {
    const trimmedScope = scope.trim();
    const trimmedPorts = ports.trim();
    if (!trimmedScope || !trimmedPorts) {
      showToast('Enter both a target scope and at least one port.', 'error');
      return;
    }

    hostsMapRef.current.clear();
    setHosts([]);
    setSelectedIp(null);
    setInspectedHost(null);
    setInspectResult(null);
    setDurationMs(null);
    setCompletedChecks(0);
    setTotalChecks(0);
    setHasScanned(true);
    setIsScanning(true);

    const updatedCfg = await window.api.addRecentScope(trimmedScope);
    setConfig(updatedCfg);

    const res = await window.api.startScan({
      targets: trimmedScope,
      ports: trimmedPorts,
      concurrency: updatedCfg.scanner.concurrency,
      timeoutMs: updatedCfg.scanner.timeoutMs,
      resolveDns: updatedCfg.scanner.resolveDns,
      icmpPing: updatedCfg.scanner.icmpPing,
      arpDiscovery: updatedCfg.scanner.arpDiscovery,
    });
    if (!res.ok) {
      setIsScanning(false);
      showToast(res.error || 'Failed to launch scanner', 'error');
    }
  }, [ports, scope, showToast]);

  const handleStopScan = useCallback(async () => {
    await window.api.stopScan();
    setIsScanning(false);
  }, []);

  const handleInspectHost = useCallback(
    async (host: HostResult) => {
      setSelectedIp(host.ip);
      setInspectedHost(host);
      setInspectResult(null);
      setInspectError(null);
      setInspecting(true);

      const seq = ++inspectSeqRef.current;
      try {
        const res = await window.api.inspectHost(host.ip, ports);
        if (inspectSeqRef.current !== seq) return;
        setInspectResult(res);

        // Merge newly discovered metadata back into the main host row
        const existing = hostsMapRef.current.get(host.ip);
        if (existing) {
          const updated: HostResult = {
            ...existing,
            hostname: res.hostname || existing.hostname,
            mac: res.mac || existing.mac,
            vendor: res.vendor || existing.vendor,
            ports: res.ports.map((p) => ({ port: p.port, service: p.service, rttMs: p.rttMs })),
          };
          hostsMapRef.current.set(host.ip, updated);
          setHosts(Array.from(hostsMapRef.current.values()));
          setInspectedHost(updated);
        }
      } catch (err) {
        if (inspectSeqRef.current !== seq) return;
        setInspectError(err instanceof Error ? err.message : 'Deep inspection failed');
      } finally {
        if (inspectSeqRef.current === seq) {
          setInspecting(false);
        }
      }
    },
    [ports]
  );

  const handleQuickLaunch = useCallback(
    async (protocol: LaunchProtocol, ip: string, port: number) => {
      const res = await window.api.launchClient({ protocol, ip, port });
      if (!res.ok) {
        showToast(res.error || `Failed to start ${protocol.toUpperCase()} session`, 'error');
      }
    },
    [showToast]
  );

  const handlePresetSelect = (nextPresetId: string, nextPorts: string) => {
    setPresetId(nextPresetId);
    setPorts(nextPorts);
  };

  const handlePortsChange = (val: string) => {
    setPorts(val);
    const matching = PORT_PRESETS.find((p) => p.id !== 'custom' && p.ports === val.trim());
    setPresetId(matching ? matching.id : 'custom');
  };

  const handleExport = async (format: 'csv' | 'json') => {
    const res = await window.api.exportResults(format, filteredHosts);
    if (res.ok && res.filePath) {
      showToast(`Exported ${filteredHosts.length} hosts to ${res.filePath}`, 'success');
    }
  };

  const hostsWithOpenPorts = useMemo(() => hosts.filter((h) => h.ports.length > 0), [hosts]);
  const totalOpenPorts = useMemo(
    () => hosts.reduce((acc, h) => acc + h.ports.length, 0),
    [hosts]
  );

  const filteredHosts = useMemo(() => {
    const base = viewMode === 'open' ? hostsWithOpenPorts : hosts;
    const q = filterText.trim().toLowerCase();
    if (!q) return base;
    return base.filter((h) => {
      if (h.ip.toLowerCase().includes(q)) return true;
      if (h.hostname?.toLowerCase().includes(q)) return true;
      if (h.mac?.toLowerCase().includes(q)) return true;
      if (h.vendor?.toLowerCase().includes(q)) return true;
      return h.ports.some(
        (p) => String(p.port).includes(q) || p.service.toLowerCase().includes(q)
      );
    });
  }, [filterText, hosts, hostsWithOpenPorts, viewMode]);

  const progressPct = totalChecks > 0 ? Math.min(100, (completedChecks / totalChecks) * 100) : 0;

  return (
    <div className="app-shell">
      <Toolbar
        scope={scope}
        onScopeChange={setScope}
        presetId={presetId}
        ports={ports}
        onPresetSelect={handlePresetSelect}
        onPortsChange={handlePortsChange}
        interfaces={interfaces}
        onRefreshInterfaces={() => void refreshInterfaces(false)}
        profiles={config?.profiles ?? []}
        recentScopes={config?.recentScopes ?? []}
        isScanning={isScanning}
        onStartScan={() => void handleStartScan()}
        onStopScan={() => void handleStopScan()}
        onOpenSettings={() => setShowSettings(true)}
        onOpenProfiles={() => setShowProfiles(true)}
        onExport={(fmt) => void handleExport(fmt)}
        hasResults={filteredHosts.length > 0}
      />

      {/* Sub-toolbar: Filter + View Mode */}
      <div
        className="toolbar"
        style={{ padding: '6px 14px', background: 'var(--bg-header)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="subbar">
          <div className="filter-wrap">
            <span className="filter-icon">
              <SearchIcon />
            </span>
            <input
              type="text"
              className="input-control filter-input"
              placeholder="Filter results by IP, hostname, MAC, vendor, port, or service..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>

          <div className="subbar-right">
            <button
              type="button"
              className="btn"
              style={{ height: 26, fontSize: 11.5, padding: '0 9px' }}
              onClick={() => setShowSettings(true)}
              title="Configure opt-in ICMP Ping & ARP silent host discovery in Settings"
            >
              <span>
                Discovery: TCP
                {config?.scanner.icmpPing ? ' + ICMP' : ''}
                {config?.scanner.arpDiscovery ? ' + ARP' : ''}
              </span>
            </button>
            <div className="segmented">
              <button
                type="button"
                className={`segmented-btn ${viewMode === 'all' ? 'active' : ''}`}
                onClick={() => setViewMode('all')}
              >
                All Alive ({hosts.length})
              </button>
              <button
                type="button"
                className={`segmented-btn ${viewMode === 'open' ? 'active' : ''}`}
                onClick={() => setViewMode('open')}
              >
                Open Ports ({hostsWithOpenPorts.length})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Slim Scan Progress Track */}
      {isScanning && (
        <div className="progress-bar-track">
          <div
            className={totalChecks > 0 ? 'progress-bar-fill' : 'progress-bar-indeterminate'}
            style={totalChecks > 0 ? { width: `${progressPct}%` } : undefined}
          />
        </div>
      )}

      {/* Main Workspace */}
      <main className="workspace">
        <section className="table-pane">
          <HostTable
            hosts={filteredHosts}
            selectedIp={selectedIp}
            onSelectHost={(h) => setSelectedIp(h.ip)}
            onInspectHost={(h) => void handleInspectHost(h)}
            onQuickLaunch={(proto, ip, port) => void handleQuickLaunch(proto, ip, port)}
            interfaces={interfaces}
            onPickInterfaceScope={(cidr) => setScope(cidr)}
            hasScanned={hasScanned}
            isScanning={isScanning}
          />
        </section>

        {inspectedHost && config && (
          <HostInspector
            host={inspectedHost}
            inspecting={inspecting}
            inspectResult={inspectResult}
            inspectError={inspectError}
            clients={config.clients}
            onClose={() => setInspectedHost(null)}
            onReinspect={(h) => void handleInspectHost(h)}
            onLaunch={(proto, ip, port) => void handleQuickLaunch(proto, ip, port)}
            onCopyIp={(ip) => {
              void navigator.clipboard.writeText(ip);
              showToast(`Copied ${ip} to clipboard`, 'success');
            }}
          />
        )}
      </main>

      <StatusBar
        isScanning={isScanning}
        completedChecks={completedChecks}
        totalChecks={totalChecks}
        hostsCount={hosts.length}
        openPortsCount={totalOpenPorts}
        durationMs={durationMs}
        concurrency={config?.scanner.concurrency ?? 1500}
        appVersion={appInfo.version}
        updateStatus={updateStatus}
        onUpdateClick={() => {
          if (updateStatus?.updateAvailable) {
            void window.api.openExternal(updateStatus.releaseUrl);
          } else {
            setShowSettings(true);
            void runUpdateCheck();
          }
        }}
      />

      {showSettings && config && (
        <SettingsModal
          config={config}
          platform={appInfo.platform}
          appVersion={appInfo.version}
          repoUrl={appInfo.repoUrl}
          updateStatus={updateStatus}
          checkingUpdates={checkingUpdates}
          onCheckUpdates={() => void runUpdateCheck()}
          onOpenExternal={(url) => void window.api.openExternal(url)}
          onSave={async (next) => {
            const saved = await window.api.saveSettings(next);
            setConfig(saved);
            showToast('Settings saved', 'success');
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showProfiles && config && (
        <ProfilesModal
          currentScope={scope}
          currentPresetId={presetId}
          currentPorts={ports}
          profiles={config.profiles}
          recentScopes={config.recentScopes}
          onSaveProfile={async (profile: ScanProfile) => {
            const saved = await window.api.saveProfile(profile);
            setConfig(saved);
            showToast(`Saved profile "${profile.name}"`, 'success');
          }}
          onDeleteProfile={async (id: string) => {
            const saved = await window.api.deleteProfile(id);
            setConfig(saved);
          }}
          onLoadProfile={(profile: ScanProfile) => {
            setScope(profile.scope);
            setPresetId(profile.presetId);
            setPorts(profile.ports);
          }}
          onSelectScope={(s) => setScope(s)}
          onClearRecent={async () => {
            const saved = await window.api.clearRecentScopes();
            setConfig(saved);
          }}
          onClose={() => setShowProfiles(false)}
        />
      )}

      {toast && (
        <div className={`toast ${toast.kind}`}>
          <span>{toast.message}</span>
          <button
            type="button"
            className="btn btn-subtle btn-icon"
            style={{ height: 22, padding: '0 4px' }}
            onClick={() => setToast(null)}
          >
            <CloseIcon size={12} />
          </button>
        </div>
      )}
    </div>
  );
};
