import * as THREE from 'three';
import { FaceId, Player } from '../game/types';
import { FACE_INFO } from '../game/constants';
import { LocalFace, LOCAL_FACES } from '../game/BoardEngine';

export const CUBIE_SIZE = 0.96;
export const CUBIE_SPACING = 1.02;

export interface StickerMesh extends THREE.Mesh {
  userData: {
    isSticker: true;
    cubieId: string;
    localFace: LocalFace;
    currentFace?: FaceId;
    row?: number;
    col?: number;
  };
}

export class RubikCube {
  public rootGroup: THREE.Group;
  public cubieMeshes: Map<string, THREE.Group> = new Map();
  public stickerMeshes: StickerMesh[] = [];
  public pieceMeshes: Map<string, THREE.Object3D> = new Map(); // key: `${cubieId}_${localFace}`

  // Shared Geometries & Materials for high performance
  private cubieGeometry: THREE.BoxGeometry;
  private cubieMaterial: THREE.MeshStandardMaterial;
  private stickerGeometry: THREE.PlaneGeometry;
  private baseStickerMaterials: Record<FaceId, THREE.MeshStandardMaterial>;
  private oGeometry: THREE.TorusGeometry;
  private xMaterial: THREE.MeshStandardMaterial;
  private oMaterial: THREE.MeshStandardMaterial;

  private hoveredSticker: StickerMesh | null = null;

  constructor() {
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'RubikCube';

    // 1. Geometries
    this.cubieGeometry = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);
    this.cubieMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b221b, // Burnt Umber / Dark Craft Cardboard Core
      roughness: 0.75,
      metalness: 0.02,
    });

    this.stickerGeometry = new THREE.PlaneGeometry(CUBIE_SIZE * 0.88, CUBIE_SIZE * 0.88);

    // 2. Sticker Materials with rich Oil Pastel & Crayon texture
    this.baseStickerMaterials = {
      F: this.createOilPastelMaterial(FACE_INFO.F.color),
      B: this.createOilPastelMaterial(FACE_INFO.B.color),
      L: this.createOilPastelMaterial(FACE_INFO.L.color),
      R: this.createOilPastelMaterial(FACE_INFO.R.color),
      U: this.createOilPastelMaterial(FACE_INFO.U.color),
      D: this.createOilPastelMaterial(FACE_INFO.D.color),
    };

    // 3. Piece Glyphs: Vivid Crayon Pigments (Chunky Terracotta Red X & Forest Wax Green O)
    this.oGeometry = new THREE.TorusGeometry(0.24, 0.065, 18, 36);

    this.xMaterial = new THREE.MeshStandardMaterial({
      color: 0xd94e34, // Chunky Terracotta Red Wax Crayon
      roughness: 0.55,
      metalness: 0.05,
    });

    this.oMaterial = new THREE.MeshStandardMaterial({
      color: 0x38824a, // Vibrant Forest Wax Green Crayon
      roughness: 0.55,
      metalness: 0.05,
    });

    this.buildCube();
  }

  private createOilPastelMaterial(colorHex: string): THREE.MeshStandardMaterial {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // 1. Warm textured craft paper base layer (peaks through heavy crayon grain)
    ctx.fillStyle = '#f5efe3';
    ctx.fillRect(0, 0, size, size);

    // 2. Base heavy oil pastel fill
    ctx.fillStyle = colorHex;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(0, 0, size, size);

    // 3. Multi-pass diagonal and cross-hatch oil pastel strokes
    const strokeAngles = [-Math.PI / 4, -Math.PI / 4 + 0.1, -Math.PI / 4 - 0.1, Math.PI / 6];
    for (const angle of strokeAngles) {
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.rotate(angle);
      ctx.translate(-size / 2, -size / 2);

      // Thick waxy crayon bands
      for (let i = -size * 0.5; i < size * 1.5; i += 7 + Math.random() * 4) {
        ctx.fillStyle = Math.random() > 0.4 ? colorHex : 'rgba(255, 255, 255, 0.18)';
        ctx.globalAlpha = 0.15 + Math.random() * 0.25;
        ctx.fillRect(-size * 0.5, i, size * 2, 4 + Math.random() * 6);
      }
      ctx.restore();
    }

    // 4. Heavy waxy grain & paper tooth speckling (simulates oil pastel wax buildup)
    for (let i = 0; i < 900; i++) {
      const isHighlight = Math.random() > 0.5;
      ctx.fillStyle = isHighlight
        ? `rgba(255, 255, 255, ${0.08 + Math.random() * 0.15})`
        : `rgba(0, 0, 0, ${0.06 + Math.random() * 0.12})`;
      const px = Math.random() * size;
      const py = Math.random() * size;
      const r = Math.random() * 2.2 + 0.6;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Hand-colored ragged border vignette (crayon pressure near edges)
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#2b221b';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, size - 6, size - 6);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }

  private buildCube() {
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue; // center core

          const cubieId = `c_${x}_${y}_${z}`;
          const cubieGroup = new THREE.Group();
          cubieGroup.name = cubieId;
          cubieGroup.position.set(x * CUBIE_SPACING, y * CUBIE_SPACING, z * CUBIE_SPACING);

          // Base black plastic core
          const coreMesh = new THREE.Mesh(this.cubieGeometry, this.cubieMaterial);
          coreMesh.castShadow = true;
          coreMesh.receiveShadow = true;
          cubieGroup.add(coreMesh);

          // Add stickers to outer facelets
          this.attachStickersToCubie(cubieGroup, cubieId, x, y, z);

          this.rootGroup.add(cubieGroup);
          this.cubieMeshes.set(cubieId, cubieGroup);
        }
      }
    }
  }

  private attachStickersToCubie(cubieGroup: THREE.Group, cubieId: string, x: number, y: number, z: number) {
    const half = CUBIE_SIZE / 2 + 0.002;

    const addSticker = (lf: LocalFace, pos: THREE.Vector3, rot: THREE.Euler, initialFace: FaceId) => {
      const mat = this.baseStickerMaterials[initialFace].clone();
      const sticker = (new THREE.Mesh(this.stickerGeometry, mat) as unknown) as StickerMesh;
      sticker.position.copy(pos);
      sticker.rotation.copy(rot);
      sticker.castShadow = false;
      sticker.receiveShadow = true;
      sticker.userData = {
        isSticker: true,
        cubieId,
        localFace: lf,
      };

      cubieGroup.add(sticker);
      this.stickerMeshes.push(sticker);
    };

    if (x === 1) addSticker('+X', new THREE.Vector3(half, 0, 0), new THREE.Euler(0, Math.PI / 2, 0), 'R');
    if (x === -1) addSticker('-X', new THREE.Vector3(-half, 0, 0), new THREE.Euler(0, -Math.PI / 2, 0), 'L');
    if (y === 1) addSticker('+Y', new THREE.Vector3(0, half, 0), new THREE.Euler(-Math.PI / 2, 0, 0), 'U');
    if (y === -1) addSticker('-Y', new THREE.Vector3(0, -half, 0), new THREE.Euler(Math.PI / 2, 0, 0), 'D');
    if (z === 1) addSticker('+Z', new THREE.Vector3(0, 0, half), new THREE.Euler(0, 0, 0), 'F');
    if (z === -1) addSticker('-Z', new THREE.Vector3(0, 0, -half), new THREE.Euler(0, Math.PI, 0), 'B');
  }

  /**
   * Spawns a 3D embossed glyph ('X' or 'O') on a cubie's local facelet.
   */
  public addPieceMesh(cubieId: string, localFace: LocalFace, player: Player) {
    const cubieGroup = this.cubieMeshes.get(cubieId);
    if (!cubieGroup) return;

    const key = `${cubieId}_${localFace}`;
    // Remove existing if any
    if (this.pieceMeshes.has(key)) {
      const existing = this.pieceMeshes.get(key)!;
      if (existing.parent) existing.parent.remove(existing);
      this.pieceMeshes.delete(key);
    }

    const pieceObj = new THREE.Group();
    pieceObj.name = `Piece_${key}`;
    const half = CUBIE_SIZE / 2 + 0.055; // Generous clearance above sticker plane

    if (player === 'X') {
      const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.06), this.xMaterial);
      bar1.rotation.z = Math.PI / 4;
      bar1.castShadow = true;
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.06), this.xMaterial);
      bar2.rotation.z = -Math.PI / 4;
      bar2.castShadow = true;
      pieceObj.add(bar1);
      pieceObj.add(bar2);
    } else {
      const ring = new THREE.Mesh(this.oGeometry, this.oMaterial);
      ring.castShadow = true;
      pieceObj.add(ring);
    }

    // Position and orient piece on the local face
    switch (localFace) {
      case '+X':
        pieceObj.position.set(half, 0, 0);
        pieceObj.rotation.set(0, Math.PI / 2, 0);
        break;
      case '-X':
        pieceObj.position.set(-half, 0, 0);
        pieceObj.rotation.set(0, -Math.PI / 2, 0);
        break;
      case '+Y':
        pieceObj.position.set(0, half, 0);
        pieceObj.rotation.set(-Math.PI / 2, 0, 0);
        break;
      case '-Y':
        pieceObj.position.set(0, -half, 0);
        pieceObj.rotation.set(Math.PI / 2, 0, 0);
        break;
      case '+Z':
        pieceObj.position.set(0, 0, half);
        pieceObj.rotation.set(0, 0, 0);
        break;
      case '-Z':
        pieceObj.position.set(0, 0, -half);
        pieceObj.rotation.set(0, Math.PI, 0);
        break;
    }

    cubieGroup.add(pieceObj);
    this.pieceMeshes.set(key, pieceObj);

    // Pop-in scale animation
    pieceObj.scale.set(0.01, 0.01, 0.01);
    let progress = 0;
    const animatePop = () => {
      progress += 0.16;
      const s = THREE.MathUtils.lerp(0.01, 1.0, Math.min(progress, 1));
      pieceObj.scale.set(s, s, s);
      if (progress < 1) {
        requestAnimationFrame(animatePop);
      }
    };
    animatePop();
  }

  /**
   * Synchronizes all 3D piece meshes on the Rubik's cube with the logical board engine state.
   * Guarantees that no piece can ever disappear regardless of layer rotations or UI updates.
   */
  public syncPieces(cubies: { id: string; pieces: Record<LocalFace, Player | null> }[]) {
    const activeKeys = new Set<string>();

    for (const cubie of cubies) {
      for (const lf of LOCAL_FACES) {
        const player = cubie.pieces[lf];
        if (player) {
          const key = `${cubie.id}_${lf}`;
          activeKeys.add(key);
          if (!this.pieceMeshes.has(key)) {
            this.addPieceMesh(cubie.id, lf, player);
          }
        }
      }
    }

    // Clean up any stale meshes
    for (const [key, mesh] of Array.from(this.pieceMeshes.entries())) {
      if (!activeKeys.has(key)) {
        if (mesh.parent) {
          mesh.parent.remove(mesh);
        }
        this.pieceMeshes.delete(key);
      }
    }
  }

  /**
   * Highlights or clears hover glow on stickers
   */
  public setHoveredSticker(sticker: StickerMesh | null) {
    if (this.hoveredSticker && this.hoveredSticker !== sticker) {
      // Restore standard emissive
      (this.hoveredSticker.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
      (this.hoveredSticker.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
    }

    this.hoveredSticker = sticker;
    if (this.hoveredSticker) {
      const mat = this.hoveredSticker.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(0xe8b038); // Warm wax crayon yellow glow
      mat.emissiveIntensity = 0.45;
    }
  }

  /**
   * Resets all pieces and sticker glows for a new match
   */
  public reset() {
    for (const [, mesh] of this.pieceMeshes) {
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
    }
    this.pieceMeshes.clear();
    this.setHoveredSticker(null);

    // Reset cubie positions and rotations
    for (const [id, group] of this.cubieMeshes) {
      const parts = id.split('_');
      const x = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      const z = parseInt(parts[3], 10);
      group.position.set(x * CUBIE_SPACING, y * CUBIE_SPACING, z * CUBIE_SPACING);
      group.rotation.set(0, 0, 0);
      group.quaternion.identity();
    }
  }

  /**
   * Restores cubie positions and normals from a BoardEngine cubie state array (used during Undo/Rewind).
   */
  public restoreFromEngine(cubies: { id: string; pos: { x: number; y: number; z: number }; normals: Record<LocalFace, { x: number; y: number; z: number }>; pieces: Record<LocalFace, Player | null> }[]) {
    for (const c of cubies) {
      const group = this.cubieMeshes.get(c.id);
      if (!group) continue;
      group.position.set(c.pos.x * CUBIE_SPACING, c.pos.y * CUBIE_SPACING, c.pos.z * CUBIE_SPACING);

      // Construct rotation matrix from current world normals for local +X, +Y, +Z
      const nx = c.normals['+X'];
      const ny = c.normals['+Y'];
      const nz = c.normals['+Z'];
      const m = new THREE.Matrix4().set(
        nx.x, ny.x, nz.x, 0,
        nx.y, ny.y, nz.y, 0,
        nx.z, ny.z, nz.z, 0,
        0, 0, 0, 1
      );
      group.quaternion.setFromRotationMatrix(m);
      group.updateMatrix();
    }

    // Synchronize all piece glyph meshes
    this.syncPieces(cubies);
  }
}
