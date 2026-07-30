(() => {
  "use strict";

  const EPSILON = 1e-7;
  const wallGeometry = window.ShelterWallGeometry;

  if (!wallGeometry) {
    throw new Error("环境几何初始化失败：wall-geometry.js 未加载");
  }

  const featureCollection = features => ({
    type: "FeatureCollection",
    features
  });

  const polygonFeature = (points, projection, properties = {}) => {
    const ring = points.map(projection.unproject).map(([lat, lng]) => [lng, lat]);
    ring.push([...ring[0]]);
    return {
      type: "Feature",
      properties,
      geometry: { type: "Polygon", coordinates: [ring] }
    };
  };

  const lineFeature = (points, projection, properties = {}) => ({
    type: "Feature",
    properties,
    geometry: {
      type: "LineString",
      coordinates: points.map(projection.unproject).map(([lat, lng]) => [lng, lat])
    }
  });

  const signedArea = points =>
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2;

  const clamp = (value, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, value));

  const hashText = text => {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
  };

  const cloneSegments = segments =>
    segments.map(segment => ({ ...segment }));

  const mergeSegment = (segment, config) => {
    const defaults = config.segmentTypeDefaults[segment.segmentType];
    if (!defaults) {
      throw new Error(`未知环境类型：${segment.segmentType}`);
    }
    return {
      ...defaults,
      ...segment,
      start: clamp(Number(segment.start), 0, 1),
      end: clamp(Number(segment.end), 0, 1)
    };
  };

  const createContext = (footprint, config, segments) => {
    const projection = wallGeometry.createLocalProjection(footprint);
    const points = footprint.map(projection.project);
    const area = signedArea(points);
    const inwardSign = area >= 0 ? 1 : -1;
    const resolvedSegments = cloneSegments(segments)
      .map(segment => mergeSegment(segment, config))
      .filter(
        segment =>
          Number.isInteger(segment.edgeIndex) &&
          segment.edgeIndex >= 0 &&
          segment.edgeIndex < points.length &&
          segment.end - segment.start > EPSILON
      );

    const coveredEdges = new Set(resolvedSegments.map(segment => segment.edgeIndex));
    points.forEach((point, edgeIndex) => {
      if (!coveredEdges.has(edgeIndex)) {
        resolvedSegments.push(
          mergeSegment(
            {
              id: `fallback-edge-${edgeIndex}`,
              edgeIndex,
              start: 0,
              end: 1,
              segmentType: "grass"
            },
            config
          )
        );
      }
    });

    return { projection, points, inwardSign, segments: resolvedSegments };
  };

  const edgeFrame = (context, edgeIndex) => {
    const start = context.points[edgeIndex];
    const end = context.points[(edgeIndex + 1) % context.points.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < EPSILON) {
      throw new Error(`围墙第 ${edgeIndex + 1} 段长度为零`);
    }
    const tangent = { x: dx / length, y: dy / length };
    const left = { x: -tangent.y, y: tangent.x };
    const inward = {
      x: left.x * context.inwardSign,
      y: left.y * context.inwardSign
    };
    return { start, end, length, tangent, inward };
  };

  const pointAlong = (frame, fraction, offsetMeters = 0) => ({
    x:
      frame.start.x +
      frame.tangent.x * frame.length * fraction +
      frame.inward.x * offsetMeters,
    y:
      frame.start.y +
      frame.tangent.y * frame.length * fraction +
      frame.inward.y * offsetMeters
  });

  const wave = (seed, index, amount) =>
    amount *
    (0.58 * Math.sin(seed * 0.013 + index * 1.73) +
      0.42 * Math.sin(seed * 0.021 + index * 3.11));

  const sampledLine = (
    context,
    segment,
    offsetMeters,
    irregularityMeters = 0,
    sampleMeters = 18
  ) => {
    const frame = edgeFrame(context, segment.edgeIndex);
    const segmentLength = frame.length * (segment.end - segment.start);
    const count = Math.max(2, Math.ceil(segmentLength / sampleMeters));
    const seed = hashText(`${segment.id}:${offsetMeters}`);
    const points = [];

    for (let index = 0; index <= count; index += 1) {
      const localFraction = index / count;
      const fraction =
        segment.start + (segment.end - segment.start) * localFraction;
      const endpointScale = Math.sin(Math.PI * localFraction);
      const irregularOffset =
        wave(seed, index, irregularityMeters) * endpointScale;
      points.push(pointAlong(frame, fraction, offsetMeters + irregularOffset));
    }
    return points;
  };

  const stripFeature = (
    context,
    segment,
    outsideOffset,
    insideOffset,
    properties,
    options = {}
  ) => {
    const irregularity = options.irregularityMeters || 0;
    const sampleMeters =
      options.sampleMeters || options.geometrySampleMeters || 18;
    const outer = sampledLine(
      context,
      segment,
      outsideOffset,
      irregularity,
      sampleMeters
    );
    const inner = sampledLine(
      context,
      segment,
      insideOffset,
      irregularity * 0.55,
      sampleMeters
    ).reverse();
    return polygonFeature([...outer, ...inner], context.projection, properties);
  };

  const rectangleFeature = (
    context,
    edgeIndex,
    fraction,
    alongWidth,
    outsideOffset,
    insideOffset,
    properties
  ) => {
    const frame = edgeFrame(context, edgeIndex);
    const halfFraction = alongWidth / frame.length / 2;
    const startFraction = clamp(fraction - halfFraction, 0, 1);
    const endFraction = clamp(fraction + halfFraction, 0, 1);
    const points = [
      pointAlong(frame, startFraction, outsideOffset),
      pointAlong(frame, endFraction, outsideOffset),
      pointAlong(frame, endFraction, insideOffset),
      pointAlong(frame, startFraction, insideOffset)
    ];
    return polygonFeature(points, context.projection, properties);
  };

  const squareFeature = (context, center, sideMeters, properties) => {
    const half = sideMeters / 2;
    return polygonFeature(
      [
        { x: center.x - half, y: center.y - half },
        { x: center.x + half, y: center.y - half },
        { x: center.x + half, y: center.y + half },
        { x: center.x - half, y: center.y + half }
      ],
      context.projection,
      properties
    );
  };

  const irregularCircleFeature = (
    context,
    center,
    radiusMeters,
    seed,
    properties
  ) => {
    const points = [];
    const count = 12;
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count;
      const radius =
        radiusMeters +
        wave(seed, index, Math.min(0.9, radiusMeters * 0.055));
      points.push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius
      });
    }
    return polygonFeature(points, context.projection, properties);
  };

  const buildSegmentSurfaces = (context, segment, config, output) => {
    const foundationHalf = config.foundationWidthMeters / 2;
    const clearWidth = segment.clearWidthMeters;
    const transitionWidth = segment.transitionWidthMeters;
    const roadWidth = segment.hasServiceRoad
      ? segment.serviceRoadWidthMeters
      : 0;
    const roadStart = foundationHalf + config.wallToRoadGapMeters;
    const roadEnd = roadStart + roadWidth;
    const outerClearEdge = -(foundationHalf + clearWidth);
    const outerTransitionEdge = outerClearEdge - transitionWidth;
    const innerWorkingEdge =
      roadEnd + (segment.hasDrainage ? config.drainageWidthMeters + 0.35 : 0);
    const innerTransitionEdge = innerWorkingEdge + transitionWidth;
    const irregularity =
      segment.segmentType === "waterCrossing"
        ? 0.12
        : config.irregularityMeters;
    const common = {
      segmentId: segment.id,
      segmentType: segment.segmentType
    };

    output.reconstruction.push(
      stripFeature(
        context,
        segment,
        outerTransitionEdge,
        innerTransitionEdge,
        { ...common, material: "reconstruction" },
        {
          irregularityMeters: irregularity,
          sampleMeters: config.geometrySampleMeters
        }
      )
    );

    output.transitions.push(
      stripFeature(
        context,
        segment,
        outerTransitionEdge,
        outerClearEdge,
        {
          ...common,
          material:
            segment.segmentType === "forest"
              ? "forestTransition"
              : segment.segmentType === "lakeside" ||
                  segment.segmentType === "waterCrossing"
                ? "lakesideTransition"
                : segment.segmentType === "urbanEdge"
                  ? "urbanTransition"
                  : "grassTransition"
        },
        {
          irregularityMeters: irregularity,
          sampleMeters: config.geometrySampleMeters
        }
      )
    );

    output.clearZones.push(
      stripFeature(
        context,
        segment,
        outerClearEdge,
        -foundationHalf,
        { ...common, material: segment.surfaceMaterial },
        {
          irregularityMeters: irregularity * 0.6,
          sampleMeters: config.geometrySampleMeters
        }
      )
    );

    output.foundations.push(
      stripFeature(
        context,
        segment,
        -foundationHalf,
        foundationHalf,
        {
          ...common,
          material:
            segment.segmentType === "waterCrossing"
              ? "waterFoundation"
              : "foundation",
          base: 0,
          height:
            segment.segmentType === "waterCrossing" ||
            segment.shoreReinforcement
              ? 0.46
              : 0.3
        }
      )
    );

    output.contactShadows.push(
      stripFeature(
        context,
        segment,
        -(foundationHalf + 0.48),
        -(foundationHalf - 0.05),
        { ...common, material: "contactShadow" }
      ),
      stripFeature(
        context,
        segment,
        foundationHalf - 0.05,
        foundationHalf + 0.38,
        { ...common, material: "contactShadow" }
      )
    );

    if (segment.hasServiceRoad && roadWidth > 0) {
      output.serviceRoads.push(
        stripFeature(
          context,
          segment,
          roadStart,
          roadEnd,
          { ...common, material: "serviceRoad" },
          {
            irregularityMeters: Math.min(irregularity * 0.32, 0.22),
            sampleMeters: config.geometrySampleMeters
          }
        )
      );
      output.innerTransitions.push(
        stripFeature(
          context,
          segment,
          roadEnd,
          roadEnd + transitionWidth,
          {
            ...common,
            material:
              segment.segmentType === "forest"
                ? "forestTransition"
                : "grassTransition"
          },
          {
            irregularityMeters: irregularity * 0.45,
            sampleMeters: config.geometrySampleMeters
          }
        )
      );
    }

    if (segment.hasDrainage) {
      const drainStart = foundationHalf + 0.12;
      output.drainage.push(
        stripFeature(
          context,
          segment,
          drainStart,
          drainStart + config.drainageWidthMeters,
          { ...common, material: "drainage", base: 0.03, height: 0.11 }
        )
      );
    }

    if (segment.shoreReinforcement) {
      output.shore.push(
        stripFeature(
          context,
          segment,
          -(foundationHalf + Math.max(3.2, clearWidth * 0.72)),
          -foundationHalf,
          {
            ...common,
            material:
              segment.segmentType === "waterCrossing"
                ? "waterFoundation"
                : "riprap",
            base: 0,
            height: segment.segmentType === "waterCrossing" ? 0.5 : 0.24
          },
          {
            irregularityMeters:
              segment.segmentType === "waterCrossing" ? 0.08 : 0.35,
            sampleMeters: 12
          }
        )
      );
    }

    if (segment.steppedFoundation) {
      const frame = edgeFrame(context, segment.edgeIndex);
      const segmentLength = frame.length * (segment.end - segment.start);
      const stepCount = Math.max(2, Math.floor(segmentLength / 16));
      for (let index = 0; index < stepCount; index += 1) {
        const localStart = index / stepCount;
        const localEnd = Math.min(1, localStart + 0.42 / stepCount);
        const start =
          segment.start + (segment.end - segment.start) * localStart;
        const end =
          segment.start + (segment.end - segment.start) * localEnd;
        output.slopeSteps.push(
          stripFeature(
            context,
            { ...segment, start, end },
            -(foundationHalf + 2.4),
            foundationHalf + 1.4,
            {
              ...common,
              material: "coarseGravel",
              base: 0,
              height: 0.12 + (index % 2) * 0.08
            }
          )
        );
      }
    }

    const patchCount = Math.max(
      1,
      Math.floor(
        edgeFrame(context, segment.edgeIndex).length *
          (segment.end - segment.start) /
          62
      )
    );
    for (let index = 0; index < patchCount; index += 1) {
      const localCenter = (index + 0.54) / patchCount;
      const half = Math.min(0.075, 0.28 / patchCount);
      const patch = {
        ...segment,
        start:
          segment.start +
          (segment.end - segment.start) * clamp(localCenter - half, 0, 1),
        end:
          segment.start +
          (segment.end - segment.start) * clamp(localCenter + half, 0, 1)
      };
      output.variation.push(
        stripFeature(
          context,
          patch,
          outerClearEdge + clearWidth * 0.18,
          -foundationHalf - clearWidth * 0.16,
          {
            ...common,
            material: index % 2 === 0 ? "paleEarth" : "compactedEarth"
          },
          { irregularityMeters: 0.35, sampleMeters: 8 }
        )
      );
      if (segment.hasServiceRoad && roadWidth > 1) {
        output.roadWear.push(
          stripFeature(
            context,
            patch,
            roadStart + roadWidth * 0.38,
            roadStart + roadWidth * 0.58,
            { ...common, material: "serviceRoadWear" },
            { irregularityMeters: 0.12, sampleMeters: 8 }
          )
        );
      }
    }

    output.guides.push(
      lineFeature(
        sampledLine(context, segment, 0, 0, config.geometrySampleMeters),
        context.projection,
        { ...common, guide: "centerline" }
      ),
      lineFeature(
        sampledLine(
          context,
          segment,
          -foundationHalf,
          0,
          config.geometrySampleMeters
        ),
        context.projection,
        { ...common, guide: "foundation-outside" }
      ),
      lineFeature(
        sampledLine(
          context,
          segment,
          outerClearEdge,
          irregularity * 0.6,
          config.geometrySampleMeters
        ),
        context.projection,
        { ...common, guide: "clear-edge" }
      ),
      lineFeature(
        sampledLine(
          context,
          segment,
          outerTransitionEdge,
          irregularity,
          config.geometrySampleMeters
        ),
        context.projection,
        { ...common, guide: "transition-edge" }
      )
    );
    if (segment.hasServiceRoad && roadWidth > 0) {
      output.guides.push(
        lineFeature(
          sampledLine(
            context,
            segment,
            roadEnd,
            0.12,
            config.geometrySampleMeters
          ),
          context.projection,
          { ...common, guide: "service-road-edge" }
        )
      );
    }
  };

  const buildCornerPads = (context, config, output) => {
    context.points.forEach((point, index) => {
      const adjacentSegments = context.segments.filter(
        segment =>
          segment.edgeIndex === index ||
          (segment.edgeIndex + 1) % context.points.length === index
      );
      const clearanceRadius =
        config.foundationWidthMeters / 2 +
        Math.max(
          config.outerClearZoneWidthMeters + config.vegetationTransitionWidthMeters,
          ...adjacentSegments.map(
            segment =>
              segment.clearWidthMeters + segment.transitionWidthMeters
          )
        );
      output.cornerClearance.push(
        irregularCircleFeature(
          context,
          point,
          clearanceRadius,
          hashText(`corner:${index}`),
          {
            kind: "corner-clearance",
            material: index % 2 === 0 ? "compactedEarth" : "paleEarth"
          }
        )
      );
      const side =
        config.foundationWidthMeters +
        (index === 3 || index === 4 || index === 5 ? 5.6 : 3.4);
      output.cornerPads.push(
        squareFeature(context, point, side, {
          kind: "corner-pad",
          material: "foundation",
          base: 0,
          height: 0.26
        })
      );
    });
  };

  const buildForestDetails = (context, segment, config, output) => {
    if (segment.segmentType !== "forest") {
      return;
    }
    const frame = edgeFrame(context, segment.edgeIndex);
    const length = frame.length * (segment.end - segment.start);
    const count = Math.min(6, Math.max(1, Math.floor(length / 58)));
    for (let index = 0; index < count; index += 1) {
      const local = (index + 0.42 + (index % 2) * 0.12) / count;
      const fraction =
        segment.start + (segment.end - segment.start) * clamp(local, 0.08, 0.92);
      const offset =
        -(
          config.foundationWidthMeters / 2 +
          segment.clearWidthMeters +
          segment.transitionWidthMeters * (0.42 + (index % 3) * 0.12)
        );
      output.stumps.push(
        squareFeature(
          context,
          pointAlong(frame, fraction, offset),
          0.52 + (index % 2) * 0.14,
          { kind: "stump", material: "stump", base: 0, height: 0.16 }
        )
      );
    }
  };

  const buildWaterDetails = (context, segment, config, output) => {
    if (segment.segmentType !== "waterCrossing") {
      return;
    }
    const foundationHalf = config.foundationWidthMeters / 2;
    [0.23, 0.52, 0.79].forEach((local, index) => {
      const fraction =
        segment.start + (segment.end - segment.start) * local;
      output.culverts.push(
        rectangleFeature(
          context,
          segment.edgeIndex,
          fraction,
          2.2,
          -(foundationHalf + 3.4),
          foundationHalf + 1.1,
          {
            kind: "culvert",
            material: index === 1 ? "drainage" : "shoreConcrete",
            base: index === 1 ? 0.05 : 0,
            height: index === 1 ? 0.18 : 0.32
          }
        )
      );
    });
  };

  const buildGates = (context, config, output) => {
    config.gates.forEach((gate, gateIndex) => {
      const frame = edgeFrame(context, gate.edgeIndex);
      const center = pointAlong(frame, gate.fraction, 0);
      const foundationHalf = config.foundationWidthMeters / 2;

      output.gateAprons.push(
        rectangleFeature(
          context,
          gate.edgeIndex,
          gate.fraction,
          gate.widthMeters + 9,
          -gate.depthMeters / 2,
          gate.depthMeters / 2,
          {
            gateId: gate.id,
            gateLabel: gate.label,
            material: "gateApron",
            base: 0,
            height: 0.2
          }
        )
      );
      output.gateDoors.push(
        rectangleFeature(
          context,
          gate.edgeIndex,
          gate.fraction,
          gate.widthMeters,
          -(window.SHELTER_MAP_CONFIG.wallThicknessMeters / 2 + 0.22),
          -(window.SHELTER_MAP_CONFIG.wallThicknessMeters / 2 - 0.04),
          {
            gateId: gate.id,
            gateLabel: gate.label,
            material: "gateDoor",
            base: 0.28,
            height: 5.55
          }
        )
      );

      [-1, 1].forEach(side => {
        const along =
          side * (gate.widthMeters / 2 + 1.1) / frame.length;
        [-3.2, 3.2].forEach((offset, bollardIndex) => {
          const bollardCenter = pointAlong(
            frame,
            gate.fraction + along,
            offset
          );
          output.bollards.push(
            squareFeature(context, bollardCenter, 0.32, {
              gateId: gate.id,
              kind: "bollard",
              material: "bollard",
              base: 0.2,
              height: 1.1 + bollardIndex * 0.12
            })
          );
        });
      });

      output.gateLabels.push({
        type: "Feature",
        properties: {
          gateId: gate.id,
          label: gate.label,
          gateIndex
        },
        geometry: {
          type: "Point",
          coordinates: (() => {
            const [lat, lng] = context.projection.unproject(center);
            return [lng, lat];
          })()
        }
      });
    });
  };

  const buildEnvironmentGeometry = (
    footprint,
    wallConfig,
    environmentConfig,
    segments = environmentConfig.environmentSegments
  ) => {
    const config = {
      ...environmentConfig,
      wallThicknessMeters: wallConfig.wallThicknessMeters
    };
    const context = createContext(footprint, config, segments);
    const output = {
      reconstruction: [],
      transitions: [],
      innerTransitions: [],
      clearZones: [],
      foundations: [],
      serviceRoads: [],
      roadWear: [],
      drainage: [],
      contactShadows: [],
      variation: [],
      shore: [],
      slopeSteps: [],
      cornerPads: [],
      cornerClearance: [],
      stumps: [],
      culverts: [],
      gateAprons: [],
      gateDoors: [],
      bollards: [],
      gateLabels: [],
      guides: []
    };

    context.segments.forEach(segment => {
      buildSegmentSurfaces(context, segment, config, output);
      buildForestDetails(context, segment, config, output);
      buildWaterDetails(context, segment, config, output);
    });
    buildCornerPads(context, config, output);
    buildGates(context, config, output);

    const segmentLengths = context.segments.map(segment => {
      const frame = edgeFrame(context, segment.edgeIndex);
      return {
        id: segment.id,
        segmentType: segment.segmentType,
        lengthMeters: frame.length * (segment.end - segment.start)
      };
    });

    return {
      reconstruction: featureCollection(output.reconstruction),
      transitions: featureCollection(output.transitions),
      innerTransitions: featureCollection(output.innerTransitions),
      clearZones: featureCollection(output.clearZones),
      foundations: featureCollection(output.foundations),
      serviceRoads: featureCollection(output.serviceRoads),
      roadWear: featureCollection(output.roadWear),
      drainage: featureCollection(output.drainage),
      contactShadows: featureCollection(output.contactShadows),
      variation: featureCollection(output.variation),
      shore: featureCollection(output.shore),
      slopeSteps: featureCollection(output.slopeSteps),
      cornerPads: featureCollection(output.cornerPads),
      cornerClearance: featureCollection(output.cornerClearance),
      stumps: featureCollection(output.stumps),
      culverts: featureCollection(output.culverts),
      gateAprons: featureCollection(output.gateAprons),
      gateDoors: featureCollection(output.gateDoors),
      bollards: featureCollection(output.bollards),
      gateLabels: featureCollection(output.gateLabels),
      guides: featureCollection(output.guides),
      segments: cloneSegments(context.segments),
      validation: Object.freeze({
        segmentCount: context.segments.length,
        segmentLengths: Object.freeze(segmentLengths),
        foundationWidthMeters: config.foundationWidthMeters,
        defaultInnerServiceRoadWidthMeters: config.innerServiceRoadWidthMeters,
        defaultOuterClearZoneWidthMeters: config.outerClearZoneWidthMeters,
        vegetationTransitionWidthMeters: config.vegetationTransitionWidthMeters,
        gateCount: config.gates.length,
        coordinateSystem: "WGS-84 / local metre projection / Web Mercator display"
      })
    };
  };

  window.ShelterEnvironmentGeometry = Object.freeze({
    buildEnvironmentGeometry,
    cloneSegments
  });
})();
