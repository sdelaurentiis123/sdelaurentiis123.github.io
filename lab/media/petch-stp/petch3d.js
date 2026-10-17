// petch3d.js: a small three.js viewer for petch level-set meshes (from scripts/export_mesh3d.py).
// Usage: mountViewer(el, cfg) with cfg = {
//   meshes: {name: {url | b64, n_vert, n_tri, index: "u2"|"u4", lo: [x,y,z], hi: [x,y,z]}},
//   frames: [{mesh: name, label: "t = 0 s"}, ...],        // one frame = a still; several = a time series
//   bands: [[z_lo, z_hi, "#rrggbb", "name"], ...],        // colour by height (um, after the export z_ref)
//   tile: {nx: 3, ny: 3, cell: [lx, ly]},                 // optional mirror tiling of a periodic cell
//   bandTol: 0.004,                                       // um; absorbs the half-cell offset of coarse meshes
//   section: 0.55,                                        // darken faces on the cell walls (cut planes of a tiled array)
//   zScale: 1, fps: 4, autoRotate: true, cut: false, legend: true, background: "#0b1220" }
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

function b64ToBuffer(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function loadGeometry(m, bands, zScale, tol, section) {
  const buf = m.b64 ? b64ToBuffer(m.b64) : await (await fetch(m.url)).arrayBuffer();
  const q = new Uint16Array(buf, 0, m.n_vert * 3);
  const pos = new Float32Array(m.n_vert * 3);
  const col = new Float32Array(m.n_vert * 3);
  const bc = bands.map(b => new THREE.Color(b[2]));
  const fallback = new THREE.Color("#b8bec6");
  for (let i = 0; i < m.n_vert; i++) {
    for (let k = 0; k < 3; k++) pos[3 * i + k] = m.lo[k] + (q[3 * i + k] / 65535) * (m.hi[k] - m.lo[k]);
    const z = pos[3 * i + 2];
    let c = fallback;
    for (let j = 0; j < bands.length; j++) if (z >= bands[j][0] - tol && z < bands[j][1] + tol) { c = bc[j]; break; }
    // section shading: faces on the cell walls are cut planes of the array, drawn darker than free surfaces
    const onWall = section && (q[3 * i] === 0 || q[3 * i] === 65535 || q[3 * i + 1] === 0 || q[3 * i + 1] === 65535);
    const f = onWall ? section : 1.0;
    col[3 * i] = c.r * f; col[3 * i + 1] = c.g * f; col[3 * i + 2] = c.b * f;
    pos[3 * i + 2] *= zScale;
  }
  const off = m.n_vert * 6;
  const idxBuf = buf.slice(off, off + m.n_tri * 3 * (m.index === "u2" ? 2 : 4));
  const idx = m.index === "u2" ? new Uint16Array(idxBuf) : new Uint32Array(idxBuf);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

export async function mountViewer(el, cfg) {
  const zScale = cfg.zScale || 1;
  const bands = cfg.bands || [];
  el.classList.add("p3d");
  const stage = document.createElement("div"); stage.className = "p3d-stage"; el.appendChild(stage);
  const hud = document.createElement("div"); hud.className = "p3d-hud"; stage.appendChild(hud);
  const bar = document.createElement("div"); bar.className = "p3d-bar"; el.appendChild(bar);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(cfg.background || "#0b1220");
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-1.2, -2.0, 3.0); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd8ff, 0.6); rim.position.set(2.0, 1.5, 1.0); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));

  const names = [...new Set(cfg.frames.map(f => f.mesh))];
  const geoms = {};
  hud.textContent = "loading 3-D surface…";
  await Promise.all(names.map(async n => { geoms[n] = await loadGeometry(cfg.meshes[n], bands, zScale, cfg.bandTol || 1e-6, cfg.section || 0); }));

  const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const front = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.08,
                                                 side: THREE.FrontSide, clippingPlanes: [] });
  const back = new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.9, metalness: 0.0,
                                                side: THREE.BackSide, clippingPlanes: [],
                                                // tiles share wall planes: let the neighbour's coloured face win
                                                polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 });
  const group = new THREE.Group(); scene.add(group);
  const tile = cfg.tile || { nx: 1, ny: 1, cell: [0, 0] };
  const first = geoms[cfg.frames[0].mesh].boundingBox;
  const cell = tile.cell && tile.cell[0] ? tile.cell : [first.max.x - first.min.x, first.max.y - first.min.y];
  const x0 = first.min.x, y0 = first.min.y;
  const pairs = [];
  for (let i = 0; i < (tile.nx || 1); i++) for (let j = 0; j < (tile.ny || 1); j++) {
    const sx = i % 2 ? -1 : 1, sy = j % 2 ? -1 : 1;
    const holder = new THREE.Group();
    holder.scale.set(sx, sy, 1);
    holder.position.set(i * cell[0] + (sx < 0 ? 2 * x0 + cell[0] : 0), j * cell[1] + (sy < 0 ? 2 * y0 + cell[1] : 0), 0);
    const mf = new THREE.Mesh(geoms[cfg.frames[0].mesh], front);
    const mb = new THREE.Mesh(geoms[cfg.frames[0].mesh], back);
    holder.add(mf); holder.add(mb); group.add(holder); pairs.push([mf, mb]);
  }
  const box = new THREE.Box3().setFromObject(group);
  const ctr = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  group.position.sub(new THREE.Vector3(ctr.x, ctr.y, box.min.z + size.z * 0.35));
  clip.constant = 0;

  const camera = new THREE.PerspectiveCamera(32, 1, size.length() / 200, size.length() * 20);
  camera.up.set(0, 0, 1);
  const dist = Math.max(size.x, size.y, size.z) * (cfg.distance || 2.3);
  const view = cfg.view || [-0.85, -1.15, 0.75];
  camera.position.set(view[0] * dist, view[1] * dist, view[2] * dist);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = cfg.autoRotate !== false;
  controls.autoRotateSpeed = 0.6;
  controls.target.set(0, 0, 0);
  controls.enableZoom = false;              // the wheel scrolls the page until the viewer is clicked
  renderer.domElement.addEventListener("pointerdown", () => { controls.autoRotate = false; controls.enableZoom = true; });
  renderer.domElement.addEventListener("pointerleave", () => { controls.enableZoom = false; });

  let k = 0, playing = cfg.frames.length > 1, last = 0;
  const setFrame = i => {
    k = i;
    pairs.forEach(([mf, mb]) => { mf.geometry = geoms[cfg.frames[i].mesh]; mb.geometry = mf.geometry; });
    hud.textContent = cfg.frames[i].label || "";
    if (slider) slider.value = String(i);
  };
  let slider = null;
  const btn = (txt, title, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = txt; b.title = title; b.onclick = fn; bar.appendChild(b); return b; };
  if (cfg.frames.length > 1) {
    const pb = btn("❚❚", "play / pause", () => { playing = !playing; pb.textContent = playing ? "❚❚" : "▶"; });
    slider = document.createElement("input"); slider.type = "range"; slider.min = "0"; slider.max = String(cfg.frames.length - 1); slider.value = "0";
    slider.oninput = () => { playing = false; pb.textContent = "▶"; setFrame(+slider.value); };
    bar.appendChild(slider);
  }
  const cutBtn = btn("cut", "cut away the front half", () => {
    const on = front.clippingPlanes.length === 0;
    front.clippingPlanes = on ? [clip] : []; back.clippingPlanes = front.clippingPlanes;
    front.needsUpdate = back.needsUpdate = true; cutBtn.classList.toggle("on", on);
  });
  btn("⟲", "reset view", () => { camera.position.set(view[0] * dist, view[1] * dist, view[2] * dist); controls.target.set(0, 0, 0); controls.autoRotate = cfg.autoRotate !== false; });
  if (cfg.cut) cutBtn.click();
  if (cfg.legend !== false && bands.length) {
    const lg = document.createElement("div"); lg.className = "p3d-legend";
    lg.innerHTML = bands.map(b => `<span><i style="background:${b[2]}"></i>${b[3]}</span>`).join("");
    bar.appendChild(lg);
  }
  setFrame(0);

  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage); resize();
  let visible = true;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(stage);
  const fps = cfg.fps || 4;
  renderer.setAnimationLoop(t => {
    if (!visible) return;
    if (playing && t - last > 1000 / fps) {
      last = t;
      const hold = cfg.holdLast || 0;
      const n = cfg.frames.length;
      const step = (k + 1) % (n + hold);
      setFrame(Math.min(step, n - 1));
      if (step >= n) k = step;          // dwell on the last frame for `holdLast` ticks
    }
    controls.update(); renderer.render(scene, camera);
  });
  return { renderer, scene, camera, controls, setFrame };
}
