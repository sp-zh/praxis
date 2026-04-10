// assets/js/bridge-viewer.js
// Three.js（Three.js） interactive viewer for Team 304 bridge (procedural model)
// Based on report dimensions: L=1250, box W=80, H=60, deck W=100, splice at ~1/3,
// 23 diaphragms/zigzag at ~60°, and 3 reinforcement zones. (See report text.)

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const container = document.getElementById("bridge-3d");
if (!container) {
  console.warn("bridge-3d container not found.");
} else {
  // ---------- Scene / camera / renderer ----------
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
  controls.target.set(0, 60, 0);

  // ---------- Lights ----------
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(900, 1200, 700);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-900, 500, -700);
  scene.add(fill);

  // Ground grid (subtle)
  const grid = new THREE.GridHelper(2600, 40, 0x7f93a8, 0x273246);
  grid.material.opacity = 0.18;
  grid.material.transparent = true;
  grid.position.y = 0;
  scene.add(grid);

  // ---------- Groups ----------
  const bridgeGroup = new THREE.Group();
  const outerGroup = new THREE.Group();
  const infillGroup = new THREE.Group();
  const lineGroup = new THREE.Group();

  bridgeGroup.add(outerGroup);
  bridgeGroup.add(infillGroup);
  bridgeGroup.add(lineGroup);
  scene.add(bridgeGroup);

  // ---------- Materials ----------
  const matSide = new THREE.MeshStandardMaterial({
    color: 0x1f2633, roughness: 0.78, metalness: 0.05
  });
  const matDeck = new THREE.MeshStandardMaterial({
    color: 0xd6d9df, roughness: 0.55, metalness: 0.03
  });
  const matReinf = new THREE.MeshStandardMaterial({
    color: 0xbfc5cf, roughness: 0.58, metalness: 0.03
  });
  const matInfill = new THREE.MeshStandardMaterial({
    color: 0x7f8793, roughness: 0.7, metalness: 0.02
  });

  const lineMat = new THREE.LineBasicMaterial({ color: 0x101621, transparent: true, opacity: 0.45 });

  // ---------- Dimensions (mm as world units) ----------
  const dims = {
    L: 1250,
    W: 80,
    H: 60,
    deckW: 100,
    t: 2.54,            // matboard thickness (visual)
    endFlat: 60,        // support flat length (visual cue)
    spliceFrac: 1 / 3,
    diaphragms: 23,
    // reinforcement zones along length (mm from left end)
    reinfZones: [
      [205, 1045],
      [300, 950],
      [385, 865]
    ]
  };

  // Convenience conversions
  const leftX = -dims.L / 2;
  const rightX = dims.L / 2;
  const spliceX = leftX + dims.L * dims.spliceFrac; // ~1/3 from left end

  // ---------- Helpers ----------
  function addBox(group, x, y, z, sx, sy, sz, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function addEdgeRectX(x, y, zHalf, yHalf, w, h, opacity = 0.35) {
    // draw a rectangle outline on a plane x = const (useful for splice seam)
    const pts = [
      new THREE.Vector3(x, y - h / 2, -w / 2),
      new THREE.Vector3(x, y + h / 2, -w / 2),
      new THREE.Vector3(x, y + h / 2,  w / 2),
      new THREE.Vector3(x, y - h / 2,  w / 2),
      new THREE.Vector3(x, y - h / 2, -w / 2),
    ];
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = lineMat.clone();
    mat.opacity = opacity;
    const line = new THREE.Line(geom, mat);
    lineGroup.add(line);
  }

  function addPlaneLineAtX(x, y, z0, z1, opacity = 0.25) {
    const pts = [new THREE.Vector3(x, y, z0), new THREE.Vector3(x, y, z1)];
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = lineMat.clone();
    mat.opacity = opacity;
    lineGroup.add(new THREE.Line(geom, mat));
  }

  function fitCameraToObject(obj, offset = 1.25) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (camera.fov * Math.PI) / 180;
    let cameraZ = Math.abs((maxDim / 2) / Math.tan(fov / 2)) * offset;

    camera.position.set(center.x + cameraZ, center.y + cameraZ * 0.35, center.z + cameraZ);
    camera.near = maxDim / 200;
    camera.far = maxDim * 50;
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.update();
  }

  // ---------- Procedural bridge build ----------
  function buildTeam304Bridge() {
    outerGroup.clear();
    infillGroup.clear();
    lineGroup.clear();

    const { L, W, H, deckW, t, diaphragms } = dims;

    // Outer shell plates (box girder)
    // bottom plate
    addBox(outerGroup, 0, -H / 2 + t / 2, 0, L, t, W, matSide);
    // top plate (structural width only)
    addBox(outerGroup, 0, H / 2 - t / 2, 0, L, t, W, matSide);
    // side webs
    addBox(outerGroup, 0, 0, -W / 2 + t / 2, L, H - 2 * t, t, matSide);
    addBox(outerGroup, 0, 0,  W / 2 - t / 2, L, H - 2 * t, t, matSide);
    // end diaphragms
    addBox(outerGroup, leftX + t / 2, 0, 0, t, H, W, matSide);
    addBox(outerGroup, rightX - t / 2, 0, 0, t, H, W, matSide);

    // Deck (track) — wider than structural box
    // Keep top surface flat; reinforcements go UNDER this deck to avoid train interference.
    const deck = addBox(
      outerGroup,
      0,
      H / 2 + t / 2,     // sits on top
      0,
      L,
      t,
      deckW,
      matDeck
    );

    // Reinforcement layers under deck (3 layers, 3 zones each layer length)
    // Visual: three stacked plates below deck, centered regions as in report.
    const baseY = H / 2; // deck bottom plane is around y=H/2
    dims.reinfZones.forEach((zone, idx) => {
      const [a, b] = zone;              // mm from left end
      const len = b - a;
      const xMid = leftX + (a + b) / 2;
      // stack 3 layers; idx indicates "which zone", but we actually want 3 layers total across same zone.
      // We'll model exactly: "3 extra layers ... from A to B" => 3 plates for each zone.
      for (let k = 0; k < 3; k++) {
        addBox(
          outerGroup,
          xMid,
          baseY - (k + 0.5) * t,         // under deck
          0,
          len,
          t,
          deckW,
          matReinf
        );
      }

      // draw subtle boundary lines (where zones start/end) on deck top
      const xStart = leftX + a;
      const xEnd = leftX + b;
      addPlaneLineAtX(xStart, H / 2 + t + 0.05, -deckW / 2, deckW / 2, 0.18);
      addPlaneLineAtX(xEnd,   H / 2 + t + 0.05, -deckW / 2, deckW / 2, 0.18);
    });

    // Splice seam at ~1/3 length (visual seam)
    addPlaneLineAtX(spliceX, H / 2 + t + 0.08, -deckW / 2, deckW / 2, 0.35);
    addEdgeRectX(spliceX, 0, W / 2, H / 2, W, H, 0.25);

    // Internal zigzag / diaphragms approximation:
    // Create a “zigzag web” made of diagonal plates across the width.
    const innerW = W - 2 * t;
    const innerH = H - 2 * t;
    const usableL = L - 2 * t;
    const dx = usableL / diaphragms;

    for (let i = 0; i < diaphragms; i++) {
      const x0 = leftX + t + i * dx;
      const x1 = x0 + dx;
      const z0 = (i % 2 === 0) ? (-innerW / 2) : (innerW / 2);
      const z1 = -z0;

      // length of diagonal plate in x-z plane
      const segLen = Math.hypot((x1 - x0), (z1 - z0));
      const angleY = Math.atan2((z1 - z0), (x1 - x0));

      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(segLen, innerH, t),
        matInfill
      );

      // center at midpoint
      plate.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      plate.rotation.y = angleY;
      infillGroup.add(plate);
    }

    // Place bridge above grid slightly (so it “floats” like renders)
    bridgeGroup.position.y = 45;

    // Default: hide internal infill (since PDF exterior is opaque); user can toggle cutaway
    infillGroup.visible = false;

    fitCameraToObject(bridgeGroup, 1.35);
  }

  // ---------- Optional: load real GLB if you export CAD later ----------
  // Put your model at: assets/models/bridge.glb
  const loader = new GLTFLoader();
  const modelURL = new URL("../models/bridge.glb", import.meta.url).href;

  let usingGLB = false;
  loader.load(
    modelURL,
    (gltf) => {
      usingGLB = true;
      outerGroup.clear();
      infillGroup.clear();
      lineGroup.clear();

      const model = gltf.scene;
      model.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = true;
          n.receiveShadow = true;
        }
      });
      outerGroup.add(model);
      bridgeGroup.position.y = 45;
      fitCameraToObject(bridgeGroup, 1.35);
    },
    undefined,
    () => {
      // no GLB found → build procedural model from your PDF description
      buildTeam304Bridge();
    }
  );

  // ---------- Interactions ----------
  let cutaway = false;

  function setCutaway(on) {
    cutaway = on;

    if (usingGLB) {
      // If using GLB, we don’t know part names; we only toggle overall transparency.
      outerGroup.traverse((n) => {
        if (n.isMesh && n.material) {
          n.material.transparent = on;
          n.material.opacity = on ? 0.35 : 1.0;
        }
      });
      return;
    }

    // Procedural: hide right web + show infill to mimic section view
    // outerGroup children order: bottom, top, left web, right web, end1, end2, deck, reinf...
    // We'll search by bounding box near +Z to hide the “right web”
    outerGroup.traverse((n) => {
      if (!n.isMesh) return;
      const bb = new THREE.Box3().setFromObject(n);
      const center = bb.getCenter(new THREE.Vector3());

      // heuristic: right web is the thin long plate near +Z and centered near y=0
      const isRightWeb = (bb.getSize(new THREE.Vector3()).z < 5) && (center.z > 0) && (Math.abs(center.y) < 5) && (bb.getSize(new THREE.Vector3()).x > 1000);
      if (isRightWeb) n.visible = !on;
    });

    // semi-transparent deck in cutaway
    outerGroup.traverse((n) => {
      if (!n.isMesh || !n.material) return;
      // deck is light material; make it slightly transparent
      if (n.material === matDeck) {
        n.material.transparent = on;
        n.material.opacity = on ? 0.75 : 1.0;
      }
    });

    infillGroup.visible = on;
  }

  function resetView() {
    fitCameraToObject(bridgeGroup, 1.35);
  }

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "c") setCutaway(!cutaway);   // cutaway toggle
    if (k === "r") resetView();            // reset
  });

  // ---------- Resize ----------
  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  // ---------- Render loop ----------
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}
