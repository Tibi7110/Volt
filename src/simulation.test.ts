import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  G,
  joulesToKWh,
  potentialKWh,
  Simulator,
  DispatchSimulator,
  validateParameters,
} from "./simulation";

const small = { ...DEFAULTS, count: 3, height: 50, speed: 10, transfer: 1 };
function finish(s: Simulator) {
  s.advance(100_000);
  s.assertInvariants();
  expect(s.phase).toBe("waiting");
}

describe("SI physics", () => {
  it("calculates mgh and joule/kWh conversions", () => {
    expect(G).toBe(9.81);
    expect(joulesToKWh(3_600_000)).toBe(1);
    expect(potentialKWh(20000, 500)).toBeCloseTo(27.25);
    expect(new Simulator().capacity).toBeCloseTo(545);
  });
  it("rejects invalid configurations and time steps", () => {
    expect(validateParameters({ ...DEFAULTS, count: 1.5 })).toBeTruthy();
    expect(validateParameters({ ...DEFAULTS, emptySpeed: 0 })).toBeTruthy();
    expect(
      validateParameters({ ...DEFAULTS, dispatchSpacing: -1 }),
    ).toBeTruthy();
    expect(() => new Simulator({ ...DEFAULTS, speed: 0 })).toThrow();
    expect(
      () => new Simulator({ ...DEFAULTS, chargeEfficiency: 1.1 }),
    ).toThrow();
    expect(() => new Simulator().advance(-1)).toThrow();
  });
});

describe("four-hoist synchronized dispatch", () => {
  it("partitions a single conserved inventory, including the 500-block limit", () => {
    for (const count of [1, 2, 3, 4, 5, 20, 100, 500]) {
      const s = new DispatchSimulator({ ...DEFAULTS, count });
      s.assertInvariants();
      expect(s.blocks).toHaveLength(count);
      expect(s.blocks.map((b) => b.id)).toEqual(
        Array.from(
          { length: count },
          (_, i) => `B${String(i + 1).padStart(2, "0")}`,
        ),
      );
      expect(s.lanes).toHaveLength(4);
      expect(s.capacity).toBeCloseTo(
        potentialKWh(count * DEFAULTS.mass, DEFAULTS.height),
      );
    }
    expect(() => new DispatchSimulator({ ...DEFAULTS, count: 501 })).toThrow();
  });
  it("staggers four real loads and maintains conversion between startup and depletion in both directions", () => {
    const s = new DispatchSimulator();
    for (const mode of ["discharge", "charge"] as const) {
      s.start(mode);
      const starts = new Map<number, number>();
      let began = false;
      let simultaneous = 0;
      while (s.phase !== "waiting") {
        s.advance(0.25);
        s.assertInvariants();
        s.lanes.forEach((lane, index) => {
          if (lane.grossPower !== 0 && !starts.has(index))
            starts.set(index, s.elapsed);
        });
        const travelling = s.lanes.filter(
          (lane) => lane.grossPower !== 0,
        ).length;
        simultaneous = Math.max(simultaneous, travelling);
        began ||= travelling > 0;
        const potentialRemaining =
          mode === "discharge" ? s.stored : s.capacity - s.stored;
        if (began && potentialRemaining > 1e-6) {
          expect(travelling).toBeGreaterThan(0);
          expect(mode === "discharge" ? s.power : -s.power).toBeGreaterThan(0);
        }
        expect(s.power).toBeCloseTo(
          s.lanes.reduce((sum, lane) => sum + lane.power, 0),
        );
      }
      expect(starts.size).toBe(4);
      for (let i = 1; i < 4; i++)
        expect(starts.get(i)! - starts.get(i - 1)!).toBeCloseTo(
          s.dispatchInterval,
          0,
        );
      expect(simultaneous).toBe(3);
    }
    expect(s.completed).toBe(40);
    expect(s.generated).toBeCloseTo(s.capacity * DEFAULTS.dischargeEfficiency);
    expect(s.charging).toBeCloseTo(s.capacity / DEFAULTS.chargeEfficiency);
    expect(s.generated / s.charging).toBeCloseTo(0.81);
    expect(s.netGrid).toBeLessThan(0);
  });
  it("safely drains all assigned exchanges before reversing without mixed-direction travel", () => {
    const s = new DispatchSimulator();
    s.start("discharge");
    s.advance(65);
    s.start("charge");
    expect(s.pendingMode).toBe("charge");
    expect(s.mode).toBe("discharge");
    while (s.phase !== "waiting") {
      s.advance(0.5);
      s.assertInvariants();
      const moving = s.lanes.filter((lane) => lane.grossPower !== 0);
      expect(new Set(moving.map((lane) => lane.mode)).size).toBeLessThanOrEqual(
        1,
      );
    }
    expect(s.completed).toBe(8);
    expect(s.blocks.every((b) => b.location === "upper")).toBe(true);
    expect(s.generated).toBeCloseTo(
      potentialKWh(4 * DEFAULTS.mass, DEFAULTS.height) * 0.9,
    );
    expect(s.charging).toBeCloseTo(
      potentialKWh(4 * DEFAULTS.mass, DEFAULTS.height) / 0.9,
    );
  });
  it("freezes the fleet and its scheduled starts, steps every lane on one clock, resumes and resets", () => {
    const s = new DispatchSimulator();
    s.setAuto(false);
    s.start("discharge");
    s.advance(100);
    expect(s.elapsed).toBe(0);
    s.step();
    expect(s.lanes[0].phase).toBe("collecting");
    expect(s.lanes[1].phase).toBe("collecting");
    expect(s.paused).toBe(true);
    expect(s.auto).toBe(false);
    s.resume();
    s.advance(90);
    s.pause();
    const snapshot = JSON.stringify([
      s.blocks,
      s.elapsed,
      s.generated,
      s.charging,
      s.auxiliary,
    ]);
    s.advance(1000);
    expect(
      JSON.stringify([
        s.blocks,
        s.elapsed,
        s.generated,
        s.charging,
        s.auxiliary,
      ]),
    ).toBe(snapshot);
    expect(s.power).toBe(0);
    expect(s.lanes.every((lane) => lane.power === 0)).toBe(true);
    s.resume();
    s.advance(10000);
    expect(s.completed).toBe(20);
    const reset = s.reset();
    expect(reset.elapsed).toBe(0);
    expect(reset.generated).toBe(0);
    expect(reset.phase).toBe("waiting");
    expect(reset.soc).toBe(1);
  });
  it("handles uneven inventories, empty sources and large time steps deterministically", () => {
    for (const count of [1, 3, 5, 100]) {
      const s = new DispatchSimulator({ ...small, count });
      s.start("charge");
      expect(s.phase).toBe("waiting");
      s.start("discharge");
      s.advance(100000);
      s.assertInvariants();
      expect(s.completed).toBe(count);
      expect(s.phase).toBe("waiting");
      expect(s.generated).toBeCloseTo(s.capacity * 0.9);
      const generated = s.generated;
      s.start("discharge");
      s.advance(1000);
      expect(s.generated).toBe(generated);
      s.start("charge");
      s.advance(100000);
      s.assertInvariants();
      expect(s.completed).toBe(count * 2);
      expect(s.stored).toBeCloseTo(s.capacity);
    }
    const a = new DispatchSimulator(small),
      b = new DispatchSimulator(small);
    a.start("discharge");
    b.start("discharge");
    for (let i = 0; i < 1000; i++) a.advance(0.1);
    b.advance(100);
    expect(a.generated).toBeCloseTo(b.generated);
    expect(a.auxiliary).toBeCloseTo(b.auxiliary);
    expect(a.elapsed).toBeCloseTo(b.elapsed);
  });
  it("reports when four hoists cannot cover excessive transfer downtime", () => {
    const s = new DispatchSimulator({ ...small, transfer: 60 });
    expect(s.continuousCapable).toBe(false);
    expect(new DispatchSimulator().continuousCapable).toBe(true);
  });
  it("can cancel a queued reversal and dispatch remaining blocks on drained lanes", () => {
    const s = new DispatchSimulator();
    s.start("discharge");
    s.advance(65);
    s.start("charge");
    s.advance(s.cycleEstimate);
    expect(s.lanes[0].phase).toBe("waiting");
    s.start("discharge");
    expect(s.pendingMode).toBe(null);
    s.advance(10000);
    s.assertInvariants();
    expect(s.completed).toBe(20);
    expect(s.stored).toBeCloseTo(0);
  });
  it("rotates the exchange role while exactly three independently loaded hoists descend", () => {
    const s = new DispatchSimulator();
    s.start("discharge");
    const loading = 4.35 * s.params.transfer;
    s.advance(loading + 2 * s.dispatchInterval + 1);
    expect(s.generatingHoists).toBe(3);
    expect(s.lanes[3].state).toBe("READY");
    expect(
      new Set(
        s.lanes
          .filter((l) => l.phase === "lowering")
          .map((l) => l.platformHeight),
      ).size,
    ).toBe(3);
    for (let rotation = 0; rotation < 8; rotation++) {
      const time =
        loading + s.loadedDuration + rotation * s.dispatchInterval + 0.1;
      s.advance(time - s.elapsed);
      s.assertInvariants();
      expect(s.generatingHoists).toBe(3);
      expect(
        s.upperAvailable +
          s.lowerStored +
          s.blocks.filter((b) => b.status !== "stored").length,
      ).toBe(s.params.count);
      expect(s.exchangeHoists).toEqual([(rotation % 4) + 1]);
      expect(s.lanes[rotation % 4].state).toBe("BOTTOM_DOCKING");
      expect(s.lanes[rotation % 4].grossPower).toBe(0);
      expect(s.power).toBeCloseTo(
        (3 *
          s.params.mass *
          G *
          s.params.speed *
          s.params.dischargeEfficiency) /
          1000 -
          s.lanes[rotation % 4].auxiliaryPower,
      );
    }
  });
  it("preserves continuous block paths and shows all dock/exchange states without lifting loaded blocks during discharge", () => {
    const s = new DispatchSimulator({
      ...small,
      count: 12,
      speed: 1,
      emptySpeed: 20,
    });
    const states = new Set<string>();
    s.start("discharge");
    let previous = s.blocks.map((b) => ({ ...b }));
    while (s.phase !== "waiting") {
      s.advance(0.2);
      s.assertInvariants();
      s.lanes.forEach((lane) => {
        states.add(lane.state);
        expect(lane.phase).not.toBe("lifting");
        if (lane.phase === "returning_empty") {
          expect(lane.blocks.some((b) => b.location === "hoist")).toBe(false);
          expect(lane.grossPower).toBe(0);
          expect(lane.power).toBe(-s.params.emptyKW);
        }
      });
      s.blocks.forEach((b, index) => {
        expect(b.height).toBeLessThanOrEqual(previous[index].height + 1e-8);
        expect(Math.abs(b.height - previous[index].height)).toBeLessThanOrEqual(
          s.params.speed * 0.2 + 1e-8,
        );
        expect(Math.abs(b.x - previous[index].x)).toBeLessThanOrEqual(
          12 * 0.2 + 1e-8,
        );
        expect(Math.abs(b.z - previous[index].z)).toBeLessThanOrEqual(
          3 * 0.2 + 1e-8,
        );
      });
      previous = s.blocks.map((b) => ({ ...b }));
    }
    for (const state of [
      "READY",
      "LOADING",
      "DESCENDING",
      "BOTTOM_DOCKING",
      "UNLOADING",
      "RETURNING_EMPTY",
      "TOP_DOCKING",
      "WAITING",
    ])
      expect(states.has(state)).toBe(true);
    expect(s.completed).toBe(12);
    expect(s.charging).toBe(0);
    expect(s.generated).toBeCloseTo(s.capacity * s.params.dischargeEfficiency);
    const aux =
      (s.params.count *
        (s.params.transferKW * 8.05 * s.params.transfer +
          (s.params.emptyKW * s.params.height) / s.params.emptySpeed)) /
      3600;
    expect(s.auxiliary).toBeCloseTo(aux);
  });
  it("holds secured READY loads without power until dispatch and enforces the docking interlock", () => {
    const s = new Simulator(small);
    s.dispatchControlled = true;
    s.start("discharge");
    while (s.phase !== "ready") s.step();
    s.resume();
    const time = s.elapsed;
    s.advance(100);
    expect(s.elapsed).toBe(time);
    expect(s.grossPower).toBe(0);
    expect(s.power).toBe(0);
    s.platformHeight = 20;
    // Travel requires load/platform alignment, not just a state label.
    expect(() => s.release()).toThrow("docked");
    s.platformHeight = s.params.height;
    s.active!.status = "selected";
    expect(() => s.release()).toThrow("secured");
    s.active!.status = "secured";
    s.release();
    expect(s.phase).toBe("lowering");
    expect(() => s.release()).toThrow("READY");
  });
  it("shows real conversion gaps when exchange and empty return cannot meet the target", () => {
    const s = new DispatchSimulator({
      ...small,
      count: 12,
      emptySpeed: 0.5,
      transfer: 10,
    });
    s.start("discharge");
    expect(s.threeHoistCapable).toBe(false);
    expect(s.continuousCapable).toBe(false);
    let sawGap = false;
    for (let t = 0; t < 500; t++) {
      const energy = s.generated;
      s.advance(0.5);
      expect(s.generatingHoists).toBeLessThanOrEqual(3);
      if (
        s.generated > 0 &&
        s.stored > 0 &&
        s.generatingHoists === 0 &&
        energy === s.generated
      ) {
        sawGap = true;
        expect(s.grossPower).toBe(0);
        expect(s.power).toBeLessThanOrEqual(0);
      }
    }
    expect(sawGap).toBe(true);
    const minimum = s.dispatchInterval;
    const slower = new DispatchSimulator({
      ...s.params,
      dispatchSpacing: minimum + 100,
    });
    expect(slower.dispatchInterval).toBeCloseTo(minimum + 100);
  });
  it("disables automatic reloading without stopping or reversing assigned loads", () => {
    const s = new DispatchSimulator({
      ...small,
      count: 12,
      speed: 1,
      emptySpeed: 20,
    });
    s.start("discharge");
    s.advance(40);
    s.setAutomaticExchange(false);
    s.advance(10000);
    s.assertInvariants();
    expect(s.phase).toBe("waiting");
    expect(s.completed).toBe(4);
    expect(s.blocks.filter((b) => b.location === "lower")).toHaveLength(4);
    expect(s.charging).toBe(0);
    s.setAutomaticExchange(true);
    s.start("discharge");
    s.advance(10000);
    expect(s.completed).toBe(12);
    expect(s.generated).toBeCloseTo(s.capacity * 0.9);
  });
});

describe("exchange and energy accounting", () => {
  it("sequentially discharges all blocks, accounting for downtime and auxiliaries", () => {
    const s = new Simulator(small);
    s.start("discharge");
    expect(s.power).toBe(-small.transferKW);
    finish(s);
    expect(s.blocks.every((b) => b.location === "lower")).toBe(true);
    expect(s.completed).toBe(3);
    expect(s.stored).toBeCloseTo(0);
    expect(s.released).toBeCloseTo(s.capacity);
    expect(s.generated).toBeCloseTo(s.capacity * 0.9);
    expect(s.charging).toBe(0);
    const expectedAux =
      (small.count *
        (small.transferKW * 7.7 * small.transfer +
          (small.emptyKW * small.height) / small.emptySpeed)) /
      3600;
    expect(s.auxiliary).toBeCloseTo(expectedAux);
    expect(s.netGrid).toBeCloseTo(s.generated - expectedAux);
    expect(s.lastCycleDuration).toBeCloseTo(s.cycleEstimate);
    const energy = s.generated;
    s.start("discharge");
    finish(s);
    expect(s.generated).toBe(energy);
  });
  it("charges back with input above gained potential, and loses energy on a round trip", () => {
    const s = new Simulator(small);
    s.start("charge");
    expect(s.phase).toBe("waiting"); // all blocks already at the top
    s.start("discharge");
    finish(s);
    s.start("charge");
    finish(s);
    expect(s.blocks.every((b) => b.location === "upper")).toBe(true);
    expect(s.stored).toBeCloseTo(s.capacity);
    expect(s.charging).toBeCloseTo(s.capacity / 0.9);
    expect(s.netGrid).toBeLessThan(0);
    expect(s.generated / s.charging).toBeCloseTo(0.81);
    expect(s.roundTripEstimate).toBeLessThan(0.81);
  });
  it("conserves inventory, tracks continuous block positions and never transfers while travelling", () => {
    const s = new Simulator(small);
    s.start("discharge");
    let previous = s.blocks.map((b) => ({ ...b }));
    let sawTravel = false;
    for (let i = 0; i < 800 && s.phase !== "waiting"; i++) {
      s.advance(0.1);
      s.assertInvariants();
      s.blocks.forEach((b, index) => {
        expect(Math.abs(b.height - previous[index].height)).toBeLessThanOrEqual(
          small.speed * 0.1 + 1e-6,
        );
        expect(Math.abs(b.x - previous[index].x)).toBeLessThan(2);
        expect(Math.abs(b.z - previous[index].z)).toBeLessThan(1);
      });
      if (s.phase === "lowering") {
        sawTravel = true;
        expect(s.active?.location).toBe("hoist");
        expect(s.active?.x).toBe(0);
        expect(s.power).toBeCloseTo(
          (small.mass * G * small.speed * 0.9) / 1000,
        );
      }
      previous = s.blocks.map((b) => ({ ...b }));
    }
    expect(sawTravel).toBe(true);
    expect(s.completed).toBe(3);
  });
  it("pauses, resumes, advances exactly one phase, and resets all accounting", () => {
    const s = new Simulator(small);
    s.start("discharge");
    s.advance(0.5);
    s.pause();
    const time = s.elapsed;
    s.advance(100);
    expect(s.elapsed).toBe(time);
    expect(s.power).toBe(0);
    s.step();
    expect(s.phase).toBe("collecting");
    expect(s.paused).toBe(true);
    s.resume();
    s.advance(0.5);
    expect(s.elapsed).toBeGreaterThan(time);
    const reset = s.reset();
    expect(reset.elapsed).toBe(0);
    expect(reset.generated).toBe(0);
    expect(reset.soc).toBe(1);
    expect(reset.phase).toBe("waiting");
  });
  it("queues a direction change until exchange and empty return have completed", () => {
    const s = new Simulator(small);
    s.start("discharge");
    while (s.phase !== "lowering") s.step();
    s.start("charge");
    expect(s.mode).toBe("discharge");
    expect(s.pendingMode).toBe("charge");
    s.resume();
    finish(s);
    expect(s.blocks.every((b) => b.location === "upper")).toBe(true);
    expect(s.generated).toBeCloseTo(
      potentialKWh(small.mass, small.height) * 0.9,
    );
    expect(s.completed).toBe(2);
  });
  it("refuses travel with an unsecured load and refuses an undocked transfer", () => {
    const s = new Simulator(small);
    s.start("discharge");
    s.step();
    s.step();
    s.step();
    expect(s.phase).toBe("loading");
    s.platformHeight = 20;
    const internal = s as unknown as { enter: (phase: string) => void };
    expect(() => internal.enter("unloading")).toThrow(
      "Illegal machine transition",
    );
    expect(s.phase).toBe("loading");
    expect(() => internal.enter("locking")).toThrow("docked");
    s.platformHeight = small.height;
    s.step();
    expect(s.phase).toBe("locking");
    expect(() => internal.enter("lowering")).toThrow("secured");
  });
  it("is independent of frame partitioning, including 2:1 reeving", () => {
    const a = new Simulator(small),
      b = new Simulator({ ...small, reeving: false });
    a.start("discharge");
    b.start("discharge");
    for (let i = 0; i < 650; i++) a.advance(0.1);
    b.advance(65);
    expect(a.generated).toBeCloseTo(b.generated);
    expect(a.auxiliary).toBeCloseTo(b.auxiliary);
    expect(a.stored).toBeCloseTo(b.stored);
  });
  it("accounts for partial block travel without generating during dock or empty phases", () => {
    const s = new Simulator(small);
    s.start("discharge");
    while (s.phase !== "lowering") s.step();
    expect(s.generated).toBe(0);
    s.resume();
    s.advance(small.height / small.speed / 2);
    expect(s.active?.height).toBeCloseTo(small.height / 2);
    expect(s.released).toBeCloseTo(potentialKWh(small.mass, small.height / 2));
    expect(s.generated).toBeCloseTo(s.released * small.dischargeEfficiency);
    expect(s.stored).toBeCloseTo(s.capacity - s.released);
    s.pause();
    const counters = [s.generated, s.charging, s.auxiliary, s.stored];
    s.advance(1000);
    expect([s.generated, s.charging, s.auxiliary, s.stored]).toEqual(counters);
    s.step();
    const generated = s.generated;
    while (!["selecting", "waiting"].includes(s.phase)) s.step();
    expect(s.generated).toBe(generated);
  });
  it("conserves energy across repeated full-inventory cycles at unequal efficiencies", () => {
    const s = new Simulator({
      ...small,
      count: 20,
      chargeEfficiency: 0.72,
      dischargeEfficiency: 0.85,
    });
    for (let cycle = 0; cycle < 4; cycle++) {
      s.start("discharge");
      finish(s);
      s.start("charge");
      finish(s);
      expect(s.stored).toBeCloseTo(s.capacity);
      expect(s.stored).toBeCloseTo(s.capacity - s.released + s.gained);
      expect(s.netGrid).toBeLessThan(0);
      expect(s.generated / s.charging).toBeCloseTo(0.72 * 0.85);
    }
    expect(s.completed).toBe(160);
  });
  it("holds manual operation between steps and resumes automatic sequencing explicitly", () => {
    const s = new Simulator(small);
    s.setAuto(false);
    s.start("discharge");
    s.advance(100);
    expect(s.elapsed).toBe(0);
    expect(s.phase).toBe("selecting");
    s.step();
    expect(s.phase).toBe("collecting");
    expect(s.paused).toBe(true);
    s.resume();
    expect(s.auto).toBe(true);
    finish(s);
    expect(s.completed).toBe(3);
  });
});
