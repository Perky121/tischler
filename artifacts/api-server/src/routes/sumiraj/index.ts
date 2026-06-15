import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../../lib/logger";
import { readNauciKnowledge, type NauciEntry } from "../nauci";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const router: IRouter = Router();

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const nauciKnowledgePath = path.join(
  workspaceRoot,
  "artifacts/api-server/data/nauci_znanje.json",
);

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SumirajStavka {
  id: string;
  pravilo: string;
  obrazloženje: string;
  moduli: string[];
}

// POST /sumiraj/start — analyse conversation history, extract up to 6 rules
router.post("/sumiraj/start", async (req, res): Promise<void> => {
  const body = (req.body as Record<string, unknown>) ?? {};
  const { history } = body as { history?: ChatMessage[] };

  if (!Array.isArray(history) || history.length === 0) {
    res.status(400).json({ error: "Polje 'history' je obavezno i mora biti niz poruka." });
    return;
  }

  // Build conversation transcript (last 40 messages max)
  const recent = history.slice(-40);
  const transcript = recent
    .map((m) => `${m.role === "user" ? "KORISNIK" : "AI"}: ${m.content.slice(0, 600)}`)
    .join("\n\n");

  // Existing rules for context (to avoid duplicates)
  const nauciData = readNauciKnowledge();
  const existingRules =
    nauciData.entries.length > 0
      ? nauciData.entries
          .slice(-15)
          .map((e) => `• ${e.sadržaj.slice(0, 100)}`)
          .join("\n")
      : "Nema prethodno naučenih pravila.";

  const prompt = `Ti si ekspert za MegaTischler parametrizaciju kuhinjskog namještaja.

Analiziraj sljedeći razgovor između korisnika i AI asistenta:

--- RAZGOVOR ---
${transcript}
--- KRAJ RAZGOVORA ---

PRETHODNO NAUČENA PRAVILA (za izbjegavanje duplikata):
${existingRules}

Tvoj zadatak: Izvuci do 6 konkretnih, trajnih pravila ili obrazaca o MegaTischler parametrizaciji koje je korisnik implicitno ili eksplicitno poučio AI u ovom razgovoru.

Fokusiraj se na:
- Korekcije koje je korisnik napravio AI-u (npr. "ne, to nije ispravno, treba...")
- Pravila koja su se ponavljala u pitanjima (korisnik pita o istom problemu)
- Specifična MegaTischler ponašanja (moduli, parametri, formule, iznimke)
- Kontekstualna pravila (kada se nešto primjenjuje, a kada ne)

NE izvlači:
- Opće razgovore koji nemaju veze s parametrizacijom
- Duplikate postojećih pravila
- Trivijalne informacije

Vrati SAMO JSON niz bez ikakvog uvoda. Ako nema relevantnih pravila, vrati prazan niz [].

Format:
[
  {
    "id": "kratki-slug",
    "pravilo": "Kratko, konkretno pravilo u 1 rečenici",
    "obrazloženje": "Kontekst — kada i zašto ovo vrijedi (max 2 rečenice)",
    "moduli": ["MODUL1", "MODUL2"]
  }
]`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    let stavke: SumirajStavka[] = [];
    if (match) {
      try {
        stavke = JSON.parse(match[0]) as SumirajStavka[];
        // Ensure each item has required fields
        stavke = stavke
          .filter((s) => s.pravilo?.trim())
          .slice(0, 6)
          .map((s) => ({
            id: s.id?.trim() || crypto.randomBytes(4).toString("hex"),
            pravilo: s.pravilo.trim(),
            obrazloženje: s.obrazloženje?.trim() ?? "",
            moduli: Array.isArray(s.moduli) ? s.moduli : [],
          }));
      } catch {
        stavke = [];
      }
    }

    res.json({ stavke });
  } catch (err) {
    logger.error({ err }, "sumiraj/start failed");
    res.status(500).json({ error: "Greška pri analizi razgovora." });
  }
});

// POST /sumiraj/save — generate conclusions and persist confirmed entries
router.post("/sumiraj/save", async (req, res): Promise<void> => {
  const body = (req.body as Record<string, unknown>) ?? {};
  const { stavke: rawStavke } = body as { stavke?: Array<SumirajStavka & { korekcija?: string }> };

  if (!Array.isArray(rawStavke) || rawStavke.length === 0) {
    res.status(400).json({ error: "Nema stavki za spremanje." });
    return;
  }

  const stavke = rawStavke.filter((s) => s.pravilo?.trim());

  const savedEntries: NauciEntry[] = [];

  for (const stavka of stavke) {
    const sadržaj = stavka.korekcija?.trim() || stavka.pravilo.trim();
    const dodatniKontekst = stavka.obrazloženje?.trim() ?? "";

    const prompt = `Ti si ekspert za MegaTischler parametrizaciju kuhinjskog namještaja.

Pravilo koje treba zapamtiti:
"""
${sadržaj}
"""

Kontekst / obrazloženje:
${dodatniKontekst || "(nije navedeno)"}

Relevantni moduli: ${stavka.moduli?.join(", ") || "opće (nije vezano za modul)"}

Generiraj 3–6 konkretnih zaključaka koji opisuju ovo pravilo za MegaTischler parametrizaciju.
Zaključci trebaju biti precizni, kratki (max 1-2 rečenice) i primjenjivi pri pisanju formula.
Decimalni separator u formulama je uvijek zarez.

Vrati SAMO JSON bez uvoda:
{
  "zaključci": ["zaključak 1", "zaključak 2"],
  "moduli": ["MODUL1"]
}`;

    try {
      const response = await anthropic.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      });

      const raw =
        response.content[0]?.type === "text" ? response.content[0].text.trim() : "{}";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      let zaključci: string[] = [];
      let moduli: string[] = stavka.moduli ?? [];
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as {
            zaključci?: string[];
            moduli?: string[];
          };
          zaključci = Array.isArray(parsed.zaključci) ? parsed.zaključci : [];
          if (Array.isArray(parsed.moduli) && parsed.moduli.length > 0) {
            moduli = parsed.moduli;
          }
        } catch {
          zaključci = [];
        }
      }

      const id = crypto
        .createHash("sha1")
        .update(sadržaj + Date.now())
        .digest("hex")
        .slice(0, 12);

      savedEntries.push({
        id,
        sadržaj,
        pitanja: [],
        zaključci,
        moduli,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.error({ err, stavka: sadržaj }, "sumiraj/save: Claude call failed for stavka");
      // Still push with empty conclusions rather than failing completely
      savedEntries.push({
        id: crypto.randomBytes(6).toString("hex"),
        sadržaj,
        pitanja: [],
        zaključci: [],
        moduli: stavka.moduli ?? [],
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Persist all saved entries
  let data = readNauciKnowledge();
  data = { entries: [...data.entries, ...savedEntries] };
  fs.writeFileSync(nauciKnowledgePath, JSON.stringify(data, null, 2), "utf-8");

  res.json({ ok: true, saved: savedEntries.length, entries: savedEntries });
});

export default router;
