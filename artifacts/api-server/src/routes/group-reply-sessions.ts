import { Router } from "express";
import { getDb, isDbReady, groupReplySessionsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "Database belum dikonfigurasi" });
  try {
    const { chatJid, ruleGroupId } = req.query as { chatJid?: string; ruleGroupId?: string };
    const now = new Date();

    const rows = await getDb()
      .select()
      .from(groupReplySessionsTable)
      .where(
        chatJid && ruleGroupId
          ? and(
              eq(groupReplySessionsTable.chatJid, chatJid),
              eq(groupReplySessionsTable.ruleGroupId, Number(ruleGroupId)),
              gt(groupReplySessionsTable.expiresAt, now)
            )
          : chatJid
          ? and(eq(groupReplySessionsTable.chatJid, chatJid), gt(groupReplySessionsTable.expiresAt, now))
          : ruleGroupId
          ? and(eq(groupReplySessionsTable.ruleGroupId, Number(ruleGroupId)), gt(groupReplySessionsTable.expiresAt, now))
          : gt(groupReplySessionsTable.expiresAt, now)
      );

    return res.json(
      rows.map((r) => ({
        ...r,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    logger.error({ err }, "Gagal ambil sesi kumulatif");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: "Database belum dikonfigurasi" });
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID tidak valid" });
  try {
    await getDb().delete(groupReplySessionsTable).where(eq(groupReplySessionsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Gagal hapus sesi kumulatif");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
