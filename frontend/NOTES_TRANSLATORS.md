Translator stubs
----------------

This project includes minimal translator stubs in `src/translators.ts` for the following solver backends:

- `opal`
- `ceviche`
- `scuffem`
- `pygdm`

These functions (`translateToOpal`, etc.) return simple placeholder outputs and are intended as scaffolding for full translator implementations. Hook these translators into the run submission pipeline or the backend-side translation exports when ready.
