import { Router } from "express";
import { waManager } from "../lib/wa-manager";
import { isDbReady } from "@workspace/db";

export const sendRouter = Router();

const dbGuard = (_req: any, res: any, next: any) => {
  if (!isDbReady()) { res.status(503).json({ error: "Database belum dikonfigurasi." }); return; }
  next();
};
sendRouter.use(dbGuard);

sendRouter.post("/", async (req, res): Promise<void> => {
  const { to, text, sessionId } = req.body as Record<string, string | undefined>;
  if (!to || !text) { res.status(400).json({ error: "to dan text diperlukan" }); return; }
  const result = await waManager.sendMessage({ to, text, sessionId });
  if (!result.success) { res.status(503).json(result); return; }
  res.json(result);
});

sendRouter.post("/broadcast", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const { recipients, text, sessionId, delayMs: rawDelay } = body ?? {};

  if (!Array.isArray(recipients) || recipients.length === 0 || recipients.length > 100) {
    res.status(400).json({ error: "recipients harus array 1–100 nomor" }); return;
  }
  if (typeof text !== "string" || text.trim() === "") {
    res.status(400).json({ error: "Teks pesan diperlukan" }); return;
  }

  const delayMs = typeof rawDelay === "number" ? Math.min(Math.max(rawDelay, 500), 10000) : 1000;
  const results: { to: string; success: boolean; sessionId?: string; error?: string }[] = [];

  for (let i = 0; i < recipients.length; i++) {
    const to = recipients[i];
    const result = await waManager.sendMessage({ to, text, sessionId: sessionId as string | undefined });
    results.push({ to, success: result.success, sessionId: result.sessionId, error: result.error ?? undefined });
    if (delayMs > 0 && i < recipients.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const sent = results.filter((r) => r.success).length;
  res.json({ total: recipients.length, sent, failed: results.length - sent, results });
});
