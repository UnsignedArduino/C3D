namespace C3D {
    export function clamp(x: number, minimum: number, maximum: number): number {
        return x < minimum ? minimum : (x > maximum ? maximum : x);
    }

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
            if (mSq < 1e-6) {
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

        static readonly UP = new Vec3(0, 1, 0);
        static readonly FORWARD = new Vec3(0, 0, -1);
        static readonly RIGHT = new Vec3(1, 0, 0);

        // static _up: Vec3;
        // static _forward: Vec3;
        // static _right: Vec3

        // static get UP(): Vec3 {
        //     if (!Vec3._up) {
        //         Vec3._up = new Vec3(0, 1, 0);
        //     }
        //     return Vec3._up;
        // }

        // static get FORWARD(): Vec3 {
        //     if (!Vec3._forward) {
        //         Vec3._forward = new Vec3(0, 0, -1);
        //     }
        //     return Vec3._forward;
        // }

        // static get RIGHT(): Vec3 {
        //     if (!Vec3._right) {
        //         Vec3._right = new Vec3(1, 0, 0);
        //     }
        //     return Vec3._right;
        // }
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

        public setFromUnitVectors(from_vec: Vec3, to_vec: Vec3): Quat {
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
                const axis = (new Vec3()).crossAWithB(from_vec, ortho);
                this.x = axis.x;
                this.y = axis.y;
                this.z = axis.z;
                this.w = 0;
            // normal case
            } else {
                const axis = (new Vec3()).crossAWithB(from_vec, to_vec);
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

        public setLookRotationFromUnitVectors(forward: Vec3, up: Vec3): Quat {
            const z = forward.clone().negate(); // must be normalized
            const x = new Vec3().crossAWithB(forward, up);
            if (x.lengthSquared() < 1e-8) {
                // forward is (nearly) parallel or anti-parallel to up — 'up' is
                // degenerate here, so fall back to whichever world axis is
                // farthest from forward and rebuild x from that instead.
                const fallback = Math.abs(forward.x) < 0.9 ? Vec3.RIGHT : Vec3.UP;
                x.crossAWithB(forward, fallback);
            }
            x.normalize();
            // recompute true up
            const y = (new Vec3()).crossAWithB(z, x);
            const m = new Mat4();
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
            this.x *= -1;
            this.y *= -1;
            this.z *= -1;
            return this;
        }

        public invert(): Quat {
            const mSq = this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
            if (mSq < 1e-6) {
                this.x = this.y = this.z = 0;
                this.w = 1;
                return this;
            }
            const negOneOverMSq = -1 / mSq;
            this.x *= negOneOverMSq;
            this.y *= negOneOverMSq;
            this.z *= negOneOverMSq;
            this.w /= mSq;
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
    }

    export enum EulerOrder { XYZ, YXZ, ZXY, ZYX, YZX, XZY }

}
