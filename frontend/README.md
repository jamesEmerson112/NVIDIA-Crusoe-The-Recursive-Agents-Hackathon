# Frontend

Angular 22 app with three.js. Setup, the pinned Node version and team rules are in the [root README](../README.md).

From this folder:

- `npm ci`: install the exact locked dependencies
- `npm start`: dev server at http://localhost:4200
- `npm run build`: production build to `dist/frontend`
- `npm test -- --watch=false`: unit tests (Vitest)
- `npm run ng -- generate component <name>`: Angular CLI generators

Use npm scripts, not a global `ng` or `npx ng`. Only npm commands check the pinned Node version.
