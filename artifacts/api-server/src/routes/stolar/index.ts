import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const dataDir = path.resolve(workspaceRoot, "artifacts/api-server/data");
const stolarKnowledgePath = path.join(dataDir, "stolar_znanje.json");

export interface StolarEntry {
  pojam: string;
  definicija: string;
  zaključci: string[];
  timestamp: string;
}

export interface StolarKnowledge {
  entries: StolarEntry[];
}

export function readStolarKnowledge(): StolarKnowledge {
  try {
    if (fs.existsSync(stolarKnowledgePath)) {
      return JSON.parse(fs.readFileSync(stolarKnowledgePath, "utf-8")) as StolarKnowledge;
    }
  } catch {
    // ignore
  }
  return { entries: [] };
}

function writeStolarKnowledge(data: StolarKnowledge): void {
  fs.writeFileSync(stolarKnowledgePath, JSON.stringify(data, null, 2), "utf-8");
}

// GET /stolar — return all carpentry knowledge entries
router.get("/stolar", (req, res): void => {
  const data = readStolarKnowledge();
  res.json(data);
});

// GET /stolar/list — alias for listing all entries (used by Settings UI)
router.get("/stolar/list", (req, res): void => {
  const data = readStolarKnowledge();
  res.json(data);
});

// POST /stolar/infer — call Claude to generate carpentry conclusions from a definition
router.post("/stolar/infer", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown> ?? {};
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

    const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "[]";
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
router.post("/stolar/save", (req, res): void => {
  const body = req.body as Record<string, unknown> ?? {};
  const { pojam, definicija, zaključci } = body as {
    pojam?: string;
    definicija?: string;
    zaključci?: string[];
  };

  if (!pojam || !definicija) {
    res.status(400).json({ error: "Polja 'pojam' i 'definicija' su obavezna." });
    return;
  }

  const data = readStolarKnowledge();
  const existingIdx = data.entries.findIndex(
    (e) => e.pojam.toLowerCase() === pojam.toLowerCase().trim(),
  );

  const incomingZaključci = Array.isArray(zaključci) ? (zaključci as string[]) : [];

  const newEntry: StolarEntry = {
    pojam: pojam.trim(),
    definicija: definicija.trim(),
    zaključci: incomingZaključci,
    timestamp: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    // Merge zaključci — keep existing + add new ones that aren't duplicates
    const existing = data.entries[existingIdx].zaključci ?? [];
    const merged = [...existing];
    for (const z of incomingZaključci) {
      if (!merged.some((e) => e.toLowerCase() === z.toLowerCase())) {
        merged.push(z);
      }
    }
    newEntry.zaključci = merged;
    data.entries[existingIdx] = newEntry;
  } else {
    data.entries.push(newEntry);
  }

  try {
    writeStolarKnowledge(data);
    res.json({ ok: true, entry: newEntry });
  } catch (err) {
    logger.error({ err }, "stolar/save failed");
    res.status(500).json({ error: "Greška pri zapisivanju stolarskog znanja." });
  }
});

// DELETE /stolar/:pojam — remove a carpentry knowledge entry by name
router.delete("/stolar/:pojam", (req, res): void => {
  const pojam = decodeURIComponent(req.params.pojam ?? "").trim();
  if (!pojam) {
    res.status(400).json({ error: "Pojam je obavezan." });
    return;
  }

  const data = readStolarKnowledge();
  const idx = data.entries.findIndex(
    (e) => e.pojam.toLowerCase() === pojam.toLowerCase(),
  );

  if (idx < 0) {
    res.status(404).json({ error: `Pojam '${pojam}' nije pronađen.` });
    return;
  }

  data.entries.splice(idx, 1);

  try {
    writeStolarKnowledge(data);
    res.json({ ok: true, pojam });
  } catch (err) {
    logger.error({ err }, "stolar/delete failed");
    res.status(500).json({ error: "Greška pri brisanju pojma." });
  }
});

// PUT /stolar/:pojam — update definition and conclusions of an existing entry
router.put("/stolar/:pojam", (req, res): void => {
  const pojam = decodeURIComponent(req.params.pojam ?? "").trim();
  if (!pojam) {
    res.status(400).json({ error: "Pojam je obavezan." });
    return;
  }

  const body = req.body as Record<string, unknown> ?? {};
  const { definicija, zaključci } = body as { definicija?: string; zaključci?: string[] };

  if (!definicija) {
    res.status(400).json({ error: "Polje 'definicija' je obavezno." });
    return;
  }

  const data = readStolarKnowledge();
  const idx = data.entries.findIndex(
    (e) => e.pojam.toLowerCase() === pojam.toLowerCase(),
  );

  if (idx < 0) {
    res.status(404).json({ error: `Pojam '${pojam}' nije pronađen.` });
    return;
  }

  const updated: StolarEntry = {
    pojam: data.entries[idx].pojam,
    definicija: definicija.trim(),
    zaključci: Array.isArray(zaključci) ? zaključci : data.entries[idx].zaključci,
    timestamp: new Date().toISOString(),
  };

  data.entries[idx] = updated;

  try {
    writeStolarKnowledge(data);
    res.json({ ok: true, entry: updated });
  } catch (err) {
    logger.error({ err }, "stolar/update failed");
    res.status(500).json({ error: "Greška pri ažuriranju pojma." });
  }
});

export default router;
