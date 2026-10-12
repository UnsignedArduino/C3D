# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

C3D is a MakeCode Arcade extension: a general-purpose 3D engine (namespace `C3D`) targeting the pxt
Arcade simulator's 160×120, 16-colour screen. Engine source lives in `C3D_*.ts` files at the root of
the repo, not in a `src/` split. Whenever a `C3D_*.ts` file is created, renamed, or deleted, update
`pxt.json`'s `files` list to match. `main.ts` is the current testing/coding scratch area (will switch
to using `test.ts` properly once the extension is closer to prod-ready — see `test.ts`'s role below).
It's built and edited primarily through the MakeCode web editor (import via
`https://github.com/unsignedarduino/C3D`), with `mkc` CLI as the local alternative.
[docs/old_main.ts](docs/old_main.ts) is the old renderer code that this engine's design was built
referencing.

## Commands

This extension targets the simulator only (not hardware/micros). Use the `mkc` CLI
(`npm i -g makecode`), not `pxt`:

```bash
mkc serve   # builds and serves the sim at 127.0.0.1:7001 — typically already running
mkc build -j   # run this specifically to check that a build succeeds
```

`mkc serve` is normally already running in a terminal; saving a file triggers its own build and
reload, so `mkc build -j` is only needed when an explicit build check is wanted (e.g. before wrapping
up a change) rather than for routine edits.

To view output: make sure `mkc serve` is running, open `127.0.0.1:7001` with the chrome-devtools MCP,
read `console.log` output via the console tools, and take a screenshot to confirm visual output.

`test.ts` is where local-only test/benchmark code goes — per `pxt.json`'s `testFiles`, it never ships
with the extension. `tsconfig.json` targets ES5 with `noImplicitAny` on but
`strictNullChecks`/`strictPropertyInitialization` off; output goes to `built/` (gitignored except
what's checked in).

## Architecture

Read [docs/api-design.md](docs/api-design.md) before making any non-trivial change — it's the living
design doc: what's shipped vs. sketched, why each API shape was chosen, known bugs, and the build
order for everything not yet written. The two companion docs it references:

- [docs/simulator-performance.md](docs/simulator-performance.md) — how pxt's simulator actually
  executes code (frame-object state machines, ~45ns per user function call, ~2ns dispatch tax per
  loop iteration, integer vs. float costs) and the native shims (`setRows`, `blitRow`, `fillTriangle`,
  `Buffer.fill`) worth building around instead. Required reading before touching anything in a
  per-vertex or per-pixel path.
- [docs/extension-survey.md](docs/extension-survey.md) — teardown of five other Arcade 3D/raycasting
  extensions, what their pipelines got right and wrong, informing this engine's design.

### Layering (see api-design.md for full detail)

1. **Math (shipped)** — `Vec3`, `Quat`, `Mat4`, `Mat3`, `Frustum`, `EulerOrder`, `clamp1`. Value types
   with mutating, chainable methods (three.js style: `this = ...`, returns `this`). `clone()` is the
   only allocating method on any of them.
2. **Scene graph (core shipped)** — `Object3D`: local/world matrices, parenting with both
   world-preserving (`attachToParent`/`detachFromParent`) and local-preserving (`addChild`/
   `removeChild`) semantics, cycle rejection, two-flag dirty tracking (`_localDirty` for TRS changes,
   `_worldDirty` for ancestor changes).
3. **Cameras (shipped)** — `Camera`, `PerspectiveCamera`, `OrthographicCamera` in `C3D_camera.ts`.
4. **Geometry and materials (core shipped)** — `Mesh` (flat `positions`/`indices`/`uvs` arrays,
   face/vertex normals, bounding radius), `Material` with `SingleColorMaterial`, `FaceColorMaterial`
   and `TextureMaterial`, `CullMode`, and `Model` in `C3D_geometry_and_materials.ts`. Mesh builders
   (`Mesh.box` etc.) and `Model.fromOBJ` aren't written yet; see api-design.md §6.
5. **Lights, scene/renderer, Arcade integration** — sketched, not yet implemented; see
   api-design.md §5, §7 and §8 for the intended shapes before adding any of these.

### Conventions that matter when extending this code

- **Operand order and preconditions go in the method name**, because Static TypeScript has no
  overloading: `multiplyThisWithB(b)` = `this = this·b`, `multiplyAWithThis(a)` = `this = a·this`,
  `multiplyAWithB(a, b)` = `this = a·b` (same pattern on `Vec3.cross*`). A precondition like "axis
  must be unit" is spelled into the name (`setFromNormalAxisAngle`) rather than asserted at runtime.
- **No allocation outside `clone()`.** Mutate in place, use `out` parameters for values that must be
  returned (`toEuler(out)`, `extractNormalMat(out)`, `extractFrustumPlanes(out)`) instead of tuples,
  destructuring, or fresh objects — all of which allocate on this target.
- **Nothing hot calls a user function, a `Vec3`/`Quat` method, or an interface method.** A user
  function call costs ~45ns (a frame allocation + trampoline round-trip, not a real call — see
  simulator-performance.md §1–2); interfaces compile to `mapGetByString`. Per-vertex/per-pixel code
  must read matrix/vector data out of flat arrays into locals ahead of time, per api-design.md §1/§5.
- **Static class fields don't reliably initialize** in this target — constants are lazy `static get`
  properties backed by a `static _field`, not `static readonly`.
- Keep any future "blocks" façade (`//% blockId=...` wrappers) in a separate file from the engine
  internals, never called from the render path — see api-design.md §9.
