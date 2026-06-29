import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import path from "path";
import fs from "fs";
import { toDataURL } from "qrcode";
import { getDb, getPool, isDbReady } from "@workspace/db";
import { sessionsTable, rulesTable, messagesTable, appSettingsTable, groupReplySessionsTable } from "@workspace/db";
import { eq, asc, and, sql, gt } from "drizzle-orm";
import { logger } from "./logger";
import { eventBus } from "../routes/events";
import axios from "axios";
import { randomUUID } from "crypto";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const AUTH_DIR = path.resolve(workspaceRoot, "artifacts/api-server/wa-auth");

export const SERVER_ID = process.env.SERVER_ID ?? `srv_${randomUUID().slice(0, 8)}`;

const LOCK_TTL_MS = 30_000;
// Sesi grup balasan kadaluarsa setelah 6 jam tidak ada aktivitas
const GROUP_REPLY_TTL_MS = 6 * 60 * 60 * 1000;

interface SessionState {
  socket: WASocket | null;
  qr: string | null;
}

class WAManager {
  private sessions: Map<string, SessionState> = new Map();

  getQr(sessionId: string): string | null {
    return this.sessions.get(sessionId)?.qr ?? null;
  }

  private async getSetting(key: string, defaultVal: number): Promise<number> {
    if (!isDbReady()) return defaultVal;
    try {
      const rows = await getDb().select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
      return Number(rows[0]?.value ?? defaultVal) || defaultVal;
    } catch { return defaultVal; }
  }

  private async getTypingDelay(textLength: number): Promise<number> {
    if (!isDbReady()) return 1200;
    try {
      const rows = await getDb().select().from(appSettingsTable).where(
        sql`${appSettingsTable.key} IN ('typingDelayMin', 'typingDelayMax', 'antiBanEnabled')`
      );
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key] = r.value;
      if (map.antiBanEnabled === "false") return 0;
      const minMs = Number(map.typingDelayMin ?? 800);
      const maxMs = Number(map.typingDelayMax ?? 3000);
      const charDelay = Math.min(textLength * 40, 2500);
      const jitter = Math.random() * (maxMs - minMs);
      return Math.max(minMs, Math.min(maxMs, charDelay + jitter));
    } catch { return 1200 + Math.random() * 1000; }
  }

  private async claimMessage(messageId: number): Promise<boolean> {
    if (!isDbReady()) return false;
    const lockExpiry = new Date(Date.now() + LOCK_TTL_MS);
    try {
      const result = await getPool().query(
        `UPDATE messages 
         SET lock_token = $1, lock_expires_at = $2
         WHERE id = $3 
           AND (lock_token IS NULL OR lock_expires_at < NOW())
           AND is_processed = false
         RETURNING id`,
        [SERVER_ID, lockExpiry, messageId]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      logger.error({ err, messageId }, "claimMessage gagal");
      return false;
    }
  }

  private async markMessageProcessed(
    messageId: number,
    sessionId: string,
    actionTaken: string | null,
    matchedRuleId: number | null
  ): Promise<void> {
    if (!isDbReady()) return;
    await getDb()
      .update(messagesTable)
      .set({ isProcessed: true, repliedBySession: sessionId, repliedAt: new Date(), actionTaken, matchedRuleId })
      .where(eq(messagesTable.id, messageId))
      .catch((err) => logger.error({ err }, "Gagal tandai pesan diproses"));
  }

  private emitSessionUpdate(sessionId: string) {
    if (!isDbReady()) return;
    getDb().select().from(sessionsTable).where(eq(sessionsTable.id, sessionId))
      .then(([s]) => s && eventBus.emit("session", { ...s, createdAt: s.createdAt.toISOString() }))
      .catch(() => {});
  }

  /**
   * Update lastUsedAt pada sesi — dipanggil setiap ada aktivitas kirim/terima pesan.
   */
  private touchSessionActivity(sessionId: string): void {
    if (!isDbReady()) return;
    getDb()
      .update(sessionsTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(sessionsTable.id, sessionId))
      .catch(() => {});
  }

  /**
   * Cari atau buat sesi grup balasan.
   */
  private async getGroupReplySession(chatJid: string, ruleGroupId: number) {
    if (!isDbReady()) return null;
    const now = new Date();
    const rows = await getDb()
      .select()
      .from(groupReplySessionsTable)
      .where(
        and(
          eq(groupReplySessionsTable.chatJid, chatJid),
          eq(groupReplySessionsTable.ruleGroupId, ruleGroupId),
          gt(groupReplySessionsTable.expiresAt, now)
        )
      )
      .limit(1)
      .catch(() => []);
    return rows[0] ?? null;
  }

  private async upsertGroupReplySession(
    chatJid: string,
    ruleGroupId: number,
    waSessionId: string,
    botMessageId: string,
    botMessageKey: object,
    content: string
  ): Promise<void> {
    if (!isDbReady()) return;
    const expiresAt = new Date(Date.now() + GROUP_REPLY_TTL_MS);
    await getDb()
      .insert(groupReplySessionsTable)
      .values({ chatJid, ruleGroupId, botMessageId, botMessageKey, waSessionId, replyCount: 1, lastContent: content, expiresAt })
      .catch((err) => logger.error({ err }, "Gagal simpan sesi kumulatif"));
  }

  private async incrementGroupReplySession(id: number, newContent: string): Promise<void> {
    if (!isDbReady()) return;
    const expiresAt = new Date(Date.now() + GROUP_REPLY_TTL_MS);
    await getDb()
      .update(groupReplySessionsTable)
      .set({
        replyCount: sql`${groupReplySessionsTable.replyCount} + 1`,
        lastContent: newContent,
        expiresAt,
      })
      .where(eq(groupReplySessionsTable.id, id))
      .catch((err) => logger.error({ err }, "Gagal update sesi grup balasan"));
  }

  async startSession(sessionId: string): Promise<void> {
    const existing = this.sessions.get(sessionId);
    if (existing?.socket) await this.stopSession(sessionId);

    const authDir = path.join(AUTH_DIR, sessionId);
    fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: logger.child({ module: "baileys", sessionId }) as any,
      browser: ["iBuruhWa", "Chrome", "1.0.0"],
      generateHighQualityLinkPreview: false,
      getMessage: async () => ({ conversation: "" }),
    });

    this.sessions.set(sessionId, { socket: sock, qr: null });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update: { connection?: string; lastDisconnect?: { error?: unknown }; qr?: string }) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await toDataURL(qr);
          const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, "");
          const sess = this.sessions.get(sessionId);
          if (sess) sess.qr = base64;
        } catch (err) { logger.error({ err, sessionId }, "Gagal buat QR"); }
        if (isDbReady()) {
          await getDb().update(sessionsTable).set({ status: "connecting" }).where(eq(sessionsTable.id, sessionId)).catch(() => {});
          this.emitSessionUpdate(sessionId);
          eventBus.emit("session", { sessionId, qr: this.sessions.get(sessionId)?.qr, status: "connecting" });
        }
      }

      if (connection === "close") {
        const sess = this.sessions.get(sessionId);
        if (sess) sess.qr = null;

        const boomErr = (lastDisconnect?.error) as Boom | undefined;
        const statusCode = boomErr?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401;

        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          if (isDbReady()) {
            await getDb().update(sessionsTable).set({ status: "banned" }).where(eq(sessionsTable.id, sessionId)).catch(() => {});
          }
          fs.rmSync(path.join(AUTH_DIR, sessionId), { recursive: true, force: true });
        } else {
          if (isDbReady()) {
            await getDb().update(sessionsTable).set({ status: "disconnected" }).where(eq(sessionsTable.id, sessionId)).catch(() => {});
          }
        }
        this.emitSessionUpdate(sessionId);

        if (shouldReconnect) {
          logger.info({ sessionId, statusCode }, "Reconnect dalam 5 detik");
          setTimeout(() => this.startSession(sessionId), 5000);
        }
      } else if (connection === "open") {
        const sess = this.sessions.get(sessionId);
        if (sess) sess.qr = null;

        const phone = sock.user?.id?.split(":")[0] ?? null;
        if (isDbReady()) {
          await getDb().update(sessionsTable)
            .set({ status: "connected", phoneNumber: phone, lastUsedAt: new Date() })
            .where(eq(sessionsTable.id, sessionId)).catch(() => {});
          this.emitSessionUpdate(sessionId);
        }
        logger.info({ sessionId, phone, serverId: SERVER_ID }, "Sesi terhubung");
        this.processOfflineQueue(sessionId, sock).catch((err) =>
          logger.error({ err, sessionId }, "Gagal proses antrian offline")
        );
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }: { messages: any[]; type: string }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        const from = msg.key.remoteJid ?? "";
        const pushName = msg.pushName ?? null;
        const text = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? "";
        if (!text || !isDbReady()) continue;

        const allowGroup = await this.getSetting("allowGroupMessages", 1);
        if (from.includes("@g.us") && !allowGroup) continue;

        const inserted = await getDb().insert(messagesTable).values({
          sessionId, from, pushName, text, isProcessed: false,
        }).returning({ id: messagesTable.id }).catch((err: unknown) => {
          logger.error({ err }, "Gagal simpan pesan"); return [];
        });
        if (!inserted.length) continue;
        const messageId = inserted[0].id;

        // Update counter dan lastUsedAt saat menerima pesan
        await getDb().execute(
          sql`UPDATE sessions SET messages_received = messages_received + 1, last_used_at = NOW() WHERE id = ${sessionId}`
        ).catch(() => {});

        const msgRow = { id: messageId, sessionId, from, pushName, text, isProcessed: false, timestamp: new Date().toISOString(), repliedBySession: null, repliedAt: null, actionTaken: null, matchedRuleId: null };
        eventBus.emit("message", msgRow);

        await this.processStoredMessage(messageId, sessionId, from, pushName, text, sock);
      }
    });
  }

  private async processStoredMessage(
    messageId: number, sessionId: string, from: string,
    pushName: string | null, text: string, sock: WASocket
  ): Promise<void> {
    if (!isDbReady()) return;

    const maintenanceRows = await getDb().select().from(appSettingsTable).where(eq(appSettingsTable.key, "maintenanceMode")).catch(() => []);
    if (maintenanceRows[0]?.value === "true") return;

    const claimed = await this.claimMessage(messageId);
    if (!claimed) {
      logger.info({ sessionId, messageId, serverId: SERVER_ID }, "Pesan sudah diklaim sesi/server lain");
      return;
    }

    const rules = await getDb().select().from(rulesTable).where(eq(rulesTable.isActive, true)).orderBy(asc(rulesTable.priority));

    let matchedRule: (typeof rules)[0] | null = null;
    for (const rule of rules) {
      if (rule.sessionFilter && rule.sessionFilter !== sessionId) continue;
      if (this.matchRule(rule, text)) { matchedRule = rule; break; }
    }

    let actionTaken: string | null = null;

    if (matchedRule) {
      if (matchedRule.actionType === "reply" && matchedRule.replyText) {
        // Mode Pesan Berkelompok: aturan dengan groupId akan mengedit pesan bot sebelumnya
        if (matchedRule.groupId != null) {
          actionTaken = await this.handleGroupReplyEdit(
            sessionId, from, matchedRule.groupId, matchedRule.replyText, sock
          );
        } else {
          try {
            await sock.sendPresenceUpdate("composing", from);
            const delay = await this.getTypingDelay(matchedRule.replyText.length);
            if (delay > 0) await new Promise((r) => setTimeout(r, delay));
            await sock.sendPresenceUpdate("paused", from);
            await sock.sendMessage(from, { text: matchedRule.replyText });
            // Update counter dan lastUsedAt saat kirim pesan
            await getDb().execute(
              sql`UPDATE sessions SET messages_sent = messages_sent + 1, last_used_at = NOW() WHERE id = ${sessionId}`
            ).catch(() => {});
            actionTaken = "reply";
          } catch (err) { logger.error({ err, sessionId, messageId }, "Gagal kirim balasan"); actionTaken = "reply_failed"; }
        }
      } else if (matchedRule.actionType === "webhook" && matchedRule.webhookUrl) {
        const wRows = await getDb().select().from(appSettingsTable).where(eq(appSettingsTable.key, "webhookGlobalEnabled")).catch(() => []);
        if (wRows[0]?.value !== "false") {
          try {
            const method = (matchedRule.webhookMethod ?? "POST").toUpperCase();
            const grpSession = matchedRule.groupId != null
              ? await this.getGroupReplySession(from, matchedRule.groupId)
              : null;
            const payload = {
              sessionId, from, pushName, text,
              ruleId: matchedRule.id,
              groupId: matchedRule.groupId,
              serverId: SERVER_ID,
              ...(grpSession ? { editedMessageId: grpSession.botMessageId, replyCount: grpSession.replyCount + 1 } : {}),
            };
            if (method === "GET") await axios.get(matchedRule.webhookUrl, { params: payload });
            else await axios.post(matchedRule.webhookUrl, payload);
            this.touchSessionActivity(sessionId);
            actionTaken = "webhook";
          } catch (err) { logger.error({ err, sessionId }, "Webhook gagal"); actionTaken = "webhook_failed"; }
        }
      } else if (matchedRule.actionType === "forward" && matchedRule.forwardTo) {
        try {
          const fwdText = `[Dari: ${from}] ${text}`;
          await sock.sendPresenceUpdate("composing", matchedRule.forwardTo);
          const delay = await this.getTypingDelay(fwdText.length);
          if (delay > 0) await new Promise((r) => setTimeout(r, delay));
          await sock.sendPresenceUpdate("paused", matchedRule.forwardTo);
          await sock.sendMessage(matchedRule.forwardTo, { text: fwdText });
          this.touchSessionActivity(sessionId);
          actionTaken = "forward";
        } catch (err) { logger.error({ err, sessionId }, "Forward gagal"); }
      }
    }

    await this.markMessageProcessed(messageId, sessionId, actionTaken, matchedRule?.id ?? null);

    eventBus.emit("message", { id: messageId, sessionId, from, pushName, text, isProcessed: true, actionTaken, repliedBySession: sessionId, repliedAt: new Date().toISOString(), timestamp: new Date().toISOString() });
  }

  /**
   * Tangani logika Pesan Berkelompok:
   * - Cek apakah sudah ada sesi aktif untuk chat + kelompok ini
   * - Jika belum → kirim pesan baru, simpan sesi
   * - Jika sudah → edit pesan bot sebelumnya
   */
  private async handleGroupReplyEdit(
    sessionId: string,
    chatJid: string,
    ruleGroupId: number,
    replyText: string,
    sock: WASocket
  ): Promise<string> {
    try {
      const existingSession = await this.getGroupReplySession(chatJid, ruleGroupId);

      if (!existingSession) {
        await sock.sendPresenceUpdate("composing", chatJid);
        const delay = await this.getTypingDelay(replyText.length);
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        await sock.sendPresenceUpdate("paused", chatJid);

        const sent = await sock.sendMessage(chatJid, { text: replyText });
        if (sent?.key?.id) {
          await this.upsertGroupReplySession(chatJid, ruleGroupId, sessionId, sent.key.id, sent.key as object, replyText);
          logger.info({ chatJid, ruleGroupId, msgId: sent.key.id }, "Kelompok: pesan baru dikirim");
        }
        await getDb().execute(
          sql`UPDATE sessions SET messages_sent = messages_sent + 1, last_used_at = NOW() WHERE id = ${sessionId}`
        ).catch(() => {});
        return "group_reply_new";
      } else {
        const botKey = existingSession.botMessageKey as proto.IMessageKey;
        const replyCount = existingSession.replyCount + 1;
        const updatedContent = `${replyText}\n\n_(Diperbarui ${replyCount}x)_`;

        try {
          await sock.sendMessage(chatJid, {
            edit: botKey,
            text: updatedContent,
          } as any);

          await this.incrementGroupReplySession(existingSession.id, updatedContent);
          logger.info({ chatJid, ruleGroupId, replyCount, msgId: existingSession.botMessageId }, "Kelompok: pesan diedit");
          await getDb().execute(
            sql`UPDATE sessions SET messages_sent = messages_sent + 1, last_used_at = NOW() WHERE id = ${sessionId}`
          ).catch(() => {});
          return "group_reply_edit";
        } catch (editErr) {
          logger.warn({ editErr, chatJid, ruleGroupId }, "Edit pesan kelompok gagal, kirim pesan baru & reset sesi");
          await getDb().delete(groupReplySessionsTable).where(eq(groupReplySessionsTable.id, existingSession.id)).catch(() => {});

          const sent = await sock.sendMessage(chatJid, { text: replyText });
          if (sent?.key?.id) {
            await this.upsertGroupReplySession(chatJid, ruleGroupId, sessionId, sent.key.id, sent.key as object, replyText);
          }
          await getDb().execute(
            sql`UPDATE sessions SET messages_sent = messages_sent + 1, last_used_at = NOW() WHERE id = ${sessionId}`
          ).catch(() => {});
          return "group_reply_reset";
        }
      }
    } catch (err) {
      logger.error({ err, chatJid, ruleGroupId }, "handleGroupReplyEdit gagal");
      return "group_reply_failed";
    }
  }

  private async processOfflineQueue(sessionId: string, sock: WASocket): Promise<void> {
    if (!isDbReady()) return;
    const now = new Date();
    const pending = await getDb().select().from(messagesTable)
      .where(and(eq(messagesTable.isProcessed, false), sql`(${messagesTable.lockToken} IS NULL OR ${messagesTable.lockExpiresAt} < ${now})`))
      .orderBy(asc(messagesTable.timestamp)).limit(100).catch(() => []);

    if (!pending.length) return;
    logger.info({ sessionId, count: pending.length }, "Memproses antrian pesan offline");

    for (const msg of pending) {
      await this.processStoredMessage(msg.id, sessionId, msg.from, msg.pushName ?? null, msg.text, sock);
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  private matchRule(rule: { matchType: string; matchValue: string }, text: string): boolean {
    const t = text.toLowerCase();
    const v = rule.matchValue.toLowerCase();
    switch (rule.matchType) {
      case "exact": return t === v;
      case "contains": return t.includes(v);
      case "keyword": return t.split(/\s+/).some((w) => w === v);
      case "regex": try { return new RegExp(rule.matchValue, "i").test(text); } catch { return false; }
      default: return false;
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    const sess = this.sessions.get(sessionId);
    if (sess?.socket) {
      try { await sess.socket.logout(); } catch { sess.socket.end(undefined); }
    }
    this.sessions.delete(sessionId);
  }

  async sendMessage({ to, text, sessionId }: { to: string; text: string; sessionId?: string }): Promise<{ success: boolean; sessionId: string; messageId: string | null; error: string | null }> {
    let targetId = sessionId;

    if (!targetId) {
      const connected = [...this.sessions.entries()].filter(([, s]) => s.socket !== null);
      if (!connected.length) return { success: false, sessionId: "", messageId: null, error: "Tidak ada sesi aktif" };

      if (isDbReady()) {
        const sessionStats = await getDb().select({ id: sessionsTable.id, sent: sessionsTable.messagesSent })
          .from(sessionsTable).where(eq(sessionsTable.status, "connected")).catch(() => [] as { id: string; sent: number }[]);
        const connectedIds = new Set(connected.map(([id]) => id));
        const eligible = sessionStats.filter((s) => connectedIds.has(s.id));
        if (eligible.length > 0) {
          eligible.sort((a, b) => a.sent - b.sent);
          targetId = eligible[0].id;
        } else {
          targetId = connected[Math.floor(Math.random() * connected.length)][0];
        }
      } else {
        targetId = connected[Math.floor(Math.random() * connected.length)][0];
      }
    }

    const sess = this.sessions.get(targetId!);
    if (!sess?.socket) return { success: false, sessionId: targetId!, messageId: null, error: "Sesi tidak terhubung" };

    try {
      const jid = to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`;
      const result = await sess.socket.sendMessage(jid, { text });
      if (isDbReady()) {
        // Update counter dan lastUsedAt saat sendMessage dipanggil langsung
        await getDb().execute(
          sql`UPDATE sessions SET messages_sent = messages_sent + 1, last_used_at = NOW() WHERE id = ${targetId}`
        ).catch(() => {});
      }
      return { success: true, sessionId: targetId!, messageId: result?.key?.id ?? null, error: null };
    } catch (err: any) {
      logger.error({ err, sessionId: targetId }, "sendMessage gagal");
      return { success: false, sessionId: targetId!, messageId: null, error: err?.message ?? "Error tidak diketahui" };
    }
  }

  async resumeAllSessions(): Promise<void> {
    if (!isDbReady()) return;
    const sessions = await getDb().select().from(sessionsTable);
    for (const sess of sessions) {
      if (sess.status !== "banned") {
        logger.info({ sessionId: sess.id, serverId: SERVER_ID }, "Melanjutkan sesi");
        await getDb().update(sessionsTable).set({ status: "connecting" }).where(eq(sessionsTable.id, sess.id)).catch(() => {});
        this.startSession(sess.id).catch((err) => logger.error({ err, sessionId: sess.id }, "Gagal melanjutkan sesi"));
      }
    }
  }
}

export const waManager = new WAManager();
