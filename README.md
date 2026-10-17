# The Recursive Agents Hackathon

Our entry for the Crusoe × Cerebral Valley Recursive Agents Hackathon (Oct 17, 2026): a team of agents you can walk away from, built on Crusoe Managed Inference.

## Layout

| Path | What |
|---|---|
| `frontend/` | SvelteKit app (UI and server-side agent code) |
| `docs/research/` | Team research: a build-our-own Obsidian, Blender with GPT-6 Astra and Claude, SF buildings in 3D (start with its `README.md`) |
| `.claude/skills/` | Claude Code skills, including the Crusoe inference reference |
| `CLAUDE.md` | Instructions for Claude Code agents working in this repo |

## Setup

Everyone runs the same toolchain: **Node 24.22.0**, which bundles npm 11.19.1. On any other version, npm refuses to install or run the project's scripts.

macOS / Linux, with [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install          # reads .nvmrc at the repo root
nvm use
cd frontend
npm ci
npm run db:push      # create the local SQLite database
npm start            # http://localhost:5173
```

Windows, with [nvm-windows](https://github.com/coreybutler/nvm-windows), which does not read `.nvmrc`:

```powershell
nvm install 24.22.0
nvm use 24.22.0
cd frontend
npm ci
npm run db:push
npm start
```

[fnm](https://github.com/Schniz/fnm) also works: run `fnm use` from the repo root.

## Commands (from `frontend/`)

- `npm ci`: install the exact locked dependencies
- `npm start`: dev server at http://localhost:5173
- `npm run build`: production build to `build/` (run with `node build`)
- `npm run check`: type checking
- `npm test`: unit tests (Vitest)
- `npm run lint` / `npm run format`: Prettier
- `npm run db:push`: apply the Drizzle schema to the local SQLite database

Use these npm scripts rather than `npx`. Only npm commands check the Node version.

## Dependencies

- `npm ci` installs exactly what `package-lock.json` lists. Use it for every fresh install.
- To add a package, run `npm install <pkg>`, then commit both `package.json` and `package-lock.json`.
- Never delete or regenerate `package-lock.json`. It records the native binaries for macOS, Linux and Windows.
- Dependency install scripts are blocked through `allowScripts` in `frontend/package.json`; the current packages ship prebuilt binaries and don't need them. If a new dependency really needs its script, review it and run `npm install-scripts approve <pkg>`.

## Crusoe API key

Each of us uses our own key from the [Crusoe Console](https://console.crusoecloud.com). Keys can contain `$`, so quote them with single quotes:

```bash
export CRUSOE_API_KEY='paste-your-key-here'
```

You can also put it in a `.env` file, which is gitignored. Never commit the key or put it in frontend code: anything in the browser bundle is public. Details are in section 3 of `.claude/skills/crusoe-recursive-agents-hackathon/SKILL.md`.

## Working with Claude Code

- `CLAUDE.md`, `.claude/skills/` and `.claude/settings.json` are committed, so every collaborator's agent gets the same instructions, skills and permission allowlist. The allowlist covers only safe commands: install from the lockfile, build, type-check, test, lint and read-only git.
- Put personal settings in `.claude/settings.local.json`, which is gitignored.
- Each of us edits `CLAUDE.md` on our own branch, so the copies drift. A SessionStart hook (`.claude/hooks/main-drift.mjs`) fetches `origin/main` when a Claude session starts and warns if main has `CLAUDE.md` or `.claude/` changes your checkout lacks. When you see it, pull main or rebase onto it. Docs and the code they describe sync when the branch merges into main, so merge small and often.
