// The Frost Slice tab: the Unity game Game_FrostSlice (Scripts/Games/FrostSliceGame.cs) for the web.
// Each controller holds a blade; fruit arcs up in front of the player; a fast swing cuts it in two.
// A fruit scanned on the phone replaces the normal fruit (customfruit.js).
// The game itself lives in /vr/games/frostslice/ (game.js is the place to start reading).
//
// Dev only (localhost or the dev harness): ?autoplay=1 plays by itself, ?autoplay=ice also cuts the ice
// blocks, ?round=12 shortens the round, ?standins=1 plays without the model files, ?plainui=1 without the
// UI kit, ?fruit=<url> uses that picture as the scanned fruit; window.__frostslice has the checks Unity's
// Debug* members offer. Checks: games/frostslice/dev/.

import { createFrostSlice } from '/vr/games/frostslice/game.js';

export const meta = { id: 'frostslice', label: 'Frost Slice', order: 3 };

export function createTab(ctx) {
  return createFrostSlice(ctx);
}
