// algorithmDispatcher.ts
// Dispatches AI moves based on the selected algorithm.
// This file only orchestrates between existing AIPlayer strategies without touching core game logic.

import { BoardEngine } from '../game/BoardEngine';
import { AIPlayer } from '../game/AIPlayer';
import { AIDifficulty, Player } from '../game/types';

// Supported algorithm identifiers. Extend as needed.
export type Algorithm = 'Random' | 'Greedy' | 'Minimax';

// Simple mapping from algorithm name to a difficulty level understood by AIPlayer.
const algorithmToDifficulty: Record<Algorithm, AIDifficulty> = {
  Random: 'EASY', // Random corresponds to the easy difficulty implementation.
  Greedy: 'MEDIUM', // Greedy tactical move is the medium difficulty.
  Minimax: 'HARD', // Minimax deep lookahead is the hard difficulty.
};

/**
 * Returns the AI's next move based on the selected algorithm.
 *
 * @param engine Current board engine instance.
 * @param player The AI player symbol (usually 'O').
 * @param algorithm The chosen algorithm identifier.
 * @returns An AIMove compatible object or null if no move is possible.
 */
export function getAIMove(
  engine: BoardEngine,
  player: Player,
  algorithm: Algorithm,
): ReturnType<AIPlayer['getBestMove']> {
  const difficulty = algorithmToDifficulty[algorithm] ?? 'EASY';
  const ai = new AIPlayer(player);
  return ai.getBestMove(engine, difficulty);
}

// Exported for potential external usage.
export default { getAIMove };
