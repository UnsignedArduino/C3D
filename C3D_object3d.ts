namespace C3D {
  export class Object3D {
    // position, rotation, and scale are the only authoritative state
    public readonly position: Vec3;
    public readonly rotation: Quat;
    public readonly scale: Vec3;

    public visible: boolean = true;

    public parent: Object3D;
    public readonly children: Object3D[];

    public constructor(public name = "object3d") {
      this.position = new Vec3();
      this.rotation = new Quat();
      this.scale = new Vec3(1, 1, 1);
      this.children = [];
      this.localMatrix = new Mat4();
      this.worldMatrix = new Mat4();
      this.parent = null;
      this._trsSnapshot = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }

    // does not change child's local matrix, update their world matrix
    public addChild(child: Object3D): Object3D {
      child._setParent(this, false);
      return this;
    }

    // does not change child's local matrix, update their world matrix
    public removeChild(child: Object3D): Object3D {
      if (child.parent === this) {
        child._setParent(null, false);
      }
      return this;
    }

    // does not change this object's world matrix, change the TRS
    attachToParent(parent: Object3D): Object3D {
      this._setParent(parent, true);
      return this;
    }

    // does not change this object's world matrix, change the TRS
    detachFromParent(): Object3D {
      this._setParent(null, true);
      return this;
    }

    public localMatrix: Mat4;
    public worldMatrix: Mat4;

    public matrixAutoUpdate = true;

    // public because setting an attribute is faster then going through func call like _markDirty
    // trs changed, recompose L, detected by snapshot compare or _setParent
    public _localDirty: boolean = true;
    // parent changed, L is fine, W must recompute
    public _worldDirty: boolean = true;

    private _mTmp: Mat4;

    private _setParent(newParent: Object3D, keepWorld: boolean): void {
      if (newParent === this.parent) {
        // throw "Cannot set parent to itself";
        return;
      }

      // reject cycles: newParent must not be this or a descendant of this
      let p = newParent;
      while (p) {
        if (p === this) {
          // throw "Cannot parent itself in tree";
          return;
        }
        p = p.parent;
      }

      if (keepWorld) {
        this._updateWorldUpward();
        if (newParent) newParent._updateWorldUpward();
      }

      if (this.parent) {
        const sibs = this.parent.children;
        const i = sibs.indexOf(this);
        if (i >= 0) sibs.splice(i, 1);
      }
      this.parent = newParent;
      if (newParent) newParent.children.push(this);

      if (keepWorld) {
        if (newParent && newParent.worldMatrix.determinant3() !== 0) {
          if (!this._mTmp) this._mTmp = new Mat4();
          this._mTmp.copy(newParent.worldMatrix).invert();
          this.localMatrix.multiplyAWithB(this._mTmp, this.worldMatrix);
        } else {
          // no parent, or parent has a collapsed scale axis: invert() would be
          // silently wrong, so keep the local matrix as a copy of world instead
          this.localMatrix.copy(this.worldMatrix);
        }
        this.localMatrix.decompose(this.position, this.rotation, this.scale);
        this._localDirty = true;   // recompose L from TRS next update, so they agree
      }
      this._worldDirty = true;
    }

    public updateWorldMatrix(force: boolean = false): void {
      let dirty = force || this._worldDirty;

      if (this.matrixAutoUpdate) {
        if (this._localDirty || this._trsChanged()) {
          this.localMatrix.compose(this.position, this.rotation, this.scale);
          this._snapshotTRS();
          this._localDirty = false;
          dirty = true;
        }
        if (dirty) {
          if (this.parent) this.worldMatrix.multiplyAWithB(this.parent.worldMatrix, this.localMatrix);
          else this.worldMatrix.copy(this.localMatrix);
        }
      } else {
        dirty = true;   // user wrote worldMatrix; children can't trust their cache
      }

      this._worldDirty = false;
      const children = this.children;
      const n = children.length;
      for (let i = 0; i < n; i++) children[i].updateWorldMatrix(dirty);
    }

    // walks UP the parent chain, refreshing world matrices so this.worldMatrix is
    // correct right now. deliberately does not touch dirty flags or snapshots —
    // see the note below. not valid to call on a node in a cycle.
    private _updateWorldUpward(): void {
      if (this.parent) this.parent._updateWorldUpward();
      if (!this.matrixAutoUpdate) return;
      if (this._localDirty || this._trsChanged()) {
        this.localMatrix.compose(this.position, this.rotation, this.scale);
      }
      if (this.parent) this.worldMatrix.multiplyAWithB(this.parent.worldMatrix, this.localMatrix);
      else this.worldMatrix.copy(this.localMatrix);
    }

    private _trsSnapshot: number[]

    public _trsChanged(): boolean {
      return (
        this._trsSnapshot[0] !== this.position.x ||
        this._trsSnapshot[1] !== this.position.y ||
        this._trsSnapshot[2] !== this.position.z ||

        this._trsSnapshot[3] !== this.rotation.x ||
        this._trsSnapshot[4] !== this.rotation.y ||
        this._trsSnapshot[5] !== this.rotation.z ||
        this._trsSnapshot[6] !== this.rotation.w ||

        this._trsSnapshot[7] !== this.scale.x ||
        this._trsSnapshot[8] !== this.scale.y ||
        this._trsSnapshot[9] !== this.scale.z
      );
    }

    public _snapshotTRS() {
      this._trsSnapshot[0] = this.position.x;
      this._trsSnapshot[1] = this.position.y;
      this._trsSnapshot[2] = this.position.z;

      this._trsSnapshot[3] = this.rotation.x;
      this._trsSnapshot[4] = this.rotation.y;
      this._trsSnapshot[5] = this.rotation.z;
      this._trsSnapshot[6] = this.rotation.w;

      this._trsSnapshot[7] = this.scale.x;
      this._trsSnapshot[8] = this.scale.y;
      this._trsSnapshot[9] = this.scale.z;
    }
  }
}
