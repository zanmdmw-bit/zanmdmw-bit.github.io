import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const SOURCE_MODEL_PART_URLS = Object.entries(import.meta.glob(
  "../source-assets/models/parts/liebherr-t284.part-*",
  { eager: true, query: "?url", import: "default" }
))
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([, url]) => url);
const TARGET_WHEEL_DIAMETER = 4.9;

const SOURCE_PARTS = new Map([
  ["metarig papa_129", ["scale_reference_worker", "人物比例参考（约 2.0 米）", "reference", "源模型自带成年人，用于判断栏杆、平台、舱室与轮组的真实尺度。"]],
  ["tire 59/80 r63 michelin002_1", ["source_tire_assembly", "原型六轮轮胎总成", "wheels", "源素材把六条轮胎合并在同一组网格中；下一阶段将按空间区域切分为独立轮组。"]],
  ["rim t287_2", ["source_rim_assembly", "原型六轮轮毂总成", "wheels", "原始 T284 轮毂总成。"]],
  ["64_3", ["front_wheel_support", "前轮转向与支撑总成", "wheels"]],
  ["Object003_4", ["rear_axle_housing", "后轮轴壳", "wheels"]],
  ["Object006_5", ["rear_drive_housing", "后轮驱动壳体", "wheels"]],
  ["axxle_6", ["rear_axle_detail", "后轴机械细节", "wheels"]],
  ["Object007_7", ["rear_axle_fasteners", "后轴紧固件", "wheels"]],
  ["REDUCTORES_8", ["rear_reduction_gears", "后轮减速器总成", "wheels"]],
  ["tanbor_9", ["front_wheel_hubs", "前轮轮毂总成", "wheels"]],
  ["barra frontal_10", ["front_crossmember", "前部承载横梁", "structure"]],
  ["ca1_11", ["front_body_shell", "车头主体外壳", "front"]],
  ["65_12", ["front_service_panel", "车头检修面板", "front"]],
  ["parrilla_13", ["front_grille_mesh", "车头主格栅", "front"]],
  ["066_14", ["front_outer_shell", "前部外壳结构", "front"]],
  ["006_15", ["front_inner_shell", "前部内衬结构", "front"]],
  ["Object002_18", ["main_chassis", "主承载车架", "structure"]],
  ["barrera_19", ["front_platform_rail", "前维护平台栏杆", "access"]],
  ["base plataforma _20", ["front_platform_base", "前维护平台底座", "front"]],
  ["pltf 1_21", ["front_platform_floor", "前维护平台踏板", "front"]],
  ["air filter001_22", ["air_filter_bank", "空气滤清器组", "details"]],
  ["pipe line air_23", ["air_pipework", "进气管路", "details"]],
  ["soporte001_24", ["air_system_brackets", "进气系统支架", "details"]],
  ["AC case_25", ["air_conditioning_unit", "空调设备箱", "front"]],
  ["case fram_28", ["equipment_room_frame", "设备室框架", "front"]],
  ["case bx_29", ["equipment_room_shell", "设备室箱体", "front"]],
  ["parrilla001_30", ["equipment_room_vent", "设备室通风格栅", "front"]],
  ["case door_31", ["equipment_room_door", "设备室检修门", "front"]],
  ["jalador_32", ["equipment_room_handle", "设备室门把手", "details"]],
  ["bisagras_33", ["equipment_room_hinges", "设备室门铰链", "details"]],
  ["case tornill_34", ["equipment_room_fasteners", "设备室紧固件", "details"]],
  ["cab ss_35", ["driver_cab_shell", "驾驶室外壳", "front"]],
  ["cab gls_36", ["driver_cab_glass", "驾驶室玻璃", "front"]],
  ["buket frame_37", ["dump_bed_frame", "货斗承载框架", "dump"]],
  ["buket body_38", ["dump_bed_body", "货斗本体", "dump", "原型 T284 倾斜自卸货斗。"]],
  ["fuel tank_41", ["fuel_tank", "燃料箱总成", "structure"]],
  ["pasos 03_45", ["front_access_steps", "前部登车踏步", "access"]],
  ["baranada 2_46", ["front_access_guard", "登车踏步护栏", "access"]],
  ["base silindro_47", ["dump_cylinder_base", "货斗举升缸底座", "dump"]],
  ["silindro _48", ["dump_cylinder", "货斗液压举升缸", "dump"]],
  ["retro eje _56", ["mirror_supports", "后视镜支架", "details"]],
  ["retro visor _57", ["mirror_housings", "后视镜外壳", "details"]],
  ["retro espejo_58", ["mirror_glass", "后视镜镜片", "details"]],
  ["bass_59", ["lower_body_base", "车体底部基座", "structure"]],
  ["rfct tr_60", ["body_reflectors", "车身反光标识", "details"]],
  ["camr_61", ["camera_mounts", "车载摄像头支架", "details"]],
  ["camr vdro_62", ["camera_glass", "车载摄像头玻璃", "details"]],
  ["barra001_63", ["rear_body_crossmember", "后部承载横梁", "structure"]],
  ["radiator_65", ["radiator_core", "散热器芯体", "details"]],
  ["parrilla.001_66", ["radiator_grille", "散热器格栅", "details"]]
]);
const SOURCE_PART_LOOKUP = new Map(
  [...SOURCE_PARTS.entries()].map(([name, definition]) => [normalizedSourceKey(name), definition])
);

export async function buildHaulTruck(scene, blueprint) {
  const root = new THREE.Group();
  root.name = "liebherr_t284_source_editor";
  root.userData.units = "meter";
  root.userData.source = "Sketchfab / gelber / CC BY 4.0";
  scene.add(root);

  const categoryNames = new Map(blueprint.categories.map((category) => [category.id, category.name]));
  const materials = createEditorMaterials();
  const parts = new Map();
  let addonSequence = 1;

  const registerPart = (id, name, category, object, options = {}) => {
    let safeId = id;
    let collisionIndex = 2;
    while (parts.has(safeId)) {
      safeId = id + "_" + collisionIndex;
      collisionIndex += 1;
    }
    object.name = safeId;
    Object.assign(object.userData, {
      partId: safeId,
      name,
      category,
      categoryName: categoryNames.get(category) || category,
      locked: Boolean(options.locked),
      removed: false,
      historyOrphan: false,
      dynamic: Boolean(options.dynamic),
      preset: options.preset || null,
      specification: options.specification || null,
      sourceName: options.sourceName || null
    });
    object.userData.original = snapshotTransform(object);
    object.traverse((child) => {
      child.userData.partId = safeId;
      if (child.isMesh || child.isSkinnedMesh) {
        child.castShadow = options.castShadow !== false;
        child.receiveShadow = options.receiveShadow !== false;
      }
    });
    if (object.parent !== root) root.add(object);
    parts.set(safeId, object);
    return object;
  };

  const loader = new GLTFLoader();
  const sourceBuffers = await Promise.all(SOURCE_MODEL_PART_URLS.map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`模型分块载入失败：${response.status} ${url}`);
    return response.arrayBuffer();
  }));
  const sourceObjectUrl = URL.createObjectURL(new Blob(sourceBuffers, { type: "model/gltf-binary" }));
  let gltf;
  try {
    gltf = await loader.loadAsync(sourceObjectUrl);
  } finally {
    URL.revokeObjectURL(sourceObjectUrl);
  }
  const alignment = new THREE.Group();
  alignment.name = "source_alignment";
  alignment.add(gltf.scene);
  root.add(alignment);

  const semanticRoot = gltf.scene.getObjectByName("GLTF_SceneRootNode") || gltf.scene;
  const excludedNames = new Set(["Plane_75", "Armature_100", "metarig mama_158", "Armature bluey_175"].map(normalizedSourceKey));
  for (const child of [...semanticRoot.children]) {
    if (excludedNames.has(normalizedSourceKey(child.name))) child.removeFromParent();
  }

  gltf.scene.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const materialList = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materialList) {
      if (!material) continue;
      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
        material.map.anisotropy = 8;
      }
    }
  });

  alignment.updateMatrixWorld(true);
  const tireNode = semanticRoot.getObjectByName("tire 59/80 r63 michelin002_1");
  const tireSize = tireNode
    ? new THREE.Box3().setFromObject(tireNode).getSize(new THREE.Vector3())
    : new THREE.Vector3(1, TARGET_WHEEL_DIAMETER, 1);
  const sourceWheelDiameter = tireSize.y || TARGET_WHEEL_DIAMETER;
  alignment.scale.setScalar(TARGET_WHEEL_DIAMETER / sourceWheelDiameter);
  alignment.rotation.y = -Math.PI / 2;
  alignment.updateMatrixWorld(true);

  const alignedBox = new THREE.Box3().setFromObject(alignment);
  const alignedCenter = alignedBox.getCenter(new THREE.Vector3());
  alignment.position.set(-alignedCenter.x, -alignedBox.min.y, -alignedCenter.z);
  alignment.updateMatrixWorld(true);

  const sourceNodes = [...semanticRoot.children].filter((object) => hasRenderableMesh(object));
  sourceNodes.forEach((object, index) => {
    const definition = SOURCE_PART_LOOKUP.get(normalizedSourceKey(object.name));
    const fallbackId = "source_part_" + String(index + 1).padStart(2, "0");
    const id = definition?.[0] || fallbackId;
    const name = definition?.[1] || readableSourceName(object.name, index);
    const category = definition?.[2] || classifySourcePart(object.name);
    const specification = definition?.[3] || "来自 Liebherr T284 源模型的独立网格组，可隐藏、拆除、移动、旋转、缩放和恢复。";
    const pivot = createWorldCenteredPivot(root, object);
    registerPart(id, name, category, pivot, {
      specification,
      sourceName: object.name
    });
  });
  root.remove(alignment);

  createReferenceConversion(registerPart, materials, blueprint.referenceConversion?.parts || []);

  const anchors = createSourceAnchors();
  const anchorGroup = createAnchors(anchors, materials);
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
    const anchor = anchors.find((item) => item.id === anchorId) || anchors[0];
    const definitions = {
      tent: ["工业帐篷", makeTent],
      campfire: ["篝火炉", makeCampfire],
      crate: ["储物箱", makeCrate],
      shelter: ["铁棚生活区", makeShelter]
    };
    const definition = definitions[preset] || definitions.crate;
    const object = definition[1](materials);
    object.position.fromArray(anchor.position);
    object.rotation.set(...anchor.rotation);
    const sequence = addonSequence++;
    return registerPart(
      "addon_" + preset + "_" + String(sequence).padStart(2, "0"),
      definition[0] + " " + sequence,
      "addons",
      object,
      { dynamic: true, preset }
    );
  };

  const registerExternal = (object, name = "导入部件") => {
    fitImportedObject(object, 3.2);
    object.position.fromArray(anchors.find((item) => item.id === "front_deck_center").position);
    const sequence = addonSequence++;
    return registerPart(
      "addon_imported_" + String(sequence).padStart(2, "0"),
      name + " " + sequence,
      "addons",
      object,
      { dynamic: true, preset: "external" }
    );
  };

  const duplicatePart = (source) => {
    const clone = source.clone(true);
    clone.position.x += 0.7;
    clone.position.z += 0.7;
    const baseId = source.userData.partId.replace(/_copy_\d+$/, "");
    let copyIndex = 1;
    while (parts.has(baseId + "_copy_" + copyIndex)) copyIndex += 1;
    return registerPart(
      baseId + "_copy_" + copyIndex,
      source.userData.name + " 副本 " + copyIndex,
      source.userData.category,
      clone,
      {
        dynamic: true,
        preset: source.userData.preset || "clone",
        specification: source.userData.specification,
        sourceName: source.userData.sourceName
      }
    );
  };

  const setWireframe = (enabled) => {
    const changed = new Set();
    parts.forEach((part) => {
      part.traverse((child) => {
        if (!child.isMesh && !child.isSkinnedMesh) return;
        const materialList = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materialList) {
          if (!material || material.transparent || changed.has(material)) continue;
          material.wireframe = enabled;
          material.needsUpdate = true;
          changed.add(material);
        }
      });
    });
  };

  const modelBox = new THREE.Box3().setFromObject(root);
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const spec = {
    ...blueprint.dimensionsMeters,
    sourceEnvelope: {
      length: modelSize.x,
      height: modelSize.y,
      width: modelSize.z
    },
    sourceWheelDiameter,
    sourceModel: "Liebherr T284"
  };
  root.userData.spec = spec;

  return {
    root,
    parts,
    materials,
    anchors,
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

function hasRenderableMesh(object) {
  let found = false;
  object.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) found = true;
  });
  return found;
}

function normalizedSourceKey(value) {
  return value
    .replace(/[._\s]+\d+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function createWorldCenteredPivot(root, object) {
  root.updateMatrixWorld(true);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const pivot = new THREE.Group();
  pivot.position.copy(root.worldToLocal(center.clone()));
  root.add(pivot);
  pivot.attach(object);
  return pivot;
}

function classifySourcePart(name) {
  const value = name.toLowerCase();
  if (/armature|metarig|worker|person/.test(value)) return "reference";
  if (/tire|rim|axxle|reductor|tanbor|wheel/.test(value)) return "wheels";
  if (/buket|silindro|ansul|tuerca/.test(value)) return "dump";
  if (/plataforma|pltf|barrera|pasos|baranada/.test(value)) return "access";
  if (/cab|case|parrilla|radiator/.test(value)) return "front";
  if (/bass|barra|frame|tank/.test(value)) return "structure";
  return "details";
}

function readableSourceName(sourceName, index) {
  const cleaned = sourceName
    .replace(/[_\.]+/g, " ")
    .replace(/\s+\d+$/, "")
    .trim();
  return "源模型部件 " + String(index + 1).padStart(2, "0") + " · " + cleaned;
}

function createSourceAnchors() {
  return [
    { id: "front_deck_left", name: "原型前平台 · 驾驶室侧", position: [-3.8, 6.35, 3.6], rotation: [0, 0, 0] },
    { id: "front_deck_center", name: "原型前平台 · 中央", position: [-3.8, 6.35, 0], rotation: [0, 0, 0] },
    { id: "front_deck_right", name: "原型前平台 · 设备侧", position: [-3.8, 6.35, -3.6], rotation: [0, 0, 0] },
    { id: "upper_platform", name: "原型车头上层平台", position: [-3.7, 8.25, 0], rotation: [0, 0, 0] },
    { id: "dump_front", name: "原型货斗 · 前部", position: [0.3, 9.2, 0], rotation: [0, 0, 0] },
    { id: "dump_center", name: "原型货斗 · 中央", position: [3.0, 8.8, 0], rotation: [0, 0, 0] },
    { id: "rear_frame", name: "原型车尾承载区", position: [6.0, 5.2, 0], rotation: [0, 0, 0] }
  ];
}

function createEditorMaterials() {
  return {
    floor: new THREE.MeshStandardMaterial({ color: 0xb9b8b0, roughness: 0.94, metalness: 0.04 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x646c69, roughness: 0.52, metalness: 0.9 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x2e3533, roughness: 0.62, metalness: 0.88 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xa97738, roughness: 0.76, metalness: 0.56 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x5c6b58, roughness: 0.96, metalness: 0.02, side: THREE.DoubleSide }),
    fabricDark: new THREE.MeshStandardMaterial({ color: 0x28352b, roughness: 0.98, metalness: 0.02, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a311d, roughness: 0.9, metalness: 0.02 }),
    flameOuter: new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.82 }),
    flameInner: new THREE.MeshBasicMaterial({ color: 0xffd45c, transparent: true, opacity: 0.9 }),
    anchor: new THREE.MeshBasicMaterial({ color: 0xf4b454, transparent: true, opacity: 0.86 }),
    referencePaint: new THREE.MeshStandardMaterial({ color: 0x9a7449, roughness: 0.82, metalness: 0.58 }),
    referencePaintDark: new THREE.MeshStandardMaterial({ color: 0x5d4934, roughness: 0.9, metalness: 0.5 }),
    referenceRust: new THREE.MeshStandardMaterial({ color: 0x674027, roughness: 0.96, metalness: 0.34 }),
    referenceGlass: new THREE.MeshStandardMaterial({ color: 0x182528, roughness: 0.22, metalness: 0.18, transparent: true, opacity: 0.84 }),
    referenceGrille: new THREE.MeshStandardMaterial({ color: 0x171b1a, roughness: 0.7, metalness: 0.82 }),
    referenceLight: new THREE.MeshStandardMaterial({ color: 0xf2e5be, emissive: 0xe0c17d, emissiveIntensity: 1.6, roughness: 0.28, metalness: 0.12 }),
    referenceInner: new THREE.MeshStandardMaterial({ color: 0x373a35, roughness: 0.94, metalness: 0.48, side: THREE.DoubleSide })
  };
}

function createReferenceConversion(registerPart, materials, configuredParts) {
  const factories = {
    frontDeck: [makeReferenceFrontDeck, "以源模型轮径为基准扩宽、加厚的环绕式前维护甲板。"],
    driverCab: [(value) => makeReferenceCab(value, false), "站在车头向外看时位于左侧；独立舱体、玻璃、框架和顶盖。"],
    equipmentRoom: [(value) => makeReferenceCab(value, true), "站在车头向外看时位于右侧；外形与驾驶室呼应，但正面采用检修门和通风格栅。"],
    upperCanopy: [makeReferenceUpperCanopy, "跨越双舱并向货斗前端延伸的大型斜甲板，保持源模型整体尺度。"],
    dumpWallLeft: [(value) => makeReferenceDumpWall(value, 1), "加长、加深并带密集竖向加强筋的独立货斗侧壁。"],
    dumpWallRight: [(value) => makeReferenceDumpWall(value, -1), "与左侧分离，可独立隐藏、移动、缩放或拆除。"],
    frontArmor: [makeReferenceFrontArmor, "宽体装甲前脸、中央格栅、四组前灯和厚重保险杠。"],
    railings: [makeReferenceRailings, "围绕前维护甲板和上层斜甲板布置的双层工业栏杆。"],
    accessLadder: [makeReferenceLadder, "从地面通往前维护甲板的独立重型直梯。"]
  };

  for (const part of configuredParts) {
    const definition = factories[part.factory];
    if (!definition) continue;
    const object = definition[0](materials);
    object.position.fromArray(part.position || [0, 0, 0]);
    object.rotation.set(...(part.rotation || [0, 0, 0]));
    object.scale.fromArray(part.scale || [1, 1, 1]);
    object.visible = part.visible !== false;
    registerPart(part.id, part.name, part.category, object, {
      dynamic: true,
      locked: Boolean(part.locked),
      preset: "reference-conversion",
      specification: part.specification || definition[1]
    });
  }
}

function makeReferenceFrontDeck(materials) {
  const group = new THREE.Group();
  addBox(group, [5.9, 0.26, 10.7], [0, 0.13, 0], materials.referencePaintDark);
  addBox(group, [0.42, 0.62, 10.95], [-2.82, -0.02, 0], materials.referencePaint);
  addBox(group, [5.55, 0.12, 0.24], [0.08, 0.31, 5.25], materials.steel);
  addBox(group, [5.55, 0.12, 0.24], [0.08, 0.31, -5.25], materials.steel);
  for (let x = -2.35; x <= 2.35; x += 0.78) {
    addBox(group, [0.08, 0.08, 10.15], [x, 0.31, 0], materials.steelDark);
  }
  addRivetRows(group, materials, [-2.72, 2.72], 5.05, 0.36, 13);
  return group;
}

function makeReferenceCab(materials, equipmentRoom) {
  const group = new THREE.Group();
  addBox(group, [2.75, 0.34, 3.35], [0, 0.17, 0], materials.referencePaintDark);
  addBox(group, [2.5, 1.9, 3.08], [0.12, 1.22, 0], materials.referencePaint);
  addBox(group, [2.9, 0.2, 3.48], [0.05, 2.27, 0], materials.referencePaintDark);

  if (equipmentRoom) {
    addBox(group, [0.06, 1.28, 2.34], [-1.16, 1.3, 0], materials.referenceGrille);
    for (let z = -0.98; z <= 0.98; z += 0.24) {
      addBox(group, [0.08, 1.08, 0.055], [-1.205, 1.3, z], materials.steel);
    }
    addBox(group, [1.45, 1.3, 0.06], [0.32, 1.25, -1.57], materials.referencePaintDark);
    addBox(group, [0.08, 0.08, 0.28], [0.95, 1.35, -1.62], materials.steel);
  } else {
    addBox(group, [0.06, 1.1, 2.42], [-1.16, 1.45, 0], materials.referenceGlass);
    addBox(group, [1.45, 1.08, 0.055], [-0.2, 1.45, 1.57], materials.referenceGlass);
    addBox(group, [1.45, 1.08, 0.055], [-0.2, 1.45, -1.57], materials.referenceGlass);
    addBox(group, [0.1, 1.38, 0.12], [-1.2, 1.43, 0], materials.steelDark);
    addBox(group, [0.1, 0.12, 2.55], [-1.2, 1.98, 0], materials.steelDark);
    addBox(group, [0.1, 0.12, 2.55], [-1.2, 0.91, 0], materials.steelDark);
  }

  for (const z of [-1.52, 1.52]) {
    addBox(group, [2.2, 0.12, 0.09], [0, 0.68, z], materials.referenceRust);
    addBox(group, [0.11, 1.65, 0.09], [1.14, 1.33, z], materials.referenceRust);
  }
  addRivetRows(group, materials, [-1.17, 1.17], 1.48, 0.62, 7, true);
  return group;
}

function makeReferenceUpperCanopy(materials) {
  const group = new THREE.Group();
  addBox(group, [7.5, 0.3, 10.95], [0, 0, 0], materials.referencePaint);
  addBox(group, [7.62, 0.16, 0.26], [0, 0.2, 5.32], materials.referencePaintDark);
  addBox(group, [7.62, 0.16, 0.26], [0, 0.2, -5.32], materials.referencePaintDark);
  addBox(group, [0.28, 0.46, 10.95], [-3.64, -0.02, 0], materials.referencePaintDark);
  for (let z = -4.65; z <= 4.65; z += 1.16) {
    addBox(group, [7.15, 0.1, 0.09], [0, 0.21, z], materials.referenceRust);
  }
  for (let x = -2.9; x <= 2.9; x += 1.15) {
    addBox(group, [0.09, 0.1, 10.25], [x, 0.22, 0], materials.steelDark);
  }
  return group;
}

function makeReferenceDumpWall(materials, side) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-4.45, -1.65);
  shape.lineTo(-4.45, 2.75);
  shape.lineTo(4.55, 2.18);
  shape.lineTo(4.55, -2.32);
  shape.closePath();
  const wall = new THREE.Mesh(new THREE.ShapeGeometry(shape), materials.referencePaint);
  wall.position.z = 0;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);
  addBeam(group, [-4.45, 2.78, side * 0.05], [4.58, 2.21, side * 0.05], 0.14, materials.steelDark);
  addBeam(group, [-4.42, -1.55, side * 0.04], [4.52, -2.24, side * 0.04], 0.12, materials.referenceRust);
  for (let x = -3.75; x <= 3.75; x += 1.25) {
    const t = (x + 4.45) / 9;
    const lower = THREE.MathUtils.lerp(-1.65, -2.32, t);
    const upper = THREE.MathUtils.lerp(2.75, 2.18, t);
    addBox(group, [0.18, upper - lower + 0.08, 0.24], [x, (lower + upper) / 2, side * 0.13], materials.referencePaintDark);
  }
  for (let x = -3.8; x <= 4.1; x += 0.62) {
    const t = (x + 4.45) / 9;
    const y = THREE.MathUtils.lerp(2.75, 2.18, t) - 0.24;
    addBox(group, [0.08, 0.08, 0.12], [x, y, side * 0.16], materials.steel);
  }
  return group;
}

function makeReferenceFrontArmor(materials) {
  const group = new THREE.Group();
  addBox(group, [0.62, 3.05, 7.25], [0, 0, 0], materials.referencePaint);
  addBox(group, [0.09, 1.85, 4.45], [-0.36, 0.2, 0], materials.referenceGrille);
  for (let z = -1.95; z <= 1.95; z += 0.3) {
    addBox(group, [0.08, 1.58, 0.075], [-0.42, 0.2, z], materials.steelDark);
  }
  addBox(group, [0.78, 0.46, 7.9], [-0.02, -1.66, 0], materials.referencePaintDark);
  addBox(group, [0.42, 0.35, 7.55], [-0.48, -1.66, 0], materials.steelDark);
  for (const z of [-3.0, -2.36, 2.36, 3.0]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.16, 24), materials.referenceLight);
    lamp.rotation.z = Math.PI / 2;
    lamp.position.set(-0.4, 0.78, z);
    group.add(lamp);
  }
  for (const z of [-3.42, 3.42]) addBox(group, [0.18, 2.6, 0.24], [-0.38, 0, z], materials.referencePaintDark);
  return group;
}

function makeReferenceRailings(materials) {
  const group = new THREE.Group();
  const railMaterial = materials.steel;
  const deckY = 7.35;
  const paths = [
    [[-7.55, deckY, -5.12], [-1.82, deckY, -5.12]],
    [[-7.55, deckY, 5.12], [-1.82, deckY, 5.12]],
    [[-7.55, deckY, -5.12], [-7.55, deckY, 5.12]]
  ];
  for (const [start, end] of paths) {
    addBeam(group, start, end, 0.065, railMaterial);
    addBeam(group, [start[0], start[1] - 0.48, start[2]], [end[0], end[1] - 0.48, end[2]], 0.045, railMaterial);
    const distance = new THREE.Vector3(...start).distanceTo(new THREE.Vector3(...end));
    const count = Math.max(2, Math.ceil(distance / 1.05));
    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      const x = THREE.MathUtils.lerp(start[0], end[0], t);
      const z = THREE.MathUtils.lerp(start[2], end[2], t);
      addBeam(group, [x, deckY - 1.05, z], [x, deckY + 0.02, z], 0.055, railMaterial);
    }
  }
  const upperY = 9.72;
  for (const z of [-5.05, 5.05]) {
    addBeam(group, [-5.55, upperY, z], [0.9, upperY + 0.45, z], 0.06, railMaterial);
    for (let x = -5.5; x <= 0.75; x += 1.05) {
      const y = upperY + (x + 5.55) * 0.07;
      addBeam(group, [x, y - 0.95, z], [x, y, z], 0.05, railMaterial);
    }
  }
  return group;
}

function makeReferenceLadder(materials) {
  const group = new THREE.Group();
  for (const z of [-0.42, 0.42]) addBeam(group, [0, 0, z], [0, 5.55, z], 0.075, materials.steel);
  for (let y = 0.18; y <= 5.35; y += 0.42) addBeam(group, [0, y, -0.42], [0, y, 0.42], 0.055, materials.steel);
  addBox(group, [0.18, 0.34, 1.25], [0.08, -0.12, 0], materials.referencePaintDark);
  return group;
}

function addBox(group, size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.fromArray(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addBeam(group, start, end, radius, material) {
  const startVector = new THREE.Vector3(...start);
  const endVector = new THREE.Vector3(...end);
  const direction = endVector.clone().sub(startVector);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material);
  mesh.position.copy(startVector).add(endVector).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addRivetRows(group, materials, xRange, zRange, y, count, sideRows = false) {
  const geometry = new THREE.SphereGeometry(0.055, 7, 5);
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    if (sideRows) {
      for (const z of [-zRange, zRange]) {
        const rivet = new THREE.Mesh(geometry, materials.steel);
        rivet.position.set(THREE.MathUtils.lerp(xRange[0], xRange[1], t), y, z);
        group.add(rivet);
      }
    } else {
      for (const z of [-zRange, zRange]) {
        const rivet = new THREE.Mesh(geometry, materials.steel);
        rivet.position.set(THREE.MathUtils.lerp(xRange[0], xRange[1], t), y, z);
        group.add(rivet);
      }
    }
  }
}

function createAnchors(anchors, materials) {
  const group = new THREE.Group();
  anchors.forEach((anchor) => {
    const marker = new THREE.Group();
    marker.name = anchor.id;
    marker.position.fromArray(anchor.position);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 28), materials.anchor);
    ring.rotation.x = Math.PI / 2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.52, 8), materials.anchor);
    stem.position.y = 0.24;
    marker.add(ring, stem);
    marker.traverse((child) => { child.userData.helper = true; });
    group.add(marker);
  });
  return group;
}

function makeTent(materials) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-1.55, 0);
  shape.lineTo(0, 1.65);
  shape.lineTo(1.55, 0);
  shape.closePath();
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 2.8, bevelEnabled: false }),
    materials.fabric
  );
  body.geometry.translate(0, 0, -1.4);
  group.add(body);
  return group;
}

function makeCampfire(materials) {
  const group = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.56, 0.28, 24, 1, true), materials.steelDark);
  bowl.position.y = 0.34;
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.05, 9), materials.flameOuter);
  outer.position.y = 1.05;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.72, 8), materials.flameInner);
  inner.position.y = 0.9;
  const light = new THREE.PointLight(0xff8d32, 3.2, 8, 2);
  light.position.y = 1.2;
  group.add(bowl, outer, inner, light);
  group.userData.animate = (time) => {
    outer.scale.y = 0.92 + Math.sin(time * 8) * 0.08;
    light.intensity = 2.8 + Math.sin(time * 10) * 0.45;
  };
  return group;
}

function makeCrate(materials) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.25, 1.4), materials.paint);
  body.position.y = 0.625;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.1, 1.48), materials.steelDark);
  lid.position.y = 1.3;
  group.add(body, lid);
  return group;
}

function makeShelter(materials) {
  const group = new THREE.Group();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.48, 0.18, 3.78), materials.paint);
  roof.position.y = 2.75;
  const back = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.65, 0.12), materials.steelDark);
  back.position.set(0, 1.325, 1.7);
  group.add(roof, back);
  for (const x of [-2.1, 2.1]) {
    for (const z of [-1.7, 1.7]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.65, 10), materials.steel);
      post.position.set(x, 1.325, z);
      group.add(post);
    }
  }
  return group;
}

function fitImportedObject(object, targetSize) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z) || 1;
  object.scale.multiplyScalar(targetSize / largest);
  object.updateMatrixWorld(true);
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
    if (!child.isMesh && !child.isSkinnedMesh && !child.isInstancedMesh) return;
    meshes += child.isInstancedMesh ? child.count : 1;
    const geometry = child.geometry;
    if (!geometry) return;
    const count = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    triangles += Math.round(count * (child.isInstancedMesh ? child.count : 1));
  });
  return { meshes, triangles };
}
