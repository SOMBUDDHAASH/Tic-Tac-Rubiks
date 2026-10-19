import * as THREE from 'three';
import confetti from 'canvas-confetti';
import { Player, FaceId } from '../game/types';
import { gridToCubie } from '../game/constants';
import { CUBIE_SPACING } from './RubikCube';

export class ParticleSystem {
  private scene: THREE.Scene;
  private winBeamObjects: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Spawns a glowing 3D laser beam connecting the 3 winning cubies
   */
  public addWinningLineLaser(face: FaceId, line: [number, number][], winner: Player) {
    const group = new THREE.Group();
    group.name = `WinLaser_${face}`;

    // Get 3D coordinates for start, middle, and end
    const pStart = gridToCubie(face, line[0][0], line[0][1]);
    const pEnd = gridToCubie(face, line[2][0], line[2][1]);

    const vStart = new THREE.Vector3(
      pStart.x * CUBIE_SPACING,
      pStart.y * CUBIE_SPACING,
      pStart.z * CUBIE_SPACING
    );
    const vEnd = new THREE.Vector3(
      pEnd.x * CUBIE_SPACING,
      pEnd.y * CUBIE_SPACING,
      pEnd.z * CUBIE_SPACING
    );

    // Offset slightly outward from the face surface
    const offsetDist = 0.54;
    switch (face) {
      case 'F': vStart.z += offsetDist; vEnd.z += offsetDist; break;
      case 'B': vStart.z -= offsetDist; vEnd.z -= offsetDist; break;
      case 'R': vStart.x += offsetDist; vEnd.x += offsetDist; break;
      case 'L': vStart.x -= offsetDist; vEnd.x -= offsetDist; break;
      case 'U': vStart.y += offsetDist; vEnd.y += offsetDist; break;
      case 'D': vStart.y -= offsetDist; vEnd.y -= offsetDist; break;
    }

    const direction = new THREE.Vector3().subVectors(vEnd, vStart);
    const length = direction.length();
    const center = new THREE.Vector3().addVectors(vStart, vEnd).multiplyScalar(0.5);

    const laserColor = winner === 'X' ? 0xc85a32 : 0x588157;

    // Glowing core cylinder (tactile warm beam)
    const geom = new THREE.CylinderGeometry(0.035, 0.035, length, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: laserColor,
      transparent: true,
      opacity: 0.9,
    });
    const cylinder = new THREE.Mesh(geom, mat);

    // Orient cylinder along the direction vector
    cylinder.position.copy(center);
    cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    group.add(cylinder);

    // Outer soft aura cylinder in warm antique gold
    const auraGeom = new THREE.CylinderGeometry(0.09, 0.09, length, 16);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xd4a373,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
    });
    const aura = new THREE.Mesh(auraGeom, auraMat);
    aura.position.copy(center);
    aura.quaternion.copy(cylinder.quaternion);
    group.add(aura);

    this.scene.add(group);
    this.winBeamObjects.push(group);

    // Small celebratory confetti burst
    this.triggerBoardConfetti(winner);
  }

  /**
   * Screen confetti burst for board win (earthy, paper-like palette)
   */
  public triggerBoardConfetti(winner: Player) {
    const colors =
      winner === 'X'
        ? ['#c85a32', '#f5ede1', '#d4a373', '#df7652']
        : ['#588157', '#f5ede1', '#d4a373', '#729b71'];
    confetti({
      particleCount: 45,
      spread: 55,
      origin: { y: 0.6 },
      colors,
      zIndex: 9999,
    });
  }

  /**
   * Celebratory confetti for overall match victory
   */
  public triggerVictoryConfetti(winner: Player) {
    const colors =
      winner === 'X'
        ? ['#c85a32', '#df7652', '#d4a373', '#f5ede1', '#b07d62']
        : ['#588157', '#729b71', '#d4a373', '#f5ede1', '#b07d62'];
    const duration = 2200;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 7,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
        zIndex: 9999,
      });
      confetti({
        particleCount: 7,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
        zIndex: 9999,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  }

  /**
   * Clears winning laser beams
   */
  public clear() {
    for (const obj of this.winBeamObjects) {
      this.scene.remove(obj);
    }
    this.winBeamObjects = [];
  }
}
