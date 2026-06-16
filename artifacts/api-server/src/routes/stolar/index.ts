import { Router, type IRouter } from "express";
import { db, stolarEntries } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

export interface StolarEntry {
  pojam: string;
  definicija: string;
  zaključci: string[];
  timestamp: string;
}

export interface StolarKnowledge {
  entries: StolarEntry[];
}

function rowToEntry(row: typeof stolarEntries.$inferSelect): StolarEntry {
  return {
    pojam: row.pojam,
    definicija: row.definicija,
    zaključci: row.zakljucci,
    timestamp: row.createdAt.toISOString(),
  };
}

export async function readStolarKnowledge(): Promise<StolarKnowledge> {
  try {
    const rows = await db
      .select()
      .from(stolarEntries)
      .orderBy(asc(stolarEntries.createdAt));
    return { entries: rows.map(rowToEntry) };
  } catch {
    return { entries: [] };
  }
}

// GET /stolar — return all carpentry knowledge entries
router.get("/stolar", async (_req, res): Promise<void> => {
  const data = await readStolarKnowledge();
  res.json(data);
});

// GET /stolar/list — alias for listing all entries (used by Settings UI)
router.get("/stolar/list", async (_req, res): Promise<void> => {
  const data = await readStolarKnowledge();
  res.json(data);
});

// POST /stolar/infer — call Claude to generate carpentry conclusions from a definition
router.post("/stolar/infer", async (req, res): Promise<void> => {
  const body = (req.body as Record<string, unknown>) ?? {};
  const { pojam, definicija } = body as { pojam?: string; definicija?: string };

  if (!pojam || !definicija) {
    res.status(400).json({ error: "Polja 'pojam' i 'definicija' su obavezna." });
    return;
  }

  const prompt = `Stolar mi je objasnio sljedeći stolarski pojam:
Pojam: ${pojam}
Definicija: ${definicija}

Na temelju ove definicije, napravi maksimalno 8 SMISLENIH zaključaka koji su korisni za pisanje MegaTischler parametarskih formula i stolarski zanat.
Fokusiraj se na:
- Tipične mjere i dimenzije (u mm, npr. "standardni šulc je 2 mm na strani, 3 mm gore")
- Pravila vezana uz formule (npr. oduzimanje lufta od ukupne mjere)
- Materijale i debljine koje se standardno koriste
- Montažne odnose između elemenata
- Obrasce koji se ponavljaju u stolariji
- Što se mijenja ovisno o vrsti elementa

Vrati SAMO JSON niz stringova, bez ikakvih dodatnih objašnjenja, uvodnih rečenica ili teksta izvan JSON-a:
["zaključak 1", "zaključak 2", "zaključak 3"]`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    let zaključci: string[] = [];
    if (match) {
      try {
        zaključci = JSON.parse(match[0]) as string[];
      } catch {
        zaključci = [];
      }
    }

    res.json({ zaključci });
  } catch (err) {
    logger.error({ err }, "stolar/infer failed");
    res.status(500).json({ error: "Greška pri generiranju zaključaka." });
  }
});

// POST /stolar/save — save or update a carpentry knowledge entry (deduplicate by pojam)
router.post("/stolar/save", async (req, res): Promise<void> => {
  const body = (req.body as Record<string, unknown>) ?? {};
  const { pojam, definicija, zaključci } = body as {
    pojam?: string;
    definicija?: string;
    zaključci?: string[];
  };

  if (!pojam || !definicija) {
    res.status(400).json({ error: "Polja 'pojam' i 'definicija' su obavezna." });
    return;
  }

  const incomingZaključci = Array.isArray(zaključci) ? (zaključci as string[]) : [];

  try {
    const existing = await db
      .select()
      .from(stolarEntries)
      .where(sql`lower(${stolarEntries.pojam}) = lower(${pojam.trim()})`);

    let resultEntry: StolarEntry;

    if (existing.length > 0) {
      const row = existing[0];
      const merged = [...row.zakljucci];
      for (const z of incomingZaključci) {
        if (!merged.some((e) => e.toLowerCase() === z.toLowerCase())) {
          merged.push(z);
        }
      }
      const [updated] = await db
        .update(stolarEntries)
        .set({
          definicija: definicija.trim(),
          zakljucci: merged,
          createdAt: new Date(),
        })
        .where(eq(stolarEntries.id, row.id))
        .returning();
      resultEntry = rowToEntry(updated);
    } else {
      const [inserted] = await db
        .insert(stolarEntries)
        .values({
          pojam: pojam.trim(),
          definicija: definicija.trim(),
          zakljucci: incomingZaključci,
        })
        .returning();
      resultEntry = rowToEntry(inserted);
    }

    res.json({ ok: true, entry: resultEntry });
  } catch (err) {
    logger.error({ err }, "stolar/save failed");
    res.status(500).json({ error: "Greška pri zapisivanju stolarskog znanja." });
  }
});

// DELETE /stolar/:pojam — remove a carpentry knowledge entry by name
router.delete("/stolar/:pojam", async (req, res): Promise<void> => {
  const pojam = decodeURIComponent(req.params.pojam ?? "").trim();
  if (!pojam) {
    res.status(400).json({ error: "Pojam je obavezan." });
    return;
  }

  try {
    const deleted = await db
      .delete(stolarEntries)
      .where(sql`lower(${stolarEntries.pojam}) = lower(${pojam})`)
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: `Pojam '${pojam}' nije pronađen.` });
      return;
    }

    res.json({ ok: true, pojam });
  } catch (err) {
    logger.error({ err }, "stolar/delete failed");
    res.status(500).json({ error: "Greška pri brisanju pojma." });
  }
});

// PUT /stolar/:pojam — update definition and conclusions of an existing entry
router.put("/stolar/:pojam", async (req, res): Promise<void> => {
  const pojam = decodeURIComponent(req.params.pojam ?? "").trim();
  if (!pojam) {
    res.status(400).json({ error: "Pojam je obavezan." });
    return;
  }

  const body = (req.body as Record<string, unknown>) ?? {};
  const { definicija, zaključci } = body as { definicija?: string; zaključci?: string[] };

  if (!definicija) {
    res.status(400).json({ error: "Polje 'definicija' je obavezno." });
    return;
  }

  try {
    const existing = await db
      .select()
      .from(stolarEntries)
      .where(sql`lower(${stolarEntries.pojam}) = lower(${pojam})`);

    if (existing.length === 0) {
      res.status(404).json({ error: `Pojam '${pojam}' nije pronađen.` });
      return;
    }

    const row = existing[0];
    const [updated] = await db
      .update(stolarEntries)
      .set({
        definicija: definicija.trim(),
        zakljucci: Array.isArray(zaključci) ? zaključci : row.zakljucci,
        createdAt: new Date(),
      })
      .where(eq(stolarEntries.id, row.id))
      .returning();

    res.json({ ok: true, entry: rowToEntry(updated) });
  } catch (err) {
    logger.error({ err }, "stolar/update failed");
    res.status(500).json({ error: "Greška pri ažuriranju pojma." });
  }
});

export default router;
