import * as maplibregl from "https://unpkg.com/maplibre-gl@6.0.0/dist/maplibre-gl.mjs";

window.maplibregl = maplibregl;

const moduleVersion = "wall3d-20260730";

await import(`./wall-config.js?v=${moduleVersion}`);
await import(`./wall-geometry.js?v=${moduleVersion}`);
await import(`./map.js?v=${moduleVersion}`);
await import(`./wall-renderer.js?v=${moduleVersion}`);
await import(`./wall-editor.js?v=${moduleVersion}`);
