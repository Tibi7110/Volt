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

1. Press **Discharge**. An upper trolley approaches a bay, pulls its identified block onto the trolley, moves to the shaft and transfers the load to the platform. The platform locks, descends and produces electricity. The lower trolley collects the block and stores it, and the empty platform returns for the next load.
2. Press **Charge** to reverse this sequence. During an exchange, a direction change is queued until the current block is stored and the empty return is finished. The platform then positions at the new source station if necessary.
3. Use **Pause / Resume**, **Reset**, and **1× / 5× / 20×** time scaling. Power remains in physical kW regardless of playback speed. Time advances only while a sequence runs. Inactive browser tabs do not accumulate wall-clock catch-up.
4. Turn off **Automatic operation**, choose a direction, then press **Step** to finish exactly one machine phase. Step also pauses an automatic sequence. Resume enables automatic operation and runs continuously; turning automatic operation on also resumes an active sequence.
5. Use the four camera presets or drag to orbit, scroll to zoom and right-drag to pan. **X-ray shaft** toggles side-wall transparency. Select any inventory block to inspect its state and assignment.
6. Expand **Plant configuration** to edit validated assumptions. **Apply & reset plant** resets the inventory, time and all counters. Reset always starts with every block at the top.

## Default engineering values

20 × 20,000 kg blocks, 500 m effective vertical travel, 8 m/s loaded and empty platform speed, 90% charging efficiency and 90% discharging efficiency. Each transfer phase lasts 4 s; locking and docking each take 35% of that. Transfer auxiliary load is 6 kW; empty-hoist auxiliary load is 8 kW. The illustrated rope arrangement defaults to 2:1.

- Potential capacity: **545 kWh (0.545 MWh)**.
- Potential energy per block: **27.25 kWh**.
- Gross electrical discharge per block: **24.525 kWh**.
- Gross discharge power at 8 m/s: **1,412.64 kW**, only during loaded descent.
- Charging electricity per block: **30.278 kWh**, before auxiliaries.
- Ideal conversion-only round trip: **81%**. The dashboard estimate is lower because it includes transfers and empty returns.

Net grid energy = generated − charging − auxiliaries. Positive is export; negative is import. Stored energy includes partial travel of an active block and excludes the platform. The full-inventory round-trip estimate excludes an extra initial repositioning movement; measured counters include it. Since the initial plant starts charged, total generated / total charging is **not** a valid measured round-trip efficiency; the dashboard uses a consistently defined model estimate.

## Limits

Horizontal distances, block sizes and shaft geometry are schematic; vertical physical height is mapped onto a readable 3D cutaway. The model uses constant travel speeds and linear transfers, with no acceleration, structural analysis, rope elasticity, bearing losses, emergency braking, counterweights, grid export limits or detailed platform deadweight model. Auxiliary loads are configurable electrical surrogates, not validated equipment sizing. See [ARCHITECTURE.md](ARCHITECTURE.md) for mechanics, accounting and site unknowns.
