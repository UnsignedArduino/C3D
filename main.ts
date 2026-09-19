// any code below is temporarily here, will be moved into separate files later
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
}
