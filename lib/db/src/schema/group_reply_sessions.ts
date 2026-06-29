import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const groupReplySessionsTable = pgTable("group_reply_sessions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  chatJid: text("chat_jid").notNull(),
  ruleGroupId: integer("rule_group_id").notNull(),
  botMessageId: text("bot_message_id").notNull(),
  botMessageKey: jsonb("bot_message_key").notNull(),
  waSessionId: text("wa_session_id").notNull(),
  replyCount: integer("reply_count").notNull().default(1),
  lastContent: text("last_content").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type GroupReplySession = typeof groupReplySessionsTable.$inferSelect;
