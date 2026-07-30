(() => {
  "use strict";

  const map = window.ShelterMap?.map;
  const wallConfig = window.SHELTER_MAP_CONFIG;
  const config = window.SHELTER_ENVIRONMENT_CONFIG;
  const geometryRuntime = window.ShelterEnvironmentGeometry;
  const wallGeometry = window.ShelterWallGeometry;

  if (!map || !wallConfig?.wallFootprint || !config || !geometryRuntime) {
    throw new Error("环境重建初始化失败：地图、配置或几何模块缺失");
  }

  let footprint = wallGeometry.cloneLatLngs(wallConfig.wallFootprint);
  let segments = geometryRuntime.cloneSegments(config.environmentSegments);
  let geometry;
  let ready = false;
  let editorGuidesVisible = false;

  const sourceIds = [
    "environment-reconstruction",
    "environment-corner-clearance",
    "environment-transitions",
    "environment-inner-transitions",
    "environment-clear-zones",
    "environment-variation",
    "environment-service-roads",
    "environment-road-wear",
    "environment-gate-aprons",
    "environment-shore",
    "environment-foundations",
    "environment-contact-shadows",
    "environment-slope-steps",
    "environment-drainage",
    "environment-corner-pads",
    "environment-culverts",
    "environment-stumps",
    "environment-gate-doors",
    "environment-bollards",
    "environment-gate-labels",
    "environment-guides"
  ];

  const sourceDataById = () => ({
    "environment-reconstruction": geometry.reconstruction,
    "environment-corner-clearance": geometry.cornerClearance,
    "environment-transitions": geometry.transitions,
    "environment-inner-transitions": geometry.innerTransitions,
    "environment-clear-zones": geometry.clearZones,
    "environment-variation": geometry.variation,
    "environment-service-roads": geometry.serviceRoads,
    "environment-road-wear": geometry.roadWear,
    "environment-gate-aprons": geometry.gateAprons,
    "environment-shore": geometry.shore,
    "environment-foundations": geometry.foundations,
    "environment-contact-shadows": geometry.contactShadows,
    "environment-slope-steps": geometry.slopeSteps,
    "environment-drainage": geometry.drainage,
    "environment-corner-pads": geometry.cornerPads,
    "environment-culverts": geometry.culverts,
    "environment-stumps": geometry.stumps,
    "environment-gate-doors": geometry.gateDoors,
    "environment-bollards": geometry.bollards,
    "environment-gate-labels": geometry.gateLabels,
    "environment-guides": geometry.guides
  });

  const materialColor = fallback => {
    const expression = ["match", ["get", "material"]];
    Object.entries(config.materials).forEach(([material, color]) => {
      expression.push(material, color);
    });
    expression.push(fallback);
    return expression;
  };

  const addFillLayer = (
    id,
    source,
    minzoom,
    opacity = 1,
    fallback = "#77746a"
  ) => {
    map.addLayer({
      id,
      type: "fill",
      source,
      minzoom,
      paint: {
        "fill-color": materialColor(fallback),
        "fill-opacity": opacity,
        "fill-antialias": true
      }
    });
  };

  const addExtrusionLayer = (
    id,
    source,
    minzoom,
    opacity = 1,
    fallback = "#747875"
  ) => {
    map.addLayer({
      id,
      type: "fill-extrusion",
      source,
      minzoom,
      paint: {
        "fill-extrusion-color": materialColor(fallback),
        "fill-extrusion-height": ["coalesce", ["get", "height"], 0.12],
        "fill-extrusion-base": ["coalesce", ["get", "base"], 0],
        "fill-extrusion-opacity": opacity,
        "fill-extrusion-vertical-gradient": true
      }
    });
  };

  const installLayers = () => {
    geometry = geometryRuntime.buildEnvironmentGeometry(
      footprint,
      wallConfig,
      config,
      segments
    );
    const sourceData = sourceDataById();
    sourceIds.forEach(id => {
      map.addSource(id, {
        type: "geojson",
        data: sourceData[id],
        tolerance: 0.04
      });
    });

    const lod = config.detailZoom;

    // 这组不透明地理多边形只在工程走廊内覆盖栅格底图，
    // 作用是重建局部地表；并未修改或删除第三方卫星瓦片像素。
    addFillLayer(
      "environment-reconstruction-layer",
      "environment-reconstruction",
      lod.corridor,
      1,
      config.materials.reconstruction
    );
    addFillLayer(
      "environment-corner-clearance-layer",
      "environment-corner-clearance",
      lod.corridor,
      1,
      config.materials.compactedEarth
    );
    addFillLayer(
      "environment-transition-layer",
      "environment-transitions",
      lod.corridor,
      0.98
    );
    addFillLayer(
      "environment-inner-transition-layer",
      "environment-inner-transitions",
      lod.corridor,
      0.98
    );
    addFillLayer(
      "environment-clear-zone-layer",
      "environment-clear-zones",
      lod.corridor,
      1
    );
    addFillLayer(
      "environment-variation-layer",
      "environment-variation",
      lod.materialVariation,
      0.46
    );
    addFillLayer(
      "environment-service-road-layer",
      "environment-service-roads",
      lod.serviceRoad,
      1
    );
    addFillLayer(
      "environment-road-wear-layer",
      "environment-road-wear",
      lod.materialVariation,
      0.55
    );
    addFillLayer(
      "environment-gate-apron-layer",
      "environment-gate-aprons",
      lod.gateStructures,
      1
    );
    addFillLayer(
      "environment-contact-shadow-layer",
      "environment-contact-shadows",
      lod.foundation,
      0.48,
      config.materials.contactShadow
    );

    addExtrusionLayer(
      "environment-shore-layer",
      "environment-shore",
      lod.shoreReinforcement,
      1
    );
    addExtrusionLayer(
      "environment-foundation-layer",
      "environment-foundations",
      lod.foundation,
      1
    );
    addExtrusionLayer(
      "environment-slope-step-layer",
      "environment-slope-steps",
      lod.shoreReinforcement,
      1
    );
    addExtrusionLayer(
      "environment-drainage-layer",
      "environment-drainage",
      lod.drainage,
      0.96
    );
    addExtrusionLayer(
      "environment-corner-pad-layer",
      "environment-corner-pads",
      lod.foundation,
      1
    );
    addExtrusionLayer(
      "environment-culvert-layer",
      "environment-culverts",
      lod.shoreReinforcement,
      1
    );
    addExtrusionLayer(
      "environment-stump-layer",
      "environment-stumps",
      lod.stumpsAndBollards,
      1
    );
    addExtrusionLayer(
      "environment-gate-door-layer",
      "environment-gate-doors",
      lod.gateStructures,
      1
    );
    addExtrusionLayer(
      "environment-bollard-layer",
      "environment-bollards",
      lod.stumpsAndBollards,
      1
    );

    ready = true;
    console.info("[ShelterMap] 围墙环境工程几何校验通过", {
      segmentCount: geometry.validation.segmentCount,
      segmentLengths: geometry.validation.segmentLengths.map(segment => ({
        ...segment,
        lengthMeters: Number(segment.lengthMeters.toFixed(2))
      })),
      foundationWidthMeters: geometry.validation.foundationWidthMeters,
      innerServiceRoadWidthMeters:
        geometry.validation.defaultInnerServiceRoadWidthMeters,
      outerClearZoneWidthMeters:
        geometry.validation.defaultOuterClearZoneWidthMeters,
      vegetationTransitionWidthMeters:
        geometry.validation.vegetationTransitionWidthMeters,
      gateCount: geometry.validation.gateCount,
      rasterLimitation:
        "第三方卫星像素未修改；工程走廊由不透明 WGS-84 矢量地表覆盖"
    });
    window.dispatchEvent(new CustomEvent("shelter-environment-ready"));
  };

  const moveStructuralDetailsAboveWall = () => {
    [
      "environment-gate-door-layer",
      "environment-bollard-layer",
      "environment-stump-layer"
    ].forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.moveLayer(layerId);
      }
    });
  };

  const refreshSources = () => {
    const sourceData = sourceDataById();
    sourceIds.forEach(id => map.getSource(id)?.setData(sourceData[id]));
  };

  const rebuild = () => {
    geometry = geometryRuntime.buildEnvironmentGeometry(
      footprint,
      wallConfig,
      config,
      segments
    );
    if (ready) {
      refreshSources();
    }
    return geometry.validation;
  };

  const setFootprint = nextFootprint => {
    footprint = wallGeometry.cloneLatLngs(nextFootprint);
    return rebuild();
  };

  const setSegments = nextSegments => {
    segments = geometryRuntime.cloneSegments(nextSegments);
    return rebuild();
  };

  const updateSegment = (segmentId, changes) => {
    const index = segments.findIndex(segment => segment.id === segmentId);
    if (index < 0) {
      throw new Error(`未找到环境段：${segmentId}`);
    }
    segments[index] = { ...segments[index], ...changes };
    return rebuild();
  };

  const setEditorGuidesVisible = visible => {
    editorGuidesVisible = Boolean(visible);
    const visibility = editorGuidesVisible ? "visible" : "none";

    if (!map.getLayer("environment-editor-boundaries")) {
      map.addLayer({
        id: "environment-editor-boundaries",
        type: "line",
        source: "environment-guides",
        layout: { visibility },
        paint: {
          "line-color": [
            "match",
            ["get", "guide"],
            "centerline",
            "#ff3b24",
            "foundation-outside",
            "#f7f2df",
            "service-road-edge",
            "#50c4ff",
            "clear-edge",
            "#ffd45c",
            "transition-edge",
            "#86d47c",
            "#ffffff"
          ],
          "line-width": [
            "match",
            ["get", "guide"],
            "centerline",
            2.4,
            1.35
          ],
          "line-opacity": 0.9,
          "line-dasharray": [2, 1]
        }
      });
    } else {
      map.setLayoutProperty(
        "environment-editor-boundaries",
        "visibility",
        visibility
      );
    }
  };

  window.ShelterEnvironmentRenderer = {
    get ready() {
      return ready;
    },
    get footprint() {
      return wallGeometry.cloneLatLngs(footprint);
    },
    get segments() {
      return geometryRuntime.cloneSegments(segments);
    },
    get validation() {
      return geometry?.validation;
    },
    get gates() {
      return config.gates.map(gate => ({ ...gate }));
    },
    setFootprint,
    setSegments,
    updateSegment,
    setEditorGuidesVisible
  };

  window.addEventListener("shelter-wall-ready", moveStructuralDetailsAboveWall);

  if (map.loaded()) {
    installLayers();
  } else {
    map.once("load", installLayers);
  }
})();
