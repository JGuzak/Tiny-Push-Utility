import type { DetailedHTMLProps, HTMLAttributes } from "react";

export {};

export type DeviceConnectionState = "unknown" | "discovering" | "reachable" | "unreachable" | "ssh-ready" | "error";
export type SshProbeStatus = "not-checked" | "checking" | "available" | "unavailable";

export type PushDevice = {
  id: string;
  displayName: string;
  hostname?: string;
  ipAddress?: string;
  lastSeenAt?: string;
  checkedAt?: string;
  connectionState: DeviceConnectionState;
  probePath?: string;
  statusCode?: number;
  statusMessage?: string;
  sshStatus?: SshProbeStatus;
  sshAvailable?: boolean;
  sshCheckedAt?: string;
  sshError?: string;
  error?: string;
};

export type LocalNetwork = {
  name: string | null;
  interfaceName?: string;
  ipAddress?: string;
  gateway?: string;
  type: "wifi" | "network" | "unknown";
  source?: string;
  error?: string;
};

export type TutorialId = "ssh-connection-workflow" | "startup-risk-warning";

export type SshKeyStatus = {
  exists: boolean;
  keyName: string;
  privateKeyPath: string;
  publicKeyPath: string;
  publicKey: string | null;
};

export type SshClearDeviceKeysMode = "all" | "except-utility-key";

export type SshProfile = {
  deviceId: string;
  host: string;
  port: 22;
  username: string;
  keyPath: string;
  verifiedAt: string;
};

export type SshVerificationResult =
  | {
      success: true;
      profile: SshProfile;
      device: PushDevice;
      startedAt: string;
      verifiedAt: string;
    }
  | {
      success: false;
      device?: PushDevice;
      host: string;
      username: string;
      keyPath: string;
      resetSshState?: boolean;
      startedAt: string;
      error: string;
    };

export type TinySoundInstalledApp = {
  hasLogFiles: boolean;
  id: string;
  name: string;
  path: string;
  versionFolders: string[];
};

export type PushDeviceInfo = {
  abletonOsVersion: string | null;
  firmwareVersion: string | null;
  liveVersion: string | null;
  pushSoftwareVersion: string | null;
};

export type TinySoundInstalledAppsResult = {
  apps: TinySoundInstalledApp[];
  deviceInfo: PushDeviceInfo;
  host: string;
  installPath: string;
  username: string;
};

export type TinySoundLogCollectionResult = {
  appName: string;
  fileName: string;
  localPath: string;
};

export type SshClearDeviceKeysResult = {
  clearedAt: string;
  device: PushDevice;
  host: string;
  mode: SshClearDeviceKeysMode;
  username: string;
};

export type TinyPushUtilityLogExportResult = {
  fileName: string;
  localPath: string;
  sourcePath: string;
};

export type TinySoundAppInstallResult = {
  appName: string;
  fileName: string;
  installPath: string;
  version: string;
};

export type TinySoundAppUninstallResult = {
  appName: string;
  installPath: string;
  version: string;
};


declare global {
  interface Window {
    tinyPush: {
      clipboard: {
        writeText: (text: string) => Promise<{ copied: true }>;
      };
      logs: {
        appendEvent: (event: import("./components/event-strip").AppEvent) => Promise<{ logPath: string }>;
        exportLatest: () => Promise<TinyPushUtilityLogExportResult>;
      };
      devices: {
        list: () => Promise<PushDevice[]>;
        discover: () => Promise<PushDevice[]>;
        probe: (host: string) => Promise<PushDevice>;
        onSshProbeUpdated: (callback: (device: PushDevice) => void) => () => void;
      };
      network: {
        getCurrent: () => Promise<LocalNetwork>;
        onChanged: (callback: (network: LocalNetwork) => void) => () => void;
      };
      pushCookies: {
        prime: (host: string, storeKey: string) => Promise<{ count: number; host: string; storeKey: string }>;
        persist: (host: string, storeKey: string) => Promise<{ count: number; host: string; storeKey: string }>;
      };
      tutorials: {
        isDisabled: (tutorialId: TutorialId) => Promise<{ disabled: boolean; tutorialId: TutorialId }>;
        disable: (tutorialId: TutorialId) => Promise<{ disabled: true; path: string; tutorialId: TutorialId }>;
      };
      ssh: {
        getKeyStatus: () => Promise<SshKeyStatus>;
        generateKey: () => Promise<SshKeyStatus>;
        rotateKey: () => Promise<SshKeyStatus>;
        copyPublicKey: () => Promise<SshKeyStatus>;
        clearDeviceKeys: (host: string, username?: string, mode?: SshClearDeviceKeysMode, alternateHosts?: string[]) => Promise<SshClearDeviceKeysResult>;
        collectAppLogs: (host: string, appName: string, username?: string) => Promise<TinySoundLogCollectionResult>;
        installAppArchive: (host: string, fileName: string, bytes: Uint8Array, username?: string) => Promise<TinySoundAppInstallResult>;
        listInstalledApps: (host: string, username?: string) => Promise<TinySoundInstalledAppsResult>;
        uninstallApp: (host: string, appName: string, version: string, username?: string) => Promise<TinySoundAppUninstallResult>;
        getSetupWebviewPreloadUrl: () => Promise<string>;
        verify: (host: string, username?: string) => Promise<SshVerificationResult>;
        onKeyStatusChanged: (callback: (status: SshKeyStatus) => void) => () => void;
      };
    };
  }
}

