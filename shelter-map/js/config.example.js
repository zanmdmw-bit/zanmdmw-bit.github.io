// 当前部署的 Esri World Imagery 公共瓦片端点不需要 API Key。
// 如果以后切换到需要密钥的正规地图服务，可复制本文件为 config.js，
// 填写真实密钥，并在 index.html 中于 map.js 之前加载 config.js。
// 不要把真实密钥提交到公开仓库。
window.SHELTER_MAP_CONFIG = {
  tileUrl:
    "https://YOUR_OFFICIAL_TILE_SERVICE.example.com/tiles/{z}/{y}/{x}",
  apiKey: "YOUR_MAP_API_KEY",
  apiKeyQueryParam: "key",

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

  // 必须按新服务的许可条款填写完整署名，不得留空或移除。
  attribution: "YOUR_REQUIRED_MAP_ATTRIBUTION"
};
