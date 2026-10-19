import { BoardEngine } from './BoardEngine';
import { Player, CellCoord, RotationMove, AIDifficulty } from './types';
import { FACE_IDS, WIN_LINES } from './constants';

export type AIMove =
  | { type: 'PLACE'; cell: CellCoord }
  | { type: 'ROTATE'; rotation: RotationMove };

export class AIPlayer {
  private player: Player;
  private opponent: Player;

  constructor(player: Player = 'O') {
    this.player = player;
    this.opponent = player === 'X' ? 'O' : 'X';
  }

  /**
   * Main entry point to calculate the AI's move based on difficulty.
   */
  public getBestMove(engine: BoardEngine, difficulty: AIDifficulty = 'MEDIUM'): AIMove | null {
    if (engine.matchWinner) return null;

    if (difficulty === 'EASY') {
      return this.getRandomMove(engine);
    } else if (difficulty === 'MEDIUM') {
      return this.getGreedyTacticalMove(engine);
    } else {
      return this.getDeepTacticalMove(engine);
    }
  }

  /**
   * Counts how many 2-in-a-row threats exist for a given player across all unresolved boards.
   */
  private countTwoInARow(engine: BoardEngine, player: Player): number {
    let count = 0;
    for (const face of FACE_IDS) {
      const b = engine.boards[face];
      for (const line of WIN_LINES) {
        const [c0, c1, c2] = line;
        const vals = [b.grid[c0[0]][c0[1]], b.grid[c1[0]][c1[1]], b.grid[c2[0]][c2[1]]];
        if (vals.filter((v) => v === player).length === 2 && vals.filter((v) => v === null).length === 1) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Easy: balanced mix of safe placements (60%) and safe Rubik's cube layer twists (40%).
   */
  private getRandomMove(engine: BoardEngine): AIMove | null {
    const placements = engine.getAvailablePlacements();
    const rotations = engine.getAvailableRotations();

    if (placements.length === 0 && rotations.length === 0) return null;

    // 40% chance to twist layer if safe rotations exist
    if (Math.random() < 0.4 && rotations.length > 0) {
      const safeRotations = rotations.filter((r) => {
        const sim = engine.clone();
        sim.rotateLayer(r.layer, r.dir);
        return sim.scores[this.opponent] <= engine.scores[this.opponent];
      });
      const pool = safeRotations.length > 0 ? safeRotations : rotations;
      const idx = Math.floor(Math.random() * pool.length);
      return { type: 'ROTATE', rotation: pool[idx] };
    }

    if (placements.length > 0) {
      const idx = Math.floor(Math.random() * placements.length);
      return { type: 'PLACE', cell: placements[idx] };
    }

    return rotations.length > 0 ? { type: 'ROTATE', rotation: rotations[0] } : null;
  }

  /**
   * Evaluates the static utility score of an engine state from the AI's perspective.
   */
  private evaluateState(engine: BoardEngine): number {
    let score = 0;

    // Board wins are paramount (200 pts per board lead)
    score += (engine.scores[this.player] - engine.scores[this.opponent]) * 200;

    for (const face of FACE_IDS) {
      const b = engine.boards[face];

      for (const line of WIN_LINES) {
        const [c0, c1, c2] = line;
        const v0 = b.grid[c0[0]][c0[1]];
        const v1 = b.grid[c1[0]][c1[1]];
        const v2 = b.grid[c2[0]][c2[1]];

        const vals = [v0, v1, v2];
        const aiCount = vals.filter((v) => v === this.player).length;
        const oppCount = vals.filter((v) => v === this.opponent).length;
        const emptyCount = vals.filter((v) => v === null).length;

        if (aiCount === 3) {
          score += 80;
        } else if (oppCount === 3) {
          score -= 90;
        } else if (aiCount === 2 && emptyCount === 1) {
          score += 35; // One move away from winning this board
        } else if (oppCount === 2 && emptyCount === 1) {
          score -= 45; // Opponent is one move away from winning this board!
        } else if (aiCount === 1 && emptyCount === 2) {
          score += 8;
        } else if (oppCount === 1 && emptyCount === 2) {
          score -= 8;
        }
      }

      // Positional cell bonuses
      // Center cell controls 4 lines
      if (b.grid[1][1] === this.player) score += 10;
      else if (b.grid[1][1] === this.opponent) score -= 10;

      // Corners control 3 lines
      const corners = [
        [0, 0],
        [0, 2],
        [2, 0],
        [2, 2],
      ];
      for (const [r, c] of corners) {
        if (b.grid[r][c] === this.player) score += 4;
        else if (b.grid[r][c] === this.opponent) score -= 4;
      }
    }

    return score;
  }

  /**
   * Medium: checks immediate 1-step wins, blocks opponent 1-step wins,
   * actively exploits tactical Rubik's cube layer rotations, and evaluates best moves.
   */
  private getGreedyTacticalMove(engine: BoardEngine): AIMove | null {
    const placements = engine.getAvailablePlacements();
    const rotations = engine.getAvailableRotations();

    if (placements.length === 0 && rotations.length === 0) return null;

    // 1. Check if ANY placement immediately wins a board
    for (const p of placements) {
      const sim = engine.clone();
      sim.placePiece(p.face, p.row, p.col, this.player);
      if (sim.scores[this.player] > engine.scores[this.player]) {
        return { type: 'PLACE', cell: p };
      }
    }

    // 2. Check if ANY rotation immediately wins a board (without handing opponent wins)
    for (const r of rotations) {
      const sim = engine.clone();
      sim.rotateLayer(r.layer, r.dir);
      if (
        sim.scores[this.player] > engine.scores[this.player] &&
        sim.scores[this.opponent] <= engine.scores[this.opponent]
      ) {
        return { type: 'ROTATE', rotation: r };
      }
    }

    // 3. Urgent Defense: Check if opponent has an immediate winning placement
    const urgentBlocks: CellCoord[] = [];
    for (const p of placements) {
      const sim = engine.clone();
      sim.placePiece(p.face, p.row, p.col, this.opponent);
      if (sim.scores[this.opponent] > engine.scores[this.opponent]) {
        urgentBlocks.push(p);
      }
    }

    // 3. Urgent Defense: If opponent has an immediate winning placement, directly block it!
    if (urgentBlocks.length > 0) {
      return { type: 'PLACE', cell: urgentBlocks[0] };
    }

    // Measure existing threat counts
    const oppThreatsBefore = this.countTwoInARow(engine, this.opponent);
    const aiThreatsBefore = this.countTwoInARow(engine, this.player);

    // 4. Score all valid placements
    let bestPlacementScore = -Infinity;
    let bestPlacement: CellCoord | null = null;

    for (const p of placements) {
      const sim = engine.clone();
      sim.placePiece(p.face, p.row, p.col, this.player);
      const s = this.evaluateState(sim) + Math.random() * 2;
      if (s > bestPlacementScore) {
        bestPlacementScore = s;
        bestPlacement = p;
      }
    }

    // 5. Score rotations with tactical disruption / alignment bonuses
    let bestRotationScore = -Infinity;
    let bestRotation: RotationMove | null = null;

    for (const r of rotations) {
      const sim = engine.clone();
      sim.rotateLayer(r.layer, r.dir);

      // NEVER rotate if it grants opponent an immediate board win
      if (sim.scores[this.opponent] > engine.scores[this.opponent]) {
        continue;
      }

      const oppThreatsAfter = this.countTwoInARow(sim, this.opponent);
      const aiThreatsAfter = this.countTwoInARow(sim, this.player);

      let tacticalBonus = 0;
      // Disrupted an opponent's 2-in-a-row threat!
      if (oppThreatsAfter < oppThreatsBefore) {
        tacticalBonus += (oppThreatsBefore - oppThreatsAfter) * 35;
      }
      // Created a new 2-in-a-row alignment for AI!
      if (aiThreatsAfter > aiThreatsBefore) {
        tacticalBonus += (aiThreatsAfter - aiThreatsBefore) * 30;
      }

      const s = this.evaluateState(sim) + tacticalBonus + Math.random() * 2;
      if (s > bestRotationScore) {
        bestRotationScore = s;
        bestRotation = r;
      }
    }

    // Actively choose rotation if it yields equal or better value, or has a tactical bonus
    if (bestRotation) {
      if (bestRotationScore >= bestPlacementScore) {
        return { type: 'ROTATE', rotation: bestRotation };
      }
      // If rotation is very close to placement, 35% chance to twist cube for dynamic spatial play
      if (bestRotationScore >= bestPlacementScore - 8 && Math.random() < 0.35) {
        return { type: 'ROTATE', rotation: bestRotation };
      }
    }

    if (bestPlacement) {
      return { type: 'PLACE', cell: bestPlacement };
    }

    if (bestRotation) {
      return { type: 'ROTATE', rotation: bestRotation };
    }

    return placements.length > 0 ? { type: 'PLACE', cell: placements[0] } : null;
  }

  /**
   * Hard: Deep 2-ply minimax lookahead evaluating both placements and rotations equally.
   */
  private getDeepTacticalMove(engine: BoardEngine): AIMove | null {
    const placements = engine.getAvailablePlacements();
    const rotations = engine.getAvailableRotations();

    if (placements.length === 0 && rotations.length === 0) return null;

    // 1. Instant win check
    for (const p of placements) {
      const sim = engine.clone();
      sim.placePiece(p.face, p.row, p.col, this.player);
      if (sim.scores[this.player] > engine.scores[this.player]) {
        return { type: 'PLACE', cell: p };
      }
    }
    for (const r of rotations) {
      const sim = engine.clone();
      sim.rotateLayer(r.layer, r.dir);
      if (
        sim.scores[this.player] > engine.scores[this.player] &&
        sim.scores[this.opponent] <= engine.scores[this.opponent]
      ) {
        return { type: 'ROTATE', rotation: r };
      }
    }

    // 2. Block immediate opponent wins
    const urgentBlocks: CellCoord[] = [];
    for (const p of placements) {
      const sim = engine.clone();
      sim.placePiece(p.face, p.row, p.col, this.opponent);
      if (sim.scores[this.opponent] > engine.scores[this.opponent]) {
        urgentBlocks.push(p);
      }
    }

    if (urgentBlocks.length > 0) {
      // Check if a layer twist cleanly dismantles the threat
      for (const r of rotations) {
        const sim = engine.clone();
        sim.rotateLayer(r.layer, r.dir);
        let stillVulnerable = false;
        const nextOpp = sim.getAvailablePlacements();
        for (const op of nextOpp) {
          const testSim = sim.clone();
          testSim.placePiece(op.face, op.row, op.col, this.opponent);
          if (testSim.scores[this.opponent] > sim.scores[this.opponent]) {
            stillVulnerable = true;
            break;
          }
        }
        if (!stillVulnerable && sim.scores[this.opponent] <= engine.scores[this.opponent]) {
          return { type: 'ROTATE', rotation: r };
        }
      }
      return { type: 'PLACE', cell: urgentBlocks[0] };
    }

    const oppThreatsBefore = this.countTwoInARow(engine, this.opponent);
    const aiThreatsBefore = this.countTwoInARow(engine, this.player);

    // 3. Minimax 2-ply evaluation: candidate placements
    let bestPlacementScore = -Infinity;
    let bestPlacement: CellCoord | null = null;

    for (const p of placements) {
      const sim = engine.clone();
      sim.placePiece(p.face, p.row, p.col, this.player);
      const myScore = this.evaluateState(sim);

      // Check opponent's best immediate response across multiple faces
      const oppPlacements = sim.getAvailablePlacements();
      let worstOpponentOutcome = Infinity;
      const step = Math.max(1, Math.floor(oppPlacements.length / 8));
      for (let i = 0; i < oppPlacements.length; i += step) {
        const oppSim = sim.clone();
        oppSim.placePiece(oppPlacements[i].face, oppPlacements[i].row, oppPlacements[i].col, this.opponent);
        const oppScore = this.evaluateState(oppSim);
        if (oppScore < worstOpponentOutcome) {
          worstOpponentOutcome = oppScore;
        }
      }

      const netValue =
        worstOpponentOutcome !== Infinity ? myScore * 0.6 + worstOpponentOutcome * 0.4 : myScore;
      const totalScore = netValue + Math.random() * 2;

      if (totalScore > bestPlacementScore) {
        bestPlacementScore = totalScore;
        bestPlacement = p;
      }
    }

    // 4. Minimax 2-ply evaluation: candidate rotations
    let bestRotationScore = -Infinity;
    let bestRotation: RotationMove | null = null;

    for (const r of rotations) {
      const sim = engine.clone();
      sim.rotateLayer(r.layer, r.dir);

      if (sim.scores[this.opponent] > engine.scores[this.opponent]) {
        continue;
      }

      const oppThreatsAfter = this.countTwoInARow(sim, this.opponent);
      const aiThreatsAfter = this.countTwoInARow(sim, this.player);

      let tacticalBonus = 0;
      if (oppThreatsAfter < oppThreatsBefore) {
        tacticalBonus += (oppThreatsBefore - oppThreatsAfter) * 35;
      }
      if (aiThreatsAfter > aiThreatsBefore) {
        tacticalBonus += (aiThreatsAfter - aiThreatsBefore) * 30;
      }

      const myScore = this.evaluateState(sim) + tacticalBonus;

      const oppPlacements = sim.getAvailablePlacements();
      let worstOpponentOutcome = Infinity;
      const step = Math.max(1, Math.floor(oppPlacements.length / 8));
      for (let i = 0; i < oppPlacements.length; i += step) {
        const oppSim = sim.clone();
        oppSim.placePiece(oppPlacements[i].face, oppPlacements[i].row, oppPlacements[i].col, this.opponent);
        const oppScore = this.evaluateState(oppSim);
        if (oppScore < worstOpponentOutcome) {
          worstOpponentOutcome = oppScore;
        }
      }

      const netValue =
        worstOpponentOutcome !== Infinity ? myScore * 0.6 + worstOpponentOutcome * 0.4 : myScore;
      const totalScore = netValue + Math.random() * 2;

      if (totalScore > bestRotationScore) {
        bestRotationScore = totalScore;
        bestRotation = r;
      }
    }

    // If rotation gives equal or higher utility, execute rotation!
    if (bestRotation) {
      if (bestRotationScore >= bestPlacementScore) {
        return { type: 'ROTATE', rotation: bestRotation };
      }
      if (bestRotationScore >= bestPlacementScore - 6 && Math.random() < 0.4) {
        return { type: 'ROTATE', rotation: bestRotation };
      }
    }

    if (bestPlacement) {
      return { type: 'PLACE', cell: bestPlacement };
    }

    if (bestRotation) {
      return { type: 'ROTATE', rotation: bestRotation };
    }

    return placements.length > 0 ? { type: 'PLACE', cell: placements[0] } : null;
  }
}
