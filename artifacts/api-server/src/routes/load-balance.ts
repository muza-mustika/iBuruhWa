import { Router } from "express";
import { getDb, isDbReady } from "@workspace/db";
import { chatSessionAssignmentsTable, sessionsTable, appSettingsTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import { logger } from "../lib/logger";
import { waManager } from "../lib/wa-manager";

export const loadBalanceRouter = Router();

const dbGuard = (_req: any, res: any, next: any) => {
  if (!isDbReady()) {
    res.status(503).json({ error: "Database belum dikonfigurasi. Buka Pengaturan > Database." });
    return;
  }
  next();
};
loadBalanceRouter.use(dbGuard);

// ---------------------------------------------------------------------------
// GET /load-balance/status
// Ringkasan status load balance: aktif/nonaktif, distribusi per sesi, total chat
// ---------------------------------------------------------------------------
loadBalanceRouter.get("/status", async (_req, res): Promise<void> => {
  const [enabledRow] = await getDb()
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "loadBalanceEnabled"))
    .catch(() => [] as any[]);

  const enabled = enabledRow?.value !== "false";

  // Jumlah chat per sesi
  const distribution = await getDb()
    .select({
      sessionId: chatSessionAssignmentsTable.sessionId,
      chatCount: count(chatSessionAssignmentsTable.chatJid),
    })
    .from(chatSessionAssignmentsTable)
    .groupBy(chatSessionAssignmentsTable.sessionId)
    .catch(() => [] as any[]);

  // Info sesi aktif
  const sessions = await getDb()
    .select({ id: sessionsTable.id, name: sessionsTable.name, status: sessionsTable.status })
    .from(sessionsTable)
    .catch(() => [] as any[]);

  const distMap = Object.fromEntries(distribution.map((d: any) => [d.sessionId, Number(d.chatCount)]));
  const totalChats = (distribution as any[]).reduce((sum: number, d: any) => sum + Number(d.chatCount), 0);

  res.json({
    enabled,
    totalChats,
    sessions: sessions.map((s: any) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      assignedChats: distMap[s.id] ?? 0,
    })),
  });
});

// ---------------------------------------------------------------------------
// GET /load-balance/assignments
// Daftar semua affinitas chat → sesi, dengan paginasi
// ---------------------------------------------------------------------------
loadBalanceRouter.get("/assignments", async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const offset = Number(req.query.offset ?? 0);
  const filterSession = req.query.sessionId as string | undefined;

  let query = getDb()
    .select()
    .from(chatSessionAssignmentsTable)
    .orderBy(sql`${chatSessionAssignmentsTable.lastMessageAt} DESC NULLS LAST`)
    .limit(limit)
    .offset(offset);

  if (filterSession) {
    // @ts-ignore
    query = getDb()
      .select()
      .from(chatSessionAssignmentsTable)
      .where(eq(chatSessionAssignmentsTable.sessionId, filterSession))
      .orderBy(sql`${chatSessionAssignmentsTable.lastMessageAt} DESC NULLS LAST`)
      .limit(limit)
      .offset(offset);
  }

  const rows = await query.catch(() => []);
  res.json(rows.map((r: any) => ({
    ...r,
    assignedAt: r.assignedAt?.toISOString() ?? null,
    lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
  })));
});

// ---------------------------------------------------------------------------
// POST /load-balance/settings
// Aktifkan / nonaktifkan load balance
// Body: { enabled: boolean }
// ---------------------------------------------------------------------------
loadBalanceRouter.post("/settings", async (req, res): Promise<void> => {
  const enabled = req.body?.enabled !== false;
  await getDb()
    .insert(appSettingsTable)
    .values({ key: "loadBalanceEnabled", value: String(enabled) })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: String(enabled), updatedAt: new Date() } });

  logger.info({ enabled }, "Load balance setting diperbarui");
  res.json({ enabled, message: `Load balance ${enabled ? "diaktifkan" : "dinonaktifkan"}` });
});

// ---------------------------------------------------------------------------
// POST /load-balance/rebalance
// Redistribusi ulang semua chat yang di-assign ke sesi yang sudah tidak aktif,
// atau redistribusi seluruh chat agar beban merata (opsional: force=true)
// Query: ?force=true → reset semua assignment lalu distribusi ulang
// ---------------------------------------------------------------------------
loadBalanceRouter.post("/rebalance", async (req, res): Promise<void> => {
  const force = req.query.force === "true";

  // Ambil sesi yang terhubung
  const connectedSessions = await getDb()
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(eq(sessionsTable.status, "connected"))
    .catch(() => [] as any[]);

  if (!connectedSessions.length) {
    res.status(400).json({ error: "Tidak ada sesi yang terhubung untuk rebalance" });
    return;
  }
  const connectedIds = connectedSessions.map((s: any) => s.id);

  if (force) {
    // Hapus semua assignment, biarkan didistribusi ulang saat pesan berikutnya masuk
    await getDb().delete(chatSessionAssignmentsTable).catch(() => {});
    logger.info({ connectedIds }, "Rebalance paksa: semua assignment dihapus");
    res.json({
      message: "Semua assignment dihapus. Chat akan didistribusi ulang merata saat pesan berikutnya masuk.",
      connectedSessions: connectedIds,
    });
    return;
  }

  // Pindahkan chat dari sesi yang tidak terhubung ke sesi aktif secara merata
  const allAssignments = await getDb()
    .select()
    .from(chatSessionAssignmentsTable)
    .catch(() => [] as any[]);

  const stale = allAssignments.filter((a: any) => !connectedIds.includes(a.sessionId));
  if (!stale.length) {
    res.json({ message: "Tidak ada assignment yang perlu diperbaiki", reassigned: 0 });
    return;
  }

  // Hitung beban sekarang per sesi aktif
  const loadMap: Record<string, number> = Object.fromEntries(connectedIds.map((id: string) => [id, 0]));
  for (const a of allAssignments) {
    if (connectedIds.includes(a.sessionId)) loadMap[a.sessionId] = (loadMap[a.sessionId] ?? 0) + 1;
  }

  let reassigned = 0;
  for (const staleAssign of stale) {
    // Pilih sesi dengan beban paling sedikit
    const targetId = connectedIds.reduce((min: string, id: string) =>
      (loadMap[id] ?? 0) < (loadMap[min] ?? 0) ? id : min, connectedIds[0]);

    await getDb()
      .update(chatSessionAssignmentsTable)
      .set({ sessionId: targetId, assignedAt: new Date() })
      .where(eq(chatSessionAssignmentsTable.chatJid, staleAssign.chatJid))
      .catch(() => {});

    loadMap[targetId] = (loadMap[targetId] ?? 0) + 1;
    reassigned++;
  }

  logger.info({ reassigned, connectedIds }, "Rebalance selesai");
  res.json({
    message: `${reassigned} chat dipindahkan ke sesi aktif`,
    reassigned,
    connectedSessions: connectedIds,
  });
});

// ---------------------------------------------------------------------------
// DELETE /load-balance/assignments/:chatJid
// Hapus assignment untuk 1 chat (chat akan di-assign ulang saat pesan berikutnya)
// ---------------------------------------------------------------------------
loadBalanceRouter.delete("/assignments/:chatJid", async (req, res): Promise<void> => {
  const chatJid = decodeURIComponent(req.params.chatJid);
  await getDb()
    .delete(chatSessionAssignmentsTable)
    .where(eq(chatSessionAssignmentsTable.chatJid, chatJid));

  res.json({ message: `Assignment untuk ${chatJid} dihapus` });
});

// ---------------------------------------------------------------------------
// PUT /load-balance/assignments/:chatJid
// Pin manual: paksa chat ke sesi tertentu
// Body: { sessionId: string }
// ---------------------------------------------------------------------------
loadBalanceRouter.put("/assignments/:chatJid", async (req, res): Promise<void> => {
  const chatJid = decodeURIComponent(req.params.chatJid);
  const { sessionId } = req.body ?? {};

  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "sessionId wajib diisi" });
    return;
  }

  // Validasi sesi ada
  const [session] = await getDb()
    .select({ id: sessionsTable.id, name: sessionsTable.name })
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .catch(() => [] as any[]);

  if (!session) {
    res.status(404).json({ error: "Sesi tidak ditemukan" });
    return;
  }

  await getDb()
    .insert(chatSessionAssignmentsTable)
    .values({ chatJid, sessionId, assignedAt: new Date() })
    .onConflictDoUpdate({
      target: chatSessionAssignmentsTable.chatJid,
      set: { sessionId, assignedAt: new Date() },
    });

  logger.info({ chatJid, sessionId }, "Chat di-pin manual ke sesi");
  res.json({ chatJid, sessionId, sessionName: session.name, message: "Chat berhasil di-pin ke sesi" });
});
