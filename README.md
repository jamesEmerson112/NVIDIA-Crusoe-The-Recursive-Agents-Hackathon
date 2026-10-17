# The Recursive Agents Hackathon

Our entry for the Crusoe × Cerebral Valley Recursive Agents Hackathon (Oct 17, 2026): a team of agents you can walk away from, built on Crusoe Managed Inference.

## Layout

| Path | What |
|---|---|
| `frontend/` | Angular 22 app with three.js |
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
npm start            # http://localhost:4200
```

Windows, with [nvm-windows](https://github.com/coreybutler/nvm-windows), which does not read `.nvmrc`:

```powershell
nvm install 24.22.0
nvm use 24.22.0
cd frontend
npm ci
npm start
```

[fnm](https://github.com/Schniz/fnm) also works: run `fnm use` from the repo root.

## Commands (from `frontend/`)

- `npm ci`: install the exact locked dependencies
- `npm start`: dev server at http://localhost:4200
- `npm run build`: production build to `dist/frontend`
- `npm test -- --watch=false`: unit tests (Vitest); add `--include src/app/app.spec.ts` for one spec file
- `npm run ng -- generate component <name>`: Angular CLI generators

Use these npm scripts rather than a global `ng` or `npx ng`. Only npm commands check the Node version.

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

- `CLAUDE.md`, `.claude/skills/` and `.claude/settings.json` are committed, so every collaborator's agent gets the same instructions, skills and permission allowlist. The allowlist covers only safe commands: install from the lockfile, build, test, Angular generators and read-only git.
- Put personal settings in `.claude/settings.local.json`, which is gitignored.
