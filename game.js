import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const { clamp, lerp, damp, smoothstep } = THREE.MathUtils;

/* ------------------------------------------------------------------ */
/* Renderer, lights, sky                                               */
/* ------------------------------------------------------------------ */

// Phones get a lighter render: lower resolution, smaller shadow map, less grass.
const isTouch = matchMedia('(pointer: coarse)').matches;

const game = $('game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb9c2);
scene.fog = new THREE.FogExp2(0x9bb9c2, 0.0018);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, 1800);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.4 : 1.7));
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
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
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

/* Every texture is painted in code, so the game still ships with no image files. */

const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());

function canvasTex(w, h, draw, repeat, data) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}

function valueNoise(size, cells, rand) {
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = y / size * cells;
    const y0 = Math.floor(fy);
    const y1 = (y0 + 1) % cells;
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < size; x++) {
      const fx = x / size * cells;
      const x0 = Math.floor(fx);
      const x1 = (x0 + 1) % cells;
      const tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      out[y * size + x] = lerp(lerp(grid[y0 * cells + x0], grid[y0 * cells + x1], sx), lerp(grid[y1 * cells + x0], grid[y1 * cells + x1], sx), sy);
    }
  }
  return out;
}

// Tileable fractal noise in 0..1, stretched so it uses the whole range.
function fbm(size, seed, base = 4, octaves = 5) {
  const rand = prng(seed);
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves && (base << o) <= size; o++) {
    const n = valueNoise(size, base << o, rand);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] = clamp((out[i] / total - 0.5) * 2.2 + 0.5, 0, 1);
  return out;
}

function pixelTex(size, seed, fn, repeat, base = 4, data = false) {
  const f = fbm(size, seed, base);
  const rand = prng(seed * 7 + 3);
  return canvasTex(size, size, (g) => {
    const im = g.createImageData(size, size);
    for (let i = 0; i < f.length; i++) {
      const c = fn(f[i], rand);
      im.data[i * 4] = c[0];
      im.data[i * 4 + 1] = c[1];
      im.data[i * 4 + 2] = c[2];
      im.data[i * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }, repeat, data);
}

// A colour image plus a separate mask, so leaf edges never pick up a dark fringe.
function cutout(w, h, draw, bg) {
  const make = (mask) => canvasTex(w, h, (g) => {
    g.fillStyle = mask ? '#000' : bg;
    g.fillRect(0, 0, w, h);
    draw(g, (c) => (mask ? '#fff' : c), mask ? '#000' : bg);
  }, null, mask);
  return { map: make(false), alphaMap: make(true) };
}

const mix3 = (a, b, k, gain) => [lerp(a[0], b[0], k) * gain, lerp(a[1], b[1], k) * gain, lerp(a[2], b[2], k) * gain];
const gray = (v) => { const n = Math.round(clamp(v, 0, 255)); return `rgb(${n},${n},${n})`; };

const TEX = {
  grass: pixelTex(256, 3, (n, r) => mix3([80, 124, 64], [134, 170, 96], n, 0.94 + r() * 0.12), [30, 22]),
  asphalt: pixelTex(256, 5, (n, r) => {
    const v = 62 + (n - 0.5) * 12 + (r() - 0.5) * 24 + (r() < 0.015 ? 40 : 0);
    return [v, v + 2, v + 3];
  }, [2, 2], 8),
  laterite: pixelTex(128, 7, (n, r) => mix3([146, 88, 58], [192, 124, 84], n, 0.9 + r() * 0.2), [2, 2], 8),
  sand: pixelTex(128, 9, (n, r) => mix3([196, 178, 130], [226, 208, 162], n, 0.96 + r() * 0.08), [5, 80]),
  foliage: pixelTex(128, 11, (n, r) => { const v = 205 + (n - 0.5) * 120 + (r() - 0.5) * 36; return [v, v, v]; }, [3, 2], 8),
  foam: pixelTex(128, 15, (n) => { const v = smoothstep(n, 0.42, 0.7) * 255; return [v, v, v]; }, [1, 60], 8, true),
  cloud: pixelTex(512, 17, (n) => { const v = smoothstep(n, 0.5, 0.8) * 255; return [v, v, v]; }, null, 4, true),
  wall: canvasTex(64, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#e6e4dd');
    grad.addColorStop(0.1, '#ffffff');
    grad.addColorStop(0.72, '#fbfaf6');
    grad.addColorStop(0.93, '#d9d2c6');
    grad.addColorStop(1, '#b3a999');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 256);
    const r = prng(21);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(90,80,60,${(0.03 + r() * 0.05).toFixed(3)})`;
      g.fillRect(r() * 64, r() * 60, 1 + r() * 3, 40 + r() * 200);
    }
  }),
  // Mangalore tiles: overlapping rows, each tile a slightly different clay.
  roof: canvasTex(256, 256, (g) => {
    const r = prng(31);
    for (let j = 0; j < 8; j++) {
      for (let i = -1; i < 17; i++) {
        const x = i * 16 + (j % 2) * 8;
        const v = 200 + r() * 55;
        const grad = g.createLinearGradient(0, j * 32, 0, j * 32 + 32);
        grad.addColorStop(0, gray(v));
        grad.addColorStop(0.85, gray(v * 0.82));
        grad.addColorStop(1, gray(v * 0.5));
        g.fillStyle = grad;
        g.fillRect(x, j * 32, 16, 32);
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.fillRect(x, j * 32, 1.5, 32);
      }
    }
  }, [5, 2]),
  paddy: canvasTex(64, 64, (g) => {
    const r = prng(41);
    g.fillStyle = '#86b84a';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#6a9f3c';
    for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 2.5);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(180,220,110,.5)' : 'rgba(70,120,50,.4)';
      g.fillRect(r() * 64, r() * 64, 2, 2);
    }
  }, [8, 6]),
  tea: canvasTex(64, 64, (g) => {
    const r = prng(43);
    for (let y = 0; y < 64; y += 8) {
      g.fillStyle = gray(205 + r() * 50);
      g.fillRect(0, y, 64, 6);
      g.fillStyle = gray(125);
      g.fillRect(0, y + 6, 64, 2);
    }
    for (let i = 0; i < 160; i++) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(r() * 64, r() * 64, 2, 3);
    }
  }, [12, 26]),
  trunk: canvasTex(16, 64, (g) => {
    const r = prng(45);
    for (let y = 0; y < 64; y += 8) {
      g.fillStyle = gray(215 + r() * 40);
      g.fillRect(0, y, 16, 6);
      g.fillStyle = gray(150);
      g.fillRect(0, y + 6, 16, 2);
    }
  }, [1, 9]),
  rim: canvasTex(128, 128, (g) => {
    g.fillStyle = '#17191a';
    g.fillRect(0, 0, 128, 128);
    g.translate(64, 64);
    g.fillStyle = '#b9bec2';
    g.beginPath();
    g.arc(0, 0, 61, 0, TAU);
    g.arc(0, 0, 50, 0, TAU, true);
    g.fill();
    for (let i = 0; i < 5; i++) {
      g.rotate(TAU / 5);
      g.fillRect(-7, -54, 14, 48);
    }
    g.fillStyle = '#d5d9dc';
    g.beginPath();
    g.arc(0, 0, 15, 0, TAU);
    g.fill();
    g.fillStyle = '#3a3e41';
    g.beginPath();
    g.arc(0, 0, 5, 0, TAU);
    g.fill();
  })
};

TEX.waterN = (() => {
  const size = 256;
  const f = fbm(size, 13, 8, 4);
  const hgt = (x, y) => f[((y + size) % size) * size + (x + size) % size];
  return canvasTex(size, size, (g) => {
    const im = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (hgt(x - 1, y) - hgt(x + 1, y)) * 5;
        const dy = (hgt(x, y - 1) - hgt(x, y + 1)) * 5;
        const l = Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        im.data[i] = (dx / l * 0.5 + 0.5) * 255;
        im.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
        im.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
        im.data[i + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
  }, [26, 70], true);
})();
TEX.lagoonN = TEX.waterN.clone();
TEX.lagoonN.repeat.set(6, 13);
TEX.lagoonN.needsUpdate = true;
TEX.hillFoliage = TEX.foliage.clone();
TEX.hillFoliage.repeat.set(18, 9);
TEX.hillFoliage.needsUpdate = true;

function facadeTex(lit) {
  return canvasTex(256, 256, (g) => {
    const r = prng(61);
    g.fillStyle = lit ? '#000' : '#f4f4f0';
    g.fillRect(0, 0, 256, 256);
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) {
        const x = i * 32 + 5;
        const y = j * 32 + 7;
        if (lit) {
          if (r() < 0.45) {
            g.fillStyle = r() < 0.8 ? '#ffd58a' : '#cfe6ff';
            g.fillRect(x, y, 22, 17);
          }
        } else {
          g.fillStyle = '#44606b';
          g.fillRect(x, y, 22, 17);
          g.fillStyle = '#6f8d98';
          g.fillRect(x, y, 22, 5);
          g.fillStyle = '#d6d6cf';
          g.fillRect(i * 32, j * 32 + 28, 32, 4);
        }
      }
    }
  });
}

const frondTex = cutout(128, 512, (g, col) => {
  const r = prng(51);
  g.lineCap = 'round';
  g.lineWidth = 9.2;
  for (let i = 0; i < 46; i++) {
    const t = i / 45;
    const y = 500 - t * 480;
    const len = 60 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7) * 0.94 + 0.1), 0.8);
    g.strokeStyle = col(`hsl(${Math.round(96 + r() * 16)},${Math.round(42 + r() * 12)}%,${Math.round(24 + r() * 10)}%)`);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(64, y);
      g.lineTo(64 + s * len, y - len * 0.5 + 6);
      g.stroke();
    }
  }
  g.strokeStyle = col('#7c8f45');
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(64, 512);
  g.lineTo(64, 14);
  g.stroke();
}, '#3f6e33');

const bananaTex = cutout(128, 256, (g, col, cut) => {
  const r = prng(53);
  g.fillStyle = col('#6aa63c');
  g.beginPath();
  g.moveTo(64, 254);
  g.bezierCurveTo(4, 200, 6, 70, 64, 4);
  g.bezierCurveTo(122, 70, 124, 200, 64, 254);
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = col('#4f8a30');
  g.lineWidth = 1.5;
  for (let y = 30; y < 250; y += 12) {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(64, y + 10);
      g.lineTo(64 + s * 60, y - 8);
      g.stroke();
    }
  }
  g.strokeStyle = col('#b9d27a');
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(64, 256);
  g.lineTo(64, 6);
  g.stroke();
  g.restore();
  // Wind-torn splits along the edges.
  g.fillStyle = cut;
  for (let i = 0; i < 7; i++) {
    const s = r() < 0.5 ? -1 : 1;
    const y = 40 + r() * 180;
    g.beginPath();
    g.moveTo(64 + s * 62, y - 6);
    g.lineTo(64 + s * 62, y + 4);
    g.lineTo(64 + s * 22, y + 12);
    g.fill();
  }
}, '#5f9a36');

const tuftTex = cutout(128, 128, (g, col) => {
  const r = prng(57);
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x = 14 + r() * 100;
    const h = 50 + r() * 70;
    const bend = (r() - 0.5) * 50;
    g.strokeStyle = col(`hsl(${Math.round(88 + r() * 26)},${Math.round(38 + r() * 18)}%,${Math.round(46 + r() * 22)}%)`);
    g.lineWidth = 4 + r() * 3;
    g.beginPath();
    g.moveTo(x, 128);
    g.quadraticCurveTo(x + bend * 0.3, 128 - h * 0.6, x + bend, 128 - h);
    g.stroke();
  }
}, '#86b062');

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, '#8a8a8a');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
TEX.glow = glowTexture();

/* Materials */

const matCache = new Map();
function mat(color, roughness = 0.9, metalness = 0, map = null) {
  const key = color + '|' + roughness + '|' + metalness + '|' + (map ? map.uuid : '');
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, map });
    matCache.set(key, m);
  }
  return m;
}

function overlay(color, roughness, layer, map = null) {
  return new THREE.MeshStandardMaterial({
    color, roughness, map, polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer
  });
}

const paintCache = new Map();
function paint(color) {
  let m = paintCache.get(color);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 0.7 });
    paintCache.set(color, m);
  }
  return m;
}

function leafMat(tex, roughness = 0.85) {
  const m = new THREE.MeshStandardMaterial({ map: tex.map, alphaMap: tex.alphaMap, alphaTest: 0.35, side: THREE.DoubleSide, roughness });
  // Thin leaves shadowing themselves only produces speckle.
  m.userData.noReceive = true;
  return m;
}

const mats = {
  grass: mat(0xffffff, 1, 0, TEX.grass),
  deepGrass: mat(0xb9cdb4, 1, 0, TEX.grass),
  sand: mat(0xffffff, 1, 0, TEX.sand),
  sea: new THREE.MeshStandardMaterial({ color: 0x2b7888, roughness: 0.12, metalness: 0.1, normalMap: TEX.waterN, normalScale: new THREE.Vector2(0.45, 0.45) }),
  water: new THREE.MeshStandardMaterial({
    color: 0x3f8f86, roughness: 0.1, metalness: 0.1, normalMap: TEX.lagoonN, normalScale: new THREE.Vector2(0.3, 0.3),
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
  }),
  foam: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, alphaMap: TEX.foam, transparent: true, opacity: 0.85, depthWrite: false }),
  frond: leafMat(frondTex),
  banana: leafMat(bananaTex, 0.6),
  tuft: Object.assign(leafMat(tuftTex, 1), { side: THREE.FrontSide }),
  foliage: mat(0xffffff, 1, 0, TEX.foliage),
  hill: new THREE.MeshStandardMaterial({ map: TEX.hillFoliage, vertexColors: true, roughness: 1 }),
  teaHill: new THREE.MeshStandardMaterial({ map: TEX.tea, vertexColors: true, roughness: 1 }),
  bush: mat(0xffffff, 1),
  palmTrunk: mat(0xa89274, 1, 0, TEX.trunk),
  trunk: mat(0x76553b, 1),
  bananaStem: mat(0x86a85a, 0.8),
  coconut: mat(0x5c7a34, 0.7),
  white: mat(0xe9e8dd),
  dark: mat(0x16191a, 0.6),
  tyre: new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.95, side: THREE.DoubleSide }),
  rimSide: mat(0x9aa0a4, 0.35, 0.8),
  rimCap: new THREE.MeshStandardMaterial({ map: TEX.rim, roughness: 0.4, metalness: 0.5 }),
  pole: mat(0x6d7471, 0.7),
  door: mat(0x5a4632, 0.7),
  frame: mat(0xf1ece0, 0.8),
  plinth: mat(0x8d8a80, 1),
  shutter: mat(0x8c9396, 0.55, 0.4),
  winDark: mat(0x2c4047, 0.15, 0.5),
  carGlass: new THREE.MeshStandardMaterial({ color: 0x101c22, roughness: 0.06, metalness: 0.7 }),
  laterite: overlay(0xffffff, 0.95, 1, TEX.laterite),
  paddy: overlay(0xffffff, 0.9, 1, TEX.paddy),
  road: overlay(0xffffff, 0.9, 2, TEX.asphalt),
  line: overlay(0xe8dfbd, 0.8, 3),
  winLit: new THREE.MeshStandardMaterial({ color: 0x6f929b, roughness: 0.2, metalness: 0.3, emissive: 0xffc56a, emissiveIntensity: 0 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xffefc4, roughness: 0.25, emissive: 0xffe2a0, emissiveIntensity: 0.1 }),
  tail: new THREE.MeshStandardMaterial({ color: 0xa82a26, roughness: 0.35, emissive: 0xff2a1a, emissiveIntensity: 0.1 }),
  brake: new THREE.MeshStandardMaterial({ color: 0xa82a26, roughness: 0.35, emissive: 0xff2a1a, emissiveIntensity: 0.1 }),
  bulb: new THREE.MeshStandardMaterial({ color: 0xd9d6c8, roughness: 0.5, emissive: 0xffd48a, emissiveIntensity: 0 }),
  pool: new THREE.MeshBasicMaterial({
    map: TEX.glow, color: 0xffc777, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
  }),
  lampGlow: new THREE.PointsMaterial({
    map: TEX.glow, color: 0xffc777, size: 5, sizeAttenuation: true, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending
  }),
  headGlow: new THREE.SpriteMaterial({
    map: TEX.glow, color: 0xfff0c8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
  })
};
const RIM_MATS = [mats.rimSide, mats.rimCap, mats.rimCap];
const towerMats = [0xd3d9cf, 0xb4c6c9, 0xe6cfb6].map((color) => new THREE.MeshStandardMaterial({
  color, map: facadeTex(false), roughness: 0.7, emissive: 0xffffff, emissiveMap: facadeTex(true), emissiveIntensity: 0
}));

/* Shared geometry */

// Bumps a round shape into something natural, and optionally shades it darker toward the base.
function lumpy(geo, amount, shade) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const col = shade ? new Float32Array(p.count * 3) : null;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + 1.3) * Math.sin(v.z * 2.7 + 0.5) * 0.55
      + Math.sin(v.y * 5.1 + v.x * 2.3) * 0.28
      + Math.sin(v.x * 7.3 + v.z * 6.1 + v.y * 4) * 0.17;
    if (col) {
      const k = lerp(0.6, 1.05, smoothstep(v.y, -0.1, 0.95)) * (1 + n * 0.12);
      col[i * 3] = k;
      col[i * 3 + 1] = k;
      col[i * 3 + 2] = k * 0.96;
    }
    v.multiplyScalar(1 + n * amount);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

function palmTrunkGeo() {
  const g = new THREE.CylinderGeometry(0.15, 0.3, 8, 7, 8).translate(0, 4, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / 8;
    p.setX(i, p.getX(i) + 0.9 * t * t);
  }
  g.computeVertexNormals();
  return g;
}

// One palm frond: a strip that rises from the crown and droops, folded along its rib.
function frondGeo(pitch, droop) {
  const L = 4.4;
  const W = 1.3;
  const SEG = 7;
  const pos = [];
  const uv = [];
  const idx = [];
  let y = 0;
  let z = 0;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    if (i) {
      const a = pitch - droop * (t - 0.5 / SEG);
      y += Math.sin(a) * L / SEG;
      z += Math.cos(a) * L / SEG;
    }
    pos.push(-W / 2, y - 0.22, z, 0, y, z, W / 2, y - 0.22, z);
    uv.push(0, t, 0.5, t, 1, t);
    if (i) {
      const k = (i - 1) * 3;
      idx.push(k, k + 1, k + 3, k + 1, k + 4, k + 3, k + 1, k + 2, k + 4, k + 2, k + 5, k + 4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tuftGeo() {
  const pos = [];
  const uv = [];
  const nor = [];
  for (const a of [0, Math.PI / 3, Math.PI * 2 / 3]) {
    const c = Math.cos(a) * 0.5;
    const s = Math.sin(a) * 0.5;
    const quad = [[-c, 0, -s, 0, 0], [c, 0, s, 1, 0], [c, 1, s, 1, 1], [-c, 0, -s, 0, 0], [c, 1, s, 1, 1], [-c, 1, -s, 0, 1]];
    // Both windings, all normals up, so blades are lit like the ground from either side.
    for (const q of quad.concat(quad.slice().reverse())) {
      pos.push(q[0], q[1], q[2]);
      uv.push(q[3], q[4]);
      nor.push(0, 1, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  hill: lumpy(new THREE.SphereGeometry(1, 40, 20), 0.12, true),
  blob: lumpy(new THREE.SphereGeometry(1, 10, 7), 0.22, false),
  ball: new THREE.SphereGeometry(1, 7, 5),
  bush: new THREE.SphereGeometry(1, 6, 4),
  pyramid: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
  hull: new THREE.ConeGeometry(1.3, 7, 4),
  trunk: new THREE.CylinderGeometry(0.6, 1, 1, 7),
  palmTrunk: palmTrunkGeo(),
  frondUp: frondGeo(1.05, 1.5),
  frondDown: frondGeo(0.3, 1.45),
  tuft: tuftGeo(),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  wheel: new THREE.CylinderGeometry(1, 1, 1, 16).rotateZ(Math.PI / 2),
  rim: new THREE.CylinderGeometry(0.62, 0.62, 1, 20).rotateZ(Math.PI / 2),
  tyre: new THREE.LatheGeometry([[0.6, -0.5], [0.9, -0.5], [1, -0.36], [1, 0.36], [0.9, 0.5], [0.6, 0.5]].map(([x, y]) => new THREE.Vector2(x, y)), 20).rotateZ(Math.PI / 2)
};
for (const g of Object.values(GEO)) g.userData.shared = true;

function mesh(geo, material, parent, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function group(parent = scene) {
  const g = new THREE.Group();
  parent.add(g);
  return g;
}

// Joins several placed shapes into one geometry so a vehicle is a handful of draw calls.
function mergeParts(parts) {
  const pos = [];
  const nor = [];
  const uv = [];
  const m = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  for (const [g0, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    nm.getNormalMatrix(m);
    const P = g.attributes.position;
    const N = g.attributes.normal;
    const U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      nor.push(v.x, v.y, v.z);
      uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
    }
    if (g !== g0) g.dispose();
    if (!g0.userData.shared) g0.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.userData.shared = true;
  return out;
}

// A box with genuinely rounded edges, built at its real size.
function rb(w, h, d, r) {
  const s = new THREE.Shape();
  const x = w / 2 - r;
  const y = h / 2 - r;
  s.moveTo(-x, -h / 2);
  s.lineTo(x, -h / 2);
  s.absarc(x, -y, r, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, y);
  s.absarc(x, y, r, 0, Math.PI / 2, false);
  s.lineTo(-x, h / 2);
  s.absarc(-x, y, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, -y);
  s.absarc(-x, -y, r, Math.PI, Math.PI * 1.5, false);
  // The bevel is half the corner radius, so the end caps never collapse to a point.
  const b = r / 2;
  const g = new THREE.ExtrudeGeometry(s, {
    depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2, curveSegments: 5
  });
  g.translate(0, 0, -(d - 2 * b) / 2);
  return g;
}

/* Cloud deck, sun glare and sky reflections */

stars.renderOrder = -2.5;

const cloudGeo = new THREE.BufferGeometry();
{
  const rings = [0, 180, 420, 760, 1150, 1700];
  const SEG = 28;
  const pos = [];
  const uv = [];
  const col = [];
  const idx = [];
  rings.forEach((r, ri) => {
    for (let s = 0; s <= SEG; s++) {
      const a = s / SEG * TAU;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      pos.push(x, 360 - (r / 1700) ** 2 * 330, z);
      uv.push(x / 800, z / 800);
      col.push(1, 1, 1, 1 - smoothstep(r, 500, 1650));
    }
    if (ri) {
      for (let s = 0; s < SEG; s++) {
        const a = (ri - 1) * (SEG + 1) + s;
        const b = ri * (SEG + 1) + s;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  });
  cloudGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cloudGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  cloudGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  cloudGeo.setIndex(idx);
}
const clouds = new THREE.Mesh(cloudGeo, new THREE.MeshBasicMaterial({
  color: 0xffffff, alphaMap: TEX.cloud, vertexColors: true, transparent: true, opacity: 0.7,
  depthWrite: false, fog: false, side: THREE.DoubleSide
}));
clouds.renderOrder = -1;
clouds.frustumCulled = false;
scene.add(clouds);

const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: TEX.glow, color: 0xfff1cf, transparent: true, opacity: 0, depthWrite: false, fog: false,
  blending: THREE.AdditiveBlending, toneMapped: false
}));
sunGlow.scale.setScalar(520);
sunGlow.renderOrder = -1.5;
scene.add(sunGlow);

// The sky is baked into a reflection map now and then, so paint, glass, water and wet roads mirror it.
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envGround = new THREE.Mesh(
  new THREE.CircleGeometry(1480, 24).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x4c6a45, toneMapped: false })
);
envGround.position.y = -25;
envScene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, toneMapped: false })), envGround);
let envRT = null;
let envClock = -99;
let envCloud = -9;
let envAt = 0;

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
    lampStep: 54, lampRoads: [0, 2], paddies: 7, tufts: 0.5,
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
    lampStep: 36, lampRoads: 'all', paddies: 3, tufts: 0.25,
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
    lampStep: 0, lampRoads: [], paddies: 0, tufts: 0.3,
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
let glowPts = [];
let cloudDrift = 0;
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

function put(geo, material, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, shadow = true, color = null) {
  C0.position.set(x, y, z);
  C0.scale.set(sx, sy, sz);
  C0.rotation.set(rx, ry, rz);
  C0.updateMatrix();
  const key = geo.uuid + material.uuid + shadow;
  let b = batches.get(key);
  if (!b) batches.set(key, b = { geo, material, shadow, list: [], colors: color === null ? null : [] });
  b.list.push(new THREE.Matrix4().multiplyMatrices(P0.matrix, C0.matrix));
  if (b.colors) b.colors.push(color === null ? 0xffffff : color);
}

function flush() {
  const tint = new THREE.Color();
  for (const b of batches.values()) {
    const im = new THREE.InstancedMesh(b.geo, b.material, b.list.length);
    b.list.forEach((m, i) => im.setMatrixAt(i, m));
    if (b.colors) b.colors.forEach((c, i) => im.setColorAt(i, tint.setHex(c)));
    im.castShadow = b.shadow;
    im.receiveShadow = !b.material.userData.noReceive;
    world.add(im);
  }
  batches.clear();
  if (glowPts.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(glowPts, 3));
    world.add(new THREE.Points(g, mats.lampGlow));
  }
  glowPts = [];
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
  glowPts = [];
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
  const uv = [];
  const idx = [];
  let dist = 0;
  r.pts.forEach((p, i) => {
    if (i) dist += Math.hypot(p.x - r.pts[i - 1].x, p.z - r.pts[i - 1].z);
    const cx = p.x + p.lx * off;
    const cz = p.z + p.lz * off;
    pos.push(cx + p.lx * width / 2, y, cz + p.lz * width / 2, cx - p.lx * width / 2, y, cz - p.lz * width / 2);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push(0, dist / width, 1, dist / width);
  });
  for (let i = 0; i < r.pts.length - 1; i++) {
    if (mask && mask[i]) continue;
    const k = i * 2;
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
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

function hill(x, z, rx, rz, h, color, tea = false) {
  // Hills never sit on a road: shrink them to fit, or leave them out.
  const fit = (roadDist(x, z) - 8) / Math.max(rx, rz);
  if (fit < 0.35) return;
  const k = Math.min(1, fit);
  rx *= k; rz *= k; h *= k;
  at(0, 0);
  put(GEO.hill, tea ? mats.teaHill : mats.hill, x, h * 0.28, z, rx, h, rz, 0, rnd() < 0.5 ? 0 : Math.PI, 0, true, color);
  hillList.push({ x, z, rx, rz });
  colliders.push({ t: 2, x, z, rx, rz });
}

const CROWNS = [0x5a9650, 0x68a65a, 0x4c8646, 0x76ae5e];
const TUFTS = [0xffffff, 0xeef4d0, 0xdcebb8, 0xf4eec0];

function tree(x, z, type, scale) {
  at(x, z, rnd() * TAU, scale);
  if (type === 'coconut') {
    const cx = 0.9;
    const cy = 7.95;
    put(GEO.palmTrunk, mats.palmTrunk, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const s = rr(0.85, 1.1);
      put(GEO.frondUp, mats.frond, cx, cy, 0, s, s, s, 0, i / 7 * TAU + rr(-0.2, 0.2), 0);
    }
    for (let i = 0; i < 8; i++) {
      const s = rr(0.85, 1.1);
      put(GEO.frondDown, mats.frond, cx, cy - 0.15, 0, s, s, s, 0, i / 8 * TAU + rr(-0.25, 0.25), 0);
    }
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.4;
      put(GEO.ball, mats.coconut, cx + Math.cos(a) * 0.28, cy - 0.35, Math.sin(a) * 0.28, 0.2, 0.22, 0.2, 0, 0, 0, false);
    }
  } else {
    put(GEO.trunk, mats.trunk, 0, 2.6, 0, 0.42, 5.2, 0.42);
    put(GEO.blob, mats.foliage, 0, 6.2, 0, 2.7, 2.3, 2.7, 0, rnd() * TAU, 0, true, pick(CROWNS));
    put(GEO.blob, mats.foliage, 1.5, 5.4, 0.6, 1.8, 1.5, 1.8, 0, rnd() * TAU, 0, true, pick(CROWNS));
    put(GEO.blob, mats.foliage, -1.3, 5.6, -0.8, 1.9, 1.6, 1.9, 0, rnd() * TAU, 0, true, pick(CROWNS));
    put(GEO.blob, mats.foliage, 0.2, 7.7, -0.3, 1.6, 1.3, 1.6, 0, rnd() * TAU, 0, true, pick(CROWNS));
  }
  colliders.push({ t: 0, x, z, r: 0.45 * scale });
  occupied.push([x, z, 1.3]);
}

function banana(x, z) {
  at(x, z, rnd() * TAU, rr(0.8, 1.25));
  put(GEO.cyl, mats.bananaStem, 0, 0.9, 0, 0.13, 1.8, 0.13);
  for (let i = 0; i < 6; i++) {
    put(GEO.frondUp, mats.banana, 0, 1.7, 0, 1.05, rr(0.42, 0.55), rr(0.42, 0.55), 0, i / 6 * TAU + rr(-0.3, 0.3), 0);
  }
  occupied.push([x, z, 0.8]);
}

function tuft(x, z) {
  at(x, z, rnd() * TAU);
  const s = rr(0.6, 1.2);
  put(GEO.tuft, mats.tuft, 0, 0, 0, s, s * rr(0.5, 0.9), s, 0, 0, 0, false, pick(TUFTS));
}

const SIGNS = [
  ['ചായക്കട', '#1b6b3a'], ['ബേക്കറി', '#b3261e'], ['തുണിക്കട', '#6a2c91'],
  ['മെഡിക്കൽ സ്റ്റോർ', '#0b6aa8'], ['സൂപ്പർ മാർക്കറ്റ്', '#d17a00'], ['ഹോട്ടൽ', '#7a4a21']
];
let signMats = null;

function signMaterial(text, bg, fg = '#fff') {
  const tex = canvasTex(256, 64, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = fg;
    g.lineWidth = 4;
    g.strokeRect(3, 3, 250, 58);
    g.fillStyle = fg;
    g.font = 'bold 30px "Baloo Chettan 2","Noto Sans Malayalam","Nirmala UI",Kartika,sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 34);
  });
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
}

function makeSigns() {
  signMats = SIGNS.map(([text, bg]) => signMaterial(text, bg));
}

// Destination boards on the buses name the nearest big town.
const BUS_NAMES = { malabar: 'കണ്ണൂർ', kochi: 'എറണാകുളം', wayanad: 'കൽപ്പറ്റ' };
const boardMats = {};
function busBoard() {
  if (!boardMats[activePlace]) boardMats[activePlace] = signMaterial(BUS_NAMES[activePlace], '#1c1c1c', '#ffd23a');
  return boardMats[activePlace];
}

const HOUSE_WALLS = [0xece0c4, 0xf1e7d6, 0xe2d6ba, 0xe7ebd8, 0xeed7c8];
const SHOP_WALLS = [0xddceac, 0xd7e0d0, 0xead1b8, 0xd1dbe4, 0xebdeb0];
const ROOFS = [0xb86a50, 0xa85f48, 0xc47658];
const AWNINGS = [0xb83d32, 0x276348, 0xd7a83d, 0x2f5a7a];

function house(x, z, ry, kind, w, d) {
  at(x, z, ry);
  const shop = kind === 'shop';
  const storeys = shop && rnd() < 0.45 ? 2 : 1;
  const h = storeys === 2 ? 7.6 : 4.4;
  const roof = mat(pick(ROOFS), 0.85, 0, TEX.roof);
  const wall = mat(pick(shop ? SHOP_WALLS : HOUSE_WALLS), 0.92, 0, TEX.wall);
  const f = d / 2;
  const flat = (geo, m, px, py, pz, sx, sy, sz, rx = 0) => put(geo, m, px, py, pz, sx, sy, sz, rx, 0, 0, false);
  const frontWin = (px, py) => {
    flat(GEO.box, mats.frame, px, py, f + 0.02, 1.6, 1.5, 0.1);
    flat(GEO.box, rnd() < 0.6 ? mats.winLit : mats.winDark, px, py, f + 0.05, 1.3, 1.2, 0.1);
  };

  put(GEO.box, mats.plinth, 0, 0.2, 0, w + 0.5, 0.4, d + 0.5);
  put(GEO.box, wall, 0, h / 2 + 0.2, 0, w, h, d);
  put(GEO.pyramid, roof, 0, h + 1.5, 0, w * 1.16, 2.6, d * 1.16);
  if (storeys === 2) flat(GEO.box, mats.frame, 0, 4.1, 0, w + 0.14, 0.22, d + 0.14);

  const doorX = shop ? -w * 0.33 : 0;
  flat(GEO.box, mats.frame, doorX, 1.5, f + 0.02, 1.6, 2.6, 0.1);
  flat(GEO.box, mats.door, doorX, 1.4, f + 0.05, 1.3, 2.35, 0.1);

  for (let s = 0; s < storeys; s++) {
    const y = 2.8 + s * 3.4;
    if (!(shop && s === 0)) {
      frontWin(-w * 0.28, y);
      frontWin(w * 0.28, y);
    }
    for (const side of [-1, 1]) {
      flat(GEO.box, mats.frame, side * (w / 2 + 0.02), y, 0, 0.1, 1.5, 1.6);
      flat(GEO.box, rnd() < 0.6 ? mats.winLit : mats.winDark, side * (w / 2 + 0.05), y, 0, 0.1, 1.2, 1.3);
    }
  }

  if (shop) {
    // Half-raised roller shutter with the shop dark behind it.
    flat(GEO.box, mats.dark, w * 0.14, 1.35, f + 0.02, w * 0.5, 2.3, 0.08);
    flat(GEO.box, mats.shutter, w * 0.14, 2.3, f + 0.06, w * 0.52, 0.9, 0.1);
    flat(GEO.box, pick(signMats), 0, 4.0, f + 0.1, w * 0.66, 0.85, 0.12);
    put(GEO.box, mat(pick(AWNINGS)), 0, 3.25, f + 0.9, w * 0.92, 0.1, 1.8, 0.2);
  } else {
    put(GEO.box, roof, 0, 3.3, f + 1.3, w * 0.74, 0.16, 2.7, 0.12);
    for (const side of [-1, 1]) put(GEO.box, mats.frame, side * w * 0.31, 1.6, f + 2.35, 0.24, 3.2, 0.24);
    flat(GEO.box, mats.plinth, 0, 0.12, f + 1.3, w * 0.74, 0.24, 2.6);
  }
  boxCollider(x, z, w / 2 + 0.3, d / 2 + 0.3, ry);
  occupied.push([x, z, Math.hypot(w, d) / 2 * 0.92]);

  if (!shop) {
    // A few banana plants beside the house.
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    for (let i = 0; i < 3; i++) {
      const lx = (rnd() < 0.5 ? -1 : 1) * (w / 2 + rr(1.6, 3.2));
      const lz = rr(-d / 2, d / 2);
      const bx = x + lx * c + lz * s;
      const bz = z - lx * s + lz * c;
      if (roadDist(bx, bz) > 2.5 && !blocked(bx, bz, 0.8)) banana(bx, bz);
    }
  }
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
  glowPts.push(x + Math.sin(ry) * 1.8, 6.8, z + Math.cos(ry) * 1.8);
  colliders.push({ t: 0, x, z, r: 0.22 });
  occupied.push([x, z, 0.6]);
}

function tower(x, z, w, h, material) {
  const g = new THREE.BoxGeometry(w, h, w);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 24, uv.getY(i) * h / 28);
  const m = mesh(g, material, world);
  m.position.set(x, h / 2, z);
  at(0, 0);
  put(GEO.box, mats.plinth, x, h + 0.4, z, w + 0.6, 0.8, w + 0.6);
  put(GEO.box, mats.pole, x + w * 0.2, h + 1.6, z - w * 0.15, 2.2, 1.6, 2.2);
  boxCollider(x, z, w / 2 + 0.2, w / 2 + 0.2);
  occupied.push([x, z, w * 0.75]);
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
    for (let i = 0; i < 3; i++) {
      const foam = mesh(GEO.plane, mats.foam, world, false);
      foam.scale.set(7, 1, 1400);
      foam.position.set(-393 - i * 9, -0.03 - i * 0.05, 0);
      foam.renderOrder = 1;
      waves.push({ m: foam, x: -393 - i * 9, ph: i * 1.7 });
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
      hill(-420 + i * 48, -285 - rnd() * 100, rr(80, 160), rr(65, 150), rr(55, 110), pick([0x5f8f62, 0x6a9a68, 0x578658]));
    }
    for (let i = 0; i < 26; i++) {
      hill(rr(-430, 430), rr(-230, 330), rr(32, 70), rr(25, 60), rr(22, 52), pick([0x86b46a, 0x7aa862, 0x92bc72]), true);
    }
  } else {
    for (let i = 0; i < 12; i++) {
      hill(-430 + i * 78, -330 - rnd() * 45, rr(55, 100), rr(48, 103), rr(35, 75), pick([0x7aa26c, 0x6f9864, 0x86ac74]));
    }
    for (let i = 0; i < 7; i++) {
      hill(470 + rnd() * 40, -260 + i * 95, rr(40, 70), rr(45, 80), rr(25, 50), pick([0x74a068, 0x80aa70]));
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
    const concrete = mat(0xddd6c3, 0.9, 0, TEX.wall);
    for (const s of [-1, 1]) {
      put(GEO.box, mats.white, -90, 1.05, -180 + s * 5.8, 122, 0.16, 0.2);
      put(GEO.box, mats.white, -90, 0.55, -180 + s * 5.8, 122, 0.1, 0.12);
      for (let x = -150; x <= -30; x += 4) put(GEO.box, mats.white, x, 0.55, -180 + s * 5.8, 0.22, 1.1, 0.22);
      boxCollider(-90, -180 + s * 5.9, 61, 0.3);
      for (const x of [-128, -52]) put(GEO.box, concrete, x, 8, -180 + s * 6.6, 1.2, 16, 1.2);
    }
    for (const x of [-128, -52]) put(GEO.box, concrete, x, 15.4, -180, 1.2, 1.2, 14.4);

    for (let i = 0; i < 22; i++) {
      const x = -220 + i * 21;
      const h = rr(26, 80);
      if (roadDist(x, -270) < 9 || inWater(x, -270, 8)) continue;
      tower(x, -270, 13, h, towerMats[i % 3]);
    }
    for (let i = 0; i < 9; i++) tower(420, -250 + i * 62, 17, rr(32, 74), towerMats[(i + 1) % 3]);
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

  // Paddy fields fill the open land between the roads.
  if (p.paddies) {
    for (let i = 0; i < p.paddies * 5; i++) {
      const x = rr(-260, 470);
      const z = rr(-190, 370);
      if (roadDist(x, z) < 34 || blocked(x, z, 30)) continue;
      const w = rr(34, 52);
      const l = rr(28, 42);
      at(x, z, rnd() < 0.5 ? 0 : Math.PI / 2);
      put(GEO.plane, mats.paddy, 0, 0, 0, w, 1, l, 0, 0, 0, false);
      for (const s of [-1, 1]) {
        put(GEO.box, mats.laterite, 0, 0.1, s * l / 2, w + 1, 0.3, 1, 0, 0, 0, false);
        put(GEO.box, mats.laterite, s * w / 2, 0.1, 0, 1, 0.3, l + 1, 0, 0, 0, false);
      }
      occupied.push([x, z, 30]);
    }
  }

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
      put(GEO.hull, mat([0x6b4534, 0x2f5a7a, 0x8a3a30][i % 3], 0.7), 0, 0.35, 0, 1, 1, 1, 0, 0, Math.PI / 2);
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
        put(GEO.bush, mats.bush, x, 0.75, z, 3.1, 1.15, 2.1, 0, 0, 0, false, [0x5f9a50, 0x6aa85a, 0x558a48][(row + Math.floor((x + 400) / 40)) % 3]);
      }
    }
  }

  // Grass tufts soften the road edges and break up the open ground.
  const tuftRate = p.tufts * (isTouch ? 0.5 : 1);
  roads.forEach((r) => {
    for (const pt of r.pts) {
      for (const side of [-1, 1]) {
        if (rnd() > tuftRate) continue;
        const o = r.hw + 1.4 + rnd() * 9;
        const x = pt.x + pt.lx * o * side;
        const z = pt.z + pt.lz * o * side;
        if (roadDist(x, z) < 1.5 || blocked(x, z, 0.3)) continue;
        tuft(x, z);
      }
    }
  });
  for (let i = 0; i < 1400 * tuftRate; i++) {
    const x = rr(p.sea ? -296 : -480, 480);
    const z = rr(-370, 370);
    if (roadDist(x, z) < 1.5 || blocked(x, z, 0.3)) continue;
    tuft(x, z);
  }
}

/* ------------------------------------------------------------------ */
/* Vehicles                                                            */
/* ------------------------------------------------------------------ */

let VG = null;

// Vehicle bodies are modelled once from profiles and rounded boxes, then reused.
function vehicleGeos() {
  if (VG) return VG;
  const B = GEO.box;
  const W = GEO.wheel;

  // Side profile of a tall-boy hatchback, nose toward +x here and swung round to +z below.
  const s = new THREE.Shape();
  s.moveTo(-1.95, 0.42);
  s.lineTo(-2.08, 0.72);
  s.lineTo(-2.06, 1.22);
  s.lineTo(-1.84, 1.9);
  s.quadraticCurveTo(-1.78, 1.98, -1.55, 1.99);
  s.quadraticCurveTo(-0.6, 2.03, 0.3, 1.97);
  s.quadraticCurveTo(0.42, 1.95, 0.5, 1.86);
  s.lineTo(1.06, 1.36);
  s.quadraticCurveTo(1.5, 1.27, 1.9, 1.16);
  s.quadraticCurveTo(2.07, 1.1, 2.09, 0.92);
  s.lineTo(2.1, 0.5);
  s.lineTo(2.02, 0.36);
  s.lineTo(1.77, 0.36);
  s.absarc(1.3, 0.36, 0.47, 0, Math.PI, false);
  s.lineTo(-0.78, 0.36);
  s.absarc(-1.25, 0.36, 0.47, 0, Math.PI, false);
  s.lineTo(-1.9, 0.36);
  const hull = new THREE.ExtrudeGeometry(s, {
    depth: 1.7, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.07, bevelOffset: -0.07, bevelSegments: 3, curveSegments: 8
  });
  hull.translate(0, 0, -0.85);
  hull.rotateY(-Math.PI / 2);

  const band = new THREE.Shape();
  band.moveTo(0.93, 1.4);
  band.lineTo(0.47, 1.82);
  band.lineTo(-1.62, 1.86);
  band.lineTo(-1.8, 1.4);
  const windows = new THREE.ExtrudeGeometry(band, { depth: 1.92, bevelEnabled: false });
  windows.translate(0, 0, -0.96);
  windows.rotateY(-Math.PI / 2);

  const busPillars = [];
  for (let i = 0; i < 6; i++) busPillars.push([B, 0, 2.5, -3.6 + i * 1.44, 2.66, 0.8, 0.14]);
  const busArches = [];
  for (const x of [-1.3, 1.3]) for (const z of [-3.1, 3.2]) busArches.push([W, x, 0.58, z, 0.04, 0.64, 0.64]);

  VG = {
    car: {
      paint: mergeParts([
        [hull],
        [B, 0, 1.63, -0.3, 1.94, 0.47, 0.1],
        [B, 0, 1.63, -1.25, 1.94, 0.47, 0.1],
        [rb(0.2, 0.13, 0.1, 0.03), 1.03, 1.42, 0.86],
        [rb(0.2, 0.13, 0.1, 0.03), -1.03, 1.42, 0.86]
      ]),
      glass: mergeParts([
        [windows],
        [B, 0, 1.619, 0.788, 1.56, 0.66, 0.03, -0.842],
        [B, 0, 1.646, -1.935, 1.5, 0.44, 0.03, 0.313]
      ]),
      dark: mergeParts([
        [B, 0, 0.62, 0, 1.4, 0.5, 3.7],
        [rb(1.88, 0.3, 0.25, 0.08), 0, 0.52, 2.0],
        [rb(1.88, 0.3, 0.25, 0.08), 0, 0.52, -1.96],
        [B, 0, 1.0, 2.085, 0.8, 0.12, 0.04],
        [B, 0, 0.68, 2.105, 1.1, 0.14, 0.04],
        [B, 0, 0.43, 0.025, 1.9, 0.12, 1.5],
        [B, 0, 0.95, 0.92, 1.914, 0.86, 0.015],
        [B, 0, 0.95, -0.3, 1.914, 0.86, 0.015],
        [B, 0, 1.2, -0.14, 1.93, 0.035, 0.14],
        [B, 0, 1.2, -0.95, 1.93, 0.035, 0.14]
      ]),
      lamp: mergeParts([[rb(0.44, 0.17, 0.06, 0.04), 0.64, 1.0, 2.075], [rb(0.44, 0.17, 0.06, 0.04), -0.64, 1.0, 2.075]]),
      tail: mergeParts([[B, 0.8, 1.3, -2.04, 0.16, 0.42, 0.08], [B, -0.8, 1.3, -2.04, 0.16, 0.42, 0.08]]),
      plate: mergeParts([[B, 0, 0.62, 2.125, 0.5, 0.14, 0.02], [B, 0, 0.9, -2.085, 0.5, 0.14, 0.02]])
    },
    bus: {
      paint: mergeParts([[rb(2.6, 2.75, 9.8, 0.2), 0, 1.85, 0], ...busPillars]),
      stripe: mergeParts([[B, 0, 1.3, 0, 2.63, 0.28, 9.6]]),
      glass: mergeParts([
        [B, 0, 2.5, 0, 2.63, 0.8, 8.9],
        [B, 0, 2.3, 4.895, 2.25, 1.15, 0.04],
        [B, 0, 2.5, -4.895, 2.0, 0.8, 0.04]
      ]),
      dark: mergeParts([
        [rb(2.62, 0.34, 0.3, 0.08), 0, 0.66, 4.85],
        [rb(2.62, 0.34, 0.3, 0.08), 0, 0.66, -4.85],
        [B, 0, 0.62, 0, 2.0, 0.5, 9.0],
        ...busArches
      ]),
      lamp: mergeParts([[B, 0.95, 0.95, 4.9, 0.38, 0.24, 0.06], [B, -0.95, 0.95, 4.9, 0.38, 0.24, 0.06]]),
      tail: mergeParts([[B, 0.95, 0.95, -4.9, 0.34, 0.24, 0.06], [B, -0.95, 0.95, -4.9, 0.34, 0.24, 0.06]])
    },
    auto: {
      black: mergeParts([
        [rb(1.5, 0.95, 1.9, 0.2), 0, 1.62, -0.35],
        [rb(1.52, 0.1, 2.5, 0.04), 0, 2.1, -0.1],
        [B, 0, 0.42, -0.1, 1.2, 0.3, 2.4]
      ]),
      yellow: mergeParts([
        [rb(1.46, 0.7, 2.5, 0.12), 0, 0.72, -0.15],
        [rb(1.1, 0.6, 0.75, 0.14), 0, 0.76, 1.32],
        [B, 0.6, 1.5, 0.95, 0.06, 1.1, 0.06],
        [B, -0.6, 1.5, 0.95, 0.06, 1.1, 0.06]
      ]),
      glass: mergeParts([
        [B, 0, 1.55, 0.97, 1.16, 0.8, 0.04, -0.12],
        [B, 0, 1.72, -0.35, 1.53, 0.46, 1.05],
        [B, 0, 1.72, -1.31, 1.0, 0.4, 0.04]
      ]),
      lamp: mergeParts([[rb(0.24, 0.2, 0.06, 0.05), 0, 1.0, 1.7]]),
      tail: mergeParts([[B, 0.55, 0.8, -1.41, 0.22, 0.12, 0.04], [B, -0.55, 0.8, -1.41, 0.22, 0.12, 0.04]])
    }
  };
  return VG;
}

function addWheel(v, x, z, r, width) {
  const steerNode = group(v);
  steerNode.position.set(x, r, z);
  const spin = group(steerNode);
  mesh(GEO.tyre, mats.tyre, spin).scale.set(width, r, r);
  mesh(GEO.rim, RIM_MATS, spin).scale.set(width * 1.04, r, r);
  return { steerNode, spin };
}

function headGlow(v, x, y, z, size) {
  for (const sx of x ? [-x, x] : [0]) {
    const sp = new THREE.Sprite(mats.headGlow);
    sp.position.set(sx, y, z);
    sp.scale.setScalar(size);
    v.add(sp);
  }
}

function makeWagon(parent, color = 0x9e3030, isPlayer = false) {
  const g = vehicleGeos().car;
  const car = group(parent);
  const body = group(car);
  mesh(g.paint, paint(color), body);
  mesh(g.glass, mats.carGlass, body);
  mesh(g.dark, mats.dark, body);
  mesh(g.lamp, mats.lamp, body, false);
  mesh(g.tail, isPlayer ? mats.brake : mats.tail, body, false);
  mesh(g.plate, mats.white, body, false);
  headGlow(body, 0.64, 1.0, 2.16, 1.5);

  const wheels = [];
  for (const x of [-0.84, 0.84]) {
    for (const z of [-1.25, 1.3]) {
      const w = addWheel(car, x, z, 0.36, 0.22);
      w.front = z > 0;
      wheels.push(w);
    }
  }
  car.userData = { body, wheels };
  return car;
}

function makeBus(parent, color, stripe) {
  const g = vehicleGeos().bus;
  const v = group(parent);
  mesh(g.paint, paint(color), v);
  mesh(g.stripe, paint(stripe), v, false);
  mesh(g.glass, mats.carGlass, v);
  mesh(g.dark, mats.dark, v);
  mesh(g.lamp, mats.lamp, v, false);
  mesh(g.tail, mats.tail, v, false);
  const board = mesh(GEO.box, busBoard(), v, false);
  board.position.set(0, 3.02, 4.93);
  board.scale.set(1.7, 0.36, 0.06);
  headGlow(v, 0.95, 0.95, 5.0, 1.7);
  for (const x of [-1.22, 1.22]) {
    for (const z of [-3.1, 3.2]) addWheel(v, x, z, 0.5, 0.3);
  }
  return v;
}

function makeAuto(parent) {
  const g = vehicleGeos().auto;
  const v = group(parent);
  mesh(g.black, mats.dark, v);
  mesh(g.yellow, paint(0xe0b21f), v);
  mesh(g.glass, mats.carGlass, v);
  mesh(g.lamp, mats.lamp, v, false);
  mesh(g.tail, mats.tail, v, false);
  headGlow(v, 0, 1.0, 1.78, 1.2);
  addWheel(v, 0, 1.32, 0.26, 0.14);
  for (const x of [-0.72, 0.72]) addWheel(v, x, -0.85, 0.26, 0.16);
  return v;
}

const VEHICLES = {
  car: { len: 4.2, wid: 1.9, max: 12, circles: [-1, 1], r: 1.0, horn: 440 },
  auto: { len: 3.3, wid: 1.5, max: 8.5, circles: [-0.7, 0.7], r: 0.85, horn: 620 },
  bus: { len: 9.8, wid: 2.6, max: 9.5, circles: [-3.5, -1.2, 1.2, 3.5], r: 1.45, horn: 300 }
};
const CAR_PAINTS = [0xe9e8dd, 0x9aa3a6, 0x2f5a7a, 0xd7a83d, 0x3b4042, 0x8c5a3a, 0x7a1f24];
const BUS_PAINTS = [[0xc33b32, 0xf0c23a], [0xe4dcc4, 0x2f5a7a], [0x2f7a5a, 0xf0e6c8]];

function spawnPlayer() {
  player = makeWagon(world, 0x9e3030, true);
  const pose = loopPose(loops[0], loops[0].len * place.spawn);
  player.position.set(pose.x, 0, pose.z);
  heading = pose.h;
  player.rotation.y = heading;
  speed = 0;
  steer = 0;
  headSpot.position.set(0, 0.95, 2.0);
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
      const v = type === 'bus' ? makeBus(world, ...BUS_PAINTS[k % BUS_PAINTS.length])
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
const DRY_ROAD = new THREE.Color(0xffffff);
const WET_ROAD = new THREE.Color(0x8e9394);

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

function refreshEnv(force) {
  const now = performance.now();
  if (!force) {
    if (now - envAt < 1500) return;
    if (Math.abs(clockTime - envClock) < 0.2 && Math.abs(wxCloud - envCloud) < 0.12) return;
  }
  envAt = now;
  envClock = clockTime;
  envCloud = wxCloud;
  envGround.material.color.setHex(0x4c6a45).multiplyScalar(lerp(1, 0.08, nightF));
  const rt = pmrem.fromScene(envScene, 0, 1, 3000);
  scene.environment = rt.texture;
  if (envRT) envRT.dispose();
  envRT = rt;
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
  // The sky reflection map now supplies part of the daytime ambient light.
  hemi.intensity = hemiI * lerp(0.5, 1, nightF);
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
  sunGlow.position.copy(camera.position).addScaledVector(sunDir, 1250);
  sunGlow.material.color.copy(cSun);
  sunGlow.material.opacity = sunDisc.material.opacity * 0.55;
  sunGlow.visible = sunDisc.visible;

  clouds.position.set(camera.position.x, 0, camera.position.z);
  TEX.cloud.offset.set(camera.position.x / 800 + cloudDrift, camera.position.z / 800 + cloudDrift * 0.4);
  clouds.material.color.copy(cHor).lerp(cA.setHex(0xffffff), 0.65 * (1 - nightF * 0.92));
  clouds.material.opacity = lerp(0.7, 0.95, wxCloud);

  if (force || frame % 8 === 0) {
    const pos = skyGeo.attributes.position;
    const col = skyGeo.attributes.color;
    for (let v = 0; v < pos.count; v++) {
      cA.copy(cHor).lerp(cZen, smoothstep(pos.getY(v) / 1500, 0.02, 0.6));
      col.setXYZ(v, cA.r, cA.g, cA.b);
    }
    col.needsUpdate = true;
    refreshEnv(force);
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
  mats.lampGlow.opacity = nightF * 0.9;
  mats.lampGlow.visible = nightF > 0.02;
  mats.headGlow.opacity = lights * 0.9;
  mats.headGlow.visible = lights > 0.02;
  for (const m of towerMats) m.emissiveIntensity = nightF * 0.9;
  if (signMats) for (const m of signMats) m.emissiveIntensity = nightF * 0.55;
  for (const m of Object.values(boardMats)) m.emissiveIntensity = 0.15 + nightF * 0.7;

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

    if (yieldTo(player.position.x, player.position.z, 4.2, 1.9)) byPlayer = true;
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
    camera.position.set(p.x + fx * 1.25, 1.58, p.z + fz * 1.25);
    camLook.set(p.x + fx * 30, 1.1, p.z + fz * 30);
  } else {
    const back = cameraMode === 2 ? 13 : 8.2;
    const up = cameraMode === 2 ? 6.5 : 3.9;
    camTarget.set(p.x - fx * back, up, p.z - fz * back);
    camera.position.lerp(camTarget, blend);
    camLook.set(p.x + fx * 5, 1.2, p.z + fz * 5);
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
    w.spin.rotation.x += speed * dt / 0.36;
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
  TEX.waterN.offset.x += dt * 0.012;
  TEX.waterN.offset.y += dt * 0.02;
  TEX.lagoonN.offset.x += dt * 0.006;
  TEX.foam.offset.y += dt * 0.01;
  cloudDrift += dt * 0.004;

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
