// The floating tab menu: a snowy panel with one button per tab, summoned in front of the viewer with a
// controller button (B on the right controller or X on the left; M or Tab on a keyboard). It is laid out
// like the Unity wish menu (Scripts/Wish/WishMenu.cs): pill buttons in three columns on a framed panel.
// A room row above the bottom buttons shows the room code and switches room: the rooms used on this device
// and "New room" (a headset has no keyboard; on a laptop the room chip in the corner takes a typed code).

import * as THREE from 'three';
import { colors } from './theme.js';

const COLS = 3, CELL_W = 0.27, CELL_H = 0.105, STEP_X = 0.285, STEP_Y = 0.12;
const _head = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export function createMenu({ scene, ui, rig, getTabs, getActive, onPick, onRecenter, onExit, isImmersive,
  getRoom = () => '', getRecentRooms = () => [], onRoom = null, onNewRoom = null }) {
  const holder = new THREE.Group();
  holder.name = 'TabMenu';
  holder.visible = false;
  scene.add(holder);
  ui.popIn(holder);

  let built = false, open = false;
  const tabButtons = new Map();

  function build() {
    while (holder.children.length) holder.remove(holder.children[0]);
    tabButtons.clear();
    const tabs = getTabs().filter((t) => !t.meta.hidden);
    const rows = Math.max(1, Math.ceil(tabs.length / COLS));
    const roomRow = onRoom ? 0.13 : 0;
    const width = 0.92, height = 0.3 + rows * STEP_Y + 0.06 + roomRow;
    const panel = ui.makePanel({ name: 'MenuPanel', width, height, style: 'frame', fill: colors.panel, radius: 0.05, border: 0.008 });
    holder.add(panel);
    const ribbon = ui.makeRibbon('WishWorld', { width: 0.5, height: 0.1, textHeight: 0.07 });
    ribbon.position.set(0, height / 2 - 0.005, 0.008);
    holder.add(ribbon);

    const top = height / 2 - 0.15;
    tabs.forEach((t, i) => {
      const b = ui.makeButton(t.meta.label, () => { close(); onPick(t.id); }, { width: CELL_W, height: CELL_H, textHeight: 0.034 });
      b.position.set((i % COLS - 1) * STEP_X, top - Math.floor(i / COLS) * STEP_Y, 0.006);
      holder.add(b);
      tabButtons.set(t.id, b);
    });

    const y = -height / 2 + 0.105;
    if (onRoom) {
      // Room WISH  [TEST] [ABC123] [New room]
      const ry = y + 0.122;
      const label = ui.makeLabel('Room ' + getRoom(), { width: 0.25, height: 0.07, size: 0.034, font: 'heading' });
      label.position.set(-STEP_X - 0.01, ry, 0.006);
      holder.add(label);
      const others = getRecentRooms().filter((c) => c !== getRoom()).slice(0, 2);
      const slots = [...others.map((code) => [code, () => { close(); onRoom(code); }])];
      if (onNewRoom) slots.push(['New room', () => { close(); onNewRoom(); }]);
      slots.slice(0, 3).forEach(([text, fn], i) => {
        const b = ui.makeButton(text, fn, { width: 0.19, height: 0.085, textHeight: 0.03 });
        b.position.set(-0.035 + i * 0.205, ry, 0.006);
        holder.add(b);
      });
    }
    const recenter = ui.makeButton('Recenter', () => { onRecenter(); place(); }, { width: CELL_W, height: 0.095, textHeight: 0.032 });
    recenter.position.set(-STEP_X, y, 0.006);
    const closeButton = ui.makeButton('Close', () => close(), { width: CELL_W, height: 0.095, textHeight: 0.032, fill: colors.peach });
    closeButton.position.set(0, y, 0.006);
    const exit = ui.makeButton(isImmersive() ? 'Exit' : 'Start page', () => { close(); onExit(); }, { width: CELL_W, height: 0.095, textHeight: 0.032 });
    exit.position.set(STEP_X, y, 0.006);
    holder.add(recenter, closeButton, exit);
    holder.userData.exitButton = exit;
    built = true;
    mark();
  }

  function mark() {
    const active = getActive();
    for (const [id, b] of tabButtons) b.setSelected(id === active);
  }

  function place() {
    rig.viewerPosition(_head);
    rig.viewerForwardFlat(_fwd);
    holder.position.set(_head.x + _fwd.x * 0.95, _head.y - 0.12, _head.z + _fwd.z * 0.95);
    holder.rotation.set(-8 * Math.PI / 180, Math.atan2(-_fwd.x, -_fwd.z), 0, 'YXZ');
  }

  function show() {
    if (!built || onRoom) build();               // the room row changes as rooms are used
    if (holder.userData.exitButton) holder.userData.exitButton.setLabel(isImmersive() ? 'Exit' : 'Start page');
    mark();
    place();
    holder.visible = true;
    ui.replay(holder);
    open = true;
  }

  function close() {
    if (!open) return;
    open = false;
    ui.close(holder);
  }

  return {
    toggle() { if (open) close(); else show(); },
    show, close,
    /** Call when the tab list or the active tab changes. */
    refresh() { if (built) { if (tabButtons.size !== getTabs().filter((t) => !t.meta.hidden).length) build(); else mark(); } },
    rebuild() { built = false; if (open) show(); },
    get open() { return open; },
  };
}
