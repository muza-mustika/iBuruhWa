import { Router } from "express";
import { getDb, isDbReady } from "@workspace/db";
import { sessionsTable, appSettingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { waManager } from "../lib/wa-manager";
import { logger } from "../lib/logger";
import { z } from "zod";

export const sessionsRouter = Router();

// Durasi default lock device: 30 menit tanpa aktivitas → lock dilepas otomatis saat sync
const DEFAULT_DEVICE_LOCK_TTL_MINUTES = 30;

const dbGuard = (_req: any, res: any, next: any) => {
  if (!isDbReady()) {
    res.status(503).json({ error: "Database belum dikonfigurasi. Buka Pengaturan > Database." });
    return;
  }
  next();
};

const CreateSessionBody = z.object({ name: z.string().min(1) });
const SessionIdParam = z.object({ sessionId: z.string() });

sessionsRouter.use(dbGuard);

/**
 * Serialize sesi dari DB ke response JSON.
 * Menambahkan field device lock dan lastUsedAt.
 */
const serializeSession = (s: typeof sessionsTable.$inferSelect) => ({
  id: s.id,
  name: s.name,
  status: s.status,
  phoneNumber: s.phoneNumber ?? null,
  messagesSent: s.messagesSent,
  messagesReceived: s.messagesReceived,
  createdAt: s.createdAt.toISOString(),
  currentDeviceId: s.currentDeviceId ?? null,
  currentDeviceInfo: s.currentDeviceInfo ?? null,
  lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
  isDeviceLocked: s.currentDeviceId !== null && s.currentDeviceId !== undefined,
});

/**
 * Ambil TTL device lock dari pengaturan DB (menit).
 */
async function getDeviceLockTtlMinutes(): Promise<number> {
  try {
    const rows = await getDb().select().from(appSettingsTable).where(eq(appSettingsTable.key, "sessionDeviceLockTtlMinutes"));
    const val = Number(rows[0]?.value);
    return isNaN(val) || val < 1 ? DEFAULT_DEVICE_LOCK_TTL_MINUTES : val;
  } catch {
    return DEFAULT_DEVICE_LOCK_TTL_MINUTES;
  }
}

/**
 * Apakah device lock aktif sesuai pengaturan.
 */
async function isDeviceLockEnabled(): Promise<boolean> {
  try {
    const rows = await getDb().select().from(appSettingsTable).where(eq(appSettingsTable.key, "sessionDeviceLockEnabled"));
    return rows[0]?.value !== "false";
  } catch {
    return true;
  }
}

// GET /sessions — daftar semua sesi
sessionsRouter.get("/", async (_req, res): Promise<void> => {
  const rows = await getDb().select().from(sessionsTable).orderBy(sessionsTable.createdAt);
  res.json(rows.map(serializeSession));
});

// POST /sessions — buat sesi baru
sessionsRouter.post("/", async (req, res): Promise<void> => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid" });
    return;
  }
  const { name } = parsed.data;
  const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  await getDb().insert(sessionsTable).values({ id, name, status: "connecting" });
  const row = (await getDb().select().from(sessionsTable).where(eq(sessionsTable.id, id)))[0];
  waManager.startSession(id);

  res.status(201).json(serializeSession(row));
});

// GET /sessions/:sessionId — detail sesi
sessionsRouter.get("/:sessionId", async (req, res): Promise<void> => {
  const parsed = SessionIdParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Parameter tidak valid" });
    return;
  }
  const rows = await getDb().select().from(sessionsTable).where(eq(sessionsTable.id, parsed.data.sessionId));
  if (!rows.length) {
    res.status(404).json({ error: "Sesi tidak ditemukan" });
    return;
  }
  res.json(serializeSession(rows[0]));
});

// DELETE /sessions/:sessionId — hapus sesi
sessionsRouter.delete("/:sessionId", async (req, res): Promise<void> => {
  const parsed = SessionIdParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Parameter tidak valid" });
    return;
  }
  await waManager.stopSession(parsed.data.sessionId);
  await getDb().delete(sessionsTable).where(eq(sessionsTable.id, parsed.data.sessionId));
  res.status(204).send();
});

// GET /sessions/:sessionId/qr — ambil QR code dengan validasi device lock
sessionsRouter.get("/:sessionId/qr", async (req, res): Promise<void> => {
  const parsed = SessionIdParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Parameter tidak valid" });
    return;
  }
  const { sessionId } = parsed.data;

  const rows = await getDb().select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!rows.length) {
    res.status(404).json({ error: "Sesi tidak ditemukan" });
    return;
  }

  const session = rows[0];

  // Cek device lock
  const deviceId = req.headers["x-device-id"] as string | undefined;
  const lockEnabled = await isDeviceLockEnabled();

  if (lockEnabled && deviceId) {
    if (session.currentDeviceId && session.currentDeviceId !== deviceId) {
      res.status(409).json({
        error: "Sesi ini sudah digunakan oleh perangkat lain",
        code: "DEVICE_LOCKED",
        currentDeviceId: session.currentDeviceId,
      });
      return;
    }

    // Klaim atau perbarui device lock
    const deviceInfo = req.headers["x-device-info"] as string | undefined
      ?? req.headers["user-agent"] as string | undefined
      ?? null;

    await getDb().update(sessionsTable).set({
      currentDeviceId: deviceId,
      currentDeviceInfo: deviceInfo,
      lastUsedAt: new Date(),
    }).where(eq(sessionsTable.id, sessionId)).catch(() => {});
  } else if (!lockEnabled || !deviceId) {
    // Jika lock dimatikan atau tidak ada device-id, tetap update lastUsedAt
    await getDb().update(sessionsTable).set({ lastUsedAt: new Date() })
      .where(eq(sessionsTable.id, sessionId)).catch(() => {});
  }

  res.json({ sessionId, qr: waManager.getQr(sessionId) ?? null, status: session.status });
});

// POST /sessions/:sessionId/reconnect — paksa reconnect
sessionsRouter.post("/:sessionId/reconnect", async (req, res): Promise<void> => {
  const parsed = SessionIdParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Parameter tidak valid" });
    return;
  }
  const { sessionId } = parsed.data;

  const rows = await getDb().select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!rows.length) {
    res.status(404).json({ error: "Sesi tidak ditemukan" });
    return;
  }

  const session = rows[0];

  // Cek device lock saat reconnect
  const deviceId = req.headers["x-device-id"] as string | undefined;
  const lockEnabled = await isDeviceLockEnabled();

  if (lockEnabled && deviceId && session.currentDeviceId && session.currentDeviceId !== deviceId) {
    res.status(409).json({
      error: "Sesi ini sudah digunakan oleh perangkat lain",
      code: "DEVICE_LOCKED",
      currentDeviceId: session.currentDeviceId,
    });
    return;
  }

  await waManager.stopSession(sessionId);
  await getDb().update(sessionsTable).set({
    status: "connecting",
    lastUsedAt: new Date(),
  }).where(eq(sessionsTable.id, sessionId));

  waManager.startSession(sessionId);

  const updated = (await getDb().select().from(sessionsTable).where(eq(sessionsTable.id, sessionId)))[0];
  res.json(serializeSession(updated));
});

// POST /sessions/:sessionId/release-device — lepas lock perangkat secara manual
sessionsRouter.post("/:sessionId/release-device", async (req, res): Promise<void> => {
  const parsed = SessionIdParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Parameter tidak valid" });
    return;
  }
  const { sessionId } = parsed.data;

  const rows = await getDb().select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!rows.length) {
    res.status(404).json({ error: "Sesi tidak ditemukan" });
    return;
  }

  await getDb().update(sessionsTable).set({
    currentDeviceId: null,
    currentDeviceInfo: null,
  }).where(eq(sessionsTable.id, sessionId));

  logger.info({ sessionId }, "Device lock dilepas secara manual");

  const updated = (await getDb().select().from(sessionsTable).where(eq(sessionsTable.id, sessionId)))[0];
  res.json({ message: "Device lock berhasil dilepas", session: serializeSession(updated) });
});

/**
 * POST /sessions/sync
 *
 * Sinkronisasi sesi: lepas device lock pada sesi yang sudah tidak aktif
 * berdasarkan lastUsedAt. Sesi dianggap tidak aktif jika:
 * - lastUsedAt lebih dari TTL menit yang lalu, ATAU
 * - lastUsedAt NULL dan currentDeviceId di-set (artinya belum pernah dipakai)
 *
 * Query param: ?ttlMinutes=30 (opsional, override default)
 */
sessionsRouter.post("/sync", async (req, res): Promise<void> => {
  const ttlParam = Number(req.query.ttlMinutes);
  const ttlMinutes = !isNaN(ttlParam) && ttlParam > 0
    ? ttlParam
    : await getDeviceLockTtlMinutes();

  const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);

  try {
    // Ambil sesi yang device lock-nya perlu dilepas
    const stale = await getDb()
      .select({ id: sessionsTable.id, currentDeviceId: sessionsTable.currentDeviceId, lastUsedAt: sessionsTable.lastUsedAt })
      .from(sessionsTable)
      .where(
        sql`${sessionsTable.currentDeviceId} IS NOT NULL AND (${sessionsTable.lastUsedAt} IS NULL OR ${sessionsTable.lastUsedAt} < ${cutoff})`
      );

    if (stale.length > 0) {
      const staleIds = stale.map((s) => s.id);
      await getDb().update(sessionsTable).set({
        currentDeviceId: null,
        currentDeviceInfo: null,
      }).where(sql`id = ANY(ARRAY[${sql.join(staleIds.map((id) => sql`${id}`), sql`, `)}])`);

      logger.info({ count: stale.length, ttlMinutes, cutoff }, "Session sync: device lock dilepas");

      res.json({
        message: `Sinkronisasi selesai: ${stale.length} sesi dilepas`,
        releasedSessions: stale.map((s) => ({
          id: s.id,
          lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
          deviceId: s.currentDeviceId,
        })),
        ttlMinutes,
        cutoff: cutoff.toISOString(),
      });
    } else {
      res.json({
        message: "Tidak ada sesi yang perlu disinkronisasi",
        releasedSessions: [],
        ttlMinutes,
        cutoff: cutoff.toISOString(),
      });
    }
  } catch (err) {
    logger.error({ err }, "Session sync gagal");
    res.status(500).json({ error: "Gagal sinkronisasi sesi" });
  }
});
