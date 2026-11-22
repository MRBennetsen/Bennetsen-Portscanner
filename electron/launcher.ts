import { shell } from 'electron';
import { spawn, execFileSync } from 'node:child_process';
import { ClientConfig, LaunchRequest, LaunchResult } from './types';

function commandExists(cmd: string): boolean {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(checker, [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function parseArgs(commandLine: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < commandLine.length; i++) {
    const ch = commandLine[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

function expandTemplate(
  template: string,
  req: LaunchRequest,
  defaultUser?: string
): string[] {
  const user = (req.user ?? defaultUser ?? '').trim();
  const dest = user ? `${user}@${req.ip}` : req.ip;
  let expanded = template
    .replaceAll('{ip}', req.ip)
    .replaceAll('{port}', String(req.port))
    .replaceAll('{user}', user)
    .replaceAll('{dest}', dest);

  // Clean up leftover empty user@ if template used "{user}@{ip}" with empty user
  if (!user) {
    expanded = expanded.replace(/(^|\s)@(?=\d)/g, '$1');
  }
  return parseArgs(expanded);
}

function spawnDetached(bin: string, args: string[]): Promise<LaunchResult> {
  return new Promise((resolve) => {
    let settled = false;
    try {
      const child = spawn(bin, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });

      child.once('error', (err: NodeJS.ErrnoException) => {
        if (!settled) {
          settled = true;
          if (err.code === 'ENOENT') {
            resolve({
              ok: false,
              error: `Client executable "${bin}" was not found in PATH. Check External Clients in Settings.`,
            });
          } else {
            resolve({ ok: false, error: err.message });
          }
        }
      });

      child.once('spawn', () => {
        child.unref();
        if (!settled) {
          settled = true;
          resolve({ ok: true });
        }
      });
    } catch (err) {
      resolve({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

async function openInLinuxTerminal(innerCmd: string[], preferredMode?: string): Promise<LaunchResult> {
  const joined = innerCmd.map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(' ');
  const tryOrder: string[] = [];

  if (preferredMode && preferredMode !== 'auto') {
    tryOrder.push(preferredMode);
  } else {
    tryOrder.push(
      'x-terminal-emulator',
      'gnome-terminal',
      'konsole',
      'xfce4-terminal',
      'kitty',
      'alacritty',
      'xterm'
    );
  }

  for (const term of tryOrder) {
    if (!commandExists(term)) {
      if (preferredMode && preferredMode !== 'auto') {
        return {
          ok: false,
          error: `Terminal "${term}" was not found in PATH. Choose another terminal in Settings.`,
        };
      }
      continue;
    }

    switch (term) {
      case 'gnome-terminal':
        return spawnDetached('gnome-terminal', ['--', ...innerCmd]);
      case 'konsole':
        return spawnDetached('konsole', ['-e', ...innerCmd]);
      case 'xfce4-terminal':
        return spawnDetached('xfce4-terminal', ['-e', joined]);
      case 'kitty':
      case 'alacritty':
        return spawnDetached(term, ['-e', ...innerCmd]);
      case 'x-terminal-emulator':
      case 'xterm':
      default:
        return spawnDetached(term, ['-e', ...innerCmd]);
    }
  }

  return {
    ok: false,
    error: 'No supported terminal emulator found in PATH. Configure a custom command in Settings.',
  };
}

async function openInWindowsTerminal(
  innerCmd: string[],
  title: string,
  preferredMode?: string
): Promise<LaunchResult> {
  const mode = preferredMode || 'auto';

  if (mode === 'wt' || (mode === 'auto' && commandExists('wt.exe'))) {
    const res = await spawnDetached('wt.exe', ['new-tab', '--title', title, ...innerCmd]);
    if (res.ok || mode === 'wt') {
      return res;
    }
  }

  if (mode === 'powershell') {
    const psCmd = innerCmd.join(' ');
    return spawnDetached('cmd.exe', ['/c', 'start', title, 'powershell.exe', '-NoExit', '-Command', psCmd]);
  }

  // CMD default / fallback
  return spawnDetached('cmd.exe', ['/c', 'start', title, 'cmd.exe', '/k', ...innerCmd]);
}

async function launchCustom(template: string, req: LaunchRequest, defaultUser?: string): Promise<LaunchResult> {
  const trimmed = template.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Custom command is empty. Configure it in Settings -> External Clients.',
    };
  }
  const tokens = expandTemplate(trimmed, req, defaultUser);
  if (tokens.length === 0) {
    return { ok: false, error: 'Invalid custom command template.' };
  }
  return spawnDetached(tokens[0], tokens.slice(1));
}

export async function launchClient(req: LaunchRequest, clients: ClientConfig): Promise<LaunchResult> {
  const isWin = process.platform === 'win32';

  if (req.protocol === 'http' || req.protocol === 'https') {
    const defaultPort = req.protocol === 'https' ? 443 : 80;
    const portSuffix = req.port === defaultPort ? '' : `:${req.port}`;
    await shell.openExternal(`${req.protocol}://${req.ip}${portSuffix}`);
    return { ok: true };
  }

  if (req.protocol === 'ssh') {
    const cfg = clients.ssh;
    if (cfg.mode === 'custom') {
      return launchCustom(cfg.customCommand, req, cfg.defaultUser);
    }
    const user = (req.user ?? cfg.defaultUser ?? '').trim();
    const dest = user ? `${user}@${req.ip}` : req.ip;

    if (cfg.mode === 'putty') {
      const bin = isWin ? 'putty.exe' : 'putty';
      return spawnDetached(bin, ['-ssh', dest, '-P', String(req.port)]);
    }

    const sshCmd = ['ssh', '-p', String(req.port), dest];
    if (isWin) {
      return openInWindowsTerminal(sshCmd, `SSH ${req.ip}`, cfg.mode);
    }
    return openInLinuxTerminal(sshCmd, cfg.mode);
  }

  if (req.protocol === 'rdp') {
    const cfg = clients.rdp;
    if (cfg.mode === 'custom') {
      return launchCustom(cfg.customCommand, req);
    }
    if (isWin || cfg.mode === 'mstsc') {
      return spawnDetached('mstsc.exe', [`/v:${req.ip}:${req.port}`]);
    }
    if (cfg.mode === 'xfreerdp') {
      return spawnDetached('xfreerdp', [`/v:${req.ip}:${req.port}`, '/dynamic-resolution']);
    }
    if (cfg.mode === 'remmina' || (cfg.mode === 'auto' && commandExists('remmina'))) {
      return spawnDetached('remmina', ['-c', `rdp://${req.ip}:${req.port}`]);
    }
    if (commandExists('xfreerdp')) {
      return spawnDetached('xfreerdp', [`/v:${req.ip}:${req.port}`, '/dynamic-resolution']);
    }
    return {
      ok: false,
      error: 'Neither Remmina nor xfreerdp was found in PATH. Install one or set a custom RDP command in Settings.',
    };
  }

  if (req.protocol === 'smb') {
    const cfg = clients.smb;
    if (cfg.mode === 'custom') {
      return launchCustom(cfg.customCommand, req);
    }
    if (isWin || cfg.mode === 'explorer') {
      return spawnDetached('explorer.exe', [`\\\\${req.ip}`]);
    }
    await shell.openExternal(`smb://${req.ip}`);
    return { ok: true };
  }

  if (req.protocol === 'vnc') {
    const cfg = clients.vnc;
    if (cfg.mode === 'custom') {
      return launchCustom(cfg.customCommand, req);
    }
    if (cfg.mode === 'remmina') {
      return spawnDetached('remmina', ['-c', `vnc://${req.ip}:${req.port}`]);
    }
    if (cfg.mode === 'vncviewer') {
      return spawnDetached(isWin ? 'vncviewer.exe' : 'vncviewer', [`${req.ip}:${req.port}`]);
    }
    if (!isWin && commandExists('remmina')) {
      return spawnDetached('remmina', ['-c', `vnc://${req.ip}:${req.port}`]);
    }
    if (commandExists(isWin ? 'vncviewer.exe' : 'vncviewer')) {
      return spawnDetached(isWin ? 'vncviewer.exe' : 'vncviewer', [`${req.ip}:${req.port}`]);
    }
    await shell.openExternal(`vnc://${req.ip}:${req.port}`);
    return { ok: true };
  }

  if (req.protocol === 'ftp') {
    const cfg = clients.ftp;
    if (cfg.mode === 'custom') {
      return launchCustom(cfg.customCommand, req);
    }
    if (cfg.mode === 'filezilla') {
      return spawnDetached(isWin ? 'filezilla.exe' : 'filezilla', [`ftp://${req.ip}:${req.port}`]);
    }
    if (cfg.mode === 'browser') {
      await shell.openExternal(`ftp://${req.ip}:${req.port}`);
      return { ok: true };
    }
    const ftpCmd = ['ftp', req.ip, String(req.port)];
    if (isWin) {
      return openInWindowsTerminal(ftpCmd, `FTP ${req.ip}`, 'auto');
    }
    return openInLinuxTerminal(ftpCmd, 'auto');
  }

  if (req.protocol === 'telnet') {
    const cfg = clients.telnet;
    if (cfg.mode === 'custom') {
      return launchCustom(cfg.customCommand, req);
    }
    if (cfg.mode === 'putty') {
      return spawnDetached(isWin ? 'putty.exe' : 'putty', ['-telnet', req.ip, '-P', String(req.port)]);
    }
    const telnetCmd = ['telnet', req.ip, String(req.port)];
    if (isWin) {
      return openInWindowsTerminal(telnetCmd, `Telnet ${req.ip}`, 'auto');
    }
    return openInLinuxTerminal(telnetCmd, 'auto');
  }

  return { ok: false, error: `Unsupported protocol: ${req.protocol}` };
}
