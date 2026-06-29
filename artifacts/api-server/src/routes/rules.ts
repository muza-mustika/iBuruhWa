import { Router } from "express";
import { getDb, isDbReady } from "@workspace/db";
import { rulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const rulesRouter = Router();

const dbGuard = (_req: any, res: any, next: any) => {
  if (!isDbReady()) { res.status(503).json({ error: "Database belum dikonfigurasi." }); return; }
  next();
};
rulesRouter.use(dbGuard);

const serializeRule = (r: typeof rulesTable.$inferSelect) => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  replyText: r.replyText ?? null,
  webhookUrl: r.webhookUrl ?? null,
  webhookMethod: r.webhookMethod ?? null,
  forwardTo: r.forwardTo ?? null,
  sessionFilter: r.sessionFilter ?? null,
  groupId: r.groupId ?? null,
});

rulesRouter.get("/", async (_req, res): Promise<void> => {
  const rows = await getDb().select().from(rulesTable).orderBy(rulesTable.priority);
  res.json(rows.map(serializeRule));
});

rulesRouter.post("/", async (req, res): Promise<void> => {
  const d = req.body as Record<string, unknown>;
  if (!d.name || !d.matchType || !d.matchValue || !d.actionType) {
    res.status(400).json({ error: "Data tidak valid" }); return;
  }
  const [row] = await getDb().insert(rulesTable).values({
    name: String(d.name), matchType: String(d.matchType), matchValue: String(d.matchValue),
    actionType: String(d.actionType), replyText: d.replyText ? String(d.replyText) : null,
    webhookUrl: d.webhookUrl ? String(d.webhookUrl) : null, webhookMethod: d.webhookMethod ? String(d.webhookMethod) : "POST",
    forwardTo: d.forwardTo ? String(d.forwardTo) : null, isActive: d.isActive !== false,
    priority: Number(d.priority ?? 0), sessionFilter: d.sessionFilter ? String(d.sessionFilter) : null,
    groupId: d.groupId != null ? Number(d.groupId) : null,
  }).returning();
  res.status(201).json(serializeRule(row));
});

rulesRouter.get("/:ruleId", async (req, res): Promise<void> => {
  const id = Number(req.params.ruleId);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  const rows = await getDb().select().from(rulesTable).where(eq(rulesTable.id, id));
  if (!rows.length) { res.status(404).json({ error: "Aturan tidak ditemukan" }); return; }
  res.json(serializeRule(rows[0]));
});

rulesRouter.patch("/:ruleId", async (req, res): Promise<void> => {
  const id = Number(req.params.ruleId);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  const updates: Record<string, unknown> = {};
  const b = req.body as Record<string, unknown>;
  const fields = ["name","matchType","matchValue","actionType","replyText","webhookUrl","webhookMethod","forwardTo","isActive","priority","sessionFilter","groupId"];
  for (const f of fields) if (b[f] !== undefined) updates[f] = b[f];
  const [row] = await getDb().update(rulesTable).set(updates).where(eq(rulesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Aturan tidak ditemukan" }); return; }
  res.json(serializeRule(row));
});

rulesRouter.delete("/:ruleId", async (req, res): Promise<void> => {
  const id = Number(req.params.ruleId);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  await getDb().delete(rulesTable).where(eq(rulesTable.id, id));
  res.status(204).send();
});
