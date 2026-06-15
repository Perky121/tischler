import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, Text } from "@react-three/drei";
import { useRef, useMemo } from "react";
import * as THREE from "three";
import type { Part, PartKind } from "../lib/formula-engine";

const KIND_COLORS: Record<PartKind, string> = {
  stranica: "#B0BEC5",
  pod: "#B0BEC5",
  strop: "#B0BEC5",
  leda: "#CFD8DC",
  polica: "#D7CCC8",
  front: "#F5F5F5",
  ladica_front: "#ECEFF1",
  pregrada: "#BDBDBD",
  preklop: "#C8E6C9",
  zona: "#B3E5FC",
};

const KIND_OPACITY: Record<PartKind, number> = {
  stranica: 1,
  pod: 1,
  strop: 1,
  leda: 0.95,
  polica: 1,
  front: 0.92,
  ladica_front: 0.92,
  pregrada: 1,
  preklop: 1,
  zona: 0.35,
};

interface BoardProps {
  part: Part;
  scale: number;
  selected: string | null;
  onSelect: (id: string) => void;
}

function Board({ part, scale, selected, onSelect }: BoardProps) {
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

  return (
    <mesh
      ref={meshRef}
      position={[posX, posY, posZ]}
      onClick={(e) => { e.stopPropagation(); onSelect(part.id); }}
    >
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial
        color={baseColor}
        emissive={isSelected ? "#1E88E5" : "#000000"}
        emissiveIntensity={isSelected ? 0.4 : 0}
        opacity={opacity}
        transparent={transparent}
        roughness={0.75}
        metalness={0.0}
        side={part.kind === "zona" ? THREE.DoubleSide : THREE.FrontSide}
      />
    </mesh>
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
}

function Scene({ parts, W, H, D, selected, onSelect }: SceneProps) {
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
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 4, 3]} intensity={1.0} castShadow />
      <directionalLight position={[-1, 2, -2]} intensity={0.4} />

      <group onClick={() => onSelect(null)}>
        {parts.map((part) => (
          <Board
            key={part.id}
            part={part}
            scale={scale}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
      </group>

      {labels.map((l) => (
        <DimLabel key={l.text} text={l.text} position={l.pos} />
      ))}

      <Grid
        args={[4, 4]}
        position={[wS / 2, -0.001, dS / 2]}
        cellColor="#B0BEC5"
        sectionColor="#90A4AE"
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
}

export default function FurnitureViewer({ parts, W, H, D, selected, onSelect }: FurnitureViewerProps) {
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
        />
      </Canvas>
      <div className="absolute bottom-3 right-3 text-xs text-slate-500 bg-white/80 rounded px-2 py-1 pointer-events-none">
        Lijevi klik: odabir · Desni klik: rotacija · Scroll: zoom
      </div>
    </div>
  );
}
