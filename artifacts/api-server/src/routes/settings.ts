import { Router } from "express";
import { getDb, isDbReady } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";

export const settingsRouter = Router();

const ALLOWED_KEYS = [
  "defaultWebhookUrl", "maxSessions", "logRetentionDays", "botGreetingMessage",
  "webhookGlobalEnabled", "maintenanceMode", "typingDelayMin", "typingDelayMax",
  "antiBanEnabled", "webhookRetryEnabled", "webhookRetryMax", "defaultReplyDelay",
  "allowGroupMessages", "allowBroadcast", "broadcastDelayMin", "broadcastDelayMax",
  "serverName", "botOwner", "notifyOnBan", "notifyWebhookUrl",
  // Session device lock settings
  "sessionDeviceLockEnabled", "sessionDeviceLockTtlMinutes",
];

settingsRouter.get("/", async (_req, res): Promise<void> => {
  if (!isDbReady()) { res.json({}); return; }
  const rows = await getDb().select().from(appSettingsTable);
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  res.json(result);
});

settingsRouter.put("/", async (req, res): Promise<void> => {
  if (!isDbReady()) { res.status(503).json({ error: "Database belum dikonfigurasi." }); return; }
  const body = req.body as Record<string, unknown>;
  if (!body || typeof body !== "object") { res.status(400).json({ error: "Body harus JSON object" }); return; }

  const updates: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.includes(key)) continue;
    updates.push({ key, value: String(value) });
  }
  if (!updates.length) { res.status(400).json({ error: "Tidak ada kunci pengaturan yang valid" }); return; }

  for (const { key, value } of updates) {
    await getDb().insert(appSettingsTable).values({ key, value })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
  }

  const rows = await getDb().select().from(appSettingsTable);
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  res.json(result);
});
