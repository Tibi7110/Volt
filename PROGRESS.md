# Progress

## Implemented

- Local React/TypeScript/Vite application with R3F/Drei procedural mine cutaway and responsive industrial dashboard.
- Automatic bidirectional exchange across four staggered platforms inside one shared shaft and headframe, separate rail trolleys and storage lanes, continuous positions, visible transfer forks, ownership tracking and per-hoist dock/travel interlocks. Exactly four guideways remain present; inventory supports 1–500 blocks in total. READY dispatch targets three moving loads and rotates the exchange role, with explicit timing shortfalls.
- Independent empty-return speed, configurable dispatch gap, per-hoist position/velocity/status/power, available upper inventory and separate Automatic Exchange ON/OFF.
- Fleet pause/resume/reset, steps to the next shared phase/dispatch boundary, auto/manual operation, speed scaling and direction changes that safely drain all assigned exchanges.
- SI potential-energy accounting, loaded electrical input/output, separately metered auxiliaries, signed net grid power/energy, SOC and full-inventory round-trip estimate.
- Inventory inspection, event log, live power chart, camera presets, transparent side walls, validated configuration, assumptions and disclaimers.
- Setup and architecture documentation, essential development conventions.

## Validation

- 24 Vitest tests cover the original physics/interlocks plus fleet inventory partitioning up to 500 blocks, staggered travel, uninterrupted conversion with default parameters in both directions, summed power/energy, fleet pause/step/reset, safe reversal/cancellation, uneven inventory and frame partitioning; explicit three-plus-one role rotation, READY interlocks, empty-only return, dock states, actual infeasible-timing gaps and automatic exchange OFF/ON.
- TypeScript checking and production Vite build pass. Vite reports the expected large Three.js bundle advisory.
- Chromium checks passed with no page/console errors: exactly one shaft/headframe, four horizontally separated platforms, four independent cable and motor assemblies, three generating hoists with the exchange role rotating H1 → H2, pause/step, Automatic Exchange OFF/ON, complete 20-block discharge and reverse charge using deterministic engine advancement (490.50 kWh generated; 605.56 kWh charging input), reset, all camera presets and a 390 px mobile layout with no horizontal overflow.

## Remaining model limitations

- Schematic geometry and linear motion; no site-specific engineering validation, acceleration, detailed structural/rope/platform dynamics or safety-system simulation.
- Configurable constant auxiliary loads are electrical surrogates. Round-trip estimate excludes one-off initial repositioning; executed counters include it.
- Four independent guideways within a single shared shaft require unverified excavation space, platform/rope clearance and supporting equipment. Sustained three-plus-one conversion requires exchange plus empty return to fit within one third of loaded travel; startup, reversal and inventory exhaustion interrupt conversion.
- No standing idle load, backend, persistence or external services. Reset begins with all blocks at the top.
