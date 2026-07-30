# 避难所 RP 地图网页

这是与仓库现有双陆世界网页完全隔离的独立页面。当前页面提供广州市天河公园及周边的全屏交互式卫星地图，以及按真实地理尺寸绘制的避难所围墙。

## 技术与数据源

- 地图库：Leaflet 1.9.4。
- 卫星底图：Esri World Imagery 栅格瓦片服务。
- 当前瓦片端点：`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`。
- API Key：当前公开瓦片端点不需要密钥。若服务访问政策变化，应改用 Esri 或其他正规供应商提供的带令牌端点，不能抓取地图网站页面或使用未获许可的私有接口。
- 署名：地图右下角固定显示 Leaflet、Esri 以及影像数据供应方署名。不得删除或遮挡。
- 原生瓦片缩放：页面限制为 14—19 级。达到 19 级后不再继续放大，也不承诺超过数据源实际原生分辨率后继续变清晰。

Esri World Imagery 服务说明：

- <https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9>
- <https://developers.arcgis.com/documentation/esri-and-data-attribution/interactive-maps/>

## 坐标与范围

- 地图输入坐标：WGS-84 经纬度。
- 地图显示投影：EPSG:3857（Web Mercator，由 Leaflet 和瓦片服务处理）。
- 天河公园要素中心：`23.1304739, 113.3618998`。
- 天河公园要素边界：西南 `23.1254324, 113.3568309`，东北 `23.1359017, 113.3668616`。
- 初始视野：根据上述公园边界自动适配屏幕，桌面端最高以 16 级进入，移动端会按屏幕宽高自动选择能完整看到公园的缩放等级。
- 最大拖动范围：西南 `23.075, 113.29`，东北 `23.19, 113.44`，覆盖天河公园外围较大的城市街区，但无法拖到其他城市或国家。

坐标通过 OpenStreetMap Nominatim 检索天河公园的 `leisure=park` 要素确认。高德、百度等中国地图常使用 GCJ-02 或 BD-09，不能把其坐标直接用于本页的 WGS-84 / Web Mercator 底图。

## 文件结构

```text
shelter-map/
├── index.html
├── css/
│   └── map.css
├── js/
│   ├── map.js
│   ├── wall.js
│   └── config.example.js
└── README.md
```

所有页面资源都使用相对路径，因此 GitHub Pages 在 `/shelter-map/` 子目录部署时不会指向站点根目录的同名文件。

## 运行时配置与密钥

当前部署会在 `map.js` 和 `wall.js` 之前加载 `config.example.js`，将其作为不含秘密的公开运行时配置。当前地图服务不需要密钥。

如果以后更换为需要 API Key 或 Access Token 的正规服务，只能使用供应商支持的浏览器端受限密钥，并将允许来源限制为本网站域名。不能向公开仓库提交可访问其他付费或私有能力的通用密钥。

`map.js` 会读取 `window.SHELTER_MAP_CONFIG` 并覆盖默认配置；占位值 `YOUR_MAP_API_KEY` 与 `YOUR_ACCESS_TOKEN` 不会被当作真实密钥发送。

## 300 米正方形围墙

围墙配置集中在 `js/config.example.js`：

```js
wallCenter: [23.1304739, 113.3618998],
wallSideMeters: 300,
wallBearing: 0
```

- `wallCenter`：围墙中心的 WGS-84 `[纬度, 经度]`。
- `wallSideMeters`：每条边的真实地理长度，单位为米。
- `wallBearing`：整体顺时针旋转角；`0` 表示四边分别朝正北、正东、正南、正西。
- `wallStyle`：边线、线宽、不透明度和填充样式。

`wall.js` 使用半对角线 `边长 / √2`，从中心沿西北、东北、东南、西南四个方位执行球面正向测地线计算，生成四个 WGS-84 角点。随后使用 Haversine 公式反算四边、两条对角线，并用相邻边初始方位角校验四个内角。校验结果只输出到浏览器控制台，不在地图界面显示。

围墙通过 Leaflet `L.polygon` 和 SVG 矢量渲染，绑定真实经纬度。地图缩放和拖动只会重新投影矢量，不会把固定像素图片拉伸。

`window.ShelterMapWall.update({ wallCenter, wallSideMeters, wallBearing, wallStyle })` 可在运行时更新围墙；以后只修改配置中的中心、边长或角度即可，不需要重写角点逻辑。

## 后续扩展

`window.ShelterMap` 暴露当前 Leaflet `map`、卫星 `imageryLayer` 和只读配置；`window.ShelterMapWall` 暴露围墙图层、配置、角点、校验结果和更新方法。后续阶段可在独立脚本中按用途创建 Leaflet `LayerGroup` 或 `FeatureGroup`，分别承载建筑轮廓、搜索区域、人物、物资点、势力、危险区、时间和事件图层，无需改动卫星底图初始化逻辑。
