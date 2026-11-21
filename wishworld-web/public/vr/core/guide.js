// The guide's caption: Unity's GuideVoice.Say. A speech bubble parked below eye level in front of the
// viewer, typed out as the line is spoken, gone shortly after the voice stops.

import * as THREE from 'three';
import { colors } from './theme.js';

const _head = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export function createGuide({ scene, ui, audio, rig }) {
  const holder = new THREE.Group();
  holder.name = 'GuideCaption';
  const bubble = ui.makePanel({
    name: 'Caption', width: 0.86, height: 0.17, style: 'bubble', fill: colors.panel, radius: 0.06, border: 0.007,
    labels: [{ text: '', size: 0.038, font: 'body', color: colors.slate, w: 0.79, h: 0.14 }],
  });
  holder.add(bubble);
  holder.visible = false;
  holder.renderOrder = 20;
  scene.add(holder);
  ui.popIn(holder, { bob: 0.006 });

  let showing = false, hideAt = 0, clock = 0, pulse = 0, lastLine = '', waveListeners = new Set();

  audio.onLine((text, seconds) => {
    // The audio has arrived: keep the caption up for as long as the clip, and type at its pace.
    if (!showing || text !== lastLine || !(seconds > 0)) return;
    hideAt = Math.max(hideAt, clock + seconds + 0.7);
    bubble.retime(seconds * 0.9);
  });

  function place() {
    rig.viewerPosition(_head);
    rig.viewerForwardFlat(_fwd);
    // Under the menus and boards (21 to 30 degrees below eye level): clear of the hub's bottom row of cards and
    // still inside a laptop's view.
    holder.position.set(_head.x + _fwd.x * 1.05, _head.y - 0.5, _head.z + _fwd.z * 1.05);
    holder.rotation.set(-28 * Math.PI / 180, Math.atan2(-_fwd.x, -_fwd.z), 0, 'YXZ');   // facing the viewer, tilted back
  }

  return {
    /**
     * Caption and voice. Resolves when the line has been spoken.
     * { queue: true } waits for whatever is being said; otherwise this line takes over.
     * { caption: false } speaks without the bubble (words that are already on a panel: GuideVoice.Read).
     */
    say(text, { queue = false, caption = true } = {}) {
      if (typeof text !== 'string' || !text.trim()) return Promise.resolve();
      const show = () => {
        lastLine = text;
        for (const fn of waveListeners) { try { fn(text); } catch { /* listener's problem */ } }
        if (!caption) return;
        const guess = Math.min(8, Math.max(2.5, 1.8 + text.length * 0.055));
        place();
        bubble.setText(text);
        bubble.typeOn(Math.min(guess * 0.5, 0.3 + text.length * 0.035));
        if (holder.visible) ui.replay(holder); else holder.visible = true;
        showing = true;
        hideAt = clock + guess;
      };
      if (queue && audio.speaking) return audio.whenIdle().then(() => { show(); return audio.speak(text); });
      show();
      return audio.speak(text);
    },
    /** Take the caption down now and stop talking (leaving a tab). */
    hush() {
      audio.stop();
      if (showing) { showing = false; ui.close(holder); }
    },
    /** Told the text of every new line (the penguin waves when the guide starts one). */
    onLine(fn) { waveListeners.add(fn); return () => waveListeners.delete(fn); },
    get lastLine() { return lastLine; },
    update(dt) {
      clock += dt;
      if (showing && clock >= hideAt) { showing = false; ui.close(holder); }
      const target = showing && audio.speaking ? 1 : 0;
      pulse += Math.sign(target - pulse) * Math.min(Math.abs(target - pulse), dt * 4);
      ui.setPulse(holder, pulse);
    },
  };
}
