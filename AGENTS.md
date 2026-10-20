# Development conventions

- Use React, TypeScript, R3F and plain CSS; keep the application local and backend-free.
- Keep SI physics, sequencing and accounting in `src/simulation.ts`, independent of React/Three.js.
- Preserve continuous block ownership/positions and dock-only transfers. Mode changes finish the active exchange safely.
- Run `npm test` and `npm run build` after changes to simulation or integration.
- Keep the conceptual-design disclaimer and document engineering simplifications.
