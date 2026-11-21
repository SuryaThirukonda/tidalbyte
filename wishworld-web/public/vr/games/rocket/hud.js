// The Bottle Rocket's HUD: a mission card on the left, a water gauge on the right, and buttons under the card.
// Placed 0.9 m in front of the viewer, facing them, in world space (not on the stage).

import * as THREE from 'three';

const BUTTONS = [
  ['scan', 'Scan your bottle'], ['practice', 'Use a practice bottle'], ['arrows', 'Force arrows'],
  ['again', 'Try again'], ['next', 'Next mission'], ['outside', 'Go outside'], ['restart', 'Fly again'],
];

export function createHud(ctx, handlers) {
  const group = new THREE.Group(); group.name = 'RocketHud';
  const card = ctx.ui.makePanel({
    width: 0.44, height: 0.24, style: 'frame',
    labels: [{ text: 'Bottle Rocket', size: 0.044, font: 'title', y: 0.07, h: 0.07 }, { text: '', size: 0.026, y: -0.03, h: 0.14 }],
  });
  card.position.set(-0.5, 0.02, 0);
  card.rotation.y = 0.3;
  group.add(card);

  const gauge = new THREE.Group();
  gauge.position.set(0.5, -0.05, 0);
  gauge.rotation.y = -0.3;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.24), new THREE.MeshBasicMaterial({ color: '#334052' }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.228), new THREE.MeshBasicMaterial({ color: '#8fd0ff' }));
  fill.position.z = 0.001;
  const label = ctx.ui.makeTextPanel('Water', { width: 0.14, fontSize: 0.024, background: null });
  label.position.y = -0.15;
  gauge.add(back, fill, label);
  group.add(gauge);

  const buttons = {};
  BUTTONS.forEach(([name, text]) => {
    const b = ctx.ui.makeButton(text, () => handlers[name] && handlers[name](), { width: 0.3, height: 0.085, textHeight: 0.028 });
    b.visible = false;
    buttons[name] = b;
    group.add(b);
  });

  return {
    group,
    place(viewer, forward) {
      group.position.set(viewer.x + forward.x * 0.9, viewer.y - 0.15, viewer.z + forward.z * 0.9);
      group.rotation.set(0, Math.atan2(-forward.x, -forward.z), 0);
    },
    setMission(index, mission) { card.setText(`${index + 1}. ${mission.title}`, 0); card.setText(mission.tip, 1); },
    setMessage(title, body) { card.setText(title, 0); card.setText(body, 1); },
    setWater(fraction) { fill.scale.y = Math.max(0.001, fraction); fill.position.y = -0.114 * (1 - fraction); },
    /** Show only these buttons, stacked under the card in this order. */
    show(names) {
      for (const name in buttons) buttons[name].visible = false;
      names.forEach((name, i) => { const b = buttons[name]; b.visible = true; b.position.set(-0.5, -0.17 - i * 0.1, 0.01); b.rotation.y = 0.3; });
    },
  };
}
