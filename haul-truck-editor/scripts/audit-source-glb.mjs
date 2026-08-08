import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as THREE from "three";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Usage: node scripts/audit-source-glb.mjs <model.glb>");

const resolvedSourcePath = resolve(sourcePath);
const sourceStats = await stat(resolvedSourcePath);
const buffer = sourceStats.isDirectory()
  ? Buffer.concat(await Promise.all(
      (await readdir(resolvedSourcePath))
        .filter((name) => name.startsWith("liebherr-t284.part-"))
        .sort()
        .map((name) => readFile(join(resolvedSourcePath, name)))
    ))
  : await readFile(resolvedSourcePath);
if (buffer.toString("utf8", 0, 4) !== "glTF") throw new Error("Not a GLB file");
const jsonLength = buffer.readUInt32LE(12);
const document = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
const parents = new Map();
(document.nodes || []).forEach((node, index) => {
  for (const child of node.children || []) parents.set(child, index);
});

function localMatrix(node) {
  if (node.matrix) return new THREE.Matrix4().fromArray(node.matrix);
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(node.translation || [0, 0, 0]),
    new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
    new THREE.Vector3().fromArray(node.scale || [1, 1, 1])
  );
}

const worldMatrices = new Map();
function worldMatrix(index) {
  if (worldMatrices.has(index)) return worldMatrices.get(index);
  const local = localMatrix(document.nodes[index]);
  const parent = parents.get(index);
  const world = parent === undefined ? local : worldMatrix(parent).clone().multiply(local);
  worldMatrices.set(index, world);
  return world;
}

function topLevelParentName(index) {
  let current = index;
  let parent = parents.get(current);
  while (parent !== undefined && document.nodes[parent]?.name !== "GLTF_SceneRootNode") {
    current = parent;
    parent = parents.get(current);
  }
  return document.nodes[current]?.name || "(root)";
}

function accessorBox(accessorIndex) {
  const accessor = document.accessors?.[accessorIndex];
  if (!accessor?.min || !accessor?.max) return null;
  return new THREE.Box3(
    new THREE.Vector3().fromArray(accessor.min),
    new THREE.Vector3().fromArray(accessor.max)
  );
}

function transformedBox(box, matrix) {
  const result = new THREE.Box3();
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        result.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(matrix));
      }
    }
  }
  return result;
}

function fmt(vector) {
  return vector.toArray().map((value) => Number(value.toFixed(3)));
}

const rows = [];
(document.nodes || []).forEach((node, nodeIndex) => {
  if (node.mesh === undefined) return;
  const mesh = document.meshes[node.mesh];
  const box = new THREE.Box3();
  for (const primitive of mesh.primitives || []) {
    const primitiveBox = accessorBox(primitive.attributes?.POSITION);
    if (primitiveBox) box.union(transformedBox(primitiveBox, worldMatrix(nodeIndex)));
  }
  const parentName = document.nodes[parents.get(nodeIndex)]?.name || "(root)";
  rows.push({
    node: nodeIndex,
    topLevel: topLevelParentName(nodeIndex),
    parent: parentName,
    mesh: mesh.name || `mesh_${node.mesh}`,
    min: fmt(box.min),
    max: fmt(box.max),
    size: fmt(box.getSize(new THREE.Vector3())),
    center: fmt(box.getCenter(new THREE.Vector3()))
  });
});

console.log(JSON.stringify(rows, null, 2));
