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
    maxPitch: 65,
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

  if (!window.maplibregl?.Map) {
    throw new Error("MapLibre GL JS 未正确加载");
  }

  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      id: "tianhe-park-satellite",
      sources: {
        "satellite-imagery": {
          type: "raster",
          tiles: [tileUrl],
          tileSize: 256,
          minzoom: config.minZoom,
          maxzoom: config.maxZoom,
          attribution: config.attribution
        }
      },
      layers: [
        {
          id: "satellite-imagery",
          type: "raster",
          source: "satellite-imagery",
          paint: {
            "raster-fade-duration": 0
          }
        }
      ],
      light: {
        anchor: "viewport",
        color: "#f3f0e7",
        intensity: 0.48,
        position: [1.15, 210, 38]
      }
    },
    center: [config.center[1], config.center[0]],
    zoom: config.minZoom,
    minZoom: config.minZoom,
    maxZoom: config.maxZoom,
    maxBounds: [
      [config.maxBounds[0][1], config.maxBounds[0][0]],
      [config.maxBounds[1][1], config.maxBounds[1][0]]
    ],
    maxPitch: config.maxPitch,
    pitch: 0,
    bearing: 0,
    canvasContextAttributes: {
      antialias: true,
      powerPreference: "high-performance"
    },
    renderWorldCopies: false,
    attributionControl: false,
    dragPan: true,
    dragRotate: true,
    scrollZoom: true,
    doubleClickZoom: true,
    touchZoomRotate: true,
    touchPitch: true,
    pitchWithRotate: true,
    keyboard: true,
    fadeDuration: 0
  });

  map.addControl(
    new maplibregl.NavigationControl({
      showCompass: true,
      showZoom: true,
      visualizePitch: true
    }),
    "top-left"
  );
  map.addControl(
    new maplibregl.AttributionControl({ compact: true }),
    "bottom-right"
  );

  class ViewControl {
    onAdd(controlledMap) {
      this.map = controlledMap;
      this.container = document.createElement("div");
      this.container.className =
        "maplibregl-ctrl maplibregl-ctrl-group shelter-view-control";

      const perspectiveButton = document.createElement("button");
      perspectiveButton.type = "button";
      perspectiveButton.textContent = "3D";
      perspectiveButton.title = "倾斜查看立体围墙";
      perspectiveButton.setAttribute("aria-label", "倾斜查看立体围墙");
      perspectiveButton.addEventListener("click", () => {
        this.map.easeTo({ pitch: 55, bearing: -20, duration: 600 });
      });

      const topButton = document.createElement("button");
      topButton.type = "button";
      topButton.textContent = "俯";
      topButton.title = "恢复北向俯视";
      topButton.setAttribute("aria-label", "恢复北向俯视");
      topButton.addEventListener("click", () => {
        this.map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
      });

      this.container.append(perspectiveButton, topButton);
      return this.container;
    }

    onRemove() {
      this.container.remove();
      this.map = undefined;
    }
  }

  map.addControl(new ViewControl(), "top-left");

  map.once("load", () => {
    map.fitBounds(
      [
        [config.parkBounds[0][1], config.parkBounds[0][0]],
        [config.parkBounds[1][1], config.parkBounds[1][0]]
      ],
      {
        padding: 24,
        maxZoom: config.initialMaxZoom,
        duration: 0
      }
    );
  });

  let resizeFrame;
  const refreshMapSize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => map.resize());
  };

  window.addEventListener("resize", refreshMapSize, { passive: true });
  window.addEventListener("orientationchange", refreshMapSize, { passive: true });

  window.ShelterMap = Object.freeze({
    map,
    config: Object.freeze({ ...config })
  });
})();
