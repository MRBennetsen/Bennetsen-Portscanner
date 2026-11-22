import React, { useState } from 'react';
import { ScanProfile } from '../types';
import { CloseIcon } from './Icons';

interface ProfilesModalProps {
  currentScope: string;
  currentPresetId: string;
  currentPorts: string;
  profiles: ScanProfile[];
  recentScopes: string[];
  onSaveProfile: (profile: ScanProfile) => void;
  onDeleteProfile: (id: string) => void;
  onLoadProfile: (profile: ScanProfile) => void;
  onSelectScope: (scope: string) => void;
  onClearRecent: () => void;
  onClose: () => void;
}

export const ProfilesModal: React.FC<ProfilesModalProps> = ({
  currentScope,
  currentPresetId,
  currentPorts,
  profiles,
  recentScopes,
  onSaveProfile,
  onDeleteProfile,
  onLoadProfile,
  onSelectScope,
  onClearRecent,
  onClose,
}) => {
  const [name, setName] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !currentScope.trim() || !currentPorts.trim()) return;
    onSaveProfile({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmed,
      scope: currentScope.trim(),
      presetId: currentPresetId,
      ports: currentPorts.trim(),
    });
    setName('');
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-dialog compact" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Scan Profiles & Recent Scopes</span>
          <button type="button" className="btn btn-subtle btn-icon" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-content">
          <form onSubmit={handleSave} className="setting-row">
            <label className="setting-title">Save Current Configuration</label>
            <div className="setting-hint mono">
              Scope: {currentScope || '—'} · Ports: {currentPorts || '—'}
            </div>
            <div className="setting-inline">
              <input
                type="text"
                className="input-control"
                style={{ flex: 1 }}
                placeholder="Profile name (e.g. Office VLAN 10)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!name.trim() || !currentScope.trim() || !currentPorts.trim()}
              >
                Save Profile
              </button>
            </div>
          </form>

          <div className="setting-row">
            <div className="setting-title">Saved Profiles ({profiles.length})</div>
            {profiles.length === 0 ? (
              <div className="setting-hint">No saved profiles yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '7px 10px',
                      background: 'var(--bg-editor)',
                      border: '1px solid var(--border)',
                      borderRadius: 3,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-bright)' }}>{p.name}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {p.scope} · {p.ports}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ height: 24, fontSize: 11.5 }}
                        onClick={() => {
                          onLoadProfile(p);
                          onClose();
                        }}
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        className="btn btn-subtle"
                        style={{ height: 24, fontSize: 11.5, color: 'var(--status-red)' }}
                        onClick={() => onDeleteProfile(p.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="setting-row">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="setting-title">Recent Scopes ({recentScopes.length})</span>
              {recentScopes.length > 0 && (
                <button
                  type="button"
                  className="btn btn-subtle"
                  style={{ height: 22, fontSize: 11 }}
                  onClick={onClearRecent}
                >
                  Clear History
                </button>
              )}
            </div>
            {recentScopes.length === 0 ? (
              <div className="setting-hint">No scan history yet.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {recentScopes.map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    className="btn mono"
                    style={{ height: 25, fontSize: 11.5 }}
                    onClick={() => {
                      onSelectScope(sc);
                      onClose();
                    }}
                  >
                    {sc}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
