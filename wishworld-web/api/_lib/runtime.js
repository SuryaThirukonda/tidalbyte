// Platform hooks the functions need: run work after the response is sent, and know when this invocation
// will be stopped. On Netlify, netlify/functions/api.mjs runs each handler inside `withPlatform` with the
// request's context; anywhere else (Vercel, local tests) these fall back to @vercel/functions.
import { AsyncLocalStorage } from 'node:async_hooks';
import * as vercel from '@vercel/functions';

const current = new AsyncLocalStorage();

/** Runs fn with { waitUntil(promise), deadline (ms since epoch) } as the platform for everything it calls. */
export function withPlatform(platform, fn) {
  return current.run(platform, fn);
}

/** Keeps the invocation alive until the promise settles, after the response has gone. */
export function waitUntil(promise) {
  const p = current.getStore();
  if (p && typeof p.waitUntil === 'function') return p.waitUntil(promise);
  return vercel.waitUntil(promise);
}

/** When the platform will stop this invocation, as a Date, or undefined if it does not say. */
export function getDeadline() {
  const p = current.getStore();
  if (p && p.deadline) return new Date(p.deadline);
  return vercel.getDeadline();
}
