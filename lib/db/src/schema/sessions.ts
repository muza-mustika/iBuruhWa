import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionsTable = pgTable("sessions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("disconnected"),
  phoneNumber: text("phone_number"),
  messagesSent: integer("messages_sent").notNull().default(0),
  messagesReceived: integer("messages_received").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),

  // Device lock: 1 sesi hanya bisa dipakai 1 perangkat
  currentDeviceId: text("current_device_id"),
  currentDeviceInfo: text("current_device_info"),

  // Tracking penggunaan relatif
  lastUsedAt: timestamp("last_used_at"),
});

export const insertSessionSchema = createInsertSchema(sessionsTable);
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
