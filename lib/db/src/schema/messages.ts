import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const messagesTable = pgTable("messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sessionId: text("session_id").notNull(),
  from: text("from").notNull(),
  pushName: text("push_name"),
  text: text("text").notNull(),
  matchedRuleId: integer("matched_rule_id"),
  actionTaken: text("action_taken"),
  repliedBySession: text("replied_by_session"),
  repliedAt: timestamp("replied_at"),
  isProcessed: boolean("is_processed").notNull().default(false),
  lockToken: text("lock_token"),
  lockExpiresAt: timestamp("lock_expires_at"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messagesTable);
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
