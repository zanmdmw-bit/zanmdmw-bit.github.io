import * as maplibregl from "https://unpkg.com/maplibre-gl@6.0.0/dist/maplibre-gl.mjs";

window.maplibregl = maplibregl;

await import("./wall-config.js");
await import("./wall-geometry.js");
await import("./map.js");
await import("./wall-renderer.js");
await import("./wall-editor.js");
