import { LaunchProtocol } from './types';

export interface PortPreset {
  id: string;
  label: string;
  description: string;
  ports: string;
}

export const PORT_PRESETS: PortPreset[] = [
  {
    id: 'sysadmin',
    label: 'Sysadmin Essentials',
    description: 'SSH, HTTP/S, SMB, RDP, VNC, WinRM',
    ports: '22,80,443,445,3389,5900,5985,8080,8443',
  },
  {
    id: 'ssh',
    label: 'SSH Only',
    description: 'Secure Shell (22)',
    ports: '22',
  },
  {
    id: 'rdp',
    label: 'RDP Only',
    description: 'Remote Desktop (3389)',
    ports: '3389',
  },
  {
    id: 'web',
    label: 'Web Services',
    description: 'HTTP, HTTPS & common web dashboards',
    ports: '80,443,3000,5000,8000,8080,8443,8888,9000',
  },
  {
    id: 'files',
    label: 'File Sharing',
    description: 'FTP, NetBIOS, SMB, NFS',
    ports: '21,139,445,2049',
  },
  {
    id: 'remote',
    label: 'Remote Management',
    description: 'SSH, Telnet, RDP, VNC, WinRM, Proxmox',
    ports: '22,23,3389,5900,5985,5986,8006',
  },
  {
    id: 'databases',
    label: 'Databases',
    description: 'MSSQL, Oracle, MySQL, Postgres, Redis, Mongo',
    ports: '1433,1521,3306,5432,6379,27017',
  },
  {
    id: 'infra',
    label: 'Infrastructure & Network',
    description: 'DNS, LDAP/S, Docker, K8s, Proxmox, Printers',
    ports: '22,53,80,161,389,443,636,2375,6443,8006,9090,9100',
  },
  {
    id: 'mail',
    label: 'Mail Services',
    description: 'SMTP, POP3, IMAP & TLS variants',
    ports: '25,110,143,465,587,993,995',
  },
  {
    id: 'top35',
    label: 'Top Common Ports (42)',
    description: 'Broad service discovery across common TCP ports',
    ports:
      '21,22,23,25,53,80,110,111,135,139,143,161,389,443,445,465,514,554,587,636,993,995,1433,1521,1883,2049,2375,3306,3389,5000,5432,5900,5985,6379,6443,8000,8006,8080,8443,9090,9100,27017',
  },
  {
    id: 'custom',
    label: 'Custom Ports',
    description: 'Specify ports or ranges manually (e.g. 22,80,8000-8080)',
    ports: '',
  },
];

export interface ServiceActionMeta {
  protocol: LaunchProtocol;
  buttonLabel: string;
}

export function getPortAction(port: number): ServiceActionMeta | null {
  switch (port) {
    case 22:
      return { protocol: 'ssh', buttonLabel: 'Start SSH' };
    case 3389:
      return { protocol: 'rdp', buttonLabel: 'Start RDP' };
    case 445:
      return { protocol: 'smb', buttonLabel: 'Open SMB' };
    case 5900:
      return { protocol: 'vnc', buttonLabel: 'Start VNC' };
    case 21:
      return { protocol: 'ftp', buttonLabel: 'Start FTP' };
    case 23:
      return { protocol: 'telnet', buttonLabel: 'Start Telnet' };
    case 80:
    case 3000:
    case 5000:
    case 8000:
    case 8080:
    case 8888:
    case 9000:
    case 9090:
      return { protocol: 'http', buttonLabel: 'Open HTTP' };
    case 443:
    case 6443:
    case 8006:
    case 8443:
      return { protocol: 'https', buttonLabel: 'Open HTTPS' };
    default:
      return null;
  }
}
