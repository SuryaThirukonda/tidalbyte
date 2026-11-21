// The Bottle Rocket tab: the child's scanned water bottle becomes a rocket they pilot through six missions that
// teach thrust, pitch, yaw, roll, lift and drag. The game lives in /vr/games/rocket/ (game.js is the place to start).
// Dev only: ?autoplay=1, ?mission=N, window.__rocket. Checks: games/rocket/dev/.

import { createRocketGame } from '/vr/games/rocket/game.js';

export const meta = { id: 'rocket', label: 'Bottle Rocket', order: 5.5 };

export function createTab(ctx) {
  return createRocketGame(ctx);
}
