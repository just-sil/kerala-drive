import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const game = $('game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb9c2);
scene.fog = new THREE.FogExp2(0x9bb9c2, 0.0018);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1800);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
game.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xe4f3ff, 0x59634a, 2.0));

const sun = new THREE.DirectionalLight(0xffe2b6, 2.3);
sun.position.set(-180, 260, 130);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -260;
sun.shadow.camera.right = 260;
sun.shadow.camera.top = 260;
sun.shadow.camera.bottom = -260;
sun.shadow.bias = -0.00025;
scene.add(sun);

const mats = {};
function mat(color, roughness = 0.9, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

mats.grass = mat(0x6d9560);
mats.deepGrass = mat(0x557c50);
mats.laterite = mat(0xa96f4c);
mats.road = mat(0x343a3a);
mats.asphalt = mat(0x414746);
mats.line = mat(0xe8dfbd);
mats.sand = mat(0xcdbb8a);
mats.sea = mat(0x398b9a, 0.42);
mats.water = mat(0x4a9c9e, 0.38);
mats.leaf = mat(0x315b3b);
mats.leaf2 = mat(0x477347);
mats.trunk = mat(0x76553b);
mats.white = mat(0xe9e8dd);
mats.red = mat(0xb83d32);
mats.black = mat(0x202526);
mats.glass = new THREE.MeshStandardMaterial({
  color: 0x8eb7c0,
  metalness: 0.25,
  roughness: 0.2,
  transparent: true,
  opacity: 0.72
});
mats.yellow = mat(0xd7a83d);

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

function mesh(geo, material, parent = scene) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cube(parent, material, x, y, z, sx, sy, sz) {
  const m = mesh(boxGeo, material, parent);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}

function cylinder(parent, material, x, y, z, r1, r2, h, segments = 8) {
  const m = mesh(new THREE.CylinderGeometry(r1, r2, h, segments), material, parent);
  m.position.set(x, y, z);
  return m;
}

function group(parent = scene) {
  const g = new THREE.Group();
  parent.add(g);
  return g;
}

function rand(seed) {
  let x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

let world = group();
let traffic = [];
let player;
let cameraMode = 0;
let activePlace = 'malabar';
let paused = true;

let speed = 0;
let heading = 0;
let steer = 0;
let throttle = 0;
let brake = 0;
let clockTime = 16.7;
let last = 0;
let toastTimer;

const keys = {};

const placeData = {
  malabar: {
    title: 'MALABAR',
    note: 'A laid-back northern Kerala coastal town.',
    sky: 0x9bb9c2,
    fog: 0x9bb9c2,
    sea: true,
    city: false,
    hills: false,
    road: 'coast'
  },
  kochi: {
    title: 'KOCHI',
    note: 'A lively waterfront city of bridges and backwaters.',
    sky: 0xa6b9bd,
    fog: 0xa6b9bd,
    sea: true,
    city: true,
    hills: false,
    road: 'city'
  },
  wayanad: {
    title: 'WAYANAD',
    note: 'Cool highland air, tea slopes and winding ghat roads.',
    sky: 0x91aeb0,
    fog: 0x91aeb0,
    sea: false,
    city: false,
    hills: true,
    road: 'hill'
  }
};

function clearWorld() {
  while (world.children.length) {
    const o = world.children.pop();
    if (o.geometry) o.geometry.dispose();
  }
  scene.remove(world);
  world = group();
  traffic = [];
}

function terrain() {
  const g = mesh(new THREE.PlaneGeometry(1100, 850, 1, 1), mats.grass, world);
  g.rotation.x = -Math.PI / 2;
  g.position.y = -0.3;

  for (let i = 0; i < 7; i++) {
    const ridge = mesh(new THREE.PlaneGeometry(1100, 180, 1, 1), mats.deepGrass, world);
    ridge.rotation.x = -Math.PI / 2;
    ridge.position.set(0, 1 + i * 0.1, -300 - i * 65);
  }

  if (activePlace === 'wayanad') {
    for (let i = 0; i < 18; i++) {
      const x = -420 + i * 48;
      const z = -285 - rand(i + 1) * 100;
      hill(
        x, z,
        80 + rand(i + 20) * 80,
        65 + rand(i + 44) * 85,
        55 + rand(i + 2) * 55,
        0x4e7352
      );
    }

    for (let i = 0; i < 20; i++) {
      const x = -420 + rand(i + 90) * 850;
      const z = -220 + rand(i + 110) * 400;
      hill(
        x, z,
        32 + rand(i + 120) * 38,
        25 + rand(i + 130) * 35,
        22 + rand(i + 140) * 30,
        0x62875a
      );
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const x = -430 + i * 78;
      hill(
        x,
        -330 - rand(i + 6) * 45,
        55 + rand(i + 2) * 45,
        48 + rand(i + 3) * 55,
        35 + rand(i + 4) * 40,
        0x63845a
      );
    }
  }

  if (placeData[activePlace].sea) {
    const sea = mesh(new THREE.PlaneGeometry(360, 900), mats.sea, world);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(-555, -0.8, 0);

    const shore = mesh(new THREE.PlaneGeometry(90, 850), mats.sand, world);
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(-345, -0.15, 0);

    for (let i = 0; i < 5; i++) {
      const wave = mesh(
        new THREE.BoxGeometry(2, 0.12, 760),
        mat(0x83c2bc),
        world
      );
      wave.position.set(-395 - i * 15, -0.55, 0);
    }
  }

  if (activePlace !== 'wayanad') {
    const lagoon = mesh(new THREE.PlaneGeometry(115, 250), mats.water, world);
    lagoon.rotation.x = -Math.PI / 2;
    lagoon.position.set(-90, -0.12, -185);
    lagoon.rotation.z = 0.12;

    for (let i = 0; i < 8; i++) {
      tree(-160 + i * 40, -220 - rand(i) * 24, 'coconut', 1.1);
    }
  }
}

function hill(x, z, rx, rz, h, color) {
  const geo = new THREE.SphereGeometry(1, 14, 10);
  const m = mesh(geo, mat(color), world);
  m.position.set(x, h * 0.28, z);
  m.scale.set(rx, h, rz);
  m.castShadow = true;
}

function tree(x, z, type = 'coconut', scale = 1) {
  const t = group(world);
  t.position.set(x, 0, z);
  t.scale.setScalar(scale);

  if (type === 'coconut') {
    cylinder(t, mats.trunk, 0, 4, 0, 0.18, 0.3, 8, 7);

    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const leaf = mesh(new THREE.ConeGeometry(0.34, 5.3, 5), mats.leaf, t);
      leaf.position.set(
        Math.cos(a) * 1.8,
        8.1 + Math.sin(a) * 0.2,
        Math.sin(a) * 1.8
      );
      leaf.rotation.z = -Math.cos(a) * 0.9;
      leaf.rotation.x = Math.sin(a) * 0.9;
    }

    const crown = mesh(new THREE.SphereGeometry(0.55, 8, 6), mats.leaf2, t);
    crown.position.y = 8;
  } else {
    cylinder(t, mats.trunk, 0, 2, 0, 0.25, 0.4, 4, 7);
    const crown = mesh(new THREE.SphereGeometry(2.3, 9, 7), mats.leaf2, t);
    crown.position.y = 5;
  }

  return t;
}

function house(x, z, kind = 'tile', seed = 0) {
  const h = group(world);
  h.position.set(x, 0, z);

  const w = 7 + rand(seed) * 5;
  const d = 6 + rand(seed + 1) * 5;

  cube(h, mat(kind === 'shop' ? 0xd5c6a4 : 0xe4d8bd), 0, 2.2, 0, w, 4.4, d);

  const roofMat = mat(kind === 'shop' ? 0x7b4a39 : 0x8a4d3a);
  const roof = mesh(new THREE.ConeGeometry(w * 0.78, 2.4, 4), roofMat, h);
  roof.position.y = 5.5;
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = d / w;

  cube(h, mat(0x554c3e), 0, 1.15, d / 2 + 0.04, 1.3, 2.3, 0.12);

  for (let s of [-1, 1]) {
    cube(h, mat(0x83a6a6), s * w * 0.25, 2.7, d / 2 + 0.07, 1.3, 1.2, 0.1);
  }

  if (kind === 'shop') {
    const sign = cube(h, mat(0xe3b65f), 0, 4.2, d / 2 + 0.08, w * 0.6, 0.5, 0.1);
    sign.castShadow = false;
  }
}

function roadSegment(x, z, length, width, angle = 0) {
  const r = mesh(new THREE.PlaneGeometry(width, length), mats.road, world);
  r.rotation.x = -Math.PI / 2;
  r.rotation.z = angle;
  r.position.set(x, 0.015, z);

  const shoulder = mesh(
    new THREE.PlaneGeometry(width + 2, length + 1),
    mats.laterite,
    world
  );
  shoulder.rotation.x = -Math.PI / 2;
  shoulder.rotation.z = angle;
  shoulder.position.set(x, -0.02, z);

  const road = mesh(new THREE.PlaneGeometry(width, length), mats.road, world);
  road.rotation.x = -Math.PI / 2;
  road.rotation.z = angle;
  road.position.set(x, 0.02, z);

  for (let z0 = -length / 2 + 5; z0 < length / 2; z0 += 12) {
    const line = mesh(new THREE.PlaneGeometry(0.16, 5), mats.line, world);
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = angle;
    line.position.set(
      x + Math.sin(angle) * z0,
      0.04,
      z + Math.cos(angle) * z0
    );
  }
}

function roadNetwork() {
  if (activePlace === 'wayanad') {
    const pts = [];

    for (let i = 0; i <= 24; i++) {
      const z = 270 - i * 22;
      const x = 80 + Math.sin(i * 0.42) * 95;
      pts.push(new THREE.Vector3(x, 0.05, z));
    }

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const len = a.distanceTo(b);
      const ang = Math.atan2(b.x - a.x, b.z - a.z);
      roadSegment(mid.x, mid.z, len + 3, 9, ang);
    }
  } else {
    roadSegment(15, 0, 740, 12, 0);
    roadSegment(-160, -70, 360, 9, Math.PI / 2);
    roadSegment(175, 105, 350, 10, Math.PI / 2);
    roadSegment(0, -185, 440, 9, 0.16);
    roadSegment(-50, 180, 400, 10, -0.12);

    if (activePlace === 'kochi') {
      roadSegment(95, 0, 520, 11, Math.PI / 2);
      roadSegment(-90, 40, 280, 8, -0.3);
    }
  }
}

function roadside() {
  for (let i = 0; i < 44; i++) {
    const z = -340 + i * 16;

    if (activePlace === 'wayanad') {
      tree(-160 + rand(i + 4) * 30, z, 'forest', 1.1 + rand(i) * 0.6);
      tree(250 + rand(i + 8) * 35, z, 'forest', 1.2);
    } else {
      tree(-300 + rand(i + 8) * 45, z, 'coconut', 0.75 + rand(i) * 0.45);
      tree(300 + rand(i + 12) * 35, z, 'coconut', 0.8 + rand(i + 3) * 0.5);
    }
  }

  for (let i = 0; i < 34; i++) {
    let x = -300 + rand(i + 300) * 600;
    let z = -300 + rand(i + 500) * 600;

    if (Math.abs(z) < 25 || Math.abs(x + 160) < 18 || Math.abs(x - 175) < 20) continue;
    if (activePlace === 'wayanad' && z > 120) continue;

    house(x, z, activePlace === 'kochi' ? 'shop' : 'tile', i + 30);
  }

  if (activePlace === 'wayanad') {
    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 22; col++) {
        const x = -350 + col * 31 + (row % 2) * 8;
        const z = -260 + row * 27;
        const bush = mesh(new THREE.SphereGeometry(2.1, 7, 5), mats.leaf2, world);
        bush.position.set(x, 1.3, z);
        bush.scale.set(1.5, 0.55, 1);
      }
    }
  }

  if (activePlace === 'kochi') {
    for (let i = 0; i < 22; i++) {
      const x = -220 + i * 21;
      const h = 22 + rand(i + 800) * 55;
      const b = cube(world, mat([0xb8c0b6, 0x9baeb0, 0xd0b9a0][i % 3]), x, h / 2, -270, 12, h, 12);
      b.castShadow = true;

      for (let y = 5; y < h; y += 7) {
        cube(world, mat(0x668b91), x, y, -263, 8, 1, 1);
      }
    }
  }
}

function makeWagon() {
  const car = group(world);

  cube(car, mat(0x9e3030), 0, 1.05, 0, 2.1, 1.25, 4.15);
  cube(car, mat(0xa93b36), 0, 1.75, -0.15, 1.85, 1.0, 2.25);
  cube(car, mats.glass, 0, 2.05, -0.18, 1.72, 0.72, 2.08);
  cube(car, mat(0x7e2927), 0, 2.38, -0.15, 1.9, 0.12, 2.35);
  cube(car, mat(0x8d2927), 0, 1.2, 2.1, 2.0, 0.45, 0.18);
  cube(car, mat(0x242a2a), 0, 0.55, 2.12, 1.95, 0.3, 0.16);

  for (const x of [-1.09, 1.09]) {
    for (const z of [-1.35, 1.35]) {
      const wheel = mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.22, 16), mats.black, car);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.52, z);

      const hub = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.23, 12), mat(0x9da5a0, 0.45, 0.6), car);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x * 1.01, 0.52, z);
    }
  }

  for (const x of [-0.72, 0.72]) {
    cube(car, mat(0xffe7ad), x, 1.05, 2.13, 0.42, 0.25, 0.08);
    cube(car, mat(0x9b2927), x, 1.05, -2.12, 0.38, 0.23, 0.08);
  }

  for (const x of [-1.12, 1.12]) {
    cube(car, mats.black, x, 1.65, 0.5, 0.28, 0.18, 0.38);
  }

  car.position.set(0, 0, 0);
  return car;
}

function makeBus(parent, paint = 0xc83c32) {
  const v = group(parent);
  const body = mat(paint);
  const glass = mat(0x526e73, 0.25);
  const dark = mat(0x252a29);

  cube(v, body, 0, 1.65, 0, 2.65, 3.25, 9.8);
  cube(v, glass, 0, 2.15, 0, 2.68, 1.25, 8.7);
  cube(v, mat(0xe8dfc9), 0, 0.72, 0, 2.68, 0.35, 9.7);

  for (let z = -3.6; z <= 3.7; z += 1.5) {
    for (let x of [-1.34, 1.34]) {
      cube(v, glass, x, 2.35, z, 0.04, 0.8, 1.12);
    }
  }

  cube(v, mat(0xe5dfce), 0, 2.7, 4.92, 1.4, 0.45, 0.08);

  for (let x of [-1.34, 1.34]) {
    for (let z of [-3.1, 3.2]) {
      const wh = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.28, 14), dark, v);
      wh.rotation.z = Math.PI / 2;
      wh.position.set(x, 0.55, z);
    }
  }

  return v;
}

function makeAuto(parent) {
  const v = group(parent);
  const yellow = mat(0xd6ae37);
  const green = mat(0x276348);
  const black = mat(0x252929);

  cube(v, green, 0, 0.8, 0, 1.55, 0.85, 2.7);
  cube(v, yellow, 0, 1.65, -0.15, 1.5, 0.95, 1.8);
  cube(v, mats.glass, 0, 1.75, -0.15, 1.52, 0.62, 1.7);
  cube(v, yellow, 0, 0.8, 1.42, 1.5, 0.5, 0.18);

  for (let x of [-0.82, 0.82]) {
    for (let z of [-0.8, 0.8]) {
      const w = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 12), black, v);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.35, z);
    }
  }

  return v;
}

function spawnTraffic() {
  const configs = activePlace === 'wayanad'
    ? ['car', 'car', 'auto', 'bus']
    : ['bus', 'auto', 'car', 'car', 'bus', 'auto', 'car'];

  for (let i = 0; i < configs.length; i++) {
    const type = configs[i];

    const v = type === 'bus'
      ? makeBus(world, i % 2 ? 0xc33b32 : 0xd7c7a2)
      : type === 'auto'
        ? makeAuto(world)
        : makeWagon();

    const z = -250 + i * 78;
    const x = type === 'bus'
      ? (activePlace === 'kochi' ? 90 : 15)
      : (i % 2 ? -160 : 175);

    v.position.set(x, 0, z);
    v.rotation.y = i % 2 ? Math.PI : 0;

    traffic.push({
      mesh: v,
      type,
      x,
      z,
      baseZ: z,
      dir: i % 2 ? 1 : -1,
      speed: type === 'bus' ? 7 : type === 'auto' ? 10 : 13,
      axis: activePlace === 'kochi' && i % 3 === 0 ? 'x' : 'z',
      phase: i
    });
  }
}

function buildPlace() {
  clearWorld();

  const p = placeData[activePlace];
  scene.background.setHex(p.sky);
  scene.fog.color.setHex(p.fog);
  scene.fog.density = activePlace === 'wayanad' ? 0.0025 : 0.0018;

  terrain();
  roadNetwork();
  roadside();

  if (activePlace === 'malabar') {
    for (let i = 0; i < 7; i++) {
      const boat = group(world);
      boat.position.set(-390 + i * 10, -0.2, -90 + i * 24);

      const hull = mesh(new THREE.ConeGeometry(1.3, 7, 4), mat(0x6b4534), boat);
      hull.rotation.z = Math.PI / 2;
      hull.position.y = 0.2;

      cube(boat, mat(0xe4d4b3), 0, 1, 0, 0.2, 1.2, 0.2);
    }
  }

  if (activePlace === 'kochi') {
    const deck = cube(world, mat(0x777f7b), -35, 5, -180, 185, 1.2, 13);

    for (let x = -115; x < 55; x += 34) {
      cube(world, mat(0xddd6c3), x, 8, -180, 1, 6, 1);
      cube(world, mat(0xddd6c3), x, 11, -180, 1, 1, 13);
    }
  }

  player = makeWagon();
  player.position.set(15, 0, 20);
  heading = Math.PI;
  speed = 0;
  steer = 0;

  spawnTraffic();

  camera.position.set(0, 7, 34);
  camera.lookAt(0, 1, 0);
}

function showToast(t) {
  const el = $('toast');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
}

function setPlace(p) {
  activePlace = p;
  document.querySelectorAll('.place-card').forEach(b => {
    b.classList.toggle('active', b.dataset.place === p);
  });
  $('place-note').textContent = placeData[p].note;
}

document.querySelectorAll('.place-card').forEach(b => {
  b.addEventListener('click', () => setPlace(b.dataset.place));
});

function startGame() {
  buildPlace();
  $('start-screen').classList.add('hidden');
  $('pause-screen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  paused = false;
  $('hud-location').textContent = placeData[activePlace].title;
  $('pause-location').textContent = placeData[activePlace].title + ' · FREE ROAM';
  showToast('WELCOME TO ' + placeData[activePlace].title);
}

$('start-btn').addEventListener('click', startGame);
$('menu-btn').addEventListener('click', pauseGame);

$('resume-btn').addEventListener('click', () => {
  paused = false;
  $('pause-screen').classList.add('hidden');
});

$('change-place-btn').addEventListener('click', () => {
  $('pause-screen').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('start-screen').classList.remove('hidden');
  paused = true;
});

function pauseGame() {
  paused = true;
  $('pause-screen').classList.remove('hidden');
}

addEventListener('keydown', e => {
  keys[e.code] = true;

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }

  if (e.code === 'Escape' && !$('start-screen').classList.contains('hidden')) return;

  if (e.code === 'Escape' && !paused) {
    pauseGame();
  } else if (e.code === 'KeyC' && !paused) {
    cameraMode = (cameraMode + 1) % 3;
    showToast(['CHASE CAMERA', 'BONNET CAMERA', 'CINEMATIC CAMERA'][cameraMode]);
  } else if (e.code === 'KeyR' && !paused) {
    player.position.set(15, 0, 20);
    heading = Math.PI;
    speed = 0;
    showToast('VEHICLE RESET');
  }
});

addEventListener('keyup', e => keys[e.code] = false);

function update(dt) {
  if (paused || !player) return;

  const forward = keys.KeyW || keys.ArrowUp;
  const back = keys.KeyS || keys.ArrowDown;
  const left = keys.KeyA || keys.ArrowLeft;
  const right = keys.KeyD || keys.ArrowRight;

  throttle = forward ? 1 : back ? -0.65 : 0;
  brake = keys.Space ? 1 : 0;

  const max = activePlace === 'wayanad' ? 34 : 42;

  speed += throttle * (throttle < 0 ? 17 : 12) * dt;

  if (brake) {
    speed *= Math.max(0, 1 - 5 * dt);
  } else if (!throttle) {
    speed *= Math.max(0, 1 - 0.65 * dt);
  }

  speed = THREE.MathUtils.clamp(speed, -13, max);

  const steerInput = (right ? 1 : 0) - (left ? 1 : 0);
  steer = THREE.MathUtils.damp(steer, steerInput, 5, dt);

  heading += steer * (0.85 + Math.min(Math.abs(speed) / 30, 1) * 0.8)
    * Math.sign(speed || 1) * dt;

  const dx = Math.sin(heading) * speed * dt;
  const dz = Math.cos(heading) * speed * dt;

  player.position.x += dx;
  player.position.z += dz;
  player.rotation.y = heading;

  player.position.x = THREE.MathUtils.clamp(player.position.x, -475, 475);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -365, 365);

  for (const t of traffic) {
    if (t.axis === 'x') {
      t.mesh.position.x += t.dir * t.speed * dt;
      if (Math.abs(t.mesh.position.x) > 250) t.dir *= -1;
    } else {
      t.mesh.position.z += t.dir * t.speed * dt;
      if (Math.abs(t.mesh.position.z) > 340) t.dir *= -1;
    }

    const d = player.position.distanceTo(t.mesh.position);

    if (d < 5.4 && d > 0.01) {
      speed *= 0.92;
      const away = player.position.clone().sub(t.mesh.position).normalize();
      player.position.add(away.multiplyScalar((5.4 - d) * 0.45));
    }
  }

  const backDist = cameraMode === 1 ? 5.2 : cameraMode === 2 ? 12 : 9.5;
  const up = cameraMode === 1 ? 2.9 : cameraMode === 2 ? 6.5 : 5.2;

  const target = new THREE.Vector3(
    player.position.x - Math.sin(heading) * backDist,
    player.position.y + up,
    player.position.z - Math.cos(heading) * backDist
  );

  camera.position.lerp(target, 1 - Math.exp(-4.5 * dt));

  const look = new THREE.Vector3(
    player.position.x + Math.sin(heading) * 5,
    1.4,
    player.position.z + Math.cos(heading) * 5
  );

  camera.lookAt(look);

  $('speed').textContent = String(Math.round(Math.abs(speed) * 3.6)).padStart(3, '0');
  $('gear').textContent = speed < -0.3 ? 'R' : speed < 0.3 ? 'N' : 'D';

  clockTime = (clockTime + dt * 0.035) % 24;
  const hh = Math.floor(clockTime);
  const mm = Math.floor((clockTime - hh) * 60);

  $('clock').textContent =
    String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function animate(t) {
  requestAnimationFrame(animate);
  const dt = Math.min((t - last) / 1000 || 0, 0.04);
  last = t;
  update(dt);
  renderer.render(scene, camera);
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

addEventListener('resize', resize);

buildPlace();
requestAnimationFrame(animate);
$('loading').classList.add('hidden');