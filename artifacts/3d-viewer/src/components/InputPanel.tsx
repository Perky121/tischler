import { useState } from "react";
import type { ModuleName, ModuleSpecificParams } from "../lib/formula-engine";
import { MODULE_DEFAULTS, MODULE_LABELS, MODULE_PARAM_META, MODULE_PARAM_DEFAULTS } from "../lib/formula-engine";

interface Props {
  module: ModuleName;
  W: number;
  H: number;
  D: number;
  params: ModuleSpecificParams;
  onChange: (module: ModuleName, W: number, H: number, D: number) => void;
  onParamsChange: (params: ModuleSpecificParams) => void;
}

const MODULES: ModuleName[] = [
  "KUH_VISOKI",
  "VISECI",
  "OTVORENI",
  "PECNICA",
  "PERILICA",
  "MIKROVALNA",
  "NAPA",
  "KUTNI_VANJSKI",
];

function SliderInput({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const [localVal, setLocalVal] = useState(String(value));

  const commit = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!isNaN(n)) {
      const clamped = Math.max(min, Math.min(max, n));
      onChange(clamped);
      setLocalVal(String(clamped));
    } else {
      setLocalVal(String(value));
    }
  };

  if (value !== parseInt(localVal, 10)) {
    if (parseInt(localVal, 10) !== value) setLocalVal(String(value));
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-slate-600">{label}</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="w-20 text-right text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={localVal}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
          />
          <span className="text-xs text-slate-400">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        className="w-full h-1.5 rounded-full appearance-none bg-slate-200 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 cursor-pointer"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          onChange(v);
          setLocalVal(String(v));
        }}
      />
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <div className="flex items-center gap-1.5">
        <button
          className="w-6 h-6 rounded border border-slate-200 bg-white text-slate-600 text-sm font-bold flex items-center justify-center hover:bg-slate-50 disabled:opacity-30"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
        >
          −
        </button>
        <span className="w-6 text-center text-xs font-semibold text-slate-800">{value}</span>
        <button
          className="w-6 h-6 rounded border border-slate-200 bg-white text-slate-600 text-sm font-bold flex items-center justify-center hover:bg-slate-50 disabled:opacity-30"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function InputPanel({ module, W, H, D, params, onChange, onParamsChange }: Props) {
  const def = MODULE_DEFAULTS[module];
  const paramMeta = MODULE_PARAM_META[module] ?? [];

  const handleModule = (m: ModuleName) => {
    const d = MODULE_DEFAULTS[m];
    onChange(m, d.W, d.H, d.D);
  };

  const handleW = (v: number) => onChange(module, v, H, D);
  const handleH = (v: number) => onChange(module, W, v, D);
  const handleD = (v: number) => onChange(module, W, H, v);

  const reset = () => {
    onChange(module, def.W, def.H, def.D);
    onParamsChange({ ...MODULE_PARAM_DEFAULTS[module] });
  };

  const setParam = (key: keyof ModuleSpecificParams, value: number) => {
    onParamsChange({ ...params, [key]: value });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Module selector */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
          Modul
        </label>
        <select
          className="w-full text-sm border border-slate-200 rounded-md px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
          value={module}
          onChange={(e) => handleModule(e.target.value as ModuleName)}
        >
          {MODULES.map((m) => (
            <option key={m} value={m}>
              {MODULE_LABELS[m]}
            </option>
          ))}
        </select>
      </div>

      {/* Dimensions */}
      <div className="space-y-4">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
          Dimenzije
        </label>
        <SliderInput
          label="Širina (W)"
          value={W}
          min={def.minW}
          max={def.maxW}
          step={50}
          unit="mm"
          onChange={handleW}
        />
        <SliderInput
          label="Visina (H)"
          value={H}
          min={def.minH}
          max={def.maxH}
          step={60}
          unit="mm"
          onChange={handleH}
        />
        <SliderInput
          label="Dubina (D)"
          value={D}
          min={def.minD}
          max={def.maxD}
          step={10}
          unit="mm"
          onChange={handleD}
        />
      </div>

      {/* Module-specific params */}
      {paramMeta.length > 0 && (
        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Parametrizacija
          </label>
          <div className="space-y-3 bg-slate-50 rounded-lg p-3">
            {paramMeta.map((meta) => {
              if (meta.visibleWhen && !meta.visibleWhen(params)) return null;

              const currentVal = params[meta.key] ?? MODULE_PARAM_DEFAULTS[module][meta.key] ?? 0;

              if (meta.type === "select" && meta.options) {
                return (
                  <div key={meta.key} className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-slate-600 shrink-0">{meta.label}</label>
                    <select
                      className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-[140px] w-full"
                      value={currentVal as number}
                      onChange={(e) => setParam(meta.key, parseInt(e.target.value, 10))}
                    >
                      {meta.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              if (meta.type === "number" && meta.min !== undefined && meta.max !== undefined) {
                return (
                  <NumberStepper
                    key={meta.key}
                    label={meta.label}
                    value={currentVal as number}
                    min={meta.min}
                    max={meta.max}
                    onChange={(v) => setParam(meta.key, v)}
                  />
                );
              }

              return null;
            })}
          </div>
        </div>
      )}

      <button
        className="w-full text-sm border border-slate-200 rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-50 transition-colors"
        onClick={reset}
      >
        ↺ Standardne mjere
      </button>

      {/* Legend */}
      <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-xs text-slate-500">
        <div className="font-semibold text-slate-600 text-[11px] uppercase tracking-wider mb-1.5">Legende boja</div>
        {(
          [
            ["bg-slate-300", "Korpus (stranice, dno, strop)"],
            ["bg-stone-300", "Police"],
            ["bg-gray-100 border border-slate-200", "Fronte / ladice"],
            ["bg-blue-200", "Zona uređaja"],
          ] as [string, string][]
        ).map(([cls, lbl]) => (
          <div key={lbl} className="flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-sm flex-shrink-0 ${cls}`} />
            <span>{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
