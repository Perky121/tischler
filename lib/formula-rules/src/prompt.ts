/**
 * Backend system-prompt blokovi za MegaTischler formule.
 *
 * Drže se UZ strukturirane podatke iz `display.ts` koji se prikazuju u
 * aplikaciji. Konstante koje se mogu čisto izvesti iz podataka (MODULE_DOMINANT_TYPE,
 * buildHierarchyGuide) izvode se ovdje — pa se ne mogu razići s prikazom. Prozni
 * blokovi (ANTI_PATTERNS_PROMPT, FUNCTIONS_AND_OPERATORS, FORMULA_PATTERNS_PROMPT)
 * provjeravaju se protiv `display.ts` u `consistency.ts`, koji pukne na razilaženje.
 */

import { HIERARCHY, HIERARCHY_NAMED, HIERARCHY_NOTE, MODULE_TYPES } from "./display";

/** Anti-patterns confirmed from actual .mac formula files — 100% verified. */
export const ANTI_PATTERNS_PROMPT = `ČESTE GREŠKE — NIKAD OVAKO:
❌  if(A!=B;...) →  ✅  if(A<>B;...) ("nije jednako" je <>, ne != )
❌  if(A,B,C)    →  ✅  if(A;B;C)   (separator argumenata je ; ne ,)
❌  [X]          →  ✅  [.X]         ([X] bez točke = GLOBALNI param; za roditelja uvijek [.X])
❌  if(A and B)  →  ✅  if((A) and (B)) (preporuka: grupiraj zagradama; OBAVEZNO kad miješaš and i or)

DECIMALNI SEPARATOR — važna nijansa (potvrđeno analizom baze):
✅  Za NOVI UNOS u MegaTischler dijalogu: koristi ZAREZ (0,5) — to je preporučeni format.
⚠️  U bazi postoji 68 formula (bez @-koordinatnih nizova) s decimalnom TOČKOM (npr. 26.7, (0.5), 53.5) — to su VALJANE formule
    iz izvornih .mac datoteka. NE proglašavaj ih pogrešnima i ne ispravljaj automatski.
    Iznimka: u EULER koordinatnim nizovima (x;y;z@...) decimalna točka je standardna.`;

/**
 * Guide for functions and operators extracted 100% from actual .mac formulas.
 * Counts are exact occurrence counts from the 10 641-formula knowledge base (66 .mac files).
 */
export const FUNCTIONS_AND_OPERATORS = `OPERATORI U FORMULAMA (potvrđeno iz .mac datoteka — baza 10 641 formula):
  ==    usporedba jednakosti       (5792 formula)  primjer: if([KDT]==3;0;1)
  =     usporedba jednakosti       (494 formula)   primjer: if([.VPST]=1;2;1) — oba oblika (= i ==) valjana
  <>    nije jednako               (18 formula)    primjer: if([...KOAP]<>1;1;0)
  >     veće od                    (2247 formula)
  <     manje od                   (241 formula)
  >=    veće ili jednako           (57 formula)
  <=    manje ili jednako          (113 formula)
  and   logički I                  (3448 formula)  primjer: if(([KDT]==1) and (POSW>200);...)
  or    logički ILI                (366 formula)   primjer: if(([.BST]==0) or ([.VSST]==1);...)
Napomena: AND/OR (velika slova) ekvivalentni and/or — oba oblika prisutna (AND:152, OR:116). Lowercase dominira: and 96%, or 68%. != se NE koristi (0 pojava).

SISTEMSKE VARIJABLE (bez uglatih zagrada — NE pisati [POSW]):
  POSW  — širina pozicije elementa u prostoru (225 formula)  primjer: if(POSW>200;[KDOSZI];0,5)
  POSD  — dubina pozicije elementa u prostoru (17 formula)
  POSH  — visina pozicije elementa u prostoru (23 formula)
Ove varijable MegaTischler automatski pruža — ne trebaju [] i ne mogu se postaviti kao parametri.

NEZAGRAĐENI IDENTIFIKATORI — DVA RAZLIČITA TIPA:
Tip 1 — SUSTAVNE VARIJABLE (MegaTischler automatski pruža): POSW, POSD, POSH
Tip 2 — MATERIJALNI KODOVI (konstante/šifre iz kataloga, vraća getmatdata ili ifelse grana):
  Primjeri: BL_ZIF_80M7_, VO_10_31_A100, VO_10_31_A150, GT_W60800, SCH_103309900, MH_STR7, MH_STR8, Z75, GTV, FIXNA
  Ovi identifikatori su KONSTANTE — nisu varijable, ne možeš ih postavljati ni mijenjati.
  U GetMatData kôd može imati #N sufiks (indeks polja podatka): GetMatData([.MatV];MH_STR7#4) — svih 10 GetMatData poziva u bazi koristi MH_STR7#4 ili MH_STR8#4.

SUFIKSI DIMENZIJA/POZICIJA (iza imena elementa — kažu KOJU veličinu čitaš):
  .T (3288 formula) — debljina elementa (thickness), najčešći sufiks
  .X (2058 formula) — pozicija po X osi
  .Z (2038 formula) — pozicija po Z osi (visinska)
  .Y (1877 formula) — pozicija po Y osi (dubinska)
  .W (979 formula)  — širina (width)
  .L (695 formula)  — duljina (length)
  .H (613 formula)  — visina (height)
  .D (605 formula)  — dubina (depth)
  .Rx/.Ry/.Rz (78/72/79 formula) — rotacije oko X/Y/Z osi (ulaze u euler())
Primjer: [.Pod.T] = debljina elementa Pod; [.StranicaL.X] = X pozicija StranicaL. Pozicijske osi (.X/.Y/.Z) i dimenzije (.W/.H/.L/.D/.T) prate isti element kroz hijerarhiju.

FUNKCIJE U FORMULAMA (potvrđeno iz .mac datoteka — baza 10 641 formula):
  if(uvjet;istina;laž)                       — 2-granični uvjet            (3857 formula)
  ifelse(u1;v1;u2;v2;...;zadano)             — višestruki uvjet (switch)   (496 formula)
  ABS(x)                                     — apsolutna vrijednost — UPPERCASE dominira 86% (432 formula: ABS:373, abs:59)
  NEG(x)                                     — u 94% poziva omata 0/1 zastavicu kao množač (744 formula: NEG:484, neg:260)
  sin(x)                                     — sinus (radijani) — uvijek MALA SLOVA (525 formula)
  cos(x)                                     — kosinus (radijani) — uvijek MALA SLOVA (257 formula)
  tan(x)                                     — tangens — uvijek MALA SLOVA   (51 formula)
  atan(x)                                    — arkustangens — uvijek MALA SLOVA (32 formula)
  MIN(a;b;...)                               — minimum                       (4 formula)
  MAX(a;b;...)                               — maksimum                      (95 formula)
  euler(...)                                 — 3D rotacijska matrica          (18 formula)
  ADD(x)                                     — dodaje korektivni iznos (često zazor/kerf ±18, ±5, ±4); može se nizati ADD(18)+ADD(18)  (21 formula)
  getmatdata(mat;ključ)                      — čita podatak o materijalu     (10 formula)
  STRCAT(s1;s2;...)                          — spaja tekst — uvijek UPPERCASE (100%) (5 formula)
  VAL(x)                                     — konverzija u broj — uvijek UPPERCASE (100%) (19 formula)
  r(radijus)                                 — zaobljenje/luk u koordinatnom nizu; SAMO unutar @-poligona kao Z-vrijednost točke (9 formula)
PAŽNJA — dokumentirane ali NE KORISTE SE u bazi (0 pojava): sqrt(), round(), int().
Trig funkcije su ISKLJUČIVO mala slova: sin(), cos(), tan(), atan() — nikad SIN(), COS(), TAN().

KOORDINATNA NOTACIJA — SAMOSTALNI POLIGONI (29 formula u bazi):
Format: X;Y;Z@X;Y;Z@X;Y;Z — niz 3D točaka odvojen s @, koordinate odvojene s ;
VAŽNO (potvrđeno 29/29): ovi koordinatni nizovi su SAMOSTALNA sirova vrijednost polja — NISU argument euler() funkcije (nijedna od 18 euler() formula ne sadrži @). Definiraju profil/put/izrez kao zasebnu geometrijsku vrijednost.
U koordinatnim nizovima decimalni separator je TOČKA (standardno): primjer 0;12.9;0@-7;16.9;0
Primjer: 0;0;0@0;12.9;0@-7;12.9;0@-7;16.9;0@0;18;0@-18;18;0@-18;0;0@0;0;0
ZAOBLJENJE/LUK U POLIGONU: r(radijus) na mjestu Z-koordinate točke označava da je taj vrh LUK zadanog polumjera (9 formula u bazi, ~25 poziva — isključivo unutar @-nizova). Primjer: [.W];-[.R];r([.R])@ — vrh na (X=[.W], Y=-[.R]) zaobljen je polumjerom [.R].
euler() (18 formula) NE koristi @-niz — uzima fiksni numerički niz rotacijske matrice (npr. 1;0;0;0;0;1;0;-1;0;…) i završava oznakom osi X:/Y:/Z:.

IFELSE — VIŠESTRUKI UVJET (switch/case sintaksa):
Koristiti kada ima 3+ grana — čišće od ugniježđenih if().
Format: ifelse(uvjet1;vrijednost1;uvjet2;vrijednost2;zadanaVrijednost)
Primjeri iz .mac datoteka:
  ifelse([KOAP]==1;50;[KOOL]==0;20;[KOOL]==1;35;50)
  ifelse([KDOS]==0;0,5;[KDOS]==1;2;45)
  ifelse([KUT]<90;1;[KUT]>90;0;2)
  ifelse([.KODS]==0;0;[.KODS]==4;[.MaskaGoreHor.T];[.MSS]+[.MSZRG])
PRAVILO STRUKTURE (potvrđeno 477/477 poziva): ifelse uvijek ima NEPARAN broj argumenata (parovi uvjet;vrijednost + jedna zadana vrijednost na kraju). Distribucija: 3 args (8×), 5 args (238× — najčešće), 7 args (14×), 9 args (214× — drugo po redu), 15+ args (3×).

USPOREDBE — VRIJEDNOSTI (potvrđeno brojanjem cijele baze):
• Jednakost (== ili =): desna strana je UVIJEK cijeli broj ILI [referenca] — NIKAD decimala. Vrijednost je mali kod/način, gotovo uvijek 0–9. Dakle == testira KATEGORIJU (npr. [KDT]==1), ne mjeru.
• Uvjeti praktički nikad ne koriste decimalne pragove: u svim usporedbama samo JEDNA poznata iznimka ima decimalu (POSH<738,1). Pragovi su cijeli brojevi ili [reference].
• if() ima TOČNO 3 argumenta — if(uvjet;istina;laž) (3734/3736 poziva if(); brojimo POZIVE, ne formule — jedna formula može imati više if()). Jedina iznimka: interne LangSupp validacijske formule.`;

/**
 * Recurring formula-writing templates extracted 100% from actual .mac formulas.
 * Every count below is an exact occurrence count from the 10 641-formula knowledge base.
 */
export const FORMULA_PATTERNS_PROMPT = `OBRASCI ZA PISANJE FORMULA (potvrđeno brojanjem u bazi 10 641 formula):

1) BOOLEAN-PREKIDAČ bez if() —  [ZASTAVICA]*A - NEG([ZASTAVICA])*B   (639× — 94% svih NEG poziva)
   U 94% slučajeva NEG() omata jednu 0/1 zastavicu kao množač. Najčešće zastavice: BST(149×), BDN(131×), BSL(119×), BSD(116×), BU(58×).
   Alternativa za if() kad je uvjet samo 0/1.
   Primjer iz baze: [.Y]-NEG([.BSL])*[.ODU]-[.OSLZ]   (119×)

2) ABS() OKO RAZLIKE POZICIJA —  ABS(pozA - (offset) - (pozB + debljinaB))   (432 formula)
   Dominantni obrazac (90%): ABS(x-y) za apsolutnu razliku. Koristi se za dimenziju kao razmak između dva pozicionirana elementa.
   Primjer iz baze: ABS([.Strop.Z]-(0)-([.Pod.Z]+[.Pod.T]+(0)))

3) DIJELJENJE S 2 —  .../2   (konstanta 2 javlja se učestalo — treća najčešća iza 0 i 1)
   Obrazac koji se često koristi za centriranje ili podjelu prostora na pola.
   Primjer iz baze: ([H]-[IDEP1])/2

4) RELATIVNO NA RODITELJA —  [.X]+[.W]-[T]   (11× identično ponavljanje)
   Čest obrazac za pozicioniranje uz rub roditelja: pozicija roditelja + širina − debljina.

5) KUT IZ DVIJE STRANICE —  atan([IS]/[ID])   (10×)
   Obrazac za računanje nagiba iz dvije veličine (npr. dijagonalni rez).

6) ČISTI PRIJENOS VRIJEDNOSTI —  [.X]   (2055× — 19,3% cijele baze, NAJČEŠĆI oblik formule!)
   Cijela formula je SAMO jedna [referenca], bez ijedne operacije. Parametar nasljeđuje vrijednost roditelja/globala 1:1.
   Kad vrijednost dolazi izravno odnekud, NE piši aritmetiku — samo referenciraj. Primjer: [.W] ili [...KZ].

7) EKSPLICITNI (0) SLOT ZA ZAZOR —  pozA + debljinaA + (0)   (402 formula, 400× kao +/- offset slot)
   Konstanta u zagradama (0) je NAMJERNI prazni slot za zazor/razmak koji je trenutno nula, ali ga korisnik može urediti bez prepisivanja strukture.
   Drži ga u zagradama na kraju zbroja ili kao oduzeti član; često unutar ABS() razlike pozicija.
   Primjer iz baze: ABS([.Strop.Z]-(0)-([.Pod.Z]+[.Pod.T]+(0)))
   Najčešće konstante u bazi: 0 (7670×), 1 (5326×), 2 (1887×), 3 (597×), 5 (546×).

OPSEG LOGIKE (baza 10 641 formula): 7445 nema nijedan if (70% — čista aritmetika), 2750 ima točno 1 if (26%), 326 ima 2 if (3%), a samo 120 ima 3+ if (1%).
→ Drži formule plitkima: preferiraj jedan if() ili ifelse() umjesto dubokog ugnježđivanja.`;

/**
 * Module → dominant formula-type hint, injected into the prompt for Live context.
 * Derived from the shared MODULE_TYPES display data so the two cannot drift; the
 * prompt key uses the `.mac` suffix matching the Live-detected module name.
 */
export const MODULE_DOMINANT_TYPE: Record<string, string> = Object.fromEntries(
  MODULE_TYPES.map((m) => [`${m.module}.mac`, m.type]),
);

/**
 * Build a hierarchy reference guide for the system prompt. Static facts (level
 * meanings, named-path examples, the critical note) come from the shared
 * HIERARCHY display data so prompt and UI stay in lockstep; one real example per
 * depth is injected from the live knowledge base when available.
 */
export function buildHierarchyGuide(
  formulas: Array<{ formula: string; source: string }>,
): string {
  // Collect one real example per hierarchy depth from the actual KB formulas
  const examples: Record<number, string> = {};
  for (const { formula } of formulas) {
    for (const m of formula.matchAll(/\[(\.*[A-Za-z0-9_.]+)\]/g)) {
      const ref = m[0];
      const dots = (m[1].match(/^\.*/) ?? [""])[0].length;
      // Prefer formulas that clearly show the reference in context
      if (!examples[dots] || examples[dots].length < formula.length) {
        examples[dots] = formula.length <= 80 ? formula : ref;
      }
    }
  }

  const lines = ["HIJERARHIJA REFERENCI U FORMULAMA:"];
  for (const row of HIERARCHY) {
    const dots = (row.ref.match(/\./g) ?? []).length;
    // [X] (global) always uses its static example; deeper refs prefer a live one
    const example = dots === 0 ? row.example : examples[dots] ?? row.example;
    lines.push(`${row.ref.padEnd(8)} — ${row.meaning}; primjer: ${example}`);
  }

  lines.push("", "Referenca može uključivati i ime elementa na putu:");
  for (const row of HIERARCHY_NAMED) {
    lines.push(`  ${row.ref.padEnd(14)} — ${row.meaning}`);
  }

  lines.push("", HIERARCHY_NOTE);

  return lines.join("\n");
}
