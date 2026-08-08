import * as THREE from "three";
import { readFile } from "node:fs/promises";
import { buildHaulTruck } from "../src/truck-model.js";

const context = {
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
  fillRect() {},
  beginPath() {},
  arc() {},
  fill() {},
  moveTo() {},
  lineTo() {},
  stroke() {}
};

globalThis.document = {
  createElement() {
    return { width: 256, height: 256, getContext: () => context };
  }
};

const blueprint = JSON.parse(await readFile(new URL("../data/vehicle-3d.json", import.meta.url), "utf8"));
const scene = new THREE.Scene();
const model = buildHaulTruck(scene, blueprint);
model.root.updateMatrixWorld(true);

const bounds = (object) => {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  return size.toArray().map((value) => Number(value.toFixed(3)));
};

const envelope = bounds(model.root);
const wheelIds = [...model.parts.keys()].filter((id) => /^wheel_\d{2}_(left|right)$/.test(id));
const sampleWheel = bounds(model.parts.get(wheelIds[0]));
const frontDeck = new THREE.Box3().setFromObject(model.parts.get("front_service_deck"));
const warehouseFloor = bounds(model.parts.get("warehouse_level_floor"));

const checks = [
  [Math.abs(envelope[0] - 24) <= 0.15, `整车长度 ${envelope[0]} m 不在 24±0.15 m 内`],
  [envelope[2] > 12 && Math.abs(envelope[2] - 12.4) <= 0.15, `整车宽度 ${envelope[2]} m 不符合 12 m 以上／暂定 12.4 m`],
  [Math.abs(frontDeck.max.y - 9.1) <= 0.08, `前平台上表面 ${frontDeck.max.y.toFixed(3)} m 未接近 8.9 m 平台基准`],
  [wheelIds.length === 8, `独立轮组数量为 ${wheelIds.length}，应为 8`],
  [Math.abs(sampleWheel[0] - 4.9) <= 0.1 && Math.abs(sampleWheel[1] - 4.9) <= 0.1, `轮组外廓 ${sampleWheel[0]} × ${sampleWheel[1]} m 未接近 4.9 m`],
  [Math.abs(warehouseFloor[0] * warehouseFloor[2] - 114.8) <= 0.2, `斗内水平地板面积未达到暂定 114.8 m²`]
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);
const report = {
  units: "meter",
  envelope: { length: envelope[0], height: envelope[1], width: envelope[2] },
  wheelGroups: wheelIds.length,
  sampleWheel: { diameterX: sampleWheel[0], diameterY: sampleWheel[1], width: sampleWheel[2] },
  warehouseFloor: { length: warehouseFloor[0], width: warehouseFloor[2], area: Number((warehouseFloor[0] * warehouseFloor[2]).toFixed(1)) },
  editableParts: model.parts.size,
  status: failures.length ? "failed" : "passed",
  failures
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
