import { Router } from "express";
import { getDb, isDbReady } from "@workspace/db";
import { sessionsTable, rulesTable, messagesTable } from "@workspace/db";
import { eq, gte, sql } from "drizzle-orm";

export const statsRouter = Router();

statsRouter.get("/", async (_req, res) => {
  if (!isDbReady()) {
    res.json({ totalSessions:0, activeSessions:0, totalRules:0, activeRules:0, messagesToday:0, messagesTotal:0, webhooksFired:0, pendingMessages:0 });
    return;
  }
  const [sessions, rules, messagesTotal, messagesToday, webhooksFired, pending] = await Promise.all([
    getDb().select().from(sessionsTable),
    getDb().select().from(rulesTable),
    getDb().select({ count: sql<number>`count(*)` }).from(messagesTable),
    getDb().select({ count: sql<number>`count(*)` }).from(messagesTable).where(
      gte(messagesTable.timestamp, new Date(new Date().setHours(0, 0, 0, 0)))
    ),
    getDb().select({ count: sql<number>`count(*)` }).from(messagesTable).where(eq(messagesTable.actionTaken, "webhook")),
    getDb().select({ count: sql<number>`count(*)` }).from(messagesTable).where(eq(messagesTable.isProcessed, false)),
  ]);

  res.json({
    totalSessions: sessions.length,
    activeSessions: sessions.filter((s) => s.status === "connected").length,
    totalRules: rules.length,
    activeRules: rules.filter((r) => r.isActive).length,
    messagesToday: Number(messagesToday[0]?.count ?? 0),
    messagesTotal: Number(messagesTotal[0]?.count ?? 0),
    webhooksFired: Number(webhooksFired[0]?.count ?? 0),
    pendingMessages: Number(pending[0]?.count ?? 0),
  });
});

statsRouter.get("/chart", async (_req, res) => {
  if (!isDbReady()) { res.json([]); return; }
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await getDb()
    .select({
      date: sql<string>`DATE(${messagesTable.timestamp})::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(messagesTable)
    .where(gte(messagesTable.timestamp, sevenDaysAgo))
    .groupBy(sql`DATE(${messagesTable.timestamp})`)
    .orderBy(sql`DATE(${messagesTable.timestamp})`);

  const filled: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const found = rows.find((r) => r.date === dateStr);
    filled.push({ date: dateStr, count: Number(found?.count ?? 0) });
  }
  res.json(filled);
});
