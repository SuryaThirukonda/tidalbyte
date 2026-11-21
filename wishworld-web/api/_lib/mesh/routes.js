// The free ways to turn one photo into a 3D model. Each is a public Hugging Face Space driven through
// its Gradio queue (see gradio.js). No paid service and no key is needed; an optional free Hugging Face
// token (HF_TOKEN) only raises the daily GPU allowance of the first two.
//
//   sf3d     stabilityai/stable-fast-3d   textured, about 10 s of GPU. "ZeroGPU" Space: Hugging Face gives
//                                         each caller a small daily GPU allowance (2 minutes without a token,
//                                         5 with a free one) and refuses a job that asks for more than is left.
//   trellis  trellis-community/TRELLIS    textured, best looking, 30 to 60 s. Also ZeroGPU, and asks for
//                                         120 s at once, so it only runs with a fresh allowance.
//   triposr  WeReCooking2/Dust3R-TripoSR  vertex colours, 35 to 70 s on a free CPU Space. No allowance to run
//                                         out, so this is the one that works when the others are refused.
//   trellism the same TRELLIS Space in its "Multiple Images" mode: several photos of one object (front, back,
//            sides) go into one model, so the back is built from a real view instead of being guessed.
//
// Every route takes the photo bytes and returns the raw .glb the Space produced (not yet optimised).
// trellism takes an array of photos (front first) instead of one.
import { openSpace, findFile, SpaceError } from './gradio.js';

const SPACES = {
  sf3d: () => process.env.MESH_SF3D_SPACE || 'https://stabilityai-stable-fast-3d.hf.space',
  trellis: () => process.env.MESH_TRELLIS_SPACE || 'https://trellis-community-trellis.hf.space',
  // Point this at your own copy of the Space ("Duplicate this Space" on its page, free CPU hardware) for
  // a queue that is not shared with strangers.
  triposr: () => process.env.MESH_TRIPOSR_SPACE || 'https://werecooking2-dust3r-triposr.hf.space',
};

const GLB = /\.glb(\?|$)/i;

function extFor(mime) {
  return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
}

function glbFrom(outputs, what) {
  const file = findFile(outputs, GLB);
  if (!file) throw new SpaceError(`${what}: the Space did not return a .glb`);
  return file;
}

function assertGlb(bytes, what) {
  if (bytes.length < 200 || bytes.subarray(0, 4).toString('latin1') !== 'glTF') {
    throw new SpaceError(`${what}: the file returned is not a .glb`);
  }
  return bytes;
}

/** Stable Fast 3D. Two steps in one session: cut out the background, then build the textured mesh. */
async function sf3d(image, mime, { deadline, onStatus }) {
  const space = await openSpace(SPACES.sf3d(), { deadline });
  const photo = await space.upload(image, `photo.${extFor(mime)}`, mime);
  // run_button(button label, photo, <state>, foreground ratio, remeshing, vertex count, texture size)
  const args = (label) => [label, photo, null, 0.85, 'None', -1, 1024];
  await space.call('run_button', args('Remove Background'), { onStatus });
  const out = await space.call('run_button', args('Run'), { onStatus });
  return assertGlb(await space.download(glbFrom(out, 'sf3d')), 'sf3d');
}

/** TRELLIS. Background removal runs on the Space's CPU; generation and GLB export are one GPU call. */
async function trellis(image, mime, { deadline, onStatus }) {
  const space = await openSpace(SPACES.trellis(), { deadline });
  await space.call('start_session', [], { onStatus });
  const photo = await space.upload(image, `photo.${extFor(mime)}`, mime);
  const pre = await space.call('preprocess_image', [photo], { onStatus });
  const cut = findFile(pre);
  if (!cut) throw new SpaceError('trellis: background removal returned nothing');
  // (image, multi-view images, <state>, seed, structure guidance, structure steps, detail guidance, detail steps,
  //  multi-image algorithm, simplify 0.9 to 0.98, texture size)
  const out = await space.call(
    'generate_and_extract_glb',
    [{ path: cut.path, meta: { _type: 'gradio.FileData' } }, [], null, 0, 7.5, 12, 3, 12, 'stochastic', 0.97, 1024],
    { onStatus },
  );
  return assertGlb(await space.download(glbFrom(out, 'trellis')), 'trellis');
}

const fileData = (f) => ({ path: f.path, meta: { _type: 'gradio.FileData' } });

/**
 * TRELLIS from several photos of the same object, front first. The Space's "Multiple Images" tab sets a hidden
 * is-multi-image state; passing true there makes generation use every view (the "stochastic" algorithm).
 */
async function trellisMulti(images, mime, { deadline, onStatus }) {
  if (!Array.isArray(images) || images.length < 2) throw new SpaceError('trellism: needs at least two photos');
  const space = await openSpace(SPACES.trellis(), { deadline });
  await space.call('start_session', [], { onStatus });
  const uploaded = [];
  for (let i = 0; i < images.length; i++) uploaded.push(await space.upload(images[i], `view-${i}.${extFor(mime)}`, mime));
  const pre = await space.call('preprocess_images', [uploaded.map((f) => ({ image: f, caption: null }))], { onStatus });
  const list = Array.isArray(pre && pre[0]) ? pre[0] : [];
  const cut = list.map((entry) => findFile(entry)).filter(Boolean);
  if (cut.length < 2) throw new SpaceError('trellism: background removal returned too few views');
  const out = await space.call(
    'generate_and_extract_glb',
    [fileData(cut[0]), cut.map((f) => ({ image: fileData(f), caption: null })), true, 0, 7.5, 12, 3, 12, 'stochastic', 0.97, 1024],
    { onStatus },
  );
  return assertGlb(await space.download(glbFrom(out, 'trellism')), 'trellism');
}

/** TripoSR on a free CPU Space. Resolution 160 keeps it near 35 s; the mesh is simplified afterwards anyway. */
async function triposr(image, mime, { deadline, onStatus }) {
  const space = await openSpace(SPACES.triposr(), { deadline });
  const photo = await space.upload(image, `photo.${extFor(mime)}`, mime);
  const pre = await space.call('preprocess', [photo, true, 0.85], { onStatus });
  const cut = findFile(pre);
  if (!cut) throw new SpaceError('triposr: background removal returned nothing');
  const resolution = Number(process.env.MESH_TRIPOSR_RESOLUTION) || 160;
  const out = await space.call('generate', [{ path: cut.path, meta: { _type: 'gradio.FileData' } }, resolution], { onStatus });
  return assertGlb(await space.download(glbFrom(out, 'triposr')), 'triposr');
}

export const ROUTES = { sf3d, trellis, triposr, trellism: trellisMulti };
