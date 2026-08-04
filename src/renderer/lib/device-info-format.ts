import type { PushDeviceInfo } from "../types";

export function formatDeviceVersionInfo(deviceDisplayName: string, deviceInfo: PushDeviceInfo | null) {
  return [
    `${deviceDisplayName} version info`,
    `Push: ${formatDeviceInfoValue(deviceInfo?.pushSoftwareVersion)}`,
    `Firmware: ${formatDeviceInfoValue(deviceInfo?.firmwareVersion)}`,
    `Live: ${formatDeviceInfoValue(deviceInfo?.liveVersion)}`,
    `Ableton OS: ${formatDeviceInfoValue(deviceInfo?.abletonOsVersion)}`
  ].join("\n");
}

export function formatDeviceVersionSummary(deviceDisplayName: string, deviceInfo: PushDeviceInfo | null) {
  return `${deviceDisplayName} versions: Push ${formatDeviceInfoValue(deviceInfo?.pushSoftwareVersion)} / Firmware ${formatDeviceInfoValue(
    deviceInfo?.firmwareVersion
  )} / Live ${formatDeviceInfoValue(deviceInfo?.liveVersion)} / Ableton OS ${formatDeviceInfoValue(deviceInfo?.abletonOsVersion)}`;
}

function formatDeviceInfoValue(value: string | null | undefined) {
  return value || "Not collected";
}
