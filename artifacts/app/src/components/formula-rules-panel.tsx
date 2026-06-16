import { useState, useRef, useCallback } from "react";
import {
  COMPARISON_OPERATORS,
  LOGICAL_OPERATORS,
  OPERATORS_NOTE,
  FUNCTIONS,
  FUNCTIONS_NOTE,
  SYSTEM_VARIABLES,
  SYSTEM_VARIABLES_NOTE,
  MATERIAL_CODES,
  MATERIAL_CODES_NOTE,
  ANTI_PATTERNS,
  FORMULA_PATTERNS,
  LOGIC_SCOPE_NOTE,
  HIERARCHY,
  HIERARCHY_NAMED,
  HIERARCHY_NOTE,
  MODULE_TYPES,
  IFELSE_EXAMPLES,
  IFELSE_NOTE,
  DECIMAL_SEPARATOR_NOTE,
  EULER_NOTE,
  EULER_EXAMPLE,
  RULE_SECTIONS,
  type OperatorRow,
} from "@/data/formula-rules";
import {
  SlidersHorizontal,
  Sigma,
  FunctionSquare,
  Variable,
  AlertTriangle,
  Workflow,
  Network,
  Boxes,
  GitBranch,
  Hash,
  Move3d,
} from "lucide-react";

function SectionHeader({
  id,
  icon: Icon,
  title,
  subtitle,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div id={id} className="scroll-mt-2">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-primary flex-shrink-0" />
        <h3 className="text-sm font-bold tracking-tight">{title}</h3>
      </div>
      {subtitle && <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">{subtitle}</p>}
    </div>
  );
}

function NoteBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-muted-foreground leading-relaxed border-l-2 border-border pl-2.5 mt-2">
      {children}
    </p>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[11px] text-foreground/90 break-all">{children}</code>;
}

function OperatorTable({ rows, symbolHeader }: { rows: OperatorRow[]; symbolHeader: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="text-left font-medium px-2.5 py-1.5 w-[64px]">{symbolHeader}</th>
            <th className="text-left font-medium px-2.5 py-1.5">Značenje</th>
            <th className="text-right font-medium px-2.5 py-1.5 w-[56px]">Pojava</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} className="border-t border-border/60 align-top">
              <td className="px-2.5 py-1.5">
                <code className="font-mono text-primary font-semibold">{r.symbol}</code>
              </td>
              <td className="px-2.5 py-1.5 text-foreground/85 leading-snug">
                {r.meaning}
                {r.example && (
                  <div className="mt-0.5">
                    <Mono>{r.example}</Mono>
                  </div>
                )}
              </td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FormulaRulesPanel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(RULE_SECTIONS[0].id);

  const goTo = useCallback((id: string) => {
    setActive(id);
    const el = document.getElementById(id);
    const container = scrollRef.current;
    if (el && container) {
      container.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
    }
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Section nav */}
      <div className="flex-shrink-0 border-b border-border bg-card/60 px-3 py-2">
        <div className="flex flex-wrap gap-1.5">
          {RULE_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => goTo(s.id)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                active === s.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              data-testid={`rules-nav-${s.id}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight mb-1">Parametrizacija — pravila</h2>
          <p className="text-xs text-muted-foreground">
            Pravila izvučena analizom baze od 3438 formula, ugrađena u AI asistenta.
          </p>
        </div>

        {/* Operatori */}
        <section className="space-y-3">
          <SectionHeader id="operatori" icon={SlidersHorizontal} title="Operatori" />
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Usporedba</p>
            <OperatorTable rows={COMPARISON_OPERATORS} symbolHeader="Op" />
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Logički</p>
            <OperatorTable rows={LOGICAL_OPERATORS} symbolHeader="Op" />
          </div>
          <NoteBox>{OPERATORS_NOTE}</NoteBox>
        </section>

        {/* Funkcije */}
        <section className="space-y-3">
          <SectionHeader id="funkcije" icon={FunctionSquare} title="Funkcije" />
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left font-medium px-2.5 py-1.5">Funkcija</th>
                  <th className="text-left font-medium px-2.5 py-1.5">Značenje</th>
                  <th className="text-right font-medium px-2.5 py-1.5 w-[56px]">Pojava</th>
                </tr>
              </thead>
              <tbody>
                {FUNCTIONS.map((f) => (
                  <tr key={f.name} className="border-t border-border/60 align-top">
                    <td className="px-2.5 py-1.5">
                      <code className="font-mono text-primary text-[11px] break-all">{f.name}</code>
                    </td>
                    <td className="px-2.5 py-1.5 text-foreground/85 leading-snug">{f.meaning}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{f.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <NoteBox>{FUNCTIONS_NOTE}</NoteBox>
        </section>

        {/* Varijable i kodovi */}
        <section className="space-y-3">
          <SectionHeader
            id="varijable"
            icon={Variable}
            title="Sistemske varijable i materijalni kodovi"
            subtitle="Dva tipa nezagrađenih identifikatora — bez uglatih zagrada."
          />
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Sistemske varijable (POSW / POSD / POSH)
            </p>
            <OperatorTable rows={SYSTEM_VARIABLES} symbolHeader="Var" />
            <NoteBox>{SYSTEM_VARIABLES_NOTE}</NoteBox>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Materijalni kodovi</p>
            <div className="flex flex-wrap gap-1.5">
              {MATERIAL_CODES.map((c) => (
                <code
                  key={c}
                  className="font-mono text-[10px] bg-muted/50 border border-border rounded px-1.5 py-0.5 text-foreground/85"
                >
                  {c}
                </code>
              ))}
            </div>
            <NoteBox>{MATERIAL_CODES_NOTE}</NoteBox>
          </div>
        </section>

        {/* Česte greške */}
        <section className="space-y-3">
          <SectionHeader id="greske" icon={AlertTriangle} title="Česte greške (anti-patterns)" />
          <div className="space-y-2">
            {ANTI_PATTERNS.map((a) => (
              <div key={a.wrong} className="rounded-md border border-border bg-card/40 p-2.5">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1">
                    <span className="text-destructive text-xs">❌</span>
                    <code className="font-mono text-[11px] text-destructive/90 break-all line-through decoration-destructive/40">
                      {a.wrong}
                    </code>
                  </span>
                  <span className="text-muted-foreground text-xs">→</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="text-green-500 text-xs">✅</span>
                    <code className="font-mono text-[11px] text-green-400 break-all">{a.correct}</code>
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{a.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Obrasci */}
        <section className="space-y-3">
          <SectionHeader
            id="obrasci"
            icon={Workflow}
            title="Obrasci za pisanje formula"
            subtitle="Najčešći obrasci potvrđeni brojanjem u bazi."
          />
          <div className="space-y-2.5">
            {FORMULA_PATTERNS.map((p, i) => (
              <div key={p.title} className="rounded-md border border-border bg-card/40 p-3">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <span className="text-primary tabular-nums">{i + 1}.</span>
                    {p.title}
                  </h4>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0 mt-0.5">
                    {p.count}
                  </span>
                </div>
                <div className="rounded bg-muted/40 px-2 py-1.5 mb-1.5">
                  <Mono>{p.template}</Mono>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{p.description}</p>
                {p.example && (
                  <div className="mt-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Primjer: </span>
                    <Mono>{p.example}</Mono>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 flex gap-2">
            <Sigma className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-foreground/85 leading-relaxed">{LOGIC_SCOPE_NOTE}</p>
          </div>
        </section>

        {/* Hijerarhija */}
        <section className="space-y-3">
          <SectionHeader
            id="hijerarhija"
            icon={Network}
            title="Hijerarhija referenci"
            subtitle="Broj točaka određuje koliko razina prema gore referenca pokazuje (do 5 razina)."
          />
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left font-medium px-2.5 py-1.5 w-[70px]">Ref</th>
                  <th className="text-left font-medium px-2.5 py-1.5">Razina</th>
                </tr>
              </thead>
              <tbody>
                {HIERARCHY.map((h) => (
                  <tr key={h.ref} className="border-t border-border/60 align-top">
                    <td className="px-2.5 py-1.5">
                      <code className="font-mono text-primary font-semibold text-[11px]">{h.ref}</code>
                    </td>
                    <td className="px-2.5 py-1.5 text-foreground/85 leading-snug">
                      {h.meaning}
                      {h.example && (
                        <span className="text-muted-foreground">
                          {" "}
                          — <Mono>{h.example}</Mono>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Referenca s imenom elementa na putu
            </p>
            <div className="space-y-1">
              {HIERARCHY_NAMED.map((h) => (
                <div key={h.ref} className="flex items-baseline gap-2 text-[11px]">
                  <code className="font-mono text-primary font-semibold flex-shrink-0">{h.ref}</code>
                  <span className="text-muted-foreground leading-snug">{h.meaning}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
            <p className="text-[11px] text-foreground/85 leading-relaxed">{HIERARCHY_NOTE}</p>
          </div>
        </section>

        {/* Moduli */}
        <section className="space-y-3">
          <SectionHeader
            id="moduli"
            icon={Boxes}
            title="Dominantni tip formule po modulu"
            subtitle="Iz brojanja tipova formula po modulu u bazi."
          />
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left font-medium px-2.5 py-1.5 w-[110px]">Modul</th>
                  <th className="text-left font-medium px-2.5 py-1.5">Dominantni tip</th>
                </tr>
              </thead>
              <tbody>
                {MODULE_TYPES.map((m) => (
                  <tr key={m.module} className="border-t border-border/60 align-top">
                    <td className="px-2.5 py-1.5">
                      <code className="font-mono text-primary text-[11px]">{m.module}</code>
                    </td>
                    <td className="px-2.5 py-1.5 text-foreground/85 leading-snug">{m.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ifelse */}
        <section className="space-y-3">
          <SectionHeader id="ifelse" icon={GitBranch} title="ifelse — višestruki uvjet" />
          <NoteBox>{IFELSE_NOTE}</NoteBox>
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Primjeri iz baze</p>
            <div className="rounded-md border border-border bg-muted/20 p-2.5 space-y-1.5">
              {IFELSE_EXAMPLES.map((ex) => (
                <div key={ex}>
                  <Mono>{ex}</Mono>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Decimale */}
        <section className="space-y-3">
          <SectionHeader id="decimale" icon={Hash} title="Decimalni separator" />
          <NoteBox>{DECIMAL_SEPARATOR_NOTE}</NoteBox>
        </section>

        {/* EULER */}
        <section className="space-y-3">
          <SectionHeader id="euler" icon={Move3d} title="EULER koordinatna notacija" />
          <NoteBox>{EULER_NOTE}</NoteBox>
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Primjer</p>
            <div className="rounded-md border border-border bg-muted/20 p-2.5">
              <Mono>{EULER_EXAMPLE}</Mono>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
