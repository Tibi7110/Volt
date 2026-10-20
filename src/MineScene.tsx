import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Simulator, DispatchSimulator, storagePosition } from "./simulation";

type V3 = [number, number, number];
export type CameraPreset =
  | "Overview"
  | "Shaft"
  | "Upper station"
  | "Lower station"
  | "Top"
  | "Side"
  | "Isometric";
const STEEL = "#667783",
  TEAL = "#49d7b7",
  AMBER = "#f2b45b";
const SHAFT_HEIGHT = 36; // Visual depth; engineering travel remains configured in SI units.
const level = (h: number, total: number) =>
  -SHAFT_HEIGHT + (h / total) * SHAFT_HEIGHT;
// Four hoists share one rectangular shaft in a two-by-two compartment grid.
const CELL_X = 7;
const CELL_Z = 7;
const SHAFT_WIDTH = 14.8;
const SHAFT_DEPTH = 14.8;
const LANE_CELLS: Array<[number, number]> = [
  [CELL_X / 2, -CELL_Z / 2],
  [CELL_X / 2, CELL_Z / 2],
  [-CELL_X / 2, -CELL_Z / 2],
  [-CELL_X / 2, CELL_Z / 2],
];
const stationZ = (z: number) => z * 0.7;
function Box({
  position,
  size,
  color = STEEL,
  opacity = 1,
}: {
  position: V3;
  size: V3;
  color?: string;
  opacity?: number;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        metalness={0.35}
        roughness={0.65}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity === 1}
      />
    </mesh>
  );
}
function Beam({
  a,
  b,
  radius = 0.06,
  color = STEEL,
}: {
  a: V3;
  b: V3;
  radius?: number;
  color?: string;
}) {
  const { length, center, quaternion } = useMemo(() => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      dir = end.clone().sub(start);
    return {
      length: dir.length(),
      center: start.add(end).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.normalize(),
      ),
    };
  }, [a[0], a[1], a[2], b[0], b[1], b[2]]);
  return (
    <mesh position={center} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, Math.max(0.001, length), 8]} />
      <meshStandardMaterial color={color} metalness={0.7} roughness={0.35} />
    </mesh>
  );
}
function Label({
  position,
  children,
  muted = false,
}: {
  position: V3;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <Html
      position={position}
      center
      distanceFactor={45}
      zIndexRange={[30, 0]}
      style={{ pointerEvents: "none" }}
    >
      <span className={`scene-label ${muted ? "muted" : ""}`}>{children}</span>
    </Html>
  );
}
function Wheel({
  position,
  radius = 0.6,
  rotation,
}: {
  position: V3;
  radius?: number;
  rotation: number;
}) {
  return (
    <group position={position} rotation={[0, 0, rotation]}>
      <mesh>
        <torusGeometry args={[radius, 0.09, 8, 32]} />
        <meshStandardMaterial color={AMBER} metalness={0.7} roughness={0.4} />
      </mesh>
      {[0, Math.PI / 3, (Math.PI * 2) / 3].map((a) => (
        <group key={a} rotation={[0, 0, a]}>
          <Box
            position={[0, 0, 0]}
            size={[radius * 2, 0.08, 0.12]}
            color={STEEL}
          />
        </group>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.4, 12]} />
        <meshStandardMaterial color={STEEL} />
      </mesh>
    </group>
  );
}
function Terrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(48, 16, 18, 9);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i);
      const ridge = Math.max(0, 1 - Math.abs(z + 3) / 9);
      pos.setY(
        i,
        Math.max(
          0,
          Math.sin(x * 0.27 + 1.8) * 2.5 + Math.cos(x * 0.45) * 1.2 + 3.3,
        ) * ridge,
      );
    }
    geo.computeVertexNormals();
    return geo;
  }, []);
  return (
    <group position={[0, -0.5, -14]}>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial
          color="#344a47"
          flatShading
          roughness={1}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
function Station({
  upper,
  sim,
  id,
}: {
  upper: boolean;
  sim: Simulator;
  id: number;
}) {
  const y = upper ? 0 : -SHAFT_HEIGHT,
    side = upper ? -1 : 1;
  const columns = Math.ceil(sim.params.count / 2);
  const far = 7 + (columns - 1) * 1.9;
  const trolleyX = upper ? sim.upperTrolleyX : sim.lowerTrolleyX;
  const active = sim.active;
  const transferHere =
    active &&
    ((sim.sourceUpper === upper &&
      ["collecting", "loading", "locking"].includes(sim.phase)) ||
      (sim.sourceUpper !== upper &&
        ["unloading", "storing"].includes(sim.phase)));
  const forkX =
    sim.phase === "locking"
      ? (trolleyX * sim.phaseElapsed) / sim.duration
      : (active?.x ?? trolleyX);
  return (
    <group>
      <Box
        position={[(side * (far + 3.2)) / 2, y - 0.6, 0]}
        size={[far - 0.4, 0.8, CELL_Z - 1.5]}
        color="#27343e"
      />
      <Box
        position={[(side * (far + 3.2)) / 2, y - 0.15, 3.2]}
        size={[far + 1.4, 0.12, 0.12]}
        color={upper ? TEAL : AMBER}
      />
      {[-0.7, 0.7].map((z) => (
        <group key={z}>
          <Box
            position={[(side * (far + 2)) / 2, y + 0.07, z]}
            size={[far, 0.12, 0.09]}
            color="#91a1ab"
          />
          {Array.from({ length: Math.ceil(far) }, (_, i) => (
            <Box
              key={i}
              position={[side * (i + 2), y - 0.05, 0]}
              size={[0.16, 0.12, 1.8]}
              color="#42525d"
            />
          ))}
        </group>
      ))}
      {Array.from({ length: sim.params.count }, (_, i) => {
        const s = storagePosition(i, upper);
        return (
          <group key={i}>
            <Box
              position={[s.x, y - 0.12, stationZ(s.z)]}
              size={[1.8, 0.15, 1.9]}
              color="#42515a"
            />
            <Box
              position={[s.x, y + 0.01, stationZ(s.z) + 0.9]}
              size={[1.5, 0.04, 0.06]}
              color={upper ? "#467c72" : "#846d46"}
            />
          </group>
        );
      })}
      <group position={[trolleyX, y + 0.22, 0]}>
        <Box position={[0, 0, 0]} size={[2, 0.3, 1.8]} color={AMBER} />
        {[-0.8, 0.8].flatMap((x) =>
          [-0.7, 0.7].map((z) => (
            <mesh
              key={`${x}${z}`}
              position={[x, -0.15, z]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.22, 0.22, 0.14, 12]} />
              <meshStandardMaterial color="#10191f" />
            </mesh>
          )),
        )}
        <Box
          position={[0, 0.25, -0.75]}
          size={[1.4, 0.25, 0.22]}
          color="#293b43"
        />
        <Label position={[0, -0.8, 1.7]} muted>
          H{id} / {upper ? "UPPER" : "LOWER"} TRANSFER
        </Label>
      </group>
      {transferHere &&
        active &&
        [-0.48, 0.48].map((offset) => (
          <Beam
            key={offset}
            a={[trolleyX + offset, y + 0.5, 0]}
            b={[forkX + offset, y + 0.5, stationZ(active.z)]}
            radius={0.06}
            color={AMBER}
          />
        ))}
      <Label position={[side * (far / 2 + 1.5), y + 2.7, -2.8]}>
        H{id} / {upper ? "UPPER EXCHANGE" : "LOWER EXCHANGE"}
      </Label>
      {[-3.1, 3.1].map((z) => (
        <group key={z}>
          <Beam a={[side * 2, y, z]} b={[side * 2, y + 1, z]} radius={0.035} />
          <Beam
            a={[side * far, y, z]}
            b={[side * far, y + 1, z]}
            radius={0.035}
          />
          <Beam
            a={[side * 2, y + 1, z]}
            b={[side * far, y + 1, z]}
            radius={0.035}
          />
        </group>
      ))}
    </group>
  );
}
function SharedShaft({
  sim,
  transparent,
}: {
  sim: DispatchSimulator;
  transparent: boolean;
}) {
  const halfX = SHAFT_WIDTH / 2;
  const halfZ = SHAFT_DEPTH / 2;
  return (
    <group name="shared-shaft">
      <group position={[0, 0, -halfZ]}>
        <Terrain />
      </group>
      <Box
        position={[0, -(SHAFT_HEIGHT + 1) / 2, -halfZ - 1.6]}
        size={[SHAFT_WIDTH + 3, SHAFT_HEIGHT + 1, 3]}
        color="#202d35"
      />
      {/* One continuous shell and one common collar, never four lane enclosures. */}
      <group name="shared-outer-shell">
        {[-1, 1].map((side) => (
          <group key={side}>
            <Box
              position={[side * halfX, -(SHAFT_HEIGHT - 4) / 2, 0]}
              size={[0.45, SHAFT_HEIGHT - 4, SHAFT_DEPTH]}
              color="#75858b"
              opacity={transparent ? 0.13 : 0.35}
            />
            <Box
              position={[0, -SHAFT_HEIGHT / 2, side * halfZ]}
              size={[SHAFT_WIDTH, SHAFT_HEIGHT, 0.45]}
              color="#75858b"
              opacity={transparent ? 0.1 : 0.3}
            />
            {[-halfZ, halfZ].map((z) => (
              <Box
                key={z}
                position={[side * halfX, -SHAFT_HEIGHT / 2, z]}
                size={[0.5, SHAFT_HEIGHT, 0.5]}
                color="#70838b"
              />
            ))}
          </group>
        ))}
        {[0, -SHAFT_HEIGHT - 0.5].map((y) => (
          <group key={y}>
            {[-1, 1].map((side) => (
              <group key={side}>
                <Box
                  position={[side * halfX, y - 0.4, 0]}
                  size={[0.75, 0.7, SHAFT_DEPTH + 0.75]}
                  color="#8a999c"
                />
                <Box
                  position={[0, y - 0.4, side * halfZ]}
                  size={[SHAFT_WIDTH, 0.7, 0.75]}
                  color="#8a999c"
                />
              </group>
            ))}
          </group>
        ))}
        <Box
          position={[0, -SHAFT_HEIGHT - 0.95, 0]}
          size={[SHAFT_WIDTH + 0.5, 0.3, SHAFT_DEPTH + 0.5]}
          color="#27343e"
        />
      </group>
      <group name="shared-internal-dividers">
        <Box
          position={[0, -SHAFT_HEIGHT / 2, 0]}
          size={[0.22, SHAFT_HEIGHT, SHAFT_DEPTH]}
          color="#668d92"
          opacity={transparent ? 0.2 : 0.4}
        />
        <Box
          position={[0, -SHAFT_HEIGHT / 2, 0]}
          size={[SHAFT_WIDTH, SHAFT_HEIGHT, 0.22]}
          color="#668d92"
          opacity={transparent ? 0.2 : 0.4}
        />
        <Box
          position={[0, -SHAFT_HEIGHT / 2, 0]}
          size={[0.28, SHAFT_HEIGHT, 0.28]}
          color="#709a9b"
        />
        {Array.from({ length: 6 }, (_, i) => (-i * SHAFT_HEIGHT) / 5).map(
          (y) => (
            <group key={y}>
              <Box
                position={[0, y - 0.15, 0]}
                size={[0.18, 0.16, SHAFT_DEPTH]}
                color="#759b9d"
              />
              <Box
                position={[0, y - 0.15, 0]}
                size={[SHAFT_WIDTH, 0.16, 0.18]}
                color="#759b9d"
              />
            </group>
          ),
        )}
      </group>
      <group name="shared-headframe">
        {[-1, 1].flatMap((x) =>
          [-1, 1].map((z) => (
            <Beam
              key={`${x}-${z}`}
              a={[x * halfX, 0, z * halfZ]}
              b={[x * halfX, 8.7, z * halfZ]}
              radius={0.15}
            />
          )),
        )}
        {[-1, 1].map((side) => (
          <group key={side}>
            <Beam
              a={[-halfX, 8.7, side * halfZ]}
              b={[halfX, 8.7, side * halfZ]}
              radius={0.14}
            />
            <Beam
              a={[side * halfX, 8.7, -halfZ]}
              b={[side * halfX, 8.7, halfZ]}
              radius={0.14}
            />
          </group>
        ))}
        {[-CELL_Z / 2, CELL_Z / 2].map((z) => (
          <Beam
            key={z}
            a={[-halfX - 2, 8, z]}
            b={[halfX + 2, 8, z]}
            radius={0.12}
          />
        ))}
        {/* Open headframe keeps all four compartments visible from above. */}
        <Label position={[0, 10, halfZ + 1]}>
          ONE SHARED SHAFT · 2 × 2 COMPARTMENTS
        </Label>
      </group>
      <Box
        position={[-12, 1.3, -halfZ - 7]}
        size={[4, 3.6, 0.8]}
        color="#69716b"
      />
      <Box
        position={[-12, 0.9, -halfZ - 6.55]}
        size={[2.6, 2.8, 0.08]}
        color="#080f13"
      />
      <Box
        position={[-12, 2.5, -halfZ - 6.45]}
        size={[2.8, 0.16, 0.1]}
        color={AMBER}
      />
      <Label position={[-12, 4.1, -halfZ - 6.5]} muted>
        JIU VALLEY / CONCEPT SITE
      </Label>
      {Array.from({ length: 6 }, (_, i) => (
        <Label
          key={i}
          position={[-halfX - 0.7, (-i * SHAFT_HEIGHT) / 5, halfZ + 0.6]}
          muted
        >
          −{Math.round((sim.params.height * i) / 5)} m
        </Label>
      ))}
    </group>
  );
}

function Mechanism({ sim, id }: { sim: Simulator; id: number }) {
  const y = level(sim.platformHeight, sim.params.height);
  const ropeTravel =
    (sim.params.height - sim.platformHeight) * (sim.params.reeving ? 2 : 1);
  const flow =
    !sim.paused && ["lifting", "lowering"].includes(sim.phase)
      ? sim.mode === "charge"
        ? AMBER
        : TEAL
      : STEEL;
  return (
    <group>
      {[-1.65, 1.65].map((x) => (
        <Box
          key={x}
          position={[x, 1 - SHAFT_HEIGHT / 2, 0]}
          size={[0.08, SHAFT_HEIGHT + 2, 0.08]}
          color="#7d919a"
        />
      ))}
      {/* Both storage docks face outwards; the upper block positions use the same reflection below. */}
      <group scale={[-1, 1, 1]}>
        <Station upper sim={sim} id={id} />
      </group>
      <Station upper={false} sim={sim} id={id} />
      {/* Independent ropes and guides inside the common shaft envelope. */}
      <group name={`platform-${id}`} position={[0, y, 0]}>
        <Box
          position={[0, 0.23, 0]}
          size={[2.5, 0.28, 2.3]}
          color={["lifting", "lowering"].includes(sim.phase) ? TEAL : AMBER}
        />
        {[-1, 1].map((x) => (
          <group key={x}>
            <Beam
              a={[x, 0.2, -0.9]}
              b={[x, 2.7, -0.9]}
              radius={0.065}
              color={AMBER}
            />
            <Beam
              a={[x, 2.7, -0.9]}
              b={[0, 2.7, 0]}
              radius={0.065}
              color={AMBER}
            />
          </group>
        ))}
        <Box position={[0, 2.7, 0]} size={[2.4, 0.12, 0.16]} color={AMBER} />
        {sim.params.reeving && (
          <Wheel
            position={[0, 3.25, 0]}
            radius={0.55}
            rotation={ropeTravel / 2}
          />
        )}
        <Label position={[2.8, 0.8, 0]} muted>
          H{id} · {sim.state} · {Math.round(sim.platformHeight)} m
        </Label>
      </group>
      <group name={`cables-${id}`}>
        {sim.params.reeving ? (
          <>
            <Beam
              a={[-0.55, 8, 0]}
              b={[-0.55, y + 3.25, 0]}
              radius={0.035}
              color="#c5d0cf"
            />
            <Beam
              a={[0.55, 8, 0]}
              b={[0.55, y + 3.25, 0]}
              radius={0.035}
              color="#c5d0cf"
            />
            <Box
              position={[-0.55, 8, 0]}
              size={[0.3, 0.2, 0.3]}
              color={AMBER}
            />
          </>
        ) : (
          <Beam
            a={[0, 8, 0]}
            b={[0, y + 2.7, 0]}
            radius={0.045}
            color="#c5d0cf"
          />
        )}
        <Wheel
          position={[sim.params.reeving ? 1.25 : 0.7, 8, 0]}
          radius={0.7}
          rotation={ropeTravel / 0.7}
        />
        <Beam
          a={[sim.params.reeving ? 1.9 : 1.35, 8.1, 0]}
          b={[5, 1.6, 0]}
          radius={0.04}
          color="#c5d0cf"
        />
      </group>
      <group name={`motor-generator-${id}`} position={[5, 1.3, 0]}>
        <Box position={[0, -0.7, 0]} size={[4.2, 0.6, 3]} color="#30424c" />
        <group rotation={[0, 0, ropeTravel / 0.65]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.7, 0.7, 1.3, 24]} />
            <meshStandardMaterial
              color="#98a5a8"
              metalness={0.8}
              roughness={0.4}
            />
          </mesh>
          <Box position={[0.4, 0, 0.7]} size={[0.12, 1, 0.08]} color={AMBER} />
        </group>
        <mesh position={[0, 0, -1.25]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 1.1, 16]} />
          <meshStandardMaterial color={flow} metalness={0.5} roughness={0.5} />
        </mesh>
        <Label position={[0, 2, -0.2]}>MOTOR / GENERATOR</Label>
      </group>
      <Box position={[9, 0.9, -2.5]} size={[2, 2.5, 1.5]} color="#3d515c" />
      <Label position={[9, 2.8, -2.5]} muted>
        GRID INTERFACE
      </Label>
      <PowerFlow sim={sim} />
      {sim.blocks.map((b) => (
        <group
          key={b.id}
          position={[
            b.height === sim.params.height ? -b.x : b.x,
            level(b.height, sim.params.height) + 1.04,
            stationZ(b.z),
          ]}
        >
          <Box
            position={[0, 0, 0]}
            size={[1.55, 1.2, 1.55]}
            color={b.id === sim.activeId ? "#91aaa7" : "#6f7d81"}
          />
          {[-0.5, 0.5].map((x) => (
            <Box
              key={x}
              position={[x, 0, 0]}
              size={[0.09, 1.23, 1.58]}
              color={b.id === sim.activeId ? AMBER : "#394a52"}
            />
          ))}
          <Label position={[0, 0.1, 0.8]} muted={b.id !== sim.activeId}>
            {b.id}
          </Label>
        </group>
      ))}
    </group>
  );
}
function PowerFlow({ sim }: { sim: Simulator }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current)
      ref.current.children.forEach((child, i) => {
        child.position.x =
          5.6 +
          ((clock.elapsedTime * (sim.mode === "charge" ? -1 : 1) * 1.6 +
            i +
            10000) %
            3);
      });
  });
  if (!["lifting", "lowering"].includes(sim.phase) || sim.paused) return null;
  const color = sim.mode === "charge" ? AMBER : TEAL;
  return (
    <group>
      <Beam
        a={[5.5, 0.25, -2.5]}
        b={[9, 0.25, -2.5]}
        radius={0.04}
        color={color}
      />
      <group ref={ref}>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            position={[6 + i, 0.25, -2.5]}
            rotation={[
              0,
              0,
              sim.mode === "charge" ? Math.PI / 2 : -Math.PI / 2,
            ]}
          >
            <coneGeometry args={[0.16, 0.42, 6]} />
            <meshBasicMaterial color={color} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
function CameraRig({
  preset,
  revision,
  count,
}: {
  preset: CameraPreset;
  revision: number;
  count: number;
}) {
  const { camera } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const target = useRef(new THREE.Vector3());
  const destination = useRef(new THREE.Vector3());
  const moving = useRef(false);
  useEffect(() => {
    const scale = Math.max(1, count / 60);
    const views: Record<CameraPreset, [V3, V3]> = {
      Overview: [
        [32 * scale, 18 * scale, 56 * scale],
        [0, 5 - SHAFT_HEIGHT / 2, 0],
      ],
      Shaft: [
        [12, -10, 43],
        [0, 1 - SHAFT_HEIGHT / 2, 0],
      ],
      "Upper station": [
        [22, 25, 35],
        [0, 2, 7],
      ],
      "Lower station": [
        [22, -SHAFT_HEIGHT + 20, 28],
        [0, -SHAFT_HEIGHT + 2, -7],
      ],
      Top: [
        [0, 58, 0],
        [0, -12, 0],
      ],
      Side: [
        [0, 5 - SHAFT_HEIGHT / 2, 82],
        [0, 5 - SHAFT_HEIGHT / 2, 0],
      ],
      Isometric: [
        [38, 24, 42],
        [0, 4 - SHAFT_HEIGHT / 2, 0],
      ],
    };
    camera.up.set(0, 1, 0);
    if (preset === "Top") camera.up.set(0, 0, -1);
    destination.current.set(...views[preset][0]);
    target.current.set(...views[preset][1]);
    moving.current = true;
  }, [preset, revision, count]);
  useFrame((_, dt) => {
    if (!moving.current || !controls.current) return;
    const alpha = 1 - Math.exp(-dt * 5);
    camera.position.lerp(destination.current, alpha);
    controls.current.target.lerp(target.current, alpha);
    controls.current.update();
    if (
      camera.position.distanceTo(destination.current) < 0.03 &&
      controls.current.target.distanceTo(target.current) < 0.03
    )
      moving.current = false;
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      minDistance={6}
      maxDistance={250}
      maxPolarAngle={Math.PI * 0.88}
      onStart={() => {
        moving.current = false;
      }}
    />
  );
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-error">
        3D requires a WebGL-capable browser. Simulation controls and energy
        accounting remain available.
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function MineScene({
  sim,
  transparent,
  preset,
  revision,
}: {
  sim: DispatchSimulator;
  transparent: boolean;
  preset: CameraPreset;
  revision: number;
}) {
  return (
    <SceneBoundary>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [32, 18, 56], fov: 44, near: 0.1, far: 350 }}
        gl={{ antialias: true }}
        fallback={
          <div className="scene-error">
            WebGL unavailable. Enable hardware acceleration to view the mine.
          </div>
        }
      >
        <color attach="background" args={["#101b24"]} />
        <fog attach="fog" args={["#101b24", 140, 280]} />
        <ambientLight intensity={1.2} />
        <hemisphereLight args={["#b9dbe6", "#354842", 1.8]} />
        <directionalLight
          position={[-15, 28, 25]}
          intensity={2.8}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-35}
          shadow-camera-right={35}
          shadow-camera-top={35}
          shadow-camera-bottom={-40}
        />
        <pointLight
          position={[4, -SHAFT_HEIGHT + 5, 7]}
          color="#79b9bc"
          intensity={65}
          distance={30}
        />
        <gridHelper
          args={[80, 40, "#253e48", "#1b303c"]}
          position={[0, -SHAFT_HEIGHT - 1, 0]}
        />
        {/* Local X is the near/far row; local Z becomes the side-by-side axis. */}
        <group name="shaft-layout" rotation={[0, Math.PI / 2, 0]}>
          <SharedShaft sim={sim} transparent={transparent} />
          {sim.lanes.map((lane, index) => (
            <group
              key={index}
              name={`guideway-${index + 1}`}
              position={[LANE_CELLS[index][0], 0, LANE_CELLS[index][1]]}
            >
              <group rotation={[0, LANE_CELLS[index][0] < 0 ? Math.PI : 0, 0]}>
                <Mechanism sim={lane} id={index + 1} />
              </group>
              <Label position={[0, 1.4, 0]}>H{index + 1}</Label>
            </group>
          ))}
        </group>
        <CameraRig
          preset={preset}
          revision={revision}
          count={sim.params.count}
        />
      </Canvas>
    </SceneBoundary>
  );
}
