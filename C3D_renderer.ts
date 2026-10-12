namespace C3D {
  export class Scene extends Object3D {
    public background: number = 0;
    // add image, ambient, fog later

    // pxt needs an explicit constructor for field initializers
    public constructor() {
      super();
    }
  }

  export class Renderer {
    private _target: Image;

    private _zBuf: number[] = [];
    private _frameBuf: Buffer;

    // scratch vars for every model render
    private _mvpMat4: Mat4;
    // material data
    private _matType: number;
    private _matSingleColor: number;
    private _matFaceColors: number[]
    private _matTexture: Image;

    public constructor(target: Image) {
      this._target = target;
      const w = this._target.width;
      const h = this._target.height;
      // set up z buffer, this works
      this._zBuf[w * h - 1] = 2;
      this._zBuf.fill(2);
      // set up framebuffer
      this._frameBuf = Buffer.create(w * h);
      // set up some more scratch vars
      this._mvpMat4 = new Mat4();
    }

    // for now, breaking code up into functions, even if they are "expensive"
    // they are only at worst per model, if actually bad will inline later
    // get is a static helper for something simple
    // fetch will assign results to class fields, for more complex things
    private static _getModelsFromScene(scene: Scene): Model[] {
      // traverse the scene tree for models
      // order doesn't matter because of z buffer
      const stack: Object3D[] = [scene];
      const models: Model[] = [];
      while (stack.length > 0) {
        const obj = stack.pop();
        if (!obj.visible) {
          continue;
        }
        if (obj instanceof Model) {
          models.push(obj);
        }
        for (const child of obj.children) {
          stack.push(child);
        }
      }
      return models;
    }

    private _fetchMaterials(model: Model) {
      if (model.material instanceof SingleColorMaterial) {
        this._matType = 0;
        this._matSingleColor = (model.material as SingleColorMaterial).color;
      } else if (model.material instanceof FaceColorMaterial) {
        this._matType = 1;
        this._matFaceColors = (model.material as FaceColorMaterial).colors;
        if (this._matFaceColors.length != model.mesh.indices.length / 3) {
          throw (
            "FaceColorMaterial colors length does not match mesh " +
            "indices length"
          );
        }
      } else if (model.material instanceof TextureMaterial) {
        this._matType = 2;
        this._matTexture = (model.material as TextureMaterial).texture;
        throw "TextureMaterial not implemented yet";
      } else {
        throw "Unknown material type";
      }
    }

    private static _modelDefinitelyOutsideFrustum(model: Model,
                                                  camera: Camera): boolean {
      const we = model.worldMatrix.e;
      const r = model.mesh.boundingRadius *
        model.worldMatrix.maxScaleOnAxis();
      return !camera.frustum.sphereInFrustum(we[12], we[13], we[14], r);
    }

    private static _getMaterialCull(model: Model): number {
      let cullType: number;
      switch (model.material.cull) {
        case CullMode.None: {
          cullType = 0;
          break;
        }
        case CullMode.Back: {
          cullType = 1;
          break;
        }
        case CullMode.Front: {
          cullType = -1;
          break;
        }
        default: {
          throw "Unknown cull mode";
        }
      }
      if (model.worldMatrix.determinant3() < 0) {
        cullType *= -1;
      }
      return cullType;
    }

    public render(scene: Scene, camera: Camera) {
      // you'll see some allocations in this function, but they are dwarfed by
      // actual triangle and pixel work, optimize them later
      //// frame setup
      // update matrices
      const width = this._target.width;
      const height = this._target.height;
      scene.updateWorldMatrix();
      camera.updateMatrices(width, height);
      // clear
      this._target.fill(scene.background);
      this._frameBuf.fill(scene.background);
      this._zBuf.fill(2);  // infinitely far away
      //// collect models
      const models = Renderer._getModelsFromScene(scene);
      for (const model of models) {
        //// setup
        const positions = model.mesh.positions;
        const indices = model.mesh.indices;
        // gather and validate material type
        this._fetchMaterials(model); // result stored on class fields
        // frustum cull
        if (Renderer._modelDefinitelyOutsideFrustum(model, camera)) {
          continue;
        }
        // build mvp
        this._mvpMat4.multiplyAWithB(camera.viewProjectionMatrix, model.worldMatrix);
        const e = this._mvpMat4.e;
        const m00 = e[0], m10 = e[1], m20 = e[2], m30 = e[3];
        const m01 = e[4], m11 = e[5], m21 = e[6], m31 = e[7];
        const m02 = e[8], m12 = e[9], m22 = e[10], m32 = e[11];
        const m03 = e[12], m13 = e[13], m23 = e[14], m33 = e[15];
        // determine cull and mirror
        const cullType = Renderer._getMaterialCull(model);
        // reset per-model output buffers
        const vertexBuf: number[] = []; // x, y, z, w
        const indexBuf: number[] = []; // holds triangles, three indices into vertexBuf
        const clipCodeBuf: number[] = [];
        const faceBuf: number[] = []; // holds original triangle indices for materials data
        let vertexBufCount = 0;
        let indexBufCount = 0;
        let faceBufCount = 0;
        let clipCodeBufCount = 0;
        //// vertex transform
        const vertexStride = 4;  // x, y, z, w
        let vertexCount = (positions.length / 3) | 0;
        for (let i = 0; i < vertexCount; i ++) {
          const x = positions[i * 3];
          const y = positions[i * 3 + 1];
          const z = positions[i * 3 + 2];
          // clip
          const cx = m00 * x + m01 * y + m02 * z + m03;
          const cy = m10 * x + m11 * y + m12 * z + m13;
          const cz = m20 * x + m21 * y + m22 * z + m23;
          const cw = m30 * x + m31 * y + m32 * z + m33;
          const s = i * vertexStride;
          vertexBuf[s] = cx;
          vertexBuf[s + 1] = cy;
          vertexBuf[s + 2] = cz;
          vertexBuf[s + 3] = cw;
          // set clip bits
          let clipCode = 0;
          // clipCode |= ClipPlane.Left * +(cx < -cw); is just as "slow"
          if (cx < -cw) {
            clipCode |= ClipPlane.Left;
          }
          if (cx > cw) {
            clipCode |= ClipPlane.Right;
          }
          if (cy < -cw) {
            clipCode |= ClipPlane.Bottom;
          }
          if (cy > cw) {
            clipCode |= ClipPlane.Top;
          }
          if (cz < -cw) {
            clipCode |= ClipPlane.Near;
          }
          if (cz > cw) {
            clipCode |= ClipPlane.Far;
          }
          clipCodeBuf[i] = clipCode;
        }
        vertexBufCount = vertexCount * vertexStride;
        clipCodeBufCount = vertexCount;
        //// triangle clipping
        let triangleCount = (indices.length / 3) | 0;
        for (let i = 0; i < triangleCount; i ++) {
          const v0 = indices[i * 3];
          const v1 = indices[i * 3 + 1];
          const v2 = indices[i * 3 + 2];
          const c0 = clipCodeBuf[v0];
          const c1 = clipCodeBuf[v1];
          const c2 = clipCodeBuf[v2];
          // trivial reject
          if ((c0 & c1 & c2) != 0) {
            // in the original code we don't emit the triangle
          }
          // trivial accept
          else if ((c0 | c1 | c2) == 0) {
            // in the original code we emit the full triangle
            indexBuf[indexBufCount++] = v0;
            indexBuf[indexBufCount++] = v1;
            indexBuf[indexBufCount++] = v2;
            faceBuf[faceBufCount++] = i;
          }
          // partial clip
          else {
            let polyA: number[] = [];
            for (const v of [v0, v1, v2]) {
              for (let j = 0; j < vertexStride; j ++) {
                polyA.push(vertexBuf[v * vertexStride + j]);
              }
            }
            let polyACount = 3;
            let polyB: number[] = [];
            let polyBCount = 0;
            const planesToClip = c0 | c1 | c2;
            let prevOff: number;
            let prevD;
            let isDead = false;
            for (let p = 0; p < 6; p ++) {
              const plane = 1 << p;
              if ((planesToClip & plane) == 0) {
                continue;
              }
              const planeOffset= p * 4;
              const a = PLANES[planeOffset];
              const b = PLANES[planeOffset + 1];
              const c = PLANES[planeOffset + 2];
              const d = PLANES[planeOffset + 3];
              prevOff = (polyACount - 1) * vertexStride;
              prevD = a*polyA[prevOff] + b*polyA[prevOff + 1] +
                c*polyA[prevOff + 2] + d*polyA[prevOff + 3];
              polyBCount = 0;
              for (let j = 0; j < polyACount; j ++) {
                const currOff = j * vertexStride;
                const currD = a*polyA[currOff] + b*polyA[currOff + 1] +
                  c*polyA[currOff + 2] + d*polyA[currOff + 3];
                if (currD >= 0) {  // if inside
                  if (prevD < 0) { // if prev outside
                    // emit intersection of curr and prev into polyB
                    const t = currD / (currD - prevD);
                    for (let k = 0; k < vertexStride; k ++) {
                      polyB[polyBCount * vertexStride + k] =
                        polyA[currOff + k] +
                        t * (polyA[prevOff + k] - polyA[currOff + k]);
                    }
                    polyBCount ++;
                  }
                  // emit cur into polyB
                  for (let k = 0; k < vertexStride; k ++) {
                    polyB[polyBCount * vertexStride + k] = polyA[currOff + k];
                  }
                  polyBCount ++;
                } else if (prevD >= 0) { // if prev inside
                  // emit intersection of prev and curr into polyB
                  const t = prevD / (prevD - currD);
                  for (let k = 0; k < vertexStride; k ++) {
                    polyB[polyBCount * vertexStride + k] =
                      polyA[prevOff + k] +
                      t * (polyA[currOff + k] - polyA[prevOff + k]);
                  }
                  polyBCount ++;
                }
                prevOff = currOff;
                prevD = currD;
              }
              // swap polyA and polyB and their counts
              const tmp = polyA;
              polyA = polyB;
              polyB = tmp;
              const tmpCount = polyACount;
              polyACount = polyBCount;
              polyBCount = tmpCount;
              // if count < 3, triangle is fully clipped, don't emit
              if (polyACount < 3) {
                isDead = true;
                break;
              }
            }
            if (isDead) {
              continue;
            }
            // append polyA verts to vertexBuf starting at vertexBufCount, base index
            const base = vertexBufCount / vertexStride;
            for (let j = 0; j < polyACount * vertexStride; j ++) {
              vertexBuf[vertexBufCount++] = polyA[j];
            }
            // fan out
            for (let j = 1; j < polyACount - 1; j ++) {
              indexBuf[indexBufCount++] = base;
              indexBuf[indexBufCount++] = base + j;
              indexBuf[indexBufCount++] = base + j + 1;
              faceBuf[faceBufCount++] = i;
            }
          }
        }
        //// projection
        // project vertices
        vertexCount = (vertexBufCount / vertexStride) | 0;
        const halfWidth = 0.5 * width;
        const halfWidthSub = halfWidth - 0.5;
        const halfHeight = 0.5 * height;
        const halfHeightSub = halfHeight - 0.5;
        for (let i = 0; i < vertexCount; i ++) {
          const ii = i * vertexStride;
          const w = vertexBuf[ii + 3];
          if (w <= 0) {
            continue; // it'll never be referenced
          }
          const invW = 1 / w;
          // x * invW * halfW + (halfW - 0.5)
          vertexBuf[ii] = (vertexBuf[ii] * invW * halfWidth) + halfWidthSub;
          // -y * invW * halfH + (halfH - 0.5) (y flip)
          vertexBuf[ii + 1] = (-vertexBuf[ii + 1] * invW * halfHeight) + halfHeightSub;
          // z * invW (NDC Z)
          vertexBuf[ii + 2] = vertexBuf[ii + 2] * invW;
          // invW (for perspective correct UVs)
          vertexBuf[ii + 3] = invW;
        }
        triangleCount = (indexBufCount / 3) | 0;
        //// rasterize
        for (let i = 0; i < triangleCount; i++) {
          const i0 = indexBuf[i * 3];
          const i1 = indexBuf[i * 3 + 1];
          const i2 = indexBuf[i * 3 + 2];
          const v0x = vertexBuf[i0 * vertexStride];
          const v0y = vertexBuf[i0 * vertexStride + 1];
          // const v0z = vertexBuf[i0 * vertexStride + 2];
          const v1x = vertexBuf[i1 * vertexStride];
          const v1y = vertexBuf[i1 * vertexStride + 1];
          // const v1z = vertexBuf[i1 * vertexStride + 2];
          const v2x = vertexBuf[i2 * vertexStride];
          const v2y = vertexBuf[i2 * vertexStride + 1];
          // const v2z = vertexBuf[i2 * vertexStride + 2];
          // cross product of edges
          // a is the vector from v0 to v1
          const ax = v1x - v0x;
          const ay = v1y - v0y;
          // const az = v1z - v0z;
          // b is the vector from v0 to v2
          const bx = v2x - v0x;
          const by = v2y - v0y;
          // const bz = v2z - v0z;
          // get the z component of the cross product (twice the area of the
          // triangle)
          // negative when triangle facing camera AND triangle is wound
          // counter-clockwise in screen space
          // equal to 0 when triangle is degenerate
          const area2 = ax * by - bx * ay;
          // cullType is 1 for backface cull (keep front)
          // cullType is -1 for frontface cull (keep back)
          if (area2 == 0 || (cullType != 0 && area2 * cullType > 0)) {
            // cull this triangle
            continue;
          }
          // rasterize the triangle
          // // test wireframe
          // this._target.drawLine(v0x, v0y, v1x, v1y, 1);
          // this._target.drawLine(v1x, v1y, v2x, v2y, 1);
          // this._target.drawLine(v2x, v2y, v0x, v0y, 1);
          // // test fillTriangle
          // this._target.fillTriangle(
          //   v0x, v0y, v1x, v1y, v2x, v2y,
          //   this._matType == 0 ? this._matSingleColor :
          //   this._matType == 1 ? this._matFaceColors[faceBuf[i]] :
          //   1 // default color for unimplemented TextureMaterial
          // );
        }
      }
    }
  }

  // ClipPlane and PLANES must be kept in the same order
  enum ClipPlane {
    Near = 0b1,
    Far = 0b10,
    Left = 0b100,
    Right = 0b1000,
    Bottom = 0b10000,
    Top = 0b100000
  }

  const PLANES = [
    0, 0, 1, 1, // near first
    0, 0, -1, 1, // far
    1, 0, 0, 1, // left
    -1, 0, 0, 1, // right
    0, 1, 0, 1, // bottom
    0, -1, 0, 1 // top
  ]
}
