// The Snow Hoops tab: a Wii Sports Resort style 3-point contest where the ball is a toy the child scanned with the
// phone (or Bubby). The game itself lives in /vr/games/hoops/ (game.js is the place to start reading).
//
// Dev only (localhost or the dev harness): ?autoplay=1 picks a ball and shoots by itself, ?autoplay=perfect never
// misses, ?round=12 shortens the round, ?standins=1 plays without the server; window.__hoops has the checks.
// Checks: games/hoops/dev/ (rules.test.mjs in Node, check.mjs in a browser).

import { createSnowHoops } from '/vr/games/hoops/game.js';

export const meta = { id: 'hoops', label: 'Snow Hoops', order: 4 };

export function createTab(ctx) {
  return createSnowHoops(ctx);
}
