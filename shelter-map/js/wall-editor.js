(() => {
  "use strict";

  const editEnabled =
    new URLSearchParams(window.location.search).get("editWall") === "1";

  if (!editEnabled) {
    return;
  }

  const map = window.ShelterMap?.map;
  const wallRenderer = window.ShelterWallRenderer;
  const environmentRenderer = window.ShelterEnvironmentRenderer;
  const geometryRuntime = window.ShelterWallGeometry;
  const environmentConfig = window.SHELTER_ENVIRONMENT_CONFIG;

  if (
    !map ||
    !wallRenderer ||
    !environmentRenderer ||
    !geometryRuntime ||
    !environmentConfig
  ) {
    throw new Error("围墙编辑模式初始化失败：所需模块缺失");
  }

  let footprint = wallRenderer.footprint;
  let segments = environmentRenderer.segments;
  let markers = [];
  let selectedIndex = null;
  let selectedSegmentId = segments[0]?.id || null;

  const typeLabels = {
    forest: "树林",
    grass: "草地",
    lakeside: "湖岸",
    waterCrossing: "水面跨越",
    roadGate: "道路门区",
    slope: "坡地",
    urbanEdge: "城市边缘"
  };

  const panel = document.createElement("section");
  panel.className = "wall-editor-panel";
  panel.setAttribute("aria-label", "围墙与环境编辑工具");
  panel.innerHTML = `
    <h2 class="wall-editor-title">围墙与施工环境编辑</h2>
    <div class="wall-editor-actions">
      <button type="button" data-action="add">增加节点</button>
      <button type="button" data-action="delete" disabled>删除所选</button>
      <button type="button" data-action="coordinates">导出坐标</button>
      <button type="button" data-action="geojson">导出 GeoJSON</button>
    </div>
    <fieldset class="environment-editor">
      <legend>环境分段</legend>
      <label>
        墙段
        <select data-field="segment"></select>
      </label>
      <label>
        类型
        <select data-field="segmentType">
          ${Object.entries(typeLabels)
            .map(
              ([value, label]) =>
                `<option value="${value}">${label} · ${value}</option>`
            )
            .join("")}
        </select>
      </label>
      <label>
        外侧清理宽度（米）
        <input data-field="clearWidthMeters" type="number" min="2" max="20" step="0.5">
      </label>
      <div class="environment-editor-checks">
        <label><input data-field="hasServiceRoad" type="checkbox"> 内侧维护路</label>
        <label><input data-field="hasDrainage" type="checkbox"> 排水沟</label>
        <label><input data-field="shoreReinforcement" type="checkbox"> 岸坡加固</label>
        <label><input data-field="steppedFoundation" type="checkbox"> 台阶基础</label>
      </div>
      <button type="button" data-action="apply-segment">应用墙段环境</button>
    </fieldset>
    <div class="wall-editor-actions wall-editor-export-actions">
      <button type="button" data-action="environment">导出环境配置</button>
      <button type="button" data-action="complete">导出完整配置</button>
    </div>
    <textarea class="wall-editor-output" readonly aria-label="导出结果"></textarea>
    <div class="wall-editor-status" role="status" aria-live="polite"></div>
  `;
  document.body.append(panel);

  const output = panel.querySelector(".wall-editor-output");
  const status = panel.querySelector(".wall-editor-status");
  const deleteButton = panel.querySelector('[data-action="delete"]');
  const segmentSelect = panel.querySelector('[data-field="segment"]');
  const segmentTypeSelect = panel.querySelector('[data-field="segmentType"]');
  const clearWidthInput = panel.querySelector(
    '[data-field="clearWidthMeters"]'
  );
  const serviceRoadInput = panel.querySelector(
    '[data-field="hasServiceRoad"]'
  );
  const drainageInput = panel.querySelector('[data-field="hasDrainage"]');
  const shoreInput = panel.querySelector(
    '[data-field="shoreReinforcement"]'
  );
  const steppedInput = panel.querySelector(
    '[data-field="steppedFoundation"]'
  );

  const setStatus = message => {
    status.textContent = message;
  };

  const resolvedSegment = segment => ({
    ...environmentConfig.segmentTypeDefaults[segment.segmentType],
    ...segment
  });

  const refreshSegmentSelect = () => {
    segmentSelect.replaceChildren(
      ...segments.map((segment, index) => {
        const option = document.createElement("option");
        option.value = segment.id;
        option.textContent = `${index + 1}. ${segment.id}（${
          typeLabels[segment.segmentType]
        }）`;
        return option;
      })
    );
    if (!segments.some(segment => segment.id === selectedSegmentId)) {
      selectedSegmentId = segments[0]?.id || null;
    }
    segmentSelect.value = selectedSegmentId || "";
  };

  const refreshSegmentForm = () => {
    const raw = segments.find(segment => segment.id === selectedSegmentId);
    if (!raw) {
      return;
    }
    const segment = resolvedSegment(raw);
    segmentTypeSelect.value = segment.segmentType;
    clearWidthInput.value = Number(segment.clearWidthMeters).toFixed(1);
    serviceRoadInput.checked = Boolean(segment.hasServiceRoad);
    drainageInput.checked = Boolean(segment.hasDrainage);
    shoreInput.checked = Boolean(segment.shoreReinforcement);
    steppedInput.checked = Boolean(segment.steppedFoundation);
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
    wallRenderer.setFootprint(footprint);
    environmentRenderer.setFootprint(footprint);
    updateGuide();
    setStatus(
      `当前 ${footprint.length} 个节点、${segments.length} 个环境段；拖动节点可实时调整。`
    );
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
    footprint.splice(index + 1, 0, [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2
    ]);
    selectedIndex = index + 1;
    applyFootprint();
    rebuildMarkers();
    setStatus(
      `已在最长墙段中点增加节点 ${selectedIndex + 1}；导出前请复核环境段 edgeIndex。`
    );
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
    setStatus("已删除所选节点；导出前请复核环境段 edgeIndex。");
  };

  const roundedFootprint = () =>
    footprint.map(point => point.map(value => Number(value.toFixed(7))));

  const coordinateText = () =>
    `wallFootprint: ${JSON.stringify(roundedFootprint(), null, 2)}`;

  const geoJsonText = () => {
    const ring = footprint.map(point => [point[1], point[0]]);
    ring.push([...ring[0]]);
    return JSON.stringify(
      {
        type: "Feature",
        properties: {
          wallThicknessMeters: window.SHELTER_MAP_CONFIG.wallThicknessMeters,
          wallHeightMeters: window.SHELTER_MAP_CONFIG.wallHeightMeters
        },
        geometry: { type: "Polygon", coordinates: [ring] }
      },
      null,
      2
    );
  };

  const environmentText = () =>
    `environmentSegments: ${JSON.stringify(segments, null, 2)}`;

  const completeText = () =>
    JSON.stringify(
      {
        wallFootprint: roundedFootprint(),
        environmentSegments: segments,
        gates: environmentRenderer.gates,
        corridorMeters: {
          wallThickness: window.SHELTER_MAP_CONFIG.wallThicknessMeters,
          foundationWidth: environmentConfig.foundationWidthMeters,
          innerServiceRoadWidth:
            environmentConfig.innerServiceRoadWidthMeters,
          outerClearZoneWidth: environmentConfig.outerClearZoneWidthMeters,
          vegetationTransitionWidth:
            environmentConfig.vegetationTransitionWidthMeters
        }
      },
      null,
      2
    );

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

  const applySegmentForm = () => {
    const raw = segments.find(segment => segment.id === selectedSegmentId);
    if (!raw) {
      return;
    }
    const clearWidthMeters = Number(clearWidthInput.value);
    if (!Number.isFinite(clearWidthMeters) || clearWidthMeters < 2) {
      setStatus("清理带宽度必须是不小于 2 米的数字。");
      return;
    }
    const changes = {
      segmentType: segmentTypeSelect.value,
      clearWidthMeters,
      hasServiceRoad: serviceRoadInput.checked,
      hasDrainage: drainageInput.checked,
      shoreReinforcement: shoreInput.checked,
      steppedFoundation: steppedInput.checked
    };
    const index = segments.findIndex(
      segment => segment.id === selectedSegmentId
    );
    segments[index] = { ...segments[index], ...changes };
    environmentRenderer.setSegments(segments);
    refreshSegmentSelect();
    refreshSegmentForm();
    setStatus(
      `已更新 ${selectedSegmentId}：${typeLabels[changes.segmentType]}，外侧清理 ${clearWidthMeters} 米。`
    );
  };

  segmentSelect.addEventListener("change", () => {
    selectedSegmentId = segmentSelect.value;
    refreshSegmentForm();
    setStatus(`已选择环境段 ${selectedSegmentId}。`);
  });

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
    } else if (action === "environment") {
      copyText(environmentText());
    } else if (action === "complete") {
      copyText(completeText());
    } else if (action === "apply-segment") {
      applySegmentForm();
    }
  });

  const initializeEditor = () => {
    if (!map.getSource("wall-editor-guide")) {
      map.addSource("wall-editor-guide", {
        type: "geojson",
        data: wallRenderer.guideGeoJSON
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

    environmentRenderer.setEditorGuidesVisible(true);
    refreshSegmentSelect();
    refreshSegmentForm();
    rebuildMarkers();
    setStatus(
      `编辑模式已启用：${footprint.length} 个节点、${segments.length} 个环境段。彩色虚线分别表示中心线、地基、道路、清理带与过渡边缘。`
    );
    window.ShelterWallEditor = {
      get footprint() {
        return geometryRuntime.cloneLatLngs(footprint);
      },
      get environmentSegments() {
        return segments.map(segment => ({ ...segment }));
      },
      exportCoordinates: coordinateText,
      exportGeoJSON: geoJsonText,
      exportEnvironment: environmentText,
      exportCompleteConfig: completeText
    };
  };

  const initializeWhenReady = () => {
    if (wallRenderer.ready && environmentRenderer.ready) {
      initializeEditor();
      return true;
    }
    return false;
  };

  if (!initializeWhenReady()) {
    const check = () => {
      if (initializeWhenReady()) {
        window.removeEventListener("shelter-wall-ready", check);
        window.removeEventListener("shelter-environment-ready", check);
      }
    };
    window.addEventListener("shelter-wall-ready", check);
    window.addEventListener("shelter-environment-ready", check);
  }
})();
