// assets/js/bridge-viewer.js
// Interactive 3D viewer for CIV102 bridge (procedural model matching your CAD look)
// - OrbitControls: drag rotate, scroll zoom, right-drag pan
// - Default: closed box girder + deck + internal zigzag diaphragms
// - Toggle cutaway (open side) with "C" or button
// - Reset view with "R" or button
// - If assets/models/bridge.glb exists, it will load it automatically instead.

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const container = document.getElementById("bridge-3d");
if (!container) {
  console.warn("[bridge-viewer] #bridge-3d not found.");
} else {
  // ----------------------------
  // Scene / renderer / camera
  // ----------------------------
  const scene = new THREE.Scene();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    20000
  );
  camera.position.set(900, 350, 900);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.target.set(0, 60, 0);
  controls.update();

  // ----------------------------
  // Lighting
  // ----------------------------
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));

  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(900, 1200, 700);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-900, 500, -700);
  scene.add(fill);

  // Subtle grid (like CAD floor)
  const grid = new THREE.GridHelper(2600, 40, 0x7f93a8, 0x273246);
  grid.material.opacity = 0.16;
  grid.material.transparent = true;
  grid.position.y = 0;
  scene.add(grid);

  // ----------------------------
  // UI overlay buttons (no HTML edits needed)
  // ----------------------------
  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.inset = "12px auto auto 12px";
  overlay.style.display = "flex";
  overlay.style.gap = "8px";
  overlay.style.zIndex = "5";
  overlay.style.pointerEvents = "auto";

  // Ensure container is position: relative so overlay works
  const prevPos = getComputedStyle(container).position;
  if (prevPos === "static") container.style.position = "relative";
  container.appendChild(overlay);

  function makeBtn(label) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.padding = "6px 10px";
    b.style.borderRadius = "12px";
    b.style.border = "1px solid rgba(255,255,255,0.18)";
    b.style.background = "rgba(20,24,34,0.65)";
    b.style.color = "rgba(255,255,255,0.9)";
    b.style.cursor = "pointer";
    b.style.backdropFilter = "blur(8px)";
    b.style.fontSize = "13px";
    b.onmouseenter = () => (b.style.borderColor = "rgba(122,162,255,0.6)");
    b.onmouseleave = () => (b.style.borderColor = "rgba(255,255,255,0.18)");
    return b;
  }

  const btnCut = makeBtn("Cutaway (C)");
  const btnReset = makeBtn("Reset (R)");
  overlay.appendChild(btnCut);
  overlay.appendChild(btnReset);

  // ----------------------------
  // Groups
  // ----------------------------
  const root = new THREE.Group();
  const outerGroup = new THREE.Group();   // box + deck + ends
  const infillGroup = new THREE.Group();  // zigzag internal diaphragms
  const edgeGroup = new THREE.Group();    // outline edges

  root.add(outerGroup);
  root.add(infillGroup);
  root.add(edgeGroup);
  scene.add(root);

  // ----------------------------
  // Materials (CAD-ish look)
  // ----------------------------
  const matShell = new THREE.MeshStandardMaterial({
    color: 0x2a323f, roughness: 0.78, metalness: 0.05
  });
  const matDeck = new THREE.MeshStandardMaterial({
    color: 0xcfd3da, roughness: 0.55, metalness: 0.03
  });
  const matInfill = new THREE.MeshStandardMaterial({
    color: 0x7d8693, roughness: 0.72, metalness: 0.02
  });

  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x0f141e, transparent: true, opacity: 0.45
  });

  // ----------------------------
  // Dimensions (mm-ish world units)
  // Tune these if you want.
  // ----------------------------
  const D = {
    L: 1250,       // length
    W: 80,         // box width (structural)
    H: 60,         // box height
    deckW: 100,    // deck width
    t: 2.5,        // visual thickness
    endT: 2.5,     // end diaphragm thickness
    diaphragms: 12 // visual count (CAD screenshot shows fewer bays). You can set 23 if you want denser.
                 // 23 looks great but can be heavier to render on low-end devices.
  };

  // For better match to your CAD image: fewer, larger bays
  // If you prefer exact report count, use: D.diaphragms = 23;

  const leftX = -D.L / 2;
  const rightX = D.L / 2;

  // Refs for cutaway
  let rightWebMesh = null;
  let deckMesh = null;
  let cutaway = false;
  let usingGLB = false;

  // ----------------------------
  // Helpers
  // ----------------------------
  function addBox(group, x, y, z, sx, sy, sz, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function addEdgesFor(mesh) {
    const geom = new THREE.EdgesGeometry(mesh.geometry, 20);
    const line = new THREE.LineSegments(geom, edgeMat);
    line.position.copy(mesh.position);
    line.rotation.copy(mesh.rotation);
    edgeGroup.add(line);
  }

  function clearAll() {
    outerGroup.clear();
    infillGroup.clear();
    edgeGroup.clear();
    rightWebMesh = null;
    deckMesh = null;
  }

  function fitCameraToObject(obj, offset = 1.25) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (camera.fov * Math.PI) / 180;
    const cameraZ = Math.abs((maxDim / 2) / Math.tan(fov / 2)) * offset;

    camera.position.set(center.x + cameraZ, center.y + cameraZ * 0.35, center.z + cameraZ);
    camera.near = maxDim / 200;
    camera.far = maxDim * 50;
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.update();
  }

  // ----------------------------
  // Build procedural model (matches your CAD “open side + zigzag partitions” look)
  // ----------------------------
  function buildBridgeProcedural() {
    clearAll();

    const { L, W, H, deckW, t, endT, diaphragms } = D;
    const innerW = W - 2 * t;
    const innerH = H - 2 * t;

    // Outer shell: top/bottom plates + two webs + end diaphragms
    const bottom = addBox(outerGroup, 0, -H / 2 + t / 2, 0, L, t, W, matShell);
    const top = addBox(outerGroup, 0, H / 2 - t / 2, 0, L, t, W, matShell);

    const leftWeb = addBox(outerGroup, 0, 0, -W / 2 + t / 2, L, H - 2 * t, t, matShell);
    rightWebMesh = addBox(outerGroup, 0, 0,  W / 2 - t / 2, L, H - 2 * t, t, matShell);

    const end1 = addBox(outerGroup, leftX + endT / 2, 0, 0, endT, H, W, matShell);
    const end2 = addBox(outerGroup, rightX - endT / 2, 0, 0, endT, H, W, matShell);

    // Deck (wide plate on top)
    deckMesh = addBox(outerGroup, 0, H / 2 + t / 2, 0, L, t, deckW, matDeck);

    // Add edges outlines for CAD feel
    [bottom, top, leftWeb, rightWebMesh, end1, end2, deckMesh].forEach(addEdgesFor);

    // Internal zigzag diaphragms:
    // We build bay-by-bay diagonal panels that alternate direction (like your CAD image).
    // Each bay has a thin plate spanning from one side to the other across its bay length.
    const usableL = L - 2 * endT;
    const bayLen = usableL / diaphragms;

    for (let i = 0; i < diaphragms; i++) {
      const x0 = leftX + endT + i * bayLen;
      const x1 = x0 + bayLen;

      // Alternate which side it "leans" toward (gives the zigzag look)
      const zA = (i % 2 === 0) ? (-innerW / 2) : (innerW / 2);
      const zB = -zA;

      // Create a diagonal plate in the X-Z plane, full inner height (like a partition wall)
      const segLen = Math.hypot((x1 - x0), (zB - zA));
      const angleY = Math.atan2((zB - zA), (x1 - x0));

      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(segLen, innerH, t),
        matInfill
      );
      plate.position.set((x0 + x1) / 2, 0, (zA + zB) / 2);
      plate.rotation.y = angleY;
      infillGroup.add(plate);

      addEdgesFor(plate);
    }

    // Lift bridge off grid a bit (like CAD screenshot)
    root.position.y = 45;

    // Default view: show exterior + infill (CAD screenshot shows interior visible from side)
    // We'll keep infill visible, and allow cutaway to remove one web for better inside view.
    infillGroup.visible = true;
    setCutaway(false);

    fitCameraToObject(root, 1.35);
  }

  // ----------------------------
  // Cutaway: hide right web + make deck slightly transparent to see inside
  // ----------------------------
  function setCutaway(on) {
    cutaway = on;

    if (usingGLB) {
      // If GLB is loaded, we don't know parts; just adjust overall transparency.
      outerGroup.traverse((n) => {
        if (n.isMesh && n.material) {
          n.material.transparent = on;
          n.material.opacity = on ? 0.4 : 1.0;
        }
      });
      return;
    }

    if (rightWebMesh) rightWebMesh.visible = !on;

    if (deckMesh && deckMesh.material) {
      deckMesh.material.transparent = on;
      deckMesh.material.opacity = on ? 0.7 : 1.0;
    }

    // Keep infill visible; cutaway makes it easier to see
    infillGroup.visible = true;
  }

  function resetView() {
    fitCameraToObject(root, 1.35);
  }

  btnCut.addEventListener("click", () => setCutaway(!cutaway));
  btnReset.addEventListener("click", resetView);

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "c") setCutaway(!cutaway);
    if (k === "r") resetView();
  });

  // ----------------------------
  // Optional: load real GLB if present
  // Put your exported model here: assets/models/bridge.glb
  // ----------------------------
  const gltfLoader = new GLTFLoader();
  const modelURL = new URL("../models/bridge.glb", import.meta.url).href;

  gltfLoader.load(
    modelURL,
    (gltf) => {
      usingGLB = true;
      clearAll();
      outerGroup.add(gltf.scene);

      gltf.scene.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = true;
          n.receiveShadow = true;
        }
      });

      root.position.y = 45;
      fitCameraToObject(root, 1.35);
    },
    undefined,
    () => {
      // If GLB doesn't exist, fall back to procedural model
      buildBridgeProcedural();
    }
  );

  // ----------------------------
  // Resize handling (robust)
  // ----------------------------
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w <= 0 || h <= 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  ro.observe(container);

  // ----------------------------
  // Animation loop
  // ----------------------------
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}
