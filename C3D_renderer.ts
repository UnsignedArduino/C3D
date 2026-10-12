namespace C3D {
  export class Scene extends Object3D {
    public background: number = 0;
    // add image, ambient, fog later

    // pxt needs an explicit constructor for field initializers
    public constructor() {
      super();
    }
  }

  export class RendererStats {
    // all times are in micros
    public timeElapsed = 0;
    public timeModelCollect = 0;
    public timeModelSetupAndMats = 0;
    public timeModelMVPs = 0;
    public timeModelVertexTrans = 0;
    public timeModelTriangleClip = 0;
    public timeModelProjection = 0;
    public timeModelRasterize = 0;

    public modelsVisible = 0;
    public modelsRendered = 0;
    public modelsCulled = 0;

    // per frame, these two always hold:
    //   trianglesInput = trianglesTrivialReject + trianglesTrivialAccept + trianglesClipped
    //   trianglesTrivialAccept + trianglesClipOutput = trianglesCulled + trianglesRasterized
    // trianglesInput only counts models that passed frustum culling
    public trianglesInput = 0;
    public trianglesTrivialReject = 0;
    public trianglesTrivialAccept = 0;
    public trianglesClipped = 0;  // sent to the clipper
    public trianglesClippedAway = 0;  // sent to the clipper, nothing left
    public trianglesClipOutput = 0;  // fan triangles the clipper emitted

    public trianglesCulled = 0;
    public trianglesRasterized = 0;
    public pixelsTested = 0;
    public pixelsWritten = 0;

    public constructor() {}
  }

  export class Renderer {
    private _target: Image;

    private _zBuf: number[] = [];
    private _frameBuf: Buffer;

    // scratch vars for every model render
    private _mvpMat4: Mat4;
    private _cullType: number;
    // bufs
    private _modelPositions: number[];
    private _vertexBuf: number[] = []; // x, y, z, w
    private _vertexBufCount: number = 0;

    private _vertexCount: number = 0;
    private _triangleCount: number = 0;

    private _modelIndices: number[] = [];
    private _indicesBuf: number[] = []; // holds triangles, three indices into vertexBuf
    private _indicesBufCount: number = 0;

    private _faceBuf: number[] = []; // holds original triangle indices for materials data
    private _faceBufCount: number = 0;

    private _clipCodeBuf: number[] = []; // holds clip codes for each vertex
    private _clipCodeBufCount: number = 0;
    // material data
    private _matType: number;
    private _matSingleColor: number;
    private _matFaceColors: number[]
    private _matTexture: Image;

    public readonly stats: RendererStats;

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
      this.stats = new RendererStats();
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

    private _fetchMaterialCull(model: Model) {
      switch (model.material.cull) {
        case CullMode.None: {
          this._cullType = 0;
          break;
        }
        case CullMode.Back: {
          this._cullType = 1;
          break;
        }
        case CullMode.Front: {
          this._cullType = -1;
          break;
        }
        default: {
          throw "Unknown cull mode";
        }
      }
      if (model.worldMatrix.determinant3() < 0) {
        this._cullType *= -1;
      }
    }

    private _vertexTransformAndClip() {
      const positions = this._modelPositions;
      const vertexBuf = this._vertexBuf;
      const clipCodeBuf = this._clipCodeBuf;
      const e = this._mvpMat4.e;
      const m00 = e[0], m10 = e[1], m20 = e[2], m30 = e[3];
      const m01 = e[4], m11 = e[5], m21 = e[6], m31 = e[7];
      const m02 = e[8], m12 = e[9], m22 = e[10], m32 = e[11];
      const m03 = e[12], m13 = e[13], m23 = e[14], m33 = e[15];
      const vertexCount = this._vertexCount;
      for (let i = 0; i < vertexCount; i ++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        // clip
        const cx = m00 * x + m01 * y + m02 * z + m03;
        const cy = m10 * x + m11 * y + m12 * z + m13;
        const cz = m20 * x + m21 * y + m22 * z + m23;
        const cw = m30 * x + m31 * y + m32 * z + m33;
        const s = i * VERTEX_STRIDE;
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
      this._vertexBufCount = vertexCount * VERTEX_STRIDE;
      this._clipCodeBufCount = vertexCount;
    }
    
    private _triangleClipAndFan() {
      let trianglesInput = 0;
      let trianglesTrivialReject = 0;
      let trianglesTrivialAccept = 0;
      let trianglesClipped = 0;
      let trianglesClippedAway = 0;
      let trianglesClipOutput = 0;

      const indices = this._modelIndices;
      const vertexBuf = this._vertexBuf;
      const clipCodeBuf = this._clipCodeBuf;
      const indicesBuf = this._indicesBuf;
      const faceBuf = this._faceBuf;
      let indicesBufCount = 0;
      let faceBufCount = 0;
      let vertexBufCount = this._vertexBufCount;
      const triangleCount = this._triangleCount;
      trianglesInput += triangleCount;
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
          trianglesTrivialReject ++;
        }
        // trivial accept
        else if ((c0 | c1 | c2) == 0) {
          // in the original code we emit the full triangle
          indicesBuf[indicesBufCount++] = v0;
          indicesBuf[indicesBufCount++] = v1;
          indicesBuf[indicesBufCount++] = v2;
          faceBuf[faceBufCount++] = i;
          trianglesTrivialAccept ++;
        }
        // partial clip
        else {
          trianglesClipped ++;
          let polyA: number[] = [];
          for (const v of [v0, v1, v2]) {
            for (let j = 0; j < VERTEX_STRIDE; j ++) {
              polyA.push(vertexBuf[v * VERTEX_STRIDE + j]);
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
            prevOff = (polyACount - 1) * VERTEX_STRIDE;
            prevD = a*polyA[prevOff] + b*polyA[prevOff + 1] +
              c*polyA[prevOff + 2] + d*polyA[prevOff + 3];
            polyBCount = 0;
            for (let j = 0; j < polyACount; j ++) {
              const currOff = j * VERTEX_STRIDE;
              const currD = a*polyA[currOff] + b*polyA[currOff + 1] +
                c*polyA[currOff + 2] + d*polyA[currOff + 3];
              if (currD >= 0) {  // if inside
                if (prevD < 0) { // if prev outside
                  // emit intersection of curr and prev into polyB
                  const t = currD / (currD - prevD);
                  for (let k = 0; k < VERTEX_STRIDE; k ++) {
                    polyB[polyBCount * VERTEX_STRIDE + k] =
                      polyA[currOff + k] +
                      t * (polyA[prevOff + k] - polyA[currOff + k]);
                  }
                  polyBCount ++;
                }
                // emit cur into polyB
                for (let k = 0; k < VERTEX_STRIDE; k ++) {
                  polyB[polyBCount * VERTEX_STRIDE + k] = polyA[currOff + k];
                }
                polyBCount ++;
              } else if (prevD >= 0) { // if prev inside
                // emit intersection of prev and curr into polyB
                const t = prevD / (prevD - currD);
                for (let k = 0; k < VERTEX_STRIDE; k ++) {
                  polyB[polyBCount * VERTEX_STRIDE + k] =
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
            trianglesClippedAway ++;
            continue;
          }
          // append polyA verts to vertexBuf starting at vertexBufCount, base index
          const base = vertexBufCount / VERTEX_STRIDE;
          for (let j = 0; j < polyACount * VERTEX_STRIDE; j ++) {
            vertexBuf[vertexBufCount++] = polyA[j];
          }
          // fan out
          for (let j = 1; j < polyACount - 1; j ++) {
            indicesBuf[indicesBufCount++] = base;
            indicesBuf[indicesBufCount++] = base + j;
            indicesBuf[indicesBufCount++] = base + j + 1;
            faceBuf[faceBufCount++] = i;
          }
          trianglesClipOutput += polyACount - 2;
        }
      }
      this._indicesBufCount = indicesBufCount;
      this._faceBufCount = faceBufCount;
      this._vertexBufCount = vertexBufCount;

      this.stats.trianglesInput += trianglesInput;
      this.stats.trianglesTrivialReject += trianglesTrivialReject;
      this.stats.trianglesTrivialAccept += trianglesTrivialAccept;
      this.stats.trianglesClipped += trianglesClipped;
      this.stats.trianglesClippedAway += trianglesClippedAway;
      this.stats.trianglesClipOutput += trianglesClipOutput;
    }

    private _projection() {
      const vertexCount = this._vertexCount;
      const vertexBuf = this._vertexBuf;
      const halfWidth = 0.5 * this._target.width;
      const halfWidthSub = halfWidth - 0.5;
      const halfHeight = 0.5 * this._target.height;
      const halfHeightSub = halfHeight - 0.5;
      for (let i = 0; i < vertexCount; i ++) {
        const ii = i * VERTEX_STRIDE;
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
    }

    private _rasterize() {
      let trianglesCulled = 0;
      let trianglesRasterized = 0;
      let pixelsTested = 0;
      let pixelsWritten = 0;

      const indicesBuf = this._indicesBuf;
      const vertexBuf = this._vertexBuf;
      const faceBuf = this._faceBuf;
      const zBuf = this._zBuf;
      const frameBuf = this._frameBuf;
      const triangleCount = this._triangleCount;
      const cullType = this._cullType;
      const width = this._target.width;
      const height = this._target.height;
      for (let i = 0; i < triangleCount; i++) {
        let i0 = indicesBuf[i * 3];
        let i1 = indicesBuf[i * 3 + 1];
        let i2 = indicesBuf[i * 3 + 2];
        let v0x = vertexBuf[i0 * VERTEX_STRIDE];
        let v0y = vertexBuf[i0 * VERTEX_STRIDE + 1];
        let v0z = vertexBuf[i0 * VERTEX_STRIDE + 2];
        let v1x = vertexBuf[i1 * VERTEX_STRIDE];
        let v1y = vertexBuf[i1 * VERTEX_STRIDE + 1];
        let v1z = vertexBuf[i1 * VERTEX_STRIDE + 2];
        let v2x = vertexBuf[i2 * VERTEX_STRIDE];
        let v2y = vertexBuf[i2 * VERTEX_STRIDE + 1];
        let v2z = vertexBuf[i2 * VERTEX_STRIDE + 2];
        // cross product of edges
        // a is the vector from v0 to v1
        let ax = v1x - v0x;
        let ay = v1y - v0y;
        let az = v1z - v0z;
        // b is the vector from v0 to v2
        let bx = v2x - v0x;
        let by = v2y - v0y;
        let bz = v2z - v0z;
        // get the z component of the cross product (twice the area of the
        // triangle)
        // negative when triangle facing camera AND triangle is wound
        // counter-clockwise in screen space
        // equal to 0 when triangle is degenerate
        let area2 = ax * by - bx * ay;
        // cullType is 1 for backface cull (keep front)
        // cullType is -1 for frontface cull (keep back)
        if (area2 == 0 || (cullType != 0 && area2 * cullType > 0)) {
          // cull this triangle
          trianglesCulled ++;
          continue;
        }
        trianglesRasterized ++;
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
        // sort indices by x, so i0 is left, i1 is middle, i2 is right
        if (vertexBuf[i0 * VERTEX_STRIDE] > vertexBuf[i1 * VERTEX_STRIDE]) {
          const tmp = i0;
          i0 = i1;
          i1 = tmp;
        }
        if (vertexBuf[i1 * VERTEX_STRIDE] > vertexBuf[i2 * VERTEX_STRIDE]) {
          const tmp = i1;
          i1 = i2;
          i2 = tmp;
        }
        if (vertexBuf[i0 * VERTEX_STRIDE] > vertexBuf[i1 * VERTEX_STRIDE]) {
          const tmp = i0;
          i0 = i1;
          i1 = tmp;
        }
        v0x = vertexBuf[i0 * VERTEX_STRIDE];
        v0y = vertexBuf[i0 * VERTEX_STRIDE + 1];
        v0z = vertexBuf[i0 * VERTEX_STRIDE + 2];
        v1x = vertexBuf[i1 * VERTEX_STRIDE];
        v1y = vertexBuf[i1 * VERTEX_STRIDE + 1];
        v1z = vertexBuf[i1 * VERTEX_STRIDE + 2];
        v2x = vertexBuf[i2 * VERTEX_STRIDE];
        v2y = vertexBuf[i2 * VERTEX_STRIDE + 1];
        v2z = vertexBuf[i2 * VERTEX_STRIDE + 2];
        // a is the vector from v0 to v1
        ax = v1x - v0x;
        ay = v1y - v0y;
        az = v1z - v0z;
        // b is the vector from v0 to v2
        bx = v2x - v0x;
        by = v2y - v0y;
        bz = v2z - v0z;
        area2 = ax * by - bx * ay;
        const dzdx = (az * by - ay * bz) / area2;
        const dzdy = (ax * bz - az * bx) / area2;

        const startX = Math.ceil(v0x);
        const middleX = Math.ceil(v1x);
        const endX = Math.ceil(v2x);

        const start = startX < 0 ? 0 : startX;
        const middle = middleX < 0 ? 0 : middleX > width ? width : middleX;
        const end = endX > width ? width : endX;

        const longEdgeDydx = (v2y - v0y) / (v2x - v0x);
        const shortEdgeFirstDydx = (v1y - v0y) / (v1x - v0x);
        const shortEdgeSecondDydx = (v2y - v1y) / (v2x - v1x);
        let shortEdgeDydx = shortEdgeFirstDydx;
        let shortEdgeAnchorX = v0x;
        let shortEdgeAnchorY = v0y;
        let singleOrFaceColor = 0;  // empty for texture
        if (this._matType == 0) {
          singleOrFaceColor = this._matSingleColor;
        } else if (this._matType == 1) {
          singleOrFaceColor = this._matFaceColors[faceBuf[i]];
        } else {
          throw "TextureMaterial not implemented yet";
        }
        for (let x = start; x < end; x++) {
          const longEdgeY = v0y + (x - v0x) * longEdgeDydx;
          if (x == middle) {
            // >= works but == means happens once
            shortEdgeDydx = shortEdgeSecondDydx;
            shortEdgeAnchorX = v1x;
            shortEdgeAnchorY = v1y;
          }
          const shortEdgeY = shortEdgeAnchorY + (x - shortEdgeAnchorX) * shortEdgeDydx;
          const topY = longEdgeY < shortEdgeY ? longEdgeY : shortEdgeY;
          const bottomY = longEdgeY > shortEdgeY ? longEdgeY : shortEdgeY;
          const yStartValue = Math.ceil(topY);
          const yStart = yStartValue < 0 ? 0 : yStartValue;
          const yEndValue = Math.ceil(bottomY);
          const yEnd = yEndValue > height ? height : yEndValue;
          let z = v0z + dzdx * (x - v0x) + dzdy * (yStart - v0y);
          let j = x * height + yStart;
          pixelsTested += yEnd - yStart;
          for (let y = yStart; y < yEnd; y++) {
            if (z < zBuf[j]) {
              zBuf[j] = z;
              frameBuf[j] = singleOrFaceColor;
              pixelsWritten ++;
            }
            j ++;
            z += dzdy;
          }
        }
      }

      this.stats.trianglesCulled += trianglesCulled;
      this.stats.trianglesRasterized += trianglesRasterized;
      this.stats.pixelsTested += pixelsTested;
      this.stats.pixelsWritten += pixelsWritten;
    }

    public render(scene: Scene, camera: Camera) {
      // you'll see some allocations in this function, but they are dwarfed by
      // actual triangle and pixel work, optimize them later
      let timeModelCollect = 0;
      let timeModelSetupAndMats = 0;
      let timeModelMVPs = 0;
      let timeModelVertexTrans = 0;
      let timeModelTriangleClip = 0;
      let timeModelProjection = 0;
      let timeModelRasterize = 0;

      let modelsVisible = 0;
      let modelsRendered = 0;
      let modelsCulled = 0;

      this.stats.trianglesInput = 0;
      this.stats.trianglesTrivialReject = 0;
      this.stats.trianglesTrivialAccept = 0;
      this.stats.trianglesClipped = 0;
      this.stats.trianglesClippedAway = 0;
      this.stats.trianglesClipOutput = 0;

      this.stats.trianglesCulled = 0;
      this.stats.trianglesRasterized = 0;
      this.stats.pixelsTested = 0;
      this.stats.pixelsWritten = 0;

      const timeRenderStart = control.micros();
      //// frame setup
      // update matrices
      const width = this._target.width;
      const height = this._target.height;
      scene.updateWorldMatrix();
      camera.updateMatrices(width, height);
      // clear
      this._frameBuf.fill(scene.background);
      this._zBuf.fill(2);  // infinitely far away
      //// collect models
      const timeModelCollectStart = control.micros();
      const models = Renderer._getModelsFromScene(scene);
      const timeModelCollectEnd = control.micros();
      timeModelCollect = timeModelCollectEnd - timeModelCollectStart;
      modelsVisible = models.length;
      for (const model of models) {
        //// setup
        const timeModelSetupAndMatsStart = control.micros();

        this._modelPositions = model.mesh.positions;
        this._modelIndices = model.mesh.indices;

        // gather and validate material type
        this._fetchMaterials(model); // result stored on class fields
        // frustum cull
        if (Renderer._modelDefinitelyOutsideFrustum(model, camera)) {
          const timeModelSetupAndMatsEnd = control.micros();
          timeModelSetupAndMats += timeModelSetupAndMatsEnd - timeModelSetupAndMatsStart;
          modelsCulled++;
          continue;
        }

        const timeModelSetupAndMatsEnd = control.micros();
        timeModelSetupAndMats += timeModelSetupAndMatsEnd - timeModelSetupAndMatsStart;
        modelsRendered++;
        // build mvp
        const timeModelMVPsStart = control.micros();

        this._mvpMat4.multiplyAWithB(camera.viewProjectionMatrix, model.worldMatrix);
        // determine cull and mirror
        this._fetchMaterialCull(model);

        // per-model output buffers
        this._vertexBufCount = 0;
        this._indicesBufCount = 0;
        this._clipCodeBufCount = 0;
        this._faceBufCount = 0;
        this._vertexCount = (model.mesh.positions.length / 3) | 0;
        this._triangleCount = (this._modelIndices.length / 3) | 0;

        const timeModelMVPsEnd = control.micros();
        timeModelMVPs += timeModelMVPsEnd - timeModelMVPsStart;
        //// vertex transform
        const timeModelVertexTransStart = control.micros();

        this._vertexTransformAndClip();

        const timeModelVertexTransEnd = control.micros();
        timeModelVertexTrans += timeModelVertexTransEnd - timeModelVertexTransStart;
        //// triangle clipping
        const timeModelTriangleClipStart = control.micros();

        this._triangleClipAndFan();

        const timeModelTriangleClipEnd = control.micros();
        timeModelTriangleClip += timeModelTriangleClipEnd - timeModelTriangleClipStart;
        //// projection
        const timeModelProjectionStart = control.micros();

        this._vertexCount = (this._vertexBufCount / VERTEX_STRIDE) | 0;
        this._projection();
        this._triangleCount = (this._indicesBufCount / 3) | 0;

        const timeModelProjectionEnd = control.micros();
        timeModelProjection += timeModelProjectionEnd - timeModelProjectionStart;
        //// rasterize
        const timeModelRasterizeStart = control.micros();

        this._rasterize();

        const timeModelRasterizeEnd = control.micros();
        timeModelRasterize += timeModelRasterizeEnd - timeModelRasterizeStart;
      }
      // copy framebuffer to target image
      this._target.setRows(0, this._frameBuf);
      // collect stats
      const timeRenderEnd = control.micros();
      this.stats.timeElapsed = timeRenderEnd - timeRenderStart;
      this.stats.timeModelCollect = timeModelCollect;
      this.stats.timeModelSetupAndMats = timeModelSetupAndMats;
      this.stats.timeModelMVPs = timeModelMVPs;
      this.stats.timeModelVertexTrans = timeModelVertexTrans;
      this.stats.timeModelTriangleClip = timeModelTriangleClip;
      this.stats.timeModelProjection = timeModelProjection;
      this.stats.timeModelRasterize = timeModelRasterize;

      this.stats.modelsVisible = modelsVisible;
      this.stats.modelsRendered = modelsRendered;
      this.stats.modelsCulled = modelsCulled;
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
  ];
  
  const VERTEX_STRIDE = 4;  // x, y, z, w
}
