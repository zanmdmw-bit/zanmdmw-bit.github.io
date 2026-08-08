import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const DEG = Math.PI / 180;

export function buildHaulTruck(scene, blueprint) {
  const spec = createSpec(blueprint);
  const root = new THREE.Group();
  root.name = "metric_modular_haul_truck";
  root.userData.units = "meter";
  root.userData.spec = spec;
  scene.add(root);

  const parts = new Map();
  const categoryNames = new Map(blueprint.categories.map((category) => [category.id, category.name]));
  const materials = createMaterials();
  const geometries = createSharedGeometry();
  let addonSequence = 1;

  const registerPart = (id, name, category, object, options = {}) => {
    object = centerPartPivot(object);
    object.name = id;
    Object.assign(object.userData, {
      partId: id,
      name,
      category,
      categoryName: categoryNames.get(category) || category,
      locked: Boolean(options.locked),
      removed: false,
      historyOrphan: false,
      dynamic: Boolean(options.dynamic),
      preset: options.preset || null,
      specification: options.specification || null
    });
    object.userData.original = snapshotTransform(object);
    object.traverse((child) => {
      child.userData.partId = id;
      if (child.isMesh || child.isInstancedMesh) {
        child.castShadow = options.castShadow !== false;
        child.receiveShadow = options.receiveShadow !== false;
      }
    });
    root.add(object);
    parts.set(id, object);
    return object;
  };

  registerPart("chassis_frame", "24 米主承载车架", "structure", makeChassis(materials, spec), {
    specification: "整车设计长度 24.0 m"
  });
  registerPart("underbody_armor", "底部装甲与承载横梁", "structure", makeUnderbody(materials, spec));
  registerPart("electric_power_module", "中央电驱与功率模块", "structure", makePowerModule(materials));
  registerPart("front_service_deck", "8.9 米前维护平台", "front", makeFrontDeck(materials, spec), {
    specification: "平台面离地 8.9 m"
  });
  registerPart("front_nose_structure", "高位车头承载结构", "front", makeFrontNose(materials));
  registerPart("driver_cab_left", "左侧驾驶室", "front", makeDriverCab(materials, spec));
  registerPart("equipment_room_right", "右侧设备室", "front", makeEquipmentRoom(materials, spec));
  registerPart("upper_platform", "车头上层平台与防护顶板", "front", makeUpperPlatform(materials));
  registerPart("front_bumper", "保险杠与防撞梁", "front", makeFrontBumper(materials));
  registerPart("front_grille", "前部格栅与检修门", "front", makeFrontGrille(materials));
  registerPart("front_lighting", "前灯与警示灯组", "details", makeLighting(materials));

  registerPart("dump_bed_shell", "原倾斜自卸货斗", "dump", makeDumpBedShell(materials, spec), {
    specification: "保持倾斜自卸结构"
  });
  registerPart("dump_bed_floor", "原倾斜斗底", "dump", makeDumpBedFloor(materials, spec));
  registerPart("dump_front_guard", "货斗前高位保护结构", "dump", makeDumpFrontGuard(materials));
  registerPart("dump_hydraulics", "自卸液压举升系统", "dump", makeDumpHydraulics(materials));

  registerPart("warehouse_level_floor", "斗内水平仓库地板", "habitation", makeWarehouseFloor(materials, spec), {
    specification: `${spec.bedInteriorLength.toFixed(1)} × ${spec.bedInteriorWidth.toFixed(1)} m，${spec.bedFloorArea.toFixed(1)} m²`
  });
  registerPart("wedge_equipment_bay", "楔形低层设备／储物空间", "habitation", makeWedgeBay(materials, spec));
  registerPart("phase1_second_floor", "一期二层平台", "habitation", makeSecondFloor(materials, spec), {
    specification: "一期长度为货斗内部长度约一半"
  });
  registerPart("second_floor_columns", "二层主承重柱", "habitation", makeSecondFloorColumns(materials, spec));
  registerPart("living_water_tank", "6 m³ 主生活水箱", "habitation", makeWaterTank(materials), {
    specification: "3.0 × 2.0 × 1.0 m = 6.0 m³"
  });
  registerPart("cold_storage", "1.5 m³ 冷藏区", "habitation", makeColdStorage(materials), {
    specification: "1.5 m³；目标 2–4 ℃"
  });
  registerPart("freezer_storage", "3 m³ 冷冻区", "habitation", makeFreezer(materials), {
    specification: "3.0 m³；目标约 -20 ℃"
  });

  spec.axlePositions.forEach((x, axleIndex) => {
    const axleCode = String(axleIndex + 1).padStart(2, "0");
    registerPart(`axle_${axleCode}`, `第 ${axleIndex + 1} 轴承载横梁`, "wheels", makeAxleCarrier(x, axleIndex, materials, spec));
    spec.sides.forEach((side) => {
      const sideLabel = side.suffix === "left" ? "左" : "右";
      registerPart(
        `suspension_${axleCode}_${side.suffix}`,
        `第 ${axleIndex + 1} 轴${sideLabel}侧主动悬挂`,
        "wheels",
        makeSuspensionModule(x, side.z, axleIndex, side.sign, materials, spec),
        { specification: "主动承载悬挂／全轮转向节" }
      );
      registerPart(
        `wheel_${axleCode}_${side.suffix}`,
        `第 ${axleIndex + 1} 轴${sideLabel}侧轮组`,
        "wheels",
        makeWheel(x, side.z, axleIndex, side.sign, materials, geometries, spec),
        { specification: "外径 4.9 m；独立电驱；非充气模块化轮面" }
      );
    });
  });

  registerPart("front_railings", "前维护平台栏杆", "access", makeFrontRailings(materials, spec));
  registerPart("upper_railings", "车头上层平台栏杆", "access", makeUpperRailings(materials));
  registerPart("warehouse_railings", "斗内水平层防护栏", "access", makeWarehouseRailings(materials, spec));
  registerPart("front_access_ladder", "车头登车梯", "access", makeFrontLadder(materials, spec));
  registerPart("side_access_ladder", "驾驶室侧检修梯", "access", makeSideLadder(materials, spec));
  registerPart("rear_access_ladder", "车尾检修梯", "access", makeRearLadder(materials));

  registerPart("service_tanks", "液压与消防罐组", "details", makeServiceTanks(materials));
  registerPart("exhaust_intake", "排气与散热系统", "details", makeExhaust(materials));
  registerPart("wheel_fenders", "八轮挡泥与检修踏板", "details", makeFenders(materials, spec));
  registerPart("service_toolboxes", "检修工具箱", "details", makeToolboxes(materials));
  registerPart("warning_markings", "警示标识与反光板", "details", makeWarningMarkings(materials, spec));

  const anchorGroup = createAnchors(blueprint.anchors, materials);
  anchorGroup.name = "installation_anchors";
  anchorGroup.visible = false;
  root.add(anchorGroup);

  const getPartFromObject = (object) => {
    let current = object;
    while (current && current !== scene) {
      if (current.userData?.partId && parts.has(current.userData.partId)) return parts.get(current.userData.partId);
      current = current.parent;
    }
    return null;
  };

  const createPreset = (preset, anchorId = "front_deck_center") => {
    const anchor = blueprint.anchors.find((item) => item.id === anchorId) || blueprint.anchors[0];
    const definitions = {
      tent: { name: "工业帐篷", builder: makeTent },
      campfire: { name: "篝火炉", builder: makeCampfire },
      crate: { name: "储物箱", builder: makeCrate },
      shelter: { name: "铁棚生活区", builder: makeShelter }
    };
    const definition = definitions[preset] || definitions.crate;
    const object = definition.builder(materials);
    object.position.fromArray(anchor.position);
    const id = `addon_${preset}_${String(addonSequence++).padStart(2, "0")}`;
    return registerPart(id, `${definition.name} ${addonSequence - 1}`, "addons", object, { dynamic: true, preset });
  };

  const registerExternal = (object, name = "导入部件") => {
    object.position.fromArray(blueprint.anchors.find((item) => item.id === "front_deck_center").position);
    fitImportedObject(object, 3.2);
    const id = `addon_imported_${String(addonSequence++).padStart(2, "0")}`;
    return registerPart(id, `${name} ${addonSequence - 1}`, "addons", object, { dynamic: true, preset: "external" });
  };

  const duplicatePart = (source) => {
    const clone = source.clone(true);
    clone.position.x += 0.7;
    clone.position.z += 0.7;
    const baseId = source.userData.partId.replace(/_copy_\d+$/, "");
    let copyIndex = 1;
    while (parts.has(`${baseId}_copy_${copyIndex}`)) copyIndex += 1;
    return registerPart(`${baseId}_copy_${copyIndex}`, `${source.userData.name} 副本 ${copyIndex}`, source.userData.category, clone, {
      dynamic: true,
      preset: source.userData.preset || "clone",
      specification: source.userData.specification
    });
  };

  const setWireframe = (enabled) => {
    const changedMaterials = new Set();
    parts.forEach((part) => {
      part.traverse((child) => {
        if (!child.isMesh && !child.isInstancedMesh) return;
        const list = Array.isArray(child.material) ? child.material : [child.material];
        list.forEach((material) => {
          if (!material || material.transparent || changedMaterials.has(material)) return;
          material.wireframe = enabled;
          material.needsUpdate = true;
          changedMaterials.add(material);
        });
      });
    });
  };

  return {
    root,
    parts,
    materials,
    anchors: blueprint.anchors,
    anchorGroup,
    categoryNames,
    spec,
    getPartFromObject,
    createPreset,
    registerExternal,
    registerPart,
    duplicatePart,
    setWireframe
  };
}

function createSpec(blueprint) {
  const dimensions = blueprint.dimensionsMeters;
  const width = dimensions.width;
  return {
    ...dimensions,
    wheelRadius: dimensions.wheelDiameter / 2,
    axlePositions: [-8.75, -2.85, 3.05, 8.75],
    sides: [
      { suffix: "left", sign: -1, z: -(width / 2 - dimensions.wheelWidth / 2) },
      { suffix: "right", sign: 1, z: width / 2 - dimensions.wheelWidth / 2 }
    ]
  };
}

function createMaterials() {
  const paintTexture = createIndustrialTexture("#8d6737", "#332b22", "#c08b46");
  const darkTexture = createIndustrialTexture("#38413f", "#171c1b", "#686254");
  const floorTexture = createIndustrialTexture("#b9b8b0", "#777b78", "#e2ded2", 512);
  floorTexture.repeat.set(10, 8);

  return {
    paint: new THREE.MeshStandardMaterial({ map: paintTexture, color: 0xb98645, roughness: 0.8, metalness: 0.58 }),
    paintLight: new THREE.MeshStandardMaterial({ color: 0xc7a16a, roughness: 0.74, metalness: 0.52 }),
    paintDark: new THREE.MeshStandardMaterial({ map: darkTexture, color: 0x4f5855, roughness: 0.82, metalness: 0.64 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x777e7a, roughness: 0.5, metalness: 0.94 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x303735, roughness: 0.6, metalness: 0.91 }),
    steelBlack: new THREE.MeshStandardMaterial({ color: 0x141a19, roughness: 0.66, metalness: 0.77 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x744728, roughness: 0.94, metalness: 0.38 }),
    composite: new THREE.MeshStandardMaterial({ color: 0x242826, roughness: 0.86, metalness: 0.18 }),
    tread: new THREE.MeshStandardMaterial({ color: 0x353a37, roughness: 0.9, metalness: 0.42 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x3e5f68, roughness: 0.16, metalness: 0.12, transmission: 0.23, transparent: true, opacity: 0.82 }),
    glassDark: new THREE.MeshPhysicalMaterial({ color: 0x14292f, roughness: 0.22, metalness: 0.18, transmission: 0.1, transparent: true, opacity: 0.91 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffdf9e, emissive: 0xffc766, emissiveIntensity: 1.7, roughness: 0.2 }),
    warning: new THREE.MeshStandardMaterial({ color: 0xe26d32, emissive: 0x9a2b10, emissiveIntensity: 0.22, roughness: 0.52 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x457c91, roughness: 0.65, metalness: 0.42 }),
    cold: new THREE.MeshStandardMaterial({ color: 0xaed8e5, roughness: 0.46, metalness: 0.36 }),
    freezer: new THREE.MeshStandardMaterial({ color: 0x6ea7c2, roughness: 0.5, metalness: 0.44 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x606755, roughness: 1, side: THREE.DoubleSide }),
    fabricDark: new THREE.MeshStandardMaterial({ color: 0x343b34, roughness: 1, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ color: 0x603821, roughness: 0.95 }),
    flameOuter: new THREE.MeshBasicMaterial({ color: 0xff8a24, transparent: true, opacity: 0.72, depthWrite: false }),
    flameInner: new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.88, depthWrite: false }),
    anchor: new THREE.MeshBasicMaterial({ color: 0xf3b554, transparent: true, opacity: 0.85, depthTest: false }),
    floor: new THREE.MeshStandardMaterial({ map: floorTexture, color: 0xd2d0c8, roughness: 0.94, metalness: 0.04 })
  };
}

function createSharedGeometry() {
  return {
    treadBlock: new RoundedBoxGeometry(0.62, 0.34, 1.38, 2, 0.06),
    bolt: new THREE.CylinderGeometry(0.065, 0.065, 0.12, 10)
  };
}

function createIndustrialTexture(base, dark, highlight, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);
  for (let index = 0; index < size * 4; index += 1) {
    const alpha = 0.035 + Math.random() * 0.08;
    context.fillStyle = index % 3 === 0 ? hexToRgba(highlight, alpha) : hexToRgba(dark, alpha);
    context.beginPath();
    context.arc(Math.random() * size, Math.random() * size, 0.4 + Math.random() * 2.7, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = hexToRgba(dark, 0.16);
  context.lineWidth = 0.8;
  for (let index = 0; index < 18; index += 1) {
    const y = Math.random() * size;
    context.beginPath();
    context.moveTo(Math.random() * size * 0.35, y);
    context.lineTo(size * (0.55 + Math.random() * 0.45), y + (Math.random() - 0.5) * 3);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function hexToRgba(hex, alpha) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function makeGroup(name) {
  const group = new THREE.Group();
  group.name = name;
  return group;
}

function centerPartPivot(source) {
  source.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(source);
  if (box.isEmpty()) return source;
  const center = box.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();
  wrapper.position.copy(center);
  source.position.sub(center);
  if (typeof source.userData.animate === "function") wrapper.userData.animate = source.userData.animate;
  wrapper.add(source);
  return wrapper;
}

function addBox(parent, size, position, material, rotation = [0, 0, 0], radius = 0) {
  const geometry = radius > 0 ? new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius) : new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.fromArray(position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, radius, depth, position, rotation, material, segments = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, segments), material);
  mesh.position.fromArray(position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinderBetween(parent, start, end, radius, material, segments = 12) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const direction = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments), material);
  mesh.position.copy(a.clone().add(b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addRivetLine(parent, start, end, count, material, radius = 0.065) {
  const geometry = new THREE.SphereGeometry(radius, 8, 5);
  const rivets = new THREE.InstancedMesh(geometry, material, count);
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    dummy.position.copy(a).lerp(b, count === 1 ? 0 : index / (count - 1));
    dummy.updateMatrix();
    rivets.setMatrixAt(index, dummy.matrix);
  }
  rivets.castShadow = true;
  parent.add(rivets);
}

function makeChassis(m, spec) {
  const group = makeGroup("chassis");
  for (const z of [-2.85, 2.85]) addBox(group, [22.8, 0.76, 0.82], [-0.15, 5.45, z], m.steelDark, [0, 0, 0], 0.1);
  for (let x = -10.8; x <= 10.5; x += 1.95) addBox(group, [0.42, 0.58, 6.15], [x, 5.45, 0], m.steel);
  addBox(group, [7.3, 0.42, 10.65], [-7.65, 6.0, 0], m.paintDark, [0, 0, 0], 0.09);
  addBox(group, [14.2, 0.36, 7.2], [4.1, 6.0, 0], m.steelDark);
  for (const z of [-3.3, 3.3]) addRivetLine(group, [-11.4, 5.88, z], [11.1, 5.88, z], 34, m.rust);
  return group;
}

function makeUnderbody(m) {
  const group = makeGroup("underbody");
  addBox(group, [6.7, 0.36, 7.2], [-7.3, 4.86, 0], m.paintDark, [0, 0, 0], 0.12);
  addBox(group, [12.8, 0.32, 5.8], [3.9, 4.9, 0], m.steelDark);
  for (let x = -9.7; x <= 10.1; x += 2.2) addBox(group, [0.18, 0.24, 5.95], [x, 4.7, 0], m.rust);
  return group;
}

function makePowerModule(m) {
  const group = makeGroup("electric_power");
  addBox(group, [4.6, 2.15, 4.8], [0.0, 6.75, 0], m.paintDark, [0, 0, 0], 0.2);
  for (let z = -1.85; z <= 1.85; z += 0.3) addBox(group, [0.08, 1.52, 0.11], [-2.34, 6.88, z], m.steelBlack);
  addCylinder(group, 0.72, 4.0, [1.15, 6.75, 0], [Math.PI / 2, 0, 0], m.steelDark, 24);
  addBox(group, [1.4, 0.55, 4.2], [2.45, 6.2, 0], m.steelDark, [0, 0, 0], 0.08);
  return group;
}

function makeFrontDeck(m, spec) {
  const group = makeGroup("front_deck");
  const y = spec.frontPlatformHeight;
  addBox(group, [7.6, 0.38, 11.35], [-7.9, y - 0.19, 0], m.paint, [0, 0, 0], 0.07);
  addBox(group, [7.35, 0.14, 11.05], [-7.8, y + 0.08, 0], m.steelDark);
  for (let z = -5.25; z <= 5.25; z += 0.42) addBox(group, [7.15, 0.055, 0.075], [-7.82, y + 0.18, z], m.steel);
  addBox(group, [1.1, 1.1, 10.7], [-11.25, y - 0.85, 0], m.paintDark, [0, 0, 0], 0.1);
  for (const z of [-5.5, 5.5]) addRivetLine(group, [-11.45, y + 0.02, z], [-4.25, y + 0.02, z], 20, m.rust);
  return group;
}

function makeFrontNose(m) {
  const group = makeGroup("front_nose");
  addBox(group, [1.65, 3.65, 9.7], [-11.1, 6.75, 0], m.paint, [0, 0, -3 * DEG], 0.18);
  addBox(group, [0.55, 3.05, 7.8], [-11.95, 6.35, 0], m.paintDark, [0, 0, -3 * DEG], 0.14);
  addBox(group, [2.1, 0.38, 10.2], [-10.75, 4.85, 0], m.steelBlack, [0, 0, 0], 0.08);
  for (const z of [-4.55, -3.75, 3.75, 4.55]) cylinderBetween(group, [-11.82, 5.1, z], [-11.56, 8.1, z], 0.11, m.steel);
  return group;
}

function makeDriverCab(m, spec) {
  const group = makeGroup("driver_cab");
  const base = spec.frontPlatformHeight + 0.14;
  addBox(group, [3.25, 2.7, 3.15], [-8.25, base + 1.35, -2.55], m.paint, [0, 0, 0], 0.18);
  addBox(group, [3.52, 0.2, 3.42], [-8.2, base + 2.8, -2.55], m.paintDark, [0, 0, -2 * DEG], 0.08);
  addBox(group, [0.08, 1.46, 2.35], [-9.9, base + 1.56, -2.55], m.glassDark, [0, 0, -6 * DEG], 0.03);
  addBox(group, [1.52, 1.38, 0.07], [-8.8, base + 1.55, -4.16], m.glass, [0, 0, 0], 0.03);
  addBox(group, [1.14, 1.38, 0.07], [-7.38, base + 1.55, -4.16], m.glassDark, [0, 0, 0], 0.03);
  addBox(group, [0.08, 1.35, 2.15], [-6.6, base + 1.48, -2.55], m.glassDark, [0, 0, 0], 0.03);
  addBox(group, [0.12, 1.7, 1.25], [-9.95, base + 0.96, -2.55], m.paintDark);
  addRivetLine(group, [-9.75, base + 0.1, -4.2], [-6.75, base + 0.1, -4.2], 10, m.rust);
  return group;
}

function makeEquipmentRoom(m, spec) {
  const group = makeGroup("equipment_room");
  const base = spec.frontPlatformHeight + 0.14;
  addBox(group, [3.0, 2.5, 3.0], [-7.75, base + 1.25, 2.65], m.paint, [0, 0, 0], 0.16);
  addBox(group, [3.28, 0.2, 3.25], [-7.75, base + 2.6, 2.65], m.paintDark, [0, 0, -1 * DEG], 0.08);
  addBox(group, [0.08, 1.68, 2.25], [-9.29, base + 1.26, 2.65], m.paintDark, [0, 0, -5 * DEG], 0.03);
  addBox(group, [2.2, 1.62, 0.08], [-7.76, base + 1.25, 4.18], m.paintDark, [0, 0, 0], 0.03);
  for (let x = -8.72; x <= -6.8; x += 0.2) addBox(group, [0.1, 1.26, 0.08], [x, base + 1.35, 4.24], m.steelBlack);
  addBox(group, [0.48, 0.72, 0.1], [-8.85, base + 0.72, 4.25], m.steel);
  addBox(group, [0.48, 0.72, 0.1], [-6.68, base + 0.72, 4.25], m.steel);
  addRivetLine(group, [-9.05, base + 0.1, 4.21], [-6.46, base + 0.1, 4.21], 9, m.rust);
  return group;
}

function makeUpperPlatform(m) {
  const group = makeGroup("upper_platform");
  addBox(group, [7.0, 0.32, 10.25], [-6.55, 12.35, 0], m.paint, [0, 0, -3.5 * DEG], 0.06);
  addBox(group, [7.3, 0.16, 10.55], [-6.55, 12.58, 0], m.steelDark, [0, 0, -3.5 * DEG]);
  for (let x = -9.55; x <= -3.45; x += 0.52) addBox(group, [0.08, 0.08, 10.15], [x, 12.7 + (-6.55 - x) * 0.061, 0], m.steel);
  addBox(group, [2.7, 0.62, 8.8], [-3.15, 12.05, 0], m.paintDark, [0, 0, -8 * DEG], 0.1);
  return group;
}

function makeFrontBumper(m) {
  const group = makeGroup("front_bumper");
  addBox(group, [0.72, 1.25, 10.8], [-11.65, 4.25, 0], m.paint, [0, 0, 0], 0.16);
  addBox(group, [0.48, 0.54, 11.55], [-12.0, 3.62, 0], m.steelDark, [0, 0, 0], 0.12);
  for (const z of [-4.6, 4.6]) addBox(group, [0.65, 0.48, 1.75], [-11.88, 3.12, z], m.steelBlack);
  cylinderBetween(group, [-12.18, 2.85, -4.6], [-12.18, 2.85, 4.6], 0.13, m.steel, 16);
  return group;
}

function makeFrontGrille(m) {
  const group = makeGroup("front_grille");
  addBox(group, [0.15, 2.1, 6.0], [-12.02, 6.65, 0], m.steelBlack, [0, 0, -3 * DEG], 0.05);
  for (let z = -2.75; z <= 2.75; z += 0.3) addBox(group, [0.18, 1.86, 0.08], [-12.13, 6.66, z], m.steel);
  addBox(group, [0.2, 0.14, 6.2], [-12.12, 7.69, 0], m.paintDark);
  addBox(group, [0.2, 0.14, 6.2], [-12.12, 5.62, 0], m.paintDark);
  return group;
}

function makeLighting(m) {
  const group = makeGroup("lighting");
  for (const z of [-4.1, -3.35, 3.35, 4.1]) {
    addCylinder(group, 0.3, 0.18, [-12.18, 7.85, z], [0, 0, Math.PI / 2], m.lamp, 28);
    addCylinder(group, 0.4, 0.16, [-12.06, 7.85, z], [0, 0, Math.PI / 2], m.steelDark, 28);
  }
  for (const z of [-5.25, 5.25]) addBox(group, [0.28, 0.3, 0.48], [-9.35, 12.62, z], m.warning, [0, 0, 0], 0.05);
  return group;
}

function makeDumpBedShell(m, spec) {
  const group = makeGroup("dump_bed_shell");
  const profile = new THREE.Shape();
  profile.moveTo(-3.35, 8.65);
  profile.lineTo(11.35, 6.05);
  profile.lineTo(11.2, 11.45);
  profile.lineTo(-2.8, 14.2);
  profile.lineTo(-3.75, 13.55);
  profile.closePath();
  const sideGeometry = new THREE.ExtrudeGeometry(profile, {
    depth: 0.28,
    bevelEnabled: true,
    bevelSize: 0.06,
    bevelThickness: 0.05,
    bevelSegments: 2
  });
  sideGeometry.translate(0, 0, -0.14);
  for (const z of [-4.34, 4.34]) {
    const side = new THREE.Mesh(sideGeometry, m.paint);
    side.position.z = z;
    group.add(side);
  }
  addBox(group, [0.42, 5.5, 8.65], [-3.42, 11.25, 0], m.paint, [0, 0, -5 * DEG], 0.05);
  const ribX = [-2.8, -1.1, 0.6, 2.3, 4.0, 5.7, 7.4, 9.1, 10.7];
  ribX.forEach((x) => {
    const floorY = 8.65 - ((x + 3.35) / 14.7) * 2.6;
    const topY = 14.1 - ((x + 2.8) / 14.0) * 2.65;
    const height = topY - floorY;
    for (const z of [-4.52, 4.52]) addBox(group, [0.24, height, 0.3], [x, floorY + height / 2, z], m.paintLight, [0, 0, 2 * DEG], 0.035);
  });
  for (const z of [-4.55, 4.55]) {
    cylinderBetween(group, [-3.3, 8.85, z], [11.2, 6.3, z], 0.11, m.steelDark, 14);
    cylinderBetween(group, [-3.25, 11.5, z], [11.1, 9.0, z], 0.09, m.steel, 14);
    cylinderBetween(group, [-3.5, 13.75, z], [-2.75, 14.42, z], 0.14, m.steel, 14);
    cylinderBetween(group, [-2.75, 14.42, z], [11.25, 11.65, z], 0.14, m.steel, 14);
    addRivetLine(group, [-3.0, 8.75, z + Math.sign(z) * 0.1], [10.95, 6.27, z + Math.sign(z) * 0.1], 30, m.rust, 0.075);
  }
  return group;
}

function makeDumpBedFloor(m, spec) {
  const group = makeGroup("dump_floor");
  addBox(group, [spec.bedInteriorLength + 0.55, 0.48, spec.bedInteriorWidth + 0.45], [4.0, 7.36, 0], m.paintDark, [0, 0, -10.05 * DEG], 0.06);
  addBox(group, [spec.bedInteriorLength, 0.18, spec.bedInteriorWidth], [4.0, 7.68, 0], m.steelDark, [0, 0, -10.05 * DEG]);
  for (let x = -2.5; x <= 10.5; x += 1.1) addBox(group, [0.12, 0.13, spec.bedInteriorWidth - 0.3], [x, 9.0 - (x + 3.0) * 0.176, 0], m.steel, [0, 0, -10.05 * DEG]);
  return group;
}

function makeDumpFrontGuard(m) {
  const group = makeGroup("dump_front_guard");
  addBox(group, [4.1, 0.38, 10.5], [-3.15, 13.1, 0], m.paint, [0, 0, -12 * DEG], 0.06);
  for (let z = -4.8; z <= 4.8; z += 0.58) addBox(group, [3.8, 0.13, 0.12], [-3.15, 12.92, z], m.steelDark, [0, 0, -12 * DEG]);
  cylinderBetween(group, [-5.0, 12.35, -4.85], [-1.35, 13.9, -4.85], 0.13, m.steel);
  cylinderBetween(group, [-5.0, 12.35, 4.85], [-1.35, 13.9, 4.85], 0.13, m.steel);
  return group;
}

function makeDumpHydraulics(m) {
  const group = makeGroup("dump_hydraulics");
  for (const z of [-1.75, 1.75]) {
    cylinderBetween(group, [0.2, 5.95, z], [-2.1, 10.25, z], 0.36, m.steelDark, 28);
    cylinderBetween(group, [-2.05, 10.15, z], [-2.75, 11.55, z], 0.24, m.steel, 28);
    addCylinder(group, 0.48, 0.78, [0.25, 5.92, z], [Math.PI / 2, 0, 0], m.paintDark, 22);
  }
  cylinderBetween(group, [-0.3, 5.8, -2.7], [-0.3, 5.8, 2.7], 0.22, m.steelDark, 20);
  return group;
}

function makeWarehouseFloor(m, spec) {
  const group = makeGroup("warehouse_floor");
  addBox(group, [spec.bedInteriorLength, 0.24, spec.bedInteriorWidth], [4.0, 9.05, 0], m.paintLight, [0, 0, 0], 0.04);
  addBox(group, [spec.bedInteriorLength - 0.3, 0.09, spec.bedInteriorWidth - 0.3], [4.0, 9.22, 0], m.steelDark);
  for (let x = -2.5; x <= 10.5; x += 0.8) addBox(group, [0.08, 0.055, spec.bedInteriorWidth - 0.45], [x, 9.3, 0], m.steel);
  return group;
}

function makeWedgeBay(m, spec) {
  const group = makeGroup("wedge_bay");
  for (const z of [-3.75, 3.75]) {
    cylinderBetween(group, [-2.7, 8.75, z], [10.7, 6.4, z], 0.12, m.steelDark, 14);
    cylinderBetween(group, [-2.7, 9.0, z], [10.7, 9.0, z], 0.1, m.steel, 14);
  }
  for (let x = -2.5; x <= 10.5; x += 2.15) {
    const lowY = 8.65 - (x + 3.0) * 0.176;
    for (const z of [-3.75, 3.75]) cylinderBetween(group, [x, lowY, z], [x, 8.98, z], 0.11, m.steel, 12);
    addBox(group, [1.65, Math.max(0.25, 8.8 - lowY), 1.2], [x, lowY + Math.max(0.25, 8.8 - lowY) / 2, 0], m.paintDark, [0, 0, 0], 0.08);
  }
  return group;
}

function makeSecondFloor(m, spec) {
  const group = makeGroup("second_floor");
  const length = spec.bedInteriorLength / 2;
  addBox(group, [length, 0.26, spec.bedInteriorWidth - 0.45], [0.75, 11.65, 0], m.paintLight, [0, 0, 0], 0.04);
  addBox(group, [length - 0.25, 0.09, spec.bedInteriorWidth - 0.7], [0.75, 11.82, 0], m.steelDark);
  for (let x = -2.35; x <= 3.8; x += 0.72) addBox(group, [0.08, 0.06, spec.bedInteriorWidth - 0.9], [x, 11.9, 0], m.steel);
  return group;
}

function makeSecondFloorColumns(m, spec) {
  const group = makeGroup("second_floor_columns");
  for (const x of [-2.35, 0.75, 3.85]) {
    for (const z of [-3.65, 3.65]) {
      addBox(group, [0.22, 2.45, 0.22], [x, 10.35, z], m.steel, [0, 0, 0], 0.04);
      cylinderBetween(group, [x - 0.55, 9.17, z], [x, 10.3, z], 0.08, m.steelDark, 12);
      cylinderBetween(group, [x, 10.3, z], [x + 0.55, 11.55, z], 0.08, m.steelDark, 12);
    }
  }
  return group;
}

function makeWaterTank(m) {
  const group = makeGroup("water_tank");
  addBox(group, [3.0, 1.0, 2.0], [1.2, 4.15, 0], m.blue, [0, 0, 0], 0.24);
  for (const x of [0.15, 2.25]) addBox(group, [0.12, 1.08, 2.08], [x, 4.15, 0], m.steelDark, [0, 0, 0], 0.05);
  addCylinder(group, 0.18, 0.24, [1.2, 4.78, 0], [0, 0, 0], m.steel, 20);
  return group;
}

function makeColdStorage(m) {
  const group = makeGroup("cold_storage");
  addBox(group, [1.5, 1.0, 1.0], [7.55, 9.78, -2.8], m.cold, [0, 0, 0], 0.12);
  addBox(group, [1.22, 0.72, 0.07], [7.55, 9.78, -3.34], m.steelDark, [0, 0, 0], 0.04);
  addBox(group, [0.22, 0.08, 0.08], [8.0, 9.78, -3.39], m.paintLight);
  return group;
}

function makeFreezer(m) {
  const group = makeGroup("freezer_storage");
  addBox(group, [2.0, 1.0, 1.5], [9.45, 9.78, 2.25], m.freezer, [0, 0, 0], 0.12);
  addBox(group, [1.65, 0.72, 0.07], [9.45, 9.78, 3.04], m.steelDark, [0, 0, 0], 0.04);
  addBox(group, [0.22, 0.08, 0.08], [10.08, 9.78, 3.09], m.paintLight);
  return group;
}

function makeAxleCarrier(x, index, m, spec) {
  const group = makeGroup(`axle_${index + 1}`);
  cylinderBetween(group, [x, 5.1, -4.7], [x, 5.1, 4.7], 0.28, m.steelDark, 24);
  addBox(group, [1.1, 0.82, 7.8], [x, 5.25, 0], m.steelBlack, [0, 0, 0], 0.12);
  addCylinder(group, 0.58, 1.1, [x, 5.1, 0], [Math.PI / 2, 0, 0], m.steel, 24);
  for (const z of [-3.2, 3.2]) addCylinder(group, 0.3, 1.12, [x, 5.75, z], [0, 0, 0], m.steel, 20);
  return group;
}

function makeSuspensionModule(x, z, axleIndex, sideSign, m, spec) {
  const group = makeGroup("active_suspension");
  const innerZ = z - sideSign * 1.05;
  cylinderBetween(group, [x - 0.65, 5.65, innerZ], [x, 3.3, z - sideSign * 0.25], 0.18, m.steel, 18);
  cylinderBetween(group, [x + 0.65, 5.65, innerZ], [x, 3.3, z - sideSign * 0.25], 0.18, m.steelDark, 18);
  cylinderBetween(group, [x, 5.92, innerZ], [x, 3.58, z - sideSign * 0.4], 0.28, m.paintDark, 24);
  cylinderBetween(group, [x, 3.6, z - sideSign * 0.4], [x, 3.0, z], 0.17, m.steel, 20);
  addCylinder(group, 0.52, 0.5, [x, spec.wheelRadius, z - sideSign * 0.12], [Math.PI / 2, 0, 0], m.steelBlack, 24);
  cylinderBetween(group, [x - 0.6, 4.0, innerZ], [x + 0.6, 4.0, innerZ], 0.1, m.warning, 14);
  return group;
}

function makeWheel(x, z, axleIndex, sideSign, m, shared, spec) {
  const group = makeGroup("non_pneumatic_wheel");
  group.position.set(x, spec.wheelRadius, z);
  const radius = spec.wheelRadius;
  const width = spec.wheelWidth;

  const buffer = new THREE.Mesh(new THREE.TorusGeometry(1.92, 0.34, 18, 72), m.composite);
  group.add(buffer);
  const skeletonOuter = new THREE.Mesh(new THREE.TorusGeometry(1.98, 0.13, 12, 72), m.steel);
  const skeletonInner = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.12, 12, 72), m.steelDark);
  for (const side of [-1, 1]) {
    const outer = skeletonOuter.clone();
    outer.position.z = side * (width * 0.4);
    const inner = skeletonInner.clone();
    inner.position.z = side * (width * 0.4);
    group.add(outer, inner);
  }

  const treadCount = 36;
  const blocks = new THREE.InstancedMesh(shared.treadBlock, m.tread, treadCount);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < treadCount; index += 1) {
    const angle = (index / treadCount) * Math.PI * 2;
    dummy.position.set(Math.cos(angle) * (radius - 0.17), Math.sin(angle) * (radius - 0.17), 0);
    dummy.rotation.set(0, 0, angle - Math.PI / 2);
    dummy.scale.set(1, 1, width / 1.38);
    dummy.updateMatrix();
    blocks.setMatrixAt(index, dummy.matrix);
  }
  blocks.castShadow = true;
  blocks.receiveShadow = true;
  group.add(blocks);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, width - 0.18, 32), m.steelDark);
  hub.rotation.x = Math.PI / 2;
  group.add(hub);
  const drive = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.48, width - 0.06, 28), m.paintLight);
  drive.rotation.x = Math.PI / 2;
  group.add(drive);

  for (const side of [-1, 1]) {
    for (let index = 0; index < 16; index += 1) {
      const angle = (index / 16) * Math.PI * 2;
      cylinderBetween(group, [Math.cos(angle) * 0.68, Math.sin(angle) * 0.68, side * width * 0.4], [Math.cos(angle) * 1.38, Math.sin(angle) * 1.38, side * width * 0.4], 0.065, m.steel, 10);
    }
  }

  const bolts = new THREE.InstancedMesh(shared.bolt, m.steel, 12);
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    dummy.position.set(Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, -sideSign * (width / 2 - 0.16));
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bolts.setMatrixAt(index, dummy.matrix);
  }
  blocks.instanceMatrix.needsUpdate = true;
  bolts.instanceMatrix.needsUpdate = true;
  bolts.castShadow = true;
  group.add(bolts);
  return group;
}

function addRailRun(group, points, height, m) {
  points.forEach((point) => cylinderBetween(group, point, [point[0], point[1] + height, point[2]], 0.065, m.steel, 10));
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    cylinderBetween(group, [a[0], a[1] + height, a[2]], [b[0], b[1] + height, b[2]], 0.07, m.steel, 10);
    cylinderBetween(group, [a[0], a[1] + height * 0.55, a[2]], [b[0], b[1] + height * 0.55, b[2]], 0.05, m.steel, 10);
  }
}

function makeFrontRailings(m, spec) {
  const group = makeGroup("front_railings");
  const y = spec.frontPlatformHeight + 0.18;
  addRailRun(group, [[-11.3, y, -5.42], [-9.6, y, -5.42], [-7.8, y, -5.42], [-6.0, y, -5.42], [-4.25, y, -5.42]], 1.1, m);
  addRailRun(group, [[-11.3, y, 5.42], [-9.6, y, 5.42], [-7.8, y, 5.42], [-6.0, y, 5.42], [-4.25, y, 5.42]], 1.1, m);
  addRailRun(group, [[-11.3, y, -5.42], [-11.3, y, -2.7], [-11.3, y, 0], [-11.3, y, 2.7], [-11.3, y, 5.42]], 1.1, m);
  return group;
}

function makeUpperRailings(m) {
  const group = makeGroup("upper_railings");
  addRailRun(group, [[-9.5, 12.75, -4.95], [-7.7, 12.75, -4.95], [-5.5, 12.75, -4.95], [-3.2, 12.75, -4.95]], 0.95, m);
  addRailRun(group, [[-9.5, 12.75, 4.95], [-7.7, 12.75, 4.95], [-5.5, 12.75, 4.95], [-3.2, 12.75, 4.95]], 0.95, m);
  addRailRun(group, [[-9.5, 12.75, -4.95], [-9.5, 12.75, -1.7], [-9.5, 12.75, 1.7], [-9.5, 12.75, 4.95]], 0.95, m);
  return group;
}

function makeWarehouseRailings(m, spec) {
  const group = makeGroup("warehouse_railings");
  const y = 9.3;
  addRailRun(group, [[-2.85, y, -3.85], [0.5, y, -3.85], [4, y, -3.85], [7.5, y, -3.85], [10.85, y, -3.85]], 0.95, m);
  addRailRun(group, [[-2.85, y, 3.85], [0.5, y, 3.85], [4, y, 3.85], [7.5, y, 3.85], [10.85, y, 3.85]], 0.95, m);
  return group;
}

function makeLadderAt(position, rotationY, width, height, steps, m) {
  const group = makeGroup("ladder");
  cylinderBetween(group, [-width / 2, 0, 0], [-width / 2, height, 0], 0.075, m.steel, 10);
  cylinderBetween(group, [width / 2, 0, 0], [width / 2, height, 0], 0.075, m.steel, 10);
  for (let index = 0; index <= steps; index += 1) {
    const y = (index / steps) * height;
    cylinderBetween(group, [-width / 2, y, 0], [width / 2, y, 0], 0.06, m.steel, 10);
  }
  group.position.fromArray(position);
  group.rotation.y = rotationY;
  return group;
}

function makeFrontLadder(m, spec) {
  const group = makeLadderAt([-12.1, 0.5, -4.25], Math.PI / 2, 1.15, spec.frontPlatformHeight - 0.6, 22, m);
  group.rotation.z = -3 * DEG;
  return group;
}

function makeSideLadder(m, spec) {
  const group = makeLadderAt([-7.2, 4.85, -5.88], 0, 1.0, spec.frontPlatformHeight - 4.85, 11, m);
  group.rotation.z = -8 * DEG;
  return group;
}

function makeRearLadder(m) {
  return makeLadderAt([11.55, 5.9, 3.8], Math.PI / 2, 0.95, 3.15, 9, m);
}

function makeServiceTanks(m) {
  const group = makeGroup("service_tanks");
  for (const [x, z, radius, depth] of [[-3.1, -3.75, 0.72, 2.25], [-0.85, -3.75, 0.62, 1.75], [-2.8, 3.75, 0.68, 2.1]]) {
    addCylinder(group, radius, depth, [x, 6.75, z], [0, 0, Math.PI / 2], m.steel, 28);
    for (const offset of [-depth * 0.31, depth * 0.31]) addCylinder(group, radius + 0.05, 0.09, [x + offset, 6.75, z], [0, 0, Math.PI / 2], m.steelDark, 28);
  }
  return group;
}

function makeExhaust(m) {
  const group = makeGroup("exhaust");
  for (const z of [3.65, 4.25]) {
    addCylinder(group, 0.26, 3.4, [-4.25, 10.25, z], [0, 0, 0], m.steelDark, 20);
    addCylinder(group, 0.34, 0.6, [-4.25, 12.2, z], [0, 0, 0], m.steelBlack, 20);
  }
  addBox(group, [1.25, 1.65, 1.35], [-4.25, 8.4, 3.95], m.paintDark, [0, 0, 0], 0.12);
  return group;
}

function makeFenders(m, spec) {
  const group = makeGroup("fenders");
  for (const side of spec.sides) {
    spec.axlePositions.forEach((x) => addBox(group, [5.15, 0.2, 0.56], [x, 5.12, side.z], m.paintDark, [0, 0, 0], 0.09));
  }
  return group;
}

function makeToolboxes(m) {
  const group = makeGroup("toolboxes");
  for (const [x, z] of [[-4.6, -3.8], [-4.6, 3.8], [3.8, -3.85], [3.8, 3.85]]) {
    addBox(group, [1.75, 1.0, 0.78], [x, 6.85, z], m.paintDark, [0, 0, 0], 0.08);
    addBox(group, [1.38, 0.05, 0.82], [x, 6.9, z + Math.sign(z) * 0.42], m.steel);
    addBox(group, [0.36, 0.1, 0.08], [x, 6.88, z + Math.sign(z) * 0.48], m.paintLight);
  }
  return group;
}

function makeWarningMarkings(m, spec) {
  const group = makeGroup("warning_markings");
  for (const z of [-5.73, 5.73]) {
    for (let x = -11.2; x <= -4.4; x += 1.12) addBox(group, [0.65, 0.08, 0.05], [x, spec.frontPlatformHeight - 0.25, z], m.warning, [0, 0, 18 * DEG]);
  }
  addBox(group, [0.08, 0.58, 2.6], [-12.25, 3.95, 0], m.warning);
  return group;
}

function createAnchors(anchors, m) {
  const group = makeGroup("anchors");
  anchors.forEach((anchor) => {
    const marker = new THREE.Group();
    marker.name = anchor.id;
    marker.position.fromArray(anchor.position);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 28), m.anchor);
    ring.rotation.x = Math.PI / 2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.52, 8), m.anchor);
    stem.position.y = 0.24;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 7), m.anchor);
    top.position.y = 0.5;
    marker.add(ring, stem, top);
    marker.traverse((child) => { child.userData.helper = true; });
    group.add(marker);
  });
  return group;
}

function makeTent(m) {
  const group = makeGroup("industrial_tent");
  const shape = new THREE.Shape();
  shape.moveTo(-1.55, 0);
  shape.lineTo(0, 1.65);
  shape.lineTo(1.55, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 2.8, bevelEnabled: false });
  geometry.translate(0, 0, -1.4);
  const body = new THREE.Mesh(geometry, m.fabric);
  group.add(body);
  for (const z of [-1.42, 0, 1.42]) {
    cylinderBetween(group, [-1.58, 0.05, z], [0, 1.7, z], 0.04, m.steel, 8);
    cylinderBetween(group, [0, 1.7, z], [1.58, 0.05, z], 0.04, m.steel, 8);
  }
  addBox(group, [0.82, 1.16, 0.03], [0, 0.58, -1.43], m.fabricDark, [0, 0, 0], 0.03);
  return group;
}

function makeCampfire(m) {
  const group = makeGroup("campfire");
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.56, 0.28, 24, 1, true), m.steelDark);
  bowl.position.y = 0.34;
  group.add(bowl);
  for (let index = 0; index < 4; index += 1) {
    const angle = index * Math.PI / 4;
    const log = addCylinder(group, 0.11, 1.12, [0, 0.55, 0], [Math.PI / 2, 0, angle], m.wood, 10);
    log.rotation.z = angle;
  }
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.05, 9), m.flameOuter);
  outer.position.y = 1.05;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.72, 8), m.flameInner);
  inner.position.y = 0.9;
  group.add(outer, inner);
  const light = new THREE.PointLight(0xff8d32, 3.2, 8, 2);
  light.position.y = 1.2;
  group.add(light);
  group.userData.animate = (time) => {
    outer.scale.y = 0.92 + Math.sin(time * 8) * 0.08;
    inner.scale.x = 0.9 + Math.sin(time * 11) * 0.08;
    light.intensity = 2.8 + Math.sin(time * 10) * 0.45;
  };
  return group;
}

function makeCrate(m) {
  const group = makeGroup("crate");
  addBox(group, [2.0, 1.25, 1.4], [0, 0.64, 0], m.paintDark, [0, 0, 0], 0.08);
  for (const x of [-0.91, 0.91]) for (const z of [-0.61, 0.61]) addBox(group, [0.12, 1.3, 0.12], [x, 0.66, z], m.steel);
  addBox(group, [2.08, 0.1, 1.48], [0, 1.3, 0], m.steelDark);
  addBox(group, [0.56, 0.24, 0.08], [0, 0.72, -0.73], m.paintLight, [0, 0, 0], 0.03);
  return group;
}

function makeShelter(m) {
  const group = makeGroup("shelter");
  const width = 4.2;
  const depth = 3.4;
  const height = 2.65;
  for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2]) cylinderBetween(group, [x, 0, z], [x, height, z], 0.07, m.steel, 10);
  for (const z of [-depth / 2, depth / 2]) cylinderBetween(group, [-width / 2, height, z], [width / 2, height, z], 0.075, m.steel, 10);
  for (const x of [-width / 2, width / 2]) cylinderBetween(group, [x, height, -depth / 2], [x, height, depth / 2], 0.075, m.steel, 10);
  addBox(group, [width + 0.28, 0.18, depth + 0.38], [0, height + 0.1, 0], m.paintDark, [0, 0, 0], 0.05);
  addBox(group, [width, height, 0.12], [0, height / 2, depth / 2], m.paintDark);
  addBox(group, [0.12, height, depth], [width / 2, height / 2, 0], m.paintDark);
  return group;
}

function fitImportedObject(object, targetSize) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z) || 1;
  object.scale.multiplyScalar(targetSize / largest);
  const fittedBox = new THREE.Box3().setFromObject(object);
  const center = fittedBox.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= fittedBox.min.y;
}

export function snapshotTransform(object) {
  return {
    position: object.position.toArray(),
    quaternion: object.quaternion.toArray(),
    scale: object.scale.toArray()
  };
}

export function restoreTransform(object, snapshot = object.userData.original) {
  if (!snapshot) return;
  object.position.fromArray(snapshot.position);
  object.quaternion.fromArray(snapshot.quaternion);
  object.scale.fromArray(snapshot.scale);
  object.updateMatrixWorld(true);
}

export function getObjectStats(object) {
  let meshes = 0;
  let triangles = 0;
  object.traverse((child) => {
    if (!child.isMesh && !child.isInstancedMesh) return;
    meshes += child.isInstancedMesh ? child.count : 1;
    const geometry = child.geometry;
    if (!geometry) return;
    const count = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    triangles += Math.round(count * (child.isInstancedMesh ? child.count : 1));
  });
  return { meshes, triangles };
}
