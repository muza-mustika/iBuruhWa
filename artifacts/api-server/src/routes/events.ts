import { Router } from "express";
import { EventEmitter } from "events";

export const eventsRouter = Router();
export const eventBus = new EventEmitter();
eventBus.setMaxListeners(100);

eventsRouter.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const pingInterval = setInterval(() => {
    res.write(": ping\n\n");
  }, 20000);

  const onMessage = (msg: unknown) => sendEvent("message", msg);
  const onSession = (sess: unknown) => sendEvent("session", sess);
  const onStats = (stats: unknown) => sendEvent("stats", stats);

  eventBus.on("message", onMessage);
  eventBus.on("session", onSession);
  eventBus.on("stats", onStats);

  req.on("close", () => {
    clearInterval(pingInterval);
    eventBus.off("message", onMessage);
    eventBus.off("session", onSession);
    eventBus.off("stats", onStats);
  });
});
