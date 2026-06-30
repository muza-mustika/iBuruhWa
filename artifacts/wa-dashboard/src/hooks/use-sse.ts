import { useEffect, useRef, useCallback } from "react";

type SseEvent = "message" | "session" | "stats";

interface UseSseOptions {
  onMessage?: (data: unknown) => void;
  onSession?: (data: unknown) => void;
  onStats?: (data: unknown) => void;
  enabled?: boolean;
}

export function useSse({ onMessage, onSession, onStats, enabled = true }: UseSseOptions) {
  const esRef = useRef<EventSource | null>(null);
  const handlers = useRef({ onMessage, onSession, onStats });
  handlers.current = { onMessage, onSession, onStats };

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }
    try {
      const es = new EventSource("/api/events");
      esRef.current = es;

      es.addEventListener("message", (e) => {
        try { handlers.current.onMessage?.(JSON.parse(e.data)); } catch {}
      });
      es.addEventListener("session", (e) => {
        try { handlers.current.onSession?.(JSON.parse(e.data)); } catch {}
      });
      es.addEventListener("stats", (e) => {
        try { handlers.current.onStats?.(JSON.parse(e.data)); } catch {}
      });
      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Reconnect after 5s on error
        setTimeout(() => {
          if (enabled) connect();
        }, 5000);
      };
    } catch {
      // SSE not supported or blocked
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect, enabled]);
}
