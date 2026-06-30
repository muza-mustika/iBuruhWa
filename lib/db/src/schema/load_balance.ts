import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Tabel affinitas chat → sesi untuk load balancing.
 * Setiap chat (remoteJid) di-pin ke satu sessionId agar:
 * - Tidak ada dua sesi yang membalas chat yang sama
 * - Beban balasan terbagi merata antar sesi
 */
export const chatSessionAssignmentsTable = pgTable("chat_session_assignments", {
  chatJid: text("chat_jid").primaryKey(),
  sessionId: text("session_id").notNull(),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  messageCount: integer("message_count").notNull().default(0),
  lastMessageAt: timestamp("last_message_at"),
});

export const insertChatSessionAssignmentSchema = createInsertSchema(chatSessionAssignmentsTable);
export type InsertChatSessionAssignment = z.infer<typeof insertChatSessionAssignmentSchema>;
export type ChatSessionAssignment = typeof chatSessionAssignmentsTable.$inferSelect;
