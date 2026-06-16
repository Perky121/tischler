/**
 * Strukturirana pravila o parametrizacijskim formulama za MegaTischler.
 *
 * JEDINSTVENI IZVOR ISTINE za pravila prikazana u aplikaciji I ugrađena u
 * backend system prompt. Backend prompt blokovi (`prompt.ts`) grade se iz ovih
 * istih podataka (MODULE_DOMINANT_TYPE, buildHierarchyGuide) ili se provjeravaju
 * protiv njih (`consistency.ts`) — tako prikaz i AI upute ne mogu razići se
 * neopaženo.
 *
 * Brojevi pojava potvrđeni su brojanjem u bazi od 10 641 formula (66 .mac datoteka).
 */

export type OperatorRow = {
  symbol: string;
  meaning: string;
  count: number;
  example?: string;
};

export type FunctionRow = {
  name: string;
  meaning: string;
  count: number;
};

export type AntiPatternRow = {
  wrong: string;
  correct: string;
  note: string;
};

export type FormulaPattern = {
  title: string;
  template: string;
  count: string;
  description: string;
  example?: string;
};

export type HierarchyRow = {
  ref: string;
  meaning: string;
  example: string;
};

export type ModuleTypeRow = {
  module: string;
  type: string;
};

export type SuffixRow = {
  suffix: string;
  meaning: string;
  count: number;
};

export const COMPARISON_OPERATORS: OperatorRow[] = [
  { symbol: "==", meaning: "usporedba jednakosti", count: 5792, example: "if([KDT]==3;0;1)" },
  { symbol: "=", meaning: "usporedba jednakosti (oba oblika valjana)", count: 494, example: "if([.VPST]=1;2;1)" },
  { symbol: "<>", meaning: "nije jednako", count: 18, example: "if([...KOAP]<>1;1;0)" },
  { symbol: ">", meaning: "veće od", count: 2247 },
  { symbol: "<", meaning: "manje od", count: 241 },
  { symbol: ">=", meaning: "veće ili jednako", count: 57 },
  { symbol: "<=", meaning: "manje ili jednako", count: 113 },
];

export const LOGICAL_OPERATORS: OperatorRow[] = [
  { symbol: "and", meaning: "logički I", count: 3448, example: "if(([KDT]==1) and (POSW>200);...)" },
  { symbol: "or", meaning: "logički ILI", count: 366, example: "if(([.BST]==0) or ([.VSST]==1);...)" },
];

export const OPERATORS_NOTE =
  "AND/OR (velika slova) ekvivalentni su and/or — oba oblika prisutna (AND:152, OR:116). Lowercase dominira: and 96%, or 68%. Operator != se NE koristi (0 pojava) — uvijek <>.";

export const FUNCTIONS: FunctionRow[] = [
  { name: "if(uvjet;istina;laž)", meaning: "2-granični uvjet — TOČNO 3 argumenta; 49 poziva sadrži 4. arg LangSupp:MtsxNotEnoughSpace (MTS interna validacijska oznaka, nije stvarni uvjetni argument)", count: 3857 },
  { name: "ifelse(u1;v1;…;zadano)", meaning: "višestruki uvjet (switch) — parovi uvjet;vrijednost + završni zadani; uvijek NEPARAN broj argumenata; 5 args (2 para+zadani) 252× najčešće, 9 args (4 para+zadani) 214×", count: 496 },
  { name: "ABS(x)", meaning: "apsolutna vrijednost — UPPERCASE dominira (86%: 373 ABS vs 59 abs)", count: 432 },
  { name: "NEG(x)", meaning: "omata jednu 0/1 zastavicu — UPPERCASE nešto češći (65%: 484 NEG vs 260 neg)", count: 744 },
  { name: "sin(x)", meaning: "sinus (radijani) — uvijek mala slova; argument su kutni parametri KUT, npr. sin([KUT]/2) ili sin([KUT_I0]+[KUT]/2)", count: 525 },
  { name: "cos(x)", meaning: "kosinus (radijani) — uvijek mala slova; argument su kutni parametri KUT, npr. cos([KUT]/2)", count: 257 },
  { name: "tan(x)", meaning: "tangens — uvijek mala slova", count: 51 },
  { name: "atan(x)", meaning: "arkustangens — uvijek mala slova; prima omjer dviju dimenzija, npr. atan([IS]/[ID]) za kut nagiba", count: 32 },
  { name: "MIN(a;b;…)", meaning: "minimum — rijedak (4×); separator argumenata je uvijek ; (postoje 2 iznimke s zarezom u bazi — nepreporučeni oblik)", count: 4 },
  { name: "MAX(a;b;…)", meaning: "maksimum; može se ugnijezditi unutar MIN()", count: 95 },
  { name: "euler(…)", meaning: "3D rotacijska matrica — struktura: 12 brojeva (3×3 matrica + pomak) + 3 ref. roditelja ([..X.Rx];[..X.Ry];[..X.Rz]) + oznaka osi X:/Y:/Z:; poziva se 3× po elementu (jednom po osi)", count: 18 },
  { name: "ADD(x)", meaning: "dodaje korektivni iznos (kerf/zazor) — izmjerene vrijednosti: ±2, ±4, ±5, ±18 ili ref. parametra ([.KZ]); može se nizati ADD(18)+ADD(18)", count: 21 },
  { name: "getmatdata(mat;ključ)", meaning: "čita podatak o materijalu — svih 10 poziva: getmatdata([.MatV];MH_STR7#4) ili MH_STR8#4; #4 je indeks polja unutar ključa", count: 10 },
  { name: "STRCAT(s1;s2;…)", meaning: "spaja tekst — uvijek UPPERCASE (100%); gradi materijalni kod: STRCAT(BL_ZIF_80M7_;IFELSE([..COL]=0;SW;GR))", count: 5 },
  { name: "VAL(x)", meaning: "prisilna numerička vrijednost izraza — uvijek UPPERCASE (100%); omata dimenzijsku aritmetiku, npr. VAL([D]-[MOZ]-if([Ins]=1;[OfLon];0))", count: 19 },
  { name: "r(radijus)", meaning: "zaobljenje/luk u koordinatnom nizu — samo unutar @-poligona kao Z-vrijednost točke; radijus UVIJEK ref. parametra ([.R] 20×, [....RZI] 3×, [.R1] 2×) — nikad numerička literala", count: 9 },
];

export const FUNCTIONS_NOTE =
  "Trig funkcije su ISKLJUČIVO mala slova — nikad SIN(), COS(), TAN(). VAL() i STRCAT() uvijek UPPERCASE (100%). ABS() dominantno UPPERCASE (86%). if() ima TOČNO 3 argumenta (LangSupp: u 4. argu = interna MTS validacija, ne stvarna grana). MIN rijedak (4×) — separator je uvijek ; (postoje 2 iznimke sa zarezom u bazi). Dokumentirane ali se NE KORISTE u bazi (0 pojava): sqrt(), round(), int().";

export const SYSTEM_VARIABLES: OperatorRow[] = [
  { symbol: "POSW", meaning: "širina pozicije elementa u prostoru", count: 225, example: "if(POSW>200;[KDOSZI];0,5)" },
  { symbol: "POSD", meaning: "dubina pozicije elementa u prostoru", count: 17 },
  { symbol: "POSH", meaning: "visina pozicije elementa u prostoru", count: 23 },
];

export const SYSTEM_VARIABLES_NOTE =
  "MegaTischler ih automatski pruža — pišu se BEZ uglatih zagrada (ne [POSW]) i ne mogu se postaviti kao parametri.";

export const MATERIAL_CODES: string[] = [
  "BL_ZIF_80M7_",
  "VO_10_31_A100",
  "VO_10_31_A150",
  "GT_W60800",
  "SCH_103309900",
  "MH_STR7",
  "MH_STR8",
  "Z75",
  "GTV",
  "FIXNA",
];

export const MATERIAL_CODES_NOTE =
  "Materijalni kodovi su KONSTANTE/šifre iz kataloga (vraća getmatdata ili ifelse grana) — nisu varijable, ne mogu se postavljati ni mijenjati. Pišu se bez uglatih zagrada. U GetMatData kôd može imati #N sufiks (indeks polja podatka), npr. MH_STR7#4 — svih 10 GetMatData poziva u bazi koristi MH_STR7#4 ili MH_STR8#4.";

export const ANTI_PATTERNS: AntiPatternRow[] = [
  { wrong: "if(A!=B;...)", correct: "if(A<>B;...)", note: '"nije jednako" je <>, ne !=' },
  { wrong: "if(A,B,C)", correct: "if(A;B;C)", note: "separator argumenata je ; ne ," },
  { wrong: "[X]", correct: "[.X]", note: "[X] bez točke = GLOBALNI param; za roditelja uvijek [.X]" },
  { wrong: "if(A and B)", correct: "if((A) and (B))", note: "preporuka: grupiraj zagradama; obavezno kad miješaš and i or. Lanac istih usporedbi (A==1 and B==1) smije bez unutarnjih zagrada — ~26% baze to radi" },
];

export const FORMULA_PATTERNS: FormulaPattern[] = [
  {
    title: "Boolean-prekidač bez if()",
    template: "[ZASTAVICA]*A + neg([ZASTAVICA])*B",
    count: "639× (94% svih NEG poziva)",
    description:
      "Ista zastavica stoji i unutar i izvan neg(); argument neg() je gotovo uvijek jedna 0/1 zastavica (BDN, BSL, BSD, BST, BU, UDD…). Alternativa za if() kad je uvjet samo 0/1. Najčešće zastavice: BST(149×), BDN(131×), BSL(119×), BSD(116×), BU(58×).",
    example: "[.Y]-NEG([.BSL])*[.ODU]-[.OSLZ]   (119×)",
  },
  {
    title: "ABS() oko razlike pozicija",
    template: "ABS(pozA - (offset) - (pozB + debljinaB))",
    count: "432 formula",
    description: "Dominantni obrazac (90%): ABS(x-y) za apsolutnu razliku. Često za dimenziju kao razmak između dva pozicionirana elementa.",
    example: "ABS([.Strop.Z]-(0)-([.Pod.Z]+[.Pod.T]+(0)))",
  },
  {
    title: "Dijeljenje s 2",
    template: "… / 2",
    count: "konstanta 2 javlja se učestalo",
    description: "Treća najčešća konstanta (iza 0 i 1). Često za centriranje ili podjelu prostora na pola.",
    example: "([H]-[IDEP1])/2",
  },
  {
    title: "Relativno na roditelja",
    template: "[.X]+[.W]-[T]",
    count: "11× (identično ponavljanje)",
    description: "Pozicioniranje uz rub roditelja: pozicija roditelja + širina − debljina.",
  },
  {
    title: "Kut iz dvije stranice",
    template: "atan([IS]/[ID])",
    count: "10×",
    description: "Računanje nagiba iz dvije veličine (npr. dijagonalni rez).",
  },
  {
    title: "Čisti prijenos vrijednosti (passthrough)",
    template: "[.X]",
    count: "2055× (19,3% cijele baze)",
    description:
      "Najčešći oblik formule uopće: cijela formula je SAMO jedna [referenca], bez ijedne operacije. Parametar nasljeđuje vrijednost roditelja/globala 1:1. Kad vrijednost dolazi izravno odnekud, ne piši aritmetiku — samo referenciraj. Najčešći sufiksi u prijenosu: .Z(302), .X(205), .L(190), .Y(177), .W(129).",
    example: "[.W]   ili   [...KZ]",
  },
  {
    title: "Eksplicitni (0) slot za zazor/offset",
    template: "pozA + debljinaA + (0)",
    count: "402 formula (400× kao +/- offset slot)",
    description:
      "Konstanta u zagradama (0) je NAMJERNI prazni slot za zazor/razmak koji je trenutno nula, ali ga korisnik može urediti bez prepisivanja strukture. Drži ga u zagradama na kraju zbroja ili kao oduzeti član. Često unutar ABS() razlike pozicija. Konstanta 0 je najčešća u bazi (7670×), zatim 1 (5326×), 2 (1887×), 3 (597×), 5 (546×).",
    example: "ABS([.Strop.Z]-(0)-([.Pod.Z]+[.Pod.T]+(0)))",
  },
];

export const DIMENSION_SUFFIXES: SuffixRow[] = [
  { suffix: ".T", meaning: "debljina elementa (thickness) — najčešći sufiks", count: 3288 },
  { suffix: ".X", meaning: "pozicija po X osi", count: 2058 },
  { suffix: ".Z", meaning: "pozicija po Z osi (visinska)", count: 2038 },
  { suffix: ".Y", meaning: "pozicija po Y osi (dubinska)", count: 1877 },
  { suffix: ".W", meaning: "širina (width)", count: 979 },
  { suffix: ".L", meaning: "duljina (length)", count: 695 },
  { suffix: ".H", meaning: "visina (height)", count: 613 },
  { suffix: ".D", meaning: "dubina (depth)", count: 605 },
  { suffix: ".Rx", meaning: "rotacija oko X osi (ulaz u euler())", count: 78 },
  { suffix: ".Ry", meaning: "rotacija oko Y osi (ulaz u euler())", count: 72 },
  { suffix: ".Rz", meaning: "rotacija oko Z osi (ulaz u euler())", count: 79 },
];

export const DIMENSION_SUFFIXES_NOTE =
  "Sufiks iza imena elementa kaže KOJU veličinu čitaš: [.Pod.T] = debljina elementa Pod, [.StranicaL.X] = X pozicija StranicaL. Pozicijske osi (.X/.Y/.Z) i dimenzije (.W/.H/.L/.D/.T) prate isti element kroz hijerarhiju. Rotacijski sufiksi (.Rx/.Ry/.Rz) ulaze u euler().";

export const LOGIC_SCOPE_NOTE =
  "Opseg logike (baza 10 641 formula): 7445 formula nema nijedan if (70% — čista aritmetika), 2750 ima točno 1 if (26%), 326 ima 2 if (3%), a samo 120 ima 3+ if (1%). → Drži formule plitkima: preferiraj jedan if() ili ifelse() umjesto dubokog ugnježđivanja.";

export const HIERARCHY: HierarchyRow[] = [
  { ref: "[X]", meaning: "globalni parametar (bez točaka)", example: "[KDT], [KZ], [KT]" },
  { ref: "[.X]", meaning: "direktni roditelj (1 razina gore)", example: "[.W]" },
  { ref: "[..X]", meaning: "djed (2 razine gore)", example: "[..StranicaL.T]" },
  { ref: "[...X]", meaning: "root/korijenski ormar (3 razine gore)", example: "[...W]" },
  { ref: "[....X]", meaning: "4 razine gore", example: "[....Unutranjosti.H.Z]" },
  { ref: "[.....X]", meaning: "5 razina gore (rijetko — 42 ref u bazi)", example: "[.....X]" },
];

export const HIERARCHY_NAMED: HierarchyRow[] = [
  { ref: "[.Pod.Z]", meaning: "Z pozicija elementa Pod koji je direktno dijete", example: "" },
  { ref: "[..StranicaL.T]", meaning: "debljina StranicaL na razini djeda", example: "" },
  { ref: "[...Ormar.W]", meaning: "širina Ormar na razini roota", example: "" },
];

export const HIERARCHY_NOTE =
  "KRITIČNO: [X] bez točke je GLOBALNI parametar (vrijedi za cijelu konstrukciju). Ako misliš na parametar roditelja, uvijek stavi barem jednu točku: [.X]";

export const MODULE_TYPES: ModuleTypeRow[] = [
  { module: "KUH_VISOKI", type: "dimenzijsko-pozicijsko (dim 32%, poz 28%)" },
  { module: "KUTNI", type: "dimenzijsko s puno rotacija (dim 33%, rot 26%) — euler/sin/cos/tan najčešći od svih modula" },
  { module: "KUTNI_VANJSKI", type: "pozicijsko-dimenzijsko (poz 31%, dim 30%)" },
  { module: "MIKROVALNA", type: "dominantno dimenzijsko (42%)" },
  { module: "NAPA", type: "dominantno dimenzijsko (45%)" },
  { module: "VISECI", type: "dimenzijsko (41%), uključenje (17%)" },
  { module: "PECNICA", type: "dimenzijsko-pozicijsko (dim 33%, poz 31%)" },
  { module: "PERILICA", type: "dominantno dimenzijsko (70%)" },
  { module: "OTVORENI", type: "dimenzijsko-referentno (dim 57%, ref 21%)" },
  { module: "ORMAR_U", type: "dimenzijsko (41%), pozicijsko (22%)" },
  { module: "OSNOVNI", type: "pozicijsko-dimenzijsko (poz 31%, dim 30%)" },
  { module: "ORMAR", type: "dominantno dimenzijsko (45%)" },
  { module: "NADGRADE", type: "dimenzijsko (40%), pozicijsko (26%)" },
  { module: "KUTIJA", type: "dominantno dimenzijsko (71%)" },
  { module: "EL_PUNA_LEDA", type: "dimenzijsko-referentno (dim 50%, ref 25%)" },
];

export const IFELSE_EXAMPLES: string[] = [
  "ifelse([KOAP]==1;50;[KOOL]==0;20;[KOOL]==1;35;50)",
  "ifelse([KDOS]==0;0,5;[KDOS]==1;2;45)",
  "ifelse([KUT]<90;1;[KUT]>90;0;2)",
  "ifelse([.KODS]==0;0;[.KODS]==4;[.MaskaGoreHor.T];[.MSS]+[.MSZRG])",
];

export const IFELSE_NOTE =
  "Koristiti kada ima 3+ grana — čišće od ugniježđenih if(). Format: ifelse(uvjet1;vrijednost1;uvjet2;vrijednost2;zadanaVrijednost). Pravilo strukture (potvrđeno 477/477 poziva): ifelse uvijek ima NEPARAN broj argumenata (parovi uvjet;vrijednost + jedna zadana vrijednost na kraju). Distribucija po broju argumenata: 3 args (8×), 5 args (238× — najčešće), 7 args (14×), 9 args (214× — drugo po redu), 15+ args (3×).";

export const DECIMAL_SEPARATOR_NOTE =
  "Za NOVI UNOS u MegaTischler dijalogu koristi ZAREZ (0,5) — preporučeni format. U bazi postoji 68 formula (bez @-koordinatnih nizova) s decimalnom TOČKOM (npr. 26.7, (0.5), 53.5) — to su VALJANE formule iz izvornih .mac datoteka; ne proglašavaj ih pogrešnima. Iznimka: u koordinatnim nizovima (x;y;z@…) decimalna točka je standardna.";

export const EULER_NOTE =
  "SAMOSTALNI KOORDINATNI POLIGONI (29 formula u bazi). Format: X;Y;Z@X;Y;Z@X;Y;Z — niz 3D točaka odvojen s @, koordinate odvojene s ;. Potvrđeno 29/29: ovo je SAMOSTALNA sirova vrijednost polja, NIJE argument euler() funkcije (nijedna od 18 euler() formula ne sadrži @). Definira profil/put/izrez. U nizovima je decimalni separator TOČKA. ZAOBLJENJE/LUK: r(radijus) na mjestu Z-koordinate točke označava da je taj vrh luk zadanog polumjera (9 formula, ~25 poziva — isključivo unutar @-nizova), npr. [.W];-[.R];r([.R])@. euler() (18 formula) uzima fiksni numerički niz rotacijske matrice (1;0;0;0;0;1;0;-1;0;…) i završava oznakom osi X:/Y:/Z:.";

export const EULER_EXAMPLE = "0;0;0@0;12.9;0@-7;12.9;0@-7;16.9;0@0;18;0@-18;18;0@-18;0;0@0;0;0";

export type ConditionRule = {
  rule: string;
  detail: string;
  count: string;
};

export const CONDITION_RULES: ConditionRule[] = [
  {
    rule: "Jednakost testira KATEGORIJU, ne mjeru",
    detail:
      "Desna strana usporedbe == ili = je UVIJEK cijeli broj ili [referenca] — nikad decimala. Vrijednost je mali kod/način, gotovo uvijek 0–9. Primjer: [KDT]==1, [KOAP]==0.",
    count: "Potvrđeno na cijeloj bazi; decimala na desnoj strani == praktički ne postoji",
  },
  {
    rule: "Uvjeti praktički ne koriste decimalne pragove",
    detail:
      "U svim usporedbama (<, >, <=, >=) pragovi su cijeli brojevi ili [reference]. Jedina poznata iznimka: POSH<738,1.",
    count: "~99,9% cijeli broj ili [ref]",
  },
  {
    rule: "if() ima točno 3 argumenta",
    detail:
      "Uvijek if(uvjet;istina;laž). Iznimka u bazi: formule s LangSupp tokenima (interni MegaTischler validacijski mehanizam — ne pravi 4. arg). Za 3+ grane koristi ifelse(). (Brojimo POZIVE if(), ne formule — jedna formula može imati više if().)",
    count: "3734/3736 poziva",
  },
  {
    rule: "ifelse() ima neparan broj argumenata",
    detail:
      "Parovi uvjet;vrijednost + jedna zadana vrijednost na kraju: ifelse(u1;v1;u2;v2;zadano). Najčešće 5 args (238×) i 9 args (214×).",
    count: "477/477 poziva",
  },
];

export type RuleSection = {
  id: string;
  label: string;
};

export const RULE_SECTIONS: RuleSection[] = [
  { id: "operatori", label: "Operatori" },
  { id: "funkcije", label: "Funkcije" },
  { id: "varijable", label: "Varijable i kodovi" },
  { id: "sufiksi", label: "Sufiksi" },
  { id: "greske", label: "Česte greške" },
  { id: "obrasci", label: "Obrasci" },
  { id: "hijerarhija", label: "Hijerarhija" },
  { id: "moduli", label: "Moduli" },
  { id: "uvjeti", label: "Uvjeti" },
  { id: "ifelse", label: "ifelse" },
  { id: "decimale", label: "Decimale" },
  { id: "euler", label: "EULER" },
];
