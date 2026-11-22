# Bennetsen Portscanner

A fast, concurrent, cross-platform network and port scanner for **Windows** and **Ubuntu Desktop**, built with an asynchronous **Go** scanning engine and a clean **VS Code Dark+** desktop interface.

---

## Key Features

- **Auto-Detected Interface Scopes** — Automatically discovers active IPv4 network cards and derives their network CIDRs (with one-click scanning across individual NICs or all active interfaces combined).
- **Predefined & Custom Port Presets** — Dropdown presets for *Sysadmin Essentials*, *SSH*, *RDP*, *Web Services*, *File Sharing*, *Databases*, *Remote Management*, *Infrastructure & Network*, *Mail Services*, *Top Common Ports*, plus instant *Custom* port/range editing (`22,80,8000-8080`).
- **High-Throughput Async Go Engine** — Runs hundreds to thousands of concurrent TCP dials across all CPU cores while keeping the UI responsive at 60 FPS. Automatically discovers both open ports and responsive hosts (via TCP RST) without requiring admin/root privileges.
- **Opt-In Silent Host Discovery (ICMP & ARP)** — Optional **ICMP Ping Sweep** and **ARP Host Discovery** can be enabled in Settings to detect silent/firewalled devices. Runs completely unprivileged by default (no UAC or `sudo` required), and automatically uses high-speed raw ICMP sockets if launched with elevated privileges.
- **Double-Click Deep Inspection** — Double-clicking any host probes 42 predefined service ports, grabs protocol banners (SSH, FTP, SMTP, POP3, IMAP, MySQL, VNC, Redis), extracts HTTP status codes, `Server` headers, HTML `<title>` tags, and TLS Common Names, and suggests OS/device hints.
- **One-Click External Session Launchers** — Dynamically shows action buttons (`Start SSH`, `Start RDP`, `Open HTTP/S`, `Open SMB`, `Start VNC`, `Start FTP`, `Start Telnet`) based on discovered ports.
- **Configurable External Clients** — Choose your preferred client per protocol in Settings:
  - **SSH**: Auto, Windows Terminal (`wt.exe`), Command Prompt (`cmd.exe`), PowerShell, PuTTY, GNOME Terminal, Konsole, XFCE Terminal, Kitty, XTerm, or a custom command template (`{ip}`, `{port}`, `{user}`, `{dest}`).
  - **RDP**: `mstsc.exe` (Windows), Remmina or `xfreerdp` (Ubuntu), or custom.
  - **SMB / VNC / FTP / Telnet**: Native handlers or custom CLI commands.
- **MAC Address & Vendor Lookup** — Reads local ARP/neighbor tables and identifies hardware vendors via an embedded OUI database.
- **Profiles, History & Export** — Save reusable scan profiles, access recent scopes, filter live results, and export to **CSV** or **JSON**.
- **Automatic GitHub Update Check** — Checks `MRBennetsen/Bennetsen-Portscanner` GitHub Releases on startup and notifies you in the status bar when a newer release is available.

---

## Download & Installation

Prebuilt binaries for **Windows** and **Ubuntu Desktop** are published via GitHub Actions on the [Releases](https://github.com/MRBennetsen/Bennetsen-Portscanner/releases) page:

- **Windows (x64)**:
  - `Bennetsen-Portscanner-<version>-win-x64-setup.exe` (NSIS installer)
  - `Bennetsen-Portscanner-<version>-win-x64-portable.exe` (standalone portable binary)
- **Ubuntu Desktop (x64)**:
  - `Bennetsen-Portscanner-<version>-linux-x86_64.AppImage` (`chmod +x` and run directly)
  - `Bennetsen-Portscanner-<version>-linux-amd64.deb` (`sudo apt install ./Bennetsen-Portscanner-*.deb`)

---

## Architecture

| Layer | Directory | Responsibility |
| --- | --- | --- |
| **Scanner Engine** | [`scanner/`](scanner/) | Go CLI (`interfaces`, `scan`, `inspect`) streaming NDJSON events using a high-concurrency goroutine worker pool, ARP/OUI vendor lookup, rDNS, HTTP title extraction, and banner grabbing. |
| **Desktop Shell** | [`electron/`](electron/) | Electron main & preload layer managing the Go subprocess, IPC batching, persistent `config.json` settings, cross-platform client launching, CSV/JSON export, and GitHub release checks. |
| **User Interface** | [`src/`](src/) | React + TypeScript UI styled in VS Code Dark+ (`#1e1e1e` / `#252526` / `#3794ff`) with sortable host grid, live filtering, deep-inspect split pane, and settings modal. |

---

## Development & Building from Source

### Prerequisites

- **Go** `1.22+`
- **Node.js** `20+` and `npm`

### Setup & Run Locally

```bash
# 1. Install JavaScript dependencies
npm install

# 2. Build the Go scanner binary (outputs to scanner/bin/)
npm run build:scanner

# 3. Start Vite + Electron in development mode
npm run dev
```

### Run Tests & Production Builds

```bash
# Run Go scanner unit & integration tests
cd scanner && go test -v ./... && cd ..

# Typecheck & build React + Electron bundles
npm run typecheck
npm run build

# Package for the current OS (outputs to release/)
npm run package:linux   # on Ubuntu/Linux
npm run package:win     # on Windows
```

---

## Automated Releases (GitHub Actions)

The repository includes two workflows:
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — Runs Go tests, TypeScript typechecking, and production builds on both `ubuntu-latest` and `windows-latest` for every push/PR to `main`.
- [`.github/workflows/release.yml`](.github/workflows/release.yml) — Builds and packages Windows (`.exe` installer & portable) and Ubuntu (`.AppImage` & `.deb`) binaries and attaches them to a GitHub Release automatically when pushing a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

---

## AI Assistance Disclosure

Portions of this project's architecture, source code, build workflows, and documentation were created with the assistance of AI coding tools, reviewed and guided by the repository maintainer.

