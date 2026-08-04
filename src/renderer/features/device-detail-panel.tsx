import { ChangeEvent, DragEvent, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { RefreshCw, Upload } from "lucide-react";

import pushSshPairDiagramUrl from "../../../images/push-3-diagram-ssh-pair-flash.gif";

import { Button } from "../components/button";
import type { AppEventKind } from "../components/event-strip";
import { SshAbilityBadge } from "../components/status-badge";
import { formatDeviceVersionInfo } from "../lib/device-info-format";
import type { PushDevice, PushDeviceInfo, TinySoundInstalledApp } from "../types";

export type SshPublicKeyCopyState = "idle" | "copying" | "copied" | "failed";
export type SshSetupMode = "manual" | "auto";

type SshSetupHelpState = "preparing" | "ready" | "automating" | "code-required" | "confirming" | "verifying" | "failure" | "success";

const SSH_CONNECTION_WORKFLOW_TUTORIAL_ID = "ssh-connection-workflow";
type DeviceDetailPanelProps = {
  collectingLogsAppId: string | null;
  device: PushDevice;
  deviceDisplayName: string;
  deviceInfo: PushDeviceInfo | null;
  installedApps: TinySoundInstalledApp[];
  installedAppsErrorMessage: string | null;
  isInstallingAppArchive: boolean;
  isLoadingInstalledApps: boolean;
  isClearingSshKeys: boolean;
  isConnectingSsh: boolean;
  onCancelSshSetup: () => void;
  onCloseSshSetup: () => void;
  onCompleteSshSetup: () => void;
  onCollectLogs: (installedApp: TinySoundInstalledApp) => void;
  onInstallAppArchive: (archiveFile: File) => Promise<void>;
  onRefreshInstalledApps: () => void;
  onRequestClearSshKeys: (device: PushDevice) => void;
  onUninstallApp: (installedApp: TinySoundInstalledApp) => void;
  onConnectSsh: (device: PushDevice, mode: SshSetupMode) => void;
  onSshSetupEvent: (kind: AppEventKind, message: string, details?: string) => void;
  shouldShowSshSetup: boolean;
  setupMode: SshSetupMode | null;
  uninstallingAppId: string | null;
};

export function DeviceDetailPanel({
  collectingLogsAppId,
  device,
  deviceDisplayName,
  deviceInfo,
  installedApps,
  installedAppsErrorMessage,
  isInstallingAppArchive,
  isLoadingInstalledApps,
  isClearingSshKeys,
  isConnectingSsh,
  onCancelSshSetup,
  onCloseSshSetup,
  onCompleteSshSetup,
  onCollectLogs,
  onInstallAppArchive,
  onRefreshInstalledApps,
  onRequestClearSshKeys,
  onUninstallApp,
  onConnectSsh,
  onSshSetupEvent,
  shouldShowSshSetup,
  setupMode,
  uninstallingAppId
}: DeviceDetailPanelProps) {
  const isSshReady = isSshReadyDevice(device);
  const isCheckingSsh = device.sshStatus === "checking";
  const [isVersionInfoCopiedVisible, setIsVersionInfoCopiedVisible] = useState(false);
  const [shouldRenderVersionInfoCopied, setShouldRenderVersionInfoCopied] = useState(false);
  const [shouldShowSshSetupTutorial, setShouldShowSshSetupTutorial] = useState(false);
  const [sshSetupHelpState, setSshSetupHelpState] = useState<SshSetupHelpState>("preparing");
  const [isSshSetupTutorialReady, setIsSshSetupTutorialReady] = useState(false);
  const [isSshSetupTutorialAccepted, setIsSshSetupTutorialAccepted] = useState(false);
  const versionInfoCopiedTimerRef = useRef<number | null>(null);
  const versionInfoCopiedRemoveTimerRef = useRef<number | null>(null);
  const shouldRenderSshSetupFrame = shouldShowSshSetup && isSshSetupTutorialReady && !shouldShowSshSetupTutorial;
  const panelLayoutClassName = shouldShowSshSetup ? "h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]" : "min-h-full content-start grid-rows-[auto_auto_auto]";

  useEffect(() => {
    return () => {
      if (versionInfoCopiedTimerRef.current) {
        window.clearTimeout(versionInfoCopiedTimerRef.current);
      }

      if (versionInfoCopiedRemoveTimerRef.current) {
        window.clearTimeout(versionInfoCopiedRemoveTimerRef.current);
      }
    };
  }, []);
  useEffect(() => {
    let isMounted = true;

    if (!shouldShowSshSetup) {
      setShouldShowSshSetupTutorial(false);
      setIsSshSetupTutorialReady(false);
      setIsSshSetupTutorialAccepted(false);
      setSshSetupHelpState("preparing");
      return () => {
        isMounted = false;
      };
    }

    setShouldShowSshSetupTutorial(false);
    setIsSshSetupTutorialReady(false);
    setIsSshSetupTutorialAccepted(false);
    setSshSetupHelpState("preparing");

    window.tinyPush.tutorials
      .isDisabled(SSH_CONNECTION_WORKFLOW_TUTORIAL_ID)
      .then((result) => {
        if (!isMounted) {
          return;
        }

        setShouldShowSshSetupTutorial(!result.disabled);
        setIsSshSetupTutorialReady(true);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setShouldShowSshSetupTutorial(true);
        setIsSshSetupTutorialReady(true);
      });

    return () => {
      isMounted = false;
    };
  }, [device.id, shouldShowSshSetup]);

  async function handleSshSetupTutorialOk() {
    if (isSshSetupTutorialAccepted) {
      await window.tinyPush.tutorials.disable(SSH_CONNECTION_WORKFLOW_TUTORIAL_ID);
    }

    setShouldShowSshSetupTutorial(false);
  }
  async function copyVersionInfo() {
    await window.tinyPush.clipboard.writeText(formatDeviceVersionInfo(deviceDisplayName, deviceInfo));
    setShouldRenderVersionInfoCopied(true);
    window.requestAnimationFrame(() => setIsVersionInfoCopiedVisible(true));

    if (versionInfoCopiedTimerRef.current) {
      window.clearTimeout(versionInfoCopiedTimerRef.current);
    }

    if (versionInfoCopiedRemoveTimerRef.current) {
      window.clearTimeout(versionInfoCopiedRemoveTimerRef.current);
    }

    versionInfoCopiedTimerRef.current = window.setTimeout(() => {
      setIsVersionInfoCopiedVisible(false);
      versionInfoCopiedTimerRef.current = null;
      versionInfoCopiedRemoveTimerRef.current = window.setTimeout(() => {
        setShouldRenderVersionInfoCopied(false);
        versionInfoCopiedRemoveTimerRef.current = null;
      }, 1000);
    }, 4000);
  }

  return (
    <section className={`grid ${panelLayoutClassName} gap-2 rounded-[4px] border border-[#1b1c1a] bg-[#373936] p-2`}>

      <div className="grid grid-cols-[minmax(260px,320px)_minmax(0,1fr)] gap-2">
        <div className="grid grid-rows-2 rounded-[4px] border border-[#1b1c1a] bg-[#2b2d2a]">
          <DeviceField
            className="border-r-0 border-b last:border-b-0"
            inline
            label="Status"
            value={
              <SshAccessControls
                device={device}
                isClearingSshKeys={isClearingSshKeys}
                isConnectingSsh={isConnectingSsh}
                onConnectSsh={onConnectSsh}
                onRequestClearSshKeys={onRequestClearSshKeys}
                setupMode={setupMode}
                shouldShowSshSetup={shouldShowSshSetup}
              />
            }
          />
          <DeviceField className="border-r-0 border-b last:border-b-0" inline label="IP Address" value={device.ipAddress || device.hostname || "unknown"} />
        </div>

        {shouldShowSshSetup ? (
          <SshSetupHelpPanel state={sshSetupHelpState} />
        ) : isSshReady ? (
          <div
            className="relative grid cursor-copy grid-cols-4 rounded-[4px] border border-[#1b1c1a] bg-[#2b2d2a] transition hover:bg-[#343633]"
            onClick={copyVersionInfo}
            title="Click to copy version info"
          >
            <DeviceField label="Push" value={deviceInfo?.pushSoftwareVersion || "Not collected"} />
            <DeviceField label="Firmware" value={deviceInfo?.firmwareVersion || "Not collected"} />
            <DeviceField label="Live" value={deviceInfo?.liveVersion || "Not collected"} />
            <DeviceField label="Ableton OS" value={deviceInfo?.abletonOsVersion || "Not collected"} />
            {shouldRenderVersionInfoCopied ? (
              <span
                className={`absolute right-2 top-1 rounded-[4px] border border-[#1b1c1a] bg-[#b0ddeb] px-2 py-0.5 text-[11px] font-bold text-[#111111] shadow-lg transition-opacity duration-1000 ${
                  isVersionInfoCopiedVisible ? "opacity-100" : "opacity-0"
                }`}
              >
                Copied
              </span>
            ) : null}
          </div>
        ) : (
          <VersionInfoPlaceholder />
        )}
      </div>

      {isSshReady && !shouldShowSshSetup ? (
        <>
          <InstallAppDropZone isInstalling={isInstallingAppArchive} onInstall={onInstallAppArchive} />
          <InstalledAppsTable
            apps={installedApps}
            collectingLogsAppId={collectingLogsAppId}
            errorMessage={installedAppsErrorMessage}
            isLoading={isLoadingInstalledApps}
            onCollectLogs={onCollectLogs}
            onRefresh={onRefreshInstalledApps}
            onUninstallApp={onUninstallApp}
            uninstallingAppId={uninstallingAppId}
          />
        </>
      ) : null}

      {shouldShowSshSetupTutorial ? (
        <SshConnectionWorkflowTutorialDialog
          doNotShowAgain={isSshSetupTutorialAccepted}
          onDoNotShowAgainChange={setIsSshSetupTutorialAccepted}
          onOk={handleSshSetupTutorialOk}
        />
      ) : null}
      {shouldRenderSshSetupFrame ? <SshSetupFrame device={device} key={device.id} mode={setupMode || "auto"} onCancel={onCancelSshSetup} onClose={onCloseSshSetup} onComplete={onCompleteSshSetup} onLogEvent={onSshSetupEvent} onStateChange={setSshSetupHelpState} /> : null}
    </section>
  );
}

function SshConnectionWorkflowTutorialDialog({
  doNotShowAgain,
  onDoNotShowAgainChange,
  onOk
}: {
  doNotShowAgain: boolean;
  onDoNotShowAgainChange: (doNotShowAgain: boolean) => void;
  onOk: () => Promise<void>;
}) {
  const [isSaving, setIsSaving] = useState(false);

  async function confirmTutorial() {
    setIsSaving(true);

    try {
      await onOk();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#10110f]/70 px-4">
      <section aria-modal="true" className="w-[min(460px,calc(100vw-32px))] rounded-[4px] border border-[#1b1c1a] bg-[#373936] p-3 shadow-xl" role="dialog">
        <h3 className="text-xs font-bold uppercase text-[#eeeeea]">SSH connection setup</h3>
        <div className="mt-2 space-y-2 text-xs leading-5 text-[#d8d8d2]">
          <p>Tiny Push Utility will guide you through connecting this Push over SSH.</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>The utility opens Push's SSH setup page.</li>
            <li>If Push shows a code, enter that code in Tiny Push Utility.</li>
            <li>Before the key is submitted, the utility will show which Push buttons to hold.</li>
          </ol>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#eeeeea]">
          <input
            checked={doNotShowAgain}
            className="h-3.5 w-3.5 accent-[#b0ddeb]"
            disabled={isSaving}
            onChange={(event) => onDoNotShowAgainChange(event.currentTarget.checked)}
            type="checkbox"
          />
          Don&apos;t show again
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <Button disabled={isSaving} onClick={confirmTutorial} type="button" variant="compact">
            Ok
          </Button>
        </div>
      </section>
    </div>
  );
}

function VersionInfoPlaceholder() {
  return <div className="grid grid-cols-4 rounded-[4px] border border-[#1b1c1a] bg-[#2b2d2a]" />;
}

function SshSetupHelpPanel({ state }: { state: SshSetupHelpState }) {
  const message = SSH_SETUP_HELP_MESSAGES[state];

  return (
    <section className="grid min-h-[58px] content-center rounded-[4px] border border-[#1b1c1a] bg-[#2b2d2a] px-2 py-1.5">
      <h3 className="text-[11px] font-bold uppercase text-[#a5a7a1]">Setup Help</h3>
      <p className="mt-1 text-xs font-semibold leading-5 text-[#eeeeea]">{message}</p>
    </section>
  );
}

const SSH_SETUP_HELP_MESSAGES: Record<SshSetupHelpState, string> = {
  preparing: "Preparing the Push SSH setup page...",
  ready: "Preparing SSH key setup. Tiny Push Utility will add the public key automatically when the page is ready.",
  automating: "Adding the Tiny Push Utility SSH key. Be ready to confirm on Push when prompted.",
  "code-required": "Enter the numbers shown on the Push display in the side prompt.",
  confirming: "Press and hold 'Select', 'Shift', and 'Settings' buttons until the page says 'Success'.",
  verifying: "Push is checking the SSH key. Leave this page open while verification completes.",
  failure: "Push did not accept the SSH key. Review the message on the setup page and try again, or close this panel manually.",
  success: "SSH key added. Retrying the SSH connection..."
};


function SshAccessControls({
  device,
  isClearingSshKeys,
  isConnectingSsh,
  onConnectSsh,
  onRequestClearSshKeys,
  setupMode,
  shouldShowSshSetup
}: {
  device: PushDevice;
  isClearingSshKeys: boolean;
  isConnectingSsh: boolean;
  onConnectSsh: (device: PushDevice, mode: SshSetupMode) => void;
  onRequestClearSshKeys: (device: PushDevice) => void;
  setupMode: SshSetupMode | null;
  shouldShowSshSetup: boolean;
}) {
  const isSshReady = isSshReadyDevice(device);
  const isCheckingSsh = device.sshStatus === "checking";
  const shouldShowBadge = !shouldShowSshSetup && (isSshReady || isCheckingSsh);
  const shouldShowClearKeys = isSshReady;
  const shouldShowConnectModes = !isSshReady && !isCheckingSsh;

  return (
    <span className="flex w-full min-w-0 flex-nowrap items-center gap-1.5 whitespace-nowrap">
      {shouldShowBadge ? <SshAbilityBadge device={device} /> : null}
      {shouldShowConnectModes ? (
        <Button className="!h-auto !whitespace-nowrap !py-0.5 !leading-none hover:!border-[#38512d] hover:!bg-[#5f7d4f] hover:!text-[#f0f4ec]" disabled={isConnectingSsh || shouldShowSshSetup} onClick={() => onConnectSsh(device, "auto")} type="button" variant="compact">
          {isConnectingSsh && setupMode === "auto" ? "Connecting" : "Connect"}
        </Button>
      ) : null}
      {shouldShowClearKeys ? (
        <Button
          className="ml-auto !h-auto !whitespace-nowrap !border-0 !py-0.5 !leading-none hover:!bg-[#d99b98] hover:!text-[#2b1110]"
          disabled={isConnectingSsh || isClearingSshKeys}
          onClick={() => onRequestClearSshKeys(device)}
          title="Clear saved SSH keys from this Push"
          type="button"
          variant="compact"
        >
          {isClearingSshKeys ? "Clearing" : "Clear Keys"}
        </Button>
      ) : null}
    </span>
  );
}
function InstalledAppsTable({
  apps,
  collectingLogsAppId,
  errorMessage,
  isLoading,
  onCollectLogs,
  onRefresh,
  onUninstallApp,
  uninstallingAppId
}: {
  apps: TinySoundInstalledApp[];
  collectingLogsAppId: string | null;
  errorMessage: string | null;
  isLoading: boolean;
  onCollectLogs: (installedApp: TinySoundInstalledApp) => void;
  onRefresh: () => void;
  onUninstallApp: (installedApp: TinySoundInstalledApp) => void;
  uninstallingAppId: string | null;
}) {
  const [pendingUninstallApp, setPendingUninstallApp] = useState<TinySoundInstalledApp | null>(null);

  function requestUninstall(installedApp: TinySoundInstalledApp) {
    setPendingUninstallApp(installedApp);
  }

  function confirmUninstall() {
    if (!pendingUninstallApp) {
      return;
    }

    onUninstallApp(pendingUninstallApp);
    setPendingUninstallApp(null);
  }
  return (
    <section className="grid min-w-0 max-w-full grid-rows-[auto_auto] overflow-hidden rounded-[4px] border border-[#1b1c1a] bg-[#2b2d2a]">
      <div className="flex h-8 items-center justify-between border-b border-[#1b1c1a] bg-[#3e403d] px-2">
        <h3 className="text-xs font-bold uppercase text-[#eeeeea]">Apps</h3>
        <Button className="!h-[21px] !gap-1 !px-1 !text-[10px] !leading-none" disabled={isLoading} onClick={onRefresh} type="button" variant="compact">
          <RefreshCw className={`!h-2.5 !w-2.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      <div className="min-w-0 overflow-hidden">
        {isLoading ? <p className="p-2 text-xs text-[#a5a7a1]">Checking installed apps...</p> : null}
        {!isLoading && errorMessage ? <p className="p-2 text-xs font-bold text-[#ff6b5f]">{errorMessage}</p> : null}
        {!isLoading && !errorMessage && apps.length === 0 ? (
          <p className="p-2 text-xs text-[#a5a7a1]">no apps are installed on this device.</p>
        ) : null}
        {!isLoading && !errorMessage && apps.length > 0 ? (
          <div className="max-h-[150px] overflow-y-auto overflow-x-hidden">
            {apps.map((installedApp) => {
              const isCollectLogsDisabled = collectingLogsAppId === installedApp.id || !installedApp.hasLogFiles;
              const isUninstalling = uninstallingAppId === installedApp.id;
              const canUninstall = installedApp.versionFolders.length > 0;

              return (
                <div
                  className="relative grid h-[30px] w-full min-w-0 grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_88px_minmax(8px,1fr)] items-stretch gap-2 border-b border-[#262826] bg-[#343633] pl-2 pr-[73px] text-left text-xs text-[#eeeeea] transition last:border-b-0"
                  key={installedApp.id}
                  title={`${installedApp.name} ${formatInstalledAppVersions(installedApp.versionFolders)}`}
                >
                  <span className="self-center truncate font-bold">{installedApp.name}</span>
                  <span className="self-center truncate text-[11px] font-semibold text-[#bdbfb8]">{formatInstalledAppVersions(installedApp.versionFolders)}</span>
                  <Button
                    className="my-0.5 w-[88px] whitespace-nowrap !h-[26px] !border-0 !px-1"
                    disabled={isCollectLogsDisabled}
                    onClick={() => onCollectLogs(installedApp)}
                    title={installedApp.hasLogFiles ? "Collect logs" : "No log files available"}
                    type="button"
                    variant="compact"
                  >
                    {collectingLogsAppId === installedApp.id ? "Collecting" : "Collect Logs"}
                  </Button>
                  <Button
                    className="absolute -right-px top-0 h-full w-[73px] whitespace-nowrap rounded-r-none !border-0 !px-1 hover:!bg-[#d99b98] hover:!text-[#2b1110]"
                    disabled={!canUninstall || isUninstalling}
                    onClick={() => requestUninstall(installedApp)}
                    title={canUninstall ? "Uninstall app" : "No version folder available"}
                    type="button"
                    variant="compact"
                  >
                    {isUninstalling ? "Removing" : "Uninstall"}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      {pendingUninstallApp ? (
        <UninstallConfirmDialog
          installedApp={pendingUninstallApp}
          isUninstalling={uninstallingAppId === pendingUninstallApp.id}
          onCancel={() => setPendingUninstallApp(null)}
          onConfirm={confirmUninstall}
        />
      ) : null}
    </section>
  );
}

function UninstallConfirmDialog({
  installedApp,
  isUninstalling,
  onCancel,
  onConfirm
}: {
  installedApp: TinySoundInstalledApp;
  isUninstalling: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || isUninstalling) {
        return;
      }

      event.preventDefault();
      onCancel();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isUninstalling, onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#10110f]/70 px-4">
      <section aria-modal="true" className="w-[min(360px,calc(100vw-32px))] rounded-[4px] border border-[#1b1c1a] bg-[#373936] p-3 shadow-xl" role="dialog">
        <h3 className="text-xs font-bold uppercase text-[#eeeeea]">Uninstall app?</h3>
        <p className="mt-2 text-xs leading-5 text-[#d8d8d2]">
          Remove <span className="font-bold text-[#eeeeea]">{installedApp.name}</span> {formatInstalledAppVersions(installedApp.versionFolders)} from this Push?
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button disabled={isUninstalling} onClick={onConfirm} type="button" variant="compact">
            {isUninstalling ? "Removing" : "Yes"}
          </Button>
          <Button disabled={isUninstalling} onClick={onCancel} type="button" variant="compact">
            No
          </Button>
        </div>
      </section>
    </div>
  );
}

function formatInstalledAppVersions(versionFolders: string[]) {
  return versionFolders.length > 0 ? versionFolders.join(", ") : "unknown";
}

function InstallAppDropZone({ isInstalling, onInstall }: { isInstalling: boolean; onInstall: (archiveFile: File) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingArchive, setIsDraggingArchive] = useState(false);
  const [acceptedArchive, setAcceptedArchive] = useState<InstallArchiveSelection | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = isInstalling ? "none" : "copy";
    if (isInstalling) {
      return;
    }

    setIsDraggingArchive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingArchive(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingArchive(false);
    if (isInstalling) {
      return;
    }

    acceptFiles(Array.from(event.dataTransfer.files));
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }

  async function acceptFiles(files: File[]) {
    if (files.length !== 1) {
      setAcceptedArchive(null);
      setErrorMessage("Add one app archive at a time.");
      return;
    }

    const archive = validateInstallArchive(files[0]);

    if (!archive) {
      setAcceptedArchive(null);
      setErrorMessage("Use <app name>-<version>.tar.gz.");
      return;
    }

    setAcceptedArchive(archive);
    setErrorMessage(null);

    try {
      await onInstall(archive.file);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <section className="grid min-w-0 max-w-full grid-cols-[104px_minmax(0,1fr)] items-start gap-2 overflow-hidden rounded-[4px] border border-[#1b1c1a] bg-[#2b2d2a] p-2">
      <Button className="min-h-20 w-full justify-center" disabled={isInstalling} onClick={() => inputRef.current?.click()} type="button" variant="compact">
        <Upload className="h-3.5 w-3.5" />
        {isInstalling ? "Installing" : "Install"}
      </Button>
      <div className="min-w-0">
        <div
          className={`grid min-h-20 place-items-center rounded-[4px] border border-dashed px-3 py-3 text-center text-xs font-bold transition ${
            isDraggingArchive ? "border-[#b0ddeb] bg-[#435248] text-[#eeeeea]" : "border-[#6b6d68] bg-[#343633] text-[#8f918b]"
          }`}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {isInstalling ? "Installing app archive" : "Drop app archive (*.tar.gz file)"}
        </div>
        {acceptedArchive ? (
          <p className="mt-1 truncate text-[11px] font-bold text-[#b0ddeb]" title={acceptedArchive.fileName}>
            {acceptedArchive.appName} {acceptedArchive.version}
          </p>
        ) : null}
        {errorMessage ? <p className="mt-1 text-xs font-bold text-[#ff6b5f]">{errorMessage}</p> : null}
        <input accept=".tar.gz,application/gzip,application/x-gzip" className="hidden" disabled={isInstalling} onChange={handleInputChange} ref={inputRef} type="file" />
      </div>
    </section>
  );
}

type InstallArchiveSelection = {
  appName: string;
  file: File;
  fileName: string;
  version: string;
};

function validateInstallArchive(file: File | null): InstallArchiveSelection | null {
  if (!file) {
    return null;
  }

  const match = file.name.match(/^([A-Za-z0-9][A-Za-z0-9_-]*)-([A-Za-z0-9][A-Za-z0-9._+-]*)\.tar\.gz$/);
  if (!match) {
    return null;
  }

  return {
    appName: match[1].trim(),
    file,
    fileName: file.name,
    version: match[2]
  };
}

function isSshReadyDevice(device: PushDevice) {
  return device.connectionState === "ssh-ready" || device.sshStatus === "available" || device.sshAvailable === true;
}

function hasTriedSshConnection(device: PushDevice) {
  return Boolean(device.sshCheckedAt) || device.sshStatus === "available" || device.sshStatus === "unavailable" || device.sshAvailable !== undefined;
}

function hasFailedSshConnection(device: PushDevice) {
  return device.sshStatus === "unavailable" || device.sshAvailable === false;
}

function SshSetupFrame({
  device,
  mode,
  onCancel,
  onClose,
  onComplete,
  onLogEvent,
  onStateChange
}: {
  device: PushDevice;
  mode: SshSetupMode;
  onCancel: () => void;
  onClose: () => void;
  onComplete: () => void;
  onLogEvent: (kind: AppEventKind, message: string, details?: string) => void;
  onStateChange: (state: SshSetupHelpState) => void;
}) {
  const setupHost = getSshSetupHost(device);
  const setupStoreKey = getPushCookieStoreKey(device);
  const setupUrl = getSshSetupUrl(setupHost);
  const submitAttemptStorageKey = `ssh-setup-submit-attempts:${setupStoreKey}`;
  const webviewRef = useRef<HTMLElement | null>(null);
  const publicKeyRef = useRef<string | null>(null);
  const hasQueuedAutoSubmitRef = useRef(false);
  const isCompletingSetupRef = useRef(false);
  const isPairingCodeVisibleRef = useRef(false);
  const latestSetupPathRef = useRef<string | null>(null);
  const submitAttemptTimestampsRef = useRef<number[]>([]);
  const loggedMilestonesRef = useRef<Set<string>>(new Set());
  const submitPromptRef = useRef<"initial" | "warning" | null>(null);
  const [webviewUrl, setWebviewUrl] = useState<string | null>(null);
  const [webviewPreloadUrl, setWebviewPreloadUrl] = useState<string | null>(null);
  const [submitPrompt, setSubmitPrompt] = useState<"initial" | "warning" | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [isPairingCodeVisible, setIsPairingCodeVisible] = useState(false);
  const [pairingCodeMessage, setPairingCodeMessage] = useState<string | null>(null);
  const [automationFailureReason, setAutomationFailureReason] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setWebviewUrl(null);
    setWebviewPreloadUrl(null);
    setSubmitPromptState(null);
    setPairingCode("");
    setPairingCodeVisible(false);
    setPairingCodeMessage(null);
    setAutomationFailureReason(null);
    hasQueuedAutoSubmitRef.current = false;
    isCompletingSetupRef.current = false;
    latestSetupPathRef.current = null;
    publicKeyRef.current = null;
    loggedMilestonesRef.current.clear();
    submitAttemptTimestampsRef.current = readStoredSubmitAttempts(submitAttemptStorageKey);
    onStateChange("preparing");
    logSetupMilestone("info", `${formatSshSetupMode(mode)} SSH setup started for ${device.displayName}.`, undefined, "setup-started");

    window.tinyPush.ssh
      .getSetupWebviewPreloadUrl()
      .then((preloadUrl) => {
        if (isMounted) {
          setWebviewPreloadUrl(preloadUrl);
        }
      })
      .catch(() => {});

    if (mode === "auto") {
      window.tinyPush.ssh
        .getKeyStatus()
        .then((status) => {
          if (isMounted) {
            publicKeyRef.current = status.publicKey?.trim() || null;
          }
        })
        .catch((error: Error) => {
          if (isMounted) {
            setAutomationFailureReason(error.message);
            onStateChange("failure");
          }
        });
    }

    window.tinyPush.pushCookies
      .prime(setupHost, setupStoreKey)
      .catch(() => {})
      .finally(() => {
        if (isMounted) {
          setWebviewUrl(setupUrl);
          if (mode === "manual") {
            logSetupMilestone("info", "Manual SSH setup page is ready. Paste the copied key and submit it.", undefined, "manual-ready");
          }
          onStateChange("ready");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [mode, setupHost, setupStoreKey, setupUrl]);

  useEffect(() => {
    const webview = webviewRef.current;

    if (!webview) {
      return;
    }

    function handleLoad() {
      persistCurrentCookies();
      maybeQueueAutoSubmit();
    }

    function handleIpcMessage(event: Event) {
      const webviewEvent = event as Event & { channel?: string; args?: Array<{ pathname?: string; reason?: string; state?: SshSetupHelpState; wrongCodeText?: string | null }> };
      const payload = webviewEvent.args?.[0];
      if (payload?.pathname) {
        latestSetupPathRef.current = payload.pathname;
      }

      if (webviewEvent.channel === "ssh-setup:loaded" || webviewEvent.channel === "ssh-setup:dom-ready" || webviewEvent.channel === "ssh-setup:automation-ready") {
        persistCurrentCookies();
        if (webviewEvent.channel === "ssh-setup:automation-ready") {
          setPairingCodeVisible(false);
          setPairingCodeMessage(null);
        }
        if (mode === "auto") {
          maybeQueueAutoSubmit();
        } else {
          logSetupMilestone("info", "Manual SSH setup page is ready. Paste the copied key and submit it.", undefined, "manual-ready");
          onStateChange("ready");
        }
        return;
      }

      if (webviewEvent.channel === "ssh-setup:automation-started") {
        setAutomationFailureReason(null);
        logSetupMilestone("info", "Automated SSH setup is adding the public key.", undefined, "automation-started");
        onStateChange("automating");
        return;
      }

      if (webviewEvent.channel === "ssh-setup:public-key-submitted") {
        recordSubmitAttempt();
        logSetupMilestone("info", "SSH key submitted. Confirm on Push by holding Select, Shift, and Settings.", undefined, "public-key-submitted");
        logSetupMilestone("hint", "Hold Select, Shift, and Settings on Push to save the SSH key.", undefined, "manual-confirmation");
        onStateChange("confirming");
        return;
      }

      if (webviewEvent.channel === "ssh-setup:code-required") {
        persistCurrentCookies();
        setSubmitPromptState(null);
        setPairingCodeVisible(true);
        setPairingCodeMessage(payload?.wrongCodeText || null);
        logSetupMilestone("hint", "Push is asking for the display code.", undefined, "code-required");
        onStateChange("code-required");
        return;
      }

      if (webviewEvent.channel === "ssh-setup:code-submitted") {
        setPairingCodeVisible(false);
        setPairingCodeMessage(null);
        logSetupMilestone("info", "Push display code submitted.", undefined, "code-submitted");
        onStateChange("verifying");
        return;
      }

      if (webviewEvent.channel === "ssh-setup:manual-confirmation-required") {
        logSetupMilestone("hint", "Hold Select, Shift, and Settings on Push to save the SSH key.", undefined, "manual-confirmation");
        onStateChange("confirming");
        return;
      }

      if (webviewEvent.channel === "ssh-setup:automation-failed") {
        const failureReason = webviewEvent.args?.[0]?.reason || "Automation failed.";
        setAutomationFailureReason(failureReason);
        logSetupMilestone("error", "Automated SSH setup failed.", failureReason, "automation-failed");
        onStateChange("failure");
        return;
      }

      if (webviewEvent.channel === "ssh-setup:state-changed") {
        const nextState = webviewEvent.args?.[0]?.state;
        if (nextState === "ready" || nextState === "confirming" || nextState === "verifying" || nextState === "failure" || nextState === "success") {
          onStateChange(nextState);
        }
        return;
      }

      if (webviewEvent.channel !== "ssh-setup:success-candidate") {
        return;
      }

      isCompletingSetupRef.current = true;
      setSubmitPromptState(null);
      setPairingCodeVisible(false);
      logSetupMilestone("success", "Push reported the SSH key was added successfully.", undefined, "success");
      onStateChange("success");
      window.sessionStorage.removeItem(submitAttemptStorageKey);
      persistCurrentCookies().finally(() => window.setTimeout(completeFrame, 1800));
    }

    function handleNavigate(event: Event) {
      const navigationEvent = event as Event & { url?: string };
      latestSetupPathRef.current = getPathnameFromUrl(navigationEvent.url);
    }

    webview.addEventListener("did-finish-load", handleLoad);
    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate);
    webview.addEventListener("ipc-message", handleIpcMessage);

    return () => {
      webview.removeEventListener("did-finish-load", handleLoad);
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate);
      webview.removeEventListener("ipc-message", handleIpcMessage);
    };
  }, [mode, webviewUrl]);


  function logSetupMilestone(kind: AppEventKind, message: string, details?: string, key = message) {
    const milestoneKey = `${mode}:${key}`;
    if (loggedMilestonesRef.current.has(milestoneKey)) {
      return;
    }

    loggedMilestonesRef.current.add(milestoneKey);
    onLogEvent(kind, message, details);
  }
  async function persistCurrentCookies() {
    try {
      await window.tinyPush.pushCookies.persist(setupHost, setupStoreKey);
    } catch {
      // The setup page is allowed to be transient while Push applies changes.
    }
  }

  function maybeQueueAutoSubmit() {
    if (mode !== "auto" || isCompletingSetupRef.current || hasQueuedAutoSubmitRef.current || isPairingCodeVisibleRef.current || submitPromptRef.current || latestSetupPathRef.current === "/pair") {
      return;
    }

    const publicKey = publicKeyRef.current;
    if (!publicKey) {
      setAutomationFailureReason("Public SSH key is not available.");
      onStateChange("failure");
      return;
    }

    const promptKind = getRecentSubmitAttempts().length >= 5 ? "warning" : "initial";
    if (promptKind === "warning") {
      logSetupMilestone("warning", "Push may reject SSH setup requests after repeated failed attempts. Restart Push if setup keeps failing.", undefined, "attempt-warning");
    } else {
      logSetupMilestone("hint", "Review the Push button-hold instructions before submitting the SSH key.", undefined, "pre-submit-prompt");
    }
    setSubmitPromptState(promptKind);
  }

  function getRecentSubmitAttempts() {
    const cutoff = Date.now() - 3 * 60 * 1000;
    submitAttemptTimestampsRef.current = submitAttemptTimestampsRef.current.filter((timestamp) => timestamp >= cutoff);
    writeStoredSubmitAttempts(submitAttemptStorageKey, submitAttemptTimestampsRef.current);
    return submitAttemptTimestampsRef.current;
  }

  function recordSubmitAttempt() {
    submitAttemptTimestampsRef.current = [...getRecentSubmitAttempts(), Date.now()];
    writeStoredSubmitAttempts(submitAttemptStorageKey, submitAttemptTimestampsRef.current);
  }

  function confirmAutoSubmit() {
    const webview = webviewRef.current as (HTMLElement & { send?: (channel: string, ...args: unknown[]) => void }) | null;
    const publicKey = publicKeyRef.current;

    if (!webview?.send || !publicKey) {
      setAutomationFailureReason("The Push setup page is not ready for automation.");
      onStateChange("failure");
      setSubmitPromptState(null);
      return;
    }

    hasQueuedAutoSubmitRef.current = true;
    setSubmitPromptState(null);
    logSetupMilestone("info", "Starting automated SSH key submission.", undefined, "auto-submit-confirmed");
    onStateChange("automating");
    webview.send("ssh-setup:provide-public-key", publicKey);
  }

  function submitPairingCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const webview = webviewRef.current as (HTMLElement & { send?: (channel: string, ...args: unknown[]) => void }) | null;
    const code = pairingCode.trim();

    if (!webview?.send || !code) {
      return;
    }

    logSetupMilestone("info", "Submitting Push display code.", undefined, "code-submit-requested");
    webview.send("ssh-setup:provide-code", code);
    setPairingCode("");
    setPairingCodeMessage(null);
    setPairingCodeVisible(false);
    onStateChange("verifying");
  }

  function setSubmitPromptState(nextPrompt: "initial" | "warning" | null) {
    submitPromptRef.current = nextPrompt;
    setSubmitPrompt(nextPrompt);
  }

  function setPairingCodeVisible(nextIsVisible: boolean) {
    isPairingCodeVisibleRef.current = nextIsVisible;
    setIsPairingCodeVisible(nextIsVisible);
  }

  function reloadFrame() {
    setWebviewUrl(null);
    onClose();
  }

  function completeFrame() {
    setWebviewUrl(null);
    onComplete();
  }

  function cancelFrame() {
    setWebviewUrl(null);
    onCancel();
  }

  return (
    <section className={`relative grid h-full min-h-0 overflow-hidden ${automationFailureReason ? "grid-rows-[auto_auto_minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)]"} rounded-[4px] border border-[#1b1c1a] bg-[#2b2d2a]`}>
      <div className="flex h-7 items-center justify-between border-b border-[#1b1c1a] bg-[#3e403d] px-2">
        <span className="truncate text-[11px] text-[#a5a7a1]">{setupUrl}</span>
        <div className="ml-2 flex shrink-0 items-center gap-1">
          <button
            aria-label="Reload SSH setup page and retry connection"
            className="grid h-5 w-5 shrink-0 place-items-center rounded-[4px] border border-[#1b1c1a] bg-[#444642] text-[#eeeeea] transition hover:bg-[#51534f]"
            onClick={reloadFrame}
            title="Reload and retry"
            type="button"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <Button className="!h-5 !px-2 !py-0 !text-[10px] !leading-none" onClick={cancelFrame} type="button" variant="compact">
            Cancel
          </Button>
        </div>
      </div>
      {automationFailureReason ? <p className="border-b border-[#1b1c1a] bg-[#4a2927] px-2 py-1 text-xs font-bold text-[#ffd8d5]">{automationFailureReason}</p> : null}
      <div className="relative grid min-h-0">
        {webviewUrl && webviewPreloadUrl ? (
          <webview
            className="h-full min-h-0 w-full bg-[#eeeeea]"
            preload={webviewPreloadUrl}
            ref={webviewRef}
            src={webviewUrl}
            title="Push SSH key setup page"
          />
        ) : (
          <div className="grid h-full min-h-0 place-items-center text-xs text-[#a5a7a1]">Preparing Push session...</div>
        )}
        {isPairingCodeVisible ? <PairingCodePrompt code={pairingCode} message={pairingCodeMessage} onCodeChange={setPairingCode} onSubmit={submitPairingCode} /> : null}
      </div>
      {submitPrompt ? <PushButtonHoldDialog kind={submitPrompt} onCancel={cancelFrame} onConfirm={confirmAutoSubmit} /> : null}
    </section>
  );
}

function formatSshSetupMode(mode: SshSetupMode) {
  return mode === "auto" ? "Automated" : "Manual";
}
function readStoredSubmitAttempts(storageKey: string) {
  try {
    const parsedValue = JSON.parse(window.sessionStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsedValue) ? parsedValue.filter((value) => typeof value === "number") : [];
  } catch {
    return [];
  }
}

function writeStoredSubmitAttempts(storageKey: string, timestamps: number[]) {
  window.sessionStorage.setItem(storageKey, JSON.stringify(timestamps));
}
function PushButtonHoldDialog({ kind, onCancel, onConfirm }: { kind: "initial" | "warning"; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#10110f]/75 px-4">
      <section className="w-[min(520px,calc(100vw-48px))] rounded-[4px] border border-[#1b1c1a] bg-[#373936] p-3 shadow-xl">
        <h3 className="text-xs font-bold uppercase text-[#eeeeea]">Confirm on Push</h3>
        <p className="mt-2 text-xs leading-5 text-[#d8d8d2]">
          After the SSH key is submitted, press and hold <span className="font-bold text-[#eeeeea]">Select</span>, <span className="font-bold text-[#eeeeea]">Shift</span>, and <span className="font-bold text-[#eeeeea]">Settings</span> on Push until the page reports Success. 
        </p>
        {kind === "warning" ? (
          <p className="mt-2 rounded-[4px] border border-[#8f423e] bg-[#4a2927] px-2 py-1.5 text-xs font-bold leading-5 text-[#ffd8d5]">
            Push may start rejecting requests after frequent failed attempts. Restart Push if setup keeps failing, then try again and complete the button hold.
          </p>
        ) : null}
        <img alt="Push buttons to hold for SSH pairing" className="mt-3 max-h-[260px] w-full rounded-[4px] border border-[#1b1c1a] object-contain" src={pushSshPairDiagramUrl} />
        <p>If it fails, you can re-attempt by clicking the <span className="font-bold text-[#eeeeea]">Add SSH Key</span> button and then holding the key combo.</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button className="hover:!border-[#8f423e] hover:!bg-[#d99b98] hover:!text-[#2b1110]" onClick={onCancel} type="button" variant="compact">
            Cancel
          </Button>
          <Button className="hover:!border-[#38512d] hover:!bg-[#5f7d4f] hover:!text-[#f0f4ec]" onClick={onConfirm} type="button" variant="compact">
            Start Pairing
          </Button>
        </div>
      </section>
    </div>
  );
}

function PairingCodePrompt({ code, message, onCodeChange, onSubmit }: { code: string; message: string | null; onCodeChange: (code: string) => void; onSubmit: (event?: FormEvent<HTMLFormElement>) => void }) {
  const isCodeComplete = /^\d{6}$/.test(code);

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#10110f]/75 px-4">
      <form className="grid w-[min(360px,calc(100vw-48px))] gap-2 rounded-[4px] border border-[#1b1c1a] bg-[#373936] p-3 shadow-xl" onSubmit={onSubmit}>
        <h3 className="text-xs font-bold uppercase text-[#eeeeea]">Enter Push Code</h3>
        <p className="text-xs font-semibold leading-5 text-[#d8d8d2]">Enter the numbers shown on the Push display to continue SSH setup.</p>
        <label className="grid gap-1 text-[11px] font-bold uppercase text-[#a5a7a1]">
          Push code
          <input
            autoFocus
            className="h-8 w-full rounded-[4px] border border-[#1b1c1a] bg-[#202120] px-2 text-sm font-bold text-[#eeeeea] outline-none focus:border-[#b0ddeb]"
            inputMode="numeric"
            onChange={(event) => onCodeChange(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
            pattern="[0-9]{6}"
            value={code}
          />
        </label>
        {message ? <p className="rounded-[4px] border border-[#8f423e] bg-[#4a2927] px-2 py-1.5 text-xs font-bold leading-5 text-[#ffd8d5]">{message}</p> : null}
        <Button className="justify-center" disabled={!isCodeComplete} type="submit" variant="compact">
          Submit Code
        </Button>
      </form>
    </div>
  );
}
function getPathnameFromUrl(url?: string) {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}
function getSshSetupHost(device: PushDevice) {
  return device.hostname || device.ipAddress || device.displayName;
}

function getPushCookieStoreKey(device: PushDevice) {
  return device.ipAddress || device.hostname || device.displayName;
}

function getSshSetupUrl(host: string) {
  return `http://${host}/ssh`;
}

function DeviceField({ className = "", inline = false, label, value }: { className?: string; inline?: boolean; label: string; value: ReactNode }) {
  const layoutClassName = inline ? "grid grid-cols-[74px_minmax(0,1fr)] items-center gap-2" : "flex flex-col justify-center";
  const valueClassName = inline ? "min-w-0 whitespace-nowrap" : "mt-1 truncate";

  return (
    <div className={`min-h-0 ${layoutClassName} border-r border-[#1b1c1a] px-2 py-1.5 last:border-r-0 ${className}`}>
      <p className="whitespace-nowrap text-[11px] font-bold uppercase text-[#a5a7a1]">{label}</p>
      <div className={`${valueClassName} text-xs font-bold text-[#eeeeea]`} title={typeof value === "string" ? value : undefined}>
        {value}
      </div>
    </div>
  );
}
