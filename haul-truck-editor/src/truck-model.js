import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const DEG = Math.PI / 180;

export function buildHaulTruck(scene, blueprint) {
  const root = new THREE.Group();
  root.name = "modular_haul_truck";
  scene.add(root);

  const parts = new Map();
  const categoryNames = new Map(blueprint.categories.map((category) => [category.id, category.name]));
  const materials = createMaterials();
  const geometries = createSharedGeometry();
  let addonSequence = 1;

  const registerPart = (id, name, category, object, options = {}) => {
    object = centerPartPivot(object);
    object.name = id;
    object.userData.partId = id;
    object.userData.name = name;
    object.userData.category = category;
    object.userData.categoryName = categoryNames.get(category) || category;
    object.userData.locked = Boolean(options.locked);
    object.userData.removed = false;
    object.userData.historyOrphan = false;
    object.userData.dynamic = Boolean(options.dynamic);
    object.userData.preset = options.preset || null;
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

  registerPart("chassis_frame", "承载车架与横梁", "structure", makeChassis(materials));
  registerPart("underbody_armor", "底部装甲与护板", "structure", makeUnderbody(materials));
  registerPart("engine_power_module", "动力与传动模块", "structure", makePowerModule(materials));
  registerPart("front_service_deck", "前部维护平台", "front", makeFrontDeck(materials));
  registerPart("driver_cab_left", "左侧驾驶室", "front", makeDriverCab(materials));
  registerPart("equipment_room_right", "右侧设备室", "front", makeEquipmentRoom(materials));
  registerPart("upper_platform", "上层工作平台", "front", makeUpperPlatform(materials));
  registerPart("front_bumper", "保险杠与防撞结构", "front", makeFrontBumper(materials));
  registerPart("front_grille", "前部格栅与检修门", "front", makeFrontGrille(materials));
  registerPart("front_lighting", "前灯与警示灯组", "details", makeLighting(materials));

  registerPart("dump_bed", "重载车斗", "dump", makeDumpBed(materials));
  registerPart("dump_front_guard", "车斗前保护板", "dump", makeDumpFrontGuard(materials));
  registerPart("dump_hydraulics", "车斗液压举升系统", "dump", makeDumpHydraulics(materials));

  const axlePositions = [-7.55, 0.9, 3.55, 6.25, 8.85];
  const axleIds = ["front", "middle_01", "middle_02", "rear_01", "rear_02"];
  const axleNames = ["前轮轴", "中轮轴 1", "中轮轴 2", "后轮轴 1", "后轮轴 2"];
  axlePositions.forEach((x, index) => {
    registerPart(`axle_${axleIds[index]}`, axleNames[index], "wheels", makeAxle(x, index, materials));
  });

  const sideDefinitions = [
    { suffix: "left", label: "左", z: -4.04 },
    { suffix: "right", label: "右", z: 4.04 }
  ];
  axlePositions.forEach((x, axleIndex) => {
    sideDefinitions.forEach((side) => {
      const axleLabel = ["前轮", "中轮 1", "中轮 2", "后轮 1", "后轮 2"][axleIndex];
      registerPart(
        `wheel_${axleIds[axleIndex]}_${side.suffix}`,
        `${side.label}侧${axleLabel}`,
        "wheels",
        makeWheel(x, side.z, axleIndex, materials, geometries)
      );
    });
  });

  registerPart("front_railings", "前维护平台栏杆", "access", makeFrontRailings(materials));
  registerPart("upper_railings", "上层平台栏杆", "access", makeUpperRailings(materials));
  registerPart("front_access_ladder", "车头登车梯", "access", makeFrontLadder(materials));
  registerPart("side_access_ladder", "左侧检修梯", "access", makeSideLadder(materials));
  registerPart("rear_access_ladder", "车尾检修梯", "access", makeRearLadder(materials));

  registerPart("fuel_hydraulic_tanks", "燃油与液压罐组", "details", makeTankSet(materials));
  registerPart("exhaust_intake", "排气与进气系统", "details", makeExhaust(materials));
  registerPart("wheel_fenders", "轮区挡泥板", "details", makeFenders(materials));
  registerPart("service_toolboxes", "检修工具箱", "details", makeToolboxes(materials));
  registerPart("warning_markings", "警示标识与反光板", "details", makeWarningMarkings(materials));

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
    return registerPart(
      `${baseId}_copy_${copyIndex}`,
      `${source.userData.name} 副本 ${copyIndex}`,
      source.userData.category,
      clone,
      { dynamic: true, preset: source.userData.preset || "clone" }
    );
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
    getPartFromObject,
    createPreset,
    registerExternal,
    registerPart,
    duplicatePart,
    setWireframe
  };
}

function createMaterials() {
  const paintedTexture = createIndustrialTexture("#8d6a37", "#332d24", "#bc8a43");
  const darkPaintTexture = createIndustrialTexture("#343a36", "#171b19", "#5c5647");
  const floorTexture = createIndustrialTexture("#444541", "#282b29", "#6c6251", 512);
  floorTexture.repeat.set(8, 8);

  return {
    paint: new THREE.MeshStandardMaterial({ map: paintedTexture, color: 0xc39653, roughness: 0.79, metalness: 0.54 }),
    paintDark: new THREE.MeshStandardMaterial({ map: darkPaintTexture, color: 0x59605b, roughness: 0.82, metalness: 0.58 }),
    paintLight: new THREE.MeshStandardMaterial({ color: 0xc4a06a, roughness: 0.76, metalness: 0.5 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x6c716d, roughness: 0.56, metalness: 0.9 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x2f3533, roughness: 0.64, metalness: 0.88 }),
    steelBlack: new THREE.MeshStandardMaterial({ color: 0x171b1a, roughness: 0.68, metalness: 0.72 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x704527, roughness: 0.94, metalness: 0.35 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x171817, roughness: 0.96, metalness: 0.02 }),
    rubberSide: new THREE.MeshStandardMaterial({ color: 0x232421, roughness: 0.92, metalness: 0.02 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x52666a, roughness: 0.18, metalness: 0.08, transmission: 0.28, transparent: true, opacity: 0.78 }),
    glassDark: new THREE.MeshPhysicalMaterial({ color: 0x17282d, roughness: 0.22, metalness: 0.18, transmission: 0.12, transparent: true, opacity: 0.88 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xf2d49b, emissive: 0xffc765, emissiveIntensity: 1.8, roughness: 0.22 }),
    warning: new THREE.MeshStandardMaterial({ color: 0xd86a35, emissive: 0x9c2e12, emissiveIntensity: 0.24, roughness: 0.54 }),
    red: new THREE.MeshStandardMaterial({ color: 0x8b3329, roughness: 0.68, metalness: 0.45 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x606454, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
    fabricDark: new THREE.MeshStandardMaterial({ color: 0x343b34, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5f3722, roughness: 0.94, metalness: 0 }),
    flameOuter: new THREE.MeshBasicMaterial({ color: 0xff8a24, transparent: true, opacity: 0.72, depthWrite: false }),
    flameInner: new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.88, depthWrite: false }),
    anchor: new THREE.MeshBasicMaterial({ color: 0xf3b554, transparent: true, opacity: 0.82, depthTest: false }),
    floor: new THREE.MeshStandardMaterial({ map: floorTexture, color: 0x767570, roughness: 0.93, metalness: 0.12 })
  };
}

function createSharedGeometry() {
  return {
    wheelTread: new THREE.BoxGeometry(0.43, 0.22, 1.44),
    bolt: new THREE.CylinderGeometry(0.075, 0.075, 0.12, 8),
    rivet: new THREE.SphereGeometry(0.055, 8, 5)
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
    const radius = 0.4 + Math.random() * 2.7;
    context.beginPath();
    context.arc(Math.random() * size, Math.random() * size, radius, 0, Math.PI * 2);
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
  const geometry = radius > 0
    ? new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius)
    : new THREE.BoxGeometry(...size);
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
  parent.add(mesh);
  return mesh;
}

function addRivetLine(parent, start, end, count, material, radius = 0.055) {
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
  return rivets;
}

function makeChassis(m) {
  const group = makeGroup("chassis_frame");
  addBox(group, [21.2, 0.58, 0.72], [0.1, 2.02, -2.45], m.steelDark, [0, 0, 0], 0.08);
  addBox(group, [21.2, 0.58, 0.72], [0.1, 2.02, 2.45], m.steelDark, [0, 0, 0], 0.08);
  for (let x = -9.2; x <= 9.2; x += 2.3) addBox(group, [0.38, 0.48, 5.3], [x, 2.02, 0], m.steel);
  addBox(group, [5.8, 0.4, 7.0], [-6.8, 2.43, 0], m.paintDark, [0, 0, 0], 0.08);
  addBox(group, [12.8, 0.3, 6.15], [3.65, 2.43, 0], m.steelDark);
  addBox(group, [1.0, 1.4, 6.6], [9.9, 2.55, 0], m.steelDark, [0, 0, 0], 0.08);
  addRivetLine(group, [-10.1, 2.36, -2.83], [10.1, 2.36, -2.83], 28, m.rust, 0.065);
  addRivetLine(group, [-10.1, 2.36, 2.83], [10.1, 2.36, 2.83], 28, m.rust, 0.065);
  return group;
}

function makeUnderbody(m) {
  const group = makeGroup("underbody_armor");
  addBox(group, [5.3, 0.34, 5.1], [-6.45, 1.35, 0], m.paintDark, [0, 0, 0], 0.1);
  addBox(group, [8.7, 0.3, 4.8], [3.75, 1.35, 0], m.steelDark);
  for (let x = -8.4; x < 8.8; x += 2.2) addBox(group, [0.16, 0.22, 4.95], [x, 1.17, 0], m.rust);
  return group;
}

function makePowerModule(m) {
  const group = makeGroup("engine_power_module");
  addBox(group, [4.5, 2.25, 4.4], [-1.9, 3.25, 0], m.paintDark, [0, 0, 0], 0.18);
  for (let z = -1.45; z <= 1.45; z += 0.29) addBox(group, [2.75, 0.075, 0.075], [-4.18, 3.55, z], m.steelBlack);
  addCylinder(group, 0.68, 3.8, [-0.95, 3.2, 0], [Math.PI / 2, 0, 0], m.steelDark, 20);
  addBox(group, [1.7, 0.5, 3.8], [0.4, 2.9, 0], m.steelDark, [0, 0, 0], 0.08);
  return group;
}

function makeFrontDeck(m) {
  const group = makeGroup("front_service_deck");
  addBox(group, [7.7, 0.34, 8.1], [-6.78, 4.22, 0], m.paint, [0, 0, 0], 0.06);
  addBox(group, [7.7, 0.16, 8.1], [-6.78, 4.43, 0], m.steelDark);
  for (let z = -3.6; z <= 3.6; z += 0.42) addBox(group, [7.35, 0.06, 0.07], [-6.7, 4.53, z], m.steel);
  addBox(group, [1.4, 1.4, 7.4], [-10.1, 3.63, 0], m.paintDark, [0, 0, 0], 0.12);
  addRivetLine(group, [-10.45, 4.38, -3.72], [-3.1, 4.38, -3.72], 18, m.rust);
  addRivetLine(group, [-10.45, 4.38, 3.72], [-3.1, 4.38, 3.72], 18, m.rust);
  return group;
}

function makeDriverCab(m) {
  const group = makeGroup("driver_cab_left");
  addBox(group, [3.25, 2.55, 3.05], [-7.0, 5.82, -1.93], m.paint, [0, 0, 0], 0.16);
  addBox(group, [3.46, 0.18, 3.28], [-7.0, 7.16, -1.93], m.paintDark, [0, 0, 0], 0.08);
  addBox(group, [0.08, 1.42, 2.28], [-8.66, 6.03, -1.93], m.glassDark, [0, 0, -5 * DEG], 0.03);
  addBox(group, [1.52, 1.35, 0.07], [-7.16, 6.04, -3.49], m.glass, [0, 0, 0], 0.03);
  addBox(group, [1.22, 1.35, 0.07], [-5.65, 6.04, -3.49], m.glassDark, [0, 0, 0], 0.03);
  addBox(group, [0.07, 1.24, 2.18], [-5.34, 5.93, -1.93], m.glassDark, [0, 0, 0], 0.03);
  addBox(group, [0.1, 1.75, 1.35], [-8.7, 5.55, -1.94], m.paintDark);
  addBox(group, [0.12, 0.11, 0.5], [-7.35, 5.45, -3.55], m.steel);
  addRivetLine(group, [-8.55, 4.63, -3.51], [-5.48, 4.63, -3.51], 9, m.rust);
  return group;
}

function makeEquipmentRoom(m) {
  const group = makeGroup("equipment_room_right");
  addBox(group, [3.25, 2.55, 3.05], [-7.0, 5.82, 1.93], m.paint, [0, 0, 0], 0.16);
  addBox(group, [3.46, 0.18, 3.28], [-7.0, 7.16, 1.93], m.paintDark, [0, 0, 0], 0.08);
  addBox(group, [0.08, 1.7, 2.4], [-8.66, 5.9, 1.93], m.paintDark, [0, 0, -5 * DEG], 0.03);
  addBox(group, [2.28, 1.65, 0.07], [-6.95, 5.92, 3.49], m.paintDark, [0, 0, 0], 0.03);
  for (let x = -7.95; x <= -5.95; x += 0.22) addBox(group, [0.11, 1.22, 0.08], [x, 5.98, 3.56], m.steelBlack);
  addBox(group, [0.52, 0.78, 0.09], [-8.15, 5.2, 3.57], m.steel);
  addBox(group, [0.52, 0.78, 0.09], [-5.75, 5.2, 3.57], m.steel);
  addRivetLine(group, [-8.55, 4.63, 3.51], [-5.48, 4.63, 3.51], 9, m.rust);
  return group;
}

function makeUpperPlatform(m) {
  const group = makeGroup("upper_platform");
  addBox(group, [6.8, 0.28, 7.2], [-5.55, 7.55, 0], m.paint, [0, 0, 0], 0.05);
  addBox(group, [7.25, 0.14, 7.65], [-5.55, 7.77, 0], m.steelDark);
  for (let x = -8.55; x <= -2.55; x += 0.55) addBox(group, [0.08, 0.08, 7.3], [x, 7.88, 0], m.steel);
  addBox(group, [2.6, 0.58, 5.6], [-2.4, 7.38, 0], m.paintDark, [0, 0, -7 * DEG], 0.09);
  return group;
}

function makeFrontBumper(m) {
  const group = makeGroup("front_bumper");
  addBox(group, [0.8, 1.2, 7.2], [-10.82, 2.72, 0], m.paint, [0, 0, 0], 0.14);
  addBox(group, [0.42, 0.52, 8.0], [-11.34, 2.15, 0], m.steelDark, [0, 0, 0], 0.1);
  addBox(group, [0.55, 0.42, 2.1], [-11.25, 1.7, -2.62], m.steelBlack);
  addBox(group, [0.55, 0.42, 2.1], [-11.25, 1.7, 2.62], m.steelBlack);
  cylinderBetween(group, [-11.62, 1.4, -2.8], [-11.62, 1.4, 2.8], 0.11, m.steel, 16);
  return group;
}

function makeFrontGrille(m) {
  const group = makeGroup("front_grille");
  addBox(group, [0.14, 1.32, 4.4], [-11.24, 3.28, 0], m.steelBlack, [0, 0, 0], 0.04);
  for (let z = -2.0; z <= 2.0; z += 0.27) addBox(group, [0.18, 1.12, 0.08], [-11.35, 3.28, z], m.steel);
  addBox(group, [0.2, 0.13, 4.55], [-11.36, 3.86, 0], m.paintDark);
  addBox(group, [0.2, 0.13, 4.55], [-11.36, 2.7, 0], m.paintDark);
  return group;
}

function makeLighting(m) {
  const group = makeGroup("front_lighting");
  for (const z of [-3.0, -2.35, 2.35, 3.0]) {
    addCylinder(group, 0.24, 0.18, [-11.3, 3.94, z], [0, 0, Math.PI / 2], m.lamp, 24);
    addCylinder(group, 0.34, 0.16, [-11.18, 3.94, z], [0, 0, Math.PI / 2], m.steelDark, 24);
  }
  for (const z of [-3.45, 3.45]) addBox(group, [0.24, 0.26, 0.45], [-8.35, 7.48, z], m.warning, [0, 0, 0], 0.05);
  return group;
}

function makeDumpBed(m) {
  const group = makeGroup("dump_bed");
  group.position.set(2.45, 5.72, 0);
  const profile = new THREE.Shape();
  profile.moveTo(-7.6, 0);
  profile.lineTo(7.55, 0);
  profile.lineTo(7.12, 3.05);
  profile.lineTo(-6.35, 5.0);
  profile.lineTo(-8.15, 4.15);
  profile.closePath();
  const sideGeometry = new THREE.ExtrudeGeometry(profile, { depth: 0.22, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.05, bevelSegments: 2 });
  sideGeometry.translate(0, 0, -0.11);
  const leftSide = new THREE.Mesh(sideGeometry, m.paint);
  leftSide.position.z = -4.0;
  const rightSide = leftSide.clone();
  rightSide.position.z = 4.0;
  group.add(leftSide, rightSide);
  addBox(group, [15.35, 0.46, 7.85], [-0.12, 0.05, 0], m.paintDark, [0, 0, 0], 0.06);
  addBox(group, [14.85, 0.18, 7.4], [-0.05, 0.33, 0], m.steelDark);
  addBox(group, [0.35, 4.3, 8.0], [-7.45, 2.25, 0], m.paint, [0, 0, -8 * DEG], 0.04);
  const ribX = [-6.5, -4.8, -3.1, -1.4, 0.3, 2.0, 3.7, 5.4, 6.8];
  ribX.forEach((x, index) => {
    const y = x < -5 ? 2.4 + (x + 6.5) * 0.22 : Math.max(1.4, 3.45 - (x + 4.8) * 0.13);
    for (const z of [-4.18, 4.18]) addBox(group, [0.22, 3.15, 0.26], [x, y, z], m.paintLight, [0, 0, index < 2 ? -6 * DEG : 3 * DEG], 0.035);
  });
  for (const z of [-4.22, 4.22]) {
    cylinderBetween(group, [-7.9, 4.35, z], [-6.25, 5.23, z], 0.12, m.steel, 14);
    cylinderBetween(group, [-6.25, 5.23, z], [7.28, 3.25, z], 0.12, m.steel, 14);
  }
  addRivetLine(group, [-7.1, 0.34, -4.3], [7.0, 0.34, -4.3], 30, m.rust, 0.07);
  addRivetLine(group, [-7.1, 0.34, 4.3], [7.0, 0.34, 4.3], 30, m.rust, 0.07);
  return group;
}

function makeDumpFrontGuard(m) {
  const group = makeGroup("dump_front_guard");
  addBox(group, [3.7, 0.35, 9.0], [-4.18, 9.32, 0], m.paint, [0, 0, -12 * DEG], 0.06);
  for (let z = -4.1; z <= 4.1; z += 0.62) addBox(group, [3.4, 0.13, 0.12], [-4.18, 9.12, z], m.steelDark, [0, 0, -12 * DEG]);
  cylinderBetween(group, [-5.9, 8.6, -4.1], [-2.55, 9.95, -4.1], 0.12, m.steel);
  cylinderBetween(group, [-5.9, 8.6, 4.1], [-2.55, 9.95, 4.1], 0.12, m.steel);
  return group;
}

function makeDumpHydraulics(m) {
  const group = makeGroup("dump_hydraulics");
  for (const z of [-1.65, 1.65]) {
    cylinderBetween(group, [-0.6, 2.6, z], [-2.6, 6.8, z], 0.31, m.steelDark, 24);
    cylinderBetween(group, [-2.55, 6.75, z], [-3.0, 7.62, z], 0.21, m.steel, 24);
    addCylinder(group, 0.44, 0.72, [-0.55, 2.55, z], [Math.PI / 2, 0, 0], m.paintDark, 20);
  }
  cylinderBetween(group, [-1.15, 2.55, -2.4], [-1.15, 2.55, 2.4], 0.2, m.steelDark, 20);
  return group;
}

function makeAxle(x, index, m) {
  const group = makeGroup(`axle_${index}`);
  cylinderBetween(group, [x, 2.18, -4.2], [x, 2.18, 4.2], index === 0 ? 0.38 : 0.46, m.steelDark, 24);
  addCylinder(group, 0.72, 1.2, [x, 2.18, 0], [Math.PI / 2, 0, 0], m.steelBlack, 24);
  for (const z of [-2.0, 2.0]) {
    cylinderBetween(group, [x - 0.8, 2.55, z], [x + 0.85, 2.1, z], 0.17, m.steel, 16);
    cylinderBetween(group, [x - 0.7, 1.85, z], [x + 0.75, 2.52, z], 0.13, m.steelDark, 16);
  }
  if (index > 0) {
    for (const z of [-2.45, 2.45]) addCylinder(group, 0.34, 1.05, [x, 3.05, z], [0, 0, 0], m.steel, 18);
  }
  return group;
}

function makeWheel(x, z, axleIndex, m, shared) {
  const group = makeGroup("wheel");
  group.position.set(x, 2.25, z);
  const width = axleIndex === 0 ? 1.34 : 1.5;
  const radius = axleIndex === 0 ? 2.28 : 2.35;
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 56, 2), m.rubber);
  tire.rotation.x = Math.PI / 2;
  group.add(tire);
  const treadCount = 34;
  const treads = new THREE.InstancedMesh(shared.wheelTread, m.rubberSide, treadCount);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < treadCount; index += 1) {
    const angle = (index / treadCount) * Math.PI * 2;
    dummy.position.set(Math.cos(angle) * (radius + 0.1), Math.sin(angle) * (radius + 0.1), 0);
    dummy.rotation.set(0, (index % 2 ? 12 : -12) * DEG, angle + Math.PI / 2);
    dummy.scale.set(axleIndex === 0 ? 0.92 : 1, 1, width / 1.44 + 0.07);
    dummy.updateMatrix();
    treads.setMatrixAt(index, dummy.matrix);
  }
  treads.castShadow = true;
  group.add(treads);
  for (const side of [-1, 1]) {
    const sidewall = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.72, radius * 0.24, 12, 48), m.rubberSide);
    sidewall.position.z = side * (width / 2 + 0.025);
    group.add(sidewall);
  }
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.16, width + 0.12, 40), m.paintLight);
  rim.rotation.x = Math.PI / 2;
  group.add(rim);
  const rimInset = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 1.03, width + 0.2, 32), m.steelDark);
  rimInset.rotation.x = Math.PI / 2;
  group.add(rimInset);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.55, width + 0.33, 24), m.steel);
  hub.rotation.x = Math.PI / 2;
  group.add(hub);
  const bolts = new THREE.InstancedMesh(shared.bolt, m.steel, 12);
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    dummy.position.set(Math.cos(angle) * 0.69, Math.sin(angle) * 0.69, z < 0 ? -(width / 2 + 0.16) : width / 2 + 0.16);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.updateMatrix();
    bolts.setMatrixAt(index, dummy.matrix);
  }
  bolts.castShadow = true;
  group.add(bolts);
  return group;
}

function addRailRun(group, points, height, m) {
  const bottomY = points[0][1];
  points.forEach((point) => cylinderBetween(group, point, [point[0], point[1] + height, point[2]], 0.055, m.steel, 10));
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    cylinderBetween(group, [a[0], bottomY + height, a[2]], [b[0], bottomY + height, b[2]], 0.06, m.steel, 10);
    cylinderBetween(group, [a[0], bottomY + height * 0.55, a[2]], [b[0], bottomY + height * 0.55, b[2]], 0.045, m.steel, 10);
  }
}

function makeFrontRailings(m) {
  const group = makeGroup("front_railings");
  addRailRun(group, [[-10.35, 4.48, -3.72], [-8.9, 4.48, -3.72], [-7.2, 4.48, -3.72], [-5.4, 4.48, -3.72], [-3.25, 4.48, -3.72]], 1.05, m);
  addRailRun(group, [[-10.35, 4.48, 3.72], [-8.9, 4.48, 3.72], [-7.2, 4.48, 3.72], [-5.4, 4.48, 3.72], [-3.25, 4.48, 3.72]], 1.05, m);
  addRailRun(group, [[-10.35, 4.48, -3.72], [-10.35, 4.48, -1.2], [-10.35, 4.48, 1.2], [-10.35, 4.48, 3.72]], 1.05, m);
  return group;
}

function makeUpperRailings(m) {
  const group = makeGroup("upper_railings");
  addRailRun(group, [[-8.9, 7.9, -3.52], [-7.0, 7.9, -3.52], [-5.0, 7.9, -3.52], [-2.35, 7.9, -3.52]], 0.9, m);
  addRailRun(group, [[-8.9, 7.9, 3.52], [-7.0, 7.9, 3.52], [-5.0, 7.9, 3.52], [-2.35, 7.9, 3.52]], 0.9, m);
  addRailRun(group, [[-8.9, 7.9, -3.52], [-8.9, 7.9, -1.1], [-8.9, 7.9, 1.1], [-8.9, 7.9, 3.52]], 0.9, m);
  return group;
}

function makeLadderAt(position, rotationY, width, height, steps, m) {
  const group = makeGroup("ladder");
  cylinderBetween(group, [-width / 2, 0, 0], [-width / 2, height, 0], 0.065, m.steel, 10);
  cylinderBetween(group, [width / 2, 0, 0], [width / 2, height, 0], 0.065, m.steel, 10);
  for (let index = 0; index <= steps; index += 1) {
    const y = (index / steps) * height;
    cylinderBetween(group, [-width / 2, y, 0], [width / 2, y, 0], 0.055, m.steel, 10);
  }
  group.position.fromArray(position);
  group.rotation.y = rotationY;
  return group;
}

function makeFrontLadder(m) {
  const group = makeLadderAt([-11.42, 0.36, -2.55], Math.PI / 2, 1.1, 3.8, 9, m);
  group.rotation.z = -4 * DEG;
  return group;
}

function makeSideLadder(m) {
  const group = makeLadderAt([-4.1, 2.0, -4.28], 0, 0.92, 2.55, 7, m);
  group.rotation.z = -10 * DEG;
  return group;
}

function makeRearLadder(m) {
  const group = makeLadderAt([10.58, 2.1, 3.18], Math.PI / 2, 0.85, 4.0, 10, m);
  return group;
}

function makeTankSet(m) {
  const group = makeGroup("fuel_hydraulic_tanks");
  for (const [x, z, radius, depth] of [[-2.2, -3.0, 0.72, 2.3], [-0.45, -3.0, 0.62, 1.8], [-2.0, 3.0, 0.66, 2.1]]) {
    addCylinder(group, radius, depth, [x, 3.25, z], [0, 0, Math.PI / 2], m.steel, 28);
    for (const offset of [-depth * 0.31, depth * 0.31]) addCylinder(group, radius + 0.05, 0.09, [x + offset, 3.25, z], [0, 0, Math.PI / 2], m.steelDark, 28);
  }
  return group;
}

function makeExhaust(m) {
  const group = makeGroup("exhaust_intake");
  for (const z of [2.45, 3.1]) {
    addCylinder(group, 0.25, 3.1, [-3.25, 6.72, z], [0, 0, 0], m.steelDark, 20);
    addCylinder(group, 0.33, 0.58, [-3.25, 8.46, z], [0, 0, 0], m.steelBlack, 20);
  }
  addBox(group, [1.2, 1.55, 1.25], [-3.25, 5.05, 2.75], m.paintDark, [0, 0, 0], 0.12);
  return group;
}

function makeFenders(m) {
  const group = makeGroup("wheel_fenders");
  for (const z of [-3.74, 3.74]) {
    addBox(group, [5.45, 0.22, 0.62], [5.75, 4.75, z], m.paintDark, [0, 0, 0], 0.08);
    addBox(group, [3.4, 0.18, 0.58], [-7.55, 4.62, z], m.paint, [0, 0, 0], 0.08);
  }
  return group;
}

function makeToolboxes(m) {
  const group = makeGroup("service_toolboxes");
  for (const [x, z] of [[-3.55, -3.0], [-3.55, 3.0], [1.5, -3.05], [1.5, 3.05]]) {
    addBox(group, [1.6, 0.92, 0.72], [x, 3.25, z], m.paintDark, [0, 0, 0], 0.08);
    addBox(group, [1.26, 0.05, 0.76], [x, 3.3, z + Math.sign(z) * 0.39], m.steel);
    addBox(group, [0.34, 0.1, 0.08], [x, 3.28, z + Math.sign(z) * 0.45], m.paintLight);
  }
  return group;
}

function makeWarningMarkings(m) {
  const group = makeGroup("warning_markings");
  for (const z of [-4.12, 4.12]) {
    for (let x = -10.0; x <= -3.8; x += 1.1) addBox(group, [0.62, 0.08, 0.05], [x, 4.36, z], m.warning, [0, 0, 18 * DEG]);
  }
  addBox(group, [0.08, 0.48, 2.2], [-11.45, 2.5, 0], m.warning);
  return group;
}

function createAnchors(anchors, m) {
  const group = makeGroup("anchors");
  anchors.forEach((anchor) => {
    const marker = new THREE.Group();
    marker.name = anchor.id;
    marker.position.fromArray(anchor.position);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 28), m.anchor);
    ring.rotation.x = Math.PI / 2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.48, 8), m.anchor);
    stem.position.y = 0.22;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 7), m.anchor);
    top.position.y = 0.46;
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
  const bodyGeometry = new THREE.ExtrudeGeometry(shape, { depth: 2.8, bevelEnabled: false });
  bodyGeometry.translate(0, 0, -1.4);
  const body = new THREE.Mesh(bodyGeometry, m.fabric);
  body.castShadow = true;
  group.add(body);
  for (const z of [-1.42, 0, 1.42]) {
    cylinderBetween(group, [-1.58, 0.05, z], [0, 1.7, z], 0.035, m.steel, 8);
    cylinderBetween(group, [0, 1.7, z], [1.58, 0.05, z], 0.035, m.steel, 8);
  }
  addBox(group, [0.82, 1.16, 0.03], [0, 0.58, -1.43], m.fabricDark, [0, 0, 0], 0.03);
  return group;
}

function makeCampfire(m) {
  const group = makeGroup("campfire_stove");
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
  light.castShadow = false;
  group.add(light);
  group.userData.animate = (time) => {
    outer.scale.y = 0.92 + Math.sin(time * 8) * 0.08;
    inner.scale.x = 0.9 + Math.sin(time * 11) * 0.08;
    light.intensity = 2.8 + Math.sin(time * 10) * 0.45;
  };
  return group;
}

function makeCrate(m) {
  const group = makeGroup("storage_crate");
  addBox(group, [2.0, 1.25, 1.4], [0, 0.64, 0], m.paintDark, [0, 0, 0], 0.08);
  for (const x of [-0.91, 0.91]) for (const z of [-0.61, 0.61]) addBox(group, [0.12, 1.3, 0.12], [x, 0.66, z], m.steel);
  addBox(group, [2.08, 0.1, 1.48], [0, 1.3, 0], m.steelDark);
  addBox(group, [0.56, 0.24, 0.08], [0, 0.72, -0.73], m.paintLight, [0, 0, 0], 0.03);
  return group;
}

function makeShelter(m) {
  const group = makeGroup("living_shelter");
  const width = 4.2;
  const depth = 3.4;
  const height = 2.65;
  for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2]) cylinderBetween(group, [x, 0, z], [x, height, z], 0.065, m.steel, 10);
  for (const z of [-depth / 2, depth / 2]) cylinderBetween(group, [-width / 2, height, z], [width / 2, height, z], 0.07, m.steel, 10);
  for (const x of [-width / 2, width / 2]) cylinderBetween(group, [x, height, -depth / 2], [x, height, depth / 2], 0.07, m.steel, 10);
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
    const triangleCount = geometry.index ? geometry.index.count / 3 : geometry.attributes.position?.count / 3 || 0;
    triangles += triangleCount * (child.isInstancedMesh ? child.count : 1);
  });
  return { meshes, triangles: Math.round(triangles) };
}
