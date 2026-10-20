# Mechanical and simulation model

## Files and data flow

- `src/simulation.ts`: pure TypeScript SI physics, block ownership, transition graph, deterministic integration and accounting. It imports no React or Three.js APIs.
- `src/App.tsx`: controls, validated configuration, dashboard, inventory inspection, event log and SVG power chart. A requestAnimationFrame loop supplies scaled elapsed seconds to the engine; rendering refreshes at approximately 30 fps.
- `src/MineScene.tsx`: procedural cutaway, headframe, motor-generator/drum, visible ropes, rotating sheaves, one guided platform, individually identified blocks, two rail trolleys and telescopic transfer forks. The view reads engine positions; it never changes physics or ownership.
- `src/simulation.test.ts`: physics, energy, interlocks, transitions, sequential exchanges, inventory, continuity, empty stores, pause/resume/step/reset and frame partitioning tests.

`Simulator` owns one record for each uniquely identified block: mass, station/assignment, continuous horizontal position and physical height, status and animation phase. Rendering iterates that single inventory; it never clones a load onto another carrier. Storage bays flank each rail so trolley movement and transverse pickup do not pass through parked loads. Only one exchange runs at a time.

## Explicit sequence

`waiting → [positioning_empty] → selecting → collecting → transporting → loading → locking → lifting/lowering → unlocking → unloading → delivering → storing → returning_empty → selecting/waiting`

The same graph works in reverse for charging. Selecting approaches the source bay; collecting slides the block across a telescopic fork onto the source trolley. Transporting moves the trolley and block together. Loading slides the block from trolley to platform. Ownership passes to the hoist at the end of loading; locking secures the block and retracts the fork. The destination trolley approaches the dock during unlocking; unloading slides the block onto it. Delivering and storing move it to its matching bay. The block is stored before the empty hoist returns.

The private transition function accepts only graph edges, checks dock height for transfer/locking phases and requires exactly one secured hoist load before vertical travel. Empty travel requires an empty platform. Public control methods cannot jump to arbitrary phases. Pause freezes positions and energy; Step integrates the remainder of one phase, changes state once, then pauses. An active direction change is queued until the entire exchange and empty return have completed. Repositioning for the new direction is metered as an empty movement. No source inventory means waiting, with no energy consumption.

Integration splits an elapsed-time increment at phase boundaries so a large time step cannot charge travel energy during downtime. Endpoint tolerances snap interpolation to exact docking coordinates without discontinuous visible movement. `assertInvariants()` provides inventory, hoist capacity, height, ownership alignment and energy-conservation checks for tests.

## Energy and power

All accounting uses SI physical height and mass. Potential energy is `m × 9.81 × h` joules; dividing by 3,600,000 yields kWh. For each loaded travel increment, the engine differences actual block heights:

- Descent: released potential increases by `m g |Δh|`; electrical generation increases by released energy × discharge efficiency.
- Ascent: gained potential increases by `m g Δh`; charging electricity increases by gained energy / charging efficiency.
- Instantaneous loaded conversion is `m g v / 1000` kW, multiplied by discharge efficiency for output or divided by charging efficiency for input.
- Transfers and empty travel produce no electricity. Auxiliaries consume `configured kW × phase seconds / 3600`. Net grid power subtracts auxiliary power; net grid energy = generated − charging − auxiliary consumption. Pause has zero power and consumes no energy.

The initial inventory is fully charged. Conservation is checked against released gravitational energy, not previous charging counters. Repeated charge/discharge cycles lose energy. Maximum capacity is total block potential at the upper station; current stored potential includes a partially raised or lowered block. The discharge rating assumes constant configured loaded speed, whereas the chart includes zero generation and auxiliary import during exchange.

A block cycle has two shaft traversals plus seven full-duration transfer phases and two 0.35-duration locking/docking phases: `2 H/v + 7.7 T`. Round-trip estimate over a full inventory is `(capacity × η_discharge − auxiliary_discharge) / (capacity / η_charge + auxiliary_charge)`, with identical base auxiliary estimates in each direction. It excludes the possible one-off initial reposition. Actual electricity counters include every executed phase. Negative estimated net output is displayed as zero useful efficiency.

## Reeving and auxiliary model

The 2:1 illustration has a fixed upper anchor, two rope legs around a platform-mounted moving sheave, and an upper deflection sheave leading to the drum. 1:1 removes the moving sheave and uses one load-bearing leg. Ideal block-only rope tension is `m g / n`; rope speed and travel are `n` times platform speed and travel. The visual sheave/drum angles derive from rope travel. **Mechanical advantage changes force and travel, not total energy.** The option does not change conversion efficiency.

Transfer auxiliaries are a constant configurable load across selecting, collecting, transporting, loading, locking, unlocking, unloading, delivering and storing. Empty hoist travel has a separate constant electrical load in both directions, conservatively with no regeneration. These surrogate loads cover controls, trolley/fork drives and empty platform handling; they do not independently solve motor torque, acceleration, platform potential energy, cable mass or friction. No idle standing load is modelled. Horizontal transfers leave the block's main gravitational height unchanged. Linear station motion is a schematic kinematic cycle, not a rated drive-speed or collision-clearance design.

## Visual and site limitations

The 500 m default physical travel is rendered as 30 scene units. The scene uses schematic horizontal dimensions and block envelopes for legibility, not physically sized 20-tonne solid geometry. No external models, textures or fonts are fetched. The side walls can be made opaque, while the front cutaway remains open. Camera controls support orbit, pan, zoom and four presets. A browser without WebGL retains simulation controls with a fallback message.

This is not a validated mine design and does not establish suitability or authorization for a real mine in Valea Jiului. Shaft diameter, usable depth, ground stability, hoisting loads, storage space, ventilation, mine safety and access are all unknown. Further study would also need acceleration/braking profiles, steelwork and foundations, rope and drum sizing, redundant safety systems, thermal limits, equipment efficiencies across operating points, control failure modes and grid constraints.
