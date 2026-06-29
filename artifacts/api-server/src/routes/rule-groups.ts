import { Router } from "express";
import { getDb, isDbReady, ruleGroupsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", async (_req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "Database belum dikonfigurasi" });
  try {
    const rows = await getDb().select().from(ruleGroupsTable).orderBy(asc(ruleGroupsTable.name));
    return res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch (err) {
    logger.error({ err }, "Gagal ambil kelompok aturan");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "Database belum dikonfigurasi" });
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name?.trim()) return res.status(400).json({ error: "Nama kelompok diperlukan" });
  try {
    const rows = await getDb()
      .insert(ruleGroupsTable)
      .values({ name: name.trim(), description: description?.trim() || null })
      .returning();
    return res.status(201).json({ ...rows[0], createdAt: rows[0].createdAt.toISOString() });
  } catch (err) {
    logger.error({ err }, "Gagal buat kelompok aturan");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "Database belum dikonfigurasi" });
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID tidak valid" });
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name?.trim()) return res.status(400).json({ error: "Nama kelompok diperlukan" });
  try {
    const rows = await getDb()
      .update(ruleGroupsTable)
      .set({ name: name.trim(), description: description?.trim() || null })
      .where(eq(ruleGroupsTable.id, id))
      .returning();
    if (!rows.length) return res.status(404).json({ error: "Kelompok tidak ditemukan" });
    return res.json({ ...rows[0], createdAt: rows[0].createdAt.toISOString() });
  } catch (err) {
    logger.error({ err }, "Gagal update kelompok aturan");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "Database belum dikonfigurasi" });
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID tidak valid" });
  try {
    await getDb().delete(ruleGroupsTable).where(eq(ruleGroupsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Gagal hapus kelompok aturan");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
