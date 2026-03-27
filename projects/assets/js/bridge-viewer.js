// assets/js/bridge-viewer.js
// Three.js（Three.js） viewer with OrbitControls（轨道控制）
// - If assets/models/bridge.glb exists, it loads it.
// - Otherwise, it builds a procedural “box girder + triangular diaphragms” bridge.

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const container = document.getElementById("bridge-3d");
if (!container) {
  console.warn("bridge-3d container not found.");
} else {
  const scene = new THREE.Scene();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x000000, 0); // transparent
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    5000
  );
  camera.position.set(320, 180, 320);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 35, 0);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(300, 500, 200);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-300, 200, -200);
  scene.add(fill);

  // Subtle ground grid (optional)
  const grid = new THREE.GridHelper(900, 30, 0x8899aa, 0x223344);
  grid.position.y = 0;
  grid.material.opacity = 0.18;
  grid.material.transparent = true;
  scene.add(grid);

  // Try load GLB model first. If fails, fallback to procedural bridge.
  const MODEL_URL = "../assets/models/bridge.glb"; // relative to projects/civ102-bridge.html
  const loader = new GLTFLoader();

  let modelGroup = new THREE.Group();
  scene.add(modelGroup);

  function buildProceduralBridge() {
    modelGroup.clear();

    // Dimensions (mm-ish scale; purely visual)
    const L = 800;  // length
    const W = 90;   // structural box width
    const H = 70;   // structural box height
    const deckW = 120;

    const matMain = new THREE.MeshStandardMaterial({
      color: 0x86a8ff, metalness: 0.08, roughness: 0.55
    });
    const matAccent = new THREE.MeshStandardMaterial({
      color: 0x8cffd6, metalness: 0.05, roughness: 0.5
    });
    const matDark = new THREE.MeshStandardMaterial({
      color: 0x223044, metalness: 0.05, roughness: 0.75
    });

    // Deck (top plate)
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(L, 6, deckW),
      matMain
    );
    deck.position.set(0, H / 2 + 6, 0);
    modelGroup.add(deck);

    // Box girder shell (simplified as 4 plates)
    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(L, 4, W), matMain);
    topPlate.position.set(0, H / 2, 0);
    modelGroup.add(topPlate);

    const bottomPlate = new THREE.Mesh(new THREE.BoxGeometry(L, 4, W), matMain);
    bottomPlate.position.set(0, -H / 2, 0);
    modelGroup.add(bottomPlate);

    const webL = new THREE.Mesh(new THREE.BoxGeometry(L, H, 4), matMain);
    webL.position.set(0, 0, -W / 2);
    modelGroup.add(webL);

    const webR = new THREE.Mesh(new THREE.BoxGeometry(L, H, 4), matMain);
    webR.position.set(0, 0, W / 2);
    modelGroup.add(webR);

    // End diaphragms
    const end1 = new THREE.Mesh(new THREE.BoxGeometry(4, H, W), matDark);
    end1.position.set(-L / 2, 0, 0);
    modelGroup.add(end1);

    const end2 = new THREE.Mesh(new THREE.BoxGeometry(4, H, W), matDark);
    end2.position.set(L / 2, 0, 0);
    modelGroup.add(end2);

    // Triangular diaphragms (stylized)
    // Use thin “diagonal braces” to evoke triangular infill
    const count = 16;
    for (let i = 0; i < count; i++) {
      const x = -L / 2 + 40 + (i * (L - 80)) / (count - 1);

      // two diagonals crossing to suggest triangulation
      const diag1 = makeDiagonalBrace(60, 3.5, matAccent);
      diag1.position.set(x, 0, 0);
      diag1.rotation.y = Math.PI / 2;
      diag1.rotation.z = Math.PI / 4;
      modelGroup.add(diag1);

      const diag2 = makeDiagonalBrace(60, 3.5, matAccent);
      diag2.position.set(x, 0, 0);
      diag2.rotation.y = Math.PI / 2;
      diag2.rotation.z = -Math.PI / 4;
      modelGroup.add(diag2);
    }

    // Slight lift so grid isn't clipping
    modelGroup.position.y = 45;

    // Center/scale controls target
    controls.target.set(0, 55, 0);
    controls.update();
  }

  function makeDiagonalBrace(len, thickness, material) {
    const geom = new THREE.BoxGeometry(len, thickness, thickness);
    const mesh = new THREE.Mesh(geom, material);
    return mesh;
  }

  function fitCameraToObject(obj, offset = 1.25) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (camera.fov * Math.PI) / 180;
    let cameraZ = Math.abs((maxDim / 2) / Math.tan(fov / 2)) * offset;

    camera.position.set(center.x + cameraZ, center.y + cameraZ * 0.4, center.z + cameraZ);
    camera.near = maxDim / 100;
    camera.far = maxDim * 50;
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.update();
  }

  loader.load(
    MODEL_URL,
    (gltf) => {
      modelGroup.clear();
      modelGroup.add(gltf.scene);

      // Make it nicer: ensure all meshes cast/receive shadows
      gltf.scene.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = true;
          n.receiveShadow = true;
        }
      });

      fitCameraToObject(gltf.scene, 1.35);
    },
    undefined,
    () => {
      // Fallback if no model file
      buildProceduralBridge();
    }
  );

  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}
