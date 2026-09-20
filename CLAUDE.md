# Koul

Start every session by reading `PLAN.md` (state, decisions, checklist, session protocol), then `README.md`.

- `source scripts/env.sh` before any build or deploy. Contracts build only with `stellar contract build`.
- Backend and SDK only. The frontend is built by a teammate; `web/` is the old prototype plus reference route handlers.
- Every on-chain change is logged in `docs/build-log.md` with its tx hash.
- Commit locally, push only when asked. Plain commit messages, no trailers.
- English only in product copy and docs. No emojis. Imports at the top of files.
