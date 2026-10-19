export type Player = 'X' | 'O';

export type FaceId = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';

export type RotationLayer = 'U' | 'D' | 'L' | 'R' | 'F' | 'B' | 'M' | 'E' | 'S';

export type RotationDirection = 1 | -1; // 1 = clockwise, -1 = counter-clockwise

export interface RotationMove {
  layer: RotationLayer;
  dir: RotationDirection;
  double?: boolean;
}

export interface CellCoord {
  face: FaceId;
  row: number; // 0..2
  col: number; // 0..2
}

export type BoardWinner = Player | 'DRAW' | null;

export interface BoardState {
  grid: (Player | null)[][]; // 3x3
  winner: BoardWinner;
  winningLine: [number, number][] | null; // [[r0, c0], [r1, c1], [r2, c2]]
}

export type GameMode = 'PVP' | 'PVC';
export type AIDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface GameAction {
  type: 'PLACE' | 'ROTATE';
  player: Player;
  cell?: CellCoord;
  rotation?: RotationMove;
  timestamp: number;
}

export interface MatchState {
  boards: Record<FaceId, BoardState>;
  currentTurn: Player;
  scores: Record<Player, number>;
  matchWinner: Player | 'DRAW' | null;
  history: GameAction[];
  gameMode: GameMode;
  aiDifficulty: AIDifficulty;
  isRotating: boolean;
  moveCount: number;
}
