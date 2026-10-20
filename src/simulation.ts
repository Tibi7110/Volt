// SI units throughout. Horizontal coordinates are schematic station metres.
export const G = 9.81;
export const joulesToKWh = (j: number) => j / 3_600_000;
export const potentialKWh = (mass: number, height: number) =>
  joulesToKWh(mass * G * height);
export type Mode = "charge" | "discharge";
export type Phase =
  | "waiting"
  | "positioning_empty"
  | "selecting"
  | "collecting"
  | "transporting"
  | "loading"
  | "locking"
  | "ready"
  | "lifting"
  | "lowering"
  | "unlocking"
  | "unloading"
  | "delivering"
  | "storing"
  | "returning_empty"
  | "source_docking";
export type HoistState =
  | "READY"
  | "LOADING"
  | "DESCENDING"
  | "ASCENDING"
  | "BOTTOM_DOCKING"
  | "UNLOADING"
  | "RETURNING_EMPTY"
  | "TOP_DOCKING"
  | "WAITING";
export type Location = "upper" | "lower" | "trolley" | "hoist";
export interface Parameters {
  count: number;
  mass: number;
  height: number;
  speed: number;
  emptySpeed: number;
  dispatchSpacing: number;
  transfer: number;
  chargeEfficiency: number;
  dischargeEfficiency: number;
  transferKW: number;
  emptyKW: number;
  reeving: boolean;
}
export const DEFAULTS: Parameters = {
  count: 20,
  mass: 20_000,
  height: 500,
  speed: 2,
  emptySpeed: 8,
  dispatchSpacing: 0,
  transfer: 2,
  chargeEfficiency: 0.9,
  dischargeEfficiency: 0.9,
  transferKW: 6,
  emptyKW: 8,
  reeving: true,
};
export interface Block {
  id: string;
  mass: number;
  slot: number;
  location: Location;
  height: number;
  x: number;
  z: number;
  status: "stored" | "selected" | "transferring" | "secured" | "travelling";
  assigned: "upper-trolley" | "lower-trolley" | "hoist" | null;
  animation: Phase;
}
export interface Event {
  time: number;
  text: string;
}
export const PHASE_LABELS: Record<Phase, string> = {
  waiting: "Awaiting dispatch",
  positioning_empty: "Position empty platform",
  selecting: "Select & approach block",
  collecting: "Collect block from storage",
  transporting: "Trolley to loading station",
  loading: "Transfer block onto platform",
  locking: "Secure load · retract forks",
  ready: "Ready · awaiting dispatch slot",
  lifting: "Lift · consuming grid power",
  lowering: "Controlled descent · generating",
  unlocking: "Dock & release load",
  unloading: "Transfer block to trolley",
  delivering: "Trolley to storage bay",
  storing: "Place block into storage",
  returning_empty: "Return empty platform",
  source_docking: "Dock empty carriage at source",
};
const TRANSITIONS: Record<Phase, Phase[]> = {
  waiting: ["waiting", "positioning_empty", "selecting"],
  positioning_empty: ["selecting"],
  selecting: ["collecting"],
  collecting: ["transporting"],
  transporting: ["loading"],
  loading: ["locking"],
  locking: ["ready", "lifting", "lowering"],
  ready: ["lifting", "lowering"],
  lifting: ["unlocking"],
  lowering: ["unlocking"],
  unlocking: ["unloading"],
  unloading: ["delivering"],
  delivering: ["storing"],
  storing: ["returning_empty"],
  returning_empty: [
    "source_docking",
    "waiting",
    "positioning_empty",
    "selecting",
  ],
  source_docking: ["waiting", "positioning_empty", "selecting"],
};
// Two independently accessible bays flank the rail: no stored block obstructs the trolley.
export const storagePosition = (slot: number, upper: boolean) => ({
  x: (upper ? -1 : 1) * (6 + Math.floor(slot / 2) * 1.9),
  z: slot % 2 === 0 ? -3 : 3,
});
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TRANSFER_PHASES: Phase[] = [
  "selecting",
  "collecting",
  "transporting",
  "loading",
  "locking",
  "unlocking",
  "unloading",
  "delivering",
  "storing",
  "source_docking",
];
export function validateParameters(p: Parameters): string | null {
  const bounds: [keyof Parameters, number, number][] = [
    ["count", 1, 500],
    ["mass", 1000, 100000],
    ["height", 50, 1000],
    ["speed", 0.5, 20],
    ["emptySpeed", 0.5, 60],
    ["dispatchSpacing", 0, 3600],
    ["transfer", 1, 60],
    ["chargeEfficiency", 0.1, 1],
    ["dischargeEfficiency", 0.1, 1],
    ["transferKW", 0, 100],
    ["emptyKW", 0, 100],
  ];
  for (const [key, lo, hi] of bounds)
    if (!Number.isFinite(p[key]) || Number(p[key]) < lo || Number(p[key]) > hi)
      return `${key} must be between ${lo} and ${hi}.`;
  if (!Number.isInteger(p.count)) return "Block count must be a whole number.";
  return null;
}

export class Simulator {
  readonly params: Parameters;
  blocks: Block[];
  phase: Phase = "waiting";
  mode: Mode | null = null;
  pendingMode: Mode | null = null;
  paused = false;
  auto = true;
  // Fleet dispatch can drain an exchange without assigning another block.
  stopAfterExchange = false;
  dispatchControlled = false;
  activeId: string | null = null;
  platformHeight: number;
  upperTrolleyX = -2.6;
  lowerTrolleyX = 2.6;
  elapsed = 0;
  phaseElapsed = 0;
  generated = 0;
  charging = 0;
  auxiliary = 0;
  released = 0;
  gained = 0;
  completed = 0;
  cycleStart = 0;
  lastCycleDuration = 0;
  events: Event[] = [];
  history: { time: number; power: number }[] = [{ time: 0, power: 0 }];
  private startPosition = {
    x: 0,
    z: 0,
    height: 0,
    trolleyX: 0,
    destinationTrolleyX: 0,
    platform: 0,
  };

  constructor(params: Parameters = DEFAULTS, inventoryCount = params.count) {
    const error = validateParameters(params);
    if (error) throw new Error(error);
    if (
      !Number.isInteger(inventoryCount) ||
      inventoryCount < 0 ||
      inventoryCount > params.count
    )
      throw new Error("Invalid lane inventory allocation");
    this.params = { ...params, count: inventoryCount };
    this.platformHeight = params.height;
    this.blocks = Array.from({ length: inventoryCount }, (_, slot) => ({
      id: `B${String(slot + 1).padStart(2, "0")}`,
      mass: params.mass,
      slot,
      location: "upper",
      height: params.height,
      ...storagePosition(slot, true),
      status: "stored",
      assigned: null,
      animation: "waiting",
    }));
    this.log("System ready · all blocks in upper storage");
  }
  get active() {
    return this.blocks.find((b) => b.id === this.activeId);
  }
  get capacity() {
    return potentialKWh(
      this.params.count * this.params.mass,
      this.params.height,
    );
  }
  get stored() {
    return this.blocks.reduce(
      (sum, b) => sum + potentialKWh(b.mass, b.height),
      0,
    );
  }
  get soc() {
    return this.capacity ? this.stored / this.capacity : 0;
  }
  get state(): HoistState {
    switch (this.phase) {
      case "waiting":
        return "WAITING";
      case "ready":
        return "READY";
      case "lowering":
        return "DESCENDING";
      case "lifting":
        return "ASCENDING";
      case "unlocking":
        return this.sourceUpper ? "BOTTOM_DOCKING" : "TOP_DOCKING";
      case "unloading":
      case "delivering":
      case "storing":
        return "UNLOADING";
      case "positioning_empty":
      case "returning_empty":
        return "RETURNING_EMPTY";
      case "source_docking":
        return this.sourceUpper ? "TOP_DOCKING" : "BOTTOM_DOCKING";
      default:
        return "LOADING";
    }
  }
  get velocity() {
    if (this.paused) return 0;
    if (this.phase === "lowering") return -this.params.speed;
    if (this.phase === "lifting") return this.params.speed;
    if (this.phase === "returning_empty")
      return (this.sourceUpper ? 1 : -1) * this.params.emptySpeed;
    if (this.phase === "positioning_empty")
      return (this.sourceUpper ? 1 : -1) * this.params.emptySpeed;
    return 0;
  }
  get sourceUpper() {
    return this.mode === "discharge";
  }
  get sourceHeight() {
    return this.sourceUpper ? this.params.height : 0;
  }
  get destinationHeight() {
    return this.sourceUpper ? 0 : this.params.height;
  }
  get sourceX() {
    return this.sourceUpper ? -2.6 : 2.6;
  }
  get destinationX() {
    return this.sourceUpper ? 2.6 : -2.6;
  }
  get netGrid() {
    return this.generated - this.charging - this.auxiliary;
  }
  get auxiliaryPower() {
    return TRANSFER_PHASES.includes(this.phase)
      ? this.params.transferKW
      : ["returning_empty", "positioning_empty"].includes(this.phase)
        ? this.params.emptyKW
        : 0;
  }
  get power() {
    if (this.paused || this.phase === "waiting") return 0;
    const mechanicalKW = (this.params.mass * G * this.params.speed) / 1000;
    return (
      (this.phase === "lowering"
        ? mechanicalKW * this.params.dischargeEfficiency
        : this.phase === "lifting"
          ? -mechanicalKW / this.params.chargeEfficiency
          : 0) - this.auxiliaryPower
    );
  }
  get grossPower() {
    return this.phase === "lowering" && !this.paused
      ? (this.params.mass *
          G *
          this.params.speed *
          this.params.dischargeEfficiency) /
          1000
      : this.phase === "lifting" && !this.paused
        ? (-this.params.mass * G * this.params.speed) /
          this.params.chargeEfficiency /
          1000
        : 0;
  }
  get cycleEstimate() {
    return (
      this.params.height / this.params.speed +
      this.params.height / this.params.emptySpeed +
      (this.dispatchControlled ? 8.05 : 7.7) * this.params.transfer
    );
  }
  get roundTripEstimate() {
    const aux =
      (this.params.count *
        (this.params.transferKW *
          (this.dispatchControlled ? 8.05 : 7.7) *
          this.params.transfer +
          (this.params.emptyKW * this.params.height) /
            this.params.emptySpeed)) /
      3600;
    return Math.max(
      0,
      this.capacity
        ? (this.capacity * this.params.dischargeEfficiency - aux) /
            (this.capacity / this.params.chargeEfficiency + aux)
        : 0,
    );
  }
  get duration() {
    if (this.phase === "waiting" || this.phase === "ready") return 0;
    if (this.phase === "positioning_empty")
      return (
        Math.abs(this.startPosition.platform - this.sourceHeight) /
        this.params.emptySpeed
      );
    if (this.phase === "returning_empty")
      return this.params.height / this.params.emptySpeed;
    if (["lifting", "lowering"].includes(this.phase))
      return this.params.height / this.params.speed;
    return (
      this.params.transfer *
      (["locking", "unlocking", "source_docking"].includes(this.phase)
        ? 0.35
        : 1)
    );
  }
  private log(text: string) {
    this.events = [{ time: this.elapsed, text }, ...this.events].slice(0, 80);
  }
  private enter(phase: Phase) {
    const b = this.active;
    if (!TRANSITIONS[this.phase].includes(phase))
      throw new Error(`Illegal machine transition: ${this.phase} → ${phase}`);
    if (
      [
        "loading",
        "locking",
        "unlocking",
        "unloading",
        "collecting",
        "storing",
        "ready",
        "source_docking",
      ].includes(phase) &&
      Math.abs(
        this.platformHeight -
          ([
            "loading",
            "locking",
            "collecting",
            "ready",
            "source_docking",
          ].includes(phase)
            ? this.sourceHeight
            : this.destinationHeight),
      ) > 1e-6
    )
      throw new Error("Transfer interlock: platform must be docked");
    if (
      ["lifting", "lowering"].includes(phase) &&
      (this.blocks.filter((b) => b.location === "hoist").length !== 1 ||
        b?.status !== "secured")
    )
      throw new Error("Travel interlock: exactly one secured block required");
    if (
      ["lifting", "lowering"].includes(phase) &&
      (Math.abs(this.platformHeight - this.sourceHeight) > 1e-6 ||
        !b ||
        Math.abs(b.height - this.platformHeight) > 1e-6 ||
        Math.abs(b.x) > 1e-6 ||
        Math.abs(b.z) > 1e-6)
    )
      throw new Error(
        "Travel interlock: load and platform must be docked and aligned",
      );
    if (
      ["returning_empty", "positioning_empty", "source_docking"].includes(
        phase,
      ) &&
      this.blocks.some((b) => b.location === "hoist")
    )
      throw new Error("Empty-travel interlock: platform must be empty");
    if (
      (phase === "lifting" && this.mode !== "charge") ||
      (phase === "lowering" && this.mode !== "discharge")
    )
      throw new Error("Travel direction interlock");
    this.phase = phase;
    this.phaseElapsed = 0;
    this.startPosition = {
      x: b?.x ?? 0,
      z: b?.z ?? 0,
      height: b?.height ?? 0,
      trolleyX: this.sourceUpper ? this.upperTrolleyX : this.lowerTrolleyX,
      destinationTrolleyX: this.sourceUpper
        ? this.lowerTrolleyX
        : this.upperTrolleyX,
      platform: this.platformHeight,
    };
    if (b) b.animation = phase;
    if (["lifting", "lowering"].includes(phase) && b) b.status = "travelling";
    if (b && ["collecting", "loading", "unloading", "storing"].includes(phase))
      b.status = "transferring";
    this.log(`${b ? b.id + " · " : ""}${PHASE_LABELS[phase]}`);
  }
  start(mode: Mode) {
    if (this.phase !== "waiting") {
      this.pendingMode = mode === this.mode ? null : mode;
      this.log(
        this.pendingMode
          ? `${mode.toUpperCase()} queued · finishing active exchange`
          : "Continue current direction",
      );
      return;
    }
    this.mode = mode;
    this.pendingMode = null;
    this.paused = !this.auto;
    this.prepare();
  }
  private prepare() {
    const block = this.blocks.find(
      (b) => b.location === (this.sourceUpper ? "upper" : "lower"),
    );
    if (!block) {
      this.activeId = null;
      this.enter("waiting");
      this.log(
        `No blocks in ${this.sourceUpper ? "upper" : "lower"} storage · operation complete`,
      );
      return;
    }
    if (Math.abs(this.platformHeight - this.sourceHeight) > 1e-6) {
      this.enter("positioning_empty");
      return;
    }
    this.activeId = block.id;
    block.status = "selected";
    block.assigned = this.sourceUpper ? "upper-trolley" : "lower-trolley";
    this.cycleStart = this.elapsed;
    this.enter("selecting");
  }
  pause() {
    this.paused = true;
  }
  resume() {
    if (this.phase !== "waiting") {
      this.auto = true;
      this.paused = false;
    }
  }
  setAuto(auto: boolean) {
    this.auto = auto;
    this.paused = !auto;
  }
  reset() {
    return new Simulator(this.params);
  }
  release() {
    if (this.phase !== "ready")
      throw new Error("Dispatch interlock: secured READY load required");
    this.enter(this.mode === "charge" ? "lifting" : "lowering");
  }
  step() {
    if (this.phase === "waiting" || this.phase === "ready") return;
    this.integrate(this.duration - this.phaseElapsed);
    this.completePhase();
    this.paused = true;
    this.record();
  }
  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new Error("Time step must be finite and nonnegative");
    if (this.paused || this.phase === "waiting" || this.phase === "ready")
      return;
    let remaining = seconds;
    while (
      remaining > 1e-8 &&
      (this.phase as Phase) !== "waiting" &&
      (this.phase as Phase) !== "ready" &&
      !this.paused
    ) {
      const dt = Math.min(remaining, this.duration - this.phaseElapsed);
      this.integrate(dt);
      remaining -= dt;
      if (this.phaseElapsed >= this.duration - 1e-8) this.completePhase();
    }
    this.record();
  }
  private record() {
    if (
      this.elapsed - this.history[this.history.length - 1].time >= 1 ||
      this.phase === "waiting" ||
      this.paused
    )
      this.history = [
        ...this.history,
        { time: this.elapsed, power: this.power },
      ].slice(-180);
  }
  private integrate(dt: number) {
    this.auxiliary += (this.auxiliaryPower * dt) / 3600;
    this.elapsed += dt;
    this.phaseElapsed += dt;
    const t =
      this.duration && this.duration - this.phaseElapsed > 1e-8
        ? Math.min(1, this.phaseElapsed / this.duration)
        : 1;
    const b = this.active;
    const p = this.startPosition;
    const sourceTrolley = (x: number) => {
      if (this.sourceUpper) this.upperTrolleyX = x;
      else this.lowerTrolleyX = x;
    };
    const destTrolley = (x: number) => {
      if (this.sourceUpper) this.lowerTrolleyX = x;
      else this.upperTrolleyX = x;
    };
    if (this.phase === "positioning_empty")
      this.platformHeight = lerp(p.platform, this.sourceHeight, t);
    if (this.phase === "returning_empty")
      this.platformHeight = lerp(this.destinationHeight, this.sourceHeight, t);
    if (!b) return;
    if (this.phase === "selecting") sourceTrolley(lerp(p.trolleyX, b.x, t));
    if (this.phase === "collecting") b.z = lerp(p.z, 0, t);
    if (this.phase === "transporting") {
      b.x = lerp(p.x, this.sourceX, t);
      sourceTrolley(b.x);
    }
    if (this.phase === "loading") b.x = lerp(this.sourceX, 0, t);
    if (["lifting", "lowering"].includes(this.phase)) {
      const oldHeight = b.height;
      b.height = lerp(this.sourceHeight, this.destinationHeight, t);
      this.platformHeight = b.height;
      const e = potentialKWh(b.mass, Math.abs(b.height - oldHeight));
      if (this.phase === "lowering") {
        this.released += e;
        this.generated += e * this.params.dischargeEfficiency;
      } else {
        this.gained += e;
        this.charging += e / this.params.chargeEfficiency;
      }
    }
    if (this.phase === "unlocking")
      destTrolley(lerp(p.destinationTrolleyX, this.destinationX, t));
    if (this.phase === "unloading") b.x = lerp(0, this.destinationX, t);
    if (this.phase === "delivering") {
      b.x = lerp(p.x, storagePosition(b.slot, !this.sourceUpper).x, t);
      destTrolley(b.x);
    }
    if (this.phase === "storing")
      b.z = lerp(0, storagePosition(b.slot, !this.sourceUpper).z, t);
  }
  private completePhase() {
    const b = this.active;
    switch (this.phase) {
      case "positioning_empty":
        this.prepare();
        break;
      case "selecting":
        this.enter("collecting");
        break;
      case "collecting":
        if (b) b.location = "trolley";
        this.enter("transporting");
        break;
      case "transporting":
        this.enter("loading");
        break;
      case "loading":
        if (b) {
          b.location = "hoist";
          b.assigned = "hoist";
        }
        this.enter("locking");
        break;
      case "locking":
        if (b) b.status = "secured";
        this.enter(
          this.dispatchControlled
            ? "ready"
            : this.mode === "charge"
              ? "lifting"
              : "lowering",
        );
        break;
      case "lifting":
      case "lowering":
        this.enter("unlocking");
        break;
      case "unlocking":
        this.enter("unloading");
        break;
      case "unloading":
        if (b) {
          b.location = "trolley";
          b.assigned = this.sourceUpper ? "lower-trolley" : "upper-trolley";
        }
        this.enter("delivering");
        break;
      case "delivering":
        this.enter("storing");
        break;
      case "storing":
        if (b) {
          b.location = this.sourceUpper ? "lower" : "upper";
          b.status = "stored";
          b.assigned = null;
          b.animation = "waiting";
        }
        this.activeId = null;
        this.enter("returning_empty");
        break;
      case "returning_empty":
        if (this.dispatchControlled) {
          this.enter("source_docking");
          break;
        }
        this.finishExchange();
        break;
      case "source_docking":
        this.finishExchange();
        break;
      case "ready":
      case "waiting":
        break;
    }
  }
  private finishExchange() {
    this.completed++;
    this.lastCycleDuration = this.elapsed - this.cycleStart;
    if (this.stopAfterExchange) {
      this.enter("waiting");
      return;
    }
    if (this.pendingMode) {
      this.mode = this.pendingMode;
      this.pendingMode = null;
      this.log(`Direction changed to ${this.mode.toUpperCase()}`);
    }
    this.prepare();
  }
  assertInvariants() {
    if (
      this.blocks.length !== this.params.count ||
      new Set(this.blocks.map((b) => b.id)).size !== this.params.count
    )
      throw new Error("Inventory conservation violated");
    if (this.blocks.filter((b) => b.location === "hoist").length > 1)
      throw new Error("Hoist capacity exceeded");
    if (this.generated > this.released + 1e-8)
      throw new Error("Energy conservation violated");
    for (const b of this.blocks) {
      if (b.height < -1e-6 || b.height > this.params.height + 1e-6)
        throw new Error("Height out of range");
      if (
        b.location === "hoist" &&
        Math.abs(b.height - this.platformHeight) > 1e-6
      )
        throw new Error("Block detached from platform");
      if (
        (b.location === "upper" && b.height !== this.params.height) ||
        (b.location === "lower" && b.height !== 0)
      )
        throw new Error("Storage height mismatch");
    }
  }
}

/** Four independent rail/hoist lanes, sharing only the dispatch clock and ledger.
 * Each block belongs to exactly one lane; lane-local interlocks remain unchanged.
 */
export class DispatchSimulator {
  readonly params: Parameters;
  readonly lanes: Simulator[];
  elapsed = 0;
  mode: Mode | null = null;
  pendingMode: Mode | null = null;
  paused = false;
  auto = true;
  history: { time: number; power: number }[] = [{ time: 0, power: 0 }];
  exchangeEnabled = true;
  private nextDispatchAt = 0;
  private lastDispatched = -1;

  constructor(params: Parameters = DEFAULTS) {
    const error = validateParameters(params);
    if (error) throw new Error(error);
    this.params = { ...params };
    this.lanes = Array.from({ length: 4 }, (_, index) => {
      const count =
        Math.floor(params.count / 4) + (index < params.count % 4 ? 1 : 0);
      const lane = new Simulator(params, count);
      lane.dispatchControlled = true;
      lane.blocks.forEach((b, slot) => {
        b.id = `B${String(slot * 4 + index + 1).padStart(2, "0")}`;
      });
      return lane;
    });
  }
  get blocks() {
    return this.lanes
      .flatMap((lane) => lane.blocks)
      .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  }
  get upperAvailable() {
    return this.blocks.filter(
      (b) => b.location === "upper" && b.status === "stored",
    ).length;
  }
  get lowerStored() {
    return this.blocks.filter(
      (b) => b.location === "lower" && b.status === "stored",
    ).length;
  }
  private get focus() {
    return (
      this.lanes.find((lane) => ["lifting", "lowering"].includes(lane.phase)) ??
      this.lanes.find((lane) => lane.phase !== "waiting") ??
      this.lanes[0]
    );
  }
  get phase(): Phase {
    return this.focus.phase;
  }
  get activeHoists() {
    return this.paused
      ? 0
      : this.lanes.filter((lane) =>
          ["lifting", "lowering"].includes(lane.phase),
        ).length;
  }
  get generatingHoists() {
    return this.paused
      ? 0
      : this.lanes.filter((lane) => lane.grossPower > 0).length;
  }
  get exchangeHoists() {
    return this.lanes
      .map((lane, index) => ({ lane, index }))
      .filter(
        ({ lane }) =>
          !["waiting", "ready", "lifting", "lowering"].includes(lane.phase),
      )
      .map(({ index }) => index + 1);
  }
  get active() {
    return this.focus.active;
  }
  get activeId() {
    return this.focus.activeId;
  }
  get phaseElapsed() {
    return this.focus.phaseElapsed;
  }
  get duration() {
    return this.focus.duration;
  }
  private sum(read: (lane: Simulator) => number) {
    return this.lanes.reduce((total, lane) => total + read(lane), 0);
  }
  get capacity() {
    return this.sum((lane) => lane.capacity);
  }
  get stored() {
    return this.sum((lane) => lane.stored);
  }
  get soc() {
    return this.stored / this.capacity;
  }
  get generated() {
    return this.sum((lane) => lane.generated);
  }
  get charging() {
    return this.sum((lane) => lane.charging);
  }
  get auxiliary() {
    return this.sum((lane) => lane.auxiliary);
  }
  get released() {
    return this.sum((lane) => lane.released);
  }
  get gained() {
    return this.sum((lane) => lane.gained);
  }
  get completed() {
    return this.sum((lane) => lane.completed);
  }
  get netGrid() {
    return this.generated - this.charging - this.auxiliary;
  }
  get power() {
    return this.paused ? 0 : this.sum((lane) => lane.power);
  }
  get grossPower() {
    return this.paused ? 0 : this.sum((lane) => lane.grossPower);
  }
  get cycleEstimate() {
    return this.lanes[0].cycleEstimate;
  }
  get lastCycleDuration() {
    return this.focus.lastCycleDuration;
  }
  get roundTripEstimate() {
    return this.lanes[0].roundTripEstimate;
  }
  get loadedDuration() {
    return this.params.height / this.params.speed;
  }
  get exchangeDuration() {
    return this.cycleEstimate - this.loadedDuration;
  }
  get dispatchInterval() {
    // Three conversion slots, four physical lanes. Spread infeasible cycles
    // rather than fabricating extra READY blocks or synchronized empty resets.
    return Math.max(
      this.loadedDuration / 3,
      this.cycleEstimate / 4,
      this.params.dispatchSpacing,
    );
  }
  get threeHoistCapable() {
    return (
      this.params.count >= 4 &&
      this.exchangeDuration <= this.loadedDuration / 3 + 1e-8 &&
      this.dispatchInterval <= this.loadedDuration / 3 + 1e-8
    );
  }
  get continuousCapable() {
    return (
      this.params.count >= 4 && this.loadedDuration >= this.dispatchInterval
    );
  }
  get events() {
    return this.lanes
      .flatMap((lane, index) =>
        lane.events.map((event) => ({
          time: event.time,
          text: `H${index + 1} · ${event.text}`,
        })),
      )
      .sort((a, b) => b.time - a.time)
      .slice(0, 80);
  }
  start(mode: Mode) {
    if (this.phase !== "waiting") {
      this.pendingMode = mode === this.mode ? null : mode;
      this.lanes.forEach((lane) => {
        lane.stopAfterExchange = !!this.pendingMode || !this.exchangeEnabled;
      });
      if (!this.pendingMode && this.exchangeEnabled) this.refillWaiting();
      return;
    }
    this.mode = mode;
    this.pendingMode = null;
    this.paused = !this.auto;
    this.schedule();
  }
  private schedule() {
    this.nextDispatchAt = this.elapsed;
    this.lastDispatched = -1;
    this.lanes.forEach((lane) => {
      lane.stopAfterExchange = !this.exchangeEnabled;
      lane.elapsed = this.elapsed;
      lane.start(this.mode!);
      lane.paused = this.paused;
    });
  }
  private refillWaiting() {
    if (!this.mode) return;
    this.lanes.forEach((lane) => {
      if (
        lane.phase === "waiting" &&
        lane.blocks.some(
          (b) => b.location === (this.mode === "discharge" ? "upper" : "lower"),
        )
      ) {
        lane.elapsed = this.elapsed;
        lane.start(this.mode!);
        lane.paused = this.paused;
      }
    });
  }
  setAutomaticExchange(enabled: boolean) {
    this.exchangeEnabled = enabled;
    this.lanes.forEach((lane) => {
      lane.stopAfterExchange = !!this.pendingMode || !enabled;
    });
    if (enabled && !this.pendingMode && this.phase !== "waiting")
      this.refillWaiting();
  }
  private dispatchReady() {
    const travelling = this.lanes.filter((lane) =>
      ["lifting", "lowering"].includes(lane.phase),
    ).length;
    if (travelling >= 3 || this.elapsed < this.nextDispatchAt - 1e-8) return;
    for (let offset = 1; offset <= 4; offset++) {
      const index = (this.lastDispatched + offset) % 4;
      const lane = this.lanes[index];
      if (lane.phase !== "ready") continue;
      lane.elapsed = this.elapsed;
      lane.release();
      this.lastDispatched = index;
      this.nextDispatchAt = this.elapsed + this.dispatchInterval;
      return;
    }
  }
  pause() {
    this.paused = true;
    this.lanes.forEach((lane) => lane.pause());
  }
  resume() {
    this.auto = true;
    this.paused = false;
    this.lanes.forEach((lane) => {
      lane.paused = false;
    });
  }
  setAuto(auto: boolean) {
    this.auto = auto;
    if (auto) this.resume();
    else this.pause();
  }
  reset() {
    return new DispatchSimulator(this.params);
  }
  private nextBoundary() {
    const canDispatch =
      this.lanes.some((lane) => lane.phase === "ready") &&
      this.lanes.filter((lane) => ["lifting", "lowering"].includes(lane.phase))
        .length < 3;
    return Math.max(
      1e-7,
      Math.min(
        canDispatch
          ? Math.max(0, this.nextDispatchAt - this.elapsed)
          : Infinity,
        ...this.lanes
          .filter((lane) => !["waiting", "ready"].includes(lane.phase))
          .map((lane) => lane.duration - lane.phaseElapsed),
      ),
    );
  }
  step() {
    if (this.phase === "waiting") return;
    const auto = this.auto;
    this.resume();
    this.advance(this.nextBoundary());
    this.auto = auto;
    this.pause();
    this.record();
  }
  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new Error("Time step must be finite and nonnegative");
    if (this.paused) return;
    let remaining = seconds;
    while (remaining > 1e-8 && this.phase !== "waiting") {
      const dt = Math.min(remaining, this.nextBoundary());
      // All running lanes advance over the same interval, split at every event.
      this.lanes.forEach((lane) => {
        lane.elapsed = this.elapsed;
        lane.advance(dt);
      });
      this.elapsed += dt;
      remaining -= dt;
      this.dispatchReady();
      if (
        this.pendingMode &&
        this.lanes.every((lane) => lane.phase === "waiting")
      ) {
        this.mode = this.pendingMode;
        this.pendingMode = null;
        this.schedule();
      }
    }
    this.record();
  }
  private record() {
    if (
      this.elapsed - this.history[this.history.length - 1].time >= 1 ||
      this.paused ||
      this.phase === "waiting"
    )
      this.history = [
        ...this.history,
        { time: this.elapsed, power: this.power },
      ].slice(-180);
  }
  assertInvariants() {
    this.lanes.forEach((lane) => lane.assertInvariants());
    if (this.lanes.length !== 4)
      throw new Error("Exactly four independent hoists required");
    if (
      this.lanes.filter((lane) => ["lifting", "lowering"].includes(lane.phase))
        .length > 3
    )
      throw new Error(
        "Dispatch capacity exceeded: at most three converting hoists",
      );
    if (
      this.blocks.length !== this.params.count ||
      new Set(this.blocks.map((b) => b.id)).size !== this.params.count
    )
      throw new Error("Fleet inventory conservation violated");
    if (this.generated > this.released + 1e-8)
      throw new Error("Fleet energy conservation violated");
  }
}
