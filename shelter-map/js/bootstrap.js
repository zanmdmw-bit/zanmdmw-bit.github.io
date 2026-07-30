const moduleVersion = "wall3d-v5-20260730";

await import(`./wall-config.js?v=${moduleVersion}`);
await import(`./wall-geometry.js?v=${moduleVersion}`);
await import(`./map.js?v=${moduleVersion}`);
await import(`./wall-renderer.js?v=${moduleVersion}`);
await import(`./wall-editor.js?v=${moduleVersion}`);
