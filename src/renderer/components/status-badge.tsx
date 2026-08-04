import { RefreshCw } from "lucide-react";

import { Badge } from "./badge";
import { formatState } from "../lib/device-format";
import type { PushDevice } from "../types";

export function StatusBadge({ state }: { state: PushDevice["connectionState"] }) {
  if (state === "reachable") {
    return <Badge variant="success">Reachable</Badge>;
  }

  if (state === "ssh-ready") {
    return <Badge variant="success">SSH Ready</Badge>;
  }

  if (state === "unreachable") {
    return <Badge variant="danger">Unreachable</Badge>;
  }

  if (state === "error") {
    return <Badge variant="danger">Error</Badge>;
  }

  return <Badge>{formatState(state)}</Badge>;
}

export function SshAbilityBadge({ device }: { device: PushDevice }) {
  if (device.sshStatus === "checking") {
    return (
      <Badge className="gap-1.5">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Checking SSH
      </Badge>
    );
  }

  if (device.sshStatus === "available" || device.sshAvailable === true) {
    return <Badge variant="success">Connected</Badge>;
  }

  if (device.sshStatus === "unavailable" || device.sshAvailable === false) {
    return <Badge variant="danger">Disconnected</Badge>;
  }

  return <Badge>SSH Not Checked</Badge>;
}
