import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, Text } from "@react-three/drei";
import { useRef, useMemo } from "react";
import * as THREE from "three";
import type { Part, PartKind } from "../lib/formula-engine";

const KIND_COLORS: Record<PartKind, string> = {
  stranica:     "#8FA8B4",
  pod:          "#8FA8B4",
  strop:        "#8FA8B4",
  leda:         "#A8BEC8",
  polica:       "#A89080",
  front:        "#E8EAEC",
  ladica_front: "#D8DCE0",
  pregrada:     "#9AA8AA",
  preklop:      "#78B87A",
  zona:         "#60B0E0",
};

const KIND_OPACITY: Record<PartKind, number> = {
  stranica:     1,
  pod:          1,
  strop:        1,
  leda:         0.92,
  polica:       1,
  front:        0.90,
  ladica_front: 0.90,
  pregrada:     1,
  preklop:      1,
  zona:         0.30,
};

const EDGE_COLOR = "#2E4050";

interface BoardProps {
  part: Part;
  scale: number;
  selected: string | null;
  onSelect: (id: string) => void;
  onDoubleClick: () => void;
}

function Board({ part, scale, selected, onSelect, onDoubleClick }: BoardProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const isSelected = selected === part.id;
  const baseColor = KIND_COLORS[part.kind];
  const opacity = KIND_OPACITY[part.kind];
  const transparent = opacity < 1;

  const w = part.w * scale;
  const h = part.h * scale;
  const d = part.d * scale;

  const posX = part.x * scale;
  const posY = part.y * scale;
  const posZ = part.z * scale;

  const edgesGeo = useMemo(() => {
    const box = new THREE.BoxGeometry(w, h, d);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [w, h, d]);

  return (
    <group position={[posX, posY, posZ]}>
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onSelect(part.id); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
      >
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={isSelected ? "#1565C0" : baseColor}
          emissive={isSelected ? "#1E88E5" : "#000000"}
          emissiveIntensity={isSelected ? 0.25 : 0}
          opacity={opacity}
          transparent={transparent}
          roughness={0.65}
          metalness={0.05}
          side={part.kind === "zona" ? THREE.DoubleSide : THREE.FrontSide}
        />
      </mesh>
      {part.kind !== "zona" && (
        <lineSegments geometry={edgesGeo}>
          <lineBasicMaterial
            color={isSelected ? "#0D47A1" : EDGE_COLOR}
            transparent={transparent}
            opacity={opacity * (isSelected ? 1.0 : 0.85)}
          />
        </lineSegments>
      )}
    </group>
  );
}

interface DimLabelProps {
  text: string;
  position: [number, number, number];
}

function DimLabel({ text, position }: DimLabelProps) {
  return (
    <Text
      position={position}
      fontSize={0.012}
      color="#263238"
      anchorX="center"
      anchorY="middle"
      depthOffset={-1}
    >
      {text}
    </Text>
  );
}

interface SceneProps {
  parts: Part[];
  W: number;
  H: number;
  D: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onDoubleClick: () => void;
}

function Scene({ parts, W, H, D, selected, onSelect, onDoubleClick }: SceneProps) {
  const scale = 1 / 1000;
  const wS = W * scale;
  const hS = H * scale;
  const dS = D * scale;

  const labels = useMemo(() => [
    { text: `Širina: ${W}mm`, pos: [wS / 2, -0.06, dS / 2] as [number, number, number] },
    { text: `Visina: ${H}mm`, pos: [-0.08, hS / 2, dS / 2] as [number, number, number] },
    { text: `Dubina: ${D}mm`, pos: [wS / 2, -0.06, 0] as [number, number, number] },
  ], [W, H, D, wS, hS, dS]);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 4, 3]} intensity={1.2} castShadow />
      <directionalLight position={[-1, 2, -2]} intensity={0.5} />
      <directionalLight position={[0, -1, 1]} intensity={0.15} />

      <group onClick={() => onSelect(null)}>
        {parts.map((part) => (
          <Board
            key={part.id}
            part={part}
            scale={scale}
            selected={selected}
            onSelect={onSelect}
            onDoubleClick={onDoubleClick}
          />
        ))}
      </group>

      {labels.map((l) => (
        <DimLabel key={l.text} text={l.text} position={l.pos} />
      ))}

      <Grid
        args={[4, 4]}
        position={[wS / 2, -0.001, dS / 2]}
        cellColor="#90A4AE"
        sectionColor="#607D8B"
        cellSize={0.1}
        sectionSize={0.5}
        fadeDistance={5}
        infiniteGrid
      />

      <OrbitControls
        makeDefault
        minDistance={0.3}
        maxDistance={4}
        target={[wS / 2, hS / 2, dS / 2]}
        enableDamping
        dampingFactor={0.08}
      />
      <Environment preset="apartment" />
    </>
  );
}

interface FurnitureViewerProps {
  parts: Part[];
  W: number;
  H: number;
  D: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onDoubleClick: () => void;
}

export default function FurnitureViewer({ parts, W, H, D, selected, onSelect, onDoubleClick }: FurnitureViewerProps) {
  return (
    <div className="w-full h-full rounded-lg overflow-hidden bg-slate-100">
      <Canvas
        camera={{
          position: [(W / 1000) * 2.2, (H / 1000) * 1.1, (D / 1000) * 3.5],
          fov: 45,
          near: 0.01,
          far: 50,
        }}
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <Scene
          parts={parts}
          W={W}
          H={H}
          D={D}
          selected={selected}
          onSelect={onSelect}
          onDoubleClick={onDoubleClick}
        />
      </Canvas>
      <div className="absolute bottom-3 right-3 text-xs text-slate-500 bg-white/80 rounded px-2 py-1 pointer-events-none">
        Lijevi klik: odabir · Dvostruki klik: parametri · Desni klik: rotacija · Scroll: zoom
      </div>
    </div>
  );
}
