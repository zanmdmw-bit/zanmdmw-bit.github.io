// 当前文件直接作为公开的运行时配置加载。
// 当前 Esri World Imagery 公共瓦片端点不需要 API Key。
// 如果以后改用需要密钥的服务，不要把具备私有或付费权限的密钥提交到公开仓库。
window.SHELTER_MAP_CONFIG = {
  tileUrl:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  apiKey: "",
  apiKeyQueryParam: "token",
  attribution:
    'Powered by <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a> | Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community',

  // 以下坐标均为 WGS-84，经 Leaflet 投影为 Web Mercator 显示。
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

  // 围墙配置：只需修改这三项即可调整中心、真实边长和顺时针旋转角。
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
