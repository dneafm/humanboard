# HumanBoard storage layer

This folder is the seam between UI state and durable persistence.

Current stage:
- the app uses a local snapshot repository backed by `localStorage` so real user data survives reload/restart
- the SQLite schema is scaffolded under `sqlite/schema.sql` as the next source-of-truth target

Intended migration path:
1. keep app CRUD flows stable against the repository boundary
2. replace `LocalSnapshotRepository` with a real SQLite-backed implementation
3. add importers for `backtest` knowledge into `sources` / `source_snippets` / `entity_links`

Important rule:
- Zustand is UI state/cache
- durable storage belongs behind this repository layer
