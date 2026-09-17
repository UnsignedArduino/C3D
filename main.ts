namespace C3D {
    export function clamp1(x: number): number {
        return x < -1 ? -1 : (x > 1 ? 1 : x);
    }

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

        public set(x: number = 0, y: number = 0, z: number = 0): Vec3 {
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
            this.x = -this.x;
            this.y = -this.y;
            this.z = -this.z;
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

        public distanceToVecSquared(v: Vec3): number {
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
            const x = this.x;
            const y = this.y;
            const z = this.z;
            const w = e[3] * x + e[7] * y + e[11] * z + e[15];
            const invW = w !== 0 ? 1 / w : 1;

            this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * invW;
            this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * invW;
            this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * invW;
            return this;
        }

        // Applies a 3x3 matrix to this vector (used for normals, directions, and lighting)
        public applyMat3(m: Mat3): Vec3 {
            const e = m.e;
            const x = this.x;
            const y = this.y;
            const z = this.z;

            // Standard 3x3 matrix-vector multiplication (Column-Major)
            this.x = e[0] * x + e[3] * y + e[6] * z;
            this.y = e[1] * x + e[4] * y + e[7] * z;
            this.z = e[2] * x + e[5] * y + e[8] * z;

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

        // static readonly UP = new Vec3(0, 1, 0);
        // static readonly FORWARD = new Vec3(0, 0, -1);
        // static readonly RIGHT = new Vec3(1, 0, 0);

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

    // standard quat class
    export class Quat {
        public x: number;
        public y: number;
        public z: number;
        public w: number;

        public constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 1) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.w = w;
        }

        public set(x: number = 0, y: number = 0, z: number = 0, w: number = 1): Quat {
            this.x = x;
            this.y = y;
            this.z = z;
            this.w = w;
            return this;
        }

        public copy(q: Quat): Quat {
            this.x = q.x;
            this.y = q.y;
            this.z = q.z;
            this.w = q.w;
            return this;
        }

        public identity(): Quat {
            this.x = 0;
            this.y = 0;
            this.z = 0;
            this.w = 1;
            return this;
        }

        public clone(): Quat {
            return new Quat(this.x, this.y, this.z, this.w);
        }

        public setFromNormalAxisAngle(axis: Vec3, angle: number): Quat {
            const half = angle / 2;
            const s = Math.sin(half);
            this.x = axis.x * s;
            this.y = axis.y * s;
            this.z = axis.z * s;
            this.w = Math.cos(half);
            return this;
        }

        public setFromEuler(x: number, y: number, z: number, order: EulerOrder = EulerOrder.YXZ): Quat {
            const c1 = Math.cos(x / 2), s1 = Math.sin(x / 2);
            const c2 = Math.cos(y / 2), s2 = Math.sin(y / 2);
            const c3 = Math.cos(z / 2), s3 = Math.sin(z / 2);

            switch (order) {
                case EulerOrder.XYZ: {
                    this.x = s1 * c2 * c3 + c1 * s2 * s3;
                    this.y = c1 * s2 * c3 - s1 * c2 * s3;
                    this.z = c1 * c2 * s3 + s1 * s2 * c3;
                    this.w = c1 * c2 * c3 - s1 * s2 * s3;
                    break;
                }
                case EulerOrder.YXZ: {
                    this.x = s1 * c2 * c3 + c1 * s2 * s3;
                    this.y = c1 * s2 * c3 - s1 * c2 * s3;
                    this.z = c1 * c2 * s3 - s1 * s2 * c3;
                    this.w = c1 * c2 * c3 + s1 * s2 * s3;
                    break;
                }
                case EulerOrder.ZXY: {
                    this.x = s1 * c2 * c3 - c1 * s2 * s3;
                    this.y = c1 * s2 * c3 + s1 * c2 * s3;
                    this.z = c1 * c2 * s3 + s1 * s2 * c3;
                    this.w = c1 * c2 * c3 - s1 * s2 * s3;
                    break;
                }
                case EulerOrder.ZYX: {
                    this.x = s1 * c2 * c3 - c1 * s2 * s3;
                    this.y = c1 * s2 * c3 + s1 * c2 * s3;
                    this.z = c1 * c2 * s3 - s1 * s2 * c3;
                    this.w = c1 * c2 * c3 + s1 * s2 * s3;
                    break;
                }
                case EulerOrder.YZX: {
                    this.x = s1 * c2 * c3 + c1 * s2 * s3;
                    this.y = c1 * s2 * c3 + s1 * c2 * s3;
                    this.z = c1 * c2 * s3 - s1 * s2 * c3;
                    this.w = c1 * c2 * c3 - s1 * s2 * s3;
                    break;
                }
                case EulerOrder.XZY: {
                    this.x = s1 * c2 * c3 - c1 * s2 * s3;
                    this.y = c1 * s2 * c3 - s1 * c2 * s3;
                    this.z = c1 * c2 * s3 + s1 * s2 * c3;
                    this.w = c1 * c2 * c3 + s1 * s2 * s3;
                    break;
                }
            }

            return this;
        }

        private _aTemp: Vec3;

        public setFromUnitVectors(from_vec: Vec3, to_vec: Vec3): Quat {
            if (!this._aTemp) { this._aTemp = new Vec3(); }

            const d = from_vec.dot(to_vec);
            // parallel
            if (d > 0.999999) {
                // identity
                this.x = 0;
                this.y = 0;
                this.z = 0;
                this.w = 1;
                return this;
            }
            // anti parallel
            else if (d < -0.999999) {
                const ortho = Math.abs(from_vec.x) < 0.9 ? Vec3.RIGHT : Vec3.UP;
                const axis = this._aTemp.crossAWithB(from_vec, ortho);
                this.x = axis.x;
                this.y = axis.y;
                this.z = axis.z;
                this.w = 0;
                // normal case
            } else {
                const axis = this._aTemp.crossAWithB(from_vec, to_vec);
                this.x = axis.x;
                this.y = axis.y;
                this.z = axis.z;
                this.w = 1 + d;
            }

            const m = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
            this.x /= m;
            this.y /= m;
            this.z /= m;
            this.w /= m;

            return this;
        }

        public setFromRotationMat(m: Mat4): Quat {
            const e = m.e;
            const m00 = e[0], m10 = e[1], m20 = e[2];
            const m01 = e[4], m11 = e[5], m21 = e[6];
            const m02 = e[8], m12 = e[9], m22 = e[10];

            const trace = m00 + m11 + m22;

            if (trace > 0) {
                const s = 0.5 / Math.sqrt(trace + 1.0);
                this.w = 0.25 / s;
                this.x = (m21 - m12) * s;
                this.y = (m02 - m20) * s;
                this.z = (m10 - m01) * s;
            } else if (m00 > m11 && m00 > m22) {
                const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
                this.w = (m21 - m12) / s;
                this.x = 0.25 * s;
                this.y = (m01 + m10) / s;
                this.z = (m02 + m20) / s;
            } else if (m11 > m22) {
                const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
                this.w = (m02 - m20) / s;
                this.x = (m01 + m10) / s;
                this.y = 0.25 * s;
                this.z = (m12 + m21) / s;
            } else {
                const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
                this.w = (m10 - m01) / s;
                this.x = (m02 + m20) / s;
                this.y = (m12 + m21) / s;
                this.z = 0.25 * s;
            }

            return this;
        }

        private _zTemp: Vec3;
        private _xTemp: Vec3;
        private _yTemp: Vec3;
        private _mTemp: Mat4;

        public setLookRotationFromUnitVectors(forward: Vec3, up: Vec3): Quat {
            if (!this._zTemp) { this._zTemp = new Vec3(); }
            if (!this._xTemp) { this._xTemp = new Vec3(); }
            if (!this._yTemp) { this._yTemp = new Vec3(); }
            if (!this._mTemp) { this._mTemp = new Mat4(); }

            // const z = forward.clone().negate(); // must be normalized
            const z = this._zTemp.copy(forward).negate(); // must be normalized
            // const x = new Vec3().crossAWithB(forward, up);
            const x = this._xTemp.crossAWithB(forward, up);
            if (x.lengthSquared() < 1e-8) {
                // forward is (nearly) parallel or anti-parallel to up — 'up' is
                // degenerate here, so fall back to whichever world axis is
                // farthest from forward and rebuild x from that instead.
                const fallback = Math.abs(forward.x) < 0.9 ? Vec3.RIGHT : Vec3.UP;
                x.crossAWithB(forward, fallback);
            }
            x.normalize();
            // recompute true up
            // const y = (new Vec3()).crossAWithB(z, x);
            const y = this._yTemp.crossAWithB(z, x);
            // const m = new Mat4();
            const m = this._mTemp;
            const e = m.e;
            e[0] = x.x;
            e[1] = x.y;
            e[2] = x.z;
            e[4] = y.x;
            e[5] = y.y;
            e[6] = y.z;
            e[8] = z.x;
            e[9] = z.y;
            e[10] = z.z;
            this.setFromRotationMat(m);
            return this;
        }

        public dot(q: Quat): number {
            return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w;
        }

        // this = this * q (q applied first)
        public multiplyThisWithB(b: Quat): Quat {
            const w = this.w * b.w - this.x * b.x - this.y * b.y - this.z * b.z;
            const x = this.w * b.x + this.x * b.w + this.y * b.z - this.z * b.y;
            const y = this.w * b.y - this.x * b.z + this.y * b.w + this.z * b.x;
            const z = this.w * b.z + this.x * b.y - this.y * b.x + this.z * b.w;
            this.w = w;
            this.x = x;
            this.y = y;
            this.z = z;
            return this;
        }

        // this = q * this (this applied first)
        public multiplyAWithThis(a: Quat): Quat {
            const w = a.w * this.w - a.x * this.x - a.y * this.y - a.z * this.z;
            const x = a.w * this.x + a.x * this.w + a.y * this.z - a.z * this.y;
            const y = a.w * this.y - a.x * this.z + a.y * this.w + a.z * this.x;
            const z = a.w * this.z + a.x * this.y - a.y * this.x + a.z * this.w;
            this.w = w;
            this.x = x;
            this.y = y;
            this.z = z;
            return this;
        }

        // this = a * b (b applied first)
        public multiplyAWithB(a: Quat, b: Quat): Quat {
            const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
            const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
            const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
            const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
            this.w = w;
            this.x = x;
            this.y = y;
            this.z = z;
            return this;
        }

        public conjugate(): Quat {
            this.x = -this.x;
            this.y = -this.y;
            this.z = -this.z;
            return this;
        }

        public invert(): Quat {
            const mSq = this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
            if (mSq < 1e-12) {
                this.x = this.y = this.z = 0;
                this.w = 1;
                return this;
            }
            const negOneOverMSq = -1 / mSq;
            this.x *= negOneOverMSq;
            this.y *= negOneOverMSq;
            this.z *= negOneOverMSq;
            this.w *= -negOneOverMSq;
            return this;
        }

        public normalize(): Quat {
            const mSq = this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
            if (mSq < 1e-12) {
                this.x = this.y = this.z = 0;
                this.w = 1;
                return this;
            }
            const m = Math.sqrt(mSq);
            this.x /= m;
            this.y /= m;
            this.z /= m;
            this.w /= m;
            return this;
        }

        public slerp(q: Quat, t: number): Quat {
            // this and q must be unit quaternions
            let bx = q.x, by = q.y, bz = q.z, bw = q.w;

            let cosOmega = this.x * bx + this.y * by + this.z * bz + this.w * bw;

            // quaternions double-cover rotation space (q and -q are the same
            // rotation) — negate one side if the dot product is negative, or
            // interpolation takes the long way around
            if (cosOmega < 0) {
                bx = -bx; by = -by; bz = -bz; bw = -bw;
                cosOmega = -cosOmega;
            }

            let scale0: number, scale1: number;
            if (cosOmega > 0.9995) {
                // nearly parallel: sin(omega) ~ 0, so the slerp formula loses
                // precision (and divides by ~0) — fall back to a lerp
                scale0 = 1 - t;
                scale1 = t;
            } else {
                const omega = Math.acos(cosOmega);
                const sinOmega = Math.sin(omega);
                scale0 = Math.sin((1 - t) * omega) / sinOmega;
                scale1 = Math.sin(t * omega) / sinOmega;
            }

            this.x = this.x * scale0 + bx * scale1;
            this.y = this.y * scale0 + by * scale1;
            this.z = this.z * scale0 + bz * scale1;
            this.w = this.w * scale0 + bw * scale1;

            return this.normalize();
        }

        public nlerp(q: Quat, t: number): Quat {
            // this and q must be unit quaternions
            let bx = q.x, by = q.y, bz = q.z, bw = q.w;

            const cosOmega = this.x * bx + this.y * by + this.z * bz + this.w * bw;

            // quaternions double-cover rotation space (q and -q are the same
            // rotation) — negate one side if the dot product is negative, or
            // interpolation takes the long way around
            if (cosOmega < 0) {
                bx = -bx; by = -by; bz = -bz; bw = -bw;
            }

            this.x += (bx - this.x) * t;
            this.y += (by - this.y) * t;
            this.z += (bz - this.z) * t;
            this.w += (bw - this.w) * t;
            return this.normalize();
        }

        public angleTo(q: Quat): number {
            // angle = 2 * acos(clamp(|dot(this, q)|, -1, 1))
            return 2 * Math.acos(clamp1(Math.abs(
                this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w
            )));
        }

        public rotateTowards(q: Quat, maxRad: number): Quat {
            const theta = this.angleTo(q);
            if (theta <= maxRad) {
                this.x = q.x;
                this.y = q.y;
                this.z = q.z;
                this.w = q.w;
                return this;
            }
            this.slerp(q, maxRad / theta);
            return this;
        }

        public toEuler(out: Vec3, order: EulerOrder = EulerOrder.YXZ): Vec3 {
            const x = this.x, y = this.y, z = this.z, w = this.w;

            // quaternion -> the 9 rotation-matrix terms, as locals (no Mat4 allocation)
            const xx = x * x, yy = y * y, zz = z * z;
            const xy = x * y, xz = x * z, yz = y * z;
            const wx = w * x, wy = w * y, wz = w * z;

            const m11 = 1 - 2 * (yy + zz);
            const m12 = 2 * (xy - wz);
            const m13 = 2 * (xz + wy);
            const m21 = 2 * (xy + wz);
            const m22 = 1 - 2 * (xx + zz);
            const m23 = 2 * (yz - wx);
            const m31 = 2 * (xz - wy);
            const m32 = 2 * (yz + wx);
            const m33 = 1 - 2 * (xx + yy);

            let ex = 0, ey = 0, ez = 0;

            if (order == EulerOrder.XYZ) {
                ey = Math.asin(clamp1(m13));
                if (Math.abs(m13) < 0.999999) {
                    ex = Math.atan2(-m23, m33);
                    ez = Math.atan2(-m12, m11);
                } else {
                    ex = Math.atan2(m32, m22);
                    ez = 0;
                }
            } else if (order == EulerOrder.YXZ) {
                ex = Math.asin(-clamp1(m23));
                if (Math.abs(m23) < 0.999999) {
                    ey = Math.atan2(m13, m33);
                    ez = Math.atan2(m21, m22);
                } else {
                    ey = Math.atan2(-m31, m11);
                    ez = 0;
                }
            } else if (order == EulerOrder.ZXY) {
                ex = Math.asin(clamp1(m32));
                if (Math.abs(m32) < 0.999999) {
                    ey = Math.atan2(-m31, m33);
                    ez = Math.atan2(-m12, m22);
                } else {
                    ey = 0;
                    ez = Math.atan2(m21, m11);
                }
            } else if (order == EulerOrder.ZYX) {
                ey = Math.asin(-clamp1(m31));
                if (Math.abs(m31) < 0.999999) {
                    ex = Math.atan2(m32, m33);
                    ez = Math.atan2(m21, m11);
                } else {
                    ex = 0;
                    ez = Math.atan2(-m12, m22);
                }
            } else if (order == EulerOrder.YZX) {
                ez = Math.asin(clamp1(m21));
                if (Math.abs(m21) < 0.999999) {
                    ex = Math.atan2(-m23, m22);
                    ey = Math.atan2(-m31, m11);
                } else {
                    ex = 0;
                    ey = Math.atan2(m13, m33);
                }
            } else { // XZY
                ez = Math.asin(-clamp1(m12));
                if (Math.abs(m12) < 0.999999) {
                    ex = Math.atan2(m32, m22);
                    ey = Math.atan2(m13, m11);
                } else {
                    ex = Math.atan2(-m23, m33);
                    ey = 0;
                }
            }

            out.x = ex; out.y = ey; out.z = ez;
            return out;
        }

        public equals(q: Quat, epsilon: number = 1e-6): boolean {
            return (
                Math.abs(this.x - q.x) < epsilon &&
                Math.abs(this.y - q.y) < epsilon &&
                Math.abs(this.z - q.z) < epsilon &&
                Math.abs(this.w - q.w) < epsilon
            );
        }
    }

    export enum EulerOrder { XYZ, YXZ, ZXY, ZYX, YZX, XZY }

    // standard mat4 class
    export class Mat4 {
        // column major
        public e: number[];

        public constructor() {
            this.e = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        }

        public identity(): Mat4 {
            const e = this.e;
            e.fill(0);
            e[0] = e[5] = e[10] = e[15] = 1;
            return this;
        }

        public copy(m: Mat4): Mat4 {
            const e = this.e;
            const me = m.e;
            e[0] = me[0];
            e[1] = me[1];
            e[2] = me[2];
            e[3] = me[3];
            e[4] = me[4];
            e[5] = me[5];
            e[6] = me[6];
            e[7] = me[7];
            e[8] = me[8];
            e[9] = me[9];
            e[10] = me[10];
            e[11] = me[11];
            e[12] = me[12];
            e[13] = me[13];
            e[14] = me[14];
            e[15] = me[15];
            return this;
        }

        public clone(): Mat4 {
            const m = new Mat4();
            m.copy(this);
            return m;
        }

        public multiplyThisWithB(b: Mat4): Mat4 {
            const ae = this.e;
            const be = b.e;

            // Cache original values of 'this' (a)
            const a00 = ae[0], a01 = ae[4], a02 = ae[8], a03 = ae[12];
            const a10 = ae[1], a11 = ae[5], a12 = ae[9], a13 = ae[13];
            const a20 = ae[2], a21 = ae[6], a22 = ae[10], a23 = ae[14];
            const a30 = ae[3], a31 = ae[7], a32 = ae[11], a33 = ae[15];

            // Cache original values of 'b'
            const b00 = be[0], b01 = be[4], b02 = be[8], b03 = be[12];
            const b10 = be[1], b11 = be[5], b12 = be[9], b13 = be[13];
            const b20 = be[2], b21 = be[6], b22 = be[10], b23 = be[14];
            const b30 = be[3], b31 = be[7], b32 = be[11], b33 = be[15];

            // Column 0
            ae[0] = a00 * b00 + a01 * b10 + a02 * b20 + a03 * b30;
            ae[1] = a10 * b00 + a11 * b10 + a12 * b20 + a13 * b30;
            ae[2] = a20 * b00 + a21 * b10 + a22 * b20 + a23 * b30;
            ae[3] = a30 * b00 + a31 * b10 + a32 * b20 + a33 * b30;

            // Column 1
            ae[4] = a00 * b01 + a01 * b11 + a02 * b21 + a03 * b31;
            ae[5] = a10 * b01 + a11 * b11 + a12 * b21 + a13 * b31;
            ae[6] = a20 * b01 + a21 * b11 + a22 * b21 + a23 * b31;
            ae[7] = a30 * b01 + a31 * b11 + a32 * b21 + a33 * b31;

            // Column 2
            ae[8] = a00 * b02 + a01 * b12 + a02 * b22 + a03 * b32;
            ae[9] = a10 * b02 + a11 * b12 + a12 * b22 + a13 * b32;
            ae[10] = a20 * b02 + a21 * b12 + a22 * b22 + a23 * b32;
            ae[11] = a30 * b02 + a31 * b12 + a32 * b22 + a33 * b32;

            // Column 3
            ae[12] = a00 * b03 + a01 * b13 + a02 * b23 + a03 * b33;
            ae[13] = a10 * b03 + a11 * b13 + a12 * b23 + a13 * b33;
            ae[14] = a20 * b03 + a21 * b13 + a22 * b23 + a23 * b33;
            ae[15] = a30 * b03 + a31 * b13 + a32 * b23 + a33 * b33;

            return this;
        }

        public multiplyAWithThis(a: Mat4): Mat4 {
            const ae = a.e;
            const be = this.e;
            const e = this.e;

            // Cache elements of A for faster column-based evaluation
            const a00 = ae[0], a01 = ae[4], a02 = ae[8], a03 = ae[12];
            const a10 = ae[1], a11 = ae[5], a12 = ae[9], a13 = ae[13];
            const a20 = ae[2], a21 = ae[6], a22 = ae[10], a23 = ae[14];
            const a30 = ae[3], a31 = ae[7], a32 = ae[11], a33 = ae[15];

            // Cache original values of 'b'
            const b00 = be[0], b01 = be[4], b02 = be[8], b03 = be[12];
            const b10 = be[1], b11 = be[5], b12 = be[9], b13 = be[13];
            const b20 = be[2], b21 = be[6], b22 = be[10], b23 = be[14];
            const b30 = be[3], b31 = be[7], b32 = be[11], b33 = be[15];

            // Column 0
            e[0] = a00 * b00 + a01 * b10 + a02 * b20 + a03 * b30;
            e[1] = a10 * b00 + a11 * b10 + a12 * b20 + a13 * b30;
            e[2] = a20 * b00 + a21 * b10 + a22 * b20 + a23 * b30;
            e[3] = a30 * b00 + a31 * b10 + a32 * b20 + a33 * b30;

            // Column 1
            e[4] = a00 * b01 + a01 * b11 + a02 * b21 + a03 * b31;
            e[5] = a10 * b01 + a11 * b11 + a12 * b21 + a13 * b31;
            e[6] = a20 * b01 + a21 * b11 + a22 * b21 + a23 * b31;
            e[7] = a30 * b01 + a31 * b11 + a32 * b21 + a33 * b31;

            // Column 2
            e[8] = a00 * b02 + a01 * b12 + a02 * b22 + a03 * b32;
            e[9] = a10 * b02 + a11 * b12 + a12 * b22 + a13 * b32;
            e[10] = a20 * b02 + a21 * b12 + a22 * b22 + a23 * b32;
            e[11] = a30 * b02 + a31 * b12 + a32 * b22 + a33 * b32;

            // Column 3
            e[12] = a00 * b03 + a01 * b13 + a02 * b23 + a03 * b33;
            e[13] = a10 * b03 + a11 * b13 + a12 * b23 + a13 * b33;
            e[14] = a20 * b03 + a21 * b13 + a22 * b23 + a23 * b33;
            e[15] = a30 * b03 + a31 * b13 + a32 * b23 + a33 * b33;

            return this;
        }

        public multiplyAWithB(a: Mat4, b: Mat4): Mat4 {
            const ae = a.e;
            const be = b.e;
            const e = this.e;

            // Cache elements of A for faster column-based evaluation
            const a00 = ae[0], a01 = ae[4], a02 = ae[8], a03 = ae[12];
            const a10 = ae[1], a11 = ae[5], a12 = ae[9], a13 = ae[13];
            const a20 = ae[2], a21 = ae[6], a22 = ae[10], a23 = ae[14];
            const a30 = ae[3], a31 = ae[7], a32 = ae[11], a33 = ae[15];

            // Cache original values of 'b'
            const b00 = be[0], b01 = be[4], b02 = be[8], b03 = be[12];
            const b10 = be[1], b11 = be[5], b12 = be[9], b13 = be[13];
            const b20 = be[2], b21 = be[6], b22 = be[10], b23 = be[14];
            const b30 = be[3], b31 = be[7], b32 = be[11], b33 = be[15];

            // Column 0
            e[0] = a00 * b00 + a01 * b10 + a02 * b20 + a03 * b30;
            e[1] = a10 * b00 + a11 * b10 + a12 * b20 + a13 * b30;
            e[2] = a20 * b00 + a21 * b10 + a22 * b20 + a23 * b30;
            e[3] = a30 * b00 + a31 * b10 + a32 * b20 + a33 * b30;

            // Column 1
            e[4] = a00 * b01 + a01 * b11 + a02 * b21 + a03 * b31;
            e[5] = a10 * b01 + a11 * b11 + a12 * b21 + a13 * b31;
            e[6] = a20 * b01 + a21 * b11 + a22 * b21 + a23 * b31;
            e[7] = a30 * b01 + a31 * b11 + a32 * b21 + a33 * b31;

            // Column 2
            e[8] = a00 * b02 + a01 * b12 + a02 * b22 + a03 * b32;
            e[9] = a10 * b02 + a11 * b12 + a12 * b22 + a13 * b32;
            e[10] = a20 * b02 + a21 * b12 + a22 * b22 + a23 * b32;
            e[11] = a30 * b02 + a31 * b12 + a32 * b22 + a33 * b32;

            // Column 3
            e[12] = a00 * b03 + a01 * b13 + a02 * b23 + a03 * b33;
            e[13] = a10 * b03 + a11 * b13 + a12 * b23 + a13 * b33;
            e[14] = a20 * b03 + a21 * b13 + a22 * b23 + a23 * b33;
            e[15] = a30 * b03 + a31 * b13 + a32 * b23 + a33 * b33;

            return this;
        }

        public compose(pos: Vec3, rot: Quat, scale: Vec3): Mat4 {
            const e = this.e;

            // rotate
            // standard rot quat to mat formula
            e[0] = 1 - 2 * (rot.y * rot.y + rot.z * rot.z);
            e[1] = 2 * (rot.x * rot.y + rot.w * rot.z);
            e[2] = 2 * (rot.x * rot.z - rot.w * rot.y);

            e[4] = 2 * (rot.x * rot.y - rot.w * rot.z);
            e[5] = 1 - 2 * (rot.x * rot.x + rot.z * rot.z);
            e[6] = 2 * (rot.y * rot.z + rot.w * rot.x);

            e[8] = 2 * (rot.x * rot.z + rot.w * rot.y);
            e[9] = 2 * (rot.y * rot.z - rot.w * rot.x);
            e[10] = 1 - 2 * (rot.x * rot.x + rot.y * rot.y);

            // scale
            e[0] *= scale.x;
            e[1] *= scale.x;
            e[2] *= scale.x;

            e[4] *= scale.y;
            e[5] *= scale.y;
            e[6] *= scale.y;

            e[8] *= scale.z;
            e[9] *= scale.z;
            e[10] *= scale.z;

            // translate
            e[12] = pos.x;
            e[13] = pos.y;
            e[14] = pos.z;

            // fill in bottom row
            e[3] = e[7] = e[11] = 0;
            e[15] = 1;

            return this;
        }

        public decompose(pos: Vec3, rot: Quat, scale: Vec3): void {
            const e = this.e;
            const EPS = 1e-6;

            pos.x = e[12]; pos.y = e[13]; pos.z = e[14];

            let sx = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
            const sy = Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]);
            const sz = Math.sqrt(e[8] * e[8] + e[9] * e[9] + e[10] * e[10]);

            if (this.determinant3() < 0) sx = -sx;
            scale.x = sx; scale.y = sy; scale.z = sz;

            const e0 = e[0], e1 = e[1], e2 = e[2], e4 = e[4], e5 = e[5], e6 = e[6], e8 = e[8], e9 = e[9], e10 = e[10];

            const validX = Math.abs(sx) > EPS;
            const validY = sy > EPS;
            const validZ = sz > EPS;
            const validCount = (validX ? 1 : 0) + (validY ? 1 : 0) + (validZ ? 1 : 0);

            if (validCount < 2) {
                // not enough surviving axes to determine a unique rotation — bail
                // rather than emit NaN or an arbitrary-looking-but-meaningless quat
                rot.identity();
                e[0] = e0; e[1] = e1; e[2] = e2; e[4] = e4; e[5] = e5; e[6] = e6; e[8] = e8; e[9] = e9; e[10] = e10;
                return;
            }

            if (validCount === 3) {
                e[0] /= sx; e[1] /= sx; e[2] /= sx;
                e[4] /= sy; e[5] /= sy; e[6] /= sy;
                e[8] /= sz; e[9] /= sz; e[10] /= sz;
            } else {
                // exactly one axis collapsed — normalize the two good columns,
                // rebuild the third as their cross product to keep the basis
                // orthonormal (right-handed: z = x×y, y = z×x, x = y×z)
                if (validX) { e[0] /= sx; e[1] /= sx; e[2] /= sx; }
                if (validY) { e[4] /= sy; e[5] /= sy; e[6] /= sy; }
                if (validZ) { e[8] /= sz; e[9] /= sz; e[10] /= sz; }

                if (!validZ) {
                    e[8] = e[1] * e[6] - e[2] * e[5];   // z = x × y
                    e[9] = e[2] * e[4] - e[0] * e[6];
                    e[10] = e[0] * e[5] - e[1] * e[4];
                } else if (!validY) {
                    e[4] = e[9] * e[2] - e[10] * e[1];  // y = z × x
                    e[5] = e[10] * e[0] - e[8] * e[2];
                    e[6] = e[8] * e[1] - e[9] * e[0];
                } else {
                    e[0] = e[5] * e[10] - e[6] * e[9];   // x = y × z
                    e[1] = e[6] * e[8] - e[4] * e[10];
                    e[2] = e[4] * e[9] - e[5] * e[8];
                }
            }

            rot.setFromRotationMat(this);
            e[0] = e0; e[1] = e1; e[2] = e2; e[4] = e4; e[5] = e5; e[6] = e6; e[8] = e8; e[9] = e9; e[10] = e10;
        }

        public invert(): Mat4 {
            const e = this.e;

            const n11 = e[0], n12 = e[4], n13 = e[8], n14 = e[12];
            const n21 = e[1], n22 = e[5], n23 = e[9], n24 = e[13];
            const n31 = e[2], n32 = e[6], n33 = e[10], n34 = e[14];
            const n41 = e[3], n42 = e[7], n43 = e[11], n44 = e[15];

            // Calculate 2x2 determinants for sub-matrices
            const t11 = n33 * n44 - n34 * n43;
            const t12 = n32 * n44 - n34 * n42;
            const t13 = n32 * n43 - n33 * n42;
            const t14 = n31 * n44 - n34 * n41;
            const t15 = n31 * n43 - n33 * n41;
            const t16 = n31 * n42 - n32 * n41;

            // Cofactor elements for the first column
            const c11 = (n22 * t11 - n23 * t12 + n24 * t13);
            const c12 = -(n21 * t11 - n23 * t14 + n24 * t15);
            const c13 = (n21 * t12 - n22 * t14 + n24 * t16);
            const c14 = -(n21 * t13 - n22 * t15 + n23 * t16);

            // Overall 4x4 determinant
            const det = n11 * c11 + n12 * c12 + n13 * c13 + n14 * c14;

            // Matrix is non-invertible (singular)
            if (det === 0) {
                // throw "Matrix is singular and cannot be inverted";
                return this;
            }

            const invDet = 1.0 / det;

            // Remaining cofactors
            const t21 = n23 * n44 - n24 * n43;
            const t22 = n22 * n44 - n24 * n42;
            const t23 = n22 * n43 - n23 * n42;
            const t24 = n21 * n44 - n24 * n41;
            const t25 = n21 * n43 - n23 * n41;
            const t26 = n21 * n42 - n22 * n41;

            const t31 = n23 * n34 - n24 * n33;
            const t32 = n22 * n34 - n24 * n32;
            const t33 = n22 * n33 - n23 * n32;
            const t34 = n21 * n34 - n24 * n31;
            const t35 = n21 * n33 - n23 * n31;
            const t36 = n21 * n32 - n22 * n31;

            // Column 0
            e[0] = c11 * invDet;
            e[1] = c12 * invDet;
            e[2] = c13 * invDet;
            e[3] = c14 * invDet;

            // Column 1
            e[4] = -(n12 * t11 - n13 * t12 + n14 * t13) * invDet;
            e[5] = (n11 * t11 - n13 * t14 + n14 * t15) * invDet;
            e[6] = -(n11 * t12 - n12 * t14 + n14 * t16) * invDet;
            e[7] = (n11 * t13 - n12 * t15 + n13 * t16) * invDet;

            // Column 2
            e[8] = (n12 * t21 - n13 * t22 + n14 * t23) * invDet;
            e[9] = -(n11 * t21 - n13 * t24 + n14 * t25) * invDet;
            e[10] = (n11 * t22 - n12 * t24 + n14 * t26) * invDet;
            e[11] = -(n11 * t23 - n12 * t25 + n13 * t26) * invDet;

            // Column 3
            e[12] = -(n12 * t31 - n13 * t32 + n14 * t33) * invDet;
            e[13] = (n11 * t31 - n13 * t34 + n14 * t35) * invDet;
            e[14] = -(n11 * t32 - n12 * t34 + n14 * t36) * invDet;
            e[15] = (n11 * t33 - n12 * t35 + n13 * t36) * invDet;

            return this;
        }

        // cheaper version of invert() for matrices without scaling
        public invertOrthonormal(): Mat4 {
            const e = this.e;

            // 1. Cache rotation matrix elements
            const m00 = e[0], m01 = e[4], m02 = e[8];
            const m10 = e[1], m11 = e[5], m12 = e[9];
            const m20 = e[2], m21 = e[6], m22 = e[10];

            // 2. Cache translation vector elements
            const tx = e[12], ty = e[13], tz = e[14];

            // 3. Transpose rotation 3x3 in-place (R^T)
            e[1] = m01; e[2] = m02;
            e[4] = m10; e[6] = m12;
            e[8] = m20; e[9] = m21;

            // 4. Compute new translation: -R^T * t
            e[12] = -(m00 * tx + m10 * ty + m20 * tz);
            e[13] = -(m01 * tx + m11 * ty + m21 * tz);
            e[14] = -(m02 * tx + m12 * ty + m22 * tz);

            // Bottom row remains [0, 0, 0, 1]
            e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;

            return this;
        }

        public determinant3(): number {
            const e = this.e;
            return (
                e[0] * (e[5] * e[10] - e[9] * e[6])
                - e[4] * (e[1] * e[10] - e[9] * e[2])
                + e[8] * (e[1] * e[6] - e[5] * e[2])
            );
        }

        public transpose(): Mat4 {
            const e = this.e;
            let tmp: number;
            // Row 0, Col 1 <-> Row 1, Col 0
            tmp = e[1]; e[1] = e[4]; e[4] = tmp;
            // Row 0, Col 2 <-> Row 2, Col 0
            tmp = e[2]; e[2] = e[8]; e[8] = tmp;
            // Row 0, Col 3 <-> Row 3, Col 0
            tmp = e[3]; e[3] = e[12]; e[12] = tmp;
            // Row 1, Col 2 <-> Row 2, Col 1
            tmp = e[6]; e[6] = e[9]; e[9] = tmp;
            // Row 1, Col 3 <-> Row 3, Col 1
            tmp = e[7]; e[7] = e[13]; e[13] = tmp;
            // Row 2, Col 3 <-> Row 3, Col 2
            tmp = e[11]; e[11] = e[14]; e[14] = tmp;
            return this;
        }

        public setPerspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
            const e = this.e;
            const f = 1 / Math.tan(fovY / 2);
            e[0] = f / aspect;
            e[1] = e[2] = e[3] = e[4] = 0;
            e[5] = f;
            e[6] = e[7] = e[8] = e[9] = 0;
            e[10] = (far + near) / (near - far);
            e[11] = -1;
            e[12] = e[13] = 0;
            e[14] = (2 * far * near) / (near - far);
            e[15] = 0;
            return this;
        }

        public setOrthographic(l: number, r: number, b: number, t: number, near: number, far: number): Mat4 {
            const e = this.e;
            e[0] = 2 / (r - l);
            e[1] = e[2] = e[3] = e[4] = 0;
            e[5] = 2 / (t - b);
            e[6] = e[7] = e[8] = e[9] = 0;
            e[10] = -2 / (far - near);
            e[11] = 0;
            e[12] = -(r + l) / (r - l);
            e[13] = -(t + b) / (t - b);
            e[14] = -(far + near) / (far - near);
            e[15] = 1;
            return this;
        }

        public extractNormalMat(out: Mat3): Mat3 {
            // Extract top-left 3x3 columns
            const a00 = this.e[0], a01 = this.e[1], a02 = this.e[2];
            const a10 = this.e[4], a11 = this.e[5], a12 = this.e[6];
            const a20 = this.e[8], a21 = this.e[9], a22 = this.e[10];

            // Calculate squared column lengths to check for uniform scaling
            const sx2 = a00 * a00 + a01 * a01 + a02 * a02;
            const sy2 = a10 * a10 + a11 * a11 + a12 * a12;
            const sz2 = a20 * a20 + a21 * a21 + a22 * a22;

            const outE = out.e;

            // Check if scales are uniform (sx² ≈ sy² ≈ sz²)
            if (Math.abs(sx2 - sy2) < 1e-12 * sx2 && Math.abs(sy2 - sz2) < 1e-12 * sy2) {
                // Fast path: normal matrix for uniform scale s is R / s, not R.
                // column = s * R_column, so column / s^2 = R_column / s. No sqrt needed.
                const invScaleSq = sx2 > 0 ? 1.0 / sx2 : 1.0;
                outE[0] = a00 * invScaleSq; outE[1] = a01 * invScaleSq; outE[2] = a02 * invScaleSq;
                outE[3] = a10 * invScaleSq; outE[4] = a11 * invScaleSq; outE[5] = a12 * invScaleSq;
                outE[6] = a20 * invScaleSq; outE[7] = a21 * invScaleSq; outE[8] = a22 * invScaleSq;
                return out;
            }

            // Slow Path: Non-uniform scale present — compute Inverse Transpose
            // Calculate minors (cofactors)
            const b00 = a11 * a22 - a12 * a21;
            const b01 = a12 * a20 - a10 * a22;
            const b02 = a10 * a21 - a11 * a20;

            const b10 = a02 * a21 - a01 * a22;
            const b11 = a00 * a22 - a02 * a20;
            const b12 = a01 * a20 - a00 * a21;

            const b20 = a01 * a12 - a02 * a11;
            const b21 = a02 * a10 - a00 * a12;
            const b22 = a00 * a11 - a01 * a10;

            let det = a00 * b00 + a01 * b01 + a02 * b02;

            if (det === 0) {
                return out; // Handle degenerate scale (scale factor of zero)
            }

            det = 1.0 / det;

            // Transposed-inverse matrix output
            outE[0] = b00 * det; outE[1] = b01 * det; outE[2] = b02 * det;
            outE[3] = b10 * det; outE[4] = b11 * det; outE[5] = b12 * det;
            outE[6] = b20 * det; outE[7] = b21 * det; outE[8] = b22 * det;

            return out;
        }

        public extractFrustumPlanes(out: Frustrum): Frustrum {
            const e = this.e;
            const r0x = e[0], r0y = e[4], r0z = e[8], r0w = e[12];
            const r1x = e[1], r1y = e[5], r1z = e[9], r1w = e[13];
            const r2x = e[2], r2y = e[6], r2z = e[10], r2w = e[14];
            const r3x = e[3], r3y = e[7], r3z = e[11], r3w = e[15];
            this._putPlane(out, 0, r3x + r0x, r3y + r0y, r3z + r0z, r3w + r0w);  // left
            this._putPlane(out, 4, r3x - r0x, r3y - r0y, r3z - r0z, r3w - r0w);  // right
            this._putPlane(out, 8, r3x + r1x, r3y + r1y, r3z + r1z, r3w + r1w);  // bottom
            this._putPlane(out, 12, r3x - r1x, r3y - r1y, r3z - r1z, r3w - r1w);  // top
            this._putPlane(out, 16, r3x + r2x, r3y + r2y, r3z + r2z, r3w + r2w);  // near
            this._putPlane(out, 20, r3x - r2x, r3y - r2y, r3z - r2z, r3w - r2w);  // far
            return out;
        }

        private _putPlane(frustrum: Frustrum, startIndex: number, a: number, b: number, c: number, d: number): void {
            const inv = 1 / Math.sqrt(a * a + b * b + c * c);
            const out = frustrum.p;
            out[startIndex] = a * inv;
            out[startIndex] = b * inv;
            out[startIndex] = c * inv;
            out[startIndex] = d * inv;
        }

        public maxScaleOnAxis(): number {
            const e = this.e;
            const x = e[0] * e[0] + e[1] * e[1] + e[2] * e[2];
            const y = e[4] * e[4] + e[5] * e[5] + e[6] * e[6];
            const z = e[8] * e[8] + e[9] * e[9] + e[10] * e[10];
            const m = x > y ? (x > z ? x : z) : (y > z ? y : z);
            return Math.sqrt(m);
        }
        
        public equals(m: Mat4, epsilon: number = 1e-6): boolean {
            const e = this.e;
            const me = m.e;
            return (
                Math.abs(e[0] - me[0]) < epsilon &&
                Math.abs(e[1] - me[1]) < epsilon &&
                Math.abs(e[2] - me[2]) < epsilon &&
                Math.abs(e[3] - me[3]) < epsilon &&
                Math.abs(e[4] - me[4]) < epsilon &&
                Math.abs(e[5] - me[5]) < epsilon &&
                Math.abs(e[6] - me[6]) < epsilon &&
                Math.abs(e[7] - me[7]) < epsilon &&
                Math.abs(e[8] - me[8]) < epsilon &&
                Math.abs(e[9] - me[9]) < epsilon &&
                Math.abs(e[10] - me[10]) < epsilon &&
                Math.abs(e[11] - me[11]) < epsilon &&
                Math.abs(e[12] - me[12]) < epsilon &&
                Math.abs(e[13] - me[13]) < epsilon &&
                Math.abs(e[14] - me[14]) < epsilon &&
                Math.abs(e[15] - me[15]) < epsilon
            );
        }
    }

    // tiny mat3 class just to store info for light normals
    export class Mat3 {
        public e: number[];  // 9, column-major

        constructor() {
            this.e = [1, 0, 0, 0, 1, 0, 0, 0, 1];
        }

        public identity(): Mat3 {
            const e = this.e;
            e.fill(0);
            e[0] = e[4] = e[8] = 1;
            return this;
        }

        public copy(m: Mat3): Mat3 {
            const e = this.e;
            const me = m.e;
            e[0] = me[0];
            e[1] = me[1];
            e[2] = me[2];
            e[3] = me[3];
            e[4] = me[4];
            e[5] = me[5];
            e[6] = me[6];
            e[7] = me[7];
            e[8] = me[8];
            return this;
        }

        public clone(): Mat3 {
            const m = new Mat3();
            m.copy(this);
            return m;
        }
    }

    // represents camera frustrum to help with culling
    export class Frustrum {
        public p: number[];

        public constructor() {
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
