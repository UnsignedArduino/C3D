// game.consoleOverlay.setVisible(true);
game.stats = true;

// all coordinates assume right handed y up
// todo: better name then "Testing3D"
namespace Testing3D {
  namespace LinearAlgebra {
    // copies src into snap at offset; returns true if any value differed
    export function syncSnapshot(snap: number[], offset: number, src: number[] | number): boolean {
      let changed = false;
      if (typeof src === "number") {
        changed = snap[offset] !== src;
        snap[offset] = src;
      } else {
        for (let i = 0; i < src.length; i++) {
          if (snap[offset + i] !== src[i]) {
            snap[offset + i] = src[i];
            changed = true;
          }
        }
      }
      return changed;
    }

    export function vectorsub(v1: number[], v2: number[]): number[] {
      const result = [];
      for (let i = 0; i < v1.length; i++) {
        result.push(v1[i] - v2[i]);
      }
      return result;
    }

    export function vectorlength(v: number[]): number {
      let sumOfSquares = 0;
      for (let i = 0; i < v.length; i++) {
        sumOfSquares += v[i] ** 2;
      }
      return Math.sqrt(sumOfSquares);
    }

    export function vectornormalize(v: number[]): number[] {
      const result = [];
      const dist = vectorlength(v);
      for (let i = 0; i < v.length; i++) {
        result.push(v[i] / dist);
      }
      return result;
    }

    export function vectordot(v1: number[], v2: number[]): number {
      return v1.reduce((sum, val, index) => sum + val * v2[index], 0);
    }

    export function vectorcross3(v1: number[], v2: number[]): number[] {
      return [
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0]
      ];
    }

    // determinant of the upper-left 3x3 (works on your 4x4 row arrays)
    export function det3(m: number[][]): number {
      return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
        - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
        + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    }

    export function matmul(m1: number[][], m2: number[][]): number[][] {
      const result = [];
      // i is the row index for m1
      for (let i = 0; i < m1.length; i++) {
        const resultRow: number[] = [];
        // j is the column index for m2
        for (let j = 0; j < m2[0].length; j++) {
          // dot together row i of m1 with col j of m2
          let dot = 0;
          // k is the column index of m1
          for (let k = 0; k < m1[0].length; k++) {
            dot += m1[i][k] * m2[k][j];
          }
          resultRow.push(dot);
        }
        result.push(resultRow);
      }
      return result;
    }
  }

  export class Mesh {
    public vertices: number[] = [];
    public triangles: number[] = [];
    // right now materials is just the color, not a general thing
    public materials: number[] = [];

    public constructor() {}
  }

  export class Transform {
    public scale: number[] = [1, 1, 1];
    public rotation: number[] = [0, 0, 0];
    public translation: number[] = [0, 0, 0];

    private _builtFrom: number[] = [];
    private _matrixM: number[][];

    public constructor() {}

    private _recomputeMatrices() {
      const sx = this.scale[0];
      const sy = this.scale[1];
      const sz = this.scale[2];
      const matrixS = [
        [sx, 0, 0, 0],
        [0, sy, 0, 0],
        [0, 0, sz, 0],
        [0, 0, 0, 1]
      ];

      const rx = this.rotation[0];
      const ry = this.rotation[1];
      const rz = this.rotation[2];
      const sinRz = Math.sin(rz);
      const cosRz = Math.cos(rz);
      const matrixRz = [
        [cosRz, -sinRz, 0, 0],
        [sinRz, cosRz, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1]
      ];
      const sinRx = Math.sin(rx);
      const cosRx = Math.cos(rx);
      const matrixRx = [
        [1, 0, 0, 0],
        [0, cosRx, -sinRx, 0],
        [0, sinRx, cosRx, 0],
        [0, 0, 0, 1]
      ];
      const sinRy = Math.sin(ry);
      const cosRy = Math.cos(ry);
      const matrixRy = [
        [cosRy, 0, sinRy, 0],
        [0, 1, 0, 0],
        [-sinRy, 0, cosRy, 0],
        [0, 0, 0, 1]
      ];
      const matrixR = LinearAlgebra.matmul(matrixRy, LinearAlgebra.matmul(matrixRx, matrixRz));

      const tx = this.translation[0];
      const ty = this.translation[1];
      const tz = this.translation[2];
      const matrixT = [
        [1, 0, 0, tx],
        [0, 1, 0, ty],
        [0, 0, 1, tz],
        [0, 0, 0, 1]
      ];

      this._matrixM = LinearAlgebra.matmul(matrixT, LinearAlgebra.matmul(matrixR, matrixS));
    }

    public get matrixM(): number[][] {
      // call each sync first, then ||, so every snapshot gets updated
      let changed = LinearAlgebra.syncSnapshot(this._builtFrom, 0, this.scale);
      changed = LinearAlgebra.syncSnapshot(this._builtFrom, 3, this.rotation) || changed;
      changed = LinearAlgebra.syncSnapshot(this._builtFrom, 6, this.translation) || changed;
      if (changed) {
        this._recomputeMatrices();
      }
      return this._matrixM;
    }
  }

  export class Model {
    public mesh: Mesh;
    public transform: Transform;

    public constructor(mesh: Mesh, transform?: Transform) {
      this.mesh = mesh;
      this.transform = transform ? transform : new Transform();
    }
  }

  export class Camera {
    // for view matrix
    public eye: number[];
    public target: number[];

    private _viewBuiltFrom: number[] = [];
    private _matrixV: number[][];
    // for clip space matrix
    public fovY: number = 70 * Math.PI / 180;
    public aspectRatio: number;
    public near: number = 0.1;
    public far: number = 100;

    private _clipBuiltFrom: number[] = [];
    private _matrixC: number[][];

    public constructor(eye: number[], target: number[], aspectRatio: number) {
      this.eye = eye;
      this.target = target;
      this.aspectRatio = aspectRatio;
    }

    private _recomputeVMatrix() {
      let up = [0, 1, 0];
      const zAxis = LinearAlgebra.vectornormalize(LinearAlgebra.vectorsub(this.eye, this.target));
      // if the view direction is (nearly) parallel to `up`, cross(up, zAxis) ~ 0
      // and normalize blows up. Swap to a different reference up for this case.
      if (Math.abs(zAxis[1]) > 0.999) {
        up = [0, 0, 1];
      }
      const xAxis = LinearAlgebra.vectornormalize(LinearAlgebra.vectorcross3(up, zAxis));
      const yAxis = LinearAlgebra.vectorcross3(zAxis, xAxis);
      // matrix for world to camera (view matrix)
      this._matrixV = [
        [xAxis[0], xAxis[1], xAxis[2], -LinearAlgebra.vectordot(xAxis, this.eye)],
        [yAxis[0], yAxis[1], yAxis[2], -LinearAlgebra.vectordot(yAxis, this.eye)],
        [zAxis[0], zAxis[1], zAxis[2], -LinearAlgebra.vectordot(zAxis, this.eye)],
        [0, 0, 0, 1]
      ]
    }

    public get matrixV(): number[][] {
      let changed = LinearAlgebra.syncSnapshot(this._viewBuiltFrom, 0, this.eye);
      changed = LinearAlgebra.syncSnapshot(this._viewBuiltFrom, 3, this.target) || changed;
      if (changed) {
        this._recomputeVMatrix();
      }
      return this._matrixV;
    }

    // public set fovX(fx: number) {
    //     this._fovY = 2 * Math.atan(Math.tan(fx / 2) / this.aspectRatio);
    // }
    // and add getter

    private _recomputeCMatrix() {
      const f = 1 / Math.tan(this.fovY / 2);
      const A = -(this.far + this.near) / (this.far - this.near);
      const B = -2 * this.far * this.near / (this.far - this.near);
      this._matrixC = [
        [f / this.aspectRatio, 0, 0, 0],
        [0, f, 0, 0],
        [0, 0, A, B],
        [0, 0, -1, 0]
      ];
    }

    public get matrixC(): number[][] {
      let changed = LinearAlgebra.syncSnapshot(this._clipBuiltFrom, 0, this.fovY);
      changed = LinearAlgebra.syncSnapshot(this._clipBuiltFrom, 1, this.aspectRatio) || changed;
      changed = LinearAlgebra.syncSnapshot(this._clipBuiltFrom, 2, this.near) || changed;
      changed = LinearAlgebra.syncSnapshot(this._clipBuiltFrom, 3, this.far) || changed;
      if (changed) {
        this._recomputeCMatrix();
      }
      return this._matrixC;
    }
  }

  export class Scene {
    public models: Model[] = [];

    public constructor() {}
  }

  export interface RendererStats {
    renderTime: number;
    timeVertexCopy: number;
    timeVertexMVCAndMirror: number;
    timeVertexClipping: number;
    timeVertexPerspective: number;
    timeVertexCull: number;
    timeVertexDraw: number;

    trianglesRendered: number;
    trianglesTouched: number;

    pixelsTested: number;
    pixelsTouched: number;
  }

  export class Renderer {
    public target: Image;

    private _verticesBuf: number[] = [];
    private _trianglesBuf: number[] = [];
    private _materialsBuf: number[] = [];

    private _verticesBufCount: number = 0;
    private _trianglesBufCount: number = 0;

    private _zBuf: number[] = [];

    private _pixelsTestedThisFrame = 0;
    private _pixelsTouchedThisFrame = 0;

    public constructor(target: Image) {
      this.target = target;
      for (let i = 0; i < this.target.width * this.target.height; i++) {
        this._zBuf.push(2);
      }
    }

    public render(scene: Scene, camera: Camera): RendererStats {
      const start = control.micros();
      let trianglesTouched = 0;
      let trianglesRendered = 0;
      this._pixelsTestedThisFrame = 0;
      this._pixelsTouchedThisFrame = 0;

      let timeVertexCopy = 0;
      let timeVertexMVCAndMirror = 0;
      let timeVertexClipping = 0;
      let timeVertexPerspective = 0;
      let timeVertexCull = 0;
      let timeVertexDraw = 0;

      this.target.fill(0);
      // reset z buffer
      for (let i = 0; i < this._zBuf.length; i++) {
        this._zBuf[i] = 2;
      }
      const matrixCV = LinearAlgebra.matmul(camera.matrixC, camera.matrixV);
      for (const model of scene.models) {
        const timings = this._renderModel(model, matrixCV, camera.near);

        trianglesRendered += this._trianglesBufCount;
        trianglesTouched += model.mesh.triangles.length / 3;
        timeVertexCopy += timings[1] - timings[0];
        timeVertexMVCAndMirror += timings[2] - timings[1];
        timeVertexClipping += timings[3] - timings[2];
        timeVertexPerspective += timings[4] - timings[3];
        timeVertexCull += timings[5] - timings[4];
        timeVertexDraw += timings[6] - timings[5];
      }

      const end = control.micros();
      const elapsed = end - start;

      return {
        renderTime: elapsed,
        timeVertexCopy,
        timeVertexMVCAndMirror,
        timeVertexClipping,
        timeVertexPerspective,
        timeVertexCull,
        timeVertexDraw,

        trianglesRendered,
        trianglesTouched,
        pixelsTested: this._pixelsTestedThisFrame,
        pixelsTouched: this._pixelsTouchedThisFrame
      };
    }

    private _renderModel(model: Model, matrixCV: number[][], near: number): number[] {
      const t0 = control.micros();

      //// copy data from model vertices and indicies
      // make every vector 4 long instead of 3 long, have space for w for verticies
      for (let i = 0; i < model.mesh.vertices.length / 3; i++) {
        this._verticesBuf[4 * i] = model.mesh.vertices[3 * i];
        this._verticesBuf[4 * i + 1] = model.mesh.vertices[3 * i + 1];
        this._verticesBuf[4 * i + 2] = model.mesh.vertices[3 * i + 2];
        this._verticesBuf[4 * i + 3] = 1;
      }
      this._verticesBufCount = model.mesh.vertices.length / 3;

      for (let i = 0; i < model.mesh.triangles.length; i ++) {
        this._trianglesBuf[i] = model.mesh.triangles[i];
      }
      this._trianglesBufCount = model.mesh.triangles.length / 3;
      for (let i = 0; i < model.mesh.materials.length; i++) {
        this._materialsBuf[i] = model.mesh.materials[i];
      }

      const t1 = control.micros();

      //// apply MVC to vertices
      const matrixM = model.transform.matrixM;
      const matrixMVC = LinearAlgebra.matmul(matrixCV, matrixM);
      // apply MVC to vertices
      for (let i = 0; i < this._verticesBufCount * 4; i += 4) {
        const vertex = [
          [this._verticesBuf[i]],
          [this._verticesBuf[i + 1]],
          [this._verticesBuf[i + 2]],
          [this._verticesBuf[i + 3]],
        ];
        const newVertex = LinearAlgebra.matmul(matrixMVC, vertex);
        this._verticesBuf[i] = newVertex[0][0];
        this._verticesBuf[i + 1] = newVertex[1][0];
        this._verticesBuf[i + 2] = newVertex[2][0];
        this._verticesBuf[i + 3] = newVertex[3][0];
      }
      const mirrored = LinearAlgebra.det3(matrixM) < 0;
      if (mirrored) {
        for (let t = 0; t < this._trianglesBufCount; t++) {
          const tmp = this._trianglesBuf[3 * t + 1];
          this._trianglesBuf[3 * t + 1] = this._trianglesBuf[3 * t + 2];
          this._trianglesBuf[3 * t + 2] = tmp;
        }
      }

      const t2 = control.micros();

      //// clipping
      this._clipForPlane(0);  // near
      this._clipForPlane(1);  // far

      const t3 = control.micros();

      //// perspective
      // apply to vertices
      for (let i = 0; i < this._verticesBufCount * 4; i += 4) {
        const vertex = [
          [this._verticesBuf[i]],
          [this._verticesBuf[i + 1]],
          [this._verticesBuf[i + 2]],
          [this._verticesBuf[i + 3]],
        ];
        const w = vertex[3][0];
        // now in NDC
        this._verticesBuf[i] = vertex[0][0] / w;
        this._verticesBuf[i + 1] = vertex[1][0] / w;
        this._verticesBuf[i + 2] = vertex[2][0] / w;
        // convert X and Y to screen coords, Z still in NDC (-1 near, 1 far plane)
        this._verticesBuf[i] = (this._verticesBuf[i] + 1) * 0.5 * this.target.width - 0.5;
        // flip Y, NDC has +Y up, screen has +Y down
        this._verticesBuf[i + 1] = (1 - this._verticesBuf[i + 1]) * 0.5 * this.target.height - 0.5;
      }

      const t4 = control.micros();

      //// backface cull
      let newTrianglesBufCount = 0;
      for (let i = 0; i < this._trianglesBufCount * 3; i += 3) {
        // fetch vertex indices
        const i0 = this._trianglesBuf[i];
        const i1 = this._trianglesBuf[i + 1];
        const i2 = this._trianglesBuf[i + 2];
        // get px coords
        const ax = this._verticesBuf[4 * i0];
        const ay = this._verticesBuf[4 * i0 + 1];
        const bx = this._verticesBuf[4 * i1];
        const by = this._verticesBuf[4 * i1 + 1];
        const cx = this._verticesBuf[4 * i2];
        const cy = this._verticesBuf[4 * i2 + 1];
        // calculate area
        const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        // area = negative means front facing (keep)
        if (area < 0) {
          this._trianglesBuf[3 * newTrianglesBufCount] = i0;
          this._trianglesBuf[3 * newTrianglesBufCount + 1] = i1;
          this._trianglesBuf[3 * newTrianglesBufCount + 2] = i2;
          this._materialsBuf[newTrianglesBufCount] = this._materialsBuf[i / 3];
          newTrianglesBufCount++;
        }
      }
      this._trianglesBufCount = newTrianglesBufCount;

      const t5 = control.micros();

      //// triangle drawing
      for (let i = 0; i < this._trianglesBufCount * 3; i += 3) {
        // fetch vertex indices
        const i0 = this._trianglesBuf[i];
        const i1 = this._trianglesBuf[i + 1];
        const i2 = this._trianglesBuf[i + 2];
        // // get px coords
        // const ax = this._verticesBuf[4 * i0];
        // const ay = this._verticesBuf[4 * i0 + 1];
        // const bx = this._verticesBuf[4 * i1];
        // const by = this._verticesBuf[4 * i1 + 1];
        // const cx = this._verticesBuf[4 * i2];
        // const cy = this._verticesBuf[4 * i2 + 1];
        // get material (flat color for now)
        const c = this._materialsBuf[i / 3];
        //// wireframe
        // this.target.drawLine(ax, ay, bx, by, c);
        // this.target.drawLine(bx, by, cx, cy, c);
        // this.target.drawLine(cx, cy, ax, ay, c);
        //// fill triangle
        this._fillTriangleZ(i0, i1, i2, c);
      }

      const t6 = control.micros();

      return [
        t0, t1, t2, t3, t4, t5, t6
      ]
    }

    // inside when a*x + b*y + c*z + d*w >= 0
    private PLANES = [
      0, 0, 1, 1,   // near: z >= -w
      0, 0, -1, 1,   // far:  z <=  w
    ];

    private _dist(i: number, p: number): number {
      const v = this._verticesBuf, o = 4 * i;
      const q = p * 4;
      return (
        this.PLANES[q] * v[o] +
        this.PLANES[q + 1] * v[o + 1] +
        this.PLANES[q + 2] * v[o + 2] +
        this.PLANES[q + 3] * v[o + 3]
      );
    }

    private _clipLerp(ia: number, ib: number, p: number): number {
      let da = this._dist(ia, p);
      let db = this._dist(ib, p);
      if (da < 0) { // make ia the inside vertex so both neighbours of an edge compute the same point
        const ti = ia; ia = ib; ib = ti;
        const td = da; da = db; db = td;
      }
      const a = 4 * ia;
      const b = 4 * ib;
      const t = da / (da - db);

      const o = 4 * this._verticesBufCount;
      this._verticesBuf[o] = this._verticesBuf[a] + t * (this._verticesBuf[b] - this._verticesBuf[a]);
      this._verticesBuf[o + 1] = this._verticesBuf[a + 1] + t * (this._verticesBuf[b + 1] - this._verticesBuf[a + 1]);
      this._verticesBuf[o + 2] = this._verticesBuf[a + 2] + t * (this._verticesBuf[b + 2] - this._verticesBuf[a + 2]);
      this._verticesBuf[o + 3] = this._verticesBuf[a + 3] + t * (this._verticesBuf[b + 3] - this._verticesBuf[a + 3]);

      return this._verticesBufCount++;
    }

    private _emitTriangle(a: number, b: number, c: number, color: number) {
      const t = this._trianglesBufCount++;
      this._trianglesBuf[3 * t] = a;
      this._trianglesBuf[3 * t + 1] = b;
      this._trianglesBuf[3 * t + 2] = c;
      this._materialsBuf[t] = color;   // materials indexed by triangle number
    }

    private _clipForPlane(p: number) {
      const originalTriangleCount = this._trianglesBufCount;
      for (let i = 0; i < originalTriangleCount; i++) {
        let a = this._trianglesBuf[3 * i];
        let b = this._trianglesBuf[3 * i + 1];
        let c = this._trianglesBuf[3 * i + 2];
        const color = this._materialsBuf[i];

        const inA = this._dist(a, p) >= 0;
        const inB = this._dist(b, p) >= 0;
        const inC = this._dist(c, p) >= 0;
        const inCount = (inA ? 1 : 0) + (inB ? 1 : 0) + (inC ? 1 : 0);

        // handle the four cases of triangles
        // fully behind the near plane, skip
        if (inCount == 0) {
          continue;
        }
        // fully in the screen, easy
        else if (inCount == 3) {
          // add the triangle in completely normally
          this._emitTriangle(a, b, c, color);
        }
        // two points outside, generate a new triangle
        else if (inCount == 1) {
          // rotate so `a` is the one inside. rotations preserve winding.
          if (inB) {
            const oa = a; a = b; b = c; c = oa;          // (a,b,c) -> (b,c,a)
          } else if (inC) {
            const oa = a, ob = b; a = c; b = oa; c = ob; // (a,b,c) -> (c,a,b)
          }
          this._emitTriangle(
            a,
            this._clipLerp(a, b, p),
            this._clipLerp(c, a, p),
            color
          );
        }
        // one point outside, generate two triangles
        else /* if (inCount == 2) */ {
          if (!inA) {
            const oa = a; a = b; b = c; c = oa;
          } else if (!inB) {
            const oa = a, ob = b; a = c; b = oa; c = ob;
          }
          const bc = this._clipLerp(b, c, p);
          const ca = this._clipLerp(c, a, p);
          this._emitTriangle(a, b, bc, color);   // quad a, b, bc, ca
          this._emitTriangle(a, bc, ca, color);  // fanned from a
        }
      }

      // move this pass's output [end, count) down to [0, count - end).
      // dst index is always below src, so copying forward never clobbers unread data.
      const n = this._trianglesBufCount - originalTriangleCount;
      for (let t = 0; t < n; t++) {
        const s = 3 * (originalTriangleCount + t), d = 3 * t;
        this._trianglesBuf[d] = this._trianglesBuf[s];
        this._trianglesBuf[d + 1] = this._trianglesBuf[s + 1];
        this._trianglesBuf[d + 2] = this._trianglesBuf[s + 2];
        this._materialsBuf[t] = this._materialsBuf[originalTriangleCount + t];
      }
      this._trianglesBufCount = n;
    }

    private _fillTriangleZ(i0: number, i1: number, i2: number, color: number) {
      const v = this._verticesBuf;
      // sort the three vertex indices by screen x: a is leftmost, c is rightmost
      let t: number;
      if (v[4 * i1] < v[4 * i0]) { t = i0; i0 = i1; i1 = t; }
      if (v[4 * i2] < v[4 * i1]) { t = i1; i1 = i2; i2 = t; }
      if (v[4 * i1] < v[4 * i0]) { t = i0; i0 = i1; i1 = t; }

      const ax = v[4 * i0], ay = v[4 * i0 + 1], az = v[4 * i0 + 2];
      const bx = v[4 * i1], by = v[4 * i1 + 1], bz = v[4 * i1 + 2];
      const cx = v[4 * i2], cy = v[4 * i2 + 1], cz = v[4 * i2 + 2];

      // depth plane: z(x, y) = az + (x - ax) * dzdx + (y - ay) * dzdy
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (area == 0) return;
      const dzdx = ((bz - az) * (cy - ay) - (cz - az) * (by - ay)) / area;
      const dzdy = ((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / area;

      // edge slopes (dy per column). a zero-width edge is never used, so 0 is a safe placeholder
      const sAC = cx > ax ? (cy - ay) / (cx - ax) : 0; // long edge, spans every column
      const sAB = bx > ax ? (by - ay) / (bx - ax) : 0; // short edge, left part
      const sBC = cx > bx ? (cy - by) / (cx - bx) : 0; // short edge, right part

      const W = this.target.width, H = this.target.height;
      const zb = this._zBuf;
      const xStart = Math.max(Math.ceil(ax), 0);
      const xEnd = Math.min(Math.ceil(cx), W);

      // before the loop, at the clamped start column
      let yLong = ay + (xStart - ax) * sAC;
      let zTop = az + (xStart - ax) * dzdx - ay * dzdy;  // z at (x, y=0)

      for (let x = xStart; x < xEnd; x++) {
        // pick the active short edge without recomputing from a vertex each time
        const yShort = x < bx ? ay + (x - ax) * sAB : by + (x - bx) * sBC;

        let yTop = yLong < yShort ? yLong : yShort;
        let yBot = yLong < yShort ? yShort : yLong;
        let y = Math.ceil(yTop); if (y < 0) y = 0;
        let yEnd = Math.ceil(yBot); if (yEnd > H) yEnd = H;

        let z = zTop + y * dzdy;
        let zi = x * H + y;
        while (y < yEnd) {
          this._pixelsTestedThisFrame ++;
          if (z < zb[zi]) {
            zb[zi] = z;
            this.target.setPixel(x, y, color);
            this._pixelsTouchedThisFrame ++;
          }
          z += dzdy;
          zi++;
          y++;
        }

        yLong += sAC;
        zTop += dzdx;
      }

      // const W = this.target.width, H = this.target.height;
      // const zb = this._zBuf;
      // const xEnd = Math.min(Math.ceil(cx), W);
      // for (let x = Math.max(Math.ceil(ax), 0); x < xEnd; x++) {
      //     const yLong = ay + (x - ax) * sAC;
      //     const yShort = x < bx ? ay + (x - ax) * sAB : by + (x - bx) * sBC;
      //     let y = Math.max(Math.ceil(Math.min(yLong, yShort)), 0);
      //     const yEnd = Math.min(Math.ceil(Math.max(yLong, yShort)), H);

      //     let z = az + (x - ax) * dzdx + (y - ay) * dzdy;
      //     let zi = x * H + y;
      //     while (y < yEnd) {
      //         this._pixelsTestedThisFrame ++;
      //         if (z < zb[zi]) {
      //             zb[zi] = z;
      //             this.target.setPixel(x, y, color);
      //             this._pixelsTouchedThisFrame ++;
      //         }
      //         z += dzdy;
      //         zi++;
      //         y++;
      //     }
      // }
    }
  }
}

class FrameStats {
  private times: number[]
  private capacity: number
  private index: number = 0
  private filled: boolean = false

  constructor(capacity: number = 300) {
    this.capacity = capacity
    this.times = []
    for (let i = 0; i < capacity; i++) this.times.push(0)
  }

  addSample(micros: number) {
    this.times[this.index] = micros
    this.index = (this.index + 1) % this.capacity
    if (this.index === 0) this.filled = true
  }

  private sampleCount(): number {
    return this.filled ? this.capacity : this.index
  }

  private orderedByTime(): number[] {
    const n = this.sampleCount()
    const copy: number[] = []
    for (let i = 0; i < n; i++) copy.push(this.times[i])
    copy.sort((a, b) => b - a) // slowest first
    return copy
  }

  avgFps(): number {
    const n = this.sampleCount()
    let sum = 0
    for (let i = 0; i < n; i++) sum += this.times[i]
    return 1000000 / (sum / n)
  }

  minFps(): number {
    const n = this.sampleCount()
    let maxT = this.times[0]
    for (let i = 1; i < n; i++) if (this.times[i] > maxT) maxT = this.times[i]
    return 1000000 / maxT
  }

  maxFps(): number {
    const n = this.sampleCount()
    let minT = this.times[0]
    for (let i = 1; i < n; i++) if (this.times[i] < minT) minT = this.times[i]
    return 1000000 / minT
  }

  lowFps(percentile: number): number {
    const sorted = this.orderedByTime()
    const count = Math.max(1, Math.round(sorted.length * percentile))
    let sum = 0
    for (let i = 0; i < count; i++) sum += sorted[i]
    return 1000000 / (sum / count)
  }
}

// 8 unique corners, 3 numbers each
// index i occupies slots 3i, 3i+1, 3i+2
const VERTICES = [
  -1, -1, -1,   // 0  back  bottom left
  1, -1, -1,   // 1  back  bottom right
  1, 1, -1,   // 2  back  top    right
  -1, 1, -1,   // 3  back  top    left
  -1, -1, 1,   // 4  front bottom left
  1, -1, 1,   // 5  front bottom right
  1, 1, 1,   // 6  front top    right
  -1, 1, 1    // 7  front top    left
];
// 12 triangles, 3 indices each, CCW from outside
const TRIANGLES = [
  // front  (+Z)
  4, 5, 6,
  4, 6, 7,

  // back   (-Z)
  0, 3, 2,
  0, 2, 1,

  // left   (-X)
  0, 4, 7,
  0, 7, 3,

  // right  (+X)
  1, 2, 6,
  1, 6, 5,

  // top    (+Y)
  3, 7, 6,
  3, 6, 2,

  // bottom (-Y)
  0, 1, 5,
  0, 5, 4
];
// for every triangle, what color is it
const MATERIALS = [
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7
];

const width = scene.screenWidth();
const height = scene.screenHeight();
const aspect = width / height;
const picture = image.create(width, height);
scene.setBackgroundImage(picture);

const cubeMesh = new Testing3D.Mesh()
cubeMesh.vertices = VERTICES;
cubeMesh.triangles = TRIANGLES;
cubeMesh.materials = MATERIALS;

// const cubeModel1 = new Testing3D.Model(cubeMesh);
// cubeModel1.transform.translation = [-1, 0, 0];
// const cubeModel2 = new Testing3D.Model(cubeMesh);
// cubeModel2.transform.translation = [1, 0, 0];

// const modelScene = new Testing3D.Scene();
// modelScene.models.push(cubeModel1);
// modelScene.models.push(cubeModel2);

const CUBE_AMOUNT = 1000;
const modelScene = new Testing3D.Scene();

for (let i = 0; i < CUBE_AMOUNT; i ++) {
  const cubeModel = new Testing3D.Model(cubeMesh);
  cubeModel.transform.translation = [
    randint(-500, 500) / 100,
    randint(-500, 500) / 100,
    randint(-500, 500) / 100,
  ]
  // cubeModel.transform.rotation = [
  //     randint(1, 628) / 100,
  //     randint(1, 628) / 100,
  //     randint(1, 628) / 100
  // ];
  modelScene.models.push(cubeModel);
}

const camera = new Testing3D.Camera([0, 0, 10], [0, 0, 0], aspect);
camera.fovY = 70 * Math.PI / 180;
camera.near = 0.1;
camera.far = 100;

const renderer = new Testing3D.Renderer(picture);

const frameStats = new FrameStats(100);

let statsStr = "";

game.onUpdate(() => {
  // cubeModel1.transform.rotation[0] = game.runtime() / 4000 * Math.PI;
  // cubeModel1.transform.rotation[1] = game.runtime() / 4000 * Math.PI;
  // cubeModel1.transform.rotation[2] = game.runtime() / 4000 * Math.PI;

  // cubeModel2.transform.rotation[0] = game.runtime() / 2000 * -Math.PI;
  // cubeModel2.transform.rotation[1] = game.runtime() / 2000 * -Math.PI;
  // cubeModel2.transform.rotation[2] = game.runtime() / 2000 * -Math.PI;

  for (let i = 0; i < modelScene.models.length; i ++) {
    const m = modelScene.models[i];
    let r = game.runtime() / 1000 * Math.PI;
    if (i % 3 == 0) {
      r /= 4;
    } else if (i % 3 == 1) {
      r /= 2;
    } else /* if (i % 3 == 2) */ {
      r /= 1;
    }
    m.transform.rotation[0] = r;
    m.transform.rotation[1] = r / 2;
    m.transform.rotation[2] = r / 4;
  }

  const stats = renderer.render(modelScene, camera);

  frameStats.addSample(stats.renderTime);

  statsStr = `triangles: ${stats.trianglesRendered} / ${stats.trianglesTouched}\n` +
    `px test: ${stats.pixelsTested}\n` +
    `px touch: ${stats.pixelsTouched}\n` +
    `avg: ${Math.roundWithPrecision(frameStats.avgFps(), 2)} fps\n` +
    `1% low: ${Math.roundWithPrecision(frameStats.lowFps(0.01), 2)} fps\n` +
    `copy: ${stats.timeVertexCopy / 1000} ms\n` +
    `mvc and mirror: ${stats.timeVertexMVCAndMirror / 1000} ms\n` +
    `clip: ${stats.timeVertexClipping / 1000} ms\n` +
    `perspective: ${stats.timeVertexPerspective / 1000} ms\n` +
    `cull: ${stats.timeVertexCull / 1000} ms\n` +
    `draw: ${stats.timeVertexDraw / 1000} ms\n` +
    `total: ${stats.renderTime / 1000} ms\n`;

  renderer.target.print(statsStr, 0, 0, 15);
});
controller.A.onEvent(ControllerButtonEvent.Pressed, () => {
  console.log(statsStr);
});
