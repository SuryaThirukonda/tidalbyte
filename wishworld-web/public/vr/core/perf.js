// Headset performance, tuned for the Quest 2 (works on any WebXR headset):
//
//   before the session   framebuffer scale 1.0 on a Quest 2 (its native per-eye size), 1.2 on a Quest 3,
//                        and full fixed foveation (the edges of each eye are drawn at lower resolution)
//   once it starts       the display refresh: 72 Hz on a Quest 2 (the rate it holds steadily), 90 Hz on a
//                        Quest 3, using the rates the headset says it supports
//   while it runs        dynamic resolution: the time between frames is watched; when frames run long, each
//                        eye's viewport is scaled down a step (XRView.requestViewportScale, no new layer
//                        needed); after a calm spell it steps back up.
//   reporting            every 5 seconds the measured rate goes to /api/metrics for the Judge view.
const STEPS = [1, 0.9, 0.8, 0.7];

export function createPerf({ renderer, api, params, onLevel = () => {} }) {
  const ua = navigator.userAgent || '';
  const quest3 = /Quest 3/i.test(ua);
  const device = quest3 ? 'quest3' : /Quest/i.test(ua) || /OculusBrowser/i.test(ua) ? 'quest2' : 'other';
  let target = 72, step = 0, slow = 0, calm = 0, frames = 0, windowMs = 0, reportAt = 0, worstMs = 0;
  const forced = Number(params && params.get('scale'));

  /** Call before renderer.xr.setSession. */
  function beforeSession() {
    try { renderer.xr.setFramebufferScaleFactor(forced > 0 ? forced : quest3 ? 1.2 : 1.0); } catch { /* not allowed now */ }
    try { renderer.xr.setFoveation(1); } catch { /* not supported */ }
  }

  /** Call once the session is set. */
  async function onSession(session) {
    try { renderer.xr.setFoveation(1); } catch { /* not supported */ }
    step = 0; slow = 0; calm = 0;
    const rates = session && session.supportedFrameRates ? Array.from(session.supportedFrameRates) : [];
    const want = quest3 ? 90 : 72;
    if (rates.length && typeof session.updateTargetFrameRate === 'function') {
      const pick = rates.includes(want) ? want : rates.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
      try { await session.updateTargetFrameRate(pick); target = pick; } catch { /* keep the default */ }
    } else target = session && session.frameRate ? Math.round(session.frameRate) : 72;
  }

  /** Each frame, with the time since the last frame (seconds). */
  function update(dt) {
    if (!dt) return;
    const ms = dt * 1000, budget = 1000 / target;
    frames++; windowMs += ms; worstMs = Math.max(worstMs, ms);
    if (renderer.xr.isPresenting) {
      if (ms > budget * 1.45) { slow++; calm = 0; } else { calm++; slow = Math.max(0, slow - 0.25); }
      if (slow > target * 0.25 && step < STEPS.length - 1) { step++; slow = 0; onLevel(STEPS[step]); }
      else if (calm > target * 8 && step > 0) { step--; calm = 0; onLevel(STEPS[step]); }
      const frame = renderer.xr.getFrame && renderer.xr.getFrame();
      const space = renderer.xr.getReferenceSpace && renderer.xr.getReferenceSpace();
      if (frame && space && step > 0) {
        const pose = frame.getViewerPose(space);
        if (pose) for (const view of pose.views) if (view.requestViewportScale) view.requestViewportScale(STEPS[step]);
      }
    }
    if (windowMs >= 5000) {
      const fps = Math.round((frames * 1000) / windowMs);
      if (performance.now() > reportAt && api && typeof api.reportFps === 'function') {
        reportAt = performance.now() + 4500;
        api.reportFps({ fps, ms: Math.round(worstMs), scale: STEPS[step], target, device, xr: renderer.xr.isPresenting }).catch(() => {});
      }
      frames = 0; windowMs = 0; worstMs = 0;
    }
  }

  return { beforeSession, onSession, update, get scale() { return STEPS[step]; }, get target() { return target; }, device };
}
