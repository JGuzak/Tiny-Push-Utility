import type { PushDevice } from "../types";

export function isVisibleDevice(device: PushDevice) {
  return device.connectionState === "reachable" || device.connectionState === "ssh-ready";
}

export function formatDate(value?: string) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatHttpStatus(device: PushDevice) {
  if (!device.statusCode) {
    return device.probePath ? `Probed ${device.probePath}` : "";
  }

  return `HTTP ${device.statusCode}${device.statusMessage ? ` ${device.statusMessage}` : ""}`;
}

export function formatState(state: PushDevice["connectionState"]) {
  return state.replaceAll("-", " ");
}
