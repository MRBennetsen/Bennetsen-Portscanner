import React from 'react';

interface IconProps {
  size?: number;
}

export const PlayIcon: React.FC<IconProps> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 3.2v9.6l8-4.8-8-4.8z" />
  </svg>
);

export const StopIcon: React.FC<IconProps> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
    <rect x="3.5" y="3.5" width="9" height="9" rx="1" />
  </svg>
);

export const RefreshIcon: React.FC<IconProps> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M13.5 8a5.5 5.5 0 1 1-1.4-3.7" strokeLinecap="round" />
    <path d="M13.5 2.5v3h-3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ChevronDownIcon: React.FC<IconProps> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SearchIcon: React.FC<IconProps> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" strokeLinecap="round" />
  </svg>
);

export const SettingsIcon: React.FC<IconProps> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
    <circle cx="8" cy="8" r="2.3" />
    <path
      d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1"
      strokeLinecap="round"
    />
  </svg>
);

export const BookmarkIcon: React.FC<IconProps> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M4 2.5h8v11l-4-2.8-4 2.8v-11z" strokeLinejoin="round" />
  </svg>
);

export const DownloadIcon: React.FC<IconProps> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M8 2.5v8M5 8l3 3 3-3M3 13.5h10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CloseIcon: React.FC<IconProps> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
  </svg>
);

export const CopyIcon: React.FC<IconProps> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
    <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
    <path d="M3 10.5V3h7.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const TerminalIcon: React.FC<IconProps> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
    <path d="M4.5 6l2.5 2-2.5 2M8.5 10h3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const NetworkIcon: React.FC<IconProps> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
    <rect x="5.5" y="1.5" width="5" height="3.5" rx="0.8" />
    <rect x="1.5" y="11" width="4.5" height="3.5" rx="0.8" />
    <rect x="10" y="11" width="4.5" height="3.5" rx="0.8" />
    <path d="M8 5v3M3.75 11V8h8.5v3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
