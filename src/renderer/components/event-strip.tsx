import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Download } from "lucide-react";

export type AppEventKind = "info" | "success" | "warning" | "error" | "hint";

export type AppEvent = {
  id: string;
  createdAt: string;
  kind: AppEventKind;
  message: string;
  details?: string;
  source?: string;
};

type EventStripProps = {
  events: AppEvent[];
  isExpanded: boolean;
  onExportLog: () => Promise<void>;
  onToggleExpanded: () => void;
};

type EventListScrollMetrics = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

export function EventStrip({ events, isExpanded, onExportLog, onToggleExpanded }: EventStripProps) {
  const latestEvent = events.at(-1);
  const eventListRef = useRef<HTMLOListElement | null>(null);
  const scrollingDimTimerRef = useRef<number | null>(null);
  const [eventListScrollMetrics, setEventListScrollMetrics] = useState<EventListScrollMetrics>({ clientHeight: 0, scrollHeight: 0, scrollTop: 0 });
  const [isEventListScrolling, setIsEventListScrolling] = useState(false);
  const [isEventScrollbarHovered, setIsEventScrollbarHovered] = useState(false);
  const [isExportingLog, setIsExportingLog] = useState(false);

  useEffect(() => {
    if (!isExpanded || !eventListRef.current) {
      return;
    }

    eventListRef.current.scrollTop = eventListRef.current.scrollHeight;
    updateEventListScrollMetrics();
  }, [events.length, isExpanded]);

  useEffect(() => {
    return () => {
      if (scrollingDimTimerRef.current) {
        window.clearTimeout(scrollingDimTimerRef.current);
      }
    };
  }, []);

  function updateEventListScrollMetrics() {
    const eventList = eventListRef.current;

    if (!eventList) {
      return;
    }

    setEventListScrollMetrics({
      clientHeight: eventList.clientHeight,
      scrollHeight: eventList.scrollHeight,
      scrollTop: eventList.scrollTop
    });
    setIsEventListScrolling(true);

    if (scrollingDimTimerRef.current) {
      window.clearTimeout(scrollingDimTimerRef.current);
    }

    scrollingDimTimerRef.current = window.setTimeout(() => {
      setIsEventListScrolling(false);
      scrollingDimTimerRef.current = null;
    }, 1000);
  }

  async function exportLog() {
    setIsExportingLog(true);

    try {
      await onExportLog();
    } finally {
      setIsExportingLog(false);
    }
  }

  return (
    <section className="relative w-full min-w-0 max-w-full overflow-hidden border-t border-[#1b1c1a] bg-[#2b2d2a] text-[#d8d8d2]">
      {!isExpanded ? (
        <div className="relative flex min-h-7 min-w-0 items-center gap-2 px-2 py-1 pr-16 text-xs font-semibold">
          <span className={latestEvent ? getDotClassName(latestEvent.kind) : getDotClassName("info")} />
          <p className="min-w-0 flex-1 truncate">{latestEvent ? formatEventLine(latestEvent) : "Ready."}</p>
          <ExportLogButton isExporting={isExportingLog} onExport={exportLog} />
          <EventPanelToggleButton isExpanded={isExpanded} onToggleExpanded={onToggleExpanded} />
        </div>
      ) : null}

      {isExpanded ? (
        <div className="relative min-w-0 overflow-hidden rounded-[4px] border-t border-[#1b1c1a] bg-[#303230]">
          <ExportLogButton isExporting={isExportingLog} onExport={exportLog} />
          <EventPanelToggleButton isExpanded={isExpanded} onToggleExpanded={onToggleExpanded} />
          <CustomEventScrollbar isActive={isEventListScrolling || isEventScrollbarHovered} metrics={eventListScrollMetrics} onHoverChange={setIsEventScrollbarHovered} />
          <ol className="notification-event-list grid max-h-[242px] min-w-0 overflow-y-auto overflow-x-hidden text-xs" onScroll={updateEventListScrollMetrics} ref={eventListRef}>
            {events.map((event) => (
              <EventRow event={event} key={event.id} />
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function CustomEventScrollbar({
  isActive,
  metrics,
  onHoverChange
}: {
  isActive: boolean;
  metrics: EventListScrollMetrics;
  onHoverChange: (isHovered: boolean) => void;
}) {
  const canScroll = metrics.scrollHeight > metrics.clientHeight && metrics.clientHeight > 0;

  if (!canScroll) {
    return null;
  }

  const thumbHeightPercent = Math.max(12, (metrics.clientHeight / metrics.scrollHeight) * 100);
  const maxScrollTop = metrics.scrollHeight - metrics.clientHeight;
  const thumbTopPercent = maxScrollTop > 0 ? (metrics.scrollTop / maxScrollTop) * (100 - thumbHeightPercent) : 0;

  return (
    <div className="absolute bottom-0 right-2 top-7 z-10 w-5 bg-transparent" onMouseEnter={() => onHoverChange(true)} onMouseLeave={() => onHoverChange(false)}>
      <div className={`absolute rounded-[4px] bg-[#51534f] transition-opacity duration-1000 ${isActive ? "opacity-100" : "opacity-20"}`} style={{ height: `${thumbHeightPercent}%`, left: "50%", top: `${thumbTopPercent}%`, transform: "translateX(-50%)", width: "10px" }} />
    </div>
  );
}

function EventRow({ event }: { event: AppEvent }) {
  return (
    <li className={`relative grid min-h-7 min-w-0 grid-cols-[76px_minmax(0,1fr)] items-start gap-2 border-b border-[#262826] px-2 py-1 pr-16 last:border-b-0 ${getEventRowClassName(event.kind)}`}>
      <span className="pt-0.5 font-mono leading-5 text-[#d8d8d2]">{formatEventTime(event.createdAt)}</span>
      <span className="min-w-0 whitespace-pre-wrap break-words leading-5 text-[#eeeeea] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]" title={event.details || event.message}>
        {event.message}
      </span>
    </li>
  );
}

function ExportLogButton({ isExporting, onExport }: { isExporting: boolean; onExport: () => void }) {
  return (
    <button
      aria-label="Save notification log"
      className="absolute right-9 top-1 z-20 grid h-5 w-5 place-items-center rounded-[4px] border border-[#1b1c1a] bg-[#444642] text-[#eeeeea] transition hover:bg-[#51534f] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isExporting}
      onClick={onExport}
      title={isExporting ? "Saving notification log" : "Save notification log"}
      type="button"
    >
      <Download className="h-3.5 w-3.5" />
    </button>
  );
}

function EventPanelToggleButton({ isExpanded, onToggleExpanded }: { isExpanded: boolean; onToggleExpanded: () => void }) {
  return (
    <button
      aria-label={isExpanded ? "Collapse notifications" : "Expand notifications"}
      className="absolute right-2 top-1 z-20 grid h-5 w-5 place-items-center rounded-[4px] border border-[#1b1c1a] bg-[#444642] text-[#eeeeea] transition hover:bg-[#51534f]"
      onClick={onToggleExpanded}
      title={isExpanded ? "Collapse notifications" : "Expand notifications"}
      type="button"
    >
      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
    </button>
  );
}

function formatEventLine(event: AppEvent) {
  const source = event.source ? `${event.source}: ` : "";
  return `${source}${event.message}`;
}

function formatEventTime(createdAt: string) {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function getDotClassName(kind: AppEventKind) {
  const baseClassName = "h-2 w-2 shrink-0 rounded-full";

  if (kind === "error") {
    return `${baseClassName} bg-[#9b3a34]`;
  }

  if (kind === "success") {
    return `${baseClassName} bg-[#5f7d4f]`;
  }

  if (kind === "warning") {
    return `${baseClassName} bg-[#715000]`;
  }

  if (kind === "hint") {
    return `${baseClassName} bg-[#b0ddeb]`;
  }

  return `${baseClassName} bg-[#858781]`;
}

function getEventRowClassName(kind: AppEventKind) {
  if (kind === "error") {
    return "bg-[#4a302e] hover:bg-[#5a3835]";
  }

  if (kind === "success") {
    return "bg-[#34402f] hover:bg-[#3f4d38]";
  }

  if (kind === "warning") {
    return "bg-[#473b22] hover:bg-[#55472a]";
  }

  if (kind === "hint") {
    return "bg-[#2d4248] hover:bg-[#36505a]";
  }

  return "bg-[#373936] hover:bg-[#424540]";
}







