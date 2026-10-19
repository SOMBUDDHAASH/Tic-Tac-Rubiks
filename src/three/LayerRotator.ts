import * as THREE from 'three';
import { RotationLayer, RotationDirection } from '../game/types';
import { LAYER_INFO } from '../game/constants';
import { CUBIE_SPACING, RubikCube } from './RubikCube';

export class LayerRotator {
  private rubikCube: RubikCube;
  public isAnimating: boolean = false;
  public isDragging: boolean = false;

  // Interactive drag state
  private activePivot: THREE.Group | null = null;
  private activeCubies: THREE.Group[] = [];
  private activeLayer: RotationLayer | null = null;
  private activeNormal: THREE.Vector3 = new THREE.Vector3();
  private currentDragAngle: number = 0;

  constructor(rubikCube: RubikCube) {
    this.rubikCube = rubikCube;
  }

  /**
   * Helper to retrieve all cubies belonging to a layer
   */
  public getCubiesInLayer(layer: RotationLayer): THREE.Group[] {
    const threshold = 0.5 * CUBIE_SPACING;
    const cubies: THREE.Group[] = [];

    this.rubikCube.cubieMeshes.forEach((cubie) => {
      let match = false;
      switch (layer) {
        case 'F': match = cubie.position.z > threshold; break;
        case 'B': match = cubie.position.z < -threshold; break;
        case 'R': match = cubie.position.x > threshold; break;
        case 'L': match = cubie.position.x < -threshold; break;
        case 'U': match = cubie.position.y > threshold; break;
        case 'D': match = cubie.position.y < -threshold; break;
        case 'M': match = Math.abs(cubie.position.x) < threshold; break;
        case 'E': match = Math.abs(cubie.position.y) < threshold; break;
        case 'S': match = Math.abs(cubie.position.z) < threshold; break;
      }
      if (match) cubies.push(cubie);
    });

    return cubies;
  }

  /**
   * Smoothly animates a layer rotation using pivot reparenting.
   */
  public rotate(
    layer: RotationLayer,
    dir: RotationDirection,
    durationMs: number = 260,
    onComplete?: () => void
  ) {
    if (this.isAnimating || this.isDragging) return;
    this.isAnimating = true;

    const root = this.rubikCube.rootGroup;
    const pivot = new THREE.Group();
    pivot.name = 'RotationPivot';
    root.add(pivot);

    const affectedCubies = this.getCubiesInLayer(layer);
    affectedCubies.forEach((cubie) => pivot.attach(cubie));

    const normal = LAYER_INFO[layer].normal.clone();
    // Clockwise looking from outside along normal is -dir * PI / 2
    const targetAngle = -dir * (Math.PI / 2);
    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);

      // Smooth cubic easing (easeInOutCubic)
      const ease =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      pivot.setRotationFromAxisAngle(normal, targetAngle * ease);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        pivot.setRotationFromAxisAngle(normal, targetAngle);
        this.finishPivot(pivot, affectedCubies);
        this.isAnimating = false;
        if (onComplete) onComplete();
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Begins real-time interactive layer twisting from a touch or mouse drag.
   */
  public startInteractiveDrag(layer: RotationLayer) {
    if (this.isAnimating || this.isDragging) return;
    this.isDragging = true;
    this.activeLayer = layer;
    this.currentDragAngle = 0;

    const root = this.rubikCube.rootGroup;
    this.activePivot = new THREE.Group();
    this.activePivot.name = 'InteractiveDragPivot';
    root.add(this.activePivot);

    this.activeCubies = this.getCubiesInLayer(layer);
    this.activeCubies.forEach((cubie) => this.activePivot!.attach(cubie));

    this.activeNormal = LAYER_INFO[layer].normal.clone();
  }

  /**
   * Updates the interactive layer twist angle in real time.
   */
  public updateInteractiveDrag(angleDelta: number) {
    if (!this.isDragging || !this.activePivot) return;
    this.currentDragAngle += angleDelta;
    // Clamp to at most +/- 135 degrees during a single drag
    const maxAngle = Math.PI * 0.75;
    this.currentDragAngle = Math.max(-maxAngle, Math.min(maxAngle, this.currentDragAngle));
    this.activePivot.setRotationFromAxisAngle(this.activeNormal, this.currentDragAngle);
  }

  /**
   * Releases the interactive drag, snapping cleanly to -90, 0, or +90 degrees.
   */
  public endInteractiveDrag(
    onFinished: (result: { layer: RotationLayer; dir: RotationDirection } | null) => void
  ) {
    if (!this.isDragging || !this.activePivot || !this.activeLayer) {
      this.isDragging = false;
      return;
    }

    const pivot = this.activePivot;
    const cubies = this.activeCubies;
    const layer = this.activeLayer;
    const normal = this.activeNormal;
    const startAngle = this.currentDragAngle;

    // Threshold angle to commit to a 90-degree twist (approx 26 degrees)
    const commitThreshold = 0.45;
    let targetAngle = 0;
    let resolvedDir: RotationDirection | 0 = 0;

    if (startAngle > commitThreshold) {
      targetAngle = Math.PI / 2;
      resolvedDir = -1; // -dir * PI / 2 = targetAngle
    } else if (startAngle < -commitThreshold) {
      targetAngle = -Math.PI / 2;
      resolvedDir = 1;
    } else {
      targetAngle = 0; // snap back / cancel
      resolvedDir = 0;
    }

    this.isDragging = false;
    this.isAnimating = true;

    // Animate snap to targetAngle with proportional duration and quadratic ease-in-out (Seb Lague style)
    const startTime = performance.now();
    const angleDelta = Math.abs(targetAngle - startAngle);
    const duration = Math.max(70, Math.min(220, (angleDelta / (Math.PI / 2)) * 220));

    const animateSnap = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Quadratic ease-in-out: t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t
      const ease =
        progress < 0.5 ? 2.0 * progress * progress : -1.0 + (4.0 - 2.0 * progress) * progress;

      const curAngle = THREE.MathUtils.lerp(startAngle, targetAngle, ease);
      pivot.setRotationFromAxisAngle(normal, curAngle);

      if (progress < 1) {
        requestAnimationFrame(animateSnap);
      } else {
        pivot.setRotationFromAxisAngle(normal, targetAngle);
        this.finishPivot(pivot, cubies);

        this.activePivot = null;
        this.activeCubies = [];
        this.activeLayer = null;
        this.isAnimating = false;

        if (resolvedDir !== 0) {
          onFinished({ layer, dir: resolvedDir });
        } else {
          onFinished(null);
        }
      }
    };

    requestAnimationFrame(animateSnap);
  }

  /**
   * Detaches cubies from pivot back to root and snaps matrices cleanly
   */
  private finishPivot(pivot: THREE.Group, cubies: THREE.Group[]) {
    const root = this.rubikCube.rootGroup;

    cubies.forEach((cubie) => {
      root.attach(cubie);

      // Snap position
      cubie.position.set(
        Math.round(cubie.position.x / CUBIE_SPACING) * CUBIE_SPACING,
        Math.round(cubie.position.y / CUBIE_SPACING) * CUBIE_SPACING,
        Math.round(cubie.position.z / CUBIE_SPACING) * CUBIE_SPACING
      );

      // Snap orientation to nearest 90-degree step
      const euler = new THREE.Euler().setFromQuaternion(cubie.quaternion, 'XYZ');
      euler.x = Math.round(euler.x / (Math.PI / 2)) * (Math.PI / 2);
      euler.y = Math.round(euler.y / (Math.PI / 2)) * (Math.PI / 2);
      euler.z = Math.round(euler.z / (Math.PI / 2)) * (Math.PI / 2);
      cubie.quaternion.setFromEuler(euler);
      cubie.updateMatrix();
    });

    root.remove(pivot);
  }
}
