import * as THREE from 'three';
import { CellCoord, FaceId, RotationLayer, RotationDirection } from '../game/types';
import { cubieToGrid } from '../game/constants';
import { RubikCube, StickerMesh, CUBIE_SPACING } from './RubikCube';
import { LayerRotator } from './LayerRotator';
import { SceneManager } from './SceneManager';

interface DragTarget {
  sticker: StickerMesh;
  cubiePos: { x: number; y: number; z: number };
  cubieWorldPos: THREE.Vector3;
  face: FaceId;
}

export class InteractionManager {
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private rubikCube: RubikCube;
  private layerRotator: LayerRotator;
  private sceneManager: SceneManager;

  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouse: THREE.Vector2 = new THREE.Vector2(-10, -10);

  // Gesture state
  private isPointerDown: boolean = false;
  private startPointerPos: { x: number; y: number } = { x: 0, y: 0 };
  private lastPointerPos: { x: number; y: number } = { x: 0, y: 0 };
  private dragTarget: DragTarget | null = null;
  private activeScreenTangent: THREE.Vector2 = new THREE.Vector2();
  private activeSign: number = 1;

  // Drag threshold increased to 12px for fat-finger friendliness on touch
  private readonly DRAG_THRESHOLD = 12;

  public onCellHover?: (cell: CellCoord | null) => void;
  public onCellClick?: (cell: CellCoord) => void;
  public onLayerRotated?: (layer: RotationLayer, dir: RotationDirection) => void;
  public enabled: boolean = true;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    rubikCube: RubikCube,
    layerRotator: LayerRotator,
    sceneManager: SceneManager
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.rubikCube = rubikCube;
    this.layerRotator = layerRotator;
    this.sceneManager = sceneManager;

    this.setupListeners();
  }

  private setupListeners() {
    this.domElement.addEventListener('pointermove', this.onPointerMove);
    this.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.domElement.addEventListener('pointerup', this.onPointerUp);
    this.domElement.addEventListener('pointerleave', this.onPointerLeave);
  }

  private updateMouseCoords(e: PointerEvent) {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private resolveCellFromSticker(sticker: StickerMesh): CellCoord | null {
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(sticker.matrixWorld);
    const worldNormal = new THREE.Vector3(0, 0, 1).applyMatrix3(normalMatrix).normalize();

    let face: FaceId | null = null;
    if (worldNormal.z > 0.8) face = 'F';
    else if (worldNormal.z < -0.8) face = 'B';
    else if (worldNormal.x > 0.8) face = 'R';
    else if (worldNormal.x < -0.8) face = 'L';
    else if (worldNormal.y > 0.8) face = 'U';
    else if (worldNormal.y < -0.8) face = 'D';

    if (!face) return null;

    const cubieGroup = sticker.parent;
    if (!cubieGroup) return null;
    const cubiePos = new THREE.Vector3();
    cubieGroup.getWorldPosition(cubiePos);

    const normX = Math.round(cubiePos.x / CUBIE_SPACING);
    const normY = Math.round(cubiePos.y / CUBIE_SPACING);
    const normZ = Math.round(cubiePos.z / CUBIE_SPACING);

    const { row, col } = cubieToGrid(face, normX, normY, normZ);
    return { face, row, col };
  }

  private getDragTarget(sticker: StickerMesh): DragTarget | null {
    const cubieGroup = sticker.parent;
    if (!cubieGroup) return null;

    const cubiePos = new THREE.Vector3();
    cubieGroup.getWorldPosition(cubiePos);
    const normX = Math.round(cubiePos.x / CUBIE_SPACING);
    const normY = Math.round(cubiePos.y / CUBIE_SPACING);
    const normZ = Math.round(cubiePos.z / CUBIE_SPACING);

    const cell = this.resolveCellFromSticker(sticker);
    if (!cell) return null;

    return {
      sticker,
      cubiePos: { x: normX, y: normY, z: normZ },
      cubieWorldPos: cubiePos,
      face: cell.face,
    };
  }

  private onPointerDown = (e: PointerEvent) => {
    // Accept left button (mouse) or any touch/pen pointer
    if (e.button !== 0 && e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (!this.enabled || this.layerRotator.isAnimating) return;

    this.updateMouseCoords(e);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.rubikCube.stickerMeshes, false);

    if (intersects.length > 0) {
      // Hit a cubie sticker: prepare for interactive layer drag or click!
      const sticker = intersects[0].object as StickerMesh;
      this.dragTarget = this.getDragTarget(sticker);

      if (this.dragTarget) {
        this.isPointerDown = true;
        this.startPointerPos = { x: e.clientX, y: e.clientY };
        this.lastPointerPos = { x: e.clientX, y: e.clientY };

        // Disable orbit while interacting with cube sticker
        this.sceneManager.setOrbitEnabled(false);
        return;
      }
    }

    // Clicked background: allow orbit controls to orbit camera
    this.sceneManager.setOrbitEnabled(true);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.enabled) return;

    // 1. If currently interactively twisting a layer
    if (this.layerRotator.isDragging) {
      const dx = e.clientX - this.lastPointerPos.x;
      const dy = e.clientY - this.lastPointerPos.y;
      const stepDelta = new THREE.Vector2(dx, dy);

      // Project mouse step along the active screen tangent
      const proj = stepDelta.dot(this.activeScreenTangent);
      // ~130 pixels of drag = 90 deg (PI / 2)
      const angleDelta = (proj / 130) * (Math.PI / 2) * this.activeSign;
      this.layerRotator.updateInteractiveDrag(angleDelta);

      this.lastPointerPos = { x: e.clientX, y: e.clientY };
      return;
    }

    // 2. If pointer down on a sticker, check if distance exceeded threshold to start drag
    if (this.isPointerDown && this.dragTarget && !this.layerRotator.isAnimating) {
      const totalDx = e.clientX - this.startPointerPos.x;
      const totalDy = e.clientY - this.startPointerPos.y;
      const dist = Math.hypot(totalDx, totalDy);

      if (dist > this.DRAG_THRESHOLD) {
        // Determine drag axis and layer
        this.initiateLayerDrag(totalDx, totalDy);
        this.lastPointerPos = { x: e.clientX, y: e.clientY };
        return;
      }
    }

    // 3. Otherwise, normal hover raycasting (skip on touch to avoid stutter)
    if (!this.isPointerDown && e.pointerType !== 'touch') {
      this.updateMouseCoords(e);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.rubikCube.stickerMeshes, false);

      if (intersects.length > 0) {
        const sticker = intersects[0].object as StickerMesh;
        this.rubikCube.setHoveredSticker(sticker);
        this.domElement.style.cursor = 'pointer';

        const cell = this.resolveCellFromSticker(sticker);
        if (this.onCellHover) this.onCellHover(cell);
      } else {
        this.rubikCube.setHoveredSticker(null);
        this.domElement.style.cursor = 'default';
        if (this.onCellHover) this.onCellHover(null);
      }
    }
  };

  private initiateLayerDrag(totalDx: number, totalDy: number) {
    if (!this.dragTarget) return;

    const { face, cubiePos, cubieWorldPos } = this.dragTarget;
    const { u3D, v3D } = this.getFaceTangents(face);

    // Project 3D tangents to 2D screen space
    const pOrigin = cubieWorldPos.clone().project(this.camera);
    const pU = cubieWorldPos.clone().add(u3D).project(this.camera);
    const pV = cubieWorldPos.clone().add(v3D).project(this.camera);

    const rect = this.domElement.getBoundingClientRect();
    const screenU = new THREE.Vector2(
      (pU.x - pOrigin.x) * (rect.width / 2),
      -(pU.y - pOrigin.y) * (rect.height / 2)
    ).normalize();

    const screenV = new THREE.Vector2(
      (pV.x - pOrigin.x) * (rect.width / 2),
      -(pV.y - pOrigin.y) * (rect.height / 2)
    ).normalize();

    const dragVec = new THREE.Vector2(totalDx, totalDy);
    const dotU = dragVec.dot(screenU);
    const dotV = dragVec.dot(screenV);

    let chosenLayer: RotationLayer;
    let sign: number;

    if (Math.abs(dotU) >= Math.abs(dotV)) {
      // Dragging along horizontal tangent U
      this.activeScreenTangent = screenU;
      const res = this.getLayerFromHorizontalDrag(face, cubiePos);
      chosenLayer = res.layer;
      sign = res.sign;
    } else {
      // Dragging along vertical tangent V
      this.activeScreenTangent = screenV;
      const res = this.getLayerFromVerticalDrag(face, cubiePos);
      chosenLayer = res.layer;
      sign = res.sign;
    }

    this.activeSign = sign;
    this.layerRotator.startInteractiveDrag(chosenLayer);

    // Apply the initial delta
    const proj = dragVec.dot(this.activeScreenTangent);
    const angleDelta = (proj / 130) * (Math.PI / 2) * this.activeSign;
    this.layerRotator.updateInteractiveDrag(angleDelta);
  }

  private getFaceTangents(face: FaceId): { u3D: THREE.Vector3; v3D: THREE.Vector3 } {
    switch (face) {
      case 'F':
        return { u3D: new THREE.Vector3(1, 0, 0), v3D: new THREE.Vector3(0, 1, 0) };
      case 'B':
        return { u3D: new THREE.Vector3(-1, 0, 0), v3D: new THREE.Vector3(0, 1, 0) };
      case 'R':
        return { u3D: new THREE.Vector3(0, 0, -1), v3D: new THREE.Vector3(0, 1, 0) };
      case 'L':
        return { u3D: new THREE.Vector3(0, 0, 1), v3D: new THREE.Vector3(0, 1, 0) };
      case 'U':
        return { u3D: new THREE.Vector3(1, 0, 0), v3D: new THREE.Vector3(0, 0, -1) };
      case 'D':
        return { u3D: new THREE.Vector3(1, 0, 0), v3D: new THREE.Vector3(0, 0, 1) };
    }
  }

  private getLayerFromHorizontalDrag(
    face: FaceId,
    pos: { x: number; y: number; z: number }
  ): { layer: RotationLayer; sign: number } {
    switch (face) {
      case 'F':
        if (pos.y === 1) return { layer: 'U', sign: 1 };
        if (pos.y === 0) return { layer: 'E', sign: -1 };
        return { layer: 'D', sign: -1 };
      case 'B':
        if (pos.y === 1) return { layer: 'U', sign: -1 };
        if (pos.y === 0) return { layer: 'E', sign: 1 };
        return { layer: 'D', sign: 1 };
      case 'R':
        if (pos.y === 1) return { layer: 'U', sign: 1 };
        if (pos.y === 0) return { layer: 'E', sign: -1 };
        return { layer: 'D', sign: -1 };
      case 'L':
        if (pos.y === 1) return { layer: 'U', sign: 1 };
        if (pos.y === 0) return { layer: 'E', sign: -1 };
        return { layer: 'D', sign: -1 };
      case 'U':
        if (pos.z === 1) return { layer: 'F', sign: 1 };
        if (pos.z === 0) return { layer: 'S', sign: 1 };
        return { layer: 'B', sign: -1 };
      case 'D':
        if (pos.z === 1) return { layer: 'F', sign: -1 };
        if (pos.z === 0) return { layer: 'S', sign: -1 };
        return { layer: 'B', sign: 1 };
    }
  }

  private getLayerFromVerticalDrag(
    face: FaceId,
    pos: { x: number; y: number; z: number }
  ): { layer: RotationLayer; sign: number } {
    switch (face) {
      case 'F':
        if (pos.x === 1) return { layer: 'R', sign: 1 };
        if (pos.x === 0) return { layer: 'M', sign: -1 };
        return { layer: 'L', sign: -1 };
      case 'B':
        if (pos.x === 1) return { layer: 'R', sign: -1 };
        if (pos.x === 0) return { layer: 'M', sign: 1 };
        return { layer: 'L', sign: 1 };
      case 'R':
        if (pos.z === 1) return { layer: 'F', sign: -1 };
        if (pos.z === 0) return { layer: 'S', sign: -1 };
        return { layer: 'B', sign: 1 };
      case 'L':
        if (pos.z === 1) return { layer: 'F', sign: 1 };
        if (pos.z === 0) return { layer: 'S', sign: 1 };
        return { layer: 'B', sign: -1 };
      case 'U':
        if (pos.x === 1) return { layer: 'R', sign: 1 };
        if (pos.x === 0) return { layer: 'M', sign: -1 };
        return { layer: 'L', sign: -1 };
      case 'D':
        if (pos.x === 1) return { layer: 'R', sign: 1 };
        if (pos.x === 0) return { layer: 'M', sign: -1 };
        return { layer: 'L', sign: -1 };
    }
  }

  private onPointerUp = (e: PointerEvent) => {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;
    this.sceneManager.setOrbitEnabled(true);

    // 1. If we were actively dragging a layer in real time:
    if (this.layerRotator.isDragging) {
      this.layerRotator.endInteractiveDrag((res) => {
        if (res && this.onLayerRotated) {
          this.onLayerRotated(res.layer, res.dir);
        }
      });
      this.dragTarget = null;
      return;
    }

    // 2. Otherwise, check if this was a quick tap/click on a sticker
    const dist = Math.hypot(e.clientX - this.startPointerPos.x, e.clientY - this.startPointerPos.y);
    if (dist <= this.DRAG_THRESHOLD && this.dragTarget) {
      const cell = this.resolveCellFromSticker(this.dragTarget.sticker);
      if (cell && this.onCellClick) {
        this.onCellClick(cell);
      }
    }

    this.dragTarget = null;
  };

  private onPointerLeave = () => {
    if (this.layerRotator.isDragging) {
      this.layerRotator.endInteractiveDrag((res) => {
        if (res && this.onLayerRotated) {
          this.onLayerRotated(res.layer, res.dir);
        }
      });
    }
    this.isPointerDown = false;
    this.dragTarget = null;
    this.sceneManager.setOrbitEnabled(true);
    this.rubikCube.setHoveredSticker(null);
    this.domElement.style.cursor = 'default';
    if (this.onCellHover) this.onCellHover(null);
  };

  public dispose() {
    this.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.domElement.removeEventListener('pointerleave', this.onPointerLeave);
  }
}
