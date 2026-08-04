import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "./components/button";
import { EventStrip, type AppEvent, type AppEventKind } from "./components/event-strip";

import { DeviceDetailPanel, type SshPublicKeyCopyState, type SshSetupMode } from "./features/device-detail-panel";
import { NetworkPanel } from "./features/network-panel";
import { formatDeviceVersionSummary } from "./lib/device-info-format";
import { isVisibleDevice } from "./lib/device-format";
import type { LocalNetwork, PushDevice, PushDeviceInfo, SshClearDeviceKeysMode, SshKeyStatus, TinySoundInstalledApp } from "./types";
import "./styles.css";


let startupDiscoveryPromise: Promise<PushDevice[]> | null = null;

const PUSH_SERIAL_NUMBER = "37583090";
const PUSH_DISPLAY_NAME = `Push ${PUSH_SERIAL_NUMBER}`;

function createAppEvent(kind: AppEventKind, message: string, source?: string, details?: string): AppEvent {
  return {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString(),
    kind,
    message,
    details,
    source
  };
}

type VerifySshOptions = {
  maxAttempts?: number;
  reopenSetupOnFailure?: boolean;
  retryDelayMs?: number;
};

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getStartupDiscoveryPromise() {
  if (!startupDiscoveryPromise) {
    startupDiscoveryPromise = window.tinyPush.devices.discover().catch((error) => {
      startupDiscoveryPromise = null;
      throw error;
    });
  }

  return startupDiscoveryPromise;
}

function App() {
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [installedAppsByDeviceId, setInstalledAppsByDeviceId] = useState<Record<string, TinySoundInstalledApp[]>>({});
  const [deviceInfoByDeviceId, setDeviceInfoByDeviceId] = useState<Record<string, PushDeviceInfo | undefined>>({});
  const [installedAppsErrorsByDeviceId, setInstalledAppsErrorsByDeviceId] = useState<Record<string, string | undefined>>({});
  const [localNetwork, setLocalNetwork] = useState<LocalNetwork | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isDetectingDevices, setIsDiscovering] = useState(false);
  const [collectingLogsAppId, setCollectingLogsAppId] = useState<string | null>(null);
  const [installingAppArchiveDeviceId, setInstallingAppArchiveDeviceId] = useState<string | null>(null);
  const [loadingInstalledAppsDeviceId, setLoadingInstalledAppsDeviceId] = useState<string | null>(null);
  const [uninstallingAppId, setUninstallingAppId] = useState<string | null>(null);
  const [sshKeyStatus, setSshKeyStatus] = useState<SshKeyStatus | null>(null);
  const [isCreatingKey, setisCreatingKey] = useState(false);
  const [clearingSshKeysDeviceId, setClearingSshKeysDeviceId] = useState<string | null>(null);
  const [isConnectingSsh, setIsVerifyingSsh] = useState(false);
  const [pendingClearSshKeysDeviceId, setPendingClearSshKeysDeviceId] = useState<string | null>(null);
  const [sshPublicKeyCopyState, setSshPublicKeyCopyState] = useState<SshPublicKeyCopyState>("idle");
  const [sshSetupDeviceId, setSshSetupDeviceId] = useState<string | null>(null);
  const [sshSetupMode, setSshSetupMode] = useState<SshSetupMode | null>(null);
  const [sshStatusMessage, setSshStatusMessage] = useState("SSH key not checked.");
  const [sshErrorMessage, setSshErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Load cached devices or scan for Push 3 standalone.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<AppEvent[]>([createAppEvent("info", "Ready.", "app")]);
  const [isEventHistoryExpanded, setIsEventHistoryExpanded] = useState(false);
  const loggedEventIdsRef = useRef<Set<string>>(new Set());
  const logAppendQueueRef = useRef<Promise<void>>(Promise.resolve());

  function logAppEvent(kind: AppEventKind, message: string, source?: string, details?: string) {
    const nextEvent = createAppEvent(kind, message, source, details);
    queueEventLogWrite(nextEvent);
    setEvents((currentEvents) => [...currentEvents, nextEvent]);
  }

  function queueEventLogWrite(event: AppEvent) {
    if (loggedEventIdsRef.current.has(event.id)) {
      return;
    }

    loggedEventIdsRef.current.add(event.id);
    logAppendQueueRef.current = logAppendQueueRef.current
      .then(() => window.tinyPush.logs.appendEvent(event))
      .then(() => undefined)
      .catch((error: Error) => {
        console.error("Failed to write notification log event.", error);
      });
  }

  function clearDeviceInfo(deviceId: string) {
    setDeviceInfoByDeviceId((currentDeviceInfoByDeviceId) => {
      const { [deviceId]: _removedDeviceInfo, ...nextDeviceInfoByDeviceId } = currentDeviceInfoByDeviceId;
      return nextDeviceInfoByDeviceId;
    });
  }

  const visibleDevices = devices.filter(isVisibleDevice);
  const selectedDevice = visibleDevices.find((device) => device.id === selectedDeviceId) || visibleDevices[0] || null;
  const pendingClearSshKeysDevice = pendingClearSshKeysDeviceId ? devices.find((device) => device.id === pendingClearSshKeysDeviceId) || null : null;

  useEffect(() => {
    events.forEach(queueEventLogWrite);
  }, [events]);

  useEffect(() => {
    let isMounted = true;

    async function loadAndScanDevices() {
      try {
        const cachedDevices = await window.tinyPush.devices.list();
        if (isMounted) {
          setDevices(cachedDevices);
        }
      } catch (error) {
        if (isMounted) {
          const nextErrorMessage = error instanceof Error ? error.message : String(error);
          setErrorMessage(nextErrorMessage);
          logAppEvent("error", nextErrorMessage, "devices");
        }
      }

      if (!isMounted) {
        return;
      }

      setIsDiscovering(true);
      setErrorMessage(null);
      setStatusMessage("Scanning push.local and cached devices...");
      logAppEvent("info", "Scanning push.local and cached devices...", "discovery");

      try {
        const discoveredDevices = await getStartupDiscoveryPromise();
        if (!isMounted) {
          return;
        }

        const scanCompleteMessage = applyDiscoveredDevices(discoveredDevices);
        setStatusMessage(scanCompleteMessage);
        logAppEvent("success", scanCompleteMessage, "discovery");
      } catch (error) {
        if (isMounted) {
          const nextErrorMessage = error instanceof Error ? error.message : String(error);
          setErrorMessage(nextErrorMessage);
          logAppEvent("error", nextErrorMessage, "discovery");
        }
      } finally {
        if (isMounted) {
          setIsDiscovering(false);
        }
      }
    }

    loadAndScanDevices();

    window.tinyPush.network
      .getCurrent()
      .then((network) => {
        if (isMounted) {
          setLocalNetwork(network);
        }
      })
      .catch((error: Error) => {
        if (isMounted) {
          setLocalNetwork({
            name: null,
            type: "unknown",
            error: error.message
          });
          logAppEvent("warning", error.message, "network");
        }
      });

    window.tinyPush.ssh
      .getKeyStatus()
      .then(async (status) => {
        if (!isMounted) {
          return;
        }

        if (status.exists) {
          setSshKeyStatus(status);
          const keyStatusMessage = formatSshKeyStatusMessage(status);
          setSshStatusMessage(keyStatusMessage);
          logAppEvent("success", keyStatusMessage, "ssh");
          return;
        }

        setSshStatusMessage("Generating SSH key...");
        logAppEvent("info", "Generating SSH key...", "ssh");
        const generatedStatus = await window.tinyPush.ssh.generateKey();
        if (!isMounted) {
          return;
        }

        setSshKeyStatus(generatedStatus);
        const keyStatusMessage = formatSshKeyStatusMessage(generatedStatus);
        setSshStatusMessage(keyStatusMessage);
        logAppEvent("success", keyStatusMessage, "ssh");
      })
      .catch((error: Error) => {
        if (isMounted) {
          setSshErrorMessage(error.message);
          logAppEvent("error", error.message, "ssh");
        }
      });

    const unsubscribeNetworkChanges = window.tinyPush.network.onChanged((network) => {
      setLocalNetwork(network);
    });
    const unsubscribeSshKeyStatusChanges = window.tinyPush.ssh.onKeyStatusChanged((status) => {
      setSshKeyStatus(status);
      const keyStatusMessage = formatSshKeyStatusMessage(status);
      setSshStatusMessage(keyStatusMessage);
      if (!status.exists) {
        setSshErrorMessage(null);
        setSshPublicKeyCopyState("idle");
      }
      logAppEvent(status.exists ? "success" : "warning", keyStatusMessage, "ssh");
    });
    const unsubscribeSshProbeUpdates = window.tinyPush.devices.onSshProbeUpdated((device) => {
      setDevices((currentDevices) => upsertDevice(currentDevices, device));
      if (device.sshAvailable === undefined && device.sshStatus === "not-checked") {
        clearDeviceInfo(device.id);
        return;
      }
      if (!device.sshAvailable) {
        clearDeviceInfo(device.id);
      }
      const sshProbeMessage = device.sshAvailable ? `${device.displayName} is connected.` : `${device.displayName} is not connected.`;
      setSshStatusMessage(sshProbeMessage);
      logAppEvent(device.sshAvailable ? "success" : "warning", sshProbeMessage, "ssh");
    });

    return () => {
      isMounted = false;
      unsubscribeNetworkChanges();
      unsubscribeSshKeyStatusChanges();
      unsubscribeSshProbeUpdates();
    };
  }, []);

  useEffect(() => {
    const visibleDevices = devices.filter(isVisibleDevice);

    if (visibleDevices.length === 0) {
      setSelectedDeviceId(null);
      return;
    }

    if (!selectedDeviceId || !visibleDevices.some((device) => device.id === selectedDeviceId)) {
      setSelectedDeviceId(visibleDevices[0].id);
    }
  }, [devices, selectedDeviceId]);

  useEffect(() => {
    if (!selectedDevice || !isSshReadyDevice(selectedDevice) || installedAppsByDeviceId[selectedDevice.id] || loadingInstalledAppsDeviceId === selectedDevice.id) {
      return;
    }

    loadInstalledDeviceApps(selectedDevice);
  }, [installedAppsByDeviceId, loadingInstalledAppsDeviceId, selectedDevice]);

  async function discoverDevices() {
    setIsDiscovering(true);
    setErrorMessage(null);
    setStatusMessage("Scanning push.local and cached devices...");
    logAppEvent("info", "Scanning push.local and cached devices...", "discovery");

    try {
      const discoveredDevices = await window.tinyPush.devices.discover();
      const scanCompleteMessage = applyDiscoveredDevices(discoveredDevices);
      setStatusMessage(scanCompleteMessage);
      logAppEvent("success", scanCompleteMessage, "discovery");
    } catch (error) {
      const nextErrorMessage = error instanceof Error ? error.message : String(error);
      setErrorMessage(nextErrorMessage);
      logAppEvent("error", nextErrorMessage, "discovery");
    } finally {
      setIsDiscovering(false);
    }
  }

  function applyDiscoveredDevices(discoveredDevices: PushDevice[]) {
    const nextReachableCount = discoveredDevices.filter((device) => device.connectionState === "reachable" || device.connectionState === "ssh-ready").length;
    const nextSshCheckingCount = discoveredDevices.filter((device) => device.sshStatus === "checking").length;
    const nextVisibleDevices = discoveredDevices.filter(isVisibleDevice);
    setDevices(discoveredDevices);
    if (nextVisibleDevices.length > 0) {
      setSelectedDeviceId(nextVisibleDevices[0].id);
    }

    return `Local network scan complete. ${discoveredDevices.length} device record(s), ${nextReachableCount} reachable${
      nextSshCheckingCount ? `, ${nextSshCheckingCount} checking SSH` : ""
    }.`;
  }

  async function generateSshKey() {
    setisCreatingKey(true);
    setSshErrorMessage(null);
    setSshPublicKeyCopyState("idle");
    setSshStatusMessage("Generating SSH key...");
    logAppEvent("info", "Generating SSH key...", "ssh");

    try {
      await window.tinyPush.ssh.generateKey();
      const status = await window.tinyPush.ssh.getKeyStatus();
      setSshKeyStatus(status);
      const keyStatusMessage = formatSshKeyStatusMessage(status);
      setSshStatusMessage(keyStatusMessage);
      logAppEvent(status.exists ? "success" : "info", keyStatusMessage, "ssh");
    } catch (error) {
      const nextSshErrorMessage = error instanceof Error ? error.message : String(error);
      setSshErrorMessage(nextSshErrorMessage);
      logAppEvent("error", nextSshErrorMessage, "ssh");
    } finally {
      setisCreatingKey(false);
    }
  }

  async function rotateSshKey() {
    setisCreatingKey(true);
    setSshErrorMessage(null);
    setSshSetupDeviceId(null);
    setSshPublicKeyCopyState("idle");
    setSshStatusMessage("Rotating SSH key...");
    logAppEvent("warning", "Rotating SSH key...", "ssh");

    try {
      const status = await window.tinyPush.ssh.rotateKey();
      setSshKeyStatus(status);
      setInstalledAppsByDeviceId({});
      setDeviceInfoByDeviceId({});
      setInstalledAppsErrorsByDeviceId({});
      const keyStatusMessage = formatSshKeyStatusMessage(status);
      setSshStatusMessage(keyStatusMessage);
      logAppEvent("success", "SSH key rotated.", "ssh", keyStatusMessage);
    } catch (error) {
      const nextSshErrorMessage = error instanceof Error ? error.message : String(error);
      setSshErrorMessage(nextSshErrorMessage);
      logAppEvent("error", nextSshErrorMessage, "ssh");
    } finally {
      setisCreatingKey(false);
    }
  }

  async function verifySsh(device: PushDevice, mode: SshSetupMode = "auto", options: VerifySshOptions = {}) {
    setIsVerifyingSsh(true);
    setSshErrorMessage(null);
    setSshPublicKeyCopyState("idle");
    setSshSetupDeviceId(null);
    setSshSetupMode(mode);
    setSshStatusMessage(`Verifying SSH for ${device.displayName}...`);
    logAppEvent("info", `Verifying SSH for ${device.displayName}...`, "ssh");

    const maxAttempts = options.maxAttempts || 1;
    const reopenSetupOnFailure = options.reopenSetupOnFailure !== false;
    const retryDelayMs = options.retryDelayMs || 0;

    try {
      await ensureSshKeyExists();

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const result = await window.tinyPush.ssh.verify(getDeviceSshHost(device), "root");

        if (!result.success) {
          if (!reopenSetupOnFailure && attempt < maxAttempts) {
            const retryMessage = `SSH key saved. Waiting for Push SSH to become ready (${attempt}/${maxAttempts})...`;
            setSshStatusMessage(retryMessage);
            logAppEvent("info", retryMessage, "ssh");
            await delay(retryDelayMs);
            continue;
          }

          if (result.resetSshState && result.device) {
            const resetDevice = result.device;
            setDevices((currentDevices) => upsertDevice(currentDevices, resetDevice));
          }
          clearDeviceInfo(device.id);
          if (reopenSetupOnFailure) {
            setSshSetupDeviceId(device.id);
            setSshSetupMode(mode);
          } else {
            setSshSetupDeviceId(null);
            setSshSetupMode(null);
          }
          if (reopenSetupOnFailure && mode === "manual") {
            const didCopyPublicKey = await copyPublicSshKey();
            if (!didCopyPublicKey) {
              setSshStatusMessage("SSH verification failed. Setup page is open.");
            }
          }
          if (result.resetSshState) {
            const setupRequiredMessage = reopenSetupOnFailure ? (mode === "auto" ? "Push rejected the SSH key. Automated SSH setup page is open." : "Push rejected the SSH key. Manual SSH setup page is open.") : "SSH key was saved, but SSH is not ready yet. Retry the connection.";
            setSshErrorMessage(null);
            setSshStatusMessage(setupRequiredMessage);
            logAppEvent(reopenSetupOnFailure ? "warning" : "error", setupRequiredMessage, "ssh");
          } else {
            setSshErrorMessage(result.error);
            logAppEvent("error", result.error, "ssh");
          }
          return;
        }

        setDevices((currentDevices) => upsertDevice(currentDevices, result.device));
        setSelectedDeviceId(result.device.id);
        setSshSetupDeviceId(null);
        setSshSetupMode(null);
        const sshReadyMessage = `SSH ready as ${result.profile.username}.`;
        setSshStatusMessage(sshReadyMessage);
        logAppEvent("success", sshReadyMessage, "ssh");
        loadInstalledDeviceApps(result.device);
        return;
      }
    } catch (error) {
      clearDeviceInfo(device.id);
      const nextSshErrorMessage = error instanceof Error ? error.message : String(error);
      setSshErrorMessage(nextSshErrorMessage);
      logAppEvent("error", nextSshErrorMessage, "ssh");
    } finally {
      setIsVerifyingSsh(false);
    }
  }

  function cancelSshSetup(device: PushDevice) {
    clearDeviceInfo(device.id);
    setDevices((currentDevices) =>
      currentDevices.map((currentDevice) =>
        currentDevice.id === device.id
          ? {
              ...currentDevice,
              connectionState: currentDevice.connectionState === "ssh-ready" ? "reachable" : currentDevice.connectionState,
              sshAvailable: undefined,
              sshCheckedAt: undefined,
              sshError: undefined,
              sshStatus: "not-checked"
            }
          : currentDevice
      )
    );
    setSshSetupDeviceId(null);
    setSshSetupMode(null);
    setSshPublicKeyCopyState("idle");
    setSshErrorMessage(null);
    const cancelMessage = `SSH setup cancelled for ${device.displayName}.`;
    setSshStatusMessage(cancelMessage);
    logAppEvent("info", cancelMessage, "ssh");
  }
  async function closeSshSetup(device: PushDevice) {
    const retryMode = sshSetupMode || "manual";
    setSshSetupDeviceId(null);
    setSshSetupMode(null);
    const closeMessage = `SSH setup page closed for ${device.displayName}. Retrying SSH connection...`;
    setSshStatusMessage(closeMessage);
    logAppEvent("info", closeMessage, "ssh");
    await verifySsh(device, retryMode);
  }

  async function completeSshSetup(device: PushDevice) {
    const retryMode = sshSetupMode || "auto";
    setSshSetupDeviceId(null);
    setSshSetupMode(null);
    const completeMessage = `SSH key saved for ${device.displayName}. Waiting for SSH connection...`;
    setSshStatusMessage(completeMessage);
    logAppEvent("success", completeMessage, "ssh");
    await verifySsh(device, retryMode, { maxAttempts: 6, reopenSetupOnFailure: false, retryDelayMs: 2500 });
  }

  async function loadInstalledDeviceApps(device: PushDevice) {
    const sshHost = getDeviceSshHost(device);

    if (!sshHost) {
      return;
    }

    setLoadingInstalledAppsDeviceId(device.id);
    setInstalledAppsErrorsByDeviceId((currentErrors) => ({
      ...currentErrors,
      [device.id]: undefined
    }));

    try {
      const result = await window.tinyPush.ssh.listInstalledApps(sshHost, "root");
      setInstalledAppsByDeviceId((currentAppsByDeviceId) => ({
        ...currentAppsByDeviceId,
        [device.id]: result.apps
      }));
      setDeviceInfoByDeviceId((currentDeviceInfoByDeviceId) => ({
        ...currentDeviceInfoByDeviceId,
        [device.id]: result.deviceInfo
      }));
      logAppEvent("info", formatDeviceVersionSummary(PUSH_DISPLAY_NAME, result.deviceInfo), "device");
      const installedAppsMessage =
        result.apps.length === 1 ? `${device.displayName} has 1 app installed.` : `${device.displayName} has ${result.apps.length} apps installed.`;
      logAppEvent("info", installedAppsMessage, "ssh");
    } catch (error) {
      clearDeviceInfo(device.id);
      const nextErrorMessage = error instanceof Error ? error.message : String(error);
      setInstalledAppsErrorsByDeviceId((currentErrors) => ({
        ...currentErrors,
        [device.id]: nextErrorMessage
      }));
      logAppEvent("error", nextErrorMessage, "ssh");
    } finally {
      setLoadingInstalledAppsDeviceId((currentDeviceId) => (currentDeviceId === device.id ? null : currentDeviceId));
    }
  }

  async function collectInstalledAppLogs(device: PushDevice, installedApp: TinySoundInstalledApp) {
    const sshHost = getDeviceSshHost(device);

    if (!sshHost || !installedApp.hasLogFiles) {
      return;
    }

    setCollectingLogsAppId(installedApp.id);
    setSshErrorMessage(null);
    const startMessage = `Collecting ${installedApp.name} logs...`;
    setSshStatusMessage(startMessage);
    logAppEvent("info", startMessage, "ssh");

    try {
      const result = await window.tinyPush.ssh.collectAppLogs(sshHost, installedApp.name, "root");
      const completeMessage = `${result.fileName} saved to Downloads.`;
      setInstalledAppsByDeviceId((currentAppsByDeviceId) => ({
        ...currentAppsByDeviceId,
        [device.id]: (currentAppsByDeviceId[device.id] || []).map((currentInstalledApp) =>
          currentInstalledApp.id === installedApp.id ? { ...currentInstalledApp, hasLogFiles: false } : currentInstalledApp
        )
      }));
      setSshStatusMessage(completeMessage);
      logAppEvent("success", completeMessage, "ssh", result.localPath);
    } catch (error) {
      const nextErrorMessage = error instanceof Error ? error.message : String(error);
      setSshErrorMessage(nextErrorMessage);
      logAppEvent("error", nextErrorMessage, "ssh");
    } finally {
      setCollectingLogsAppId((currentAppId) => (currentAppId === installedApp.id ? null : currentAppId));
    }
  }

  async function clearDeviceSshKeys(device: PushDevice, mode: SshClearDeviceKeysMode) {
    const sshHost = getDeviceSshHost(device);

    if (!sshHost) {
      return;
    }

    setClearingSshKeysDeviceId(device.id);
    setSshErrorMessage(null);
    const startMessage = mode === "except-utility-key" ? `Clearing saved SSH keys except the key from ${device.displayName}...` : `Clearing all saved SSH keys from ${device.displayName}...`;
    setSshStatusMessage(startMessage);
    logAppEvent("warning", startMessage, "ssh");

    try {
      const result = await window.tinyPush.ssh.clearDeviceKeys(sshHost, "root", mode, getDeviceSshHosts(device).filter((host) => host !== sshHost));
      setDevices((currentDevices) => upsertDevice(currentDevices, result.device));
      if (mode === "all") {
        clearDeviceInfo(result.device.id);
        setInstalledAppsByDeviceId((currentAppsByDeviceId) => {
          const { [result.device.id]: _removedApps, ...nextAppsByDeviceId } = currentAppsByDeviceId;
          return nextAppsByDeviceId;
        });
        setInstalledAppsErrorsByDeviceId((currentErrors) => {
          const { [result.device.id]: _removedError, ...nextErrors } = currentErrors;
          return nextErrors;
        });
        setSshSetupDeviceId(null);
      }
      const completeMessage = mode === "except-utility-key" ? `Saved SSH keys were cleared from ${device.displayName}, except the key on this machine.` : `Saved SSH keys were cleared from ${device.displayName}. Run SSH setup before connecting again.`;
      setSshStatusMessage(completeMessage);
      logAppEvent("success", completeMessage, "ssh");
      setClearingSshKeysDeviceId((currentDeviceId) => (currentDeviceId === device.id ? null : currentDeviceId));
      if (mode === "except-utility-key") {
        await discoverDevices();
      }
    } catch (error) {
      const nextErrorMessage = error instanceof Error ? error.message : String(error);
      setSshErrorMessage(nextErrorMessage);
      logAppEvent("error", nextErrorMessage, "ssh");
    } finally {
      setClearingSshKeysDeviceId((currentDeviceId) => (currentDeviceId === device.id ? null : currentDeviceId));
    }
  }

  async function installAppArchive(device: PushDevice, archiveFile: File) {
    const sshHost = getDeviceSshHost(device);

    if (!sshHost) {
      return;
    }

    setInstallingAppArchiveDeviceId(device.id);
    setSshErrorMessage(null);
    const startMessage = `Installing ${archiveFile.name}...`;
    setSshStatusMessage(startMessage);
    logAppEvent("info", startMessage, "ssh");

    try {
      const archiveBytes = new Uint8Array(await archiveFile.arrayBuffer());
      const result = await window.tinyPush.ssh.installAppArchive(sshHost, archiveFile.name, archiveBytes, "root");
      const completeMessage = `${result.appName} ${result.version} installed.`;
      setSshStatusMessage(completeMessage);
      logAppEvent("success", completeMessage, "ssh", result.installPath);
      await loadInstalledDeviceApps(device);
    } catch (error) {
      const nextErrorMessage = error instanceof Error ? error.message : String(error);
      setSshErrorMessage(nextErrorMessage);
      logAppEvent("error", nextErrorMessage, "ssh");
      throw error;
    } finally {
      setInstallingAppArchiveDeviceId((currentDeviceId) => (currentDeviceId === device.id ? null : currentDeviceId));
    }
  }

  async function uninstallApp(device: PushDevice, installedApp: TinySoundInstalledApp) {
    const sshHost = getDeviceSshHost(device);
    const version = installedApp.versionFolders[0];

    if (!sshHost || !version) {
      return;
    }

    setUninstallingAppId(installedApp.id);
    setSshErrorMessage(null);
    const startMessage = `Uninstalling ${installedApp.name} ${version}...`;
    setSshStatusMessage(startMessage);
    logAppEvent("info", startMessage, "ssh");

    try {
      const result = await window.tinyPush.ssh.uninstallApp(sshHost, installedApp.name, version, "root");
      const completeMessage = `${result.appName} ${result.version} uninstalled.`;
      setSshStatusMessage(completeMessage);
      logAppEvent("success", completeMessage, "ssh", result.installPath);
      await loadInstalledDeviceApps(device);
    } catch (error) {
      const nextErrorMessage = error instanceof Error ? error.message : String(error);
      setSshErrorMessage(nextErrorMessage);
      logAppEvent("error", nextErrorMessage, "ssh");
    } finally {
      setUninstallingAppId((currentAppId) => (currentAppId === installedApp.id ? null : currentAppId));
    }
  }

  async function copyPublicSshKey() {
    setSshPublicKeyCopyState("copying");

    try {
      const status = await window.tinyPush.ssh.copyPublicKey();
      setSshKeyStatus(status);
      setSshPublicKeyCopyState("copied");
      const copyMessage = `${status.keyName}.pub copied to clipboard.`;
      setSshStatusMessage(copyMessage);
      logAppEvent("success", copyMessage, "ssh");
      return true;
    } catch (error) {
      const nextSshErrorMessage = error instanceof Error ? error.message : String(error);
      setSshPublicKeyCopyState("failed");
      setSshErrorMessage(nextSshErrorMessage);
      setSshStatusMessage("Public SSH key copy failed.");
      logAppEvent("error", nextSshErrorMessage, "ssh");
      return false;
    }
  }

  async function ensureSshKeyExists() {
    const currentStatus = await window.tinyPush.ssh.getKeyStatus();

    if (currentStatus.exists) {
      setSshKeyStatus(currentStatus);
      return currentStatus;
    }

    setSshStatusMessage("Generating SSH key...");
    logAppEvent("info", "Generating SSH key...", "ssh");
    const generatedStatus = await window.tinyPush.ssh.generateKey();
    setSshKeyStatus(generatedStatus);
    const keyStatusMessage = `Using ${generatedStatus.keyName}.`;
    setSshStatusMessage(keyStatusMessage);
    logAppEvent("success", keyStatusMessage, "ssh");
    return generatedStatus;
  }

  async function exportNotificationLog() {
    try {
      await logAppendQueueRef.current;
      const result = await window.tinyPush.logs.exportLatest();
      logAppEvent("success", `Notification log saved to Downloads as ${result.fileName}.`, "logs", result.localPath);
    } catch (error) {
      const nextErrorMessage = error instanceof Error ? error.message : String(error);
      logAppEvent("error", nextErrorMessage, "logs");
    }
  }

  async function confirmClearSshKeys(mode: SshClearDeviceKeysMode) {
    if (!pendingClearSshKeysDevice) {
      return;
    }

    await clearDeviceSshKeys(pendingClearSshKeysDevice, mode);
    setPendingClearSshKeysDeviceId(null);
  }

  return (
    <main className="grid h-dvh min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-[#202120] text-[#eeeeea]">
      <section className="grid min-h-0 overflow-hidden bg-[#303230] px-2 py-2">
        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
          <NetworkPanel
            deviceDisplayName={PUSH_DISPLAY_NAME}
            isDetectingDevices={isDetectingDevices}
            isCreatingKey={isCreatingKey}
            isSshSetupActive={sshSetupDeviceId !== null}
            keyStatus={sshKeyStatus}
            localNetwork={localNetwork}
            onCopyPublicKey={copyPublicSshKey}
            onDetectDevices={discoverDevices}
            onCreateKey={generateSshKey}
            onRotateKey={rotateSshKey}
            onSelectDevice={setSelectedDeviceId}
            selectedDeviceId={selectedDevice?.id || null}
            sshPublicKeyCopyState={sshPublicKeyCopyState}
            visibleDevices={visibleDevices}
          />

          {selectedDevice ? (
            <DeviceDetailPanel
              collectingLogsAppId={collectingLogsAppId}
              device={selectedDevice}
              deviceDisplayName={PUSH_DISPLAY_NAME}
              deviceInfo={deviceInfoByDeviceId[selectedDevice.id] || null}
              installedApps={installedAppsByDeviceId[selectedDevice.id] || []}
              installedAppsErrorMessage={installedAppsErrorsByDeviceId[selectedDevice.id] || null}
              isClearingSshKeys={clearingSshKeysDeviceId === selectedDevice.id}
              isInstallingAppArchive={installingAppArchiveDeviceId === selectedDevice.id}
              isLoadingInstalledApps={loadingInstalledAppsDeviceId === selectedDevice.id}
              isConnectingSsh={isConnectingSsh}
              onCancelSshSetup={() => cancelSshSetup(selectedDevice)}
              onCloseSshSetup={() => closeSshSetup(selectedDevice)}
              onCompleteSshSetup={() => completeSshSetup(selectedDevice)}
              onCollectLogs={(installedApp) => collectInstalledAppLogs(selectedDevice, installedApp)}
              onInstallAppArchive={(archiveFile) => installAppArchive(selectedDevice, archiveFile)}
              onRefreshInstalledApps={() => loadInstalledDeviceApps(selectedDevice)}
              onRequestClearSshKeys={(device) => setPendingClearSshKeysDeviceId(device.id)}
              onUninstallApp={(installedApp) => uninstallApp(selectedDevice, installedApp)}
              onConnectSsh={verifySsh}
              onSshSetupEvent={(kind, message, details) => logAppEvent(kind, message, "ssh", details)}
              setupMode={sshSetupMode}
              shouldShowSshSetup={sshSetupDeviceId === selectedDevice.id}
              uninstallingAppId={uninstallingAppId}
            />
          ) : null}
        </div>
      </section>
      {pendingClearSshKeysDevice ? (
        <ClearSshKeysConfirmDialog
          device={pendingClearSshKeysDevice}
          isClearing={clearingSshKeysDeviceId === pendingClearSshKeysDevice.id}
          onCancel={() => setPendingClearSshKeysDeviceId(null)}
          onConfirmAll={() => confirmClearSshKeys('all')}
          onConfirmExceptThisKey={() => confirmClearSshKeys('except-utility-key')}
        />
      ) : null}
      <EventStrip events={events} isExpanded={isEventHistoryExpanded} onExportLog={exportNotificationLog} onToggleExpanded={() => setIsEventHistoryExpanded((isExpanded) => !isExpanded)} />
    </main>
  );
}

function ClearSshKeysConfirmDialog({
  device,
  isClearing,
  onCancel,
  onConfirmAll,
  onConfirmExceptThisKey
}: {
  device: PushDevice;
  isClearing: boolean;
  onCancel: () => void;
  onConfirmAll: () => void;
  onConfirmExceptThisKey: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || isClearing) {
        return;
      }

      event.preventDefault();
      onCancel();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isClearing, onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#10110f]/70 px-4">
      <section aria-modal="true" className="w-[min(560px,calc(100vw-32px))] rounded-[4px] border border-[#1b1c1a] bg-[#373936] p-3 shadow-xl" role="dialog">
        <h3 className="text-xs font-bold uppercase text-[#eeeeea]">Clear saved SSH keys?</h3>
        <p className="mt-2 text-xs leading-5 text-[#d8d8d2]">
          This wipes saved SSH keys from <span className="font-bold text-[#eeeeea]">{device.displayName}</span>. When keys are wiped, affected devices will need to re-connect.
        </p>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button
            className="!bg-[#d99b98] !text-[#2b1110] hover:!bg-[#e7b3b0]"
            disabled={isClearing}
            onClick={onConfirmAll}
            type="button"
            variant="compact"
          >
            {isClearing ? "Clearing" : "Yes"}
          </Button>
          <Button disabled={isClearing} onClick={onConfirmExceptThisKey} type="button" variant="compact">
            Keep This Key
          </Button>
          <Button disabled={isClearing} onClick={onCancel} type="button" variant="compact">
            No
          </Button>
        </div>
      </section>
    </div>
  );
}

function formatSshKeyStatusMessage(status: SshKeyStatus) {
  return status.exists ? `Using ${status.publicKeyPath}.` : "Generate a Tiny Push Utility SSH key.";
}

function getDeviceSshHost(device: PushDevice) {
  return getDeviceSshHosts(device)[0] || "";
}

function getDeviceSshHosts(device: PushDevice) {
  return Array.from(new Set([device.ipAddress, device.hostname].filter((host): host is string => Boolean(host))));
}

function isSshReadyDevice(device: PushDevice) {
  return device.connectionState === "ssh-ready" || device.sshStatus === "available" || device.sshAvailable === true;
}

function upsertDevice(devices: PushDevice[], nextDevice: PushDevice) {
  return [...devices.filter((device) => device.id !== nextDevice.id), nextDevice].sort((left, right) => {
    return left.displayName.localeCompare(right.displayName);
  });
}

createRoot(document.querySelector("#root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);

