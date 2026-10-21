# Jiu Valley GES — Gravity Energy Storage Simulator

A local interactive engineering demonstrator of interchangeable-block gravity storage in a **conceptual** former coal mine in Valea Jiului, Romania.

**Conceptual Demonstrator — Not a Validated Mine Design.** Parameters are hypothetical. This project makes no claim about the suitability, shaft dimensions, structural capacity, safety or authorization of any particular mine.

## Run locally

Requires Node.js 22.12+ (or a compatible current LTS release), npm and a WebGL-capable browser.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).

```sh
npm test
npm run build
npm run preview
```

The application has no backend, accounts, database, paid assets or runtime service calls. All terrain, equipment and blocks use procedural geometry. Dependency installation needs internet access; subsequent operation is local.

## Operate

1. Press **Discharge**. Four guided platforms inside one shared shaft and headframe start at staggered times, each with its own rope and transfer lane. On each lane an upper trolley collects a block and transfers it onto its platform; the loaded platform descends and generates, the lower trolley stores the block, and the empty platform returns. The controller targets three loaded descents while the fourth carriage exchanges blocks or waits READY. The configured inventory is divided among exactly four lanes, without duplicating blocks.
2. Press **Charge** to reverse this sequence. A direction change waits for all assigned exchanges and empty returns to finish, then restarts staggered dispatch in the opposite direction. Each platform positions at the new source station if necessary.
3. Use **Pause / Resume**, **Reset**, and **1× / 5× / 20×** time scaling. Power remains in physical kW regardless of playback speed. Time advances only while a sequence runs. Inactive browser tabs do not accumulate wall-clock catch-up.
4. Turn off **Automatic operation**, choose a direction, then press **Step** to advance all lanes to the next phase boundary or scheduled dispatch. Step also pauses an automatic sequence. Resume enables automatic operation; turning automatic operation on also resumes an active sequence.
5. Use the four camera presets or drag to orbit, scroll to zoom and right-drag to pan. Shaft side walls remain transparent. Select any inventory block to inspect its state and assignment.
6. **Automatic exchange ON/OFF** enables reloading or finishes assigned blocks and waits, independently of Pause/Resume. Each hoist card shows status, block, height, signed velocity and electrical conversion power.
7. Expand **Plant configuration** to edit validated assumptions. **Apply & reset plant** resets the inventory, time and all counters. Reset always starts with every block at the top.

## Default engineering values

100 × 50,000 kg blocks, 300 m effective vertical travel, 3 m/s loaded speed and 12.5 m/s empty return speed (upward during discharge), 90% charging efficiency and 90% discharging efficiency. Each transfer phase lasts 2 s; locking and docking each take 35% of that. Transfer auxiliary load is 6 kW; empty-hoist auxiliary load is 8 kW. The illustrated rope arrangement defaults to 2:1.

- Potential capacity: **4,087.5 kWh (4.0875 MWh)**.
- Potential energy per block: **40.875 kWh**.
- Gross electrical discharge per block: **36.7875 kWh**.
- Gross discharge power at 3 m/s: **1,324.35 kW per hoist**, or **3,973.05 kW for three hoists** before auxiliaries, only during loaded descent. The dashboard sums all active hoists.
- Charging electricity per block: **45.417 kWh**, before auxiliaries.
- Ideal conversion-only round trip: **81%**. The dashboard estimate is lower because it includes transfers and empty returns.

Net grid energy = generated − charging − auxiliaries. Positive is export; negative is import. Stored energy includes partial travel of an active block and excludes the platform. The full-inventory round-trip estimate excludes an extra initial repositioning movement; measured counters include it. Since the initial plant starts charged, total generated / total charging is **not** a valid measured round-trip efficiency; the dashboard uses a consistently defined model estimate.

Default loaded dispatches are 35.025 s apart, loaded travel lasts 100 s, and exchange plus empty return takes 40.1 s. Exchange exceeds one third of loaded travel, so three active hoists cannot be sustained continuously; the dashboard reports the shortfall and shows actual reduced power. Minimum dispatch gap, speeds and transfer duration are editable. Startup, safe direction reversal and inventory exhaustion interrupt conversion.

## Limits

Horizontal distances, block sizes and shaft geometry are schematic; vertical physical height is mapped onto a readable 3D cutaway. The model uses constant travel speeds and linear transfers, with no acceleration, structural analysis, rope elasticity, bearing losses, emergency braking, counterweights, grid export limits or detailed platform deadweight model. Auxiliary loads are configurable electrical surrogates, not validated equipment sizing. See [ARCHITECTURE.md](ARCHITECTURE.md) for mechanics, accounting and site unknowns.
