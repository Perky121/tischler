import { useState, useMemo, lazy, Suspense, useEffect, useCallback } from "react";
import { calculate, MODULE_DEFAULTS, MODULE_PARAM_DEFAULTS, MODULE_PARAM_META } from "./lib/formula-engine";
import type { ModuleName, ModuleSpecificParams } from "./lib/formula-engine";
import { isWebGLAvailable } from "./lib/webgl-detect";
import InputPanel from "./components/InputPanel";
import DimensionTable from "./components/DimensionTable";
import FurnitureView2D from "./components/FurnitureView2D";

const Viewer3D = lazy(() => import("./components/FurnitureViewer"));

const HAS_WEBGL = isWebGLAvailable();

const DEFAULT_MODULE: ModuleName = "KUH_VISOKI";
const DEF = MODULE_DEFAULTS[DEFAULT_MODULE];

const VALID_MODULES = Object.keys(MODULE_DEFAULTS) as ModuleName[];

function parseUrlParams(): { module: ModuleName; W: number; H: number; D: number } {
  const p = new URLSearchParams(window.location.search);
  const rawModule = p.get("module");
  const mod: ModuleName =
    rawModule && VALID_MODULES.includes(rawModule as ModuleName)
      ? (rawModule as ModuleName)
      : DEFAULT_MODULE;
  const def = MODULE_DEFAULTS[mod];
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const rawW = p.get("W") ? parseInt(p.get("W")!, 10) : NaN;
  const rawH = p.get("H") ? parseInt(p.get("H")!, 10) : NaN;
  const rawD = p.get("D") ? parseInt(p.get("D")!, 10) : NaN;
  return {
    module: mod,
    W: isNaN(rawW) ? def.W : clamp(rawW, def.minW, def.maxW),
    H: isNaN(rawH) ? def.H : clamp(rawH, def.minH, def.maxH),
    D: isNaN(rawD) ? def.D : clamp(rawD, def.minD, def.maxD),
  };
}

const URL_PARAMS = parseUrlParams();
const IS_EMBED = new URLSearchParams(window.location.search).get("embed") === "1";

export default function App() {
  const [module, setModule] = useState<ModuleName>(URL_PARAMS.module);
  const [W, setW] = useState(URL_PARAMS.W);
  const [H, setH] = useState(URL_PARAMS.H);
  const [D, setD] = useState(URL_PARAMS.D);
  const [params, setParams] = useState<ModuleSpecificParams>(
    () => ({ ...MODULE_PARAM_DEFAULTS[URL_PARAMS.module] })
  );

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data) return;

      if (e.data.type === "MEGATISCHLER_DIMS") {
        const { module: m, W: w, H: h, D: d } = e.data as {
          type: string; module?: string; W?: number; H?: number; D?: number;
        };
        const clamp = (v: number, mn: number, mx: number) => Math.max(mn, Math.min(mx, v));
        const newMod: ModuleName =
          m && VALID_MODULES.includes(m as ModuleName) ? (m as ModuleName) : module;
        const def = MODULE_DEFAULTS[newMod];
        if (newMod !== module) {
          setModule(newMod);
          setParams({ ...MODULE_PARAM_DEFAULTS[newMod] });
        }
        if (typeof w === "number" && !isNaN(w)) setW(clamp(w, def.minW, def.maxW));
        if (typeof h === "number" && !isNaN(h)) setH(clamp(h, def.minH, def.maxH));
        if (typeof d === "number" && !isNaN(d)) setD(clamp(d, def.minD, def.maxD));
        return;
      }

      if (e.data.type === "MEGATISCHLER_PARAMS") {
        const incoming = e.data.params as Record<string, number> | undefined;
        if (!incoming || typeof incoming !== "object") return;
        setParams(prev => ({ ...prev, ...incoming } as ModuleSpecificParams));
        return;
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [module]);

  const [selected, setSelected] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<"viewer" | "tablica">("viewer");
  const [viewMode, setViewMode] = useState<"3d" | "2d">(HAS_WEBGL ? "3d" : "2d");

  // ── Edit popup ────────────────────────────────────────────────────────────
  const [showEditPopup, setShowEditPopup] = useState(false);
  const [editW, setEditW] = useState(W);
  const [editH, setEditH] = useState(H);
  const [editD, setEditD] = useState(D);
  const [editParams, setEditParams] = useState<ModuleSpecificParams>({});

  const openEditPopup = useCallback(() => {
    setEditW(W);
    setEditH(H);
    setEditD(D);
    setEditParams({ ...params });
    setShowEditPopup(true);
  }, [W, H, D, params]);

  const applyEdit = () => {
    const def = MODULE_DEFAULTS[module];
    const clamp = (v: number, mn: number, mx: number) => Math.max(mn, Math.min(mx, v));
    const newW = isNaN(editW) ? W : clamp(editW, def.minW, def.maxW);
    const newH = isNaN(editH) ? H : clamp(editH, def.minH, def.maxH);
    const newD = isNaN(editD) ? D : clamp(editD, def.minD, def.maxD);
    handleChange(module, newW, newH, newD);
    handleParamsChange(editParams);
    setShowEditPopup(false);
  };

  const { parts, warnings } = useMemo(
    () => calculate(module, W, H, D, params),
    [module, W, H, D, params]
  );

  const handleChange = (m: ModuleName, w: number, h: number, d: number) => {
    if (m !== module) {
      setParams({ ...MODULE_PARAM_DEFAULTS[m] });
    }
    setModule(m);
    setW(w);
    setH(h);
    setD(d);
    setSelected(null);
    try {
      window.parent.postMessage(
        { type: "MEGATISCHLER_DIMS_UPDATE", module: m, W: w, H: h, D: d },
        "*"
      );
    } catch {
      // ignore if cross-origin or no parent
    }
  };

  const handleParamsChange = (newParams: ModuleSpecificParams) => {
    setParams(newParams);
    setSelected(null);
  };

  const selectedPart = parts.find((p) => p.id === selected);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-800">
      {!IS_EMBED && <aside className="w-72 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">🪵</span>
            <div>
              <h1 className="text-sm font-bold text-slate-800">MegaTischler 3D</h1>
              <p className="text-[11px] text-slate-400">Parametrični pregled namještaja</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <InputPanel
            module={module}
            W={W}
            H={H}
            D={D}
            params={params}
            onChange={handleChange}
            onParamsChange={handleParamsChange}
          />
        </div>

        {selectedPart && (
          <div className="px-4 py-3 border-t border-slate-100 bg-blue-50">
            <div className="text-xs font-medium text-blue-700">Odabrana ploča</div>
            <div className="text-sm font-semibold text-blue-900">{selectedPart.label}</div>
            <div className="text-xs text-blue-600 mt-0.5 font-mono">
              {Math.round(selectedPart.w)} × {Math.round(selectedPart.h)} × {Math.round(selectedPart.d)} mm
            </div>
          </div>
        )}
      </aside>}

      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 flex-shrink-0 gap-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-sm font-semibold text-slate-700 truncate">
              {module} — {W}×{H}×{D} mm
            </span>
            {warnings.map((w) => (
              <span
                key={w}
                className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 whitespace-nowrap"
              >
                ⚠ {w}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {mainTab === "viewer" && (
              <div className="flex rounded border border-slate-200 overflow-hidden text-xs">
                <button
                  title="2D ortogonalni prikaz"
                  className={`px-2.5 py-1.5 transition-colors ${
                    viewMode === "2d" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  onClick={() => setViewMode("2d")}
                >
                  2D
                </button>
                <button
                  title={HAS_WEBGL ? "3D prikaz" : "WebGL nije dostupan u ovom okruženju"}
                  className={`px-2.5 py-1.5 transition-colors border-l border-slate-200 ${
                    viewMode === "3d"
                      ? "bg-blue-600 text-white"
                      : HAS_WEBGL
                      ? "bg-white text-slate-600 hover:bg-slate-50"
                      : "bg-white text-slate-300 cursor-not-allowed"
                  }`}
                  onClick={() => HAS_WEBGL && setViewMode("3d")}
                  disabled={!HAS_WEBGL}
                >
                  3D
                  {!HAS_WEBGL && <span className="ml-1 text-[10px]">✕</span>}
                </button>
              </div>
            )}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
              <button
                className={`px-3 py-1.5 transition-colors ${
                  mainTab === "viewer" ? "bg-slate-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
                onClick={() => setMainTab("viewer")}
              >
                Prikaz
              </button>
              <button
                className={`px-3 py-1.5 transition-colors border-l border-slate-200 ${
                  mainTab === "tablica" ? "bg-slate-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
                onClick={() => setMainTab("tablica")}
              >
                Rezna lista
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
          {mainTab === "viewer" ? (
            viewMode === "3d" && HAS_WEBGL ? (
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-full text-slate-400">
                    <div className="text-center">
                      <div className="text-4xl mb-3">🪵</div>
                      <div className="text-sm">Učitavam 3D prikaz...</div>
                    </div>
                  </div>
                }
              >
                <Viewer3D parts={parts} W={W} H={H} D={D} selected={selected} onSelect={setSelected} onDoubleClick={openEditPopup} />
              </Suspense>
            ) : (
              <FurnitureView2D parts={parts} W={W} H={H} D={D} selected={selected} onSelect={setSelected} onDoubleClick={openEditPopup} />
            )
          ) : (
            <div className="h-full overflow-y-auto p-4">
              <DimensionTable parts={parts} selected={selected} onSelect={setSelected} />
            </div>
          )}
        </div>

        <div className="px-5 py-2 border-t border-slate-200 bg-white flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-slate-400">
            {parts.filter((p) => p.kind !== "zona").length} ploča ·{" "}
            {parts.filter((p) => ["front", "ladica_front"].includes(p.kind)).length} fronti
          </div>
          <div className="text-xs text-slate-400">
            T=18mm · Leda=16mm · MegaTischler standard
          </div>
        </div>
      </main>

      {/* ── Edit popup ─────────────────────────────────────────────────────── */}
      {showEditPopup && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)" }}
          onClick={() => setShowEditPopup(false)}
        >
          <div
            className="rounded-2xl overflow-hidden w-96 flex flex-col"
            style={{ boxShadow: "0 32px 64px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dark header */}
            <div
              className="px-6 pt-5 pb-4 flex items-start justify-between"
              style={{ background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)" }}
            >
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-base">🪵</span>
                  <span className="text-white font-bold text-base tracking-wide">{module}</span>
                </div>
                <div className="text-slate-400 text-[11px]">Parametri i dimenzije</div>
              </div>
              <button
                onClick={() => setShowEditPopup(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-white transition-colors mt-0.5"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="bg-white px-6 py-5 space-y-5">

              {/* Dimensions — 3-column card grid */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Dimenzije</div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: "W", label: "Širina", value: editW, set: setEditW, min: MODULE_DEFAULTS[module].minW, max: MODULE_DEFAULTS[module].maxW },
                    { key: "H", label: "Visina", value: editH, set: setEditH, min: MODULE_DEFAULTS[module].minH, max: MODULE_DEFAULTS[module].maxH },
                    { key: "D", label: "Dubina", value: editD, set: setEditD, min: MODULE_DEFAULTS[module].minD, max: MODULE_DEFAULTS[module].maxD },
                  ] as Array<{ key: string; label: string; value: number; set: (v: number) => void; min: number; max: number }>).map(({ key, label, value, set, min, max }) => (
                    <div
                      key={key}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 flex flex-col items-center gap-1.5"
                    >
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{key}</div>
                      <input
                        type="number"
                        value={value}
                        min={min}
                        max={max}
                        onChange={(e) => set(parseInt(e.target.value, 10))}
                        className="w-full text-center text-lg font-mono font-bold text-slate-800 bg-transparent border-none outline-none focus:bg-white focus:rounded-lg p-0"
                        style={{ appearance: "textfield" }}
                      />
                      <div className="text-[10px] text-slate-400">{label} · mm</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Module params */}
              {MODULE_PARAM_META[module] && MODULE_PARAM_META[module]!.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Parametri</div>
                  <div className="space-y-3.5">
                    {MODULE_PARAM_META[module]!
                      .filter((meta) => !meta.visibleWhen || meta.visibleWhen(editParams))
                      .map((meta) => (
                        <div key={meta.key}>
                          <div className="text-xs font-medium text-slate-500 mb-1.5">{meta.label}</div>
                          {meta.type === "select" && meta.options ? (
                            /* Chip selector */
                            <div className="flex flex-wrap gap-1.5">
                              {meta.options.map((opt) => {
                                const isActive = (editParams[meta.key] ?? MODULE_PARAM_DEFAULTS[module][meta.key] ?? 0) === opt.value;
                                return (
                                  <button
                                    key={opt.value}
                                    onClick={() => setEditParams(p => ({ ...p, [meta.key]: opt.value }))}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                                    style={isActive ? {
                                      background: "#1e40af",
                                      color: "#fff",
                                      boxShadow: "0 2px 8px rgba(30,64,175,0.35)",
                                    } : {
                                      background: "#f1f5f9",
                                      color: "#475569",
                                    }}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            /* Stepper */
                            <div className="flex items-center gap-0">
                              <button
                                onClick={() => setEditParams(p => ({ ...p, [meta.key]: Math.max(meta.min ?? 1, ((p[meta.key] ?? meta.min ?? 1) as number) - 1) }))}
                                className="w-9 h-9 flex items-center justify-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors font-bold text-base"
                              >−</button>
                              <div className="h-9 px-5 flex items-center justify-center border-y border-slate-200 bg-white text-slate-800 font-mono font-bold text-base min-w-[3rem] text-center">
                                {editParams[meta.key] ?? meta.min ?? 1}
                              </div>
                              <button
                                onClick={() => setEditParams(p => ({ ...p, [meta.key]: Math.min(meta.max ?? 99, ((p[meta.key] ?? meta.min ?? 1) as number) + 1) }))}
                                className="w-9 h-9 flex items-center justify-center rounded-r-xl border border-l-0 border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors font-bold text-base"
                              >+</button>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-slate-100 px-6 py-4 flex gap-2.5">
              <button
                onClick={() => setShowEditPopup(false)}
                className="flex-none px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-all"
              >Odustani</button>
              <button
                onClick={applyEdit}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", boxShadow: "0 4px 12px rgba(37,99,235,0.4)" }}
              >
                Primijeni promjene
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
