// 围墙沿线环境工程配置。所有宽度单位均为真实地面米。
// edgeIndex 对应 wallFootprint 中节点到下一节点的边，start/end 为该边上的比例位置。
window.SHELTER_ENVIRONMENT_CONFIG = {
  foundationWidthMeters: 3.2,
  innerServiceRoadWidthMeters: 4.5,
  outerClearZoneWidthMeters: 8,
  vegetationTransitionWidthMeters: 3,
  drainageWidthMeters: 0.35,
  wallToRoadGapMeters: 0.65,
  geometrySampleMeters: 18,
  irregularityMeters: 0.65,

  materials: {
    reconstruction: "#746f61",
    compactedEarth: "#786d59",
    paleEarth: "#8a7c62",
    gravel: "#85847b",
    coarseGravel: "#74766f",
    foundation: "#777b77",
    foundationEdge: "#555b59",
    serviceRoad: "#898a82",
    serviceRoadWear: "#6f716c",
    drainage: "#4f5554",
    forestTransition: "#5e654f",
    grassTransition: "#73775a",
    lakesideTransition: "#686c5c",
    urbanTransition: "#77746a",
    riprap: "#686c69",
    shoreConcrete: "#787d79",
    waterFoundation: "#626968",
    gateApron: "#7b7d79",
    gateDoor: "#555d5e",
    bollard: "#4b5354",
    stump: "#61513d",
    contactShadow: "#343938"
  },

  detailZoom: {
    corridor: 14,
    foundation: 14,
    serviceRoad: 14.5,
    materialVariation: 15,
    shoreReinforcement: 15,
    gateStructures: 15.5,
    drainage: 16.25,
    stumpsAndBollards: 17.25
  },

  segmentTypeDefaults: {
    forest: {
      clearWidthMeters: 9.5,
      transitionWidthMeters: 3.5,
      serviceRoadWidthMeters: 4.5,
      surfaceMaterial: "compactedEarth",
      hasServiceRoad: true,
      hasDrainage: true,
      shoreReinforcement: false,
      steppedFoundation: false
    },
    grass: {
      clearWidthMeters: 7,
      transitionWidthMeters: 3,
      serviceRoadWidthMeters: 4.5,
      surfaceMaterial: "gravel",
      hasServiceRoad: true,
      hasDrainage: true,
      shoreReinforcement: false,
      steppedFoundation: false
    },
    lakeside: {
      clearWidthMeters: 5,
      transitionWidthMeters: 1.5,
      serviceRoadWidthMeters: 3.8,
      surfaceMaterial: "coarseGravel",
      hasServiceRoad: true,
      hasDrainage: true,
      shoreReinforcement: true,
      steppedFoundation: false
    },
    waterCrossing: {
      clearWidthMeters: 3,
      transitionWidthMeters: 0.8,
      serviceRoadWidthMeters: 0,
      surfaceMaterial: "waterFoundation",
      hasServiceRoad: false,
      hasDrainage: false,
      shoreReinforcement: true,
      steppedFoundation: false
    },
    roadGate: {
      clearWidthMeters: 12,
      transitionWidthMeters: 2,
      serviceRoadWidthMeters: 5.5,
      surfaceMaterial: "gateApron",
      hasServiceRoad: true,
      hasDrainage: true,
      shoreReinforcement: false,
      steppedFoundation: false
    },
    slope: {
      clearWidthMeters: 7.5,
      transitionWidthMeters: 2.5,
      serviceRoadWidthMeters: 4,
      surfaceMaterial: "coarseGravel",
      hasServiceRoad: true,
      hasDrainage: true,
      shoreReinforcement: false,
      steppedFoundation: true
    },
    urbanEdge: {
      clearWidthMeters: 6.5,
      transitionWidthMeters: 2,
      serviceRoadWidthMeters: 4.5,
      surfaceMaterial: "gravel",
      hasServiceRoad: true,
      hasDrainage: true,
      shoreReinforcement: false,
      steppedFoundation: false
    }
  },

  // 按标注图和卫星影像人工检查划分。自动识别只作参考，未假装为精确土地分类。
  environmentSegments: [
    { id: "north-forest", edgeIndex: 0, start: 0, end: 0.68, segmentType: "forest" },
    { id: "north-urban-transition", edgeIndex: 0, start: 0.68, end: 1, segmentType: "urbanEdge" },
    { id: "east-urban-edge", edgeIndex: 1, start: 0, end: 0.45, segmentType: "urbanEdge" },
    { id: "east-forest", edgeIndex: 1, start: 0.45, end: 1, segmentType: "forest" },
    { id: "southeast-forest", edgeIndex: 2, start: 0, end: 0.38, segmentType: "forest" },
    { id: "south-east-lakeside", edgeIndex: 2, start: 0.38, end: 0.72, segmentType: "lakeside" },
    { id: "south-west-lakeside", edgeIndex: 2, start: 0.72, end: 1, segmentType: "lakeside" },
    { id: "water-approach", edgeIndex: 3, start: 0, end: 0.52, segmentType: "waterCrossing" },
    { id: "south-shore", edgeIndex: 3, start: 0.52, end: 1, segmentType: "lakeside" },
    { id: "south-grass", edgeIndex: 4, start: 0, end: 1, segmentType: "grass" },
    { id: "southwest-slope", edgeIndex: 5, start: 0, end: 0.3, segmentType: "slope" },
    { id: "southwest-service-gate-zone", edgeIndex: 5, start: 0.3, end: 0.62, segmentType: "roadGate" },
    { id: "southwest-grass", edgeIndex: 5, start: 0.62, end: 1, segmentType: "grass" },
    { id: "west-grass", edgeIndex: 6, start: 0, end: 1, segmentType: "grass" },
    { id: "west-lower-forest", edgeIndex: 7, start: 0, end: 0.32, segmentType: "forest" },
    { id: "west-main-gate-zone", edgeIndex: 7, start: 0.32, end: 0.55, segmentType: "roadGate" },
    { id: "northwest-forest", edgeIndex: 7, start: 0.55, end: 1, segmentType: "forest" }
  ],

  gates: [
    {
      id: "main-vehicle-gate",
      edgeIndex: 7,
      fraction: 0.435,
      widthMeters: 6.8,
      depthMeters: 15,
      label: "西侧主车辆门"
    },
    {
      id: "south-maintenance-gate",
      edgeIndex: 5,
      fraction: 0.46,
      widthMeters: 4.8,
      depthMeters: 11,
      label: "南侧维护门"
    }
  ]
};
