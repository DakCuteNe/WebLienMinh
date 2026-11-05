import express from 'express';
import { installEsportsMatchLiveRoutes } from './esports-match-live.js';
import { installEsportsMatchHistoryCache } from './esports-match-history-cache.js';
import { installEsportsMatchCommunityOverlay } from './esports-match-community-overlay.js';
import { installEsportsMatchMultiGameCommunityOverlay } from './esports-match-community-multigame.js';
import { installEsportsMatchObjectives } from './esports-match-objectives.js';

const originalUse = express.application.use;
let installed = false;

express.application.use = function patchedUse(...args) {
  // server.js registers its generic /api 404 fallback near the end. Install the
  // live-match middleware + route immediately before that fallback without
  // coupling the main server file to this feature module.
  if (!installed && args[0] === '/api') {
    installed = true;
    installEsportsMatchHistoryCache(this);
    // Wrapper execution is reverse installation order. The normal community
    // overlay runs first; the multi-game layer then only supplements anything
    // still missing from MATCH 1/2/3/4/5 sections in a full Post-Match thread.
    installEsportsMatchMultiGameCommunityOverlay(this);
    installEsportsMatchCommunityOverlay(this);
    installEsportsMatchObjectives(this);
    installEsportsMatchLiveRoutes(this);
  }
  return originalUse.apply(this, args);
};
