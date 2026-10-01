// Where this build lives, from site.json at the repo root (build-kits.mjs bakes it in as __SITE__):
//   site     the games site's base URL
//   relay    the mp-server base (co-op rooms at <relay>/ws, leaderboards at <relay>/lb); any host can use it
//   posthog  {key, host} for game analytics, or null; build-game copies it into each game's theme/manifest.json
// Moving hosts = edit site.json, rebuild.
export interface SiteConfig { site: string; relay: string; posthog: { key: string; host?: string } | null }
declare const __SITE__: SiteConfig;

export const SITE: SiteConfig = __SITE__;
/** The relay as a WebSocket base: https -> wss, http -> ws. */
export const relayWs = () => SITE.relay.replace(/^http/, 'ws').replace(/\/$/, '');
