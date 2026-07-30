(() => {
  "use strict";

  const editEnabled =
    new URLSearchParams(window.location.search).get("editWall") === "1";

  if (!editEnabled) {
    return;
  }

  const map = window.ShelterMap?.map;
  const renderer = window.ShelterWallRenderer;
  const geometryRuntime = window.ShelterWallGeometry;

  if (!map || !renderer || !geometryRuntime) {
    throw new Error("围墙编辑模式初始化失败：所需模块缺失");
  }

  let footprint = renderer.footprint;
  let markers = [];
  let selectedIndex = null;

  const panel = document.createElement("section");
  panel.className = "wall-editor-panel";
  panel.setAttribute("aria-label", "围墙节点编辑工具");
  panel.innerHTML = `
    <h2 class="wall-editor-title">围墙路径编辑</h2>
    <div class="wall-editor-actions">
      <button type="button" data-action="add">增加节点</button>
      <button type="button" data-action="delete" disabled>删除所选</button>
      <button type="button" data-action="coordinates">导出坐标</button>
      <button type="button" data-action="geojson">导出 GeoJSON</button>
    </div>
    <textarea class="wall-editor-output" readonly aria-label="导出结果"></textarea>
    <div class="wall-editor-status" role="status" aria-live="polite"></div>
  `;
  document.body.append(panel);

  const output = panel.querySelector(".wall-editor-output");
  const status = panel.querySelector(".wall-editor-status");
  const deleteButton = panel.querySelector('[data-action="delete"]');

  const setStatus = message => {
    status.textContent = message;
  };

  const updateGuide = () => {
    const source = map.getSource("wall-editor-guide");
    const coordinates = footprint.map(point => [point[1], point[0]]);
    coordinates.push([...coordinates[0]]);
    source?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates }
    });
  };

  const applyFootprint = () => {
    renderer.setFootprint(footprint);
    updateGuide();
    setStatus(`当前 ${footprint.length} 个节点；拖动节点可实时调整。`);
  };

  const selectNode = index => {
    selectedIndex = index;
    markers.forEach((marker, markerIndex) => {
      marker
        .getElement()
        .classList.toggle("is-selected", markerIndex === selectedIndex);
    });
    deleteButton.disabled = selectedIndex === null || footprint.length <= 4;
    setStatus(`已选择节点 ${index + 1}。`);
  };

  const rebuildMarkers = () => {
    markers.forEach(marker => marker.remove());
    markers = footprint.map((point, index) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "wall-node";
      element.title = `围墙节点 ${index + 1}`;
      element.setAttribute("aria-label", `围墙节点 ${index + 1}`);
      element.addEventListener("click", event => {
        event.stopPropagation();
        selectNode(index);
      });

      const marker = new maplibregl.Marker({
        element,
        draggable: true,
        anchor: "center"
      })
        .setLngLat([point[1], point[0]])
        .addTo(map);

      marker.on("drag", () => {
        const position = marker.getLngLat();
        footprint[index] = [position.lat, position.lng];
        try {
          applyFootprint();
        } catch (error) {
          setStatus(error.message);
        }
      });

      marker.on("dragend", () => {
        const position = marker.getLngLat();
        footprint[index] = [position.lat, position.lng];
        applyFootprint();
        selectNode(index);
      });

      return marker;
    });

    if (selectedIndex !== null && selectedIndex < footprint.length) {
      selectNode(selectedIndex);
    }
  };

  const longestSegmentIndex = () => {
    let longestIndex = 0;
    let longestDistance = -Infinity;
    footprint.forEach((point, index) => {
      const next = footprint[(index + 1) % footprint.length];
      const distance = geometryRuntime.distanceMeters(point, next);
      if (distance > longestDistance) {
        longestDistance = distance;
        longestIndex = index;
      }
    });
    return longestIndex;
  };

  const addNode = () => {
    const index = longestSegmentIndex();
    const start = footprint[index];
    const end = footprint[(index + 1) % footprint.length];
    const midpoint = [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2
    ];
    footprint.splice(index + 1, 0, midpoint);
    selectedIndex = index + 1;
    applyFootprint();
    rebuildMarkers();
    setStatus(`已在最长墙段中点增加节点 ${selectedIndex + 1}。`);
  };

  const deleteNode = () => {
    if (selectedIndex === null || footprint.length <= 4) {
      return;
    }
    footprint.splice(selectedIndex, 1);
    selectedIndex = null;
    applyFootprint();
    rebuildMarkers();
    deleteButton.disabled = true;
    setStatus("已删除所选节点。");
  };

  const coordinateText = () =>
    `wallFootprint: ${JSON.stringify(
      footprint.map(point => point.map(value => Number(value.toFixed(7)))),
      null,
      2
    )}`;

  const geoJsonText = () => {
    const ring = footprint.map(point => [point[1], point[0]]);
    ring.push([...ring[0]]);
    return JSON.stringify(
      {
        type: "Feature",
        properties: {
          wallThicknessMeters:
            window.SHELTER_MAP_CONFIG.wallThicknessMeters,
          wallHeightMeters: window.SHELTER_MAP_CONFIG.wallHeightMeters
        },
        geometry: {
          type: "Polygon",
          coordinates: [ring]
        }
      },
      null,
      2
    );
  };

  const copyText = async text => {
    output.value = text;
    output.focus();
    output.select();
    try {
      await navigator.clipboard.writeText(text);
      setStatus("导出内容已复制到剪贴板。");
    } catch {
      document.execCommand("copy");
      setStatus("导出内容已显示并尝试复制；也可手动复制。");
    }
  };

  panel.addEventListener("click", event => {
    const action = event.target.closest("button")?.dataset.action;
    if (action === "add") {
      addNode();
    } else if (action === "delete") {
      deleteNode();
    } else if (action === "coordinates") {
      copyText(coordinateText());
    } else if (action === "geojson") {
      copyText(geoJsonText());
    }
  });

  const initializeEditor = () => {
    if (!map.getSource("wall-editor-guide")) {
      map.addSource("wall-editor-guide", {
        type: "geojson",
        data: renderer.guideGeoJSON
      });
      map.addLayer({
        id: "wall-editor-guide-layer",
        type: "line",
        source: "wall-editor-guide",
        paint: {
          "line-color": "#ff3b24",
          "line-width": 2,
          "line-opacity": 0.88
        }
      });
    }

    rebuildMarkers();
    setStatus(`编辑模式已启用，共 ${footprint.length} 个节点。`);
    window.ShelterWallEditor = {
      get footprint() {
        return geometryRuntime.cloneLatLngs(footprint);
      },
      exportCoordinates: coordinateText,
      exportGeoJSON: geoJsonText
    };
  };

  if (renderer.ready) {
    initializeEditor();
  } else {
    window.addEventListener("shelter-wall-ready", initializeEditor, {
      once: true
    });
  }
})();
