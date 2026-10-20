import express from 'express';
import { installEsportsMatchLiveRoutes } from './esports-match-live.js';
import { installEsportsMatchHistoryCache } from './esports-match-history-cache.js';
import { installEsportsMatchCommunityOverlay } from './esports-match-community-overlay.js';
import { installEsportsMatchObjectives } from './esports-match-objectives.js';
import { installEsportsMatchObjectivesV3 } from './esports-match-objectives-v3.js';

const originalUse = express.application.use;
let installed = false;

express.application.use = function patchedUse(...args) {
  // server.js registers its generic /api 404 fallback near the end. Install the
  // live-match middleware + route immediately before that fallback without
  // coupling the main server file to this feature module.
  if (!installed && args[0] === '/api') {
    installed = true;
    // Response wrappers execute in reverse installation order. Register the
    // strict reconciler first so it runs last, after history/community/legacy
    // enrichment, and can correct stale/missing objective values without
    // destroying useful fallback Ban/Grub/Herald data.
    installEsportsMatchObjectivesV3(this);
    installEsportsMatchHistoryCache(this);
    // Install the community overlay before the objective middleware so its
    // response wrapper runs after Riot/objective enrichment. Official Riot data
    // stays primary; the overlay only fills missing bans/Grubs/Herald and keeps
    // the series score moving when the final live frame lands first.
    installEsportsMatchCommunityOverlay(this);
    installEsportsMatchObjectives(this);
    installEsportsMatchLiveRoutes(this);
  }
  return originalUse.apply(this, args);
};
