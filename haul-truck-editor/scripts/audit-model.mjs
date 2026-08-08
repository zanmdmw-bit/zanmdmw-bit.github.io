import { readdir, readFile } from "node:fs/promises";

const partsUrl = new URL("../source-assets/models/parts/", import.meta.url);
const partNames = (await readdir(partsUrl))
  .filter((name) => name.startsWith("liebherr-t284.part-"))
  .sort();
const buffer = Buffer.concat(await Promise.all(partNames.map((name) => readFile(new URL(name, partsUrl)))));
const blueprint = JSON.parse(await readFile(new URL("../data/vehicle-3d.json", import.meta.url), "utf8"));

const failures = [];
if (buffer.toString("utf8", 0, 4) !== "glTF") failures.push("文件头不是有效 GLB");
if (buffer.readUInt32LE(4) !== 2) failures.push("GLB 版本不是 2");
if (buffer.readUInt32LE(8) !== buffer.length) failures.push("GLB 声明长度与文件长度不一致");

const jsonLength = buffer.readUInt32LE(12);
const jsonType = buffer.toString("utf8", 16, 20);
if (jsonType !== "JSON") failures.push("GLB 第一数据块不是 JSON");

const document = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
const nodeNames = new Set((document.nodes || []).map((node) => node.name).filter(Boolean));
const requiredNodes = [
  "tire 59/80 r63 michelin002_1",
  "rim t287_2",
  "cab ss_35",
  "cab gls_36",
  "buket frame_37",
  "buket body_38",
  "base plataforma _20"
];

for (const name of requiredNodes) {
  if (!nodeNames.has(name)) failures.push("缺少源模型语义节点：" + name);
}

const conversionParts = blueprint.referenceConversion?.parts || [];
const conversionIds = conversionParts.map((part) => part.id);
const requiredConversionIds = [
  "reference_front_deck",
  "reference_driver_cab",
  "reference_equipment_room",
  "reference_upper_canopy",
  "reference_dump_wall_left",
  "reference_dump_wall_right",
  "reference_front_armor",
  "reference_platform_railings",
  "reference_access_ladder"
];
if (new Set(conversionIds).size !== conversionIds.length) failures.push("原图改造部件 ID 存在重复");
for (const id of requiredConversionIds) {
  if (!conversionIds.includes(id)) failures.push("缺少原图改造部件：" + id);
}
for (const part of conversionParts) {
  if (!Array.isArray(part.position) || part.position.length !== 3) failures.push(`${part.id} 缺少三维位置数据`);
  if (!Array.isArray(part.rotation) || part.rotation.length !== 3) failures.push(`${part.id} 缺少三维旋转数据`);
  if (!Array.isArray(part.scale) || part.scale.length !== 3) failures.push(`${part.id} 缺少三维缩放数据`);
}

const report = {
  status: failures.length ? "failed" : "passed",
  title: document.asset?.extras?.title || null,
  author: document.asset?.extras?.author || null,
  license: document.asset?.extras?.license || null,
  bytes: buffer.length,
  nodes: document.nodes?.length || 0,
  meshes: document.meshes?.length || 0,
  materials: document.materials?.length || 0,
  textures: document.textures?.length || 0,
  images: document.images?.length || 0,
  modelParts: partNames.length,
  conversionParts: conversionParts.length,
  blueprintVersion: blueprint.version,
  sourceStage: "T284 source model loaded; six-wheel assemblies are not yet split into the target eight independent wheel groups.",
  failures
};

if (report.title !== "Liebherr T284") failures.push("模型标题与预期不符");
if ((document.meshes?.length || 0) < 70) failures.push("模型网格数量异常偏少");
if ((document.images?.length || 0) < 10) failures.push("内嵌贴图数量异常偏少");
report.status = failures.length ? "failed" : "passed";

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
