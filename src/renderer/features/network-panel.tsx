import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Badge } from "../components/badge";
import { Button } from "../components/button";
import type { SshPublicKeyCopyState } from "./device-detail-panel";
import type { LocalNetwork, PushDevice, SshKeyStatus } from "../types";

type NetworkPanelProps = {
  deviceDisplayName: string;
  isDetectingDevices: boolean;
  isCreatingKey: boolean;
  isSshSetupActive: boolean;
  keyStatus: SshKeyStatus | null;
  localNetwork: LocalNetwork | null;
  onCopyPublicKey: () => Promise<boolean>;
  onDetectDevices: () => void;
  onCreateKey: () => void;
  onRotateKey: () => void;
  onSelectDevice: (deviceId: string) => void;
  selectedDeviceId: string | null;
  sshPublicKeyCopyState: SshPublicKeyCopyState;
  visibleDevices: PushDevice[];
};

export function NetworkPanel({
  deviceDisplayName,
  isDetectingDevices,
  isCreatingKey,
  isSshSetupActive,
  keyStatus,
  localNetwork,
  onCopyPublicKey,
  onDetectDevices,
  onCreateKey,
  onRotateKey,
  onSelectDevice,
  selectedDeviceId,
  sshPublicKeyCopyState,
  visibleDevices
}: NetworkPanelProps) {
  return (
    <section className="grid h-[72px] min-h-0 grid-cols-[auto_auto_auto_minmax(0,1fr)] items-stretch gap-2 rounded-[4px] bg-[#373936] p-2">
      <SshKeyPanel isCreatingKey={isCreatingKey} isSshSetupActive={isSshSetupActive} keyStatus={keyStatus} onCopyPublicKey={onCopyPublicKey} onCreateKey={onCreateKey} onRotateKey={onRotateKey} sshPublicKeyCopyState={sshPublicKeyCopyState} />
      <Badge className="min-w-0 flex-col items-start justify-center gap-0.5 px-2 py-1.5 text-left normal-case" title={formatNetworkTitle(localNetwork)} variant="muted">
        <span className="w-full truncate text-xs font-semibold leading-4">{formatNetworkName(localNetwork)}</span>
        <span className="w-full truncate text-[11px] font-medium leading-4 text-[#a5a7a1]">{formatNetworkIpAddress(localNetwork)}</span>
      </Badge>

      <section className="flex min-w-0 items-stretch justify-start">
        <Button className="!h-full !w-[154px] whitespace-nowrap !border-0" disabled={isDetectingDevices} onClick={onDetectDevices} type="button" variant="compact">
          <RefreshCw className={`h-4 w-4 ${isDetectingDevices ? "animate-spin" : ""}`} />
          {isDetectingDevices ? "Detecting" : "Detect Devices"}
        </Button>
      </section>

      <section className="flex min-h-0 min-w-0 items-stretch justify-start ml-2 border-l border-[#1b1c1a] pl-2.5">
        <div className="grid w-[62px] shrink-0 content-center pr-1.5">
          <p className="text-[13px] font-bold uppercase leading-4 text-[#a5a7a1]">
            Visible
            <span className="block">Devices</span>
          </p>
        </div>
        <div className="flex min-h-0 min-w-0 items-center overflow-x-auto overflow-y-hidden pl-1.5">
          <div className="flex min-w-max items-center gap-1">
            {visibleDevices.length === 0 ? (
              <p className="border border-[#1b1c1a] rounded-[4px] bg-[#343633] px-2 py-1.5 text-xs leading-5 text-[#a5a7a1]">No Push devices visible on this network.</p>
            ) : (
              visibleDevices.map((device) => (
                <DeviceButton
                  deviceDisplayName={deviceDisplayName}
                  isSelected={selectedDeviceId === device.id}
                  key={device.id}
                  onClick={() => onSelectDevice(device.id)}
                />
              ))
            )}
          </div>
        </div>
      </section>
    </section>
  );
}

function SshKeyPanel({
  isCreatingKey,
  isSshSetupActive,
  keyStatus,
  onCopyPublicKey,
  onCreateKey,
  onRotateKey,
  sshPublicKeyCopyState
}: {
  isCreatingKey: boolean;
  isSshSetupActive: boolean;
  keyStatus: SshKeyStatus | null;
  onCopyPublicKey: () => Promise<boolean>;
  onCreateKey: () => void;
  onRotateKey: () => void;
  sshPublicKeyCopyState: SshPublicKeyCopyState;
}) {
  const [shouldConfirmRotate, setShouldConfirmRotate] = useState(false);
  const [isCopiedVisible, setIsCopiedVisible] = useState(false);
  const [shouldRenderCopied, setShouldRenderCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);
  const copiedRemoveTimerRef = useRef<number | null>(null);
  const hasKey = keyStatus?.exists === true;
  const isCopying = sshPublicKeyCopyState === "copying";
  const shouldPulseCopyKey = hasKey && isSshSetupActive;
  const statusClassName = hasKey
    ? "border-[#38512d] bg-[#5f7d4f] text-[#f0f4ec] hover:bg-[#6f8f5d]"
    : "border-[#6b2e2c] bg-[#8f423e] text-[#fff0ee]";

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current);
      }

      if (copiedRemoveTimerRef.current) {
        window.clearTimeout(copiedRemoveTimerRef.current);
      }
    };
  }, []);

  function showCopied() {
    setShouldRenderCopied(true);
    window.requestAnimationFrame(() => setIsCopiedVisible(true));

    if (copiedTimerRef.current) {
      window.clearTimeout(copiedTimerRef.current);
    }

    if (copiedRemoveTimerRef.current) {
      window.clearTimeout(copiedRemoveTimerRef.current);
    }

    copiedTimerRef.current = window.setTimeout(() => {
      setIsCopiedVisible(false);
      copiedTimerRef.current = null;
      copiedRemoveTimerRef.current = window.setTimeout(() => {
        setShouldRenderCopied(false);
        copiedRemoveTimerRef.current = null;
      }, 1000);
    }, 4000);
  }

  async function copyPublicKey() {
    if (!hasKey || isCopying) {
      return;
    }

    const didCopy = await onCopyPublicKey();
    if (didCopy) {
      showCopied();
    }
  }

  function confirmRotate() {
    setShouldConfirmRotate(false);
    onRotateKey();
  }

  return (
    <section className="flex min-w-0 items-stretch">
      <button
        className={`relative grid h-full w-[56px] shrink-0 place-items-center rounded-l-[4px] rounded-r-none px-2 text-center text-[11px] font-bold uppercase leading-3 transition ${hasKey ? "cursor-copy" : "cursor-default"} ${shouldPulseCopyKey ? "ssh-key-copy-pulse" : ""} ${statusClassName}`}
        disabled={!hasKey || isCopying}
        onClick={copyPublicKey}
        title={hasKey && keyStatus ? `Click to copy ${keyStatus.keyName}.pub` : "Tiny Push Utility SSH key was not detected."}
        type="button"
      >
        <span>
          SSH
          <span className="block">Key</span>
        </span>
        {shouldRenderCopied ? (
          <span
            className={`absolute left-1 top-1 rounded-[4px] border border-[#1b1c1a] bg-[#b0ddeb] px-1.5 py-0.5 text-[10px] font-bold normal-case leading-none text-[#111111] shadow-lg transition-opacity duration-1000 ${
              isCopiedVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            Copied
          </span>
        ) : null}
      </button>
      {hasKey ? (
        <Button className="!h-full !w-[76px] !rounded-l-none !rounded-r-[4px] !border-0 !px-2 hover:!bg-[#d99b98] hover:!text-[#2b1110]" disabled={isCreatingKey} onClick={() => setShouldConfirmRotate(true)} type="button" variant="compact">
          {isCreatingKey ? "Rotating" : "Rotate"}
        </Button>
      ) : (
        <Button className="!h-full !w-[76px] !rounded-l-none !rounded-r-[4px] !border-0 !px-2" disabled={isCreatingKey} onClick={onCreateKey} type="button" variant="compact">
          {isCreatingKey ? "Creating" : "Create"}
        </Button>
      )}
      {shouldConfirmRotate ? (
        <RotateSshKeyConfirmDialog
          isRotating={isCreatingKey}
          onCancel={() => setShouldConfirmRotate(false)}
          onConfirm={confirmRotate}
        />
      ) : null}
    </section>
  );
}

function RotateSshKeyConfirmDialog({
  isRotating,
  onCancel,
  onConfirm
}: {
  isRotating: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || isRotating) {
        return;
      }

      event.preventDefault();
      onCancel();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRotating, onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#10110f]/70 px-4">
      <section aria-modal="true" className="w-[min(420px,calc(100vw-32px))] rounded-[4px] border border-[#1b1c1a] bg-[#373936] p-3 shadow-xl" role="dialog">
        <h3 className="text-xs font-bold uppercase text-[#eeeeea]">Rotate SSH key?</h3>
        <p className="mt-2 text-xs leading-5 text-[#d8d8d2]">
          This will replace the currently active SSH key on this machine. Devices that use the current key will need SSH setup again before connecting. It is recomended to clear unused keys on your Push from time to time.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button
            className="!bg-[#d99b98] !text-[#2b1110] hover:!bg-[#e7b3b0]"
            disabled={isRotating}
            onClick={onConfirm}
            type="button"
            variant="compact"
          >
            {isRotating ? "Rotating" : "Rotate"}
          </Button>
          <Button disabled={isRotating} onClick={onCancel} type="button" variant="compact">
            Cancel
          </Button>
        </div>
      </section>
    </div>
  );
}

function DeviceButton({
  deviceDisplayName,
  isSelected,
  onClick
}: {
  deviceDisplayName: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex h-[42px] w-[150px] shrink-0 items-center justify-center rounded-[4px] px-2 py-1.5 text-center text-xs transition hover:bg-[#40433f] ${
        isSelected ? "bg-[#b0ddeb] text-[#111111] hover:bg-[#c3e8f3]" : "bg-[#343633] text-[#eeeeea]"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="min-w-0 truncate font-bold">{deviceDisplayName}</span>
    </button>
  );
}

function formatNetworkName(network: LocalNetwork | null) {
  if (!network) {
    return "Detecting network...";
  }

  return `Network: ${network.name || "Not detected"}`;
}

function formatNetworkIpAddress(network: LocalNetwork | null) {
  if (!network) {
    return "Local IP: Detecting...";
  }

  return `Local IP: ${network.ipAddress || "Not detected"}`;
}

function formatNetworkTitle(network: LocalNetwork | null) {
  if (!network) {
    return "Checking the connected local network.";
  }

  if (network.name) {
    const details = [network.interfaceName, network.ipAddress, network.gateway ? `gateway ${network.gateway}` : null, network.type].filter(Boolean).join(" / ");
    return details ? `${network.name} (${details})` : network.name;
  }

  return network.error || "No connected local network was detected.";
}
