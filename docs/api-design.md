# C3D API design

C3D is a general-purpose 3D engine for MakeCode Arcade. Its API follows three.js where that works,
and departs from it where a 160×120, 16-colour screen and the pxt simulator make three.js the wrong
model. Everything lives in the `C3D` namespace.

This doc covers what the API looks like, why, and what is left to build. Two companion docs back it
up:

- [simulator-performance.md](simulator-performance.md) — what things cost in the simulator. The ns
  figures here come from it.
- [extension-survey.md](extension-survey.md) — how other Arcade 3D extensions work and where they
  went wrong.

## Status

| Area | File | State |
|---|---|---|
| Math: `Vec3`, `Quat`, `Mat4`, `Mat3`, `EulerOrder`, `clamp1` | `C3D_math.ts` | Done |
| Scene graph: `Object3D` | `C3D_object3d.ts` | Core done, convenience methods not yet |
| Cameras: `Camera`, `PerspectiveCamera`, `OrthographicCamera`, `Frustum` | `C3D_camera.ts` | Done |
| Geometry and materials: `Mesh`, `Material`, `CullMode`, `SingleColorMaterial`, `FaceColorMaterial`, `TextureMaterial`, `Model` | `C3D_model.ts` | Core done, mesh builders and `fromOBJ` not yet |
| Scene, renderer: `Scene`, `Renderer`, `RendererStats` | `C3D_renderer.ts` | Core done, unlit: transform, near/far/side clipping, per-model frustum culling, back/front-face culling, float z-buffer, single and per-face colour, stats. Not yet: `TextureMaterial` path, `wireframe`, `collectStats` gating, `backgroundImage`, removing the per-frame allocations in scene traversal and the clipper |
| Lights, raycasting | — | Not started |
| Arcade integration, blocks | — | Not started |

The old renderer in [old_main.ts](old_main.ts) is reference material only. The new renderer in
`C3D_renderer.ts` is written against the classes below, and already beats it ~2.4x on the old
1000-cube benchmark (§12).

---

## 1. Rules that apply everywhere

### Naming

- **Operand order goes in the name.** Static TypeScript has no overloading, and a reversed
  quaternion product is hard to spot. So `multiplyThisWithB(b)` means `this = this · b`,
  `multiplyAWithThis(a)` means `this = a · this`, and `multiplyAWithB(a, b)` means `this = a · b`.
  `Quat` and `Mat4` both use this pattern, and so do `Vec3.crossThisWithB` / `crossAWithB`.
- **Preconditions go in the name.** `applyUnitQuat`, `setFromNormalAxisAngle`,
  `setLookRotationFromUnitVectors` and `invertOrthonormal` each skip a normalize or a general
  inverse because the caller promises the input is already right. Nothing checks this at runtime.
- **Squared forms are spelled out**: `lengthSquared`, `distanceToVecSquared`. Use them when you can.
  `Math.sqrt` costs ~7.7 ns.

### Allocation

- `clone()` is the only method that allocates.
- A result that isn't `this` goes into an `out` parameter (`toEuler(out)`, `extractNormalMat(out)`,
  `extractFrustumPlanes(out)`). Tuples, destructuring and fresh objects all allocate, so don't use
  them.
- Methods return `this` so calls chain. The exceptions are scalar queries, methods that return their
  `out`, `decompose` (void) and `clone`.

### Hot paths

The public API is objects. Inside the renderer everything is flat arrays. A user function call costs
~45 ns, an interface call compiles to `mapGetByString`, and an `if` in a pixel loop costs ~2.3 ns.

- Code that runs per vertex or per pixel never calls a user function, a `Vec3`/`Quat` method or a
  getter. That includes `Vec3.UP`, so read it into a local first.
- Each model is read into flat arrays and locals once per frame, at the top of the pipeline
  (e.g. `worldMatrix.e` into twelve locals before the vertex loop).
- Use a class hierarchy at scene granularity (one class per light type) and an enum field plus a
  `switch` at triangle granularity.
- **One function per pipeline stage, never one for the whole pipeline.** A function whose locals
  (plus compiler temps) reach ~128 gets a dictionary-mode frame object in V8, and every local
  access in it slows ~20x. The first single-function `render()` had 202 and rasterized 6x slower
  than the old renderer. Stay under ~100 per hot function; count them in `built/binary.js`
  (simulator-performance.md §1). A call per model or per triangle (~45 ns) is cheap by comparison.
- `Math.min`/`Math.max` are user functions here, not shims (~45 ns each). Use ternaries in
  per-column and per-pixel code.

### Static TypeScript gotchas

- **No interfaces in hot code**, because interface calls compile to `mapGetByString`.
- **Default parameters work only for numbers, `null`, `true` and `false`.** A defaulted *string*
  parameter compiles at the declaration and then fails `TS9212` at every call site that leaves it
  out, with the error reported on the caller's line. This is why `name` is a field set in the
  constructor rather than a constructor parameter.
- **No union types** in public signatures.
- **Static fields don't initialize reliably.** Write constants as `static get X()` over a lazily
  assigned `static _x` (see `Vec3.UP`).
- **Abstract classes are fine. Abstract methods are not.** Calling a body-less `abstract` method
  makes the compiler die with `Assertion failed` in `compileBinary`. There is no source location,
  and it fails at the call site rather than the declaration. Give every member a body, and have the
  base version throw.
- **Destructuring, tuple returns and closures allocate.**

---

## 2. Math (done)

`C3D_math.ts` holds `Vec3`, `Quat`, `Mat4`, `Mat3`, `EulerOrder` and `clamp1`. `Frustum` lives in
`C3D_camera.ts`. They are value types with mutating, chainable methods. `Vec3` and `Quat` are meant
for users. `Mat4` is public, but the common path never makes a user touch one.

- **`Vec3`**: `set`/`copy`/`clone`, `add`/`addScaled`/`sub`/`scale`/`negate`, `dot`, `cross*`,
  `length`/`normalize`/`distanceToVec` (+ squared forms), `applyUnitQuat`/`applyMat4`/`applyMat3`/
  `transformDirection`, `lerp`, `equals`, and the constants `UP` (0,1,0), `FORWARD` (0,0,−1) and
  `RIGHT` (1,0,0).
- **`Quat`**: `set`/`copy`/`identity`/`clone`, `setFromNormalAxisAngle`/`setFromEuler` (all six
  orders)/`setFromUnitVectors`/`setFromRotationMat`/`setLookRotationFromUnitVectors`, `dot`,
  `multiply*`, `conjugate`/`invert`/`normalize`, `slerp`/`nlerp`/`angleTo`/`rotateTowards`,
  `toEuler(out)`, `equals`.
- **`Mat4`**: a flat, 16-element, column-major `number[]` (the GL layout), so multiplies unroll to
  straight-line arithmetic. It has `multiply*`, `compose`/`decompose`, `invert`/`invertOrthonormal`/
  `transpose`, `determinant3`, `maxScaleOnAxis`, `setPerspective`/`setOrthographic`,
  `extractNormalMat(out)`, `extractFrustumPlanes(out)` and `equals`.
- **`Mat3`**: 9 elements, column-major. It only exists to hold normal matrices.

Behaviour you can't tell from the signatures:

- **`Vec3.applyMat4` does the perspective divide.** That's correct for one-off points and for
  `unproject`. The renderer never calls it, because near-plane clipping needs clip-space `w` intact.
- **Degenerate inputs never produce NaN.** Normalizing a near-zero `Vec3` gives zero, and a near-zero
  `Quat` gives identity. `Mat4.invert` leaves a singular matrix unchanged. `decompose` returns an
  identity rotation when two or more axes have collapsed, and rebuilds the missing axis when only one
  has.
- **Near-parallel fallbacks.** `setFromUnitVectors` and `setLookRotationFromUnitVectors` switch to
  `RIGHT` or `UP` when their inputs are nearly parallel, so a camera looking straight down doesn't
  spin. `slerp` turns into a lerp past cos 0.9995. Both `slerp` and `nlerp` take the short
  arc.
- **`extractFrustumPlanes` returns planes in the space the matrix maps from.** Pass the
  view-projection matrix and you get world-space planes.
- **`maxScaleOnAxis` is exact only when the basis is orthogonal.** Under shear it can underestimate
  by up to √3.
- **`Vec3.UP`, `FORWARD` and `RIGHT` are shared instances.** Never mutate them.

---

## 3. Scene graph: `Object3D` (core done)

```ts
class Object3D {
    readonly position: Vec3     // position, rotation and scale are the only real state;
    readonly rotation: Quat     // mutate them directly
    readonly scale: Vec3
    name: string
    visible: boolean
    parent: Object3D
    readonly children: Object3D[]
    localMatrix: Mat4
    worldMatrix: Mat4
    matrixAutoUpdate: boolean   // false: you write worldMatrix yourself

    addChild(child): Object3D       // reparent, keeping the child's LOCAL transform
    removeChild(child): Object3D    // keeps LOCAL
    attachToParent(p): Object3D     // reparent, keeping this node's WORLD transform
    detachFromParent(): Object3D    // keeps WORLD
    updateWorldMatrix(force = false): void   // once per frame, on the root
}
```

How it works:

- **Changes are found by comparing against a snapshot.** Each node keeps a copy of the 10 TRS numbers
  it last composed from. That comparison is why `model.position.x += 1` works with no setters. It
  costs ~45 ns per node per frame.
- **There are two dirty flags.** `_localDirty` means the TRS changed, so the local matrix has to be
  recomposed. `_worldDirty` means the parent changed, so only the world multiply needs to run again.
  When the root of a deep hierarchy moves, nothing below it gets recomposed. The flags are public
  fields rather than a `_markDirty()` method because a field write costs ~0.3 ns and a call costs
  ~45 ns.
- **Reparenting while keeping the world transform** brings both ancestor chains up to date first.
  `_updateWorldUpward` does this, and it deliberately leaves the dirty flags alone so the next frame's
  update still runs normally. It then decomposes `inverse(parentWorld) · world` back into TRS.
  Cycles are rejected before any of this happens.
- **`matrixAutoUpdate = false`** leaves `worldMatrix` exactly as you wrote it and makes the node's
  children recompute every frame.

### Non-uniform scale

The rule: **a node with non-uniform scale can have any number of descendants, as long as none of them
is rotated relative to it.** A rotation below a non-uniform scale produces shear, and shear can't be
written as TRS. So stretching a cube into a wall with unrotated children on it is fine, but a scaled
limb pivot is not.

Shear still renders correctly, because `worldMatrix` is the true composition. The things that break
are the ones that assume `W = T·R·S`:

- `decompose`, and with it `attachToParent` / `detachFromParent`. The child visibly jumps.
- The camera's view matrix (§4). It normalizes axis lengths but can't fix axes that aren't
  perpendicular.
- `maxScaleOnAxis`. It underestimates, so culled models can pop in at the screen edge.

If this ever needs enforcing, `_setParent` could dot the columns of `_mTmp` and warn when they aren't
close to orthogonal.

### Still to add

These are convenience methods for user code. The renderer never calls them.

```ts
lookAt(target: Vec3, up?: Vec3): Object3D
rotateOnAxis(axis: Vec3, angle: number): Object3D        // local axis, must be unit
rotateOnWorldAxis(axis: Vec3, angle: number): Object3D   // axis in the parent's frame
translateOnAxis(axis: Vec3, distance: number): Object3D  // local axis; FORWARD moves forward
getWorldPosition(out: Vec3): Vec3
getWorldDirection(out: Vec3): Vec3                       // local -Z, in world space
traverse(cb: (o: Object3D) => void): void
getObjectByName(name: string): Object3D
```

`rotateOnAxis` builds a delta with `setFromNormalAxisAngle` and applies it with `multiplyThisWithB`.
`rotateOnWorldAxis` applies it with `multiplyAWithThis`. `lookAt` calls
`setLookRotationFromUnitVectors` on the normalized direction to the target.

**−Z is forward for every node**, cameras and lights included. three.js uses +Z for objects and −Z for
cameras; having one convention means `lookAt` and `getWorldDirection` never need a special case.

Some three.js methods are left out on purpose, because they are one-liners over what already exists:

- `rotateX/Y/Z` and `translateX/Y/Z`: pass `Vec3.RIGHT`, `UP` or `FORWARD` to the axis versions.
- `setEuler`: use `rotation.setFromEuler`.
- `localToWorld`: use `v.applyMat4(node.worldMatrix)`.
- `getWorldRotation` / `getWorldScale`: use `worldMatrix.decompose`, keeping in mind it's wrong under
  shear.

### Planned subclasses

```
Object3D            also used directly as an empty pivot / mount point
├── Model           mesh + material (done)
├── Billboard       one Image that always faces the camera
├── Camera          (done)
│   ├── PerspectiveCamera
│   └── OrthographicCamera
├── Light
│   ├── DirectionalLight
│   └── PointLight
└── Scene           the root
```

Parenting gives you useful behaviour with no extra code. A camera under a model is a chase cam, a
point light under a model is a torch, and a chain of plain `Object3D`s is a limb.

---

## 4. Cameras (done)

```ts
abstract class Camera extends Object3D {
    near: number
    far: number
    readonly projectionMatrix: Mat4
    readonly viewMatrix: Mat4
    readonly viewProjectionMatrix: Mat4
    readonly frustum: Frustum                // world-space planes
    viewportWidth: number                    // last values given to updateMatrices
    viewportHeight: number

    updateMatrices(viewportWidth, viewportHeight): void   // once per frame, after updateWorldMatrix
    project(worldPos: Vec3, out: Vec3): Vec3              // world -> pixels, out.z = NDC depth
    unproject(ndcX, ndcY, ndcZ, out: Vec3): Vec3          // NDC -> world
}

class PerspectiveCamera extends Camera {
    constructor(fovDegrees = 70, near = 0.1, far = 100)
    fovY: number               // radians
    aspect: number             // 0 = take it from the viewport
    getAspect(): number
    fovX: number               // get/set, derived from fovY
    setFocalLength(mm): void
    getFocalLength(): number
}

class OrthographicCamera extends Camera {
    constructor(height = 10, near = -100, far = 100)
    height: number             // world units, vertical
    aspect: number             // 0 = take it from the viewport
    getAspect(): number
    width: number              // get/set, derived from height
    top / bottom / left / right   // getters only
    frameSphere(radius, margin = 1.1): void
}

class Frustum {
    p: number[]                // 6 planes × (a, b, c, d), normalized
    sphereInFrustum(cx, cy, cz, r): boolean
}
```

Decisions:

- **The viewport sets the aspect.** `updateMatrices` takes the render target's size, so the target is
  the only source of truth. A non-zero `aspect` overrides it, which is useful for something like a
  square minimap.
- **`updateMatrices` rebuilds everything every frame.** It updates projection, view, view-projection
  and frustum planes without caching. That costs a few µs per camera. Caching wouldn't work anyway,
  because `updateWorldMatrix` has already cleared the dirty flags by the time this runs.
- **The view matrix tolerates scale.** `updateView` normalizes the world basis and then transposes it,
  instead of calling `invertOrthonormal`. A camera under a scaled parent therefore still works, for
  the price of three `sqrt` per frame. Shear still breaks it (§3).
- **`project` returns pixels and `unproject` takes NDC.** `project` exists for HUD anchors, so it
  answers in pixel indices (a point at the centre of pixel 5 gives exactly 5). Its `out.z` is NDC
  depth: anything outside [−1, 1] isn't visible, and that one test also catches points behind a
  perspective camera (they land at z > 1). For a screen ray, call `unproject(x, y, −1)` for the
  origin and `unproject(x, y, 1)` for a second point on the ray. `unproject` inverts the
  view-projection matrix on every call, so keep it out of loops.
- **Orthographic uses one `height` knob plus aspect**, not six GL bounds. Zooming is
  `height *= 0.9`, and switching camera type means changing one field. The box is always centred on
  the camera. An off-centre volume has to call `Mat4.setOrthographic` directly.
- **Orthographic `near` defaults to −100.** An ortho camera has no eye point, so by default it also
  shows things behind its origin. This is the one way the two camera types differ beyond their main
  knob.
- **Perspective stores `fovY` in radians, but its constructor takes degrees.** `fovX` and focal length
  have no storage of their own and read or write `fovY`. So after an aspect change, the vertical angle
  is the one that stays fixed, which is also what three.js does. Focal length assumes a 24 mm
  *vertical* film gate (35 mm full frame), so a 50 mm lens gives ~27° vertically.
- **`updateProjection` is a concrete method** that throws in the base class (abstract methods crash
  the compiler, §1).

**Caveat:** if `aspect` is 0, `getAspect()` returns 1 until the first `updateMatrices`. Reading
`fovX` or `width` before then assumes a square viewport, and *writing* them stores the wrong
`fovY`/`height`. Set them after the first frame, or together with an explicit `aspect`.

---

## 5. Renderer (core done)

### Pipeline requirements

These are lessons from the old renderer, to build in from day one:

- **Clip every vertex attribute.** The vertex buffer is strided (`x y z w  u v  level`), and the
  near-plane clip lerp loops over the whole stride. The old `_clipLerp` hardcoded four components,
  which smears UVs and Gouraud levels on any clipped triangle.
- **Carry the source face index through the clipper.** Colour, normal and material are all looked up
  by face index, so the clipper doesn't need to know about any of them.
- **Clip against the side planes too, or use a guard band.** Without one, far-offscreen vertices make
  the edge walk lose precision. This is an internal choice, not a user setting.
- **The renderer owns its z-buffer.** The target is fixed at construction. The old public, mutable
  `target` could leave `_zBuf` the wrong size.
- **Cull per model** with
  `camera.frustum.sphereInFrustum(centre, mesh.boundingRadius * worldMatrix.maxScaleOnAxis())`.
  The old benchmark transformed all 12 000 triangles whether or not they were visible.
- **Use the same NDC→pixel mapping as `Camera.project`**, so HUD anchors line up with rendered
  geometry.
- **Count stats in locals** and write them back once per frame, only when `collectStats` is on. The
  old `this._pixelsTestedThisFrame++` cost two field accesses per pixel.

### Internal data

```
_vertexBuf: number[]   x y z w  [u v]  level per vertex, clip space; u v only for TextureMaterial
_indexBuf: number[]
_faceBuf: number[]     source face index per output triangle
_zBuf: Buffer          fixed-point depth; clearing it is one fill()
_frameBuf: Buffer      column-major (x * 120 + y); one setRows to the screen per frame
_light*: number[]      lights flattened once per frame (§7)
```

`Object3D`, `Mat4` and friends show up in the pipeline exactly twice: when `worldMatrix.e` is read
into locals before the vertex loop, and when lights are flattened. Nothing below that point calls a
method.

### API

```ts
class Scene extends Object3D {
    background: number = 0            // palette index
    backgroundImage: Image = null
    ambient: number = 0.2             // light level everywhere, 0..1
    fog: Fog = null
}

class Renderer {
    constructor(target: Image)
    readonly target: Image
    wireframe: boolean = false        // debug
    collectStats: boolean = false
    readonly stats: RendererStats
    render(scene: Scene, camera: Camera): void
}
```

---

## 6. Geometry and materials (core done)

Everything in this section draws **unlit**. Each face shows its palette colour, or its texture,
exactly as stored. Lighting is added on top of this in §7.

```ts
class Mesh {
    constructor(positions: number[], indices: number[], uvs: number[] = null)
                              // computes faceNormals and boundingRadius, not vertexNormals
    positions: number[]       // 3 per vertex
    indices: number[]         // 3 per triangle, counter-clockwise seen from outside
    uvs: number[]             // 2 per vertex, or null; only TextureMaterial reads them
    vertexNormals: number[]   // 3 per vertex; unset until computeVertexNormals. Only Gouraud needs them (§7)
    faceNormals: number[]     // 3 per triangle, unit; (0, 0, 0) for a degenerate triangle
    boundingRadius: number    // around the local origin; a plain field for speed, treat it as read-only

    computeFaceNormals(): void
    computeVertexNormals(smoothAngle = 0): void   // degrees; 0 = every edge hard
    computeBoundingRadius(): void

    // not yet written
    static box(w = 1, h = 1, d = 1): Mesh
    static plane(w = 1, d = 1, segsX = 1, segsZ = 1): Mesh
    static sphere(r = 1, segs = 8, rings = 6): Mesh
    static cylinder(r = 1, h = 1, segs = 8): Mesh
    static cone(r = 1, h = 1, segs = 8): Mesh
    static fromHeightmap(img: Image, scale: Vec3): Mesh
}

abstract class Material {
    cull: CullMode = CullMode.Back
}
enum CullMode {
    Back,     // hide faces pointing away from the camera; the usual choice
    Front,    // hide faces pointing toward it, e.g. the inside of a textured room box
    None      // two-sided surfaces: a plane, leaf or flag
}

class SingleColorMaterial extends Material {
    color: number             // palette index for every face
    constructor(color: number)
}
class FaceColorMaterial extends Material {
    colors: number[]          // 1 palette index per triangle of the mesh it's drawn with
    constructor(colors: number[])
}
class TextureMaterial extends Material {
    texture: Image            // colour 0 is transparent, as everywhere in Arcade; mesh needs uvs
    constructor(texture: Image)
}

class Model extends Object3D {
    mesh: Mesh
    material: Material
    constructor(mesh: Mesh, material: Material = null)   // null = new SingleColorMaterial(1)

    // not yet written
    static fromOBJ(text: string): Model   // SingleColorMaterial, or FaceColorMaterial if the file uses usemtl
}
```

```ts
new Model(Mesh.box(), new SingleColorMaterial(2))        // one colour
new Model(carMesh, new FaceColorMaterial(carColors))     // a colour per face
new Model(Mesh.box(), new TextureMaterial(crateImg))     // a texture
```

### Normals and bounds

- **The constructor computes face normals and the bounding radius, nothing else.** Vertex normals
  are opt-in, because only Gouraud reads them and computing them can rewrite the vertex list (below).
  If you edit `positions` or `indices` afterwards, call `computeFaceNormals` and
  `computeBoundingRadius` again yourself; nothing tracks changes.
- **Winding is counter-clockwise seen from outside**, so a face normal is `(b − a) × (c − a)`,
  normalized. A degenerate triangle gets a zero normal rather than NaN, matching §2.
- **`computeVertexNormals(smoothAngle)` averages, at each corner, the normals of the faces touching
  that corner's position whose normal is within `smoothAngle` degrees of the corner's own face.**
  Each face is weighted by its area. `0` still blends exactly coplanar faces (there's a small
  tolerance for float error), so a subdivided flat quad stays flat.
- **Neighbours are found by position, not by vertex index.** Positions are rounded to 1e-4 and
  grouped, so vertices that are already duplicated (UV seams, a builder's per-face box corners, or a
  split from an earlier call) still smooth across each other.
- **`computeVertexNormals` rebuilds `positions`, `uvs` and `indices`.** `vertexNormals` is indexed per
  vertex, so every distinct (position, normal, uv) at a position becomes one vertex: corners that need
  different normals or UVs are split, identical duplicates are merged, and unreferenced vertices are
  dropped. The arrays are replaced, not edited in place. Vertex order changes, but **face order
  doesn't**, so `faceNormals`, `FaceColorMaterial.colors` and a builder's documented triangle order
  all stay valid. Calling it again with the same `smoothAngle` gives the same result, whatever was
  called before. Any per-vertex attribute added to `Mesh` later (vertex colours, skin weights) must be
  copied and compared in its split/merge step, or splits will drop it.
- **`computeVertexNormals` is a load-time call.** It allocates freely (a string key per vertex, a
  list per position) and is far too slow for per-frame use.

### Materials and models

- **The material picks exactly one colour source, and holds that source's data.** There are no
  precedence rules to learn: a `SingleColorMaterial` has no texture to forget about, and nothing is
  inferred from which fields are null.
- **The renderer picks a path with `instanceof`, once per model:** native fill, per-face lookup, or
  textured spans. There's no `kind` field, because a field could disagree with the actual class, and
  a user's subclass of, say, `SingleColorMaterial` still matches. In the simulator, `instanceof` compiles
  to the runtime's `checkSubtype` helper (a null test, a vtable `===`, then a class-number range
  compare), which is plain JS, not a pxt frame. The `as` cast after it is erased and the field read
  is unchecked, so a chain of three tests costs a few ns per model, about the same as reading and
  switching on an integer. `Light` keeps its `type` field (§7) for a different reason: lights get
  flattened into number arrays each frame, and materials don't.
- **A material only says what colour a surface is.** `cull` lives on the base class because every
  material needs it. How a surface reacts to light is one more base-class field, `shading`, added in §7.
  The colour ramps used for shading are global (§7), not per material.
- **Face colours are appearance, so they live on the material, not the mesh.** A red car and a blue
  car share one mesh and differ only in their `FaceColorMaterial` colour arrays. With the colours on the
  mesh, recolouring would mean cloning the geometry. The cost is that a `FaceColorMaterial` is tied
  to its mesh's triangle count. It still covers multi-colour low-poly models (car body, windows,
  wheels) with one mesh and one material, so there's no need for material groups or slots.
- **UVs are geometry, so they live on the mesh.** They're per vertex and go through the clipper with
  the positions. Every builder fills them in so any built-in mesh can take a texture; other materials
  ignore them, and the renderer only carries them in the vertex stride for `TextureMaterial`.
  A `TextureMaterial` on a mesh with no `uvs` is an error, checked once per model.
- **Builders document their triangle order** (e.g. `box`: +X, −X, +Y, −Y, +Z, −Z, two triangles
  each), so a `FaceColorMaterial` colour array can be written for them by hand. That order survives
  `computeVertexNormals`.
- **`fromOBJ` returns a `Model`, not a `Mesh`,** because an OBJ with `usemtl` carries per-face
  colours, which now belong to the material.
- **A `Model` always has a material.** Passing `null` (or nothing) gives `SingleColorMaterial(1)`,
  so the renderer never has to test for a missing one.
- **Meshes and materials can be shared** between models. Since `computeVertexNormals` replaces the
  mesh's arrays rather than editing them, two meshes built from the same `positions` array stop
  sharing it after the call.
- **`boundingRadius` is in local space.** The per-frame scale factor comes from `maxScaleOnAxis()`,
  which costs one `sqrt` per model.

---

## 7. Lighting, fog and shadows (planned)

Everything in this section computes one thing: a brightness **level** for each face, vertex or
pixel. The level selects a row of the shade table, and that row turns the surface's palette colour
into the colour that gets drawn.

### Shade table

A 16-colour palette can't mix light: a blue light on a red surface can't make magenta. So light is a
single number, and each colour's ramp decides what that colour turns into as it gets darker.

```ts
class ShadeTable {
    static get global(): ShadeTable   // the table the renderer uses for lighting
    constructor(levels = 8)
    readonly levels: number
    readonly table: Buffer            // levels × 16 bytes, indexed (level << 4) | colour
    setRamp(color: number, ramp: number[]): void   // palette indices from level 0 up, ending with color
    resetToDefault(): void            // hand-picked ramps for the default Arcade palette
}
```

- **Users edit ramps, and the engine builds the table from them.** A ramp is a short list of palette
  indices. For example, `setRamp(2, [15, 14, 2])` makes red fade through brown to black. Ramps can be
  any length, because each one is stretched across `levels`.
- **There is one global table, because the palette is global.** A game that changes its palette
  calls `setRamp` to match. Generating ramps automatically from the palette's RGB values could come
  later, but with only 16 colours, hand-picked ramps look better.
- **Colour 0 stays transparent** and is never shaded.
- **The renderer reads `table` into a local once per frame**, so a shaded colour costs one buffer
  read.

Flat colours, textures, Gouraud and fog all use this one mechanism. It's a generalized version of
U3D's `shadeLUT` (see the survey).

### Shading modes

Lighting adds one field to the `Material` base class, so every subclass gets it:

```ts
class Material {
    // ...the §6 fields
    shading: ShadingMode = ShadingMode.Flat
}
enum ShadingMode { Unlit, Flat, Gouraud }
```

| Mode | When the light is computed | Extra cost per pixel |
|---|---|---|
| `Unlit` | Never; the colour is drawn as stored | None |
| `Flat` | Once per face, from the face normal | None for a flat colour; one table read per texel |
| `Gouraud` | Once per vertex, then the level is interpolated across the triangle | One add and one table read |

- **`Unlit` is still useful once lights exist**, for skies, glowing objects and anything that
  should ignore lighting.
- **Gouraud will band hard** when a ramp has only three or four colours. The classic fix is ordered
  dithering: add a 4×4 Bayer offset to the level before the lookup, for one more table read per
  pixel. Decide on it when Gouraud gets built.
- **Phong is not planned.** Per-pixel lighting means interpolating a normal, renormalizing it and
  computing a dot product for every light at every pixel. That costs several times what Gouraud does.
  With only a few colours per ramp, Phong's smoother diffuse shading is barely visible. Its real
  payoff is specular highlights, and those would also need ramps that go brighter than the base
  colour. Revisit only if highlights are wanted.

### Lights

```ts
class Light extends Object3D {
    type: LightType           // an enum field, not a virtual method
    intensity: number = 1     // turn a light off with `visible = false`
}
enum LightType { Directional, Point }

class DirectionalLight extends Light {}   // shines along its local -Z; aim it with lookAt
class PointLight extends Light {
    range: number = 10        // linear falloff to zero at range
}
```

Ambient light is `scene.ambient`, not a light object. It has no position or direction, so there's no
reason for it to live in the scene graph.

How lighting runs:

- **Flatten once per frame.** The renderer copies lights into parallel arrays (`_lightType`,
  `_lightX/Y/Z`, `_lightDirX/Y/Z`, `_lightIntensity`, `_lightRange`). Per-face code then reads plain
  numbers and switches on an integer. That's why `type` is a field and not an overridden method.
- **Light in model space.** For each model, transform each light into the model's local frame once,
  using the inverse world matrix. Lighting a face is then one dot product against the mesh's
  precomputed face normal, with no per-face normal transform and no renormalize. This is exact under
  uniform scale (divide a point light's range by the scale). A model with non-uniform scale falls
  back to transforming normals with `extractNormalMat` and renormalizing them.
- **Cost.** Ambient is free. A directional light is one dot product per face (Flat) or per vertex
  (Gouraud). A point light costs about 4–5× a directional one (subtract, length, divide).
- **Culling.** A point light only affects models whose bounding sphere touches its range sphere.
  That test is the whole light-culling scheme: there's no per-model ranking and no cap.

Deferred:

- `SpotLight` (a cone test on top of a point light).
- Hemisphere ambient (sky and ground levels mixed by `normal.y`, which would be one more field on
  `Scene`).

### Fog

```ts
class Fog {
    near: number
    far: number
    table: ShadeTable = null  // null: fade to dark through ShadeTable.global
}
```

- **Fog turns depth into a fog level** per face (per vertex for Gouraud). It's nearly free, and it
  hides the far plane.
- **Without a table of its own, fog just lowers the light level**, so distant things fade to black
  through the same ramps as lighting. This needs no extra setup and suits dark scenes.
- **For coloured fog, give it its own `ShadeTable`** whose ramps start at the fog colour. For example,
  for white fog, `setRamp(2, [1, 3, 2])` makes red fade through pink to white. Level 0 means fully
  fogged.
- **Fog adds little per-face work.** A flat face looks up both tables once. A textured face combines
  the two into one 16-byte table per face.

### Shadows (deferred)

Shadows aren't planned for the first renderer. If they get built, these decisions from earlier design
work still hold:

- **Opt in per light, by allocating.** `light.enableShadow(mapSize)` allocates the map and returns
  the shadow's settings. The map memory is the real cost (32 KB for a 128² directional map), so the
  allocation should be a visible call.
- **A shadow is a camera.** Each shadow owns an orthographic or perspective camera with
  `matrixAutoUpdate = false` that copies the light's world matrix, and it reuses `updateMatrices` and
  `frustum` unchanged.
- **Directional first.** Fit the box around the view camera with `frameSphere` and snap it to the
  texel grid so edges don't shimmer. Cull casters against the light's frustum, not the view's.
- **Shadows are per light**, not a global darken. A shadowed pixel loses only that light's
  contribution before its level is computed. This happens without a branch, using the depth
  comparison's sign bit: `base + (c & ~(d >> 31))`.
- **The cheapest version** handles one directional light as a post-pass over the z-buffer through a
  darken table. Its cost scales with screen pixels, not triangle count, but it's wrong under any other
  light.
- **Point-light cube maps** take six passes per refresh and are probably never affordable.

Open question: reading a 16-bit depth map hasn't been measured (`getNumber(UInt16LE)` vs a
`number[]` vs two byte buffers).

---

## 8. Arcade integration (planned)

```ts
namespace Engine {
    function start(scene: Scene, camera: Camera): void   // owns the frame loop
    function stop(): void
    function renderer(): Renderer
    function deltaTime(): number
    function onBeforeRender(cb: () => void): void
    function onAfterRender(cb: () => void): void         // draw HUD here
}

class Billboard extends Object3D {
    image: Image
    lockY: boolean = false    // true: turn about Y only (trees, characters)
}

class RaycastHit {
    object: Model
    distance: number
    point: Vec3
    faceIndex: number
}
function raycast(root: Object3D, origin: Vec3, dir: Vec3, maxDistance: number, out: RaycastHit): boolean
```

- **`Engine.start`** hooks `game.onUpdate`, then runs `updateWorldMatrix`, `camera.updateMatrices`
  and `render` into the screen image every frame. The manual path stays available.
- **`Billboard`** earns its place because every extension in the survey ended up needing one. Size
  comes from the normal `scale`.
- **`raycast`** returns only the nearest hit, written into `out`; it returns `false` on a miss and
  allocates nothing. It tests bounding spheres first, then triangles. That covers picking (feed it a
  ray from `unproject`), line-of-sight checks and ground snapping.
- **To put a sprite over a 3D point**, call `camera.project(node.getWorldPosition(tmp), out)` and
  place the sprite at `out.x, out.y` when `out.z` is within [−1, 1].

---

## 9. Blocks (planned)

Blocks get a flat façade in a separate file, e.g. `Blocks3D.setPosition(model, x, y, z)` and
`Blocks3D.rotateBy(model, x, y, z)`, with `//% fixedInstance` for things like a default camera. The
render path never calls it. The engine's own names (`multiplyAWithThis`) aren't meant to be block
labels. Design this layer before the core API settles.

---

## 10. Known issues

- **`Mat4.extractNormalMat`'s uniform-scale path returns R/s.** That is the correct normal matrix,
  but normals transformed by it come out with length 1/s, so a model at scale 2 would be lit at half
  intensity. Lighting in model space (§7) avoids it in the common case. Either have the fast path
  return R, or make sure every caller renormalizes.
- **`OrthographicCamera.frameSphere` only sets `height`.** On a viewport taller than it is wide, the
  sphere can get clipped horizontally, which contradicts the method's comment. It doesn't happen at
  160×120.
- **`_setParent` silently does nothing when a reparent would create a cycle** (the `throw`s are
  commented out). That is easy to miss while debugging.
- **Scratch objects are per instance and created lazily** (`Quat._aTemp/_xTemp/_yTemp/_zTemp/_mTemp`,
  `Object3D._mTmp`, `Camera._invTmp`). Any `Quat` that ever does a look-at keeps three `Vec3`s and a
  `Mat4` forever. Shared module-level scratch would be smaller, since nothing here is reentrant.
  Check that namespace-level initializers run in the right order across files before switching.
- **`computeVertexNormals` misaligns short `uvs`.** It only treats `uvs` as present when there are
  at least 2 per vertex. A non-null array shorter than that is kept unchanged while the vertices
  around it get reordered, so it no longer matches them. Either treat it as an error or set it to
  `null`.
- **`computeVertexNormals` doesn't recompute `boundingRadius`.** Dropping unreferenced vertices can
  only shrink the true radius, so the stale value is conservative and culling stays correct, just
  slightly looser.

---

## 11. Build order

1. `Object3D` convenience methods and `Mesh.box`. (`Model`, the materials, and `Mesh` with
   `computeFaceNormals`, `computeVertexNormals` and `computeBoundingRadius` are done.)
2. Renderer: transform, near and side clipping over the strided buffer, a flat-colour rasterizer,
   z-buffer and per-model frustum culling. Unlit only (§6).
3. `ShadeTable` with the default ramps, `scene.ambient`, `DirectionalLight` and `Flat` shading
   (§7). One dot product per face gives most of the visual payoff.
4. The other mesh builders and Gouraud shading.
5. UVs in the vertex stride and the textured rasterizer path (`TextureMaterial` itself exists).
6. `PointLight` and fog.
7. `Engine.start`, `Billboard` and `raycast`.
8. Blocks façade.

Step 2's strided buffer and clipper get more expensive to change the longer they wait. After step 3,
the order is flexible.

---

## 12. Benchmarking

- **The old benchmark scene is a worst case.** It has 1000 unit cubes in a ±5 box with the camera at
  z = 10, which gives ~112 covered pixels per triangle with ~93% of them z-rejected. It measures
  triangle setup and overdraw, not span throughput. Keep a second scene with fewer, larger triangles,
  so you can tell which half of the pipeline a change moved.
- **The transform floor** is `compose` plus `multiplyAWithB` for each moving node: about 1 µs, since
  floats cost ~8 ns per op. A thousand nodes is ~1 ms of the 20 ms budget, but only if clean subtrees
  really get skipped. To check, measure a deep hierarchy with one moving root: its descendants should
  redo the world multiply and recompose nothing.
- **`helpers.imageFillTriangle`** draws a flat triangle natively. Diff it pixel by pixel against the
  rasterizer to check correctness during refactors.
