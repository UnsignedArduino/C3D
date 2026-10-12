namespace C3D {
  export class Mesh {
    // 3 nums - vertex position from x y z (model space)
    public positions: number[];
    // 3 nums - triangle from three vertices
    public indices: number[];

    // 3 nums - surface direction at each vertex, use for Gouraud shading
    public vertexNormals: number[];
    // 3 nums - face direction at each triangle
    public faceNormals: number[];

    // 2 nums - uv position per vertex from u v (texture 0-1 space), use for
    // TextureMaterial
    public uvs: number[];

    // only read, do not overwrite, not a getter for perf
    public boundingRadius: number;

    public constructor(positions: number[], indices: number[], uvs: number[] = null) {
      this.positions = positions;
      this.indices = indices;
      this.uvs = uvs;
      this.computeFaceNormals();
      this.computeBoundingRadius();
    }

    // Triangles are counter-clockwise from outside, so the normal is
    // (b - a) x (c - a). Degenerate triangles get (0, 0, 0).
    public computeFaceNormals() {
      const p = this.positions;
      const idx = this.indices;
      const triCount = (idx.length / 3) | 0;
      const out: number[] = [];
      for (let t = 0; t < triCount; t++) {
        const ia = idx[t * 3] * 3;
        const ib = idx[t * 3 + 1] * 3;
        const ic = idx[t * 3 + 2] * 3;
        const abx = p[ib] - p[ia];
        const aby = p[ib + 1] - p[ia + 1];
        const abz = p[ib + 2] - p[ia + 2];
        const acx = p[ic] - p[ia];
        const acy = p[ic + 1] - p[ia + 1];
        const acz = p[ic + 2] - p[ia + 2];
        let nx = aby * acz - abz * acy;
        let ny = abz * acx - abx * acz;
        let nz = abx * acy - aby * acx;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 0) {
          nx /= len;
          ny /= len;
          nz /= len;
        }
        out.push(nx);
        out.push(ny);
        out.push(nz);
      }
      this.faceNormals = out;
    }

    // Smooth normals. At each corner, a triangle's normal is averaged with
    // every other triangle touching that corner's position whose face normal
    // is within smoothAngle degrees of its own (weighted by face area).
    // smoothAngle = 0 keeps every edge hard (only coplanar faces blend).
    //
    // Neighbours are found by position, not vertex index, so vertices that are
    // already duplicated (UV seams, a builder's per-face box corners, splits
    // from an earlier call) still smooth across each other.
    //
    // vertexNormals is indexed by vertex, so the vertex list is rebuilt: one
    // vertex per distinct (position, normal, uv) at each position. A position
    // whose corners need different normals or uvs is split, identical
    // duplicates are merged, and unreferenced vertices are dropped. Vertex
    // order changes, but face order doesn't, so per-face data like
    // FaceColorMaterial colors stays valid. Calling it again gives the same
    // result for the same smoothAngle, whatever was called before.
    public computeVertexNormals(smoothAngle: number = 0) {
      this.computeFaceNormals();
      const fn = this.faceNormals;
      const p = this.positions;
      const idx = this.indices;
      const uv = this.uvs;
      const triCount = (idx.length / 3) | 0;
      const vertCount = (p.length / 3) | 0;
      const hasUvs = uv != null && uv.length >= vertCount * 2;
      // slack so exactly coplanar faces always count despite float error
      const cosLimit = Math.cos(smoothAngle * Math.PI / 180) - 1e-6;

      // group vertices by position, rounded so float noise from builders
      // still lands in the same group
      const group: number[] = [];
      const groupOfKey: { [key: string]: number } = {};
      let groupCount = 0;
      for (let v = 0; v < vertCount; v++) {
        const key = Math.round(p[v * 3] * 1e4) + "," + Math.round(p[v * 3 + 1] * 1e4) + "," + Math.round(p[v * 3 + 2] * 1e4);
        let g = groupOfKey[key];
        if (g === undefined) {
          g = groupCount;
          groupCount++;
          groupOfKey[key] = g;
        }
        group.push(g);
      }

      // area of each triangle, and triangles touching each position group
      const area: number[] = [];
      const touching: number[][] = [];
      for (let g = 0; g < groupCount; g++) {
        touching.push([]);
      }
      for (let t = 0; t < triCount; t++) {
        const ia = idx[t * 3] * 3;
        const ib = idx[t * 3 + 1] * 3;
        const ic = idx[t * 3 + 2] * 3;
        const abx = p[ib] - p[ia];
        const aby = p[ib + 1] - p[ia + 1];
        const abz = p[ib + 2] - p[ia + 2];
        const acx = p[ic] - p[ia];
        const acy = p[ic + 1] - p[ia + 1];
        const acz = p[ic + 2] - p[ia + 2];
        const cx = aby * acz - abz * acy;
        const cy = abz * acx - abx * acz;
        const cz = abx * acy - aby * acx;
        area.push(Math.sqrt(cx * cx + cy * cy + cz * cz));
        touching[group[idx[t * 3]]].push(t);
        touching[group[idx[t * 3 + 1]]].push(t);
        touching[group[idx[t * 3 + 2]]].push(t);
      }

      const newP: number[] = [];
      const newUv: number[] = hasUvs ? [] : uv;
      const newIdx: number[] = [];
      const n: number[] = [];
      // variants[g] = flat [index, nx, ny, nz, u, v, ...] of output vertices
      // already made at position group g
      const variants: number[][] = [];
      for (let g = 0; g < groupCount; g++) {
        variants.push([]);
      }

      for (let t = 0; t < triCount; t++) {
        for (let c = 0; c < 3; c++) {
          const v = idx[t * 3 + c];
          const g = group[v];
          const list = touching[g];
          let sx = 0;
          let sy = 0;
          let sz = 0;
          for (let k = 0; k < list.length; k++) {
            const o = list[k];
            const dot = fn[t * 3] * fn[o * 3] + fn[t * 3 + 1] * fn[o * 3 + 1] + fn[t * 3 + 2] * fn[o * 3 + 2];
            if (o == t || dot >= cosLimit) {
              sx += fn[o * 3] * area[o];
              sy += fn[o * 3 + 1] * area[o];
              sz += fn[o * 3 + 2] * area[o];
            }
          }
          const len = Math.sqrt(sx * sx + sy * sy + sz * sz);
          if (len > 0) {
            sx /= len;
            sy /= len;
            sz /= len;
          }

          // reuse a vertex at this position with the same normal and uv
          const cu = hasUvs ? uv[v * 2] : 0;
          const cv = hasUvs ? uv[v * 2 + 1] : 0;
          const vs = variants[g];
          let found = -1;
          for (let k = 0; k < vs.length; k += 6) {
            if (Math.abs(vs[k + 1] - sx) < 1e-5 && Math.abs(vs[k + 2] - sy) < 1e-5 && Math.abs(vs[k + 3] - sz) < 1e-5
              && Math.abs(vs[k + 4] - cu) < 1e-6 && Math.abs(vs[k + 5] - cv) < 1e-6) {
              found = vs[k];
              break;
            }
          }
          if (found < 0) {
            // new output vertex. Any per-vertex attribute added to Mesh later
            // (vertex colors, skin weights...) must be copied here, and
            // compared in the reuse check above, or splits will drop it.
            found = (newP.length / 3) | 0;
            newP.push(p[v * 3]);
            newP.push(p[v * 3 + 1]);
            newP.push(p[v * 3 + 2]);
            if (hasUvs) {
              newUv.push(cu);
              newUv.push(cv);
            }
            n.push(sx);
            n.push(sy);
            n.push(sz);
            vs.push(found);
            vs.push(sx);
            vs.push(sy);
            vs.push(sz);
            vs.push(cu);
            vs.push(cv);
          }
          newIdx.push(found);
        }
      }
      this.positions = newP;
      this.uvs = newUv;
      this.indices = newIdx;
      this.vertexNormals = n;
    }

    // Distance from the local origin to the farthest vertex.
    public computeBoundingRadius() {
      const p = this.positions;
      let maxSq = 0;
      for (let i = 0; i < p.length; i += 3) {
        const sq = p[i] * p[i] + p[i + 1] * p[i + 1] + p[i + 2] * p[i + 2];
        if (sq > maxSq) {
          maxSq = sq;
        }
      }
      this.boundingRadius = Math.sqrt(maxSq);
    }

    // static helpers later
  }

  export abstract class Material {
    cull: CullMode = CullMode.Back;

    // pxt needs an explicit constructor for field initializers and super()
    protected constructor() {}
  }

  export enum CullMode {
    Back,  // removes triangles that face away from camera, used most
    Front, // ex. if you are inside a room which is a box with a texture, render inner faces
    None // surfaces, not models like a plane, leaf, flag, etc.
  }

  export class SingleColorMaterial extends Material {
    public color: number;

    public constructor (color: number, cull: CullMode = CullMode.Back) {
      super();
      this.color = color;
      this.cull = cull;
    }
  }

  export class FaceColorMaterial extends Material {
    public colors: number[];

    public constructor(colors: number[], cull: CullMode = CullMode.Back) {
      super();
      this.colors = colors;
      this.cull = cull;
    }
  }

  export class TextureMaterial extends Material {
    public texture: Image;

    public constructor(texture: Image, cull: CullMode = CullMode.Back) {
      super();
      this.texture = texture;
      this.cull = cull;
    }
  }

  export class Model extends Object3D {
    public mesh: Mesh;
    public material: Material;

    constructor(mesh: Mesh, material: Material = null) {
      super();
      this.mesh = mesh;
      this.material = material;
      if (this.material == null) {
        this.material = new SingleColorMaterial(1);
      }
    }

    // fromOBJ helper later
  }
}
