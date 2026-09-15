namespace C3D {
    // standard vec3 class
    // (almost) all mutate for perf
    // many return itself for chaining
    export class Vec3 {
        public x: number;
        public y: number;
        public z: number;

        public constructor(x: number = 0, y: number = 0, z: number = 0) {
            // function calls are expensive, not using set
            this.x = x;
            this.y = y;
            this.z = z;
        }

        public set(x: number, y: number, z: number): Vec3 {
            this.x = x;
            this.y = y;
            this.z = z;
            return this;
        }

        public copy(v: Vec3): Vec3 {
            this.x = v.x;
            this.y = v.y;
            this.z = v.z;
            return this;
        }

        public clone(): Vec3 {
            return new Vec3(this.x, this.y, this.z);
        }

        public add(v: Vec3): Vec3 {
            this.x += v.x;
            this.y += v.y;
            this.z += v.z;
            return this;
        }

        public addScaled(v: Vec3, s: number): Vec3 {
            this.x += v.x * s;
            this.y += v.y * s;
            this.z += v.z * s;
            return this;
        }

        public sub(v: Vec3): Vec3 {
            this.x -= v.x;
            this.y -= v.y;
            this.z -= v.z;
            return this;
        }

        public scale(s: number): Vec3 {
            this.x *= s;
            this.y *= s;
            this.z *= s;
            return this;
        }

        public negate(): Vec3 {
            this.x *= -1;
            this.y *= -1;
            this.z *= -1;
            return this;
        }

        public dot(v: Vec3): number {
            return this.x * v.x + this.y * v.y + this.z * v.z;
        }

        // a (this) cross b written into a (this)
        public crossThisWithB(b: Vec3): Vec3 {
            const newX = this.y * b.z - this.z * b.y;
            const newY = this.z * b.x - this.x * b.z;
            const newZ = this.x * b.y - this.y * b.x;
            this.x = newX;
            this.y = newY;
            this.z = newZ;
            return this;
        }

        // a cross b written into this
        public crossAWithB(a: Vec3, b: Vec3): Vec3 {
            const newX = a.y * b.z - a.z * b.y;
            const newY = a.z * b.x - a.x * b.z;
            const newZ = a.x * b.y - a.y * b.x;
            this.x = newX;
            this.y = newY;
            this.z = newZ;
            return this;
        }

        public length(): number {
            return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
        }

        public lengthSquared(): number {
            return this.x * this.x + this.y * this.y + this.z * this.z;
        }

        public normalize(): Vec3 {
            const mSq = this.x * this.x + this.y * this.y + this.z * this.z;
            if (mSq < 1e-12) {
                this.x = this.y = this.z = 0;
                return this;
            }
            const m = Math.sqrt(mSq);
            this.x /= m;
            this.y /= m;
            this.z /= m;
            return this;
        }

        public distanceToVec(v: Vec3): number {
            const x = this.x - v.x;
            const y = this.y - v.y;
            const z = this.z - v.z;
            return Math.sqrt(x * x + y * y + z * z);
        }

        public distanceSquaredToVec(v: Vec3): number {
            const x = this.x - v.x;
            const y = this.y - v.y;
            const z = this.z - v.z;
            return x * x + y * y + z * z;
        }

        // rotates this by a unit quaternion
        public applyUnitQuat(q: Quat): Vec3 {
            const qx = q.x;
            const qy = q.y;
            const qz = q.z;
            const qw = q.w;
            const vx = this.x;
            const vy = this.y;
            const vz = this.z;

            // t = 2 * cross(q.xyz, v)
            const tx = 2 * (qy * vz - qz * vy);
            const ty = 2 * (qz * vx - qx * vz);
            const tz = 2 * (qx * vy - qy * vx);

            // v' = v + qw * t + cross(q.xyz, t)
            this.x = vx + qw * tx + (qy * tz - qz * ty);
            this.y = vy + qw * ty + (qz * tx - qx * tz);
            this.z = vz + qw * tz + (qx * ty - qy * tx);
            return this;
        }

        // scale, rotation, translation, and projection (for perspective) matrix 
        // of this point (treating as x, y, z, 1)
        public applyMat4(m: Mat4): Vec3 {
            const e = m.e;
            const x = this.x
            const y = this.y
            const z = this.z;
            const w = e[3] * x + e[7] * y + e[11] * z + e[15];
            const invW = w !== 0 ? 1 / w : 1;

            this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * invW;
            this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * invW;
            this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * invW;
            return this;
        }

        // scale and rotation of this direction
        public transformDirection(m: Mat4): Vec3 {
            const e = m.e;
            const x = this.x;
            const y = this.y;
            const z = this.z;

            this.x = e[0] * x + e[4] * y + e[8] * z;
            this.y = e[1] * x + e[5] * y + e[9] * z;
            this.z = e[2] * x + e[6] * y + e[10] * z;
            return this;
        }

        // in place
        public lerp(v: Vec3, t: number): Vec3 {
            this.x = this.x + t * (v.x - this.x);
            this.y = this.y + t * (v.y - this.y);
            this.z = this.z + t * (v.z - this.z);
            return this;
        }

        public equals(v: Vec3, epsilon: number = 1e-6): boolean {
            return (
                Math.abs(this.x - v.x) < epsilon &&
                Math.abs(this.y - v.y) < epsilon &&
                Math.abs(this.z - v.z) < epsilon
            );
        }

        // not doing this:
        // static UP: Vec3 = new Vec3(0, 1, 0);
        // because lazy init is weird apparently??
        static _up: Vec3;
        static _forward: Vec3;
        static _right: Vec3

        static get UP(): Vec3 {
            if (!Vec3._up) {
                Vec3._up = new Vec3(0, 1, 0);
            }
            return Vec3._up;
        }

        static get FORWARD(): Vec3 {
            if (!Vec3._forward) {
                Vec3._forward = new Vec3(0, 0, -1);
            }
            return Vec3._forward;
        }

        static get RIGHT(): Vec3 {
            if (!Vec3._right) {
                Vec3._right = new Vec3(1, 0, 0);
            }
            return Vec3._right;
        }
    }
}
