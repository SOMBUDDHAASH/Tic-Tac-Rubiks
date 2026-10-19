# Tic-Tac-Rubiks (YouTube Playables Edition)

A high-performance, mobile-first 3D Rubik's Cube Tic-Tac-Toe game crafted with **Three.js**, **React 19**, and **TypeScript**, specifically architected and optimized for **YouTube Playables certification**.

Featuring an oil-pastel and crayon childhood sketchbook aesthetic rendered entirely via procedural canvas shaders and textures (keeping the entire production bundle under 1 MiB, well below the platform's 30 MiB initial payload threshold).

---

## 🎮 Gameplay & Strategic Mechanics

- **Single Player vs. Multi-Tiered AI**:
  - **Easy (Random Explorer)**: Stochastic sampling for light, casual mobile sessions.
  - **Medium (Greedy Heuristic 1-ply)**: Evaluates +100 point line completions and blocks incoming threats (+50).
  - **Hard (Minimax Lookahead with Alpha-Beta Pruning 2-ply)**: High-level tactical tree evaluations simulating opponent responses.
- **Dynamic 3D Multi-Use Scoring**: Aligning 3 identical marks along any row, column, or diagonal on any of the 6 faces scores points. Rotating cube layers dynamically recalculates and preserves past scores, allowing clever realignment combos.
- **Mid-Game Skirmish Entry**: Matches launch instantly with an active 12-piece skirmish configuration so players engage directly in high-stakes strategy.

---

## 📱 YouTube Playables Architecture & Compliance

- **SDK Integration**:
  - Standard pre-game loading handoff via `ytgame.game.firstFrameReady()` on mount and `ytgame.game.gameReady()` when 3D textures and interaction listeners are online.
  - System lifecycle management with `ytgame.system.onPause()` and `ytgame.system.onResume()` freezing Three.js render loops, silencing Web Audio, and halting AI timers without using forbidden Page Visibility APIs.
  - Full Esc key modal dismissing without calling `preventDefault()`.
  - All interactive elements engineered with $\ge 48 \times 48\text{ dp}$ touch targets.
- **Monetization (Ads)**:
  - **Post-Match Interstitials**: Requests `ytgame.ads.requestInterstitialAd()` upon game completion / 54-cell exhaustion with graceful error fallbacks.
  - **Rewarded Ad ("Undo Last 5 Moves")**: Triggers `ytgame.ads.requestRewardedAd('undo-last-5-moves-reward')` to step back the board matrix, dynamic multi-use counters, and 3D piece positions.
- **Viewport Agility**: Responsive portrait-first layout with smooth dynamic scaling across extreme aspect ratios (9:32 up to 32:9).

---

## 🛠️ Development & Build

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Compile production bundle for YouTube Playables submission
npm run build
```

The production output will be generated inside the `dist/` directory with `index.html` at the root.
