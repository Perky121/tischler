import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../../lib/logger";
import { parseMacFile, mergeInto, type KnowledgeBase } from "../../lib/parse-mac";

const router: IRouter = Router();

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();
const dataDir = path.resolve(workspaceRoot, "artifacts/api-server/data");
const knowledgeBasePath = path.join(dataDir, "knowledge_base.json");

function readKb(): KnowledgeBase & Record<string, unknown> {
  try {
    if (fs.existsSync(knowledgeBasePath)) {
      return JSON.parse(fs.readFileSync(knowledgeBasePath, "utf-8"));
    }
  } catch { /* ignore */ }
  return { formulas: [], parameters: [], syntax_rules: [], _meta: { files_processed: 0 } } as unknown as KnowledgeBase & Record<string, unknown>;
}

function saveKb(kb: KnowledgeBase & Record<string, unknown>): void {
  fs.writeFileSync(knowledgeBasePath, JSON.stringify(kb, null, 2), "utf-8");
}

// ── POST /api/bridge/analyze-manifest ─────────────────────────────────────────
// AI reviews a file manifest and recommends which files are worth reading.
router.post("/bridge/analyze-manifest", async (req, res): Promise<void> => {
  try {
    const { task, manifest } = req.body as {
      task: string;
      manifest: Array<{ filename: string; folder: string; fullPath: string; sizeKb: number; label: string; action: string; alreadyLoaded: boolean }>;
    };

    if (!task || !Array.isArray(manifest)) {
      res.status(400).json({ error: "task i manifest su obavezni" });
      return;
    }

    // Filter out already-loaded and skip-action items for AI to review
    const reviewable = manifest.filter(f => !f.alreadyLoaded && f.action !== "skip");

    const manifestText = reviewable
      .map(f => `- ${f.filename} (${f.folder}, ${f.sizeKb} KB, tip: ${f.label})`)
      .join("\n");

    const systemPrompt = `Ti si ekspert za MegaTischler CAD software. Analiziraš sadržaj MegaTischler instalacijskog direktorija.
Tvoj zadatak je pregledati listu dostupnih datoteka i preporučiti koje od njih treba pročitati za konkretan korisnikov cilj.

PRAVILA:
- .mac datoteke sadrže parametarske formule — UVIJEK relevantne za parametrizaciju
- .def datoteke mogu sadržavati definicije elemenata, parametara ili konfiguraciju
- .cfg datoteke su konfiguracije softvera (korisne ako sadrže sistemske parametre)
- Datoteke bez ekstenzije (CMDPAR, DIMVAL, LAYGRP itd.) su tekstualne konfiguracije
- .mdb datoteke su Access baze (npr. Gewinde = baza vijaka/navoja)
- Binarni formati (.bhr, .mbt) — preporuči samo ako je zadatak vezan uz njihov sadržaj
- NE preporučuj .dll, .exe, .bat i slične binarne sistemske datoteke

Vrati ISKLJUČIVO valjan JSON bez ikakvih markdown blokova, teksta ili objašnjenja izvan JSON-a.
Format: { "recommendations": [ { "filename": "...", "folder": "...", "fullPath": "...", "action": "import-mac"|"read-text"|"hex-probe", "reason": "...", "priority": "high"|"medium"|"low" } ] }`;

    const userMessage = `Korisnikov zadatak: "${task}"

Dostupne datoteke u MegaTischler instalaciji:
${manifestText || "(nema datoteka za pregled)"}

Koje datoteke preporučuješ pročitati za ovaj zadatak? Obrazloži kratko zašto svaku.`;

    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText = response.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    // Parse JSON from response (strip any accidental markdown fences)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "AI nije vratio valjani JSON", raw: rawText.slice(0, 300) });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { recommendations: unknown[] };
    res.json(parsed);
  } catch (err) {
    logger.error({ err }, "bridge/analyze-manifest error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /api/bridge/analyze-file ─────────────────────────────────────────────
// AI reads a specific file and extracts useful knowledge.
router.post("/bridge/analyze-file", async (req, res): Promise<void> => {
  try {
    const { filename, contentBase64, action } = req.body as {
      filename: string;
      contentBase64: string;
      action: "import-mac" | "read-text" | "hex-probe";
    };

    if (!filename || !contentBase64 || !action) {
      res.status(400).json({ error: "filename, contentBase64 i action su obavezni" });
      return;
    }

    const buf = Buffer.from(contentBase64, "base64");

    // ── import-mac: parse formulas using existing parser ──────────────────────
    if (action === "import-mac") {
      const tmpPath = path.join(os.tmpdir(), `bridge-${Date.now()}-${filename}`);
      try {
        fs.writeFileSync(tmpPath, buf);
        const { formulas, params } = parseMacFile(tmpPath);

        // Build a preview KB for analysis (do not touch real KB)
        const previewKb: KnowledgeBase = { formulas: [], parameters: [], syntax_rules: [], elements: [], materials: [], modules: [], learned: { confirmed_formulas: [], confirmed_patterns: [], observations: [] } } as unknown as KnowledgeBase;
        mergeInto(previewKb, formulas, params);

        const sampleFormulas = previewKb.formulas.slice(0, 10)
          .map(f => f.formula)
          .join("\n");

        const response = await anthropic.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 1024,
          system: "Ti si ekspert za MegaTischler CAD parametrizaciju. Kratko opiši što si pronašao u ovom .mac modulu — koja vrsta namještaja, koji su ključni parametri, koji su tipični slučajevi korištenja.",
          messages: [{
            role: "user",
            content: `Modul: ${filename}\nBroj formula: ${previewKb.formulas.length}\nBroj parametara: ${previewKb.parameters.length}\n\nPrimjer formula:\n${sampleFormulas}\n\nOpiši ovaj modul u 2-3 rečenice.`,
          }],
        });

        const description = response.content
          .filter(b => b.type === "text")
          .map(b => (b as { type: "text"; text: string }).text)
          .join("").trim();

        res.json({
          action: "import-mac",
          formulaCount: previewKb.formulas.length,
          paramCount: previewKb.parameters.length,
          knowledge: description,
          questions: [],
          canSave: previewKb.formulas.length > 0,
          sampleFormulas: previewKb.formulas.slice(0, 5).map(f => ({ formula: f.formula, source: f.source })),
        });
      } finally {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      }
      return;
    }

    // ── read-text: decode as latin-1 text and let AI analyze ─────────────────
    if (action === "read-text") {
      const textContent = buf.toString("latin1");
      const truncated = textContent.slice(0, 8000); // max 8KB of text to AI

      const response = await anthropic.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1500,
        system: `Ti si ekspert za MegaTischler CAD software. Analiziraš tekstualnu konfiguracijsku datoteku iz MegaTischler instalacije.
Izvuci korisne informacije koje bi pomogle AI asistentu bolje razumjeti MegaTischler parametre, vrijednosti, elemente ili konfiguraciju.
Fokusiraj se na: parametre, numeričke vrijednosti, nazive elemenata, sistemske konstante, kodove materijala.
Vrati JSON: { "knowledge": "sažetak na hrvatskom", "insights": ["uvid 1", "uvid 2", ...], "questions": ["pitanje 1", ...], "useful": true|false }`,
        messages: [{
          role: "user",
          content: `Datoteka: ${filename}\n\nSadržaj:\n${truncated}`,
        }],
      });

      const rawText = response.content
        .filter(b => b.type === "text")
        .map(b => (b as { type: "text"; text: string }).text)
        .join("");

      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        res.json({ action: "read-text", knowledge: rawText.trim(), insights: [], questions: [], useful: true, canSave: true });
        return;
      }
      const parsed = JSON.parse(jsonMatch[0]) as { knowledge: string; insights: string[]; questions: string[]; useful: boolean };
      res.json({ action: "read-text", ...parsed, canSave: parsed.useful });
      return;
    }

    // ── hex-probe: send hex dump of first 4KB for format identification ───────
    if (action === "hex-probe") {
      const sample = buf.slice(0, 4096);
      const hexLines: string[] = [];
      for (let i = 0; i < sample.length; i += 16) {
        const chunk = sample.slice(i, i + 16);
        const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, "0")).join(" ");
        const ascii = Array.from(chunk).map(b => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
        hexLines.push(`${i.toString(16).padStart(4, "0")}: ${hex.padEnd(47)} | ${ascii}`);
      }
      const hexDump = hexLines.join("\n");

      const response = await anthropic.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1000,
        system: `Ti si ekspert za analizu binarnih formata datoteka. Pregledaš hex dump nepoznatog formata iz MegaTischler CAD instalacije.
Pokušaj identificirati: što je format, koji podaci su unutra, može li se koristiti za AI bazu znanja.
Vrati JSON: { "formatGuess": "...", "knowledge": "...", "questions": ["..."], "useful": true|false, "recommendation": "može li se parsirati i kako" }`,
        messages: [{
          role: "user",
          content: `Datoteka: ${filename} (${buf.length} bajtova)\n\nHex dump prvih ${Math.min(4096, buf.length)} bajtova:\n${hexDump}`,
        }],
      });

      const rawText = response.content
        .filter(b => b.type === "text")
        .map(b => (b as { type: "text"; text: string }).text)
        .join("");

      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        res.json({ action: "hex-probe", knowledge: rawText.trim(), questions: [], useful: false, canSave: false });
        return;
      }
      const parsed = JSON.parse(jsonMatch[0]) as { formatGuess: string; knowledge: string; questions: string[]; useful: boolean; recommendation: string };
      res.json({ action: "hex-probe", ...parsed, canSave: false });
      return;
    }

    res.status(400).json({ error: "Nepoznata action vrijednost" });
  } catch (err) {
    logger.error({ err }, "bridge/analyze-file error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /api/bridge/save-insight ─────────────────────────────────────────────
// Saves a text insight from a file into KB learned.observations.
router.post("/bridge/save-insight", (req, res): void => {
  try {
    const { source, insight, answeredQuestions } = req.body as {
      source: string;
      insight: string;
      answeredQuestions?: Array<{ question: string; answer: string }>;
    };

    if (!source || !insight) {
      res.status(400).json({ error: "source i insight su obavezni" });
      return;
    }

    const kb = readKb();
    if (!kb.learned) {
      (kb as Record<string, unknown>).learned = { confirmed_formulas: [], confirmed_patterns: [], observations: [] };
    }
    const learned = (kb as Record<string, unknown>).learned as { confirmed_formulas: unknown[]; confirmed_patterns: unknown[]; observations: Array<{ source: string; insight: string; timestamp: string; answeredQuestions?: unknown[] }> };
    if (!Array.isArray(learned.observations)) learned.observations = [];

    const entry = {
      source,
      insight,
      timestamp: new Date().toISOString(),
      ...(answeredQuestions?.length ? { answeredQuestions } : {}),
    };

    // Deduplicate by source — replace existing entry for same source
    const existingIdx = learned.observations.findIndex(o => o.source === source);
    if (existingIdx >= 0) {
      learned.observations[existingIdx] = entry;
    } else {
      learned.observations.push(entry);
    }

    saveKb(kb as KnowledgeBase & Record<string, unknown>);
    logger.info({ source }, "Bridge insight saved");
    res.json({ ok: true, observationCount: learned.observations.length });
  } catch (err) {
    logger.error({ err }, "bridge/save-insight error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
