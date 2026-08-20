import express from 'express';
import { installEsportsMatchLiveRoutes } from './esports-match-live.js';

const LIVE_WINDOW_PREFIX = 'https://feed.lolesports.com/livestats/v1/window/';
const LATEST_PROBE_COOLDOWN_MS = 2_500;
const latestProbeMiss = new Map();

function installLatestLiveWindowFallback() {
  if (globalThis.__riftLatestLiveWindowFallbackInstalled || typeof globalThis.fetch !== 'function') return;
  globalThis.__riftLatestLiveWindowFallbackInstalled = true;

  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async function latestLiveWindowFetch(input, init) {
    let url = null;
    try {
      const raw = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
      if (raw) url = new URL(raw);
    } catch {}

    if (!url?.href.startsWith(LIVE_WINDOW_PREFIX) || !url.searchParams.has('startingTime')) {
      return nativeFetch(input, init);
    }

    const gameId = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || '');
    const lastMiss = latestProbeMiss.get(gameId) || 0;

    if (gameId && Date.now() - lastMiss >= LATEST_PROBE_COOLDOWN_MS) {
      const latestUrl = new URL(url);
      latestUrl.searchParams.delete('startingTime');
      try {
        const latestResponse = await nativeFetch(latestUrl.toString(), {
          ...init,
          signal: AbortSignal.timeout(4_500)
        });
        if (latestResponse.ok) {
          const preview = await latestResponse.clone().json().catch(() => null);
          if (preview?.frames?.length || preview?.gameMetadata) return latestResponse;
        }
      } catch {}
      latestProbeMiss.set(gameId, Date.now());
    }

    return nativeFetch(input, init);
  };
}

installLatestLiveWindowFallback();

const originalUse = express.application.use;
let installed = false;

express.application.use = function patchedUse(...args) {
  // server.js registers its generic /api 404 fallback near the end. Install the
  // live-match route immediately before that fallback without coupling the main
  // server file to this feature module.
  if (!installed && args[0] === '/api') {
    installed = true;
    installEsportsMatchLiveRoutes(this);
  }
  return originalUse.apply(this, args);
};
