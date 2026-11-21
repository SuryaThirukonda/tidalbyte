// The worlds tab: Unity's World scene. Pick a world (the hub's Worlds menu), stand in it among its
// creatures, point at one and pull the trigger to hear its fact, find them all and take the quiz.
// In the real room (AR) the creatures come to you instead.
//
// The work is in /vr/worlds/: controller.js (WorldController), creatures.js (Spawner, Creature),
// panels.js (the picker, info panel, fact card and quiz) and voice.js (the guide and the sounds).

import { createWorldsTab } from '/vr/worlds/controller.js';

export const meta = { id: 'worlds', label: 'Worlds', order: 2 };

export function createTab(ctx) {
  return createWorldsTab(ctx);
}
