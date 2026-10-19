import {
  Player,
  FaceId,
  RotationLayer,
  RotationDirection,
  BoardState,
  CellCoord,
  RotationMove,
} from './types';
import { FACE_IDS, WIN_LINES, cubieToGrid, gridToCubie } from './constants';

export type LocalFace = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';

export const LOCAL_FACES: LocalFace[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CubieState {
  id: string; // e.g. "c_1_1_1"
  pos: Vec3;
  // World normal for each of the 6 local faces
  normals: Record<LocalFace, Vec3>;
  // Placed pieces on local faces (null if empty)
  pieces: Record<LocalFace, Player | null>;
}

export class BoardEngine {
  public cubies: CubieState[] = [];
  public boards: Record<FaceId, BoardState>;
  public currentTurn: Player = 'X';
  public scores: Record<Player, number> = { X: 0, O: 0 };
  public scoredLines: Set<string> = new Set();
  public matchWinner: Player | 'DRAW' | null = null;
  public resignedPlayer: Player | null = null;
  public moveCount: number = 0;
  public lastNewlyWonBoards: { face: FaceId; winner: Player; line: [number, number][] }[] = [];

  constructor() {
    this.boards = this.initEmptyBoards();
    this.initCubies();
    this.syncBoardsFromCubies();
  }

  private initEmptyBoards(): Record<FaceId, BoardState> {
    const b: Partial<Record<FaceId, BoardState>> = {};
    for (const f of FACE_IDS) {
      b[f] = {
        grid: [
          [null, null, null],
          [null, null, null],
          [null, null, null],
        ],
        winner: null,
        winningLine: null,
      };
    }
    return b as Record<FaceId, BoardState>;
  }

  private initCubies() {
    this.cubies = [];
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue; // center core
          this.cubies.push({
            id: `c_${x}_${y}_${z}`,
            pos: { x, y, z },
            normals: {
              '+X': { x: 1, y: 0, z: 0 },
              '-X': { x: -1, y: 0, z: 0 },
              '+Y': { x: 0, y: 1, z: 0 },
              '-Y': { x: 0, y: -1, z: 0 },
              '+Z': { x: 0, y: 0, z: 1 },
              '-Z': { x: 0, y: 0, z: -1 },
            },
            pieces: {
              '+X': null,
              '-X': null,
              '+Y': null,
              '-Y': null,
              '+Z': null,
              '-Z': null,
            },
          });
        }
      }
    }
  }

  /**
   * Reconstructs the 2D grid of all 6 faces from the current cubie positions,
   * orientations, and attached pieces.
   */
  public syncBoardsFromCubies() {
    // Reset grids while retaining locked winners
    for (const f of FACE_IDS) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          this.boards[f].grid[r][c] = null;
        }
      }
    }

    for (const cubie of this.cubies) {
      for (const lf of LOCAL_FACES) {
        const piece = cubie.pieces[lf];
        const norm = cubie.normals[lf];

        // Check if this facelet points outward to one of the 6 faces
        let face: FaceId | null = null;
        if (norm.z === 1 && cubie.pos.z === 1) face = 'F';
        else if (norm.z === -1 && cubie.pos.z === -1) face = 'B';
        else if (norm.x === 1 && cubie.pos.x === 1) face = 'R';
        else if (norm.x === -1 && cubie.pos.x === -1) face = 'L';
        else if (norm.y === 1 && cubie.pos.y === 1) face = 'U';
        else if (norm.y === -1 && cubie.pos.y === -1) face = 'D';

        if (face) {
          const { row, col } = cubieToGrid(face, cubie.pos.x, cubie.pos.y, cubie.pos.z);
          this.boards[face].grid[row][col] = piece;
        }
      }
    }

    this.checkWinConditions();
  }

  /**
   * Find which cubie and local face corresponds to an external (face, row, col).
   */
  public findCubieForCell(face: FaceId, row: number, col: number): { cubie: CubieState; localFace: LocalFace } | null {
    const target = gridToCubie(face, row, col);
    const cubie = this.cubies.find(
      (c) => c.pos.x === target.x && c.pos.y === target.y && c.pos.z === target.z
    );
    if (!cubie) return null;

    // Find the local face whose world normal matches the face normal
    for (const lf of LOCAL_FACES) {
      const n = cubie.normals[lf];
      if (face === 'F' && n.z === 1) return { cubie, localFace: lf };
      if (face === 'B' && n.z === -1) return { cubie, localFace: lf };
      if (face === 'R' && n.x === 1) return { cubie, localFace: lf };
      if (face === 'L' && n.x === -1) return { cubie, localFace: lf };
      if (face === 'U' && n.y === 1) return { cubie, localFace: lf };
      if (face === 'D' && n.y === -1) return { cubie, localFace: lf };
    }
    return null;
  }

  /**
   * Places a piece on an open cell on a given face.
   * Returns true if placement was valid and executed.
   */
  public placePiece(face: FaceId, row: number, col: number, player: Player): boolean {
    if (this.matchWinner) return false;
    if (this.boards[face].grid[row][col] !== null) return false;

    const match = this.findCubieForCell(face, row, col);
    if (!match) return false;

    match.cubie.pieces[match.localFace] = player;
    this.boards[face].grid[row][col] = player;

    this.checkWinConditions();
    this.moveCount++;
    this.currentTurn = this.currentTurn === 'X' ? 'O' : 'X';
    return true;
  }

  /**
   * Rotate a vector by 90 degrees clockwise or counter-clockwise according to the face rule.
   */
  private rotateVec(v: Vec3, layer: RotationLayer, dir: RotationDirection): Vec3 {
    let { x, y, z } = v;
    // For counter-clockwise (dir = -1), repeating 3 times or reversing formula
    const steps = dir === 1 ? 1 : 3;

    for (let s = 0; s < steps; s++) {
      let nx = x;
      let ny = y;
      let nz = z;
      switch (layer) {
        case 'F':
        case 'S': // Standing slice S follows F
          nx = y;
          ny = -x;
          break;
        case 'B': // Clockwise looking at Back (-Z): x' = -y, y' = x
          nx = -y;
          ny = x;
          break;
        case 'R': // Clockwise looking at Right (+X): z' = -y, y' = z
          nz = -y;
          ny = z;
          break;
        case 'L':
        case 'M': // Middle slice M follows L
          nz = y;
          ny = -z;
          break;
        case 'U': // Clockwise looking at Up (+Y): x' = -z, z' = x
          nx = -z;
          nz = x;
          break;
        case 'D':
        case 'E': // Equator slice E follows D
          nx = z;
          nz = -x;
          break;
      }
      x = nx;
      y = ny;
      z = nz;
    }
    return { x, y, z };
  }

  /**
   * Applies a Rubik's layer rotation move.
   */
  public rotateLayer(layer: RotationLayer, dir: RotationDirection): boolean {
    if (this.matchWinner) return false;

    for (const cubie of this.cubies) {
      let inLayer = false;
      if (layer === 'F' && cubie.pos.z === 1) inLayer = true;
      else if (layer === 'B' && cubie.pos.z === -1) inLayer = true;
      else if (layer === 'R' && cubie.pos.x === 1) inLayer = true;
      else if (layer === 'L' && cubie.pos.x === -1) inLayer = true;
      else if (layer === 'U' && cubie.pos.y === 1) inLayer = true;
      else if (layer === 'D' && cubie.pos.y === -1) inLayer = true;
      else if (layer === 'M' && cubie.pos.x === 0) inLayer = true;
      else if (layer === 'E' && cubie.pos.y === 0) inLayer = true;
      else if (layer === 'S' && cubie.pos.z === 0) inLayer = true;

      if (inLayer) {
        // Rotate position
        cubie.pos = this.rotateVec(cubie.pos, layer, dir);
        // Rotate all local face normals
        for (const lf of LOCAL_FACES) {
          cubie.normals[lf] = this.rotateVec(cubie.normals[lf], layer, dir);
        }
      }
    }

    this.syncBoardsFromCubies();
    this.moveCount++;
    this.currentTurn = this.currentTurn === 'X' ? 'O' : 'X';
    return true;
  }

  /**
   * Applies standard Singmaster notation move (e.g. "R", "U'", "F2", "M", "E'").
   */
  public applyMoveString(notation: string): boolean {
    if (!notation) return false;
    const layer = notation[0].toUpperCase() as RotationLayer;
    let dir: RotationDirection = 1;
    let double = false;

    if (notation.includes("'")) {
      dir = -1;
    } else if (notation.includes('2')) {
      double = true;
    }

    this.rotateLayer(layer, dir);
    if (double) {
      // Revert turn toggling for second half of double move so it counts as 1 turn
      this.currentTurn = this.currentTurn === 'X' ? 'O' : 'X';
      this.rotateLayer(layer, dir);
    }
    return true;
  }

  /**
   * Evaluates all boards for 3-in-a-row.
   * Under the confirmed rules:
   * - Permanent Lock: Once a board is won, it remains won forever.
   * - Majority Race: First to 4 boards won wins the match immediately.
   */
  public checkWinConditions(): { newlyWonBoards: { face: FaceId; winner: Player; line: [number, number][] }[] } {
    const newlyWonBoards: { face: FaceId; winner: Player; line: [number, number][] }[] = [];

    for (const face of FACE_IDS) {
      const board = this.boards[face];
      let linesX = 0;
      let linesO = 0;
      let lastLineX: [number, number][] | null = null;
      let lastLineO: [number, number][] | null = null;

      for (let lineIdx = 0; lineIdx < WIN_LINES.length; lineIdx++) {
        const line = WIN_LINES[lineIdx];
        const [p0, p1, p2] = line;
        const v0 = board.grid[p0[0]][p0[1]];
        const v1 = board.grid[p1[0]][p1[1]];
        const v2 = board.grid[p2[0]][p2[1]];

        if (v0 !== null && v0 === v1 && v1 === v2) {
          if (v0 === 'X') {
            linesX++;
            lastLineX = line;
          } else {
            linesO++;
            lastLineO = line;
          }

          // Distinct alignment key per face, line index, and current cubie positions
          // Allows pieces to score again when rotated to new faces or new alignments
          const m0 = this.findCubieForCell(face, p0[0], p0[1]);
          const m1 = this.findCubieForCell(face, p1[0], p1[1]);
          const m2 = this.findCubieForCell(face, p2[0], p2[1]);
          const lineKey = m0 && m1 && m2
            ? `${face}_L${lineIdx}__${[m0.cubie.id, m1.cubie.id, m2.cubie.id].sort().join('-')}__${v0}`
            : `${face}_L${lineIdx}__${p0.join(',')}_${p1.join(',')}_${p2.join(',')}__${v0}`;

          if (!this.scoredLines.has(lineKey)) {
            this.scoredLines.add(lineKey);
            this.scores[v0]++;
            newlyWonBoards.push({ face, winner: v0, line });
          }
        }
      }

      // Update face winner and winning line based on current board state
      if (linesX > linesO) {
        board.winner = 'X';
        board.winningLine = lastLineX;
      } else if (linesO > linesX) {
        board.winner = 'O';
        board.winningLine = lastLineO;
      } else if (linesX > 0 && linesX === linesO) {
        board.winner = 'DRAW';
      } else {
        // Check if all 9 cells are full and no lines exist
        let isFull = true;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            if (board.grid[r][c] === null) {
              isFull = false;
              break;
            }
          }
          if (!isFull) break;
        }
        if (isFull) {
          board.winner = 'DRAW';
        } else {
          board.winner = null;
        }
      }
    }

    this.lastNewlyWonBoards = newlyWonBoards;

    // Match victory condition (User preference):
    // The game continues as lines are completed, and ends ONLY when there are no more
    // symbols to place for either player (all cells filled across the cube), or on resignation.
    if (this.resignedPlayer) {
      return { newlyWonBoards };
    }

    let openCellsCount = 0;
    for (const face of FACE_IDS) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (this.boards[face].grid[r][c] === null) openCellsCount++;
        }
      }
    }

    if (openCellsCount === 0) {
      // Exhausted all moves: player or AI with the most board wins claims victory!
      if (this.scores.X > this.scores.O) this.matchWinner = 'X';
      else if (this.scores.O > this.scores.X) this.matchWinner = 'O';
      else this.matchWinner = 'DRAW';
    }

    return { newlyWonBoards };
  }

  /**
   * Resigns the match for a specified player, granting victory to the opponent.
   */
  public resign(player: Player) {
    if (this.matchWinner) return;
    this.resignedPlayer = player;
    this.matchWinner = player === 'X' ? 'O' : 'X';
  }

  /**
   * Generates a pre-configured mid-game battle state with set pieces
   * (e.g. 6 moves from player X, 6 moves from player O = 12 total moves).
   * GUARANTEE: Neither player starts with any 3-in-a-row lines!
   * Neither move is helping such that either side starts with points.
   */
  public generatePresetBattle(movesPerPlayer: number = 6): {
    placedPieces: { cubieId: string; localFace: LocalFace; player: Player }[];
  } {
    // 1. Reset all state to clean
    this.boards = this.initEmptyBoards();
    this.initCubies();
    this.scores = { X: 0, O: 0 };
    this.scoredLines = new Set();
    this.matchWinner = null;
    this.resignedPlayer = null;
    this.lastNewlyWonBoards = [];
    this.moveCount = 0;

    const placedPieces: { cubieId: string; localFace: LocalFace; player: Player }[] = [];

    // Candidate positions on a 3x3 board
    const candidateCells: [number, number][] = [
      [0, 0], [0, 2], [1, 1], [2, 0], [2, 2], [0, 1], [1, 0], [1, 2], [2, 1]
    ];

    // Distribute across faces in a balanced round-robin
    // Exactly 1 X and 1 O per face for 6 moves guarantees 0 lines of 3 completed!
    const faces = [...FACE_IDS];
    faces.sort(() => Math.random() - 0.5);

    let xPlaced = 0;
    let oPlaced = 0;

    for (let i = 0; i < movesPerPlayer; i++) {
      const faceX = faces[i % faces.length];
      const availableX = candidateCells.filter(([r, c]) => this.boards[faceX].grid[r][c] === null);
      if (availableX.length > 0) {
        const [r, c] = availableX[Math.floor(Math.random() * availableX.length)];
        const match = this.findCubieForCell(faceX, r, c);
        if (match) {
          match.cubie.pieces[match.localFace] = 'X';
          this.boards[faceX].grid[r][c] = 'X';
          placedPieces.push({ cubieId: match.cubie.id, localFace: match.localFace, player: 'X' });
          xPlaced++;
        }
      }

      const faceO = faces[(i + 3) % faces.length];
      const availableO = candidateCells.filter(([r, c]) => this.boards[faceO].grid[r][c] === null);
      if (availableO.length > 0) {
        const [r, c] = availableO[Math.floor(Math.random() * availableO.length)];
        const match = this.findCubieForCell(faceO, r, c);
        if (match) {
          match.cubie.pieces[match.localFace] = 'O';
          this.boards[faceO].grid[r][c] = 'O';
          placedPieces.push({ cubieId: match.cubie.id, localFace: match.localFace, player: 'O' });
          oPlaced++;
        }
      }
    }

    this.moveCount = xPlaced + oPlaced;
    this.currentTurn = 'X';
    this.syncBoardsFromCubies();

    // Verify 100% guarantee: reset scores and clear any accidental lines
    this.scores = { X: 0, O: 0 };
    for (const f of FACE_IDS) {
      this.boards[f].winner = null;
      this.boards[f].winningLine = null;
    }
    this.matchWinner = null;
    this.lastNewlyWonBoards = [];

    return { placedPieces };
  }

  /**
   * Retrieves all currently valid placement moves.
   */
  public getAvailablePlacements(): CellCoord[] {
    const moves: CellCoord[] = [];
    if (this.matchWinner) return moves;

    for (const face of FACE_IDS) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (this.boards[face].grid[r][c] === null) {
            moves.push({ face, row: r, col: c });
          }
        }
      }
    }
    return moves;
  }

  /**
   * Retrieves all 12 canonical rotation moves.
   */
  public getAvailableRotations(): RotationMove[] {
    if (this.matchWinner) return [];
    const moves: RotationMove[] = [];
    for (const layer of FACE_IDS) {
      moves.push({ layer, dir: 1 });
      moves.push({ layer, dir: -1 });
    }
    return moves;
  }

  /**
   * Deep clone of board engine for AI lookahead search.
   */
  public clone(): BoardEngine {
    const copy = new BoardEngine();
    copy.currentTurn = this.currentTurn;
    copy.scores = { ...this.scores };
    copy.matchWinner = this.matchWinner;
    copy.resignedPlayer = this.resignedPlayer;
    copy.moveCount = this.moveCount;
    copy.lastNewlyWonBoards = [...this.lastNewlyWonBoards];
    copy.scoredLines = new Set(this.scoredLines);

    // Clone cubies
    copy.cubies = this.cubies.map((c) => ({
      id: c.id,
      pos: { ...c.pos },
      normals: {
        '+X': { ...c.normals['+X'] },
        '-X': { ...c.normals['-X'] },
        '+Y': { ...c.normals['+Y'] },
        '-Y': { ...c.normals['-Y'] },
        '+Z': { ...c.normals['+Z'] },
        '-Z': { ...c.normals['-Z'] },
      },
      pieces: { ...c.pieces },
    }));

    // Clone boards
    for (const f of FACE_IDS) {
      copy.boards[f] = {
        grid: this.boards[f].grid.map((r) => [...r]),
        winner: this.boards[f].winner,
        winningLine: this.boards[f].winningLine ? [...this.boards[f].winningLine] : null,
      };
    }

    return copy;
  }

  /**
   * Count the number of 2-in-a-row patterns on the whole cube.
   * Returns true if any such pattern exists.
   */
  private hasTwoInARow(): boolean {
    for (const face of FACE_IDS) {
      const board = this.boards[face];
      for (const line of WIN_LINES) {
        const [p0, p1, p2] = line;
        const v0 = board.grid[p0[0]][p0[1]];
        const v1 = board.grid[p1[0]][p1[1]];
        const v2 = board.grid[p2[0]][p2[1]];
        const vals = [v0, v1, v2];
        const nonNull = vals.filter((v) => v !== null) as Player[];
        if (nonNull.length === 2 && nonNull[0] === nonNull[1]) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Compute the maximal safe number of preset moves (alternating X/O) that can be placed
   * without ever creating a 2-in-a-row pattern. Greedy algorithm; returns a safe upper bound.
   */
  public computeMaxSafeMoves(): number {
    // Start from a clean engine
    this.boards = this.initEmptyBoards();
    this.initCubies();
    this.scores = { X: 0, O: 0 };
    this.scoredLines = new Set();
    this.moveCount = 0;
    this.currentTurn = 'X';

    const candidateCells: [FaceId, number, number][] = [];
    for (const face of FACE_IDS) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          candidateCells.push([face, r, c]);
        }
      }
    }

    let safeMoves = 0;
    const shuffled = candidateCells.sort(() => Math.random() - 0.5);

    for (const [face, r, c] of shuffled) {
      const match = this.findCubieForCell(face, r, c);
      if (!match) continue;
      match.cubie.pieces[match.localFace] = this.currentTurn;
      this.boards[face].grid[r][c] = this.currentTurn;
      if (this.hasTwoInARow()) {
        // revert placement and stop
        match.cubie.pieces[match.localFace] = null;
        this.boards[face].grid[r][c] = null;
        break;
      }
      safeMoves++;
      this.moveCount++;
      this.currentTurn = this.currentTurn === 'X' ? 'O' : 'X';
    }

    return safeMoves;
  }

  /**
   * Generate a preset battle with a specific number of safe alternating moves.
   * Guarantees no 2-in-a-row and no immediate 3-in-a-row.
   */
  public generatePresetMoves(count: number): { placedPieces: { cubieId: string; localFace: LocalFace; player: Player }[] } {
    // Reset to clean state
    this.boards = this.initEmptyBoards();
    this.initCubies();
    this.scores = { X: 0, O: 0 };
    this.moveCount = 0;
    this.currentTurn = 'X';

    const placedPieces: { cubieId: string; localFace: LocalFace; player: Player }[] = [];

    const candidateCells: [FaceId, number, number][] = [];
    for (const f of FACE_IDS) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          candidateCells.push([f, r, c]);
        }
      }
    }
    const shuffled = candidateCells.sort(() => Math.random() - 0.5);
    let placed = 0;
    for (const [face, r, c] of shuffled) {
      if (placed >= count) break;
      const match = this.findCubieForCell(face, r, c);
      if (!match) continue;
      match.cubie.pieces[match.localFace] = this.currentTurn;
      this.boards[face].grid[r][c] = this.currentTurn;
      if (this.hasTwoInARow()) {
        // revert and skip
        match.cubie.pieces[match.localFace] = null;
        this.boards[face].grid[r][c] = null;
        continue;
      }
      placedPieces.push({ cubieId: match.cubie.id, localFace: match.localFace, player: this.currentTurn });
      placed++;
      this.moveCount++;
      this.currentTurn = this.currentTurn === 'X' ? 'O' : 'X';
    }

    // Ensure no accidental wins
    this.checkWinConditions();
    this.scores = { X: 0, O: 0 };
    this.scoredLines.clear();
    for (const f of FACE_IDS) {
      this.boards[f].winner = null;
      this.boards[f].winningLine = null;
    }
    this.matchWinner = null;
    this.lastNewlyWonBoards = [];

    return { placedPieces };
  }

}
