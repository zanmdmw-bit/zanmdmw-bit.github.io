// 本文件是公开的运行时配置，不含密钥。
// 坐标使用 WGS-84 [纬度, 经度]；GeoJSON 转换在 wall-geometry.js 内完成。
window.SHELTER_MAP_CONFIG = {
  tileUrl:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  apiKey: "",
  apiKeyQueryParam: "token",
  attribution:
    '<a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">MapLibre</a> | Powered by <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a> | Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community',

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

  // 根据标注图亮红粗框校准得到的正式围墙中心路径。
  // 顺序为：西北、东北、东南、凸出部东北、凸出部东南、
  // 凸出部西南、凸出部西北、主区域西南。
  wallFootprint: [
    [23.1323089, 113.3582165],
    [23.1323089, 113.3649835],
    [23.1287381, 113.3649835],
    [23.1287381, 113.3607434],
    [23.1274883, 113.3607434],
    [23.1274883, 113.3589660],
    [23.1287381, 113.3589660],
    [23.1287381, 113.3582165]
  ],

  wallThicknessMeters: 1.8,
  wallHeightMeters: 6.5,
  topWalkwayWidthMeters: 1.2,
  topGuardHeightMeters: 1.1,
  foundationWidthMeters: 3.2,
  foundationHeightMeters: 0.35,
  cornerPlatformWidthMeters: 4.2,

  wallMaterial: {
    foundationColor: "#666b68",
    bodyColor: "#adb1ad",
    walkwayColor: "#c8cac4",
    outerParapetColor: "#9ca19d",
    innerGuardColor: "#6f7674",
    openingColor: "#202627",
    jointColor: "#747b78",
    stainColor: "#69756a"
  },

  detailZoom: {
    overall: 14,
    walkway: 15.5,
    platforms: 16,
    guards: 16.5,
    openings: 17.25,
    surfaceMarks: 18
  }
};
