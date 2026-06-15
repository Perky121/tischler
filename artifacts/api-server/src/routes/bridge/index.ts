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

    // Separate new (not yet loaded) from already-loaded files; include both but mark clearly
    const newFiles = manifest.filter(f => !f.alreadyLoaded && f.action !== "skip");
    const loadedFiles = manifest.filter(f => f.alreadyLoaded && f.action !== "skip");

    const newFilesText = newFiles.length > 0
      ? newFiles.map(f => `- ${f.filename} (${f.folder}, ${f.sizeKb} KB, tip: ${f.label})`).join("\n")
      : "(nema novih datoteka)";

    const loadedFilesText = loadedFiles.length > 0
      ? loadedFiles.slice(0, 20).map(f => `- ${f.filename} (${f.folder}, ${f.sizeKb} KB) ✓ već u bazi`).join("\n")
      : "(nema)";

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
- Datoteke označene "✓ već u bazi" su već uvezene — preporuči ih samo ako je zadatak direktno vezan uz njihov sadržaj
- Prioritiziraj NOVE datoteke (bez ✓) — one donose novu vrijednost

Vrati ISKLJUČIVO valjan JSON bez ikakvih markdown blokova, teksta ili objašnjenja izvan JSON-a.
Format: { "recommendations": [ { "filename": "...", "folder": "...", "fullPath": "...", "action": "import-mac"|"read-text"|"hex-probe", "reason": "...", "priority": "high"|"medium"|"low" } ] }`;

    const userMessage = `Korisnikov zadatak: "${task}"

NOVE datoteke (još nisu u bazi znanja):
${newFilesText}

Datoteke već u bazi znanja:
${loadedFilesText}

Koje datoteke preporučuješ pročitati za ovaj zadatak? Ako nema novih datoteka, možeš preporučiti već učitane ako su relevantne.`;

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

// ── POST /api/bridge/agent-chat ───────────────────────────────────────────────
// Streaming SSE: conversational Bridge agent with manifest + findings context.
router.post("/bridge/agent-chat", async (req, res): Promise<void> => {
  try {
    const { messages, manifest, findings, isGreeting } = req.body as {
      messages: Array<{ role: string; content: string }>;
      manifest: Array<{ filename: string; folder: string; fullPath: string; sizeKb: number; label: string; action: string; alreadyLoaded: boolean }>;
      findings: Record<string, { knowledge: string; action: string }>;
      isGreeting?: boolean;
    };

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendEvent = (data: string) => {
      res.write(`data: ${JSON.stringify({ delta: data })}\n\n`);
    };

    const allFiles = manifest || [];

    // Group ALL files by lowercase extension so AI sees every file
    const byExt: Record<string, typeof allFiles> = {};
    for (const f of allFiles) {
      const dotIdx = f.filename.lastIndexOf(".");
      const ext = dotIdx >= 0 ? f.filename.slice(dotIdx + 1).toLowerCase() : "bez_ext";
      if (!byExt[ext]) byExt[ext] = [];
      byExt[ext].push(f);
    }

    // Sort extensions: mac first, then alphabetically
    const extOrder = ["mac", ...Object.keys(byExt).filter(e => e !== "mac").sort()];

    const macLoadedCount = (byExt["mac"] || []).filter(f => f.alreadyLoaded).length;

    let manifestSummary: string;
    if (allFiles.length === 0) {
      manifestSummary = "(Baza nije skenirana — korisnik treba odabrati MegaTischler instalacijski direktorij)";
    } else {
      const lines: string[] = [
        `Dostupne datoteke u MegaTischler instalaciji (${allFiles.length} ukupno, ${macLoadedCount} .mac modula u bazi znanja):`,
      ];
      for (const ext of extOrder) {
        const group = byExt[ext];
        if (!group?.length) continue;
        const loadedInGroup = group.filter(f => f.alreadyLoaded).length;
        lines.push(`\n[.${ext}] — ${group.length} datoteka${loadedInGroup ? ` (${loadedInGroup} u bazi)` : ""}:`);
        for (const f of group) {
          lines.push(`  ${f.filename} (${f.sizeKb} KB, ${f.fullPath})${f.alreadyLoaded ? " ✓ u bazi" : ""}`);
        }
      }
      manifestSummary = lines.join("\n");
    }

    const findingsEntries = Object.entries(findings || {});
    const findingsSummary = findingsEntries.length > 0
      ? `\n\nVeć analizirane datoteke:\n${findingsEntries.map(([name, data]) => `### ${name}\n${data.knowledge}`).join("\n\n")}`
      : "";

    const systemPrompt = `Ti si Bridge Agent — AI asistent specijaliziran za istraživanje MegaTischler CAD instalacije.
Odgovaraš na HRVATSKOM. Tvoj posao je pregledati popis datoteka, procijeniti njihovu važnost i pomoći korisniku razumjeti što koja datoteka radi.

${manifestSummary}${findingsSummary}

SPOSOBNOSTI:
- Vidiš KOMPLETAN popis svih datoteka grupiranih po ekstenziji (prikazan gore)
- Možeš pregledavati datoteke po imenu, ekstenziji, veličini ili putanji
- Možeš procijeniti važnost svake datoteke za razumijevanje MegaTischler-a
- Možeš predložiti čitanje/analizu bilo koje datoteke iz popisa

KAKO PREPORUČITI DATOTEKE ZA ČITANJE:
Dodaj <suggest_files> tag s JSON nizom: { filename, fullPath, action }
Primjer: <suggest_files>[{"filename":"KUH_VISOKI.mac","fullPath":"C:\\\\MegaCAD\\\\Mac\\\\KUH_VISOKI.mac","action":"import-mac"}]</suggest_files>

AKCIJE po tipu:
- .mac → "import-mac" (parsira parametarske formule)
- .def, .cfg, .ini, .txt i datoteke bez ekstenzije → "read-text" (čita kao tekst)
- .mdb, .bhr i drugi binarni → "hex-probe" (identificira format)

PROCJENA VAŽNOSTI — tipično u MegaTischler instalaciji:
- .mac moduli = srce sustava (parametri i formule za pozicioniranje dijelova)
- Datoteke bez ekstenzije (CMDPAR, DIMVAL, LAYGRP...) = konfiguracijske varijable
- .def = definicije elemenata ili materijala
- .cfg/.ini = postavke programa
- .mdb = Access baze (materijali, vijci, okovi)

PRAVILA:
- Navodi TOČNE nazive i putanje datoteka iz manifesta iznad
- Decimalni separator u MegaTischler formulama je uvijek ZAREZ (0,5 — ne 0.5)
- Datoteke označene ✓ su već u bazi — ne treba ih ponovo uvoziti osim za dodatne uvide
- Ako korisnik pita o specifičnom tipu datoteke, pronađi sve datoteke tog tipa iz popisa${isGreeting ? `

Ovo je AUTOMATSKA INICIJALNA PORUKA. Pozdravi kratko i izvijesti:
1. Koliko datoteka ukupno vidiš i kojim ekstenzijama (samo kratki pregled)
2. Koliko .mac modula je već u bazi
3. Koji ti se čine najzanimljiviji za analizu (top 3-5 prijedloga s razlogom)
Budi konkretan — navedi stvarna imena datoteka iz manifesta.` : ""}`;

    const apiMessages: Array<{ role: "user" | "assistant"; content: string }> = isGreeting
      ? [{ role: "user", content: "Zdravo!" }]
      : (messages || []).filter(m => m.content?.trim()).map(m => ({
          role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
          content: m.content,
        }));

    if (!apiMessages.length) {
      apiMessages.push({ role: "user", content: "Zdravo!" });
    }

    const stream = anthropic.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: systemPrompt,
      messages: apiMessages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        sendEvent(event.delta.text);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    logger.error({ err }, "bridge/agent-chat error");
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Greška pri generiranju odgovora" })}\n\n`);
      res.end();
    }
  }
});

// ── POST /api/bridge/research-summary ─────────────────────────────────────────
// Streaming SSE: takes research query + file findings, returns formatted answer.
router.post("/bridge/research-summary", async (req, res): Promise<void> => {
  try {
    const { query, findings } = req.body as {
      query: string;
      findings: Array<{ filename: string; action: string; knowledge: string }>;
    };

    if (!query || !Array.isArray(findings)) {
      res.status(400).json({ error: "query i findings su obavezni" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendEvent = (data: string) => {
      res.write(`data: ${JSON.stringify({ delta: data })}\n\n`);
    };

    const kb = readKb();
    const findingsText = findings
      .map(f => `### ${f.filename}\n${f.knowledge || "(nema uvida)"}`)
      .join("\n\n");

    const stream = anthropic.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: `Ti si ekspert za MegaTischler CAD parametrizaciju. Odgovaraš na pitanja korisnika na temelju istraživanja MegaTischler datoteka.
Baza znanja sadrži ${kb.formulas?.length ?? 0} formula i ${(kb.parameters as unknown[])?.length ?? 0} parametara.
Decimalni separator u formulama je uvijek ZAREZ (0,5 — ne 0.5).

FORMAT ODGOVORA:
- Odgovaraj na HRVATSKOM
- Kad god postoje konkretne formule ili koraci, koristi worklist format:
  kratki uvod, zatim \`\`\`worklist blok s JSON nizom steps gdje svaki korak ima: title, where, formula, hint
- Ako nema formula, odgovori tekstualno s ključnim uvidima`,
      messages: [{
        role: "user",
        content: `Korisnikov upit: "${query}"\n\nPronađeno u MegaTischler datotekama:\n\n${findingsText}`,
      }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        sendEvent(event.delta.text);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    logger.error({ err }, "bridge/research-summary error");
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Greška pri generiranju odgovora" })}\n\n`);
      res.end();
    }
  }
});

export default router;
