(() => {
  "use strict";

  const mapRuntime = window.ShelterMap;
  const geometryRuntime = window.ShelterWallGeometry;
  const config = window.SHELTER_MAP_CONFIG;

  if (!mapRuntime?.map || !geometryRuntime || !config?.wallFootprint) {
    throw new Error("立体围墙初始化失败：地图、几何模块或配置缺失");
  }

  const map = mapRuntime.map;
  let footprint = geometryRuntime.cloneLatLngs(config.wallFootprint);
  let geometry;
  let ready = false;

  const sourceIds = [
    "wall-foundation",
    "wall-body",
    "wall-walkway",
    "wall-outer-parapet",
    "wall-inner-guard",
    "wall-corner-bodies",
    "wall-corner-caps",
    "wall-openings",
    "wall-surface-marks"
  ];

  const sourceDataById = () => ({
    "wall-foundation": geometry.foundation,
    "wall-body": geometry.body,
    "wall-walkway": geometry.walkway,
    "wall-outer-parapet": geometry.outerParapet,
    "wall-inner-guard": geometry.innerGuard,
    "wall-corner-bodies": geometry.cornerBodies,
    "wall-corner-caps": geometry.cornerCaps,
    "wall-openings": geometry.openings,
    "wall-surface-marks": geometry.surfaceMarks
  });

  const extrusionPaint = (color, opacity = 0.98) => ({
    "fill-extrusion-color": color,
    "fill-extrusion-height": ["get", "height"],
    "fill-extrusion-base": ["get", "base"],
    "fill-extrusion-opacity": opacity,
    "fill-extrusion-vertical-gradient": true
  });

  const addExtrusionLayer = (id, source, minzoom, color, opacity) => {
    map.addLayer({
      id,
      type: "fill-extrusion",
      source,
      minzoom,
      paint: extrusionPaint(color, opacity)
    });
  };

  const installLayers = () => {
    geometry = geometryRuntime.buildWallGeometry(footprint, config);
    const sourceData = sourceDataById();

    sourceIds.forEach(id => {
      map.addSource(id, {
        type: "geojson",
        data: sourceData[id],
        tolerance: 0.05
      });
    });

    const colors = config.wallMaterial;
    const lod = config.detailZoom;

    addExtrusionLayer(
      "wall-foundation-layer",
      "wall-foundation",
      lod.overall,
      colors.foundationColor,
      0.9
    );
    addExtrusionLayer(
      "wall-body-layer",
      "wall-body",
      lod.overall,
      colors.bodyColor,
      0.99
    );
    addExtrusionLayer(
      "wall-corner-body-layer",
      "wall-corner-bodies",
      lod.platforms,
      colors.bodyColor,
      0.99
    );
    addExtrusionLayer(
      "wall-walkway-layer",
      "wall-walkway",
      lod.walkway,
      colors.walkwayColor,
      1
    );
    addExtrusionLayer(
      "wall-corner-cap-layer",
      "wall-corner-caps",
      lod.platforms,
      colors.walkwayColor,
      1
    );
    addExtrusionLayer(
      "wall-outer-parapet-layer",
      "wall-outer-parapet",
      lod.guards,
      colors.outerParapetColor,
      1
    );
    addExtrusionLayer(
      "wall-inner-guard-layer",
      "wall-inner-guard",
      lod.guards,
      colors.innerGuardColor,
      1
    );

    map.addLayer({
      id: "wall-openings-layer",
      type: "fill-extrusion",
      source: "wall-openings",
      minzoom: lod.openings,
      paint: extrusionPaint(colors.openingColor, 0.98)
    });

    map.addLayer({
      id: "wall-surface-marks-layer",
      type: "fill-extrusion",
      source: "wall-surface-marks",
      minzoom: lod.surfaceMarks,
      paint: {
        ...extrusionPaint(
          [
            "match",
            ["get", "kind"],
            "stain",
            colors.stainColor,
            colors.jointColor
          ],
          0.48
        )
      }
    });

    ready = true;
    console.info("[ShelterMap] 立体围墙几何校验通过", {
      nodeCount: geometry.validation.nodeCount,
      perimeterMeters: Number(geometry.validation.perimeterMeters.toFixed(2)),
      segmentLengthsMeters: geometry.validation.segmentLengthsMeters.map(value =>
        Number(value.toFixed(2))
      ),
      wallThicknessMeters: geometry.validation.wallThicknessMeters,
      wallHeightMeters: geometry.validation.wallHeightMeters,
      walkwayWidthMeters: geometry.validation.walkwayWidthMeters,
      topGuardHeightMeters: geometry.validation.guardHeightMeters,
      coordinateSystem: "WGS-84 / local metre projection / Web Mercator display"
    });

    window.dispatchEvent(new CustomEvent("shelter-wall-ready"));
  };

  const setFootprint = nextFootprint => {
    const nextGeometry = geometryRuntime.buildWallGeometry(nextFootprint, config);
    footprint = geometryRuntime.cloneLatLngs(nextFootprint);
    geometry = nextGeometry;

    if (ready) {
      const sourceData = sourceDataById();
      sourceIds.forEach(id => map.getSource(id).setData(sourceData[id]));
    }

    return geometry.validation;
  };

  window.ShelterWallRenderer = {
    get ready() {
      return ready;
    },
    get footprint() {
      return geometryRuntime.cloneLatLngs(footprint);
    },
    get validation() {
      return geometry?.validation;
    },
    get guideGeoJSON() {
      return geometry?.guide;
    },
    setFootprint
  };

  if (map.loaded()) {
    installLayers();
  } else {
    map.once("load", installLayers);
  }
})();
