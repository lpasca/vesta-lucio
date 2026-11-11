// Vesta L build 15: feed the activity sounds from the agent core's own event stream.
//
// The chat socket (/agents/<name>/app-chat/ws) only carries messages ("user", "chat"), so the
// thinking / tool sounds never had anything to fire on (build 14 sound log: only "event user" and
// "event chat"). The core's /ws (proxied by vestad at /agents/<name>/ws) carries every event-bus
// event: thinking, tool_start, tool_end, subagent_start, status, notification, error. This opens
// that stream while the chat is active and forwards the activity events to the sound bus. Chat and
// user messages are skipped here because the chat socket already delivers them.
import { useEffect } from "react";
import { agentPath, type ChatMessage, type Controller } from "@vesta/core";
import { emitActivity } from "@/voice/activity-sounds";

const FORWARDED = new Set([
  "thinking",
  "assistant",
  "tool_start",
  "tool_end",
  "subagent_start",
  "status",
  "notification",
  "error",
]);

const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 30_000;

export function useCoreActivityFeed(
  active: boolean,
  name: string | null | undefined,
  controller: Controller | null | undefined,
): void {
  useEffect(() => {
    if (!active || !name || !controller) return;
    let closed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = RETRY_MIN_MS;

    const connect = async (): Promise<void> => {
      let url: string;
      try {
        url = await controller.session.websocketUrl(agentPath(name, "/ws"));
      } catch {
        schedule();
        return;
      }
      if (closed) return;
      const ws = new WebSocket(url);
      socket = ws;
      ws.onopen = () => {
        retryDelay = RETRY_MIN_MS;
      };
      ws.onmessage = (message) => {
        if (typeof message.data !== "string") return;
        let frame: unknown;
        try {
          frame = JSON.parse(message.data);
        } catch {
          return;
        }
        if (typeof frame !== "object" || frame === null) return;
        const type = (frame as { type?: unknown }).type;
        if (typeof type !== "string" || !FORWARDED.has(type)) return;
        try {
          emitActivity(frame as ChatMessage);
        } catch {
          // A sound fault never breaks anything else.
        }
      };
      ws.onclose = () => {
        if (socket === ws) socket = null;
        schedule();
      };
      ws.onerror = () => {
        // onclose follows and schedules the retry.
      };
    };

    const schedule = (): void => {
      if (closed || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    };

    void connect();
    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
      socket = null;
    };
  }, [active, name, controller]);
}
