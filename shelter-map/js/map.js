(() => {
  "use strict";

  const DEFAULT_CONFIG = {
    center: [23.1304739, 113.3618998],
    parkBounds: [
      [23.1254324, 113.3568309],
      [23.1359017, 113.3668616]
    ],
    maxBounds: [
      [23.075, 113.29],
      [23.19, 113.44]
    ],
    minZoom: 14,
    maxZoom: 19,
    initialMaxZoom: 16,
    tileUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    apiKey: "",
    apiKeyQueryParam: "token",
    attribution:
      'Powered by <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a> | Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
  };

  const config = {
    ...DEFAULT_CONFIG,
    ...(window.SHELTER_MAP_CONFIG || {})
  };

  const keyIsUsable =
    config.apiKey &&
    config.apiKey !== "YOUR_MAP_API_KEY" &&
    config.apiKey !== "YOUR_ACCESS_TOKEN";

  const tileUrl = keyIsUsable
    ? `${config.tileUrl}${config.tileUrl.includes("?") ? "&" : "?"}${encodeURIComponent(
        config.apiKeyQueryParam
      )}=${encodeURIComponent(config.apiKey)}`
    : config.tileUrl;

  const map = L.map("map", {
    center: config.center,
    zoom: config.minZoom,
    minZoom: config.minZoom,
    maxZoom: config.maxZoom,
    maxBounds: config.maxBounds,
    maxBoundsViscosity: 1,
    zoomControl: false,
    attributionControl: true,
    dragging: true,
    touchZoom: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    keyboard: true,
    bounceAtZoomLimits: false,
    worldCopyJump: false,
    preferCanvas: true
  });

  const imageryLayer = L.tileLayer(tileUrl, {
    minZoom: config.minZoom,
    maxZoom: config.maxZoom,
    maxNativeZoom: config.maxZoom,
    tileSize: 256,
    noWrap: true,
    crossOrigin: true,
    updateWhenIdle: false,
    updateWhenZooming: false,
    keepBuffer: 4,
    attribution: config.attribution
  }).addTo(map);

  L.control.zoom({ position: "topleft" }).addTo(map);

  map.fitBounds(config.parkBounds, {
    padding: [24, 24],
    maxZoom: config.initialMaxZoom,
    animate: false
  });

  let resizeFrame = 0;
  const refreshMapSize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  };

  window.addEventListener("resize", refreshMapSize, { passive: true });
  window.addEventListener("orientationchange", refreshMapSize, { passive: true });

  window.ShelterMap = Object.freeze({
    map,
    imageryLayer,
    config: Object.freeze({ ...config })
  });
})();
