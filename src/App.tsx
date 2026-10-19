import { useEffect, useRef, useState, useCallback } from 'react';
import { BoardEngine } from './game/BoardEngine';
import { soundEngine } from './game/AudioEngine';
import { AIDifficulty, Player, FaceId, RotationLayer, RotationDirection } from './game/types';
import { FaceId as FaceIdType } from './game/types';
import { FACE_IDS } from './game/constants';
import { SceneManager } from './three/SceneManager';
import { RubikCube } from './three/RubikCube';
import { LayerRotator } from './three/LayerRotator';
import { ParticleSystem } from './three/ParticleSystem';
import { InteractionManager } from './three/InteractionManager';
import { getAIMove, Algorithm } from './ai/algorithmDispatcher';
import { ytSDK } from './platform/youtubeSDK';
import type { BoardState } from './game/types';

// ─── Helper: map difficulty to algorithm ──────────────────────────────────────
function difficultyToAlgorithm(d: AIDifficulty): Algorithm {
  if (d === 'EASY') return 'Random';
  if (d === 'HARD') return 'Minimax';
  return 'Greedy';
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = 'MENU' | 'GAME' | 'VICTORY';

// ─── Sub-component: MenuOverlay ───────────────────────────────────────────────
interface MenuOverlayProps {
  difficulty: AIDifficulty;
  onDifficultyChange: (d: AIDifficulty) => void;
  onStart: () => void;
  bestScore: number;
  showRules: boolean;
  onToggleRules: (show: boolean) => void;
}

function MenuOverlay({
  difficulty,
  onDifficultyChange,
  onStart,
  bestScore,
  showRules,
  onToggleRules,
}: MenuOverlayProps) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center z-20 p-4"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(60,40,20,0.85) 0%, rgba(20,12,5,0.97) 100%)',
      }}
    >
      {/* Title */}
      <div style={{ transform: 'rotate(-2deg)', marginBottom: 6 }}>
        <h1
          className="font-handwritten text-center leading-tight"
          style={{
            fontSize: 'clamp(32px, 8vw, 56px)',
            color: '#f5ede1',
            textShadow: '2px 3px 8px rgba(0,0,0,0.7), 0 0 20px rgba(232,176,56,0.3)',
          }}
        >
          Rubik's<br />Tic-Tac-Toe
        </h1>
      </div>
      <p
        className="font-handwritten italic text-center mb-3"
        style={{ color: '#d4a373', fontSize: 'clamp(12px, 3.2vw, 16px)', letterSpacing: '0.05em' }}
      >
        YouTube Playables Edition • Single Player vs. AI
      </p>

      {bestScore > 0 && (
        <div
          className="font-handwritten mb-3 px-3 py-1 rounded-full"
          style={{ background: 'rgba(232,176,56,0.18)', border: '1px solid #e8b038', color: '#f3c969', fontSize: 13 }}
        >
          🏆 Best High Score: {bestScore} pts
        </div>
      )}

      {/* Decorative divider */}
      <div
        style={{
          width: '80%',
          maxWidth: 280,
          height: 2,
          margin: '0 auto 16px',
          borderTop: '2px dashed rgba(212,163,115,0.4)',
        }}
      />

      {/* Difficulty selector */}
      <p className="font-handwritten mb-2" style={{ color: '#c4a882', fontSize: 14 }}>
        Select Difficulty
      </p>
      <div className="flex gap-3 mb-5" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
        {(['EASY', 'MEDIUM', 'HARD'] as AIDifficulty[]).map((d) => {
          const colors: Record<AIDifficulty, string> = {
            EASY: '#c9a227',
            MEDIUM: '#d95d39',
            HARD: '#436b95',
          };
          const sel = difficulty === d;
          return (
            <button
              key={d}
              onClick={() => {
                soundEngine.playClickSound();
                onDifficultyChange(d);
              }}
              className="font-handwritten"
              style={{
                background: colors[d],
                color: '#fff',
                border: sel ? '3px solid #fff' : '3px solid transparent',
                borderRadius: 12,
                minWidth: 84,
                minHeight: 48,
                padding: '8px 16px',
                fontSize: 'clamp(13px, 3.2vw, 16px)',
                fontWeight: 700,
                cursor: 'pointer',
                transform: sel ? 'scale(0.96)' : 'scale(1)',
                boxShadow: sel
                  ? 'inset 0 3px 8px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.3)'
                  : '0 4px 10px rgba(0,0,0,0.4)',
                transition: 'all 0.15s',
                position: 'relative',
              }}
            >
              {sel && <span style={{ position: 'absolute', top: -8, right: -6, fontSize: 14 }}>✓</span>}
              {d}
            </button>
          );
        })}
      </div>

      {/* Start button - 48dp+ touch target */}
      <button
        onClick={() => {
          soundEngine.playClickSound();
          onStart();
        }}
        className="font-handwritten"
        style={{
          background: 'linear-gradient(135deg, #c0392b 0%, #96281b 100%)',
          color: '#fff',
          border: 'none',
          borderRadius: 14,
          minHeight: 52,
          padding: '12px 36px',
          fontSize: 'clamp(18px, 5vw, 24px)',
          fontWeight: 700,
          cursor: 'pointer',
          transform: 'rotate(1deg)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.5), 0 2px 0 #7b1e1e',
          letterSpacing: '0.03em',
          marginBottom: 16,
        }}
      >
        ENGAGE BATTLE ⚔️
      </button>

      {/* How to play button */}
      <button
        onClick={() => onToggleRules(!showRules)}
        className="font-handwritten"
        style={{
          background: 'none',
          border: 'none',
          color: '#d4a373',
          fontSize: 14,
          cursor: 'pointer',
          textDecoration: 'underline',
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {showRules ? '✕ Close Rules (Esc)' : '📖 HOW TO PLAY'}
      </button>

      {showRules && (
        <div
          className="font-handwritten text-left mt-2"
          style={{
            background: 'rgba(25, 16, 8, 0.92)',
            borderRadius: 12,
            padding: '14px 20px',
            maxWidth: 340,
            color: '#f5ede1',
            fontSize: 12,
            lineHeight: 1.6,
            border: '1px solid rgba(212,163,115,0.4)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          }}
        >
          <div className="flex justify-between items-center mb-2">
            <strong style={{ color: '#e8b038', fontSize: 14 }}>GAME RULES & CONTROLS</strong>
            <button
              onClick={() => onToggleRules(false)}
              style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16 }}
            >
              ✕
            </button>
          </div>
          <p>🎯 <strong>Objective:</strong> Score more 3-in-a-rows than AI across all 6 faces.</p>
          <p>✋ <strong>Place Mark:</strong> Tap any open facelet to place your X.</p>
          <p>👆 <strong>Rotate Layer:</strong> Drag across any facelet to twist that layer in 3D.</p>
          <p>🔄 <strong>Orbit Camera:</strong> 1-finger drag on background or 2-finger pinch zoom.</p>
          <p>🔁 <strong>Multi-Use Pieces:</strong> Twisting the cube moves existing pieces into new lines for more points!</p>
          <p>⏪ <strong>Rewarded Undo:</strong> Tap "⏪ Undo 5 Moves" anytime to watch a short ad and rewind the board state 5 moves.</p>
          <p>🏁 <strong>Match End:</strong> Match completes when all 54 cells are filled. Most points wins!</p>
        </div>
      )}
    </div>
  );
}

// ─── Sub-component: MobileHUD ─────────────────────────────────────────────────
interface MobileHUDProps {
  scores: { X: number; O: number };
  currentTurn: Player;
  moveCount: number;
  onMenu: () => void;
  onHelp: () => void;
  onUndoRewarded: () => void;
  canUndo: boolean;
  isAdLoading: boolean;
}

function MobileHUD({
  scores,
  currentTurn,
  moveCount,
  onMenu,
  onHelp,
  onUndoRewarded,
  canUndo,
  isAdLoading,
}: MobileHUDProps) {
  return (
    <div
      className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between"
      style={{
        background: 'rgba(20,12,5,0.85)',
        backdropFilter: 'blur(8px)',
        height: 52,
        padding: '0 10px',
        borderBottom: '1px solid rgba(212,163,115,0.25)',
      }}
    >
      {/* Scores */}
      <div className="flex items-center gap-2 sm:gap-3 font-handwritten">
        <span style={{ color: '#e05c3a', fontSize: 17, fontWeight: 700 }}>✗ {scores.X}</span>
        <span style={{ color: '#888', fontSize: 11 }}>vs</span>
        <span style={{ color: '#4caf7a', fontSize: 17, fontWeight: 700 }}>○ {scores.O}</span>
      </div>

      {/* Turn indicator */}
      <div className="font-handwritten flex items-center gap-1 sm:gap-2" style={{ fontSize: 12 }}>
        {currentTurn === 'X' ? (
          <span style={{ color: '#f5ede1', fontWeight: 700 }}>YOUR TURN</span>
        ) : (
          <span style={{ color: '#c4a882', display: 'flex', alignItems: 'center', gap: 3 }}>
            AI THINKING
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#e8b038',
                marginLeft: 2,
                animation: 'pulse 1s infinite',
              }}
            />
          </span>
        )}
        <span style={{ color: '#777', fontSize: 11 }}>#{moveCount}</span>
      </div>

      {/* Action Controls: Rewarded Undo, Help, Menu */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Rewarded Ad Undo Button */}
        <button
          onClick={onUndoRewarded}
          disabled={!canUndo || isAdLoading}
          aria-label="Undo last 5 moves by watching a rewarded ad"
          className="font-handwritten flex items-center gap-1 px-2"
          style={{
            background: canUndo && !isAdLoading ? 'linear-gradient(135deg, #d95d39 0%, #b34728 100%)' : '#3a3330',
            color: canUndo && !isAdLoading ? '#fff' : '#666',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            minHeight: 48,
            cursor: canUndo && !isAdLoading ? 'pointer' : 'not-allowed',
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            boxShadow: canUndo ? '0 2px 6px rgba(0,0,0,0.3)' : 'none',
          }}
        >
          <span>⏪</span>
          <span className="hidden sm:inline">Undo 5</span>
          <span style={{ fontSize: 10, background: '#e8b038', color: '#1a1005', padding: '1px 3px', borderRadius: 4, fontWeight: 900 }}>AD</span>
        </button>

        <button
          onClick={onHelp}
          aria-label="Help and rules"
          className="font-handwritten"
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            color: '#e8d5bc',
            minWidth: 48,
            minHeight: 48,
            cursor: 'pointer',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ?
        </button>
        <button
          onClick={onMenu}
          aria-label="Main menu"
          className="font-handwritten"
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            color: '#e8d5bc',
            minWidth: 48,
            minHeight: 48,
            cursor: 'pointer',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ☰
        </button>
      </div>
    </div>
  );
}

// ─── Sub-component: ResponsiveRotationPad ─────────────────────────────────────
interface RotationPadProps {
  onRotate: (layer: RotationLayer, dir: RotationDirection) => void;
  disabled: boolean;
  isLandscape: boolean;
}

function ResponsiveRotationPad({ onRotate, disabled, isLandscape }: RotationPadProps) {
  const layerColors: Record<string, string> = {
    U: '#b5b5a8',
    D: '#8b4a2a',
    F: '#3f784c',
    B: '#436b95',
    L: '#d95d39',
    R: '#c9a227',
    M: '#7b5ea7',
    E: '#7b5ea7',
    S: '#7b5ea7',
  };

  const btn = (layer: RotationLayer, dir: RotationDirection, label: string) => (
    <button
      key={`${layer}${dir}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (!disabled) onRotate(layer, dir);
      }}
      className="font-handwritten"
      style={{
        background: disabled ? '#3a3330' : layerColors[layer] || '#555',
        color: disabled ? '#666' : '#fff',
        border: 'none',
        borderRadius: 8,
        minWidth: 48,
        minHeight: 48,
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        boxShadow: disabled ? 'none' : '0 3px 8px rgba(0,0,0,0.4)',
        transition: 'opacity 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <span style={{ fontSize: 12 }}>{layer}</span>
      <span style={{ fontSize: 15, lineHeight: 1 }}>{dir === 1 ? '↻' : '↺'}</span>
    </button>
  );

  if (isLandscape) {
    // Docked cleanly to the right side in landscape mode
    return (
      <div
        className="absolute top-16 right-2 bottom-2 z-10 flex flex-col justify-center"
        style={{
          background: 'rgba(20,12,5,0.82)',
          backdropFilter: 'blur(8px)',
          borderRadius: 12,
          padding: 8,
          border: '1px solid rgba(212,163,115,0.25)',
          maxHeight: 'calc(100vh - 72px)',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 48px)', gap: 8 }}>
          {btn('U', -1, 'U↺')}
          {btn('U', 1, 'U↻')}
          {btn('F', -1, 'F↺')}
          {btn('F', 1, 'F↻')}
          {btn('R', -1, 'R↺')}
          {btn('R', 1, 'R↻')}
          {btn('L', -1, 'L↺')}
          {btn('L', 1, 'L↻')}
          {btn('B', -1, 'B↺')}
          {btn('B', 1, 'B↻')}
          {btn('D', 1, 'D↻')}
          {btn('D', -1, 'D↺')}
          {btn('M', -1, 'M↺')}
          {btn('M', 1, 'M↻')}
          {btn('E', -1, 'E↺')}
          {btn('E', 1, 'E↻')}
          {btn('S', -1, 'S↺')}
          {btn('S', 1, 'S↻')}
        </div>
      </div>
    );
  }

  // Portrait mode: Bottom dock
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-10"
      style={{
        background: 'rgba(20,12,5,0.85)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid rgba(212,163,115,0.25)',
        padding: '8px 10px 10px',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 8,
          maxWidth: 420,
          margin: '0 auto',
        }}
      >
        {btn('U', -1, 'U↺')}
        {btn('U', 1, 'U↻')}
        {btn('F', -1, 'F↺')}
        {btn('F', 1, 'F↻')}
        {btn('M', -1, 'M↺')}
        {btn('M', 1, 'M↻')}

        {btn('D', 1, 'D↻')}
        {btn('D', -1, 'D↺')}
        {btn('B', -1, 'B↺')}
        {btn('B', 1, 'B↻')}
        {btn('E', -1, 'E↺')}
        {btn('E', 1, 'E↻')}

        {btn('L', -1, 'L↺')}
        {btn('L', 1, 'L↻')}
        {btn('R', -1, 'R↺')}
        {btn('R', 1, 'R↻')}
        {btn('S', -1, 'S↺')}
        {btn('S', 1, 'S↻')}
      </div>
    </div>
  );
}

// ─── Sub-component: FaceMiniMap ───────────────────────────────────────────────
interface FaceMiniMapProps {
  boards: Record<FaceId, BoardState>;
  onSnapFace: (face: FaceId) => void;
  isLandscape: boolean;
}

function FaceMiniMap({ boards, onSnapFace, isLandscape }: FaceMiniMapProps) {
  const faceColors: Record<FaceId, string> = {
    F: '#3f784c',
    B: '#436b95',
    L: '#d95d39',
    R: '#c9a227',
    U: '#bdbdad',
    D: '#8b4a2a',
  };
  const faceOrder: FaceId[] = ['U', 'F', 'R', 'D', 'B', 'L'];

  return (
    <div
      className="absolute z-10"
      style={{
        bottom: isLandscape ? 12 : 170,
        left: 10,
        background: 'rgba(20,12,5,0.8)',
        backdropFilter: 'blur(6px)',
        borderRadius: 10,
        padding: 6,
        border: '1px solid rgba(212,163,115,0.25)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 40px)', gap: 6 }}>
        {faceOrder.map((face) => {
          const board = boards[face];
          const w = board.winner;
          return (
            <button
              key={face}
              onPointerDown={() => onSnapFace(face)}
              aria-label={`View ${face} face`}
              style={{
                width: 40,
                height: 40,
                background: faceColors[face],
                borderRadius: 6,
                border: w ? '2px solid #f5ede1' : '2px solid transparent',
                cursor: 'pointer',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
              }}
            >
              <span
                className="font-handwritten"
                style={{
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                }}
              >
                {face}
              </span>
              {w && (
                <span
                  style={{
                    fontSize: 11,
                    lineHeight: 1,
                    color: '#fff',
                    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                  }}
                >
                  {w === 'DRAW' ? '=' : w}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sub-component: VictoryOverlay ────────────────────────────────────────────
interface VictoryOverlayProps {
  winner: Player | 'DRAW' | null;
  scores: { X: number; O: number };
  onPlayAgain: () => void;
  onUndoRewarded: () => void;
  canUndo: boolean;
  isAdLoading: boolean;
}

function VictoryOverlay({
  winner,
  scores,
  onPlayAgain,
  onUndoRewarded,
  canUndo,
  isAdLoading,
}: VictoryOverlayProps) {
  const emoji = winner === 'X' ? '🎉' : winner === 'O' ? '🤖' : '🤝';
  const message = winner === 'X' ? 'YOU WIN!' : winner === 'O' ? 'AI WINS!' : "IT'S A DRAW!";
  const color = winner === 'X' ? '#e05c3a' : winner === 'O' ? '#4caf7a' : '#e8b038';

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,6,2,0.88)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="font-handwritten text-center p-6 sm:p-8"
        style={{
          background: 'linear-gradient(135deg, #3d2b1a 0%, #2a1d0f 100%)',
          borderRadius: 20,
          maxWidth: 360,
          width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          border: '2px solid rgba(212,163,115,0.4)',
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 4 }}>{emoji}</div>
        <h2
          style={{
            fontSize: 'clamp(24px, 7vw, 36px)',
            color,
            margin: '0 0 4px',
            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          {message}
        </h2>
        <p style={{ color: '#d4a373', fontSize: 13, marginBottom: 14 }}>
          MATCH CONCLUDED — ALL 54 CELLS OCCUPIED
        </p>

        {/* Score comparison */}
        <div
          style={{
            background: 'rgba(0,0,0,0.35)',
            borderRadius: 14,
            padding: '12px 20px',
            margin: '12px 0 20px',
            display: 'flex',
            justifyContent: 'space-around',
          }}
        >
          <div>
            <div style={{ color: '#e05c3a', fontSize: 26, fontWeight: 700 }}>✗ {scores.X}</div>
            <div style={{ color: '#aaa', fontSize: 12 }}>YOU</div>
          </div>
          <div style={{ color: '#777', fontSize: 22, alignSelf: 'center' }}>vs</div>
          <div>
            <div style={{ color: '#4caf7a', fontSize: 26, fontWeight: 700 }}>○ {scores.O}</div>
            <div style={{ color: '#aaa', fontSize: 12 }}>AI</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 items-center justify-center">
          {/* Rewarded Undo Option on Defeat / Game End */}
          {canUndo && (
            <button
              onClick={onUndoRewarded}
              disabled={isAdLoading}
              className="font-handwritten flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #d95d39 0%, #b34728 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                minHeight: 48,
                padding: '10px 20px',
                fontSize: 15,
                fontWeight: 700,
                cursor: isAdLoading ? 'wait' : 'pointer',
                width: '100%',
                maxWidth: 240,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
            >
              <span>⏪ Undo Last 5 Moves</span>
              <span style={{ fontSize: 10, background: '#e8b038', color: '#1a1005', padding: '1px 4px', borderRadius: 4, fontWeight: 900 }}>AD</span>
            </button>
          )}

          <button
            onClick={onPlayAgain}
            style={{
              background: 'linear-gradient(135deg, #c0392b 0%, #96281b 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              minHeight: 48,
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              width: '100%',
              maxWidth: 240,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
            className="font-handwritten"
          >
            PLAY AGAIN
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-component: PausedOverlay ─────────────────────────────────────────────
interface PausedOverlayProps {
  onResume: () => void;
}

function PausedOverlay({ onResume }: PausedOverlayProps) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,6,2,0.85)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="font-handwritten text-center p-6"
        style={{
          background: '#2b2015',
          borderRadius: 16,
          border: '2px solid rgba(212,163,115,0.4)',
          maxWidth: 280,
          width: '85%',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>⏸️</div>
        <h3 style={{ color: '#f5ede1', fontSize: 22, margin: '0 0 16px' }}>GAME PAUSED</h3>
        <button
          onClick={onResume}
          className="font-handwritten"
          style={{
            background: '#c0392b',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            minHeight: 48,
            padding: '12px 30px',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          RESUME GAME
        </button>
      </div>
    </div>
  );
}

// ─── Main App Component ───────────────────────────────────────────────────────
export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  // Three.js refs
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const rubikCubeRef = useRef<RubikCube | null>(null);
  const layerRotatorRef = useRef<LayerRotator | null>(null);
  const particleSystemRef = useRef<ParticleSystem | null>(null);
  const interactionMgrRef = useRef<InteractionManager | null>(null);
  const engineRef = useRef<BoardEngine>(new BoardEngine());

  // History stack for 5-move Rewind
  const historyStackRef = useRef<BoardEngine[]>([]);

  // Game state
  const [phase, setPhase] = useState<Phase>('MENU');
  const [difficulty, setDifficulty] = useState<AIDifficulty>('MEDIUM');
  const [scores, setScores] = useState<{ X: number; O: number }>({ X: 0, O: 0 });
  const [currentTurn, setCurrentTurn] = useState<Player>('X');
  const [matchWinner, setMatchWinner] = useState<Player | 'DRAW' | null>(null);
  const [moveCount, setMoveCount] = useState(0);
  const [isRotating, setIsRotating] = useState(false);
  const [boardsState, setBoardsState] = useState<Record<FaceId, BoardState>>(() => new BoardEngine().boards);
  const [bestScore, setBestScore] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showRules, setShowRules] = useState<boolean>(false);
  const [isLandscape, setIsLandscape] = useState<boolean>(() => window.innerWidth > window.innerHeight);
  const [isAdLoading, setIsAdLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Responsive aspect ratio tracking
  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showNotificationToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((curr) => (curr === msg ? null : curr));
    }, 2800);
  };

  // ── Sync state from engine ──────────────────────────────────────────────────
  const syncStateFromEngine = useCallback(() => {
    const eng = engineRef.current;
    setScores({ ...eng.scores });
    setCurrentTurn(eng.currentTurn);
    setMatchWinner(eng.matchWinner);
    setMoveCount(eng.moveCount);

    const clonedBoards: Partial<Record<FaceId, BoardState>> = {};
    for (const f of FACE_IDS) {
      clonedBoards[f as FaceId] = {
        grid: eng.boards[f as FaceId].grid.map((r) => [...r]),
        winner: eng.boards[f as FaceId].winner,
        winningLine: eng.boards[f as FaceId].winningLine ? [...eng.boards[f as FaceId].winningLine!] : null,
      };
    }
    setBoardsState(clonedBoards as Record<FaceId, BoardState>);
  }, []);

  // Snapshot engine state before each action for undo history
  const pushHistorySnapshot = () => {
    historyStackRef.current.push(engineRef.current.clone());
    // Keep max 25 historical snapshots
    if (historyStackRef.current.length > 25) {
      historyStackRef.current.shift();
    }
  };

  // ── Initialize Platform SDK & Cloud Saves ───────────────────────────────────
  useEffect(() => {
    // 1. Signal firstFrameReady right after mount
    ytSDK.firstFrameReady();

    // 2. Initialize YouTube audio state
    soundEngine.setYouTubeAudioEnabled(ytSDK.isAudioEnabled());
    ytSDK.onAudioEnabledChange((enabled) => {
      soundEngine.setYouTubeAudioEnabled(enabled);
    });

    // 3. YouTube Pause and Resume handling (applies to game and ad interruptions)
    ytSDK.onPause(() => {
      setIsPaused(true);
      sceneManagerRef.current?.pause();
      soundEngine.pauseAll();
    });

    ytSDK.onResume(() => {
      setIsPaused(false);
      sceneManagerRef.current?.resume();
      soundEngine.resumeAll();
    });

    // 4. Await cloud save data
    ytSDK.loadData().then((saved) => {
      if (saved && typeof saved.bestScore === 'number') {
        setBestScore(saved.bestScore);
      }
    });
  }, []);

  // ── Keyboard accessibility (Esc to close dialogs, rotation keys) ─────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // YouTube requirement: allow users to close modals using Esc without calling preventDefault()
      if (e.key === 'Escape') {
        if (showRules) {
          setShowRules(false);
        }
        return;
      }

      if (phase !== 'GAME' || isRotating || currentTurn === 'O') return;

      const key = e.key.toUpperCase();
      const validLayers: RotationLayer[] = ['F', 'B', 'L', 'R', 'U', 'D', 'M', 'E', 'S'];
      if (validLayers.includes(key as RotationLayer)) {
        const dir: RotationDirection = e.shiftKey ? -1 : 1;
        handleProgrammaticRotateRef.current(key as RotationLayer, dir);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showRules, phase, isRotating, currentTurn]);

  // ── Initialize Three.js scene ───────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const sceneMgr = new SceneManager(containerRef.current);
    sceneManagerRef.current = sceneMgr;

    const rubikCube = new RubikCube();
    sceneMgr.scene.add(rubikCube.rootGroup);
    rubikCubeRef.current = rubikCube;

    const layerRotator = new LayerRotator(rubikCube);
    layerRotatorRef.current = layerRotator;

    const particleSys = new ParticleSystem(sceneMgr.scene);
    particleSystemRef.current = particleSys;

    const interactionMgr = new InteractionManager(
      sceneMgr.camera,
      sceneMgr.renderer.domElement,
      rubikCube,
      layerRotator,
      sceneMgr
    );
    interactionMgrRef.current = interactionMgr;

    // Single-tap sticker → place piece
    interactionMgr.onCellClick = (cell) => {
      handlePlacePieceRef.current(cell.face, cell.row, cell.col);
    };

    // Touch drag on sticker → interactive 3D rotation executed
    interactionMgr.onLayerRotated = (layer, dir) => {
      handleInteractiveRotateRef.current(layer, dir);
    };

    // Signal game ready for user interaction
    ytSDK.gameReady();

    return () => {
      interactionMgr.dispose();
      sceneMgr.dispose();
    };
  }, []);

  // ── Ref hooks for event callbacks ───────────────────────────────────────────
  const handlePlacePieceRef = useRef<(face: FaceIdType, row: number, col: number) => void>(() => {});
  const handleProgrammaticRotateRef = useRef<(layer: RotationLayer, dir: RotationDirection) => void>(() => {});
  const handleInteractiveRotateRef = useRef<(layer: RotationLayer, dir: RotationDirection) => void>(() => {});

  // ── Handle place piece ──────────────────────────────────────────────────────
  const handlePlacePiece = useCallback(
    (face: FaceIdType, row: number, col: number) => {
      const eng = engineRef.current;
      if (eng.matchWinner) return;
      if (eng.currentTurn !== 'X') return;
      if (layerRotatorRef.current?.isAnimating || isRotating) return;

      // Save state before placing
      pushHistorySnapshot();

      const ok = eng.placePiece(face, row, col, 'X');
      if (!ok) {
        historyStackRef.current.pop();
        return;
      }

      soundEngine.playPlaceSound('X');

      const match = eng.findCubieForCell(face, row, col);
      if (rubikCubeRef.current && match) {
        rubikCubeRef.current.addPieceMesh(match.cubie.id, match.localFace, 'X');
      }

      for (const nw of eng.lastNewlyWonBoards) {
        soundEngine.playBoardWinSound();
        particleSystemRef.current?.addWinningLineLaser(nw.face, nw.line as [number, number][], nw.winner);
      }

      if (eng.matchWinner) {
        handleMatchCompletion(eng);
      } else {
        syncStateFromEngine();
      }
    },
    [isRotating, syncStateFromEngine]
  );

  useEffect(() => {
    handlePlacePieceRef.current = handlePlacePiece;
  }, [handlePlacePiece]);

  // ── Handle match completion (save progress, send score, trigger interstitial) ─
  const handleMatchCompletion = async (eng: BoardEngine) => {
    soundEngine.playMatchVictorySound();
    if (eng.matchWinner !== 'DRAW') {
      particleSystemRef.current?.triggerVictoryConfetti(eng.matchWinner!);
    }

    // Send score to YouTube Playables
    ytSDK.sendScore(eng.scores.X);

    // Save cloud progress
    const newBest = Math.max(bestScore, eng.scores.X);
    setBestScore(newBest);
    ytSDK.saveData({
      bestScore: newBest,
      lastMatchWinner: eng.matchWinner,
      timestamp: Date.now(),
    });

    syncStateFromEngine();
    setPhase('VICTORY');

    // Trigger post-match interstitial ad cleanly wrapped in try/catch
    try {
      await ytSDK.requestInterstitialAd();
    } catch (err) {
      console.warn('Post-match interstitial ad was dismissed or unavailable:', err);
    }
  };

  // ── Handle interactive rotation (touch gesture on cube) ─────────────────────
  const handleInteractiveRotate = useCallback(
    (layer: RotationLayer, dir: RotationDirection) => {
      const eng = engineRef.current;
      if (eng.matchWinner) return;

      // Save state before rotation
      pushHistorySnapshot();

      soundEngine.playRotateSound();
      sceneManagerRef.current?.triggerScreenShake(0.08);

      eng.rotateLayer(layer, dir);
      rubikCubeRef.current?.syncPieces(eng.cubies);

      for (const nw of eng.lastNewlyWonBoards) {
        soundEngine.playBoardWinSound();
        particleSystemRef.current?.addWinningLineLaser(nw.face, nw.line as [number, number][], nw.winner);
      }

      if (eng.matchWinner) {
        handleMatchCompletion(eng);
      } else {
        syncStateFromEngine();
      }
    },
    [bestScore, syncStateFromEngine]
  );

  useEffect(() => {
    handleInteractiveRotateRef.current = handleInteractiveRotate;
  }, [handleInteractiveRotate]);

  // ── Handle programmatic rotation (buttons & AI) ─────────────────────────────
  const handleProgrammaticRotate = useCallback(
    (layer: RotationLayer, dir: RotationDirection) => {
      const eng = engineRef.current;
      const rotator = layerRotatorRef.current;
      if (eng.matchWinner || !rotator || rotator.isAnimating || isRotating) return;

      // Save state before rotation
      pushHistorySnapshot();

      soundEngine.playRotateSound();
      sceneManagerRef.current?.triggerScreenShake(0.12);

      setIsRotating(true);

      rotator.rotate(layer, dir, 260, () => {
        eng.rotateLayer(layer, dir);
        rubikCubeRef.current?.syncPieces(eng.cubies);

        for (const nw of eng.lastNewlyWonBoards) {
          soundEngine.playBoardWinSound();
          particleSystemRef.current?.addWinningLineLaser(nw.face, nw.line as [number, number][], nw.winner);
        }

        if (eng.matchWinner) {
          handleMatchCompletion(eng);
          setIsRotating(false);
        } else {
          syncStateFromEngine();
          setIsRotating(false);
        }
      });
    },
    [isRotating, bestScore, syncStateFromEngine]
  );

  useEffect(() => {
    handleProgrammaticRotateRef.current = handleProgrammaticRotate;
  }, [handleProgrammaticRotate]);

  // ── AI turn effect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'GAME') return;
    if (currentTurn !== 'O') return;
    if (matchWinner) return;
    if (isRotating || isPaused || isAdLoading) return;

    const timer = setTimeout(() => {
      const eng = engineRef.current;
      if (eng.matchWinner || eng.currentTurn !== 'O' || isPaused || isAdLoading) return;

      const algorithm = difficultyToAlgorithm(difficulty);
      const move = getAIMove(eng, 'O', algorithm);
      if (!move) return;

      if (move.type === 'PLACE') {
        const { face, row, col } = move.cell;
        pushHistorySnapshot();
        const ok = eng.placePiece(face, row, col, 'O');
        if (!ok) {
          historyStackRef.current.pop();
          return;
        }

        soundEngine.playPlaceSound('O');
        rubikCubeRef.current?.syncPieces(eng.cubies);

        for (const nw of eng.lastNewlyWonBoards) {
          soundEngine.playBoardWinSound();
          particleSystemRef.current?.addWinningLineLaser(nw.face, nw.line as [number, number][], nw.winner);
        }

        if (eng.matchWinner) {
          handleMatchCompletion(eng);
        } else {
          syncStateFromEngine();
        }
      } else if (move.type === 'ROTATE') {
        handleProgrammaticRotateRef.current(move.rotation.layer, move.rotation.dir);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [phase, currentTurn, matchWinner, isRotating, isPaused, isAdLoading, difficulty, syncStateFromEngine]);

  // ── Handle Rewarded Ad: Undo Last 5 Moves ────────────────────────────────────
  const handleUndoRewardedAd = async () => {
    if (historyStackRef.current.length === 0 || isAdLoading || isRotating) return;

    setIsAdLoading(true);
    showNotificationToast('Loading rewarded ad...');

    try {
      const rewardEarned = await ytSDK.requestRewardedAd('undo-last-5-moves-reward');
      if (rewardEarned) {
        // Rewind up to 5 steps back through history
        const stepsToRewind = Math.min(5, historyStackRef.current.length);
        let restoredEngine: BoardEngine | undefined;
        for (let i = 0; i < stepsToRewind; i++) {
          restoredEngine = historyStackRef.current.pop();
        }

        if (restoredEngine) {
          engineRef.current = restoredEngine;
          rubikCubeRef.current?.restoreFromEngine(restoredEngine.cubies);
          particleSystemRef.current?.clear();

          // If was on victory screen, return back to active game
          if (phase === 'VICTORY') {
            setPhase('GAME');
          }

          syncStateFromEngine();
          soundEngine.playBoardWinSound();
          showNotificationToast(`Rewound ${stepsToRewind} moves! Your turn.`);
        }
      } else {
        showNotificationToast('Ad closed early — no moves rewound.');
      }
    } catch (err) {
      console.warn('Rewarded ad failed or was unavailable:', err);
      showNotificationToast('Rewarded ad unavailable right now.');
    } finally {
      setIsAdLoading(false);
    }
  };

  // ── Handle start game ───────────────────────────────────────────────────────
  const handleStartGame = useCallback(
    (d: AIDifficulty) => {
      const rubik = rubikCubeRef.current;
      const particleSys = particleSystemRef.current;

      if (!rubik) return;

      rubik.reset();
      particleSys?.clear();

      const engine = new BoardEngine();
      engineRef.current = engine;
      historyStackRef.current = [];

      // Initialize with balanced 12-move skirmish
      const { placedPieces } = engine.generatePresetMoves(12);
      for (const p of placedPieces) {
        rubik.addPieceMesh(p.cubieId, p.localFace, p.player);
      }

      setDifficulty(d);
      syncStateFromEngine();
      setIsRotating(false);
      setPhase('GAME');
    },
    [syncStateFromEngine]
  );

  // ── Handle return to menu ───────────────────────────────────────────────────
  const handleReturnToMenu = useCallback(() => {
    rubikCubeRef.current?.reset();
    particleSystemRef.current?.clear();
    engineRef.current = new BoardEngine();
    historyStackRef.current = [];
    syncStateFromEngine();
    setIsRotating(false);
    setPhase('MENU');
  }, [syncStateFromEngine]);

  // ── Snap camera to face ─────────────────────────────────────────────────────
  const handleSnapFace = useCallback((face: FaceId) => {
    sceneManagerRef.current?.snapToFace(face);
  }, []);

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-[#2b2621] select-none font-handwritten"
      style={{ touchAction: 'none' }}
    >
      {/* Three.js canvas container */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Toast notification message */}
      {notification && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-center font-handwritten"
          style={{
            background: 'rgba(25,16,8,0.95)',
            border: '2px solid #e8b038',
            color: '#f5ede1',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            fontSize: 14,
            minWidth: 220,
          }}
        >
          {notification}
        </div>
      )}

      {/* Paused state overlay */}
      {isPaused && (
        <PausedOverlay
          onResume={() => {
            setIsPaused(false);
            sceneManagerRef.current?.resume();
            soundEngine.resumeAll();
          }}
        />
      )}

      {/* MENU phase */}
      {phase === 'MENU' && (
        <MenuOverlay
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          onStart={() => handleStartGame(difficulty)}
          bestScore={bestScore}
          showRules={showRules}
          onToggleRules={setShowRules}
        />
      )}

      {/* GAME phase */}
      {phase === 'GAME' && (
        <>
          <MobileHUD
            scores={scores}
            currentTurn={currentTurn}
            moveCount={moveCount}
            onMenu={handleReturnToMenu}
            onHelp={() => setShowRules(true)}
            onUndoRewarded={handleUndoRewardedAd}
            canUndo={historyStackRef.current.length > 0}
            isAdLoading={isAdLoading}
          />
          <ResponsiveRotationPad
            onRotate={handleProgrammaticRotate}
            disabled={isRotating || currentTurn === 'O' || isAdLoading}
            isLandscape={isLandscape}
          />
          <FaceMiniMap
            boards={boardsState}
            onSnapFace={handleSnapFace}
            isLandscape={isLandscape}
          />
          {showRules && (
            <div
              className="absolute inset-0 z-30 flex items-center justify-center p-4"
              style={{ background: 'rgba(10,6,2,0.85)', backdropFilter: 'blur(4px)' }}
            >
              <div
                className="font-handwritten text-left p-6"
                style={{
                  background: '#2b2015',
                  borderRadius: 16,
                  border: '2px solid rgba(212,163,115,0.4)',
                  maxWidth: 340,
                  width: '90%',
                  color: '#f5ede1',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <div className="flex justify-between items-center mb-3">
                  <strong style={{ color: '#e8b038', fontSize: 16 }}>HOW TO PLAY</strong>
                  <button
                    onClick={() => setShowRules(false)}
                    style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 18 }}
                  >
                    ✕
                  </button>
                </div>
                <p>🎯 <strong>Objective:</strong> Score more 3-in-a-rows than AI across all 6 faces.</p>
                <p>✋ <strong>Place Mark:</strong> Tap any open facelet to place your X.</p>
                <p>👆 <strong>Rotate Layer:</strong> Drag across any facelet to twist that layer in 3D.</p>
                <p>🔄 <strong>Orbit:</strong> 1-finger drag on background or 2-finger pinch zoom.</p>
                <p>🔁 <strong>Multi-Use Pieces:</strong> Twisting the cube moves existing pieces into new lines for more points!</p>
                <p>⏪ <strong>Rewarded Undo:</strong> Tap "⏪ Undo 5" to watch a short ad and rewind the game 5 moves!</p>
                <p>🏁 <strong>Match End:</strong> Match completes when all 54 cells are filled. Most points wins!</p>
                <div className="mt-4 text-center">
                  <button
                    onClick={() => setShowRules(false)}
                    className="font-handwritten"
                    style={{
                      background: '#c0392b',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 10,
                      minHeight: 48,
                      padding: '8px 24px',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    CLOSE (Esc)
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* VICTORY phase */}
      {phase === 'VICTORY' && (
        <VictoryOverlay
          winner={matchWinner}
          scores={scores}
          onPlayAgain={handleReturnToMenu}
          onUndoRewarded={handleUndoRewardedAd}
          canUndo={historyStackRef.current.length > 0}
          isAdLoading={isAdLoading}
        />
      )}
    </div>
  );
}
