# AGENTS.md

Collaborative todo lists. Offline-first PWA, synced with Automerge.

## Layout
- `ui/`: Solid 1.9 + Tailwind 4 + Vite (TS). Yarn workspaces (root, `ui`, `e2e`).
- `server/`: Rust (axum 0.6, automerge 0.3). Embeds `ui/dist` with rust-embed, so build the UI first.
- `e2e/`: Playwright, Chromium only. Expects the app on `localhost:3000` (`E2E_BASE_URL`).
- Dev env: `flake.nix` via direnv.

## Commands
- UI: `cd ui && yarn dev` (port 3000, proxies `/api` to `127.0.0.1:8789`), `yarn build` (runs tsc), `yarn check` (oxlint + oxfmt).
- Server: `cd server && cargo run -- serve --id-signing-key "$(cat id_signing_key.txt)" --lists-dir <dir>`.
- E2E: `cd e2e && yarn test`.
- Formatting: oxfmt, 120 columns. A husky pre-commit hook checks staged files.

## UI architecture
- `ListStore.tsx`: IndexedDB storage, device ID, Automerge docs, and sync over WebSocket `/api/v1/document/sync`. Exposed through a context (`useLists`).
- `list-schema.ts`: `List { id, name, sections: { name, items: { text, checked }[] }[] }`. Item text is a plain string (last writer wins), not Automerge text.
- `ListEditor.ts`: Solid store plus a queue of index-based `ListChange` ops. `List.tsx` applies the queue through `updateList` on window blur or unmount.
- `List.tsx`: hand-written editor. Each item is its own `contenteditable` div. Every section ends with an empty "new item" sentinel, and the list ends with an empty section sentinel. Focus moves through the `inputRefs` map (`"s"` / `"s.i"` keys), which must be reindexed by hand on insert and delete.
- Icons in `ui/src/icons` are generated (`yarn icons`). Do not edit them by hand.
- `ui/datamodel.txt` is out of date: sync now uses a WebSocket, not `POST /sync`.
