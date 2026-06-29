import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rulesTable = pgTable("rules", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  matchType: text("match_type").notNull().default("contains"),
  matchValue: text("match_value").notNull(),
  actionType: text("action_type").notNull().default("reply"),
  replyText: text("reply_text"),
  webhookUrl: text("webhook_url"),
  webhookMethod: text("webhook_method").default("POST"),
  forwardTo: text("forward_to"),
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  sessionFilter: text("session_filter"),
  groupReplyMode: boolean("group_reply_mode").notNull().default(false),
  groupId: integer("group_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRuleSchema = createInsertSchema(rulesTable);
export type InsertRule = z.infer<typeof insertRuleSchema>;
export type Rule = typeof rulesTable.$inferSelect;
