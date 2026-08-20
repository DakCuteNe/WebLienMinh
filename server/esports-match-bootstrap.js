import express from 'express';
import { installEsportsMatchLiveRoutes } from './esports-match-live.js';
import { installEsportsMatchHistoryCache } from './esports-match-history-cache.js';

const originalUse = express.application.use;
let installed = false;

express.application.use = function patchedUse(...args) {
  // server.js registers its generic /api 404 fallback near the end. Install the
  // live-match middleware + route immediately before that fallback without
  // coupling the main server file to this feature module.
  if (!installed && args[0] === '/api') {
    installed = true;
    installEsportsMatchHistoryCache(this);
    installEsportsMatchLiveRoutes(this);
  }
  return originalUse.apply(this, args);
};
