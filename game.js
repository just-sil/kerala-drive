import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const { clamp, lerp, damp, smoothstep } = THREE.MathUtils;

/* ------------------------------------------------------------------ */
/* Renderer, lights, sky                                               */
/* ------------------------------------------------------------------ */

const game = $('game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb9c2);
scene.fog = new THREE.FogExp2(0x9bb9c2, 0.0018);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, 1800);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
game.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xe4f3ff, 0x59634a, 2.0);
scene.add(hemi);

// The shadow box follows the car, so it can stay small and sharp.
const sun = new THREE.DirectionalLight(0xffe2b6, 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -95;
sun.shadow.camera.right = 95;
sun.shadow.camera.top = 95;
sun.shadow.camera.bottom = -95;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 620;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

const skyGeo = new THREE.SphereGeometry(1500, 24, 12);
skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
  vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false
}));
sky.renderOrder = -3;
sky.frustumCulled = false;
scene.add(sky);

function skyBody(color, size) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 10),
    new THREE.MeshBasicMaterial({ color, fog: false, depthWrite: false, transparent: true, toneMapped: false })
  );
  m.scale.setScalar(size);
  m.renderOrder = -2;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}
const sunDisc = skyBody(0xfff1cf, 34);
const moonDisc = skyBody(0xdfe6f5, 20);

const starGeo = new THREE.BufferGeometry();
{
  const pts = [];
  for (let i = 0; i < 700; i++) {
    const a = Math.random() * TAU;
    const y = 0.04 + Math.random() * 0.96;
    const r = Math.sqrt(1 - y * y);
    pts.push(Math.cos(a) * r * 1400, y * 1400, Math.sin(a) * r * 1400);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
  color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false
}));
stars.frustumCulled = false;
scene.add(stars);

const RAIN_N = 1400;
const rainPos = new Float32Array(RAIN_N * 6);
const rainOff = [];
for (let i = 0; i < RAIN_N; i++) rainOff.push([Math.random() * 44 - 22, Math.random() * 16, Math.random() * 44 - 22]);
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({
  color: 0xdfe9ec, transparent: true, opacity: 0, depthWrite: false
}));
rain.frustumCulled = false;
rain.visible = false;
scene.add(rain);

const headSpot = new THREE.SpotLight(0xfff0d0, 0, 160, 0.6, 0.7, 1.6);

/* ------------------------------------------------------------------ */
/* Materials and shared geometry                                       */
/* ------------------------------------------------------------------ */

const matCache = new Map();
function mat(color, roughness = 0.9, metalness = 0) {
  const key = color + '|' + roughness + '|' + metalness;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    matCache.set(key, m);
  }
  return m;
}

function overlay(color, roughness, layer) {
  return new THREE.MeshStandardMaterial({
    color, roughness, polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer
  });
}

const mats = {
  grass: mat(0x6d9560),
  deepGrass: mat(0x557c50),
  sand: mat(0xcdbb8a),
  sea: mat(0x398b9a, 0.42),
  wave: mat(0x83c2bc),
  leaf: mat(0x315b3b),
  leaf2: mat(0x477347),
  tea: mat(0x55854c),
  trunk: mat(0x76553b),
  white: mat(0xe9e8dd),
  red: mat(0xb83d32),
  black: mat(0x202526),
  yellow: mat(0xd7a83d),
  pole: mat(0x6d7471, 0.7),
  door: mat(0x554c3e),
  winDark: mat(0x5d7f86, 0.4),
  laterite: overlay(0xa96f4c, 0.95, 1),
  water: overlay(0x4a9c9e, 0.38, 1),
  road: overlay(0x343a3a, 0.9, 2),
  line: overlay(0xe8dfbd, 0.8, 3),
  glass: new THREE.MeshStandardMaterial({ color: 0x8eb7c0, metalness: 0.25, roughness: 0.2, transparent: true, opacity: 0.72 }),
  winLit: new THREE.MeshStandardMaterial({ color: 0x83a6a6, roughness: 0.4, emissive: 0xffc56a, emissiveIntensity: 0 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xffe7ad, roughness: 0.4, emissive: 0xffe2a0, emissiveIntensity: 0.1 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x9b2927, roughness: 0.5, emissive: 0xff2a1a, emissiveIntensity: 0.1 }),
  brake: new THREE.MeshStandardMaterial({ color: 0x9b2927, roughness: 0.5, emissive: 0xff2a1a, emissiveIntensity: 0.1 }),
  bulb: new THREE.MeshStandardMaterial({ color: 0xd9d6c8, roughness: 0.5, emissive: 0xffd48a, emissiveIntensity: 0 })
};

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
mats.pool = new THREE.MeshBasicMaterial({
  map: glowTexture(), color: 0xffc777, transparent: true, opacity: 0, depthWrite: false,
  blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
});

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  sphere: new THREE.SphereGeometry(1, 14, 10),
  ball: new THREE.SphereGeometry(1, 7, 5),
  bush: new THREE.SphereGeometry(1, 6, 4),
  frond: new THREE.ConeGeometry(1, 1, 5),
  pyramid: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
  hull: new THREE.ConeGeometry(1.3, 7, 4),
  trunk: new THREE.CylinderGeometry(0.6, 1, 1, 7),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  wheel: new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2)
};
for (const g of Object.values(GEO)) g.userData.shared = true;

function mesh(geo, material, parent) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cube(parent, material, x, y, z, sx, sy, sz) {
  const m = mesh(GEO.box, material, parent);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}

function group(parent = scene) {
  const g = new THREE.Group();
  parent.add(g);
  return g;
}

// Small seeded generator so every visit to a place builds the same town.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = prng(1);
const rr = (a, b) => a + (b - a) * rnd();
const pick = (list) => list[Math.floor(rnd() * list.length)];

/* ------------------------------------------------------------------ */
/* Places                                                              */
/* ------------------------------------------------------------------ */

const ghat = [];
for (let i = 0; i <= 24; i++) ghat.push([80 + Math.sin(i * 0.42) * 95, 270 - i * 22]);

const placeData = {
  malabar: {
    title: 'MALABAR',
    note: 'A laid-back northern Kerala coastal town.',
    sky: 0x9bb9c2, fogDensity: 0.0018, seed: 11, sea: true, topSpeed: 38,
    roads: [
      { w: 12, pts: [[15, -365], [20, -220], [10, -80], [15, 60], [24, 200], [14, 365]] },
      { w: 9, pts: [[12, -40], [-150, -42], [-270, -70], [-300, 0], [-298, 130], [-280, 240], [-180, 270], [-60, 262], [18, 255]] },
      { w: 10, pts: [[16, 105], [120, 100], [230, 112], [350, 105]] },
      { w: 9, pts: [[18, -190], [110, -205], [220, -170], [300, -60], [330, 60], [345, 104]] }
    ],
    spawn: 0.736,
    lagoon: { x: -90, z: -185, w: 115, l: 250, rot: 0.12 },
    traffic: 9, mix: ['bus', 'auto', 'car', 'car', 'auto', 'car'],
    houseStep: 30, houseProb: 0.5, shopRoads: [2], treeProb: 0.65, tree: 'coconut', groves: 150,
    lampStep: 54, lampRoads: [0, 2],
    areas: [
      { n: 'DRIVE-IN BEACH', box: [-400, -60, -285, 260] },
      { n: 'KAYAL LAGOON', box: [-170, -330, -15, -45] },
      { n: 'TOWN JUNCTION', box: [120, 70, 350, 140] },
      { n: 'VILLAGE ROAD', box: [150, -230, 350, 40] }
    ]
  },
  kochi: {
    title: 'KOCHI',
    note: 'A lively waterfront city of bridges and backwaters.',
    sky: 0xa6b9bd, fogDensity: 0.0018, seed: 23, sea: true, topSpeed: 38,
    roads: [
      { w: 12, pts: [[15, -365], [15, 365]] },
      { w: 10, pts: [[-285, -250], [-285, 300]] },
      { w: 10, pts: [[-285, -180], [15, -180]] },
      { w: 10, pts: [[-285, -40], [330, -40]] },
      { w: 10, pts: [[-285, 100], [330, 100]] },
      { w: 9, pts: [[-285, 235], [330, 235]] },
      { w: 9, pts: [[180, -40], [180, 235]] },
      { w: 9, pts: [[330, -40], [330, 235]] }
    ],
    spawn: 0.736,
    lagoon: { x: -90, z: -185, w: 115, l: 250, rot: 0, bridgeZ: -180 },
    traffic: 14, mix: ['bus', 'auto', 'car', 'auto', 'car', 'bus', 'car'],
    houseStep: 17, houseProb: 0.78, shopRoads: 'all', treeProb: 0.22, tree: 'forest', groves: 30,
    lampStep: 36, lampRoads: 'all',
    areas: [
      { n: 'MARINE DRIVE', box: [-310, -250, -262, 300] },
      { n: 'BACKWATER BRIDGE', box: [-155, -196, -25, -164] },
      { n: 'MG ROAD', box: [3, -365, 27, 365] },
      { n: 'EAST MARKET', box: [165, 60, 345, 140] }
    ]
  },
  wayanad: {
    title: 'WAYANAD',
    note: 'Cool highland air, tea slopes and winding ghat roads.',
    sky: 0x91aeb0, fogDensity: 0.0025, seed: 37, sea: false, topSpeed: 30,
    roads: [
      { w: 9, pts: ghat },
      { w: 7, pts: [[59, 94], [-60, 112], [-180, 70], [-255, -30], [-215, -150], [-90, -190], [40, -170], [172, -150]] }
    ],
    spawn: 0.04,
    lagoon: null,
    traffic: 6, mix: ['car', 'bus', 'car', 'auto'],
    houseStep: 60, houseProb: 0.4, shopRoads: [], treeProb: 0.7, tree: 'forest', groves: 170,
    lampStep: 0, lampRoads: [],
    areas: [
      { n: 'GHAT HAIRPINS', box: [-30, 150, 200, 300] },
      { n: 'TEA ESTATE', box: [-280, -210, 40, 125] },
      { n: 'FOREST EDGE', box: [60, -270, 210, -120] }
    ]
  }
};

/* ------------------------------------------------------------------ */
/* World state                                                         */
/* ------------------------------------------------------------------ */

let world = group();
let roads = [];
let loops = [];
let colliders = [];
let occupied = [];
let hillList = [];
let waves = [];
let traffic = [];
let batches = new Map();
let player = null;
let place = placeData.malabar;
let activePlace = 'malabar';
let builtPlace = null;
let paused = true;
let cameraMode = 0;

let speed = 0;
let heading = 0;
let steer = 0;
let trip = 0;
let offroad = false;
let hitCooldown = 0;

let clockTime = 16.7;
let nightF = 0;
let weather = 'clear';
let wxCloud = 0;
let wxRain = 0;
let wet = 0;
let wxTimer = 90;
let frame = 0;
let last = 0;
let toastTimer;
let currentArea = '';
const seenAreas = new Set();

const keys = {};
const touch = {};
const isTouch = matchMedia('(pointer: coarse)').matches;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
};

/* ------------------------------------------------------------------ */
/* Static scenery is batched into instanced meshes                     */
/* ------------------------------------------------------------------ */

const P0 = new THREE.Object3D();
const C0 = new THREE.Object3D();

function at(x, z, ry = 0, s = 1) {
  P0.position.set(x, 0, z);
  P0.rotation.set(0, ry, 0);
  P0.scale.setScalar(s);
  P0.updateMatrix();
}

function put(geo, material, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, shadow = true) {
  C0.position.set(x, y, z);
  C0.scale.set(sx, sy, sz);
  C0.rotation.set(rx, ry, rz);
  C0.updateMatrix();
  const key = geo.uuid + material.uuid + shadow;
  let b = batches.get(key);
  if (!b) batches.set(key, b = { geo, material, shadow, list: [] });
  b.list.push(new THREE.Matrix4().multiplyMatrices(P0.matrix, C0.matrix));
}

function flush() {
  for (const b of batches.values()) {
    const im = new THREE.InstancedMesh(b.geo, b.material, b.list.length);
    b.list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = b.shadow;
    im.receiveShadow = true;
    world.add(im);
  }
  batches.clear();
}

function clearWorld() {
  world.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
  });
  scene.remove(world);
  world = group();
  roads = [];
  loops = [];
  colliders = [];
  occupied = [];
  hillList = [];
  waves = [];
  traffic = [];
  player = null;
}

/* ------------------------------------------------------------------ */
/* Roads                                                               */
/* ------------------------------------------------------------------ */

const ROAD_STEP = 6;

function addRoad(def) {
  let pts;
  if (def.pts.length === 2) {
    const [a, b] = def.pts;
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / ROAD_STEP);
    pts = [];
    for (let i = 0; i <= n; i++) pts.push({ x: lerp(a[0], b[0], i / n), z: lerp(a[1], b[1], i / n) });
  } else {
    const curve = new THREE.CatmullRomCurve3(def.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    pts = curve.getSpacedPoints(Math.ceil(curve.getLength() / ROAD_STEP)).map((p) => ({ x: p.x, z: p.z }));
  }
  const r = { id: roads.length, pts, width: def.w, hw: def.w / 2, x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
  pts.forEach((p, i) => {
    const a = pts[Math.max(i - 1, 0)];
    const b = pts[Math.min(i + 1, pts.length - 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    p.tx = (b.x - a.x) / l;
    p.tz = (b.z - a.z) / l;
    // Left of travel. Traffic keeps left, as in Kerala.
    p.lx = p.tz;
    p.lz = -p.tx;
    r.x0 = Math.min(r.x0, p.x); r.x1 = Math.max(r.x1, p.x);
    r.z0 = Math.min(r.z0, p.z); r.z1 = Math.max(r.z1, p.z);
  });
  roads.push(r);
}

// Distance from a point to the nearest road edge (negative when on the tarmac).
function roadDist(x, z, skip = -1) {
  let best = 1e9;
  for (const r of roads) {
    if (r.id === skip) continue;
    const bx = Math.max(r.x0 - x, 0, x - r.x1);
    const bz = Math.max(r.z0 - z, 0, z - r.z1);
    if (Math.hypot(bx, bz) - r.hw >= best) continue;
    const p = r.pts;
    for (let i = 0; i < p.length - 1; i++) {
      const ax = p[i].x, az = p[i].z;
      const dx = p[i + 1].x - ax, dz = p[i + 1].z - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t) - r.hw;
      if (d < best) best = d;
    }
  }
  return best;
}

function ribbon(r, off, width, y, material, mask) {
  const pos = [];
  const nor = [];
  const idx = [];
  for (const p of r.pts) {
    const cx = p.x + p.lx * off;
    const cz = p.z + p.lz * off;
    pos.push(cx + p.lx * width / 2, y, cz + p.lz * width / 2, cx - p.lx * width / 2, y, cz - p.lz * width / 2);
    nor.push(0, 1, 0, 0, 1, 0);
  }
  for (let i = 0; i < r.pts.length - 1; i++) {
    if (mask && mask[i]) continue;
    const k = i * 2;
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  world.add(m);
}

function drawRoads() {
  at(0, 0);
  for (const r of roads) {
    ribbon(r, 0, r.width + 2.4, 0, mats.laterite);
    ribbon(r, 0, r.width, 0.01, mats.road);
    for (const side of [-1, 1]) {
      const off = side * (r.hw - 0.4);
      const mask = r.pts.map((p) => roadDist(p.x + p.lx * off, p.z + p.lz * off, r.id) < 0.4);
      ribbon(r, off, 0.14, 0.02, mats.line, mask);
    }
    for (let i = 1; i < r.pts.length - 1; i += 2) {
      const p = r.pts[i];
      if (roadDist(p.x, p.z, r.id) < 1) continue;
      put(GEO.plane, mats.line, p.x, 0.02, p.z, 0.16, 1, 5, 0, Math.atan2(p.tx, p.tz), 0, false);
    }
  }
}

// A closed lap of a road: up the left lane, round the end, back down the other side.
function laneLoop(r) {
  const d = r.width / 4;
  const P = r.pts;
  const n = P.length;
  const pts = [];
  for (let i = 0; i < n; i++) pts.push({ x: P[i].x + P[i].lx * d, z: P[i].z + P[i].lz * d });
  const e = P[n - 1];
  for (let k = 1; k < 6; k++) {
    const t = k / 6 * Math.PI;
    pts.push({ x: e.x + d * (e.lx * Math.cos(t) + e.tx * Math.sin(t)), z: e.z + d * (e.lz * Math.cos(t) + e.tz * Math.sin(t)), slow: true });
  }
  for (let i = n - 1; i >= 0; i--) pts.push({ x: P[i].x - P[i].lx * d, z: P[i].z - P[i].lz * d });
  const s = P[0];
  for (let k = 1; k < 6; k++) {
    const t = k / 6 * Math.PI;
    pts.push({ x: s.x - d * (s.lx * Math.cos(t) + s.tx * Math.sin(t)), z: s.z - d * (s.lz * Math.cos(t) + s.tz * Math.sin(t)), slow: true });
  }
  const cum = [0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return { pts, cum, len: cum[pts.length] };
}

function loopPose(loop, s) {
  s = ((s % loop.len) + loop.len) % loop.len;
  let lo = 0;
  let hi = loop.pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (loop.cum[mid] <= s) lo = mid; else hi = mid - 1;
  }
  const a = loop.pts[lo];
  const b = loop.pts[(lo + 1) % loop.pts.length];
  const f = (s - loop.cum[lo]) / (loop.cum[lo + 1] - loop.cum[lo] || 1);
  return {
    x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f),
    h: Math.atan2(b.x - a.x, b.z - a.z),
    slow: !!(a.slow || b.slow)
  };
}

/* ------------------------------------------------------------------ */
/* Placement helpers and colliders                                     */
/* ------------------------------------------------------------------ */

function boxCollider(x, z, hw, hd, rot = 0) {
  colliders.push({ t: 1, x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot), br2: (Math.hypot(hw, hd) + 3) ** 2 });
}

function inLagoon(x, z, margin = 0) {
  const l = place.lagoon;
  if (!l) return false;
  const dx = x - l.x;
  const dz = z - l.z;
  const c = Math.cos(l.rot);
  const s = Math.sin(l.rot);
  return Math.abs(dx * c - dz * s) < l.w / 2 + margin && Math.abs(dx * s + dz * c) < l.l / 2 + margin;
}

function inWater(x, z, margin = 0) {
  return (place.sea && x < -300 + margin) || inLagoon(x, z, margin);
}

function inHill(x, z, margin = 0) {
  for (const h of hillList) {
    const qx = (x - h.x) / (h.rx + margin);
    const qz = (z - h.z) / (h.rz + margin);
    if (qx * qx + qz * qz < 1) return true;
  }
  return false;
}

function blocked(x, z, r) {
  if (Math.abs(x) > 520 || Math.abs(z) > 400) return true;
  if (inWater(x, z, r) || inHill(x, z, r)) return true;
  for (const o of occupied) {
    if (Math.hypot(o[0] - x, o[1] - z) < o[2] + r) return true;
  }
  return false;
}

function everyN(r, step, fn) {
  const k = Math.max(1, Math.round(step / ROAD_STEP));
  for (let i = Math.floor(rnd() * k); i < r.pts.length; i += k) fn(r.pts[i]);
}

/* ------------------------------------------------------------------ */
/* Scenery pieces                                                      */
/* ------------------------------------------------------------------ */

function hill(x, z, rx, rz, h, color) {
  // Hills never sit on a road: shrink them to fit, or leave them out.
  const fit = (roadDist(x, z) - 8) / Math.max(rx, rz);
  if (fit < 0.35) return;
  const k = Math.min(1, fit);
  rx *= k; rz *= k; h *= k;
  at(0, 0);
  put(GEO.sphere, mat(color), x, h * 0.28, z, rx, h, rz);
  hillList.push({ x, z, rx: rx * 0.96, rz: rz * 0.96 });
  colliders.push({ t: 2, x, z, rx: rx * 0.96, rz: rz * 0.96 });
}

function tree(x, z, type, scale) {
  at(x, z, rnd() * TAU, scale);
  if (type === 'coconut') {
    const lean = rr(-0.1, 0.1);
    const tz = Math.sin(lean) * 4;
    put(GEO.trunk, mats.trunk, 0, 4, 0, 0.3, 8, 0.3, lean, 0, 0);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      put(GEO.frond, mats.leaf, Math.cos(a) * 1.8, 8.1 + Math.sin(a) * 0.2, tz + Math.sin(a) * 1.8,
        0.34, 5.3, 0.34, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    }
    put(GEO.ball, mats.leaf2, 0, 8, tz, 0.55, 0.55, 0.55);
  } else {
    put(GEO.trunk, mats.trunk, 0, 2, 0, 0.4, 4, 0.4);
    put(GEO.ball, mats.leaf2, 0, 5, 0, 2.3, 2.3, 2.3);
    put(GEO.ball, mats.leaf, 0.9, 6.3, 0.5, 1.5, 1.4, 1.5);
  }
  colliders.push({ t: 0, x, z, r: 0.45 * scale });
  occupied.push([x, z, 1.3]);
}

const SIGNS = [
  ['ചായക്കട', '#1b6b3a'], ['ബേക്കറി', '#b3261e'], ['തുണിക്കട', '#6a2c91'],
  ['മെഡിക്കൽ സ്റ്റോർ', '#0b6aa8'], ['സൂപ്പർ മാർക്കറ്റ്', '#d17a00'], ['ഹോട്ടൽ', '#7a4a21']
];
let signMats = null;

function makeSigns() {
  signMats = SIGNS.map(([text, bg]) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = '#fff';
    g.lineWidth = 4;
    g.strokeRect(3, 3, 250, 58);
    g.fillStyle = '#fff';
    g.font = 'bold 30px "Baloo Chettan 2","Noto Sans Malayalam","Nirmala UI",Kartika,sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
  });
}

const HOUSE_WALLS = [0xe4d8bd, 0xe9dfcf, 0xd9cdb2, 0xdfe3d0, 0xe6cfc0];
const SHOP_WALLS = [0xd5c6a4, 0xcfd8c8, 0xe2c9b0, 0xc9d3dc, 0xe3d6a8];
const ROOFS = [0x8a4d3a, 0x7b4a39, 0x9a5a40];
const AWNINGS = [0xb83d32, 0x276348, 0xd7a83d, 0x2f5a7a];

function house(x, z, ry, kind, w, d) {
  at(x, z, ry);
  const shop = kind === 'shop';
  const storeys = shop && rnd() < 0.45 ? 2 : 1;
  const h = storeys === 2 ? 7.6 : 4.4;
  const roof = mat(pick(ROOFS));
  put(GEO.box, mat(pick(shop ? SHOP_WALLS : HOUSE_WALLS)), 0, h / 2, 0, w, h, d);
  put(GEO.pyramid, roof, 0, h + 1.2, 0, w * 1.14, 2.4, d * 1.14);
  put(GEO.box, mats.door, shop ? w * 0.3 : 0, 1.15, d / 2 + 0.04, 1.3, 2.3, 0.12, 0, 0, 0, false);
  for (let s = 0; s < storeys; s++) {
    for (const side of [-1, 1]) {
      if (shop && s === 0 && side === 1) continue;
      put(GEO.box, rnd() < 0.6 ? mats.winLit : mats.winDark, side * w * 0.25, 2.7 + s * 3.4, d / 2 + 0.07, 1.3, 1.2, 0.1, 0, 0, 0, false);
    }
  }
  if (shop) {
    put(GEO.box, pick(signMats), 0, 4.05, d / 2 + 0.1, w * 0.66, 0.85, 0.12, 0, 0, 0, false);
    put(GEO.box, mat(pick(AWNINGS)), 0, 3.3, d / 2 + 0.9, w * 0.92, 0.1, 1.8, 0.2, 0, 0);
  } else {
    put(GEO.box, roof, 0, 3.1, d / 2 + 1.3, w * 0.72, 0.16, 2.6, 0.1, 0, 0);
    for (const side of [-1, 1]) put(GEO.box, mats.white, side * w * 0.3, 1.5, d / 2 + 2.3, 0.22, 3, 0.22);
  }
  boxCollider(x, z, w / 2 + 0.15, d / 2 + 0.15, ry);
  occupied.push([x, z, Math.hypot(w, d) / 2 * 0.92]);
}

function tryHouse(pt, side, r, kind) {
  const w = rr(7, 12);
  const d = rr(6, 11);
  const nx = pt.lx * side;
  const nz = pt.lz * side;
  const off = r.hw + (kind === 'shop' ? rr(3.2, 4.5) : rr(6, 10)) + d / 2;
  const x = pt.x + nx * off;
  const z = pt.z + nz * off;
  const ry = Math.atan2(-nx, -nz);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2 + 2.6], [w / 2, d / 2 + 2.6], [0, d / 2 + 2.6]]) {
    const wx = x + lx * c + lz * s;
    const wz = z - lx * s + lz * c;
    if (roadDist(wx, wz) < 1.6 || inWater(wx, wz, 2)) return;
  }
  if (blocked(x, z, Math.hypot(w, d) / 2 * 0.92)) return;
  house(x, z, ry, kind, w, d);
}

function lamp(x, z, ry) {
  at(x, z, ry);
  put(GEO.cyl, mats.pole, 0, 3.5, 0, 0.09, 7, 0.09);
  put(GEO.box, mats.pole, 0, 6.95, 0.9, 0.08, 0.08, 1.9, 0, 0, 0, false);
  put(GEO.ball, mats.bulb, 0, 6.85, 1.8, 0.24, 0.13, 0.34, 0, 0, 0, false);
  put(GEO.plane, mats.pool, 0, 0.03, 2.6, 11, 1, 11, 0, 0, 0, false);
  colliders.push({ t: 0, x, z, r: 0.22 });
  occupied.push([x, z, 0.6]);
}

function terrain() {
  const p = place;
  at(0, 0);
  const west = p.sea ? -300 : -560;
  put(GEO.plane, mats.grass, (west + 560) / 2, -0.05, 107.5, 560 - west, 1, 635, 0, 0, 0, false);
  put(GEO.plane, mats.deepGrass, (west + 560) / 2, -0.05, -505, 560 - west, 1, 590, 0, 0, 0, false);

  if (p.sea) {
    put(GEO.plane, mats.sand, -346, -0.05, 0, 92, 1, 1400, 0, 0, 0, false);
    put(GEO.plane, mats.sea, -640, -0.25, 0, 520, 1, 1400, 0, 0, 0, false);
    for (let i = 0; i < 5; i++) {
      const wave = cube(world, mats.wave, -398 - i * 15, -0.19, 0, 1.6, 0.12, 760);
      wave.castShadow = false;
      waves.push({ m: wave, x: -398 - i * 15, ph: i * 1.3 });
    }
  }

  const l = p.lagoon;
  if (l) {
    put(GEO.plane, mats.water, l.x, 0, l.z, l.w, 1, l.l, 0, l.rot, 0, false);
    if (l.bridgeZ !== undefined) {
      const top = l.z - l.l / 2;
      const bot = l.z + l.l / 2;
      boxCollider(l.x, (top + l.bridgeZ - 6.3) / 2, l.w / 2, (l.bridgeZ - 6.3 - top) / 2);
      boxCollider(l.x, (bot + l.bridgeZ + 6.3) / 2, l.w / 2, (bot - l.bridgeZ - 6.3) / 2);
    } else {
      boxCollider(l.x, l.z, l.w / 2, l.l / 2, l.rot);
    }
  }

  if (activePlace === 'wayanad') {
    for (let i = 0; i < 18; i++) {
      hill(-420 + i * 48, -285 - rnd() * 100, rr(80, 160), rr(65, 150), rr(55, 110), 0x4e7352);
    }
    for (let i = 0; i < 26; i++) {
      hill(rr(-430, 430), rr(-230, 330), rr(32, 70), rr(25, 60), rr(22, 52), 0x62875a);
    }
  } else {
    for (let i = 0; i < 12; i++) {
      hill(-430 + i * 78, -330 - rnd() * 45, rr(55, 100), rr(48, 103), rr(35, 75), 0x63845a);
    }
    for (let i = 0; i < 7; i++) {
      hill(470 + rnd() * 40, -260 + i * 95, rr(40, 70), rr(45, 80), rr(25, 50), 0x5d8056);
    }
  }
}

function scenery() {
  const p = place;
  const allRoads = (list, i) => list === 'all' || list.includes(i);

  if (p.lampStep) {
    roads.forEach((r, ri) => {
      if (!allRoads(p.lampRoads, ri)) return;
      let side = 1;
      everyN(r, p.lampStep, (pt) => {
        side = -side;
        const o = r.hw + 1.5;
        const x = pt.x + pt.lx * o * side;
        const z = pt.z + pt.lz * o * side;
        if (roadDist(x, z) < 1 || blocked(x, z, 0.4)) return;
        lamp(x, z, Math.atan2(-pt.lx * side, -pt.lz * side));
      });
    });
  }

  if (activePlace === 'kochi') {
    // Bridge rails and pylons where the street crosses the backwater.
    at(0, 0);
    for (const s of [-1, 1]) {
      put(GEO.box, mats.white, -90, 1.05, -180 + s * 5.8, 122, 0.16, 0.2);
      for (let x = -150; x <= -30; x += 6) put(GEO.box, mats.white, x, 0.55, -180 + s * 5.8, 0.25, 1.1, 0.25);
      boxCollider(-90, -180 + s * 5.9, 61, 0.3);
      for (const x of [-128, -52]) put(GEO.box, mat(0xddd6c3), x, 8, -180 + s * 6.6, 1.2, 16, 1.2);
    }
    for (const x of [-128, -52]) put(GEO.box, mat(0xddd6c3), x, 15.4, -180, 1.2, 1.2, 14.4);

    for (let i = 0; i < 22; i++) {
      const x = -220 + i * 21;
      const h = rr(22, 77);
      if (roadDist(x, -270) < 9 || inWater(x, -270, 8)) continue;
      put(GEO.box, mat([0xb8c0b6, 0x9baeb0, 0xd0b9a0][i % 3]), x, h / 2, -270, 12, h, 12);
      for (let y = 5; y < h - 2; y += 7) put(GEO.box, rnd() < 0.7 ? mats.winLit : mats.winDark, x, y, -263.9, 8, 1, 0.2, 0, 0, 0, false);
      boxCollider(x, -270, 6.2, 6.2);
      occupied.push([x, -270, 9]);
    }
    for (let i = 0; i < 9; i++) {
      const z = -250 + i * 62;
      const h = rr(30, 70);
      put(GEO.box, mat([0x9baeb0, 0xd0b9a0, 0xb8c0b6][i % 3]), 420, h / 2, z, 16, h, 16);
      for (let y = 5; y < h - 2; y += 7) put(GEO.box, rnd() < 0.7 ? mats.winLit : mats.winDark, 411.9, y, z, 0.2, 1, 11, 0, 0, 0, false);
      boxCollider(420, z, 8.2, 8.2);
      occupied.push([420, z, 12]);
    }
  }

  roads.forEach((r, ri) => {
    const kind = allRoads(p.shopRoads, ri) ? 'shop' : 'tile';
    everyN(r, kind === 'shop' ? Math.min(p.houseStep, 19) : p.houseStep, (pt) => {
      for (const side of [-1, 1]) {
        if (rnd() < (kind === 'shop' ? Math.max(p.houseProb, 0.7) : p.houseProb)) tryHouse(pt, side, r, kind);
      }
    });
  });

  roads.forEach((r, ri) => {
    everyN(r, 10, (pt) => {
      for (const side of [-1, 1]) {
        if (rnd() > p.treeProb) continue;
        const o = r.hw + 2.4 + rnd() * 8;
        const x = pt.x + pt.lx * o * side;
        const z = pt.z + pt.lz * o * side;
        if (roadDist(x, z) < 1.8 || blocked(x, z, 1.4)) continue;
        // Marine Drive keeps its coconut palms.
        const type = activePlace === 'kochi' && ri === 1 ? 'coconut' : p.tree;
        tree(x, z, type, type === 'coconut' ? rr(0.75, 1.25) : rr(1, 1.7));
      }
    });
  });

  for (let i = 0; i < p.groves; i++) {
    const x = rr(p.sea ? -335 : -500, 500);
    const z = rr(-385, 385);
    if (roadDist(x, z) < 3 || blocked(x, z, 1.6)) continue;
    if (p.tree === 'coconut' || x < -300) tree(x, z, 'coconut', rr(0.75, 1.25));
    else tree(x, z, 'forest', rr(1, 1.8));
  }

  if (activePlace === 'malabar') {
    for (let i = 0; i < 7; i++) {
      const x = -372 + (i % 3) * 7;
      const z = -90 + i * 24;
      at(x, z, rr(-0.4, 0.4));
      put(GEO.hull, mat(0x6b4534), 0, 0.35, 0, 1, 1, 1, 0, 0, Math.PI / 2);
      put(GEO.box, mat(0xe4d4b3), 0, 1.1, 0, 0.2, 1.3, 0.2);
      colliders.push({ t: 0, x, z, r: 2 });
    }
  }

  if (activePlace === 'wayanad') {
    // Tea rows follow the slope in soft curves, and stay off roads, yards and hills.
    at(0, 0);
    let row = 0;
    for (let z0 = -262; z0 < 130; z0 += 9, row++) {
      for (let x = -352 + (row % 2) * 3; x < 335; x += 6.5) {
        const z = z0 + Math.sin(x * 0.03 + row * 0.2) * 5;
        if (roadDist(x, z) < 2.6 || blocked(x, z, 1.4)) continue;
        put(GEO.bush, row % 3 ? mats.leaf2 : mats.tea, x, 0.75, z, 3.1, 1.15, 2.1, 0, 0, 0, false);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Vehicles                                                            */
/* ------------------------------------------------------------------ */

function addWheel(v, x, z, r, width, spokes) {
  const steerNode = group(v);
  steerNode.position.set(x, r + 0.09, z);
  const spin = group(steerNode);
  const tyre = mesh(GEO.wheel, mats.black, spin);
  tyre.scale.set(width, r, r);
  const hub = mesh(GEO.wheel, mat(0x9da5a0, 0.45, 0.6), spin);
  hub.scale.set(width * 1.06, r * 0.46, r * 0.46);
  if (spokes) {
    for (const a of [0, Math.PI / 2]) {
      const bar = mesh(GEO.box, mats.black, spin);
      bar.scale.set(width * 1.1, r * 0.9, 0.06);
      bar.rotation.x = a;
    }
  }
  return { steerNode, spin };
}

function makeWagon(parent, paint = 0x9e3030, isPlayer = false) {
  const car = group(parent);
  const body = group(car);
  const base = new THREE.Color(paint);
  const shade = (k) => mat(base.clone().multiplyScalar(k).getHex());

  cube(body, shade(1), 0, 1.05, 0, 2.1, 1.25, 4.15);
  cube(body, shade(1.08), 0, 1.75, -0.15, 1.85, 1.0, 2.25);
  cube(body, mats.glass, 0, 2.05, -0.18, 1.72, 0.72, 2.08);
  cube(body, shade(0.8), 0, 2.38, -0.15, 1.9, 0.12, 2.35);
  cube(body, shade(0.88), 0, 1.2, 2.1, 2.0, 0.45, 0.18);
  cube(body, mat(0x242a2a), 0, 0.55, 2.12, 1.95, 0.3, 0.16);
  cube(body, mat(0x242a2a), 0, 0.55, -2.1, 1.95, 0.3, 0.16);

  for (const x of [-0.72, 0.72]) {
    cube(body, mats.lamp, x, 1.05, 2.13, 0.42, 0.25, 0.08).castShadow = false;
    cube(body, isPlayer ? mats.brake : mats.tail, x, 1.05, -2.12, 0.38, 0.23, 0.08).castShadow = false;
  }
  for (const x of [-1.12, 1.12]) cube(body, mats.black, x, 1.65, 0.5, 0.28, 0.18, 0.38);
  if (isPlayer) cube(body, mats.white, 0, 0.78, -2.16, 0.62, 0.2, 0.04).castShadow = false;

  const wheels = [];
  for (const x of [-1.09, 1.09]) {
    for (const z of [-1.35, 1.35]) {
      const w = addWheel(car, x, z, 0.43, 0.22, isPlayer);
      w.front = z > 0;
      wheels.push(w);
    }
  }
  car.userData = { body, wheels };
  return car;
}

function makeBus(parent, paint = 0xc83c32) {
  const v = group(parent);
  const glass = mat(0x526e73, 0.25);
  cube(v, mat(paint), 0, 1.74, 0, 2.65, 3.25, 9.8);
  cube(v, glass, 0, 2.24, 0, 2.68, 1.25, 8.7);
  cube(v, mat(0xe8dfc9), 0, 0.81, 0, 2.68, 0.35, 9.7);
  cube(v, mat(0xe5dfce), 0, 2.95, 4.92, 1.5, 0.4, 0.08);
  cube(v, glass, 0, 2.2, 4.91, 2.3, 1.1, 0.06);
  for (const x of [-0.95, 0.95]) {
    cube(v, mats.lamp, x, 1.0, 4.92, 0.4, 0.25, 0.08).castShadow = false;
    cube(v, mats.tail, x, 1.0, -4.92, 0.36, 0.25, 0.08).castShadow = false;
  }
  for (const x of [-1.34, 1.34]) {
    for (const z of [-3.1, 3.2]) addWheel(v, x, z, 0.55, 0.28, false);
  }
  return v;
}

function makeAuto(parent) {
  const v = group(parent);
  const yellow = mat(0xd6ae37);
  cube(v, mat(0x276348), 0, 0.85, 0, 1.55, 0.85, 2.7);
  cube(v, yellow, 0, 1.7, -0.15, 1.5, 0.95, 1.8);
  cube(v, mats.glass, 0, 1.8, -0.15, 1.52, 0.62, 1.7);
  cube(v, yellow, 0, 0.85, 1.42, 1.5, 0.5, 0.18);
  cube(v, mats.lamp, 0, 1.15, 1.52, 0.3, 0.22, 0.06).castShadow = false;
  cube(v, mats.tail, 0, 0.8, -1.37, 0.9, 0.14, 0.06).castShadow = false;
  addWheel(v, 0, 1.0, 0.28, 0.16, false);
  for (const x of [-0.82, 0.82]) addWheel(v, x, -0.8, 0.28, 0.16, false);
  return v;
}

const VEHICLES = {
  car: { len: 4.2, wid: 2.1, max: 12, circles: [-1, 1], r: 1.05, horn: 440 },
  auto: { len: 2.9, wid: 1.55, max: 8.5, circles: [-0.6, 0.6], r: 0.85, horn: 620 },
  bus: { len: 9.8, wid: 2.65, max: 9.5, circles: [-3.5, -1.2, 1.2, 3.5], r: 1.45, horn: 300 }
};
const CAR_PAINTS = [0xe9e8dd, 0x7d8a8c, 0x2f5a7a, 0xd7a83d, 0x4a4f50, 0x8c5a3a];

function spawnPlayer() {
  player = makeWagon(world, 0x9e3030, true);
  const pose = loopPose(loops[0], loops[0].len * place.spawn);
  player.position.set(pose.x, 0, pose.z);
  heading = pose.h;
  player.rotation.y = heading;
  speed = 0;
  steer = 0;
  headSpot.position.set(0, 1.5, 2.0);
  headSpot.target.position.set(0, 0.1, 30);
  player.add(headSpot, headSpot.target);
}

function spawnTraffic() {
  const total = loops.reduce((a, l) => a + l.len, 0);
  let k = 0;
  loops.forEach((loop) => {
    const n = Math.max(1, Math.round(place.traffic * loop.len / total));
    for (let j = 0; j < n; j++) {
      const type = place.mix[k++ % place.mix.length];
      const spec = VEHICLES[type];
      const v = type === 'bus' ? makeBus(world, k % 2 ? 0xc33b32 : 0xd7c7a2)
        : type === 'auto' ? makeAuto(world)
          : makeWagon(world, pick(CAR_PAINTS));
      let s = (j + rnd() * 0.5) / n * loop.len;
      let pose = loopPose(loop, s);
      if (Math.hypot(pose.x - player.position.x, pose.z - player.position.z) < 35) {
        s += 60;
        pose = loopPose(loop, s);
      }
      v.position.set(pose.x, 0, pose.z);
      v.rotation.y = pose.h;
      traffic.push({ mesh: v, type, spec, loop, s, x: pose.x, z: pose.z, h: pose.h, v: spec.max * 0.6, max: spec.max * rr(0.85, 1.1), wait: 0, ghost: 0, honk: 0 });
    }
  });
}

function nearestLanePose(x, z) {
  let best = null;
  let bd = 1e9;
  for (const loop of loops) {
    for (let i = 0; i < loop.pts.length; i++) {
      const p = loop.pts[i];
      if (p.slow) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        const q = loop.pts[(i + 1) % loop.pts.length];
        best = { x: p.x, z: p.z, h: Math.atan2(q.x - p.x, q.z - p.z) };
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

const mapLayer = document.createElement('canvas');
mapLayer.width = 1100;
mapLayer.height = 850;

function drawMapLayer() {
  const g = mapLayer.getContext('2d');
  const X = (x) => x + 550;
  const Z = (z) => z + 425;
  g.fillStyle = '#2f4a3a';
  g.fillRect(0, 0, 1100, 850);
  g.fillStyle = '#29412f';
  g.fillRect(0, 0, 1100, Z(-210));
  if (place.sea) {
    g.fillStyle = '#b3a377';
    g.fillRect(0, 0, X(-300), 850);
    g.fillStyle = '#2c6b78';
    g.fillRect(0, 0, X(-390), 850);
  }
  const l = place.lagoon;
  if (l) {
    g.save();
    g.translate(X(l.x), Z(l.z));
    g.rotate(-l.rot);
    g.fillStyle = '#357f86';
    g.fillRect(-l.w / 2, -l.l / 2, l.w, l.l);
    g.restore();
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const pass of [['#1a2a2c', 5], ['#d9d4c2', 0]]) {
    g.strokeStyle = pass[0];
    for (const r of roads) {
      g.lineWidth = r.width + pass[1];
      g.beginPath();
      r.pts.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](X(p.x), Z(p.z)));
      g.stroke();
    }
  }
}

function buildPlace() {
  clearWorld();
  place = placeData[activePlace];
  builtPlace = activePlace;
  rnd = prng(place.seed);
  if (!signMats) makeSigns();

  place.roads.forEach(addRoad);
  loops = roads.map(laneLoop);
  terrain();
  drawRoads();
  scenery();
  flush();
  spawnPlayer();
  spawnTraffic();
  drawMapLayer();

  trip = 0;
  currentArea = '';
  updateSky(0, true);
  placeCamera(1);
}

/* ------------------------------------------------------------------ */
/* Sky, time of day and weather                                        */
/* ------------------------------------------------------------------ */

// hour, horizon (null = the place's own haze), zenith, sunlight, sun strength, ambient strength
const SKY_KEYS = [
  [0, 0x101b2e, 0x050914, 0x9db4e0, 0.5, 0.62],
  [5, 0x101b2e, 0x050914, 0x9db4e0, 0.5, 0.62],
  [6.2, 0xe6a27c, 0x4b6b9b, 0xffb070, 1.0, 1.0],
  [8, null, 0x5f9bd0, 0xffe2b6, 2.3, 2.0],
  [16.4, null, 0x5f9bd0, 0xffe2b6, 2.3, 2.0],
  [18.2, 0xf0a064, 0x54688f, 0xff9a55, 1.2, 1.1],
  [19.2, 0x2b3652, 0x0b1020, 0x9db4e0, 0.3, 0.7],
  [20.4, 0x101b2e, 0x050914, 0x9db4e0, 0.5, 0.62],
  [24, 0x101b2e, 0x050914, 0x9db4e0, 0.5, 0.62]
];
const cHor = new THREE.Color();
const cZen = new THREE.Color();
const cSun = new THREE.Color();
const cA = new THREE.Color();
const cB = new THREE.Color();
const cGrey = new THREE.Color();
const sunDir = new THREE.Vector3();
const moonDir = new THREE.Vector3(-0.35, 0.8, 0.45).normalize();
const DAY_HEMI = new THREE.Color(0xe4f3ff);
const NIGHT_HEMI = new THREE.Color(0x7388b8);
const DRY_ROAD = new THREE.Color(0x343a3a);
const WET_ROAD = new THREE.Color(0x1d2122);

const WEATHER_NEXT = { clear: 'cloudy', cloudy: 'rain', rain: 'clear' };

function setWeather(name, announce) {
  weather = name;
  wxTimer = 80 + Math.random() * 70;
  if (announce) showToast({ clear: 'SKIES CLEARING', cloudy: 'CLOUDS ROLLING IN', rain: 'MONSOON RAIN' }[name]);
}

function weatherLabel() {
  const night = nightF > 0.6;
  if (weather === 'rain') return night ? 'NIGHT RAIN' : 'MONSOON RAIN';
  if (weather === 'cloudy') return night ? 'CLOUDY NIGHT' : 'OVERCAST';
  if (night) return 'CLEAR NIGHT';
  if (activePlace === 'wayanad' && clockTime < 9) return 'MORNING MIST';
  if (clockTime > 17.2 && clockTime < 19) return 'GOLDEN HOUR';
  return 'CLEAR SKIES';
}

function updateSky(dt, force) {
  const t = clockTime;
  let i = 0;
  while (i < SKY_KEYS.length - 2 && t >= SKY_KEYS[i + 1][0]) i++;
  const a = SKY_KEYS[i];
  const b = SKY_KEYS[i + 1];
  const k = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
  const hor = (key) => (key[1] === null ? place.sky : key[1]);
  cHor.copy(cA.setHex(hor(a))).lerp(cB.setHex(hor(b)), k);
  cZen.copy(cA.setHex(a[2])).lerp(cB.setHex(b[2]), k);
  cSun.copy(cA.setHex(a[3])).lerp(cB.setHex(b[3]), k);
  let sunI = lerp(a[4], b[4], k);
  let hemiI = lerp(a[5], b[5], k);

  nightF = t < 5 ? 1 : t < 6.4 ? 1 - smoothstep(t, 5, 6.4) : t < 18.3 ? 0 : smoothstep(t, 18.3, 19.8);

  // Weather eases in and out rather than snapping.
  const ease = force ? 1 : Math.min(1, dt * 0.25);
  wxCloud += ((weather === 'clear' ? 0 : 1) - wxCloud) * ease;
  wxRain += ((weather === 'rain' ? 1 : 0) - wxRain) * ease;
  wet += (wxRain - wet) * (force ? 1 : Math.min(1, dt * 0.12));

  cGrey.setHex(0x8f9a9d).multiplyScalar(1 - nightF * 0.86);
  cHor.lerp(cGrey, wxCloud * 0.78);
  cZen.lerp(cGrey.multiplyScalar(0.82), wxCloud * 0.88);
  sunI *= 1 - 0.65 * wxCloud;
  hemiI *= 1 - 0.22 * wxCloud;

  scene.background.copy(cHor);
  scene.fog.color.copy(cHor);
  const mist = activePlace === 'wayanad' ? 0.35 * (1 - smoothstep(t, 6, 10)) + 0.3 * nightF : 0;
  scene.fog.density = place.fogDensity * (1 + 0.5 * wxCloud + 1.3 * wxRain + mist);

  const th = (t - 6) / 12 * Math.PI;
  sunDir.set(Math.cos(th) * 0.85, Math.sin(th), 0.38).normalize();
  const day = sunDir.y > 0.06;
  const dir = day ? sunDir : moonDir;
  const px = player ? Math.round(player.position.x / 2) * 2 : 0;
  const pz = player ? Math.round(player.position.z / 2) * 2 : 0;
  sun.target.position.set(px, 0, pz);
  sun.position.set(px + dir.x * 260, dir.y * 260, pz + dir.z * 260);
  sun.color.copy(cSun);
  sun.intensity = sunI;
  hemi.intensity = hemiI;
  hemi.color.copy(DAY_HEMI).lerp(NIGHT_HEMI, nightF);

  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  stars.material.opacity = nightF * (1 - wxCloud * 0.9);
  stars.visible = stars.material.opacity > 0.02;
  sunDisc.position.copy(camera.position).addScaledVector(sunDir, 1300);
  sunDisc.material.color.copy(cSun).lerp(cA.setHex(0xffffff), 0.35);
  sunDisc.material.opacity = smoothstep(sunDir.y, -0.04, 0.03) * (1 - wxCloud * 0.85);
  sunDisc.visible = sunDisc.material.opacity > 0.02;
  moonDisc.position.copy(camera.position).addScaledVector(moonDir, 1300);
  moonDisc.material.opacity = nightF * (1 - wxCloud * 0.8);
  moonDisc.visible = moonDisc.material.opacity > 0.02;

  if (force || frame % 8 === 0) {
    const pos = skyGeo.attributes.position;
    const col = skyGeo.attributes.color;
    for (let v = 0; v < pos.count; v++) {
      cA.copy(cHor).lerp(cZen, smoothstep(pos.getY(v) / 1500, 0.02, 0.6));
      col.setXYZ(v, cA.r, cA.g, cA.b);
    }
    col.needsUpdate = true;
  }

  // Lights come on at dusk and in the rain.
  const lights = Math.max(nightF, wxRain * 0.55);
  mats.winLit.emissiveIntensity = nightF * 1.5;
  mats.bulb.emissiveIntensity = lights * 2.4;
  mats.lamp.emissiveIntensity = 0.12 + lights * 2.6;
  mats.tail.emissiveIntensity = 0.12 + lights * 1.2;
  mats.pool.opacity = nightF * 0.3;
  mats.pool.visible = nightF > 0.02;
  headSpot.intensity = lights * 1300;
  if (signMats) for (const m of signMats) m.emissiveIntensity = nightF * 0.55;

  mats.road.roughness = lerp(0.9, 0.32, wet);
  mats.road.color.copy(DRY_ROAD).lerp(WET_ROAD, wet);

  rain.visible = wxRain > 0.02;
  rain.material.opacity = wxRain * 0.5;
}

function updateRain(dt, dx, dz) {
  const wrap = (v) => ((v + 22) % 44 + 44) % 44 - 22;
  const cx = camera.position.x;
  const cz = camera.position.z;
  for (let i = 0; i < RAIN_N; i++) {
    const q = rainOff[i];
    q[1] -= 26 * dt;
    if (q[1] < 0) q[1] += 16;
    q[0] = wrap(q[0] - dx);
    q[2] = wrap(q[2] - dz);
    const k = i * 6;
    rainPos[k] = cx + q[0];
    rainPos[k + 1] = q[1];
    rainPos[k + 2] = cz + q[2];
    rainPos[k + 3] = cx + q[0] + 0.06;
    rainPos[k + 4] = q[1] + 0.85;
    rainPos[k + 5] = cz + q[2];
  }
  rainGeo.attributes.position.needsUpdate = true;
}

/* ------------------------------------------------------------------ */
/* Sound                                                               */
/* ------------------------------------------------------------------ */

let au = null;
let muted = store.get('kd-muted') === '1';

function initAudio() {
  if (au) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const c = new AC();
  const master = c.createGain();
  master.gain.value = 0;
  master.connect(c.destination);

  const engine = c.createOscillator();
  const sub = c.createOscillator();
  const filter = c.createBiquadFilter();
  const engineGain = c.createGain();
  engine.type = 'sawtooth';
  sub.type = 'square';
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  engineGain.gain.value = 0.04;
  engine.connect(filter);
  sub.connect(filter);
  filter.connect(engineGain);
  engineGain.connect(master);
  engine.start();
  sub.start();

  const hornGain = c.createGain();
  hornGain.gain.value = 0;
  hornGain.connect(master);
  for (const f of [415, 522]) {
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    o.connect(hornGain);
    o.start();
  }

  const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noiseLoop = (type, freq) => {
    const src = c.createBufferSource();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    src.buffer = noise;
    src.loop = true;
    f.type = type;
    f.frequency.value = freq;
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
    return g;
  };
  au = { c, master, engine, sub, filter, engineGain, hornGain, noise, rainGain: noiseLoop('highpass', 1700), roadGain: noiseLoop('lowpass', 260) };
}

function setMuted(v) {
  muted = v;
  store.set('kd-muted', v ? '1' : '0');
  $('sound-btn').textContent = v ? 'SOUND OFF' : 'SOUND ON';
  $('sound-btn').setAttribute('aria-pressed', String(!v));
}

function blip(freq, dur, vol) {
  if (!au || muted) return;
  const t = au.c.currentTime;
  const g = au.c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.setValueAtTime(vol, t + dur * 0.8);
  g.gain.linearRampToValueAtTime(0, t + dur);
  g.connect(au.master);
  for (const f of [freq, freq * 1.26]) {
    const o = au.c.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    o.connect(g);
    o.start(t);
    o.stop(t + dur);
  }
}

function thud(vol) {
  if (!au || muted) return;
  const t = au.c.currentTime;
  const src = au.c.createBufferSource();
  const f = au.c.createBiquadFilter();
  const g = au.c.createGain();
  src.buffer = au.noise;
  f.type = 'lowpass';
  f.frequency.value = 180;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  src.connect(f);
  f.connect(g);
  g.connect(au.master);
  src.start(t);
  src.stop(t + 0.32);
}

const GEARS = [0, 25, 50, 80, 115, 170];

function updateAudio(throttle, horn) {
  if (!au) return;
  const t = au.c.currentTime;
  au.master.gain.setTargetAtTime(muted || paused ? 0 : 1, t, 0.08);
  const kmh = Math.abs(speed) * 3.6;
  let g = 1;
  while (g < 5 && kmh >= GEARS[g]) g++;
  const rpm = 900 + (kmh - GEARS[g - 1]) / (GEARS[g] - GEARS[g - 1]) * 3300 + throttle * 450;
  au.engine.frequency.setTargetAtTime(rpm / 30, t, 0.05);
  au.sub.frequency.setTargetAtTime(rpm / 60, t, 0.05);
  au.filter.frequency.setTargetAtTime(320 + rpm * 0.16, t, 0.05);
  au.engineGain.gain.setTargetAtTime(0.03 + throttle * 0.035, t, 0.06);
  au.hornGain.gain.setTargetAtTime(horn ? 0.06 : 0, t, 0.012);
  au.rainGain.gain.setTargetAtTime(wxRain * 0.1, t, 0.4);
  au.roadGain.gain.setTargetAtTime(Math.min(kmh / 110, 1) * (offroad ? 0.2 : 0.09), t, 0.1);
}

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

function showToast(t) {
  const el = $('toast');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function setPlace(p) {
  if (!placeData[p]) p = 'malabar';
  activePlace = p;
  document.querySelectorAll('.place-card').forEach((b) => {
    const on = b.dataset.place === p;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  $('place-note').textContent = placeData[p].note;
}

document.querySelectorAll('.place-card').forEach((b) => {
  b.addEventListener('click', () => setPlace(b.dataset.place));
});

const fontReady = document.fonts && document.fonts.load
  ? document.fonts.load('700 30px "Baloo Chettan 2"', 'ചായക്കട').catch(() => {})
  : Promise.resolve();

async function startGame() {
  initAudio();
  if (au && au.c.state === 'suspended') au.c.resume();
  store.set('kd-place', activePlace);
  $('loading').classList.remove('hidden');
  // Let the loading card paint, and give the Malayalam sign font a moment to arrive.
  await Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]);
  await new Promise((r) => setTimeout(r, 30));
  buildPlace();
  $('loading').classList.add('hidden');
  $('start-screen').classList.add('hidden');
  $('pause-screen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('touch').classList.toggle('hidden', !isTouch);
  $('hud-location').textContent = place.title;
  $('hud-area').textContent = 'FREE ROAM';
  $('pause-location').textContent = place.title + ' · FREE ROAM';
  paused = false;
  showToast('WELCOME TO ' + place.title);
}

function pauseGame() {
  if (paused) return;
  paused = true;
  $('pause-screen').classList.remove('hidden');
  updateAudio(0, false);
}

function resumeGame() {
  paused = false;
  $('pause-screen').classList.add('hidden');
}

function cycleCamera() {
  cameraMode = (cameraMode + 1) % 3;
  showToast(['CHASE CAMERA', 'BONNET CAMERA', 'CINEMATIC CAMERA'][cameraMode]);
  placeCamera(1);
}

function resetVehicle() {
  const pose = nearestLanePose(player.position.x, player.position.z);
  player.position.set(pose.x, 0, pose.z);
  heading = pose.h;
  speed = 0;
  steer = 0;
  placeCamera(1);
  showToast('BACK ON THE ROAD');
}

$('start-btn').addEventListener('click', startGame);
$('menu-btn').addEventListener('click', pauseGame);
$('resume-btn').addEventListener('click', resumeGame);
$('sound-btn').addEventListener('click', () => setMuted(!muted));
$('change-place-btn').addEventListener('click', () => {
  $('pause-screen').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('touch').classList.add('hidden');
  $('start-screen').classList.remove('hidden');
  paused = true;
});

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat || !$('start-screen').classList.contains('hidden')) return;

  if (e.code === 'Escape') {
    if (paused) resumeGame(); else pauseGame();
  } else if (paused || !player) {
    return;
  } else if (e.code === 'KeyC') {
    cycleCamera();
  } else if (e.code === 'KeyR') {
    resetVehicle();
  } else if (e.code === 'KeyT') {
    clockTime = (clockTime + 3) % 24;
    showToast('TIME SKIPPED AHEAD');
  } else if (e.code === 'KeyV') {
    setWeather(WEATHER_NEXT[weather], true);
  } else if (e.code === 'KeyM') {
    setMuted(!muted);
    showToast(muted ? 'SOUND OFF' : 'SOUND ON');
  }
});

addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && player && $('start-screen').classList.contains('hidden')) pauseGame();
});

document.querySelectorAll('#touch [data-hold]').forEach((b) => {
  const key = b.dataset.hold;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); touch[key] = true; });
  for (const n of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(n, () => { touch[key] = false; });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
});
$('touch-cam').addEventListener('click', () => { if (!paused && player) cycleCamera(); });

/* ------------------------------------------------------------------ */
/* Driving                                                             */
/* ------------------------------------------------------------------ */

function pushOut(cx, cz, r) {
  let px = 0;
  let pz = 0;
  for (const c of colliders) {
    const dx = cx - c.x;
    const dz = cz - c.z;
    if (c.t === 0) {
      const lim = r + c.r;
      if (Math.abs(dx) > lim || Math.abs(dz) > lim) continue;
      const d = Math.hypot(dx, dz);
      if (d < lim && d > 1e-4) {
        px += dx * (lim - d) / d;
        pz += dz * (lim - d) / d;
      }
    } else if (c.t === 1) {
      if (dx * dx + dz * dz > c.br2) continue;
      const lx = dx * c.c - dz * c.s;
      const lz = dx * c.s + dz * c.c;
      const ex = lx - clamp(lx, -c.hw, c.hw);
      const ez = lz - clamp(lz, -c.hd, c.hd);
      const d = Math.hypot(ex, ez);
      let ax = 0;
      let az = 0;
      if (d > 1e-4) {
        if (d >= r) continue;
        ax = ex * (r - d) / d;
        az = ez * (r - d) / d;
      } else {
        // Centre is inside the box: leave through the nearest face.
        const ox = c.hw - Math.abs(lx);
        const oz = c.hd - Math.abs(lz);
        if (ox < oz) ax = Math.sign(lx || 1) * (ox + r); else az = Math.sign(lz || 1) * (oz + r);
      }
      px += ax * c.c + az * c.s;
      pz += -ax * c.s + az * c.c;
    } else {
      const qx = dx / (c.rx + r);
      const qz = dz / (c.rz + r);
      const q = Math.hypot(qx, qz);
      if (q < 1 && q > 1e-4) {
        px += dx * (1 / q - 1);
        pz += dz * (1 / q - 1);
      }
    }
  }
  for (const t of traffic) {
    const fx = Math.sin(t.h);
    const fz = Math.cos(t.h);
    for (const o of t.spec.circles) {
      const dx = cx - (t.x + fx * o);
      const dz = cz - (t.z + fz * o);
      const lim = r + t.spec.r;
      if (Math.abs(dx) > lim || Math.abs(dz) > lim) continue;
      const d = Math.hypot(dx, dz);
      if (d < lim && d > 1e-4) {
        px += dx * (lim - d) / d;
        pz += dz * (lim - d) / d;
        t.v *= 0.5;
      }
    }
  }
  return [px, pz];
}

function collidePlayer(dt) {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  let into = 0;
  for (const o of [1.0, -1.0]) {
    const [px, pz] = pushOut(player.position.x + fx * o, player.position.z + fz * o, 1.05);
    if (!px && !pz) continue;
    player.position.x += px;
    player.position.z += pz;
    const l = Math.hypot(px, pz);
    into = Math.max(into, -(px * fx + pz * fz) / l * Math.sign(speed));
  }
  hitCooldown -= dt;
  if (into > 0) {
    if (hitCooldown <= 0 && Math.abs(speed) * into > 4) {
      thud(Math.min(0.5, Math.abs(speed) * into * 0.03));
      hitCooldown = 0.5;
    }
    speed *= 1 - Math.min(1, into * 12 * dt);
  }
}

function updateTraffic(dt) {
  for (const t of traffic) {
    const pose = loopPose(t.loop, t.s);
    const fx = Math.sin(t.h);
    const fz = Math.cos(t.h);
    let lim = pose.slow ? Math.min(t.max, 3.2) : t.max;
    let byPlayer = false;

    const yieldTo = (ox, oz, olen, owid) => {
      const dx = ox - t.x;
      const dz = oz - t.z;
      const al = dx * fx + dz * fz;
      if (al <= 0 || al > 22) return false;
      if (Math.abs(dx * fz - dz * fx) > (t.spec.wid + owid) / 2 + 0.4) return false;
      const gap = al - t.spec.len / 2 - olen / 2;
      const v = Math.max(0, (gap - 2.5) / 9) * t.max;
      if (v < lim) { lim = v; return true; }
      return false;
    };

    if (yieldTo(player.position.x, player.position.z, 4.2, 2.1)) byPlayer = true;
    if (t.ghost > 0) {
      t.ghost -= dt;
    } else {
      for (const o of traffic) if (o !== t && yieldTo(o.x, o.z, o.spec.len, o.spec.wid)) byPlayer = false;
    }

    t.v += clamp(lim - t.v, -10 * dt, 3 * dt);
    if (t.v < 0.3 && lim < 0.3) {
      t.wait += dt;
      // Two drivers waving each other through: one of them goes.
      if (!byPlayer && t.wait > 2.5) { t.ghost = 2; t.wait = 0; }
      if (byPlayer && t.wait > 2.2 && t.honk <= 0) {
        const d = Math.hypot(player.position.x - t.x, player.position.z - t.z);
        blip(t.spec.horn, 0.32, clamp(0.5 - d * 0.02, 0.05, 0.3));
        t.honk = 3.5;
      }
    } else {
      t.wait = 0;
    }
    t.honk -= dt;

    t.s += t.v * dt;
    const next = loopPose(t.loop, t.s);
    t.x = next.x;
    t.z = next.z;
    let dh = next.h - t.h;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    t.h += dh * Math.min(1, dt * 7);
    t.mesh.position.set(t.x, 0, t.z);
    t.mesh.rotation.y = t.h;
  }
}

const camTarget = new THREE.Vector3();
const camLook = new THREE.Vector3();

function placeCamera(blend) {
  if (!player) return;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const p = player.position;
  if (cameraMode === 1) {
    camera.position.set(p.x + fx * 1.6, 2.1, p.z + fz * 1.6);
    camLook.set(p.x + fx * 30, 1.2, p.z + fz * 30);
  } else {
    const back = cameraMode === 2 ? 13 : 9.5;
    const up = cameraMode === 2 ? 7.5 : 5.2;
    camTarget.set(p.x - fx * back, up, p.z - fz * back);
    camera.position.lerp(camTarget, blend);
    camLook.set(p.x + fx * 5, 1.4, p.z + fz * 5);
  }
  camera.lookAt(camLook);
}

function updateArea() {
  const p = player.position;
  let name = '';
  for (const a of place.areas) {
    if (p.x > a.box[0] && p.x < a.box[2] && p.z > a.box[1] && p.z < a.box[3]) { name = a.n; break; }
  }
  if (name === currentArea) return;
  currentArea = name;
  $('hud-area').textContent = name || 'FREE ROAM';
  if (name && !seenAreas.has(activePlace + name)) {
    seenAreas.add(activePlace + name);
    showToast('NOW AT · ' + name);
  }
}

const mapCtx = $('minimap').getContext('2d');

function drawMinimap() {
  const g = mapCtx;
  const S = 0.9;
  const p = player.position;
  g.fillStyle = '#1b2c2e';
  g.fillRect(0, 0, 300, 300);
  g.drawImage(mapLayer, 150 - (p.x + 550) * S, 150 - (p.z + 425) * S, 1100 * S, 850 * S);
  for (const t of traffic) {
    g.fillStyle = t.type === 'bus' ? '#e0574a' : '#f4f1e8';
    g.fillRect(150 + (t.x - p.x) * S - 3, 150 + (t.z - p.z) * S - 3, 6, 6);
  }
  g.save();
  g.translate(150, 150);
  g.rotate(Math.PI - heading);
  g.fillStyle = '#e89b56';
  g.strokeStyle = '#111d20';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, -13);
  g.lineTo(9, 10);
  g.lineTo(0, 5);
  g.lineTo(-9, 10);
  g.closePath();
  g.stroke();
  g.fill();
  g.restore();
  g.fillStyle = '#aab3ad';
  g.font = '600 18px "Space Grotesk", sans-serif';
  g.textAlign = 'center';
  g.fillText('N', 150, 22);
}

function update(dt) {
  if (paused || !player) return;
  frame++;

  const forward = keys.KeyW || keys.ArrowUp || touch.gas;
  const back = keys.KeyS || keys.ArrowDown || touch.brake;
  const left = keys.KeyA || keys.ArrowLeft || touch.left;
  const right = keys.KeyD || keys.ArrowRight || touch.right;
  const handbrake = keys.Space;
  const horn = keys.KeyH || touch.horn;

  const grip = 1 - 0.3 * wet;
  const top = place.topSpeed;
  let acc = 0;
  if (forward) acc += speed >= -0.5 ? 7.5 * (1 - Math.pow(clamp(speed / top, 0, 1), 1.6)) : 14;
  if (back) acc -= speed > 0.8 ? 15 * grip : 5 * (1 - clamp(-speed / 9, 0, 1));
  if (speed) acc -= Math.sign(speed) * (0.35 + 0.0035 * speed * speed);
  if (offroad) acc -= speed * 0.6;
  if (handbrake && speed) acc -= Math.sign(speed) * 18 * grip;

  const before = speed;
  speed += acc * dt;
  // Drag and the handbrake bring the car to rest; they never push it the other way.
  if (before && Math.sign(speed) !== Math.sign(before) && (handbrake || !back)) speed = 0;
  if (!forward && !back && Math.abs(speed) < 0.2) speed = 0;

  const steerInput = (right ? 1 : 0) - (left ? 1 : 0);
  steer = damp(steer, steerInput, steerInput ? 5 : 8, dt);
  const maxAngle = 0.55 / (1 + Math.abs(speed) * 0.075) * (0.75 + 0.25 * grip);
  // Heading grows anticlockwise, so steering right turns it down.
  const yaw = speed / 2.55 * Math.tan(steer * maxAngle) * (handbrake && Math.abs(speed) > 6 ? 1.6 : 1);
  heading -= yaw * dt;

  const p = player.position;
  const oldX = camera.position.x;
  const oldZ = camera.position.z;
  p.x += Math.sin(heading) * speed * dt;
  p.z += Math.cos(heading) * speed * dt;
  updateTraffic(dt);
  collidePlayer(dt);
  p.x = clamp(p.x, place.sea ? -386 : -475, 475);
  p.z = clamp(p.z, -365, 365);
  player.rotation.y = heading;
  trip += Math.abs(speed) * dt;
  offroad = roadDist(p.x, p.z) > 1.3;

  // Body lean, wheel spin and steering.
  const { body, wheels } = player.userData;
  body.rotation.z = damp(body.rotation.z, clamp(-yaw * speed * 0.012, -0.07, 0.07), 6, dt);
  body.rotation.x = damp(body.rotation.x, clamp(-acc * 0.004, -0.05, 0.05), 6, dt);
  body.position.y = offroad ? Math.sin(trip * 2.6) * 0.035 * Math.min(Math.abs(speed) / 6, 1) : 0;
  for (const w of wheels) {
    w.spin.rotation.x += speed * dt / 0.43;
    if (w.front) w.steerNode.rotation.y = -steer * maxAngle;
  }
  mats.brake.emissiveIntensity = (back && speed > 0.5) || handbrake ? 3 : 0.12 + Math.max(nightF, wxRain * 0.55) * 1.2;

  placeCamera(1 - Math.exp(-4.5 * dt));
  camera.fov = damp(camera.fov, 62 + Math.min(Math.abs(speed), 40) * 0.3, 3, dt);
  camera.updateProjectionMatrix();

  // The clock moves a little faster after dark so the night does not drag.
  clockTime = (clockTime + dt * 0.035 * (1 + nightF * 1.6)) % 24;
  wxTimer -= dt;
  if (wxTimer <= 0) {
    setWeather(weather === 'cloudy' ? (Math.random() < 0.55 ? 'rain' : 'clear') : 'cloudy', true);
  }
  updateSky(dt, false);
  if (rain.visible) updateRain(dt, camera.position.x - oldX, camera.position.z - oldZ);
  for (const w of waves) w.m.position.x = w.x + Math.sin(clockTime * 40 + w.ph) * 3;

  updateAudio(forward ? 1 : 0, horn);

  $('speed').textContent = String(Math.round(Math.abs(speed) * 3.6)).padStart(3, '0');
  $('gear').textContent = speed < -0.3 ? 'R' : speed < 0.3 ? 'N' : 'D';
  if (frame % 10 === 0) {
    const hh = Math.floor(clockTime);
    const mm = Math.floor((clockTime - hh) * 60);
    $('clock').textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    $('weather-label').textContent = weatherLabel();
    $('trip').textContent = (trip / 1000).toFixed(1) + ' KM';
    updateArea();
  }
  if (frame % 2 === 0) drawMinimap();
}

function animate(t) {
  requestAnimationFrame(animate);
  const dt = Math.min((t - last) / 1000 || 0, 0.04);
  last = t;
  update(dt);
  // Nothing to see behind the opaque start screen, so skip the draw.
  if (player && $('start-screen').classList.contains('hidden')) renderer.render(scene, camera);
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

addEventListener('resize', resize);

document.body.classList.toggle('touch', isTouch);
if (isTouch) $('drive-hint').textContent = 'ON-SCREEN PEDALS TO DRIVE';
setMuted(muted);
setPlace(store.get('kd-place') || 'malabar');
requestAnimationFrame(animate);
$('loading').classList.add('hidden');
