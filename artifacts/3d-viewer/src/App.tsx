import { useState, useMemo, lazy, Suspense, useEffect } from "react";
import { calculate, MODULE_DEFAULTS } from "./lib/formula-engine";
import type { ModuleName } from "./lib/formula-engine";
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

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data || e.data.type !== "MEGATISCHLER_DIMS") return;
      const { module: m, W: w, H: h, D: d } = e.data as {
        type: string; module?: string; W?: number; H?: number; D?: number;
      };
      const clamp = (v: number, mn: number, mx: number) => Math.max(mn, Math.min(mx, v));
      const newMod: ModuleName =
        m && VALID_MODULES.includes(m as ModuleName) ? (m as ModuleName) : module;
      const def = MODULE_DEFAULTS[newMod];
      setModule(newMod);
      if (typeof w === "number" && !isNaN(w)) setW(clamp(w, def.minW, def.maxW));
      if (typeof h === "number" && !isNaN(h)) setH(clamp(h, def.minH, def.maxH));
      if (typeof d === "number" && !isNaN(d)) setD(clamp(d, def.minD, def.maxD));
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [module]);

  const [selected, setSelected] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<"viewer" | "tablica">("viewer");
  const [viewMode, setViewMode] = useState<"3d" | "2d">(HAS_WEBGL ? "3d" : "2d");

  const { parts, warnings } = useMemo(() => calculate(module, W, H, D), [module, W, H, D]);

  const handleChange = (m: ModuleName, w: number, h: number, d: number) => {
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
          <InputPanel module={module} W={W} H={H} D={D} onChange={handleChange} />
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
                <Viewer3D parts={parts} W={W} H={H} D={D} selected={selected} onSelect={setSelected} />
              </Suspense>
            ) : (
              <FurnitureView2D parts={parts} W={W} H={H} D={D} selected={selected} onSelect={setSelected} />
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
    </div>
  );
}
