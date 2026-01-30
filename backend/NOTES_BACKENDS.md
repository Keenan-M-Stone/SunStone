Notes on additional backends
---------------------------

The codebase includes lightweight stubs for several non-Meep backends (`opal`, `ceviche`, `scuffem`, `pygdm`). These are intentionally minimal and serve as scaffolding for:

- Ensuring the run/outputs contract is exercised in CI and debug runs
- Providing a place to implement full translators and solver invocation logic later

If you need a production implementation for any of these solvers, implement the translator (spec -> solver input) and update the corresponding backend `run` method to call the solver and write solver-specific artifacts into `outputs/`.
