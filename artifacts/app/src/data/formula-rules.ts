/**
 * Strukturirana pravila o parametrizacijskim formulama za MegaTischler.
 *
 * Jedinstveni izvor istine živi u `@workspace/formula-rules` (lib/formula-rules)
 * i dijeli ga backend system prompt. Ovaj modul samo re-eksportira te podatke
 * da se postojeće `@/data/formula-rules` putanje uvoza ne moraju mijenjati.
 *
 * READ-ONLY referenca za prikaz u aplikaciji.
 */

export * from "@workspace/formula-rules";
