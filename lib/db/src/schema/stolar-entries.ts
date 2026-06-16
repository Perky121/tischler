import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const stolarEntries = pgTable("stolar_entries", {
  id: serial("id").primaryKey(),
  pojam: text("pojam").notNull(),
  definicija: text("definicija").notNull(),
  zakljucci: text("zakljucci").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertStolarEntrySchema = createInsertSchema(stolarEntries).omit({
  id: true,
  createdAt: true,
});

export type StolarEntryRow = typeof stolarEntries.$inferSelect;
export type InsertStolarEntry = z.infer<typeof insertStolarEntrySchema>;
