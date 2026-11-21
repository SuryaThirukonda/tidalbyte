// Small three.js preview for a scanned companion: loads a .glb, fits it in view, turns slowly, drag to spin.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

async function loadGlb(url) {
  const loader = new GLTFLoader();
  try {
    const { MeshoptDecoder } = await import("three/addons/libs/meshopt_decoder.module.js");
    loader.setMeshoptDecoder(MeshoptDecoder);
  } catch { /* plain .glb files do not need it */ }
  try {
    const gltf = await loader.loadAsync(url);
    return gltf.scene || (gltf.scenes && gltf.scenes[0]);
  } catch (err) {
    // The shared loader may know about formats this one does not (for example Draco).
    const shared = await import("/shared/models.js");
    if (typeof shared.loadModelUrl !== "function") throw err;
    return shared.loadModelUrl(url, 1);
  }
}

/** @returns {Promise<{ dispose(): void }>} */
export async function createModelViewer(container, url) {
  const model = await loadGlb(url);
  if (!model) throw new Error("empty model");

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8cce0, 1.3));
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.5);
  sun.position.set(2, 3, 2.5);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdbe6f2, 0.4);
  fill.position.set(-2.5, 1, -1.5);
  scene.add(fill);

  // Centre the model on a turntable and scale its longest side to 1.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z) || 1;
  const turntable = new THREE.Group();
  model.position.sub(centre);
  turntable.add(model);
  turntable.scale.setScalar(1 / longest);
  scene.add(turntable);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 20);
  camera.position.set(0, 0.25, 2.5);
  camera.lookAt(0, 0, 0);

  function resize() {
    const w = container.clientWidth || 300, hgt = container.clientHeight || 300;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(container);

  // Drag to spin; it drifts on its own when left alone.
  let dragging = false, lastX = 0, lastY = 0, velocity = 0.6, tilt = 0, idleAt = 0;
  const el = renderer.domElement;
  el.style.touchAction = "none";
  el.style.cursor = "grab";
  const down = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; el.setPointerCapture?.(e.pointerId); el.style.cursor = "grabbing"; };
  const move = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    turntable.rotation.y += dx * 0.012;
    tilt = Math.max(-0.9, Math.min(0.9, tilt + dy * 0.008));
    velocity = dx * 0.6;
  };
  const up = () => { dragging = false; idleAt = performance.now(); el.style.cursor = "grab"; };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);

  let disposed = false, lastTime = 0, elapsed = 0;
  renderer.setAnimationLoop((time) => {
    if (disposed) return;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
    lastTime = time; elapsed += dt;
    if (!dragging) {
      // ease back to a gentle turn
      const target = performance.now() - idleAt > 1500 ? 0.6 : velocity;
      velocity += (target - velocity) * Math.min(1, dt * 2);
      turntable.rotation.y += velocity * dt;
    }
    turntable.rotation.x += (tilt - turntable.rotation.x) * Math.min(1, dt * 8);
    turntable.position.y = Math.sin(elapsed * 1.4) * 0.03;
    renderer.render(scene, camera);
  });

  return {
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      if (ro) ro.disconnect();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) { for (const v of Object.values(m)) if (v && v.isTexture) v.dispose(); m.dispose(); }
      });
      renderer.dispose();
      el.remove();
    },
  };
}
