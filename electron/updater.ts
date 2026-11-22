import { app } from 'electron';
import * as https from 'node:https';
import { UpdateStatus } from './types';

const REPO_OWNER = 'MRBennetsen';
const REPO_NAME = 'Bennetsen-Portscanner';
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;

interface GitHubReleaseResponse {
  tag_name?: string;
  html_url?: string;
  body?: string;
}

function parseSemver(ver: string): [number, number, number] {
  const clean = ver.trim().replace(/^v/i, '').split('-')[0];
  const parts = clean.split('.').map((n) => parseInt(n, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function isNewerSemver(latest: string, current: string): boolean {
  const [lMaj, lMin, lPat] = parseSemver(latest);
  const [cMaj, cMin, cPat] = parseSemver(current);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

export function checkForUpdates(): Promise<UpdateStatus> {
  const currentVersion = app.getVersion();
  const checkedAt = new Date().toISOString();

  return new Promise((resolve) => {
    const req = https.get(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      {
        headers: {
          'User-Agent': `Bennetsen-Portscanner/${currentVersion}`,
          Accept: 'application/vnd.github+json',
        },
        timeout: 6000,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 404) {
            resolve({
              currentVersion,
              latestVersion: currentVersion,
              updateAvailable: false,
              releaseUrl: `${REPO_URL}/releases`,
              checkedAt,
              noReleasesYet: true,
            });
            return;
          }

          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            resolve({
              currentVersion,
              latestVersion: currentVersion,
              updateAvailable: false,
              releaseUrl: `${REPO_URL}/releases`,
              checkedAt,
              error: `GitHub API returned HTTP ${res.statusCode ?? 'unknown'}`,
            });
            return;
          }

          try {
            const parsed = JSON.parse(raw) as GitHubReleaseResponse;
            const latestTag = (parsed.tag_name ?? currentVersion).replace(/^v/i, '');
            const updateAvailable = isNewerSemver(latestTag, currentVersion);
            resolve({
              currentVersion,
              latestVersion: latestTag,
              updateAvailable,
              releaseUrl: parsed.html_url ?? `${REPO_URL}/releases/latest`,
              releaseNotes: parsed.body ? parsed.body.slice(0, 1200) : undefined,
              checkedAt,
            });
          } catch (err) {
            resolve({
              currentVersion,
              latestVersion: currentVersion,
              updateAvailable: false,
              releaseUrl: `${REPO_URL}/releases`,
              checkedAt,
              error: err instanceof Error ? err.message : 'Failed to parse GitHub release metadata',
            });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({
        currentVersion,
        latestVersion: currentVersion,
        updateAvailable: false,
        releaseUrl: `${REPO_URL}/releases`,
        checkedAt,
        error: 'Update check timed out',
      });
    });

    req.on('error', (err) => {
      resolve({
        currentVersion,
        latestVersion: currentVersion,
        updateAvailable: false,
        releaseUrl: `${REPO_URL}/releases`,
        checkedAt,
        error: err.message,
      });
    });
  });
}
