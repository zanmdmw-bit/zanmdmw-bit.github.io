(() => {
  "use strict";

  const EARTH_RADIUS_METERS = 6371008.8;
  const DEFAULT_WALL_CONFIG = {
    wallCenter: [23.1304739, 113.3618998],
    wallSideMeters: 300,
    wallBearing: 0,
    wallStyle: {
      color: "#7f1d1d",
      weight: 4,
      opacity: 0.98,
      fillColor: "#b91c1c",
      fillOpacity: 0.11,
      lineCap: "square",
      lineJoin: "miter"
    }
  };

  const toRadians = degrees => (degrees * Math.PI) / 180;
  const toDegrees = radians => (radians * 180) / Math.PI;
  const normalizeBearing = degrees => ((degrees % 360) + 360) % 360;

  const destinationPoint = (origin, distanceMeters, bearingDegrees) => {
    const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
    const bearing = toRadians(normalizeBearing(bearingDegrees));
    const latitude1 = toRadians(origin[0]);
    const longitude1 = toRadians(origin[1]);

    const latitude2 = Math.asin(
      Math.sin(latitude1) * Math.cos(angularDistance) +
        Math.cos(latitude1) * Math.sin(angularDistance) * Math.cos(bearing)
    );
    const longitude2 =
      longitude1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude1),
        Math.cos(angularDistance) - Math.sin(latitude1) * Math.sin(latitude2)
      );

    return [toDegrees(latitude2), toDegrees(longitude2)];
  };

  const distanceMeters = (pointA, pointB) => {
    const latitude1 = toRadians(pointA[0]);
    const latitude2 = toRadians(pointB[0]);
    const latitudeDelta = latitude2 - latitude1;
    const longitudeDelta = toRadians(pointB[1] - pointA[1]);
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(latitude1) *
        Math.cos(latitude2) *
        Math.sin(longitudeDelta / 2) ** 2;

    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
  };

  const initialBearing = (pointA, pointB) => {
    const latitude1 = toRadians(pointA[0]);
    const latitude2 = toRadians(pointB[0]);
    const longitudeDelta = toRadians(pointB[1] - pointA[1]);
    const y = Math.sin(longitudeDelta) * Math.cos(latitude2);
    const x =
      Math.cos(latitude1) * Math.sin(latitude2) -
      Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta);

    return normalizeBearing(toDegrees(Math.atan2(y, x)));
  };

  const smallestAngle = (bearingA, bearingB) => {
    const difference = Math.abs(normalizeBearing(bearingA - bearingB));
    return difference > 180 ? 360 - difference : difference;
  };

  const assertWallConfig = config => {
    const [latitude, longitude] = config.wallCenter || [];
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error("wallCenter 必须是有效的 WGS-84 [纬度, 经度]");
    }

    if (!Number.isFinite(config.wallSideMeters) || config.wallSideMeters <= 0) {
      throw new Error("wallSideMeters 必须是大于 0 的米数");
    }

    if (!Number.isFinite(config.wallBearing)) {
      throw new Error("wallBearing 必须是有效角度");
    }
  };

  const buildWallCorners = config => {
    assertWallConfig(config);
    const halfDiagonal = config.wallSideMeters / Math.sqrt(2);
    const cornerBearings = [315, 45, 135, 225];

    return cornerBearings.map(bearing =>
      destinationPoint(
        config.wallCenter,
        halfDiagonal,
        bearing + config.wallBearing
      )
    );
  };

  const validateWall = (corners, sideMeters) => {
    const sides = corners.map((corner, index) =>
      distanceMeters(corner, corners[(index + 1) % corners.length])
    );
    const diagonals = [
      distanceMeters(corners[0], corners[2]),
      distanceMeters(corners[1], corners[3])
    ];
    const angles = corners.map((corner, index) => {
      const previous = corners[(index + corners.length - 1) % corners.length];
      const next = corners[(index + 1) % corners.length];
      return smallestAngle(
        initialBearing(corner, previous),
        initialBearing(corner, next)
      );
    });
    const expectedDiagonal = sideMeters * Math.sqrt(2);
    const sideTolerance = Math.max(0.05, sideMeters * 0.0005);
    const diagonalTolerance = Math.max(0.08, expectedDiagonal * 0.0005);
    const angleTolerance = 0.05;
    const passed =
      sides.every(side => Math.abs(side - sideMeters) <= sideTolerance) &&
      diagonals.every(
        diagonal => Math.abs(diagonal - expectedDiagonal) <= diagonalTolerance
      ) &&
      angles.every(angle => Math.abs(angle - 90) <= angleTolerance);

    return Object.freeze({
      passed,
      sideLengthsMeters: Object.freeze(sides),
      diagonalLengthsMeters: Object.freeze(diagonals),
      interiorAnglesDegrees: Object.freeze(angles),
      expectedSideMeters: sideMeters,
      expectedDiagonalMeters: expectedDiagonal
    });
  };

  const mapRuntime = window.ShelterMap;
  if (!mapRuntime?.map) {
    throw new Error("围墙初始化失败：未找到 Leaflet 地图实例");
  }

  let wallConfig = {
    ...DEFAULT_WALL_CONFIG,
    ...(window.SHELTER_MAP_CONFIG || {}),
    wallStyle: {
      ...DEFAULT_WALL_CONFIG.wallStyle,
      ...(window.SHELTER_MAP_CONFIG?.wallStyle || {})
    }
  };

  assertWallConfig(wallConfig);

  const wallPaneName = "shelter-wall-pane";
  const wallPane =
    mapRuntime.map.getPane(wallPaneName) ||
    mapRuntime.map.createPane(wallPaneName);
  wallPane.style.zIndex = "450";
  wallPane.style.pointerEvents = "none";

  const wallRenderer = L.svg({ padding: 0.5, pane: wallPaneName });
  const initialCorners = buildWallCorners(wallConfig);
  const wallLayer = L.polygon(initialCorners, {
    ...wallConfig.wallStyle,
    pane: wallPaneName,
    renderer: wallRenderer,
    interactive: false,
    smoothFactor: 0
  }).addTo(mapRuntime.map);

  let validation = validateWall(initialCorners, wallConfig.wallSideMeters);

  const reportValidation = result => {
    const summary = {
      passed: result.passed,
      center: [...wallConfig.wallCenter],
      sideMeters: wallConfig.wallSideMeters,
      bearingDegrees: normalizeBearing(wallConfig.wallBearing),
      sideLengthsMeters: result.sideLengthsMeters.map(value =>
        Number(value.toFixed(4))
      ),
      diagonalLengthsMeters: result.diagonalLengthsMeters.map(value =>
        Number(value.toFixed(4))
      ),
      interiorAnglesDegrees: result.interiorAnglesDegrees.map(value =>
        Number(value.toFixed(6))
      )
    };

    if (result.passed) {
      console.info("[ShelterMap] 围墙地理尺寸校验通过", summary);
    } else {
      console.warn("[ShelterMap] 围墙地理尺寸校验未通过", summary);
    }
  };

  const updateWall = overrides => {
    wallConfig = {
      ...wallConfig,
      ...(overrides || {}),
      wallStyle: {
        ...wallConfig.wallStyle,
        ...(overrides?.wallStyle || {})
      }
    };
    assertWallConfig(wallConfig);

    const corners = buildWallCorners(wallConfig);
    wallLayer.setLatLngs(corners);
    wallLayer.setStyle(wallConfig.wallStyle);
    validation = validateWall(corners, wallConfig.wallSideMeters);
    reportValidation(validation);

    return Object.freeze({
      corners: Object.freeze(corners.map(corner => Object.freeze([...corner]))),
      validation
    });
  };

  reportValidation(validation);

  window.ShelterMapWall = Object.freeze({
    layer: wallLayer,
    update: updateWall,
    buildCorners: buildWallCorners,
    measureDistanceMeters: distanceMeters,
    getConfig: () =>
      Object.freeze({
        ...wallConfig,
        wallCenter: Object.freeze([...wallConfig.wallCenter]),
        wallStyle: Object.freeze({ ...wallConfig.wallStyle })
      }),
    getCorners: () =>
      Object.freeze(
        wallLayer
          .getLatLngs()[0]
          .map(point => Object.freeze([point.lat, point.lng]))
      ),
    getValidation: () => validation
  });
})();
