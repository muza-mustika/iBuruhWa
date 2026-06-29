import { Router } from "express";
import { getDb, isDbReady } from "@workspace/db";
import { messagesTable } from "@workspace/db";
import { eq, desc, ilike, gte, lte, and, or } from "drizzle-orm";

export const messagesRouter = Router();

const serialize = (m: typeof messagesTable.$inferSelect) => ({
  id: m.id,
  sessionId: m.sessionId,
  from: m.from,
  pushName: m.pushName ?? null,
  text: m.text,
  matchedRuleId: m.matchedRuleId ?? null,
  actionTaken: m.actionTaken ?? null,
  repliedBySession: m.repliedBySession ?? null,
  repliedAt: m.repliedAt?.toISOString() ?? null,
  isProcessed: m.isProcessed,
  timestamp: m.timestamp.toISOString(),
});

messagesRouter.get("/", async (req, res): Promise<void> => {
  if (!isDbReady()) { res.json([]); return; }
  const q = req.query as Record<string, string | undefined>;
  const sessionId = q.sessionId;
  const search = q.search;
  const dateFrom = q.dateFrom;
  const dateTo = q.dateTo;
  const status = q.status;
  const rawLimit = Number(q.limit ?? 100);
  const rawOffset = Number(q.offset ?? 0);
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 100 : Math.min(rawLimit, 500);
  const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

  const conditions = [];
  if (sessionId) conditions.push(eq(messagesTable.sessionId, sessionId));
  if (search) conditions.push(or(ilike(messagesTable.text, `%${search}%`), ilike(messagesTable.from, `%${search}%`))!);
  if (dateFrom) conditions.push(gte(messagesTable.timestamp, new Date(dateFrom)));
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(messagesTable.timestamp, end));
  }
  if (status === "pending") conditions.push(eq(messagesTable.isProcessed, false));
  if (status === "processed") conditions.push(eq(messagesTable.isProcessed, true));

  const rows = await getDb()
    .select()
    .from(messagesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(messagesTable.timestamp))
    .limit(limit)
    .offset(offset);

  res.json(rows.map(serialize));
});
