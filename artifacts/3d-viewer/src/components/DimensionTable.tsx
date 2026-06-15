import type { Part, PartKind } from "../lib/formula-engine";
import { PART_KIND_LABELS } from "../lib/formula-engine";

const KIND_BADGE: Record<PartKind, string> = {
  stranica: "bg-slate-200 text-slate-700",
  pod: "bg-slate-200 text-slate-700",
  strop: "bg-slate-200 text-slate-700",
  leda: "bg-slate-100 text-slate-600",
  polica: "bg-amber-100 text-amber-800",
  front: "bg-gray-100 text-gray-700",
  ladica_front: "bg-gray-100 text-gray-600",
  pregrada: "bg-neutral-200 text-neutral-700",
  preklop: "bg-green-100 text-green-700",
  zona: "bg-blue-100 text-blue-700",
};

interface Props {
  parts: Part[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export default function DimensionTable({ parts, selected, onSelect }: Props) {
  const korpusParts = parts.filter((p) =>
    ["stranica", "pod", "strop", "leda", "pregrada"].includes(p.kind)
  );
  const interiorParts = parts.filter((p) =>
    ["polica", "preklop"].includes(p.kind)
  );
  const frontParts = parts.filter((p) =>
    ["front", "ladica_front"].includes(p.kind)
  );
  const zoneParts = parts.filter((p) => p.kind === "zona");

  const groups = [
    { label: "Korpus", parts: korpusParts },
    { label: "Unutrašnjost", parts: interiorParts },
    { label: "Fronte", parts: frontParts },
    { label: "Zone uređaja", parts: zoneParts },
  ].filter((g) => g.parts.length > 0);

  const totalParts = parts.filter((p) => p.kind !== "zona").reduce((sum, p) => sum + p.qty, 0);

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-sm font-semibold text-slate-700">Rezna lista</h3>
        <span className="text-xs text-slate-500">{totalParts} komada</span>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-100 text-slate-600">
            <th className="text-left px-2 py-1.5 font-medium border-b border-slate-200">Naziv</th>
            <th className="text-left px-2 py-1.5 font-medium border-b border-slate-200">Vrsta</th>
            <th className="text-right px-2 py-1.5 font-medium border-b border-slate-200">Kom</th>
            <th className="text-right px-2 py-1.5 font-medium border-b border-slate-200">Š (mm)</th>
            <th className="text-right px-2 py-1.5 font-medium border-b border-slate-200">V (mm)</th>
            <th className="text-right px-2 py-1.5 font-medium border-b border-slate-200">D (mm)</th>
            <th className="text-left px-2 py-1.5 font-medium border-b border-slate-200">Napomena</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <>
              <tr key={`hdr-${group.label}`}>
                <td
                  colSpan={7}
                  className="px-2 py-1 text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-100 uppercase tracking-wider"
                >
                  {group.label}
                </td>
              </tr>
              {group.parts.map((part) => (
                <tr
                  key={part.id}
                  className={`border-b border-slate-100 cursor-pointer transition-colors ${
                    selected === part.id
                      ? "bg-blue-50 text-blue-800"
                      : "hover:bg-slate-50"
                  }`}
                  onClick={() => onSelect(selected === part.id ? null : part.id)}
                >
                  <td className="px-2 py-1.5 font-medium">{part.label}</td>
                  <td className="px-2 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${KIND_BADGE[part.kind]}`}>
                      {PART_KIND_LABELS[part.kind]}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{part.qty}×</td>
                  <td className="px-2 py-1.5 text-right font-mono">{Math.round(part.w)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{Math.round(part.h)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{Math.round(part.d)}</td>
                  <td className="px-2 py-1.5 text-slate-400">{part.note ?? ""}</td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
