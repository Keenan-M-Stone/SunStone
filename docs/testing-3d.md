Testing 3D / three.js code — guide

Why this is special

- JSDOM (used by unit tests) does not implement HTMLCanvasElement.getContext or WebGL. Tests that mount scene renderers or WebGL proxies will error or behave unpredictably under JSDOM.

Strategies

1) Unit tests (fast, local / CI)
- Prefer to avoid mounting real three.js renderers in unit tests. Instead:
  - Mock out THREE renderer or the component that initializes WebGL.
  - Use the provided test shim (available in `src/__tests__/setupTests.ts`) which stubs `HTMLCanvasElement.prototype.getContext` to return a minimal 2D or lightweight WebGL stub. This avoids "Not implemented" errors and keeps tests low-risk.
  - Keep rendering logic tests focused on state/props and not full WebGL rendering.

2) Integration / E2E (recommended for full rendering checks)
- Use Playwright or similar to run tests in a real browser with proper WebGL support. This captures real rendering behavior and is appropriate for verifying three.js/Canvas flows.
- For Playwright, run tests against the dev server (`npm run dev`) and use fixtures that open the app and assert rendered DOM/GL output.

3) Installing Node `canvas` (optional)
- If you really want to run headless canvas-backed unit tests in Node, you can install the native `canvas` package, but this requires native build toolchain and can complicate CI.

How we handle it here

- We added a small, safe shim to `src/__tests__/setupTests.ts` that provides a minimal 2D context and a tiny WebGL stub. This keeps unit tests passing without adding heavy native deps.
- Tests that need real rendering should live in an E2E suite using Playwright.

Recommended commands

- Run unit tests: npm run test:unit
- Start dev server: npm run dev
- Run E2E (Playwright): `npm run test:e2e` (requires Playwright dependencies; ensure `SUNSTONE_API_BASE` env var points to your backend if it is not `http://127.0.0.1:8000`).

We added a simple E2E test `frontend/e2e/synthesis.spec.ts` that uses Playwright's APIRequest to verify the `synthesis` backend is registered and responds. To run it locally:

1. Start the backend (e.g. `cd backend && uvicorn sunstone_backend.api.app:create_app --port 8000 --reload`) or set `SUNSTONE_API_BASE` to an available endpoint
2. From the `frontend` dir run `npm run test:e2e`

If you want, I can also add a CI job that runs Playwright against a provisioned backend (e.g., backend started in CI via uvicorn). Let me know if you'd like that.