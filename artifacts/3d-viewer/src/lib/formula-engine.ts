export type ModuleName =
  | "KUH_VISOKI"
  | "VISECI"
  | "OTVORENI"
  | "PECNICA"
  | "PERILICA"
  | "MIKROVALNA"
  | "NAPA"
  | "KUTNI_VANJSKI";

export type PartKind =
  | "stranica"
  | "pod"
  | "strop"
  | "leda"
  | "polica"
  | "front"
  | "ladica_front"
  | "pregrada"
  | "preklop"
  | "zona";

export interface Part {
  id: string;
  label: string;
  kind: PartKind;
  qty: number;
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  note?: string;
}

export interface Dims {
  W: number;
  H: number;
  D: number;
}

export interface ModuleDefaults {
  W: number;
  H: number;
  D: number;
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
  minD: number;
  maxD: number;
}

export interface FormulaResult {
  parts: Part[];
  warnings: string[];
}

// ── Module-specific parametrization ────────────────────────────────────────
// -1 for numeric params means "auto" (formula-computed)

export interface ModuleSpecificParams {
  PO?: number;    // broj polica (-1 = auto)
  KDT?: number;   // tip vrata: 0=bez, 1=jednodijelna, 2=dvodijelna (-1=auto by W)
  VPT?: number;   // vrsta prednjeg takta: 0=fronta, 1=ladice, 2=prazno
  UDD?: number;   // broj ladica (1–6, kad VPT=1)
  STRAN?: number; // šarka: 0=lijevo, 1=desno (utječe na prikaz vrata)
}

export type AllModuleParams = Record<ModuleName, ModuleSpecificParams>;

export const MODULE_PARAM_DEFAULTS: AllModuleParams = {
  KUH_VISOKI:    { PO: -1, KDT: -1, VPT: 1, UDD: 3 },
  VISECI:        { PO: -1, KDT: -1 },
  OTVORENI:      { PO: -1 },
  PECNICA:       {},
  PERILICA:      {},
  MIKROVALNA:    {},
  NAPA:          {},
  KUTNI_VANJSKI: { PO: -1 },
};

// Describes which params are relevant for each module (for UI rendering)
export interface ParamMeta {
  key: keyof ModuleSpecificParams;
  label: string;
  type: "select" | "number";
  options?: { value: number; label: string }[];
  min?: number;
  max?: number;
  visibleWhen?: (p: ModuleSpecificParams) => boolean;
}

export const MODULE_PARAM_META: Partial<Record<ModuleName, ParamMeta[]>> = {
  KUH_VISOKI: [
    {
      key: "VPT",
      label: "Donji dio",
      type: "select",
      options: [
        { value: 0, label: "Fronta (bez ladica)" },
        { value: 1, label: "Ladice" },
        { value: 2, label: "Prazno (bez fronte)" },
      ],
    },
    {
      key: "UDD",
      label: "Broj ladica",
      type: "number",
      min: 1,
      max: 6,
      visibleWhen: (p) => p.VPT === 1,
    },
    {
      key: "KDT",
      label: "Tip vrata",
      type: "select",
      options: [
        { value: -1, label: "Auto (po širini)" },
        { value: 0, label: "Bez vrata" },
        { value: 1, label: "Jednodijelna" },
        { value: 2, label: "Dvodijelna" },
      ],
    },
    {
      key: "PO",
      label: "Broj polica",
      type: "select",
      options: [
        { value: -1, label: "Auto" },
        { value: 0, label: "0" },
        { value: 1, label: "1" },
        { value: 2, label: "2" },
        { value: 3, label: "3" },
        { value: 4, label: "4" },
        { value: 5, label: "5" },
      ],
    },
  ],
  VISECI: [
    {
      key: "KDT",
      label: "Tip vrata",
      type: "select",
      options: [
        { value: -1, label: "Auto (po širini)" },
        { value: 0, label: "Bez vrata" },
        { value: 1, label: "Jednodijelna" },
        { value: 2, label: "Dvodijelna" },
      ],
    },
    {
      key: "PO",
      label: "Broj polica",
      type: "select",
      options: [
        { value: -1, label: "Auto" },
        { value: 0, label: "0" },
        { value: 1, label: "1" },
        { value: 2, label: "2" },
        { value: 3, label: "3" },
        { value: 4, label: "4" },
      ],
    },
  ],
  OTVORENI: [
    {
      key: "PO",
      label: "Broj polica",
      type: "select",
      options: [
        { value: -1, label: "Auto" },
        { value: 0, label: "0" },
        { value: 1, label: "1" },
        { value: 2, label: "2" },
        { value: 3, label: "3" },
        { value: 4, label: "4" },
        { value: 5, label: "5" },
        { value: 6, label: "6" },
        { value: 7, label: "7" },
        { value: 8, label: "8" },
      ],
    },
  ],
  KUTNI_VANJSKI: [
    {
      key: "PO",
      label: "Broj polica (po strani)",
      type: "select",
      options: [
        { value: -1, label: "Auto" },
        { value: 0, label: "0" },
        { value: 1, label: "1" },
        { value: 2, label: "2" },
        { value: 3, label: "3" },
        { value: 4, label: "4" },
      ],
    },
  ],
};

export const MODULE_DEFAULTS: Record<ModuleName, ModuleDefaults> = {
  KUH_VISOKI: { W: 600, H: 2160, D: 580, minW: 300, maxW: 900, minH: 1800, maxH: 2400, minD: 500, maxD: 620 },
  VISECI:     { W: 600, H: 720,  D: 350, minW: 300, maxW: 1200, minH: 500, maxH: 1000, minD: 290, maxD: 400 },
  OTVORENI:   { W: 600, H: 2160, D: 380, minW: 300, maxW: 1200, minH: 600, maxH: 2400, minD: 280, maxD: 580 },
  PECNICA:    { W: 600, H: 2160, D: 580, minW: 550, maxW: 650, minH: 2000, maxH: 2400, minD: 550, maxD: 620 },
  PERILICA:   { W: 600, H: 820,  D: 580, minW: 550, maxW: 650, minH: 780, maxH: 870, minD: 550, maxD: 620 },
  MIKROVALNA: { W: 600, H: 720,  D: 380, minW: 550, maxW: 650, minH: 600, maxH: 800, minD: 330, maxD: 400 },
  NAPA:       { W: 600, H: 700,  D: 350, minW: 500, maxW: 900, minH: 600, maxH: 800, minD: 280, maxD: 380 },
  KUTNI_VANJSKI: { W: 900, H: 2160, D: 580, minW: 700, maxW: 1200, minH: 1800, maxH: 2400, minD: 500, maxD: 620 },
};

const T = 18;
const T_BACK = 16;
const T_FRONT = 18;

let _idSeq = 0;
function uid(prefix: string) {
  return `${prefix}_${++_idSeq}`;
}

function korpus(W: number, H: number, D: number): Part[] {
  const innerW = W - 2 * T;
  const innerH = H - 2 * T;
  const sideD = D - T_BACK;
  const cxInner = T + innerW / 2;
  const cyInner = T + innerH / 2;
  const czSide = T_BACK + sideD / 2;

  return [
    {
      id: uid("sl"),
      label: "Stranica lijeva",
      kind: "stranica",
      qty: 1,
      w: T, h: H, d: sideD,
      x: T / 2, y: H / 2, z: czSide,
      note: `T${T}`,
    },
    {
      id: uid("sd"),
      label: "Stranica desna",
      kind: "stranica",
      qty: 1,
      w: T, h: H, d: sideD,
      x: W - T / 2, y: H / 2, z: czSide,
      note: `T${T}`,
    },
    {
      id: uid("pod"),
      label: "Pod",
      kind: "pod",
      qty: 1,
      w: innerW, h: T, d: sideD,
      x: cxInner, y: T / 2, z: czSide,
      note: `${innerW}×${sideD}`,
    },
    {
      id: uid("strop"),
      label: "Strop",
      kind: "strop",
      qty: 1,
      w: innerW, h: T, d: sideD,
      x: cxInner, y: H - T / 2, z: czSide,
      note: `${innerW}×${sideD}`,
    },
    {
      id: uid("leda"),
      label: "Leđna ploča",
      kind: "leda",
      qty: 1,
      w: innerW, h: innerH, d: T_BACK,
      x: cxInner, y: cyInner, z: T_BACK / 2,
      note: `T${T_BACK}`,
    },
  ];
}

function shelf(W: number, D: number, yCenter: number, index: number): Part {
  const innerW = W - 2 * T;
  const sideD = D - T_BACK;
  return {
    id: uid(`pol${index}`),
    label: `Polica ${index}`,
    kind: "polica",
    qty: 1,
    w: innerW, h: T, d: sideD - 20,
    x: T + innerW / 2,
    y: yCenter,
    z: T_BACK + (sideD - 20) / 2 + 20,
    note: `${innerW}×${sideD - 20}`,
  };
}

function uniformShelves(W: number, H: number, D: number, count: number, yFrom: number, yTo: number): Part[] {
  const parts: Part[] = [];
  if (count <= 0) return parts;
  const step = (yTo - yFrom) / (count + 1);
  for (let i = 1; i <= count; i++) {
    parts.push(shelf(W, D, yFrom + step * i, i));
  }
  return parts;
}

function door(W: number, H: number, x: number, y: number, label: string): Part {
  return {
    id: uid("front"),
    label,
    kind: "front",
    qty: 1,
    w: W - 2, h: H - 4, d: T_FRONT,
    x, y,
    z: D_placeholder + T_FRONT / 2,
    note: `${W - 2}×${H - 4}`,
  };
}

function drawerFront(W: number, h: number, x: number, y: number, index: number): Part {
  return {
    id: uid(`lf${index}`),
    label: `Front ladice ${index}`,
    kind: "ladica_front",
    qty: 1,
    w: W - 2, h: h - 4, d: T_FRONT,
    x, y,
    z: D_placeholder + T_FRONT / 2,
    note: `${W - 2}×${h - 4}`,
  };
}

let D_placeholder = 580;

export function calculate(
  module: ModuleName,
  W: number,
  H: number,
  D: number,
  params: ModuleSpecificParams = {}
): FormulaResult {
  D_placeholder = D;
  _idSeq = 0;
  const warnings: string[] = [];
  const parts: Part[] = [];

  const frontZ = D + T_FRONT / 2;

  // Merge with module defaults so unset keys get their default value
  const p: ModuleSpecificParams = { ...MODULE_PARAM_DEFAULTS[module], ...params };

  switch (module) {
    case "KUH_VISOKI": {
      parts.push(...korpus(W, H, D));

      const KDT = p.KDT ?? -1;   // -1 = auto by W
      const VPT = p.VPT ?? 1;    // 1 = ladice
      const UDD = Math.max(1, Math.min(6, p.UDD ?? 3));
      const PO_req = p.PO ?? -1;

      // ── Bottom zone ─────────────────────────────────────────────────────
      let yFromShelves = T;
      let drawerZoneH = 0;

      if (VPT === 1) {
        // Ladice (drawers) at bottom
        drawerZoneH = Math.round(H * 0.30);
        const drawerH = Math.round(drawerZoneH / UDD);
        yFromShelves = T + drawerZoneH;

        for (let i = 0; i < UDD; i++) {
          const yBot = T + i * drawerH;
          parts.push({ ...drawerFront(W, drawerH, W / 2, yBot + drawerH / 2, i + 1), z: frontZ });
        }
      }
      // VPT === 0: fronta (doors full-height, no drawers) — yFromShelves stays T
      // VPT === 2: prazno (nothing at bottom) — yFromShelves stays T

      // ── Shelves ─────────────────────────────────────────────────────────
      const shelfZoneFrom = yFromShelves;
      const shelfZoneTo = H - T;

      let actualShelfCount: number;
      if (PO_req >= 0) {
        actualShelfCount = PO_req;
      } else {
        actualShelfCount = Math.min(Math.floor((shelfZoneTo - shelfZoneFrom) / 300), 4);
      }
      parts.push(...uniformShelves(W, H, D, actualShelfCount, shelfZoneFrom, shelfZoneTo));

      // ── Doors (fronte) ──────────────────────────────────────────────────
      // Resolve KDT: -1 means auto (dual if W>450, single otherwise)
      const useDual = KDT === 2 || (KDT === -1 && W > 450);
      const useSingle = KDT === 1 || (KDT === -1 && W <= 450);
      const hasDoors = KDT !== 0;

      if (hasDoors) {
        if (VPT === 1) {
          // Vrata samo na gornjem dijelu (iznad ladica)
          const topFrontH = H - T - drawerZoneH - T;
          const topFrontY = T + drawerZoneH + T + topFrontH / 2;
          if (topFrontH > 60) {
            if (useDual) {
              parts.push({ ...door(W / 2, topFrontH + T, W / 4 + 1, topFrontY, "Front vrata L"), z: frontZ });
              parts.push({ ...door(W / 2, topFrontH + T, W * 3 / 4 - 1, topFrontY, "Front vrata D"), z: frontZ });
            } else if (useSingle) {
              parts.push({ ...door(W, topFrontH + T, W / 2, topFrontY, "Front vrata"), z: frontZ });
            }
          }
        } else {
          // Vrata po cijeloj visini (bez ladica)
          if (useDual) {
            parts.push({ ...door(W / 2, H, W / 4 + 1, H / 2, "Front vrata L"), z: frontZ });
            parts.push({ ...door(W / 2, H, W * 3 / 4 - 1, H / 2, "Front vrata D"), z: frontZ });
          } else if (useSingle) {
            parts.push({ ...door(W, H, W / 2, H / 2, "Front vrata"), z: frontZ });
          }
        }
      }

      if (H < 1800) warnings.push("Visina je manja od standardnih 1800mm za visoki element.");
      break;
    }

    case "VISECI": {
      parts.push(...korpus(W, H, D));

      const KDT = p.KDT ?? -1;
      const PO_req = p.PO ?? -1;

      const autoShelfCount = Math.max(1, Math.floor((H - 2 * T) / 300) - 1);
      const shelfCount = PO_req >= 0 ? PO_req : autoShelfCount;
      parts.push(...uniformShelves(W, H, D, shelfCount, T, H - T));

      const useDual = KDT === 2 || (KDT === -1 && W > 450);
      const useSingle = KDT === 1 || (KDT === -1 && W <= 450);
      if (KDT !== 0) {
        if (useDual) {
          parts.push({ ...door(W / 2, H, W / 4 + 1, H / 2, "Front vrata L"), z: frontZ });
          parts.push({ ...door(W / 2, H, W * 3 / 4 - 1, H / 2, "Front vrata D"), z: frontZ });
        } else if (useSingle) {
          parts.push({ ...door(W, H, W / 2, H / 2, "Front vrata"), z: frontZ });
        }
      }

      if (D > 380) warnings.push("Dubina viseće jedinice je veća od uobičajenih 350-380mm.");
      break;
    }

    case "OTVORENI": {
      parts.push(...korpus(W, H, D));

      const PO_req = p.PO ?? -1;
      const autoCount = Math.max(2, Math.floor((H - 2 * T) / 300) - 1);
      const shelfCount = PO_req >= 0 ? PO_req : autoCount;
      parts.push(...uniformShelves(W, H, D, shelfCount, T, H - T));
      break;
    }

    case "PECNICA": {
      parts.push(...korpus(W, H, D));

      const ovenH = 595;
      const ovenBottomY = Math.round(H * 0.33);
      const ovenTopY = ovenBottomY + ovenH;

      parts.push({
        id: uid("zona_pecnica"),
        label: "Zona za pećnicu (595mm)",
        kind: "zona",
        qty: 1,
        w: W - 2 * T - 2, h: ovenH, d: D - T_BACK - 10,
        x: W / 2, y: ovenBottomY + ovenH / 2, z: T_BACK + (D - T_BACK - 10) / 2,
        note: "Pećnica 595mm",
      });

      const innerW = W - 2 * T;
      const sideD = D - T_BACK;

      parts.push({
        id: uid("preg_bot"),
        label: "Pregrada ispod pećnice",
        kind: "pregrada",
        qty: 1,
        w: innerW, h: T, d: sideD,
        x: T + innerW / 2, y: ovenBottomY + T / 2, z: T_BACK + sideD / 2,
        note: "Preg donja",
      });
      parts.push({
        id: uid("preg_top"),
        label: "Pregrada iznad pećnice",
        kind: "pregrada",
        qty: 1,
        w: innerW, h: T, d: sideD,
        x: T + innerW / 2, y: ovenTopY + T / 2, z: T_BACK + sideD / 2,
        note: "Preg gornja",
      });

      if (ovenBottomY > T + 200) {
        const drawerCount = Math.floor((ovenBottomY - T) / 150);
        const drawerH = Math.round((ovenBottomY - T) / drawerCount);
        for (let i = 0; i < drawerCount; i++) {
          const yBot = T + i * drawerH;
          parts.push({ ...drawerFront(W, drawerH, W / 2, yBot + drawerH / 2, i + 1), z: frontZ });
        }
      }

      const topH = H - T - ovenTopY - T;
      if (topH > 100) {
        const shelfCount = Math.floor(topH / 300);
        parts.push(...uniformShelves(W, H, D, Math.max(1, shelfCount), ovenTopY + T, H - T));
        parts.push({ ...door(W, topH + T, W / 2, ovenTopY + T + topH / 2, "Front gornja vrata"), z: frontZ });
      }

      parts.push({ ...door(W, ovenBottomY, W / 2, T + (ovenBottomY - T) / 2, "Front donja ladica"), z: frontZ });
      break;
    }

    case "PERILICA": {
      parts.push(...korpus(W, H, D));
      parts.push({
        id: uid("zona_perilica"),
        label: "Zona za perilicu",
        kind: "zona",
        qty: 1,
        w: W - 2 * T - 2, h: H - 2 * T, d: D - T_BACK - 10,
        x: W / 2, y: H / 2, z: T_BACK + (D - T_BACK - 10) / 2,
        note: "Perilica (600×820)",
      });

      if (W !== 600) warnings.push("Standardna širina za perilicu je 600mm.");
      if (H < 800 || H > 850) warnings.push("Standardna visina za perilicu je ~820mm (bez radne ploče).");
      break;
    }

    case "MIKROVALNA": {
      parts.push(...korpus(W, H, D));
      const mkH = Math.min(450, Math.round(H * 0.55));
      const mkBottomY = T;

      parts.push({
        id: uid("zona_mk"),
        label: `Zona za mikrovalnu (${mkH}mm)`,
        kind: "zona",
        qty: 1,
        w: W - 2 * T - 2, h: mkH, d: D - T_BACK - 10,
        x: W / 2, y: mkBottomY + mkH / 2, z: T_BACK + (D - T_BACK - 10) / 2,
        note: "Mikrovalna",
      });

      const innerW = W - 2 * T;
      const sideD = D - T_BACK;
      parts.push({
        id: uid("preg_mk"),
        label: "Pregrada iznad mikrovalne",
        kind: "pregrada",
        qty: 1,
        w: innerW, h: T, d: sideD,
        x: T + innerW / 2, y: mkBottomY + mkH + T / 2, z: T_BACK + sideD / 2,
        note: "Preg",
      });

      const topH = H - T - mkBottomY - mkH - T;
      if (topH > 50) {
        const shelfCount = Math.max(0, Math.floor(topH / 280) - 1);
        parts.push(...uniformShelves(W, H, D, shelfCount, mkBottomY + mkH + T, H - T));
        parts.push({ ...door(W, topH, W / 2, mkBottomY + mkH + T + topH / 2, "Front gornja vrata"), z: frontZ });
      }

      parts.push({ ...door(W, mkH + T, W / 2, mkBottomY + mkH / 2, "Mikrovalna prednja strana"), z: frontZ });
      break;
    }

    case "NAPA": {
      parts.push(...korpus(W, H, D));
      const napaH = Math.round(H * 0.6);
      parts.push({
        id: uid("zona_napa"),
        label: `Zona za napu (${napaH}mm)`,
        kind: "zona",
        qty: 1,
        w: W - 2 * T - 10, h: napaH, d: D - T_BACK - 20,
        x: W / 2, y: T + napaH / 2, z: T_BACK + (D - T_BACK - 20) / 2,
        note: "Napa",
      });

      if (D < 280 || D > 380) warnings.push("Standardna dubina za napu je 280-380mm.");
      break;
    }

    case "KUTNI_VANJSKI": {
      parts.push(...korpus(W, H, D));

      const PO_req = p.PO ?? -1;
      const innerH = H - 2 * T;
      const sideD = D - T_BACK;
      const panelD = Math.round(W * 0.5);

      parts.push({
        id: uid("kutna_preg"),
        label: "Kutna pregrada",
        kind: "pregrada",
        qty: 1,
        w: T, h: innerH, d: sideD,
        x: panelD + T / 2, y: H / 2, z: T_BACK + sideD / 2,
        note: "Kutna dioba",
      });

      const leftShelfW = panelD - T;
      const rightShelfW = W - 2 * T - panelD;
      const autoShelfCount = Math.max(2, Math.floor(innerH / 350) - 1);
      const shelfCount = PO_req >= 0 ? PO_req : autoShelfCount;
      const step = innerH / (shelfCount + 1);

      for (let i = 1; i <= shelfCount; i++) {
        const y = T + step * i;
        parts.push({
          id: uid(`pol_l${i}`),
          label: `Polica lijevo ${i}`,
          kind: "polica",
          qty: 1,
          w: leftShelfW, h: T, d: sideD - 20,
          x: T + leftShelfW / 2, y, z: T_BACK + (sideD - 20) / 2 + 20,
          note: `${leftShelfW}×${sideD - 20}`,
        });
        parts.push({
          id: uid(`pol_r${i}`),
          label: `Polica desno ${i}`,
          kind: "polica",
          qty: 1,
          w: rightShelfW, h: T, d: sideD - 20,
          x: T + panelD + T + rightShelfW / 2, y, z: T_BACK + (sideD - 20) / 2 + 20,
          note: `${rightShelfW}×${sideD - 20}`,
        });
      }

      const leftDoorW = panelD - T;
      const rightDoorW = W - 2 * T - panelD - T;

      parts.push({ ...door(leftDoorW + 2, H, T + leftDoorW / 2, H / 2, "Front lijeva vrata"), z: frontZ });
      parts.push({ ...door(rightDoorW + 2, H, T + panelD + T + rightDoorW / 2, H / 2, "Front desna vrata"), z: frontZ });

      break;
    }
  }

  return { parts, warnings };
}

export const MODULE_LABELS: Record<ModuleName, string> = {
  KUH_VISOKI: "KUH_VISOKI — Visoki element",
  VISECI: "VISECI — Viseći element",
  OTVORENI: "OTVORENI — Otvoreni regal",
  PECNICA: "PECNICA — Stupac za pećnicu",
  PERILICA: "PERILICA — Kućište za perilicu",
  MIKROVALNA: "MIKROVALNA — Viseći s mikrovalnom",
  NAPA: "NAPA — Kućište za napu",
  KUTNI_VANJSKI: "KUTNI_VANJSKI — Kutni element",
};

export const PART_KIND_LABELS: Record<PartKind, string> = {
  stranica: "Stranica",
  pod: "Pod",
  strop: "Strop",
  leda: "Leđna ploča",
  polica: "Polica",
  front: "Front vrata",
  ladica_front: "Front ladice",
  pregrada: "Pregrada",
  preklop: "Preklop",
  zona: "Zona uređaja",
};
