import { useEffect, useRef, useState } from "react";
import MineScene, { type CameraPreset } from "./MineScene";
import {
  DEFAULTS,
  G,
  PHASE_LABELS,
  DispatchSimulator as Simulator,
  validateParameters,
  type Parameters,
} from "./simulation";

const number = (v: number, digits = 1) =>
  v.toLocaleString("en-GB", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
const clock = (s: number) =>
  `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(Math.floor(s) % 60).padStart(2, "0")}`;
function Icon({
  name,
  size = 18,
}: {
  name:
    | "play"
    | "pause"
    | "reset"
    | "arrowUp"
    | "arrowDown"
    | "step"
    | "cube"
    | "settings"
    | "sun"
    | "moon"
    | "expand";
  size?: number;
}) {
  const paths = {
    play: "m8 5 11 7-11 7Z",
    pause: "M8 5v14M16 5v14",
    reset: "M3 10a9 9 0 1 1 2 8M3 4v6h6",
    arrowUp: "M12 20V4m-7 7 7-7 7 7",
    arrowDown: "M12 4v16m-7-7 7 7 7-7",
    step: "m5 5 10 7-10 7ZM19 5v14",
    cube: "m12 3 9 5v9l-9 5-9-5V8Zm0 10v9M3 8l9 5 9-5M7 5l9 5",
    settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
    sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5",
    moon: "M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z",
    expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
function Metric({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div className="metric">
      <span className="eyebrow">{label}</span>
      <div className={`metric-value ${accent || ""}`}>
        {value}
        <span>{unit}</span>
      </div>
      <span className="metric-sub">{sub}</span>
    </div>
  );
}
function PowerChart({ sim }: { sim: Simulator }) {
  const data = sim.history;
  const limit = Math.max(10, ...data.map((p) => Math.abs(p.power))) * 1.15;
  const start = data[0].time,
    end = Math.max(start + 1, data[data.length - 1].time);
  const points = data
    .map(
      (p) =>
        `${38 + ((p.time - start) / (end - start)) * 504},${80 - (p.power / limit) * 58}`,
    )
    .join(" ");
  return (
    <div className="chart">
      <svg
        viewBox="0 0 560 170"
        role="img"
        aria-label="Net grid power over simulated time; positive is export, negative is import"
      >
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="var(--teal)" stopOpacity="0.17" />
            <stop offset="1" stopColor="var(--teal)" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[22, 51, 80, 109, 138].map((y) => (
          <line
            key={y}
            x1="38"
            x2="542"
            y1={y}
            y2={y}
            stroke={y === 80 ? "var(--muted)" : "var(--line)"}
            strokeDasharray={y === 80 ? "" : "3 5"}
          />
        ))}
        <text x="0" y="25">
          +{number(limit, 0)}
        </text>
        <text x="19" y="83">
          0
        </text>
        <text x="0" y="141">
          −{number(limit, 0)}
        </text>
        <polygon points={`38,80 ${points} ${542},80`} fill="url(#chartFill)" />
        <polyline
          points={points}
          fill="none"
          stroke="var(--teal)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <text x="38" y="163">
          {clock(start)}
        </text>
        <text x="542" y="163" textAnchor="end">
          {clock(end)}
        </text>
      </svg>
      <div className="chart-note">
        <span>
          <i className="dot teal" /> Export + / import − · includes auxiliaries
        </span>
        <span>kW / simulated time</span>
      </div>
    </div>
  );
}
const fields: {
  key: Exclude<keyof Parameters, "reeving">;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}[] = [
  {
    key: "count",
    label: "Number of blocks",
    unit: "blocks",
    min: 1,
    max: 500,
    step: 1,
  },
  {
    key: "mass",
    label: "Mass per block",
    unit: "kg",
    min: 1000,
    max: 100000,
    step: 1000,
  },
  {
    key: "height",
    label: "Effective shaft travel",
    unit: "m",
    min: 50,
    max: 1000,
    step: 10,
  },
  {
    key: "speed",
    label: "Vertical speed",
    unit: "m/s",
    min: 0.5,
    max: 20,
    step: 0.5,
  },
  {
    key: "emptySpeed",
    label: "Empty carriage return speed",
    unit: "m/s",
    min: 0.5,
    max: 60,
    step: 0.5,
  },
  {
    key: "dispatchSpacing",
    label: "Minimum dispatch gap (0 = auto)",
    unit: "s",
    min: 0,
    max: 3600,
    step: 1,
  },
  {
    key: "transfer",
    label: "Transfer phase duration",
    unit: "s",
    min: 1,
    max: 60,
    step: 1,
  },
  {
    key: "chargeEfficiency",
    label: "Charging efficiency",
    unit: "%",
    min: 10,
    max: 100,
    step: 1,
  },
  {
    key: "dischargeEfficiency",
    label: "Discharging efficiency",
    unit: "%",
    min: 10,
    max: 100,
    step: 1,
  },
  {
    key: "transferKW",
    label: "Transfer auxiliary load",
    unit: "kW",
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: "emptyKW",
    label: "Empty-hoist auxiliary load",
    unit: "kW",
    min: 0,
    max: 100,
    step: 1,
  },
];
export default function App() {
  const [theme, setTheme] = useState<"vibrant" | "dark">(() => {
    try {
      return localStorage.getItem("volt-theme") === "dark" ? "dark" : "vibrant";
    } catch {
      return "vibrant";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content", theme === "vibrant" ? "#f3f7fc" : "#0b1117",
    );
    try {
      localStorage.setItem("volt-theme", theme);
    } catch {
      // Theme switching still works when browser storage is unavailable.
    }
  }, [theme]);
  const engine = useRef(new Simulator());
  const [, render] = useState(0);
  const [speed, setSpeed] = useState(5);
  const speedRef = useRef(speed);
  const [preset, setPreset] = useState<CameraPreset>("Overview");
  const [cameraRevision, setCameraRevision] = useState(0);
  const [draft, setDraft] = useState<Parameters>({ ...DEFAULTS });
  const [error, setError] = useState("");
  const [inspected, setInspected] = useState<string | null>(null);
  const [notice, setNotice] = useState(
    "Ready to dispatch. Select Discharge to begin the first exchange.",
  );
  const sim = engine.current;
  const refresh = () => render((n) => n + 1);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    let handle = 0,
      previous = 0,
      lastRender = 0;
    const frame = (now: number) => {
      if (previous)
        engine.current.advance(
          Math.min((now - previous) / 1000, 0.1) * speedRef.current,
        );
      previous = now;
      if (now - lastRender > 30) {
        render((n) => n + 1);
        lastRender = now;
      }
      handle = requestAnimationFrame(frame);
    };
    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
  }, []);
  const act = (action: () => void) => {
    action();
    refresh();
  };
  const start = (mode: "charge" | "discharge") =>
    act(() => {
      sim.start(mode);
      setNotice(
        sim.phase === "waiting"
          ? `No blocks available for ${mode}. Select the opposite direction.`
          : sim.pendingMode
            ? `${mode === "charge" ? "Charging" : "Discharging"} queued. Completing all assigned exchanges safely.`
            : `${mode === "charge" ? "Charging" : "Discharging"} selected. ${sim.paused ? "Use Step or Resume to advance." : "Automatic exchange active."}`,
      );
    });
  const reset = () =>
    act(() => {
      engine.current = sim.reset();
      engine.current.setAuto(sim.auto);
      engine.current.setAutomaticExchange(sim.exchangeEnabled);
      setInspected(null);
      setNotice(
        "Plant reset. All blocks returned to upper storage; energy counters cleared.",
      );
    });
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validateParameters(draft);
    if (problem) {
      setError(problem);
      return;
    }
    engine.current = new Simulator(draft);
    engine.current.setAuto(sim.auto);
    engine.current.setAutomaticExchange(sim.exchangeEnabled);
    setError("");
    setNotice(
      "Configuration applied. Plant reset with the new engineering assumptions.",
    );
    refresh();
  };
  const upper = sim.upperAvailable;
  const lower = sim.lowerStored;
  const selected = sim.blocks.find((b) => b.id === (inspected || sim.activeId));
  const running = sim.phase !== "waiting" && !sim.paused;
  const progress = sim.duration
    ? Math.min(1, sim.phaseElapsed / sim.duration)
    : 0;
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="theme-toggle"
            type="button"
            aria-label="Vibrant theme"
            aria-pressed={theme === "vibrant"}
            title={`Switch to ${theme === "vibrant" ? "dark" : "vibrant"} theme`}
            onClick={() => setTheme(theme === "vibrant" ? "dark" : "vibrant")}
          >
            <Icon name={theme === "vibrant" ? "sun" : "moon"} />
            <span>{theme === "vibrant" ? "Vibrant" : "Dark"}</span>
          </button>
        <a className="brand" href="#" aria-label="Jiu Valley GES home">
          <span className="brand-mark">
            <Icon name="cube" size={25} />
          </span>
          <span>
            JIU VALLEY<span className="brand-light"> / GES</span>
          </span>
        </a>
        </div>
        <div className="topbar-right">
          <span className="concept-badge">CONCEPTUAL DEMONSTRATOR</span>
          <span className="system-status">
            <i className={`dot ${running ? "teal pulse" : "dim"}`} />
            {running
              ? "SYSTEM OPERATING"
              : sim.paused
                ? "SYSTEM PAUSED"
                : "SYSTEM READY"}
          </span>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              VALEA JIULUI, ROMANIA <span className="slash">/</span> UNDERGROUND
              ENERGY SYSTEMS
            </div>
            <h1>
              Gravity, put to work<span>.</span>
            </h1>
            <p>Jiu Valley GES — Gravity Energy Storage Simulator</p>
          </div>
        </div>
        <section
          className="metrics-strip"
          aria-label="Key performance indicators"
        >
          <Metric
            label="STORED GRAVITATIONAL ENERGY"
            value={number(sim.stored)}
            unit="kWh"
            sub={`${number(sim.stored / 1000, 3)} MWh · referenced to lower station`}
            accent="text-teal"
          />
          <Metric
            label="THEORETICAL CAPACITY"
            value={number(sim.capacity)}
            unit="kWh"
            sub={`${sim.params.count} blocks × ${number(sim.params.mass / 1000, 0)} t × ${sim.params.height} m`}
          />
          <Metric
            label="NET GRID POWER"
            value={`${sim.power > 0 ? "+" : ""}${number(sim.power)}`}
            unit="kW"
            sub={
              sim.power > 0
                ? "Exporting electricity to grid"
                : sim.power < 0
                  ? "Importing electricity from grid"
                  : "No grid exchange at this instant"
            }
            accent={sim.power < 0 ? "text-amber" : "text-teal"}
          />
          <div className="metric soc-metric">
            <div>
              <span className="eyebrow">STATE OF CHARGE</span>
              <div className="metric-value">
                {number(sim.soc * 100, 0)}
                <span>%</span>
              </div>
              <span className="metric-sub">Potential energy / capacity</span>
            </div>
            <svg viewBox="0 0 68 68" aria-hidden="true">
              <circle
                cx="34"
                cy="34"
                r="28"
                fill="none"
                stroke="var(--line)"
                strokeWidth="4"
              />
              <circle
                cx="34"
                cy="34"
                r="28"
                fill="none"
                stroke="var(--teal)"
                strokeWidth="4"
                strokeDasharray={`${sim.soc * 176} 176`}
                transform="rotate(-90 34 34)"
              />
              <path d="M35 16 24 36h10l-2 15 13-23H34Z" fill="var(--teal)" />
            </svg>
          </div>
        </section>
        <div className="workspace">
          <section
            className="scene-panel panel"
            aria-label="Interactive 3D mine"
          >
            <div className="panel-header">
              <h2>
                <i className="dot teal" /> Mine digital twin
              </h2>
              <span className="small-code">
                PROCEDURAL 3D / SCHEMATIC SCALE
              </span>
            </div>
            <div className="scene-viewport">
              <MineScene
                theme={theme}
                sim={sim}
                transparent={true}
                preset={preset}
                revision={cameraRevision}
              />
              <div className="scene-topline">
                <span
                  className={`mode-tag ${sim.mode === "charge" ? "amber" : ""}`}
                  key={`${sim.mode}-${sim.pendingMode}`}
                >
                  {sim.pendingMode
                    ? `→ ${sim.pendingMode.toUpperCase()} QUEUED`
                    : sim.phase === "waiting"
                      ? "STANDBY"
                      : sim.paused
                        ? "Ⅱ PAUSED"
                        : sim.mode === "charge"
                          ? "↑ CHARGING"
                          : "↓ DISCHARGING"}
                </span>
              </div>
              <div className="scene-scale">
                <span>EFFECTIVE TRAVEL</span>
                <strong>
                  {sim.params.height}
                  <small> m</small>
                </strong>
                <span>{sim.params.reeving ? "2:1" : "1:1"} ROPE REEVING</span>
              </div>
              <div className="scene-bottomline">
                <span>Drag to orbit · scroll to zoom · right-drag to pan</span>
                <span>
                  <i className="dot teal" /> Grid export{" "}
                  <i className="dot amber-dot" /> Grid import
                </span>
              </div>
            </div>
            <div className="camera-toolbar">
              <span className="eyebrow">
                <Icon name="expand" size={14} /> CAMERA
              </span>
              <div>
                {(
                  [
                    "Overview",
                    "Shaft",
                    "Upper station",
                    "Lower station",
                    "Top",
                    "Side",
                    "Isometric",
                  ] as CameraPreset[]
                ).map((view) => (
                  <button
                    key={view}
                    className={preset === view ? "selected" : ""}
                    onClick={() => {
                      setPreset(view);
                      setCameraRevision((n) => n + 1);
                    }}
                  >
                    {view}
                  </button>
                ))}
              </div>
            </div>
            <div className="phase-strip">
              <span className="phase-index">
                {sim.phase === "waiting"
                  ? "—"
                  : String(
                      [
                        "selecting",
                        "collecting",
                        "transporting",
                        "loading",
                        "locking",
                        "ready",
                        "lowering",
                        "lifting",
                        "unlocking",
                        "unloading",
                        "delivering",
                        "storing",
                        "returning_empty",
                        "source_docking",
                        "positioning_empty",
                      ].indexOf(sim.phase) + 1,
                    ).padStart(2, "0")}
              </span>
              <div>
                <span className="eyebrow">CURRENT MACHINE PHASE</span>
                <strong>{PHASE_LABELS[sim.phase]}</strong>
              </div>
              <span className="phase-time">
                {sim.duration
                  ? `${number(sim.phaseElapsed, 1)} / ${number(sim.duration, 1)} s`
                  : "Ready"}
              </span>
              <div
                className="phase-progress"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </section>
          <aside className="control-panel panel">
            <div className="panel-header">
              <h2>Dispatch control</h2>
              <Icon name="settings" size={17} />
            </div>
            <div className="control-body">
              <div className="control-label">
                <span className="eyebrow">OPERATING DIRECTION</span>
                <span className="live-label">
                  {sim.auto ? "AUTO SEQUENCE" : "MANUAL STEPS"}
                </span>
              </div>
              <div className="direction-buttons">
                <button
                  className={`direction charge ${sim.mode === "charge" && sim.phase !== "waiting" ? "active" : ""}`}
                  onClick={() => start("charge")}
                >
                  <Icon name="arrowUp" size={23} />
                  <strong>Charge</strong>
                  <small>Lift & store</small>
                </button>
                <button
                  className={`direction discharge ${sim.mode === "discharge" && sim.phase !== "waiting" ? "active" : ""}`}
                  onClick={() => start("discharge")}
                >
                  <Icon name="arrowDown" size={23} />
                  <strong>Discharge</strong>
                  <small>Lower & generate</small>
                </button>
              </div>
              <div className="transport-buttons">
                <button
                  disabled={sim.phase === "waiting"}
                  onClick={() =>
                    act(() => (sim.paused ? sim.resume() : sim.pause()))
                  }
                >
                  <Icon name={sim.paused ? "play" : "pause"} />
                  {sim.paused ? "Resume" : "Pause"}
                </button>
                <button onClick={reset}>
                  <Icon name="reset" />
                  Reset
                </button>
                <button
                  disabled={sim.phase === "waiting"}
                  onClick={() =>
                    act(() => {
                      sim.step();
                      setNotice(
                        "Advanced all hoists to the next dispatch or phase boundary. Simulation paused.",
                      );
                    })
                  }
                >
                  <Icon name="step" />
                  Step
                </button>
              </div>
              <div className="auto-row">
                <div>
                  <strong>Automatic operation</strong>
                  <small>Three conversion slots · four hoists</small>
                </div>
                <label className="switch">
                  <input
                    aria-label="Automatic operation"
                    type="checkbox"
                    checked={sim.auto}
                    onChange={(e) => act(() => sim.setAuto(e.target.checked))}
                  />
                  <span />
                </label>
              </div>
              <div className="auto-row">
                <div>
                  <strong>
                    Automatic exchange · {sim.exchangeEnabled ? "ON" : "OFF"}
                  </strong>
                  <small>
                    {sim.exchangeEnabled
                      ? "Reload and rotate available hoists"
                      : "Finish assigned blocks, then wait"}
                  </small>
                </div>
                <label className="switch">
                  <input
                    aria-label="Automatic exchange"
                    type="checkbox"
                    checked={sim.exchangeEnabled}
                    onChange={(e) =>
                      act(() => sim.setAutomaticExchange(e.target.checked))
                    }
                  />
                  <span />
                </label>
              </div>
              <div className="speed-row">
                <span className="eyebrow">SIMULATION SPEED</span>
                <div className="segmented">
                  {[1, 5, 20].map((v) => (
                    <button
                      key={v}
                      className={speed === v ? "selected" : ""}
                      onClick={() => setSpeed(v)}
                    >
                      {v}×
                    </button>
                  ))}
                </div>
              </div>
              <div className="operator-notice" role="status">
                {notice}
              </div>
              <div className="active-block">
                <span className="eyebrow">SYNCHRONIZED HOISTS</span>
                <p className="dispatch-summary" role="status">
                  {sim.generatingHoists} generating · {sim.activeHoists}/3
                  conversion slots
                  <br />
                  {sim.paused
                    ? "Paused"
                    : sim.exchangeHoists.length
                      ? `Exchange / empty return: ${sim.exchangeHoists.map((id) => `H${id}`).join(", ")}`
                      : "Ready hoists await their dispatch slot"}
                  <br />
                  {sim.threeHoistCapable
                    ? "Timing supports 3 + 1 after startup."
                    : "Exchange timing / inventory limits the 3 + 1 target."}
                </p>
                {sim.lanes.map((lane, index) => (
                  <div
                    className={`hoist-card ${["lifting", "lowering"].includes(lane.phase) ? "converting" : "exchanging"}`}
                    key={index}
                    title={PHASE_LABELS[lane.phase]}
                  >
                    <strong>H{index + 1}</strong>
                    <span>
                      <b>{lane.state}</b>
                      <br />
                      {number(lane.platformHeight, 1)} m ·{" "}
                      {number(lane.velocity, 1)} m/s
                      <br />
                      {lane.activeId || "Empty"} · {number(lane.grossPower, 1)}{" "}
                      kW
                    </span>
                  </div>
                ))}
              </div>
              <dl className="ledger">
                <div>
                  <dt>Electricity generated</dt>
                  <dd className="text-teal">
                    {number(sim.generated, 2)} <small>kWh</small>
                  </dd>
                </div>
                <div>
                  <dt>Charging electricity</dt>
                  <dd className="text-amber">
                    {number(sim.charging, 2)} <small>kWh</small>
                  </dd>
                </div>
                <div>
                  <dt>Auxiliary consumption</dt>
                  <dd>
                    {number(sim.auxiliary, 3)} <small>kWh</small>
                  </dd>
                </div>
                <div className="ledger-total">
                  <dt>Net grid exchange</dt>
                  <dd>
                    {sim.netGrid > 0 ? "+" : ""}
                    {number(sim.netGrid, 2)} <small>kWh</small>
                  </dd>
                </div>
              </dl>
              <div className="runtime">
                <div>
                  <span className="eyebrow">OPERATING TIME</span>
                  <strong>{clock(sim.elapsed)}</strong>
                </div>
                <div>
                  <span className="eyebrow">EXCHANGES</span>
                  <strong>{String(sim.completed).padStart(3, "0")}</strong>
                </div>
              </div>
            </div>
          </aside>
        </div>
        <div className="analytics-grid">
          <section className="panel power-panel">
            <div className="panel-header">
              <h2>Grid power</h2>
              <span className="small-code">LAST 180 SAMPLES</span>
            </div>
            <div className="chart-summary">
              <strong className={sim.power < 0 ? "text-amber" : "text-teal"}>
                {sim.power > 0 ? "+" : ""}
                {number(sim.power)}
                <small> kW</small>
              </strong>
              <span>
                Loaded conversion rating / hoist
                <strong>
                  {number(
                    (sim.params.mass *
                      G *
                      sim.params.speed *
                      sim.params.dischargeEfficiency) /
                      1000,
                    0,
                  )}{" "}
                  kW <small>discharge</small>
                </strong>
              </span>
            </div>
            <PowerChart sim={sim} />
          </section>
          <section className="panel inventory-panel">
            <div className="panel-header">
              <h2>Block inventory</h2>
              <span className="small-code">
                {sim.params.count} IDENTIFIED LOADS
              </span>
            </div>
            <div className="inventory-counts">
              <div>
                <span className="text-teal">
                  {String(upper).padStart(2, "0")}
                </span>
                <small>UPPER AVAILABLE</small>
              </div>
              <div>
                <span>
                  {String(sim.params.count - upper - lower).padStart(2, "0")}
                </span>
                <small>IN TRANSFER</small>
              </div>
              <div>
                <span className="text-amber">
                  {String(lower).padStart(2, "0")}
                </span>
                <small>LOWER</small>
              </div>
            </div>
            <div className="block-grid">
              {sim.blocks.map((b) => (
                <button
                  title={`${b.id}: ${b.location}, ${b.status}, ${number(b.height)} m`}
                  key={b.id}
                  className={`${b.location} ${sim.lanes.some((lane) => lane.activeId === b.id) ? "active" : ""} ${selected?.id === b.id ? "inspected" : ""}`}
                  onClick={() => setInspected(b.id === inspected ? null : b.id)}
                >
                  {b.id}
                </button>
              ))}
            </div>
            <div className="inventory-detail">
              {selected
                ? `${selected.id} · ${selected.status} · ${selected.location} · ${number(selected.height, 0)} m · ${selected.assigned || "unassigned"}`
                : "Select a block to inspect its state and assignment."}
            </div>
          </section>
          <section className="panel event-panel">
            <div className="panel-header">
              <h2>Sequence log</h2>
              <span className="live-label">
                <i className="dot teal" /> LIVE
              </span>
            </div>
            <ol className="event-list">
              {sim.events.slice(0, 15).map((event, i) => (
                <li key={`${event.time}-${event.text}-${i}`}>
                  <time>{clock(event.time)}</time>
                  <span>{event.text}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <div className="engineering-grid">
          <section className="panel engineering-panel">
            <div className="panel-header">
              <h2>Engineering model</h2>
              <span className="small-code">ENERGY ≠ POWER</span>
            </div>
            <div className="engineering-stats">
              <div>
                <span className="eyebrow">ROUND-TRIP ESTIMATE</span>
                <strong>
                  {number(sim.roundTripEstimate * 100, 1)}
                  <small> %</small>
                </strong>
                <p>
                  Full inventory, including modelled transfer and empty-hoist
                  auxiliaries.
                </p>
              </div>
              <div>
                <span className="eyebrow">BLOCK EXCHANGE CYCLE</span>
                <strong>
                  {number(sim.lastCycleDuration || sim.cycleEstimate, 1)}
                  <small> s</small>
                </strong>
                <p>
                  {sim.lastCycleDuration
                    ? "Last completed exchange"
                    : "Estimated cycle"}{" "}
                  · includes loaded travel, exchange and empty return.
                </p>
              </div>
              <div>
                <span className="eyebrow">IDEAL ROPE TENSION</span>
                <strong>
                  {number(
                    (sim.params.mass * G) / (sim.params.reeving ? 2 : 1) / 1000,
                  )}
                  <small> kN</small>
                </strong>
                <p>
                  {sim.params.reeving
                    ? "2:1 reeving halves force and doubles rope travel."
                    : "1:1 reeving uses full load force and platform travel."}{" "}
                  Total energy is unchanged.
                </p>
              </div>
            </div>
            <p className="model-note">
              E = m × 9.81 × h. Charge input = ΔE / η; discharge output = ΔE ×
              η. Auxiliaries are metered separately. No generation during
              exchange or empty travel on that hoist. Four independent lanes
              share one shaft. Dispatch gap: {number(sim.dispatchInterval, 1)}{" "}
              s. Exchange and empty return: {number(sim.exchangeDuration, 1)} s;
              three-hoist exchange window: {number(sim.loadedDuration / 3, 1)}{" "}
              s.
              {sim.threeHoistCapable
                ? " Timing supports three active hoists and one rotating exchange after startup."
                : " Three active hoists cannot be sustained with these timings. The controller shows actual reduced output."}{" "}
              Startup, direction reversal and inventory exhaustion interrupt
              conversion. Capacity is potential energy, not delivered
              electricity. Rope tension excludes platform mass, acceleration and
              friction.
            </p>
          </section>
          <section className="panel assumptions-panel">
            <div className="panel-header">
              <h2>Site assumptions</h2>
              <span className="assumption-icon">!</span>
            </div>
            <div className="assumption-body">
              <strong>
                Conceptual Demonstrator — Not a Validated Mine Design
              </strong>
              <p>
                All parameters are hypothetical. No specific Jiu Valley mine is
                assessed or represented as suitable or authorized.
              </p>
              <p>
                Unverified constraints: shaft diameter and usable depth, ground
                stability, hoisting loads, storage space, ventilation, mine
                safety and access.
              </p>
            </div>
          </section>
        </div>
        <details className="panel parameter-panel">
          <summary>
            <span>
              <Icon name="settings" /> Plant configuration{" "}
              <small>Validated engineering assumptions</small>
            </span>
            <span className="text-teal">Configure +</span>
          </summary>
          <form onSubmit={apply}>
            <div className="parameter-fields">
              {fields.map((f) => (
                <label key={f.key}>
                  <span>{f.label}</span>
                  <div>
                    <input
                      type="number"
                      required
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      value={
                        Number.isNaN(draft[f.key])
                          ? ""
                          : f.key.includes("Efficiency")
                            ? Math.round(draft[f.key] * 100)
                            : draft[f.key]
                      }
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [f.key]:
                            e.target.value === ""
                              ? NaN
                              : Number(e.target.value) /
                                (f.key.includes("Efficiency") ? 100 : 1),
                        })
                      }
                    />
                    <span>{f.unit}</span>
                  </div>
                </label>
              ))}
            </div>
            <div className="parameter-footer">
              <label>
                <input
                  type="checkbox"
                  checked={draft.reeving}
                  onChange={(e) =>
                    setDraft({ ...draft, reeving: e.target.checked })
                  }
                />{" "}
                2:1 rope reeving
              </label>
              <span>
                Applying parameters resets inventory, time and energy counters.
              </span>
              <button className="apply-button" type="submit">
                Apply & reset plant
              </button>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </details>
        <footer>
          <span>
            JIU VALLEY GES <span className="slash">/</span> CONCEPTUAL ENERGY
            INFRASTRUCTURE
          </span>
          <span>
            Local simulation · procedural geometry · no external services
          </span>
        </footer>
      </main>
    </div>
  );
}
