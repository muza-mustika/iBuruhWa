import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const ruleGroupsTable = pgTable("rule_groups", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type RuleGroup = typeof ruleGroupsTable.$inferSelect;
