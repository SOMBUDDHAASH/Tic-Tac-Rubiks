import * as THREE from 'three';
import { FaceId } from './types';

export const FACE_IDS: FaceId[] = ['F', 'B', 'L', 'R', 'U', 'D'];

export const FACE_INFO: Record<FaceId, { name: string; color: string; normal: THREE.Vector3 }> = {
  F: { name: 'Front', color: '#3f784c', normal: new THREE.Vector3(0, 0, 1) }, // Forest Wax Green
  B: { name: 'Back', color: '#436b95', normal: new THREE.Vector3(0, 0, -1) },  // Dusty Denim Blue
  L: { name: 'Left', color: '#d95d39', normal: new THREE.Vector3(-1, 0, 0) },  // Muted Terracotta Red
  R: { name: 'Right', color: '#e8b038', normal: new THREE.Vector3(1, 0, 0) }, // Rich Cadmium Yellow
  U: { name: 'Up', color: '#f7f4ea', normal: new THREE.Vector3(0, 1, 0) },    // Warm Chalk White
  D: { name: 'Down', color: '#b36b3e', normal: new THREE.Vector3(0, -1, 0) },  // Burnt Sienna Clay
};

// 8 Winning lines for 3x3 grid: [row, col]
export const WIN_LINES: [number, number][][] = [
  // Horizontal rows
  [[0, 0], [0, 1], [0, 2]],
  [[1, 0], [1, 1], [1, 2]],
  [[2, 0], [2, 1], [2, 2]],
  // Vertical columns
  [[0, 0], [1, 0], [2, 0]],
  [[0, 1], [1, 1], [2, 1]],
  [[0, 2], [1, 2], [2, 2]],
  // Diagonals
  [[0, 0], [1, 1], [2, 2]],
  [[0, 2], [1, 1], [2, 0]],
];

/**
 * Maps a 3D cubie coordinate (x, y, z in {-1, 0, 1}) on a given face
 * to that face's 2D grid coordinate (row, col in [0..2]).
 */
export function cubieToGrid(face: FaceId, x: number, y: number, z: number): { row: number; col: number } {
  const roundX = Math.round(x);
  const roundY = Math.round(y);
  const roundZ = Math.round(z);

  switch (face) {
    case 'F': // Front: look towards -Z. col: -1..1 -> 0..2, row: 1..-1 -> 0..2
      return { row: 1 - roundY, col: roundX + 1 };
    case 'B': // Back: look towards +Z. col: 1..-1 -> 0..2, row: 1..-1 -> 0..2
      return { row: 1 - roundY, col: 1 - roundX };
    case 'L': // Left: look towards +X. col: -1..1 (z) -> 0..2, row: 1..-1 -> 0..2
      return { row: 1 - roundY, col: roundZ + 1 };
    case 'R': // Right: look towards -X. col: 1..-1 (z) -> 0..2, row: 1..-1 -> 0..2
      return { row: 1 - roundY, col: 1 - roundZ };
    case 'U': // Up: look towards -Y. col: -1..1 (x) -> 0..2, row: -1..1 (z) -> 0..2
      return { row: roundZ + 1, col: roundX + 1 };
    case 'D': // Down: look towards +Y. col: -1..1 (x) -> 0..2, row: 1..-1 (z) -> 0..2
      return { row: 1 - roundZ, col: roundX + 1 };
  }
}

/**
 * Maps a face's 2D grid coordinate (row, col in [0..2]) back to the 3D cubie coordinate (x, y, z in {-1, 0, 1}).
 */
export function gridToCubie(face: FaceId, row: number, col: number): { x: number; y: number; z: number } {
  switch (face) {
    case 'F':
      return { x: col - 1, y: 1 - row, z: 1 };
    case 'B':
      return { x: 1 - col, y: 1 - row, z: -1 };
    case 'L':
      return { x: -1, y: 1 - row, z: col - 1 };
    case 'R':
      return { x: 1, y: 1 - row, z: 1 - col };
    case 'U':
      return { x: col - 1, y: 1, z: row - 1 };
    case 'D':
      return { x: col - 1, y: -1, z: 1 - row };
  }
}

export const LAYER_INFO: Record<
  import('./types').RotationLayer,
  { name: string; normal: THREE.Vector3; coordKey: 'x' | 'y' | 'z'; coordVal: number }
> = {
  F: { name: 'Front', normal: new THREE.Vector3(0, 0, 1), coordKey: 'z', coordVal: 1 },
  B: { name: 'Back', normal: new THREE.Vector3(0, 0, -1), coordKey: 'z', coordVal: -1 },
  L: { name: 'Left', normal: new THREE.Vector3(-1, 0, 0), coordKey: 'x', coordVal: -1 },
  R: { name: 'Right', normal: new THREE.Vector3(1, 0, 0), coordKey: 'x', coordVal: 1 },
  U: { name: 'Up', normal: new THREE.Vector3(0, 1, 0), coordKey: 'y', coordVal: 1 },
  D: { name: 'Down', normal: new THREE.Vector3(0, -1, 0), coordKey: 'y', coordVal: -1 },
  M: { name: 'Middle', normal: new THREE.Vector3(-1, 0, 0), coordKey: 'x', coordVal: 0 },
  E: { name: 'Equator', normal: new THREE.Vector3(0, -1, 0), coordKey: 'y', coordVal: 0 },
  S: { name: 'Standing', normal: new THREE.Vector3(0, 0, 1), coordKey: 'z', coordVal: 0 },
};

/**
 * Generates an authentic 20-move WCA-compliant scramble sequence.
 */
export function generateScramble(length: number = 20): string[] {
  const faces: FaceId[] = ['U', 'D', 'L', 'R', 'F', 'B'];
  const modifiers = ['', "'", '2'];
  const scramble: string[] = [];
  let lastFace = '';
  let secondLastFace = '';

  for (let i = 0; i < length; i++) {
    const validFaces = faces.filter((f) => {
      if (f === lastFace) return false;
      const isOpposite =
        (f === 'U' && lastFace === 'D') ||
        (f === 'D' && lastFace === 'U') ||
        (f === 'L' && lastFace === 'R') ||
        (f === 'R' && lastFace === 'L') ||
        (f === 'F' && lastFace === 'B') ||
        (f === 'B' && lastFace === 'F');
      if (isOpposite && f === secondLastFace) return false;
      return true;
    });

    const chosenFace = validFaces[Math.floor(Math.random() * validFaces.length)];
    const chosenMod = modifiers[Math.floor(Math.random() * modifiers.length)];
    scramble.push(`${chosenFace}${chosenMod}`);

    secondLastFace = lastFace;
    lastFace = chosenFace;
  }

  return scramble;
}
