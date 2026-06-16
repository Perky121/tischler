import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db, nauciEntries } from "@workspace/db";
import { asc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const dataDir = path.resolve(workspaceRoot, "artifacts/api-server/data");
const knowledgeBasePath = path.join(dataDir, "knowledge_base.json");

export interface NauciPitanje {
  pitanje: string;
  odgovor: string;
}

export interface NauciEntry {
  id: string;
  sadržaj: string;
  pitanja: NauciPitanje[];
  zaključci: string[];
  moduli: string[];
  timestamp: string;
}

export interface NauciKnowledge {
  entries: NauciEntry[];
}

function rowToEntry(row: typeof nauciEntries.$inferSelect): NauciEntry {
  return {
    id: row.id,
    sadržaj: row.sadrzaj,
    pitanja: (row.pitanja as NauciPitanje[]) ?? [],
    zaključci: row.zakljucci,
    moduli: row.moduli,
    timestamp: row.createdAt.toISOString(),
  };
}

export async function readNauciKnowledge(): Promise<NauciKnowledge> {
  try {
    const rows = await db
      .select()
      .from(nauciEntries)
      .orderBy(asc(nauciEntries.createdAt));
    return { entries: rows.map(rowToEntry) };
  } catch {
    return { entries: [] };
  }
}

function readKnowledgeBase(): { formulas: Array<{ formula: string; module: string; type: string }> } {
  try {
    if (fs.existsSync(knowledgeBasePath)) {
      return JSON.parse(fs.readFileSync(knowledgeBasePath, "utf-8")) as {
        formulas: Array<{ formula: string; module: string; type: string }>;
      };
    }
  } catch {
    // ignore
  }
  return { formulas: [] };
}

/** Select up to `limit` formulas most relevant to `text` by simple keyword overlap. */
function selectRelevantFormulas(
  formulas: Array<{ formula: string; module: string; type: string }>,
  text: string,
  limit = 60,
): Array<{ formula: string; module: string; type: string }> {
  const words = text
    .toLowerCase()
    .split(/[\s_\-./,;:()[\]]+/)
    .filter((w) => w.length >= 3);

  if (words.length === 0) return formulas.slice(0, limit);

  const scored = formulas.map((f) => {
    const haystack = `${f.formula} ${f.module}`.toLowerCase();
    const score = words.filter((w) => haystack.includes(w)).length;
    return { f, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.f);
}

// GET /nauci — return all parametrization knowledge entries
router.get("/nauci", async (_req, res): Promise<void> => {
  const data = await readNauciKnowledge();
  res.json(data);
});

// POST /nauci/start — generate follow-up questions based on existing knowledge
router.post("/nauci/start", async (req, res): Promise<void> => {
  const body = (req.body as Record<string, unknown>) ?? {};
  const { sadržaj } = body as { sadržaj?: string };

  if (!sadržaj?.trim()) {
    res.status(400).json({ error: "Polje 'sadržaj' je obavezno." });
    return;
  }

  const nauciData = await readNauciKnowledge();
  const kb = readKnowledgeBase();
  const relevantFormulas = selectRelevantFormulas(kb.formulas, sadržaj, 60);

  // Build context summary for existing parametrization rules
  const existingRules =
    nauciData.entries.length > 0
      ? nauciData.entries
          .slice(-20)
          .map((e) => `• ${e.sadržaj.slice(0, 120)}`)
          .join("\n")
      : "Nema prethodno naučenih pravila.";

  // Build formula context (module + formula, compact)
  const formulaContext = relevantFormulas
    .slice(0, 40)
    .map((f) => `[${f.module}] ${f.formula}`)
    .join("\n");

  // Distinct modules in kb
  const allModules = [...new Set(kb.formulas.map((f) => f.module))].join(", ");

  const prompt = `Ti si ekspert za MegaTischler parametrizaciju kuhinjskog namještaja.

Korisnik želi naučiti AI sljedeće pravilo/obrazac iz svog iskustva:
"""
${sadržaj.trim()}
"""

POSTOJEĆA NAUČENA PRAVILA:
${existingRules}

UZORAK FORMULA IZ BAZE (relevantne prema unosu):
${formulaContext || "Nema relevantnih formula."}

DOSTUPNI MODULI: ${allModules}

Tvoj zadatak: Postavi točno 4 KONKRETNA follow-up pitanja koja će pomoći da ovo pravilo bude što preciznije i korisnije za pisanje MegaTischler parametarskih formula.

Pitanja trebaju biti:
- Specifična za MegaTischler (moduli, parametri, formule)
- Usmjerena na iznimke, rubne slučajeve ili kontekst primjene
- Korisna za razumijevanje KADA i KAKO se pravilo primjenjuje
- Kratka i jasna (ne dulja od 1 rečenice)

NE pitaj opće pitanje. Fokusiraj se na parametrizaciju i rad s programom.

Vrati SAMO JSON niz od 4 stringa bez ikakvog uvoda ili teksta izvan JSON-a:
["pitanje 1", "pitanje 2", "pitanje 3", "pitanje 4"]`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    let pitanja: string[] = [];
    if (match) {
      try {
        pitanja = JSON.parse(match[0]) as string[];
      } catch {
        pitanja = [];
      }
    }
    pitanja = pitanja.slice(0, 5);

    res.json({ pitanja });
  } catch (err) {
    logger.error({ err }, "nauci/start failed");
    res.status(500).json({ error: "Greška pri generiranju pitanja." });
  }
});

// POST /nauci/save — save enriched parametrization rule with conclusions
router.post("/nauci/save", async (req, res): Promise<void> => {
  const body = (req.body as Record<string, unknown>) ?? {};
  const { sadržaj, pitanja: rawPitanja } = body as {
    sadržaj?: string;
    pitanja?: Array<{ pitanje: string; odgovor: string }>;
  };

  if (!sadržaj?.trim()) {
    res.status(400).json({ error: "Polje 'sadržaj' je obavezno." });
    return;
  }

  const pitanja: NauciPitanje[] = Array.isArray(rawPitanja)
    ? (rawPitanja as NauciPitanje[]).filter((p) => p.pitanje?.trim())
    : [];

  const qaContext =
    pitanja.length > 0
      ? pitanja
          .map((p) =>
            p.odgovor?.trim()
              ? `Pitanje: ${p.pitanje}\nOdgovor: ${p.odgovor}`
              : `Pitanje: ${p.pitanje}\nOdgovor: (bez odgovora)`,
          )
          .join("\n\n")
      : "Nema dodatnih odgovora.";

  const kb = readKnowledgeBase();
  const allModules = [...new Set(kb.formulas.map((f) => f.module))].join(", ");

  const prompt = `Ti si ekspert za MegaTischler parametrizaciju kuhinjskog namještaja.

Korisnik je naučio AI sljedeće pravilo:
"""
${sadržaj.trim()}
"""

DODATNI KONTEKST iz follow-up pitanja:
${qaContext}

DOSTUPNI MODULI U MEGATISCHLER BAZI: ${allModules}

Tvoj zadatak:
1. Generiraj 4–8 KONKRETNIH zaključaka koji opisuju ovo pravilo za MegaTischler parametrizaciju.
   Zaključci trebaju biti:
   - Precizni (konkretni parametri, dimenzije, moduli gdje je poznato)
   - Primjenjivi (kad i kako koristiti ovo pravilo)
   - Konzistentni s MegaTischler konvencijama (decimalni separator je zarez)
   - Kratki (max 1-2 rečenice po zaključku)

2. Navedi koji MegaTischler MODULI su relevantni (samo one koje si siguran, iz liste dostupnih modula).
   Ako pravilo vrijedi opće (ne vezano za modul), vrati prazan niz.

Vrati SAMO JSON bez ikakvog uvoda ili teksta izvan JSON-a, točno ovaj format:
{
  "zaključci": ["zaključak 1", "zaključak 2"],
  "moduli": ["MODUL1", "MODUL2"]
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    let zaključci: string[] = [];
    let moduli: string[] = [];
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as { zaključci?: string[]; moduli?: string[] };
        zaključci = Array.isArray(parsed.zaključci) ? parsed.zaključci : [];
        moduli = Array.isArray(parsed.moduli) ? parsed.moduli : [];
      } catch {
        zaključci = [];
        moduli = [];
      }
    }

    const id = crypto
      .createHash("sha1")
      .update(sadržaj.trim() + Date.now())
      .digest("hex")
      .slice(0, 12);

    const [inserted] = await db
      .insert(nauciEntries)
      .values({
        id,
        sadrzaj: sadržaj.trim(),
        pitanja: pitanja,
        zakljucci: zaključci,
        moduli: moduli,
      })
      .returning();

    res.json({ ok: true, entry: rowToEntry(inserted) });
  } catch (err) {
    logger.error({ err }, "nauci/save failed");
    res.status(500).json({ error: "Greška pri generiranju zaključaka." });
  }
});

export default router;
