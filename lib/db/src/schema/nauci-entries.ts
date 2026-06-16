import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nauciEntries = pgTable("nauci_entries", {
  id: text("id").primaryKey(),
  sadrzaj: text("sadrzaj").notNull(),
  pitanja: jsonb("pitanja").notNull().default([]),
  zakljucci: text("zakljucci").array().notNull().default([]),
  moduli: text("moduli").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertNauciEntrySchema = createInsertSchema(nauciEntries).omit({
  createdAt: true,
});

export type NauciEntryRow = typeof nauciEntries.$inferSelect;
export type InsertNauciEntry = z.infer<typeof insertNauciEntrySchema>;
