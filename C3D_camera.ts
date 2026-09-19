namespace C3D {
  // represents camera frustum to help with culling
  export class Frustum {
    public p: number[];

    public constructor() {
      this.p = [];
      this.p[23] = 0;
      this.p.fill(0);
    }

    public sphereInFrustum(cx: number, cy: number, cz: number, r: number): boolean {
      const planes = this.p;
      for (let p = 0; p < 24; p += 4) {
        if (planes[p] * cx + planes[p + 1] * cy + planes[p + 2] * cz + planes[p + 3] < -r) {
          return false;
        }
      }
      return true;
    }
  }

  // abstract class for perspective and orthographic to share stuff
  export abstract class Camera extends Object3D {
    public near: number;
    public far: number;

    // all four are rebuilt by updateMatrices() — read them, don't assign them
    public readonly projectionMatrix: Mat4;
    // inverse of worldMatrix, with scale stripped out
    public readonly viewMatrix: Mat4;
    public readonly viewProjectionMatrix: Mat4;
    // world space planes of viewProjectionMatrix, for culling
    public readonly frustum: Frustum;

    public viewportWidth: number;
    public viewportHeight: number;

    protected constructor(near: number = 0.1, far: number = 100) {
      super();
      this.near = near;
      this.far = far;
      this.projectionMatrix = new Mat4();
      this.viewMatrix = new Mat4();
      this.viewProjectionMatrix = new Mat4();
      this.frustum = new Frustum();
      this.viewportWidth = 0;
      this.viewportHeight = 0;
      this.name = "Camera";
    }

    // rebuild projectionMatrix from near/far plus whatever the subclass adds.
    // aspect is width / height of the render target
    //
    // `public abstract updateProjection(aspect: number): void` crashes
    // compiler, throw instead
    protected updateProjection(aspect: number): void {
      throw "Camera subclass must override updateProjection";
    }

    // call every frame after updateWorldMatrix() has run from the scene root
    public updateMatrices(viewportWidth: number, viewportHeight: number): void {
      this.viewportWidth = viewportWidth;
      this.viewportHeight = viewportHeight;
      this.updateProjection(viewportHeight !== 0 ? viewportWidth / viewportHeight : 1);
      this.updateView();
      this.viewProjectionMatrix.multiplyAWithB(this.projectionMatrix, this.viewMatrix);
      this.viewProjectionMatrix.extractFrustumPlanes(this.frustum);
    }

    // viewMatrix = inverse(worldMatrix). the inverse of a rigid transform is just a
    // transpose and a negate, which is why this doesn't call invert() — but that
    // shortcut is silently garbage the moment scale is in the matrix, so the basis
    // is normalized first. three sqrt per frame, and it covers inherited scale from
    // e.g. a chase cam parented under a stretched vehicle as much as camera.scale.
    // shear (a rotation below a non-uniform scale) still gets through: normalizing
    // fixes the lengths but cannot make non-orthogonal columns orthogonal
    protected updateView(): void {
      const we = this.worldMatrix.e;
      // column 0 is right, column 1 is up, column 2 is backward (camera looks down -z)
      let m00 = we[0], m01 = we[1], m02 = we[2];
      let m10 = we[4], m11 = we[5], m12 = we[6];
      let m20 = we[8], m21 = we[9], m22 = we[10];
      const tx = we[12], ty = we[13], tz = we[14];

      let l = Math.sqrt(m00 * m00 + m01 * m01 + m02 * m02);
      if (l > 0) {
        l = 1 / l;
        m00 *= l; m01 *= l; m02 *= l;
      }
      l = Math.sqrt(m10 * m10 + m11 * m11 + m12 * m12);
      if (l > 0) {
        l = 1 / l;
        m10 *= l; m11 *= l; m12 *= l;
      }
      l = Math.sqrt(m20 * m20 + m21 * m21 + m22 * m22);
      if (l > 0) {
        l = 1 / l;
        m20 *= l; m21 *= l; m22 *= l;
      }

      // rotation transposed, translation becomes -transpose(R) * t
      const e = this.viewMatrix.e;
      e[0] = m00; e[4] = m01; e[8] = m02;
      e[1] = m10; e[5] = m11; e[9] = m12;
      e[2] = m20; e[6] = m21; e[10] = m22;
      e[3] = 0; e[7] = 0; e[11] = 0;
      e[12] = -(m00 * tx + m01 * ty + m02 * tz);
      e[13] = -(m10 * tx + m11 * ty + m12 * tz);
      e[14] = -(m20 * tx + m21 * ty + m22 * tz);
      e[15] = 1;
    }

    // world position -> pixel in the viewport updateMatrices() was last given, for
    // HUD anchors. out.z comes back as NDC depth: anything outside [-1, 1] is past
    // near/far or behind the camera, so test it before trusting out.x / out.y
    public project(worldPos: Vec3, out: Vec3): Vec3 {
      const e = this.viewProjectionMatrix.e;
      const x = worldPos.x, y = worldPos.y, z = worldPos.z;
      const w = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (w === 0) {
        // exactly on the eye plane, nothing sensible to divide by. z of 2 reads as
        // "not visible" under the rule above
        return out.set(0, 0, 2);
      }
      const invW = 1 / w;
      const ndcX = (e[0] * x + e[4] * y + e[8] * z + e[12]) * invW;
      const ndcY = (e[1] * x + e[5] * y + e[9] * z + e[13]) * invW;
      // same mapping the rasterizer uses, pixel centres land on half integers
      out.x = (ndcX + 1) * 0.5 * this.viewportWidth - 0.5;
      out.y = (1 - ndcY) * 0.5 * this.viewportHeight - 0.5;
      out.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * invW;
      return out;
    }

    private _invTmp: Mat4;

    // NDC (x and y in [-1, 1], z of -1 is the near plane and +1 the far) -> world.
    // a screen pick becomes a ray with two calls: unproject(nx, ny, -1, a) for the
    // origin and unproject(nx, ny, 1, b) for a point on it, direction is b - a.
    // inverts the full view projection every call, so keep it out of loops
    public unproject(ndcX: number, ndcY: number, ndcZ: number, out: Vec3): Vec3 {
      if (!this._invTmp) this._invTmp = new Mat4();
      this._invTmp.copy(this.viewProjectionMatrix).invert();
      out.set(ndcX, ndcY, ndcZ);
      // applyMat4 does the perspective divide
      return out.applyMat4(this._invTmp);
    }
  }

  export class PerspectiveCamera extends Camera {
    public fovY: number;  // radians
    // 0 means "use the render target's aspect", which is the normal case and the
    // one that keeps the viewport as the single source of truth. set it non-zero
    // only to pin a shape deliberately, e.g. a square minimap camera
    public aspect: number;

    public constructor(fovDegrees: number = 70, near: number = 0.1, far: number = 100) {
      super(near, far);
      this.fovY = fovDegrees * Math.PI / 180;
      this.aspect = 0;
      this.name = "PerspectiveCamera";
    }

    // the aspect updateProjection would use right now: the explicit override if
    // there is one, otherwise whatever viewport updateMatrices was last given.
    // 1 before the first updateMatrices, so fovX is never a divide by zero
    public getAspect(): number {
      if (this.aspect > 0) return this.aspect;
      if (this.viewportHeight !== 0) return this.viewportWidth / this.viewportHeight;
      return 1;
    }

    public updateProjection(aspect: number): void {
      this.projectionMatrix.setPerspective(this.fovY, this.aspect > 0 ? this.aspect : aspect, this.near, this.far);
    }

    // horizontal fov, in radians, derived from fovY and the current aspect — the
    // projection stores only the vertical one. reading it before the first
    // updateMatrices on a camera with aspect 0 assumes a square viewport
    public get fovX(): number {
      return 2 * Math.atan(Math.tan(this.fovY / 2) * this.getAspect());
    }

    // writing fovX writes fovY instead, so a later aspect change keeps the
    // horizontal angle only if the aspect has not moved. set it after the first
    // updateMatrices, or alongside an explicit aspect, or the square-viewport
    // assumption above silently picks the wrong fovY
    public set fovX(v: number) {
      this.fovY = 2 * Math.atan(Math.tan(v / 2) / this.getAspect());
    }

    // 35mm full frame: a 24mm tall gate, so a 50mm lens lands at fovY ~= 27 deg
    // and the numbers match what a camera app would show. vertical gate, not
    // three.js's horizontal filmGauge, because fovY is what this class stores
    private static get _filmHeightMM(): number { return 24; }

    public setFocalLength(mm: number): void {
      this.fovY = 2 * Math.atan(PerspectiveCamera._filmHeightMM / (2 * mm));
    }

    public getFocalLength(): number {
      return PerspectiveCamera._filmHeightMM / (2 * Math.tan(this.fovY / 2));
    }
  }

  export class OrthographicCamera extends Camera {
    // world units of vertical view — the one knob. `camera.height *= 0.9` is a
    // zoom, and it is the only field that differs from PerspectiveCamera in user
    // code, so a camera swap is a one line change
    public height: number;

    // 0 means "use the render target's aspect", exactly as on PerspectiveCamera.
    // set it non-zero only to pin a shape deliberately, e.g. a square minimap
    public aspect: number;

    // near defaults negative because ortho has no eye point to divide by: the
    // volume is a box, so geometry behind the camera's origin is legitimately
    // visible and -100..100 is the usual "just show me everything" slab
    public constructor(height: number = 10, near: number = -100, far: number = 100) {
      super(near, far);
      this.height = height;
      this.aspect = 0;
      this.name = "OrthographicCamera";
    }

    // the aspect updateProjection would use right now: the explicit override if
    // there is one, otherwise whatever viewport updateMatrices was last given.
    // 1 before the first updateMatrices, so the horizontal bounds are never NaN
    public getAspect(): number {
      if (this.aspect > 0) return this.aspect;
      if (this.viewportHeight !== 0) return this.viewportWidth / this.viewportHeight;
      return 1;
    }

    public updateProjection(aspect: number): void {
      const a = this.aspect > 0 ? this.aspect : aspect;
      const t = this.height * 0.5;
      const r = t * a;
      this.projectionMatrix.setOrthographic(-r, r, -t, t, this.near, this.far);
    }

    // the four GL bounds, derived rather than stored, so height and aspect stay
    // the single source of truth. read-only for the same reason: writing `right`
    // would have to decide whether to move height or aspect, and both answers are
    // surprising. the box is always centred on the camera — an off-centre volume
    // (a shadow map fitted to a light's cascade, say) wants setOrthographic directly
    public get top(): number { return this.height * 0.5; }

    public get bottom(): number { return -this.height * 0.5; }

    public get right(): number { return this.height * 0.5 * this.getAspect(); }

    public get left(): number { return -this.height * 0.5 * this.getAspect(); }

    // world units of horizontal view, the counterpart to PerspectiveCamera.fovX
    // and asymmetric in the same way: there is no storage behind it, so an aspect
    // change preserves height, not width. writing it before the first
    // updateMatrices on a camera with aspect 0 bakes a square-viewport assumption
    public get width(): number { return this.height * this.getAspect(); }

    public set width(v: number) { this.height = v / this.getAspect(); }

    // fit the vertical view to a world-space sphere, for a "frame this object"
    // shot or a level-select orbit. margin is a multiplier, 1.1 leaves 10% air.
    // only sets the vertical extent: on a wide viewport the sphere fits with room
    // to spare horizontally, on a tall one it fits exactly
    public frameSphere(radius: number, margin: number = 1.1): void {
      this.height = 2 * radius * margin;
    }
  }
}
