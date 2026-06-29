import { Router } from "express";
import { initDb, saveConfigUrl, getDbUrl, isDbReady, testConnection } from "@workspace/db";
import { runMigrations } from "@workspace/db/src/migrate";
import { waManager } from "../lib/wa-manager";
import { logger } from "../lib/logger";
import fs from "fs";
import path from "path";

export const setupRouter = Router();

const CONFIG_PATH = path.resolve(
  process.cwd().includes(path.join("artifacts", "api-server"))
    ? path.join(process.cwd(), "../..")
    : process.cwd(),
  "artifacts/api-server/.config.local.json"
);

setupRouter.get("/status", async (_req, res): Promise<void> => {
  const dbUrl = getDbUrl();
  if (!dbUrl) {
    res.json({ dbConnected: false, maskedUrl: null, message: "URL database belum dikonfigurasi" });
    return;
  }
  const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ":***@");
  if (!isDbReady()) {
    res.json({ dbConnected: false, maskedUrl, message: "Database belum terhubung" });
    return;
  }
  const result = await testConnection(dbUrl);
  res.json({ dbConnected: result.ok, maskedUrl, message: result.message });
});

setupRouter.post("/test-db", async (req, res): Promise<void> => {
  const { databaseUrl } = req.body as { databaseUrl?: string };
  if (!databaseUrl) { res.status(400).json({ ok: false, message: "databaseUrl diperlukan" }); return; }
  const result = await testConnection(databaseUrl);
  res.json(result);
});

setupRouter.post("/save-db-url", async (req, res): Promise<void> => {
  const { databaseUrl } = req.body as { databaseUrl?: string };
  if (!databaseUrl) { res.status(400).json({ ok: false, message: "databaseUrl diperlukan" }); return; }

  const testResult = await testConnection(databaseUrl);
  if (!testResult.ok) {
    res.json({ ok: false, message: `Koneksi gagal: ${testResult.message}` });
    return;
  }

  try {
    saveConfigUrl(databaseUrl);
    initDb(databaseUrl);
    logger.info("Database diinisialisasi dari web UI");

    const migResult = await runMigrations();

    waManager.resumeAllSessions().catch((err: unknown) => logger.error({ err }, "Gagal resume sesi"));

    res.json({ ok: true, message: "Database terhubung dan migrasi berhasil", migration: migResult });
  } catch (err: unknown) {
    res.json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

setupRouter.post("/migrate", async (_req, res): Promise<void> => {
  const result = await runMigrations();
  res.json(result);
});

setupRouter.delete("/clear-db-url", async (_req, res): Promise<void> => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      let cfg: Record<string, unknown> = {};
      try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")); } catch {}
      delete cfg.databaseUrl;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    }
    res.json({ ok: true, message: "Konfigurasi database dihapus. Restart server untuk efek penuh." });
  } catch (err: unknown) {
    res.json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});
