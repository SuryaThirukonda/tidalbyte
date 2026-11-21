// For Node tests only: resolve 'three' and the site's absolute imports ('/shared/...', '/vr/...') the way the
// page's import map does, so modules written for the browser load unchanged.
//   node --import ./three-loader.mjs rules.test.mjs

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../../..');

if (!globalThis.__hoopsLoader) {
  globalThis.__hoopsLoader = true;
  register('data:text/javascript,' + encodeURIComponent(`
    const PUBLIC = ${JSON.stringify(pathToFileURL(publicDir).href)};
    export async function resolve(specifier, context, next) {
      if (specifier === 'three') return next(PUBLIC + '/vendor/three/build/three.module.js', context);
      if (specifier.startsWith('three/addons/')) return next(PUBLIC + '/vendor/three/examples/jsm/' + specifier.slice(13), context);
      if (specifier.startsWith('/') && !specifier.startsWith('//')) return next(PUBLIC + specifier, context);
      return next(specifier, context);
    }
  `), import.meta.url);
}
