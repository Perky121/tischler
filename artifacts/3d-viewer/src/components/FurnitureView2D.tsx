import { useMemo, useState } from "react";
import type { Part, PartKind } from "../lib/formula-engine";

const KIND_FILL: Record<PartKind, string> = {
  stranica: "#B0BEC5",
  pod: "#B0BEC5",
  strop: "#B0BEC5",
  leda: "#CFD8DC",
  polica: "#D7CCC8",
  front: "#ECEFF1",
  ladica_front: "#ECEFF1",
  pregrada: "#BDBDBD",
  preklop: "#C8E6C9",
  zona: "#B3E5FC",
};

const KIND_STROKE: Record<PartKind, string> = {
  stranica: "#78909C",
  pod: "#78909C",
  strop: "#78909C",
  leda: "#90A4AE",
  polica: "#A1887F",
  front: "#B0BEC5",
  ladica_front: "#B0BEC5",
  pregrada: "#9E9E9E",
  preklop: "#81C784",
  zona: "#29B6F6",
};

const KIND_OPACITY: Record<PartKind, number> = {
  stranica: 1, pod: 1, strop: 1, leda: 0.8,
  polica: 1, front: 0.85, ladica_front: 0.85,
  pregrada: 1, preklop: 1, zona: 0.35,
};

type View = "front" | "side" | "top";

interface Props {
  parts: Part[];
  W: number;
  H: number;
  D: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onDoubleClick?: () => void;
}

export default function FurnitureView2D({ parts, W, H, D, selected, onSelect, onDoubleClick }: Props) {
  const [view, setView] = useState<View>("front");

  const PAD = 40;
  const SVG_W = 560;
  const SVG_H = 480;

  const drawArea = { x: PAD, y: PAD, w: SVG_W - 2 * PAD, h: SVG_H - 2 * PAD };

  const scale = useMemo(() => {
    if (view === "front") return Math.min(drawArea.w / W, drawArea.h / H);
    if (view === "side") return Math.min(drawArea.w / D, drawArea.h / H);
    return Math.min(drawArea.w / W, drawArea.h / D);
  }, [view, W, H, D, drawArea.w, drawArea.h]);

  const modelW = view === "side" ? D : W;
  const modelH = view === "top" ? D : H;

  const offsetX = drawArea.x + (drawArea.w - modelW * scale) / 2;
  const offsetY = drawArea.y + (drawArea.h - modelH * scale) / 2;

  const rectFor = (part: Part) => {
    if (view === "front") {
      return { x: part.x - part.w / 2, y: part.y - part.h / 2, w: part.w, h: part.h };
    }
    if (view === "side") {
      return { x: part.z - part.d / 2, y: part.y - part.h / 2, w: part.d, h: part.h };
    }
    return { x: part.x - part.w / 2, y: part.z - part.d / 2, w: part.w, h: part.d };
  };

  const toSvg = (r: { x: number; y: number; w: number; h: number }) => ({
    x: offsetX + r.x * scale,
    y: offsetY + (view === "top" ? r.y * scale : (modelH - r.y - r.h) * scale),
    w: Math.max(1, r.w * scale),
    h: Math.max(1, r.h * scale),
  });

  const sorted = [...parts].sort((a, b) => {
    if (view === "front") return a.z - b.z;
    if (view === "side") return -(a.z - b.z);
    return -(a.y - b.y);
  });

  const viewLabels: Record<View, string> = {
    front: "Pogled sprijeda (W × H)",
    side: "Pogled sa strane (D × H)",
    top: "Tlocrt (W × D)",
  };

  const axes = useMemo(() => {
    const axisX = view === "side" ? D : W;
    const axisY = view === "top" ? D : H;
    const aX = `${Math.round(axisX)}mm`;
    const aY = `${Math.round(axisY)}mm`;
    return { aX, aY, pX: offsetX + axisX * scale, pY: offsetY };
  }, [view, W, H, D, scale, offsetX, offsetY]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="text-xs text-slate-500 font-medium">{viewLabels[view]}</div>
        <div className="flex rounded border border-slate-200 overflow-hidden text-xs">
          {(["front", "side", "top"] as View[]).map((v) => (
            <button
              key={v}
              className={`px-2.5 py-1 transition-colors border-l first:border-l-0 border-slate-200 ${
                view === v ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => setView(v)}
            >
              {v === "front" ? "Prednji" : v === "side" ? "Bočni" : "Tlocrt"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex items-center justify-center bg-slate-50 p-2">
        <svg
          width={SVG_W}
          height={SVG_H}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="rounded bg-white shadow-sm border border-slate-100"
          onClick={() => onSelect(null)}
        >
          <defs>
            <pattern id="grid" width={50 * scale} height={50 * scale} patternUnits="userSpaceOnUse"
              x={offsetX % (50 * scale)} y={offsetY % (50 * scale)}>
              <path d={`M ${50 * scale} 0 L 0 0 0 ${50 * scale}`} fill="none" stroke="#E0E0E0" strokeWidth="0.5" />
            </pattern>
          </defs>

          <rect x={drawArea.x} y={drawArea.y} width={drawArea.w} height={drawArea.h} fill="url(#grid)" />

          <rect
            x={offsetX}
            y={offsetY}
            width={modelW * scale}
            height={modelH * scale}
            fill="none"
            stroke="#CFD8DC"
            strokeWidth="1"
            strokeDasharray="4,2"
          />

          {sorted.map((part) => {
            const r = rectFor(part);
            const s = toSvg(r);
            const isSelected = selected === part.id;
            return (
              <g
                key={part.id}
                onClick={(e) => { e.stopPropagation(); onSelect(isSelected ? null : part.id); }}
                onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(); }}
              >
                <rect
                  x={s.x}
                  y={s.y}
                  width={s.w}
                  height={s.h}
                  fill={KIND_FILL[part.kind]}
                  fillOpacity={KIND_OPACITY[part.kind]}
                  stroke={isSelected ? "#1565C0" : KIND_STROKE[part.kind]}
                  strokeWidth={isSelected ? 2 : 0.8}
                  className="cursor-pointer"
                />
                {s.w > 30 && s.h > 14 && (
                  <text
                    x={s.x + s.w / 2}
                    y={s.y + s.h / 2 + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.min(9, s.h * 0.4, s.w * 0.12)}
                    fill="#37474F"
                    className="pointer-events-none select-none"
                  >
                    {part.label.replace("Stranica lijeva", "Str.L").replace("Stranica desna", "Str.D").replace("Leđna ploča", "Leđa").replace("Front vrata", "Vrata").replace("Front ladice", "Lad.")}
                  </text>
                )}
                {s.w > 50 && s.h > 22 && (
                  <text
                    x={s.x + s.w / 2}
                    y={s.y + s.h / 2 + Math.min(8, s.h * 0.25) + 3}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.min(7.5, s.h * 0.3, s.w * 0.09)}
                    fill="#546E7A"
                    className="pointer-events-none select-none"
                  >
                    {view === "front"
                      ? `${Math.round(part.w)}×${Math.round(part.h)}`
                      : view === "side"
                      ? `${Math.round(part.d)}×${Math.round(part.h)}`
                      : `${Math.round(part.w)}×${Math.round(part.d)}`}
                  </text>
                )}
              </g>
            );
          })}

          <line
            x1={offsetX} y1={offsetY + modelH * scale + 12}
            x2={offsetX + modelW * scale} y2={offsetY + modelH * scale + 12}
            stroke="#607D8B" strokeWidth="1"
          />
          <text x={offsetX + (modelW * scale) / 2} y={offsetY + modelH * scale + 22}
            textAnchor="middle" fontSize="10" fill="#607D8B">{axes.aX}</text>

          <line
            x1={offsetX - 12} y1={offsetY}
            x2={offsetX - 12} y2={offsetY + modelH * scale}
            stroke="#607D8B" strokeWidth="1"
          />
          <text
            x={offsetX - 22}
            y={offsetY + (modelH * scale) / 2}
            textAnchor="middle"
            fontSize="10"
            fill="#607D8B"
            transform={`rotate(-90, ${offsetX - 22}, ${offsetY + (modelH * scale) / 2})`}
          >{axes.aY}</text>
        </svg>
      </div>

      <div className="px-4 py-2 text-[11px] text-slate-400 flex-shrink-0 border-t border-slate-100 bg-white">
        Klik: odabir · Dvostruki klik: parametri · Bočni pogled: vidljivo je slojevanje po dubini
      </div>
    </div>
  );
}
