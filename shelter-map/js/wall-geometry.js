(() => {
  "use strict";

  const EARTH_RADIUS_METERS = 6371008.8;
  const EPSILON = 1e-8;
  const radians = degrees => (degrees * Math.PI) / 180;
  const degrees = value => (value * 180) / Math.PI;
  const cloneLatLngs = points => points.map(point => [point[0], point[1]]);

  const assertFootprint = footprint => {
    if (!Array.isArray(footprint) || footprint.length < 4) {
      throw new Error("wallFootprint 至少需要四个节点");
    }

    footprint.forEach((point, index) => {
      const [latitude, longitude] = point || [];
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        throw new Error(`wallFootprint 第 ${index + 1} 个节点不是有效的 WGS-84 坐标`);
      }
    });
  };

  const createLocalProjection = footprint => {
    assertFootprint(footprint);
    const originLatitude =
      footprint.reduce((sum, point) => sum + point[0], 0) / footprint.length;
    const originLongitude =
      footprint.reduce((sum, point) => sum + point[1], 0) / footprint.length;
    const cosineLatitude = Math.cos(radians(originLatitude));

    return Object.freeze({
      origin: Object.freeze([originLatitude, originLongitude]),
      project: point => ({
        x:
          EARTH_RADIUS_METERS *
          radians(point[1] - originLongitude) *
          cosineLatitude,
        y: EARTH_RADIUS_METERS * radians(point[0] - originLatitude)
      }),
      unproject: point => [
        originLatitude + degrees(point.y / EARTH_RADIUS_METERS),
        originLongitude +
          degrees(point.x / (EARTH_RADIUS_METERS * cosineLatitude))
      ]
    });
  };

  const signedArea = points =>
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2;

  const cross = (a, b, c) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

  const onSegment = (a, b, point) =>
    Math.min(a.x, b.x) - EPSILON <= point.x &&
    point.x <= Math.max(a.x, b.x) + EPSILON &&
    Math.min(a.y, b.y) - EPSILON <= point.y &&
    point.y <= Math.max(a.y, b.y) + EPSILON;

  const segmentsIntersect = (a, b, c, d) => {
    const abC = cross(a, b, c);
    const abD = cross(a, b, d);
    const cdA = cross(c, d, a);
    const cdB = cross(c, d, b);

    if (
      ((abC > EPSILON && abD < -EPSILON) ||
        (abC < -EPSILON && abD > EPSILON)) &&
      ((cdA > EPSILON && cdB < -EPSILON) ||
        (cdA < -EPSILON && cdB > EPSILON))
    ) {
      return true;
    }

    return (
      (Math.abs(abC) <= EPSILON && onSegment(a, b, c)) ||
      (Math.abs(abD) <= EPSILON && onSegment(a, b, d)) ||
      (Math.abs(cdA) <= EPSILON && onSegment(c, d, a)) ||
      (Math.abs(cdB) <= EPSILON && onSegment(c, d, b))
    );
  };

  const assertSimplePolygon = points => {
    for (let first = 0; first < points.length; first += 1) {
      const firstNext = (first + 1) % points.length;
      for (let second = first + 1; second < points.length; second += 1) {
        const secondNext = (second + 1) % points.length;
        const adjacent =
          first === second ||
          firstNext === second ||
          secondNext === first ||
          (first === 0 && secondNext === 0);

        if (
          !adjacent &&
          segmentsIntersect(
            points[first],
            points[firstNext],
            points[second],
            points[secondNext]
          )
        ) {
          throw new Error("wallFootprint 存在自相交边，无法生成连续墙体");
        }
      }
    }
  };

  const normalizeCounterClockwise = points =>
    signedArea(points) >= 0 ? points : [...points].reverse();

  const lineIntersection = (pointA, directionA, pointB, directionB) => {
    const denominator =
      directionA.x * directionB.y - directionA.y * directionB.x;

    if (Math.abs(denominator) < EPSILON) {
      return {
        x: (pointA.x + pointB.x) / 2,
        y: (pointA.y + pointB.y) / 2
      };
    }

    const deltaX = pointB.x - pointA.x;
    const deltaY = pointB.y - pointA.y;
    const distance =
      (deltaX * directionB.y - deltaY * directionB.x) / denominator;

    return {
      x: pointA.x + directionA.x * distance,
      y: pointA.y + directionA.y * distance
    };
  };

  // 正值向 CCW 多边形内侧偏移，负值向外侧偏移；单位均为米。
  const offsetRing = (points, offsetMeters) => {
    const edges = points.map((point, index) => {
      const next = points[(index + 1) % points.length];
      const dx = next.x - point.x;
      const dy = next.y - point.y;
      const length = Math.hypot(dx, dy);

      if (length < EPSILON) {
        throw new Error("wallFootprint 含有重复的相邻节点");
      }

      const direction = { x: dx / length, y: dy / length };
      const inwardNormal = { x: -direction.y, y: direction.x };
      return {
        direction,
        shiftedPoint: {
          x: point.x + inwardNormal.x * offsetMeters,
          y: point.y + inwardNormal.y * offsetMeters
        }
      };
    });

    return points.map((point, index) => {
      const previousEdge = edges[(index + edges.length - 1) % edges.length];
      const currentEdge = edges[index];
      const intersection = lineIntersection(
        previousEdge.shiftedPoint,
        previousEdge.direction,
        currentEdge.shiftedPoint,
        currentEdge.direction
      );
      const miterDistance = Math.hypot(
        intersection.x - point.x,
        intersection.y - point.y
      );
      const miterLimit = Math.max(Math.abs(offsetMeters) * 6, 0.05);

      if (miterDistance <= miterLimit) {
        return intersection;
      }

      return {
        x:
          (previousEdge.shiftedPoint.x + currentEdge.shiftedPoint.x) / 2,
        y:
          (previousEdge.shiftedPoint.y + currentEdge.shiftedPoint.y) / 2
      };
    });
  };

  const closeLngLatRing = (points, projection, reverse = false) => {
    const ring = points.map(projection.unproject).map(point => [point[1], point[0]]);
    if (reverse) {
      ring.reverse();
    }
    ring.push([...ring[0]]);
    return ring;
  };

  const polygonFeature = (coordinates, properties = {}) => ({
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates
    }
  });

  const featureCollection = features => ({
    type: "FeatureCollection",
    features
  });

  const buildBandFeature = (
    points,
    projection,
    widthMeters,
    centerOffsetMeters,
    properties
  ) => {
    const outer = offsetRing(
      points,
      centerOffsetMeters - widthMeters / 2
    );
    const inner = offsetRing(
      points,
      centerOffsetMeters + widthMeters / 2
    );
    return polygonFeature(
      [
        closeLngLatRing(outer, projection),
        closeLngLatRing(inner, projection, true)
      ],
      properties
    );
  };

  const buildSquare = (center, sideMeters, projection, properties) => {
    const half = sideMeters / 2;
    const points = [
      { x: center.x - half, y: center.y - half },
      { x: center.x + half, y: center.y - half },
      { x: center.x + half, y: center.y + half },
      { x: center.x - half, y: center.y + half }
    ];
    return polygonFeature(
      [closeLngLatRing(points, projection)],
      properties
    );
  };

  const rectangleAtSegment = (
    start,
    end,
    fraction,
    alongWidth,
    depth,
    outwardOffset,
    projection,
    properties
  ) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    const tangent = { x: dx / length, y: dy / length };
    const outward = { x: tangent.y, y: -tangent.x };
    const center = {
      x: start.x + dx * fraction + outward.x * outwardOffset,
      y: start.y + dy * fraction + outward.y * outwardOffset
    };
    const halfAlong = alongWidth / 2;
    const halfDepth = depth / 2;
    const points = [
      {
        x: center.x - tangent.x * halfAlong - outward.x * halfDepth,
        y: center.y - tangent.y * halfAlong - outward.y * halfDepth
      },
      {
        x: center.x + tangent.x * halfAlong - outward.x * halfDepth,
        y: center.y + tangent.y * halfAlong - outward.y * halfDepth
      },
      {
        x: center.x + tangent.x * halfAlong + outward.x * halfDepth,
        y: center.y + tangent.y * halfAlong + outward.y * halfDepth
      },
      {
        x: center.x - tangent.x * halfAlong + outward.x * halfDepth,
        y: center.y - tangent.y * halfAlong + outward.y * halfDepth
      }
    ];
    return polygonFeature([closeLngLatRing(points, projection)], properties);
  };

  const distanceMeters = (pointA, pointB) => {
    const latitude1 = radians(pointA[0]);
    const latitude2 = radians(pointB[0]);
    const latitudeDelta = latitude2 - latitude1;
    const longitudeDelta = radians(pointB[1] - pointA[1]);
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(latitude1) *
        Math.cos(latitude2) *
        Math.sin(longitudeDelta / 2) ** 2;
    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
  };

  const buildDefensiveDetails = (points, projection, config) => {
    const openings = [];
    const surfaceMarks = [];
    const patterns = [
      [0.14, 0.38, 0.71, 0.88],
      [0.24, 0.62],
      [0.18, 0.49, 0.79],
      [0.42],
      [0.35],
      [0.55],
      [0.46],
      [0.28, 0.68]
    ];

    points.forEach((start, index) => {
      const end = points[(index + 1) % points.length];
      const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
      const fractions = segmentLength < 100 ? [] : patterns[index % patterns.length];

      fractions.forEach((fraction, detailIndex) => {
        const isObservation = (index + detailIndex) % 3 === 0;
        openings.push(
          rectangleAtSegment(
            start,
            end,
            fraction,
            isObservation ? 1.35 : 0.9,
            0.18,
            config.wallThicknessMeters / 2 - 0.05,
            projection,
            {
              kind: isObservation ? "observation" : "fire-port",
              base: isObservation ? 3.65 : 3.8,
              height: isObservation ? 4.25 : 4.18
            }
          )
        );
      });

      if (segmentLength > 160) {
        [0.31, 0.57, 0.83].forEach((fraction, markIndex) => {
          surfaceMarks.push(
            rectangleAtSegment(
              start,
              end,
              fraction,
              markIndex === 1 ? 2.4 : 0.1,
              0.08,
              config.wallThicknessMeters / 2 - 0.015,
              projection,
              {
                kind: markIndex === 1 ? "stain" : "joint",
                base: markIndex === 1 ? 0.08 : 0.25,
                height: markIndex === 1 ? 1.25 : 6.1
              }
            )
          );
        });
      }
    });

    return {
      openings: featureCollection(openings),
      surfaceMarks: featureCollection(surfaceMarks)
    };
  };

  const buildWallGeometry = (footprint, config) => {
    assertFootprint(footprint);
    const projection = createLocalProjection(footprint);
    const projected = footprint.map(projection.project);
    assertSimplePolygon(projected);
    const points = normalizeCounterClockwise(projected);
    const halfThickness = config.wallThicknessMeters / 2;
    const guardWidth = Math.max(
      0.18,
      (config.wallThicknessMeters - config.topWalkwayWidthMeters) / 2
    );
    const outerGuardCenter = -halfThickness + guardWidth / 2;
    const innerGuardCenter = halfThickness - guardWidth / 2;
    const wallTop = config.wallHeightMeters;
    const guardTop = wallTop + config.topGuardHeightMeters;

    const cornerBodies = points.map(point =>
      buildSquare(point, config.cornerPlatformWidthMeters, projection, {
        base: 0,
        height: wallTop
      })
    );
    const cornerCaps = points.map(point =>
      buildSquare(point, config.cornerPlatformWidthMeters - 0.35, projection, {
        base: wallTop,
        height: wallTop + 0.08
      })
    );
    const details = buildDefensiveDetails(points, projection, config);
    const segmentLengths = footprint.map((point, index) =>
      distanceMeters(point, footprint[(index + 1) % footprint.length])
    );

    return {
      foundation: featureCollection([
        buildBandFeature(
          points,
          projection,
          config.foundationWidthMeters,
          0,
          { base: 0, height: config.foundationHeightMeters }
        )
      ]),
      body: featureCollection([
        buildBandFeature(
          points,
          projection,
          config.wallThicknessMeters,
          0,
          { base: 0, height: wallTop }
        )
      ]),
      walkway: featureCollection([
        buildBandFeature(
          points,
          projection,
          config.topWalkwayWidthMeters,
          0,
          { base: wallTop, height: wallTop + 0.08 }
        )
      ]),
      outerParapet: featureCollection([
        buildBandFeature(
          points,
          projection,
          guardWidth,
          outerGuardCenter,
          { base: wallTop, height: guardTop }
        )
      ]),
      innerGuard: featureCollection([
        buildBandFeature(
          points,
          projection,
          guardWidth,
          innerGuardCenter,
          { base: wallTop, height: guardTop }
        )
      ]),
      cornerBodies: featureCollection(cornerBodies),
      cornerCaps: featureCollection(cornerCaps),
      openings: details.openings,
      surfaceMarks: details.surfaceMarks,
      guide: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            ...footprint.map(point => [point[1], point[0]]),
            [footprint[0][1], footprint[0][0]]
          ]
        }
      },
      validation: Object.freeze({
        nodeCount: footprint.length,
        simple: true,
        segmentLengthsMeters: Object.freeze(segmentLengths),
        perimeterMeters: segmentLengths.reduce((sum, value) => sum + value, 0),
        wallThicknessMeters: config.wallThicknessMeters,
        wallHeightMeters: config.wallHeightMeters,
        walkwayWidthMeters: config.topWalkwayWidthMeters,
        guardHeightMeters: config.topGuardHeightMeters
      })
    };
  };

  window.ShelterWallGeometry = Object.freeze({
    buildWallGeometry,
    createLocalProjection,
    offsetRing,
    distanceMeters,
    cloneLatLngs
  });
})();
