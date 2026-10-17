// plasma_viz.js: the chamber and RF-sheath animations on the petch 2 page.
// Data: plasma.json from scripts/make_petch2_sheath_data.py (reactorlab rows for the TCP 9400 bias scan +
// petch's collisionless RF-sheath model: ion trajectories, impact energies, IEDF).
// mountPlasma(rootEl, dataUrl) builds: a bias selector, the chamber cross-section, and the sheath view.

const C = { bg: "#0b1220", panel: "#121c30", ink: "#e8edf6", dim: "#8fa3bf", line: "#26344f",
            ion: "#2ab3b6", elec: "#e0b458", mask: "#2ab3b6", si: "#7f8aa3", glowA: [120, 92, 230], glowB: [42, 179, 182] };
const fmt = (x, d = 1) => Number(x).toFixed(d);
const sci = x => { const e = Math.floor(Math.log10(x)); return `${fmt(x / 10 ** e, 1)}×10<sup>${e}</sup>`; };

function besselJ0(x) {            // Abramowitz-Stegun 9.4.1 polynomial, |x| <= 3
  const t = (x / 3) ** 2;
  return 1 - 2.2499997 * t + 1.2656208 * t ** 2 - 0.3163866 * t ** 3 + 0.0444479 * t ** 4 - 0.0039444 * t ** 5 + 0.00021 * t ** 6;
}

function hiDPI(canvas, w, h) {
  const r = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * r); canvas.height = Math.round(h * r);
  const ctx = canvas.getContext("2d"); ctx.setTransform(r, 0, 0, r, 0, 0);
  return ctx;
}

// ---------------------------------------------------------------- chamber cross-section
class Chamber {
  constructor(el, data) {
    this.el = el; this.data = data;
    this.cv = document.createElement("canvas"); el.appendChild(this.cv);
    this.parts = [];
    this.resize(); new ResizeObserver(() => this.resize()).observe(el);
  }
  resize() {
    this.W = this.el.clientWidth; this.H = Math.round(this.W * 0.42);
    this.cv.style.width = this.W + "px"; this.cv.style.height = this.H + "px";
    this.ctx = hiDPI(this.cv, this.W, this.H);
    // chamber box: R = 0.25 m, height 0.10 m (reactorlab geometry); coil above, chuck below
    const pad = 0.06 * this.W, cw = this.W - 2 * pad;
    const ch = cw * (0.10 / 0.50);
    this.box = { x: pad, y: this.H * 0.36, w: cw, h: Math.min(ch, this.H * 0.44) };
    this.glow = this.makeGlow();
  }
  makeGlow() {                     // lowest diffusion mode n ~ J0(2.405 r/R) sin(pi z/H), drawn once
    const { w, h } = this.box, off = document.createElement("canvas");
    off.width = Math.max(2, Math.round(w / 2)); off.height = Math.max(2, Math.round(h / 2));
    const g = off.getContext("2d"), img = g.createImageData(off.width, off.height);
    for (let j = 0; j < off.height; j++) for (let i = 0; i < off.width; i++) {
      const r = Math.abs((i + 0.5) / off.width - 0.5) * 2, z = 1 - (j + 0.5) / off.height;
      const n = Math.max(0, besselJ0(2.405 * r)) * Math.sin(Math.PI * Math.min(Math.max(z, 0), 1));
      const k = 4 * (j * off.width + i), a = Math.pow(n, 0.8);
      img.data[k] = C.glowA[0] * (1 - a) + C.glowB[0] * a; img.data[k + 1] = C.glowA[1] * (1 - a) + C.glowB[1] * a;
      img.data[k + 2] = C.glowA[2] * (1 - a) + C.glowB[2] * a; img.data[k + 3] = 255 * Math.min(1, 1.15 * a);
    }
    g.putImageData(img, 0, 0); return off;
  }
  spawn() {
    const b = this.box;
    this.parts.push({ x: b.x + b.w / 2 + (Math.random() - 0.5) * 6, y: b.y + 3, vx: (Math.random() - 0.5) * 0.6,
                      vy: 0.3 + Math.random() * 0.3, kind: "gas", age: 0 });
  }
  step(t, row) {
    const ctx = this.ctx, b = this.box, W = this.W, H = this.H;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    // coil turns above the window, current pulsing at (slowed) 13.56 MHz
    const pulse = 0.55 + 0.45 * Math.sin(t * 6.0);
    for (let k = 0; k < 5; k++) for (const side of [-1, 1]) {
      const cx = b.x + b.w / 2 + side * b.w * (0.07 + 0.075 * k), cy = b.y - b.h * 0.42;
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(3, b.h * 0.085), 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(224,180,88,${0.25 + 0.55 * pulse})`; ctx.fill();
      ctx.strokeStyle = "#e0b458"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = C.bg; ctx.font = `${Math.max(8, b.h * 0.1)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(side < 0 ? "•" : "×", cx, cy + 0.5);
    }
    // dielectric window
    ctx.fillStyle = "rgba(143,163,191,0.18)"; ctx.fillRect(b.x, b.y - b.h * 0.16, b.w, b.h * 0.16);
    // plasma glow (breathes gently with the coil current)
    ctx.globalAlpha = 0.78 + 0.12 * pulse; ctx.drawImage(this.glow, b.x, b.y, b.w, b.h); ctx.globalAlpha = 1;
    // walls, pump port (lower right), chuck and wafer
    ctx.strokeStyle = C.dim; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.x, b.y - b.h * 0.16); ctx.lineTo(b.x, b.y + b.h); ctx.lineTo(b.x + b.w * 0.86, b.y + b.h);
    ctx.moveTo(b.x + b.w * 0.95, b.y + b.h); ctx.lineTo(b.x + b.w, b.y + b.h); ctx.lineTo(b.x + b.w, b.y - b.h * 0.16); ctx.stroke();
    const wx = b.x + b.w / 2, ww = b.w * 0.4, wy = b.y + b.h * 0.86;     // 200 mm wafer on a 0.5 m chamber
    ctx.fillStyle = "#2c3850"; ctx.fillRect(wx - ww * 0.58, wy + 3, ww * 1.16, b.h * 0.14 + 4);
    ctx.fillStyle = "#c9d1dc"; ctx.fillRect(wx - ww / 2, wy, ww, 3);
    // sheath over the wafer: thin bright band, thicker at higher bias
    const sh = Math.max(1.5, b.h * 0.025 * Math.sqrt(Math.abs(row.bias_V) / 20));
    ctx.fillStyle = `rgba(42,179,182,${0.35 + 0.35 * pulse})`; ctx.fillRect(wx - ww / 2, wy - sh, ww, sh);
    // particles: feed gas from the nozzle, dissociated in the bright core, ions pulled into the wafer
    if (Math.random() < 0.9) this.spawn();
    for (const p of this.parts) {
      p.age++; p.x += p.vx; p.y += p.vy; p.vx += (Math.random() - 0.5) * 0.25; p.vy += (Math.random() - 0.5) * 0.18;
      const r = Math.abs(p.x - (b.x + b.w / 2)) / (b.w / 2), z = 1 - (p.y - b.y) / b.h;
      const n = Math.max(0, besselJ0(2.405 * Math.min(r, 1))) * Math.sin(Math.PI * Math.min(Math.max(z, 0), 1));
      if (p.kind === "gas" && Math.random() < 0.012 * n) p.kind = Math.random() < 0.7 ? "F" : "O";
      if (p.kind !== "ion" && p.kind !== "gas" && Math.abs(p.x - wx) < ww / 2 && p.y > wy - sh * 4 && Math.random() < 0.02) p.kind = "ion";
      if (p.kind === "ion") { p.vx *= 0.6; p.vy = 2.6; }
      if (p.x < b.x + 2) { p.x = b.x + 2; p.vx = Math.abs(p.vx); }
      if (p.x > b.x + b.w - 2) { p.x = b.x + b.w - 2; p.vx = -Math.abs(p.vx); }
      if (p.y < b.y + 2) { p.y = b.y + 2; p.vy = Math.abs(p.vy); }
      if (p.y > b.y + b.h - 2 && !(p.x > b.x + b.w * 0.86 && p.x < b.x + b.w * 0.95)) { p.y = b.y + b.h - 2; p.vy = -Math.abs(p.vy); }
      if (Math.abs(p.x - wx) < ww / 2 && p.y > wy - 1) p.dead = true;              // reached the wafer
      if (p.y > b.y + b.h + 4 || p.age > 1400) p.dead = true;                     // pumped away
      ctx.fillStyle = p.kind === "gas" ? "rgba(200,210,225,0.55)" : p.kind === "F" ? "#7ee0a1" : p.kind === "O" ? "#f08a8a" : C.ion;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === "ion" ? 1.9 : 1.5, 0, 2 * Math.PI); ctx.fill();
    }
    this.parts = this.parts.filter(p => !p.dead).slice(-420);
    // labels
    ctx.fillStyle = C.dim; ctx.font = "12px -apple-system, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText("planar rf coil, 800 W", b.x, b.y - b.h * 0.72);
    ctx.fillText("SF₆ / O₂ in, 40 / 40 sccm, 25 mTorr", wx + 10, b.y - b.h * 0.22);
    ctx.textAlign = "right"; ctx.fillText("to pump", b.x + b.w, b.y + b.h + 16);
    ctx.textAlign = "center"; ctx.fillText(`200 mm wafer, rf bias ${row.bias_V} V`, wx, wy + b.h * 0.14 + 20);
    // zoom box to the sheath view
    ctx.strokeStyle = C.ink; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.strokeRect(wx - 9, wy - sh - 10, 18, sh + 14); ctx.setLineDash([]);
    ctx.textAlign = "left"; ctx.fillStyle = C.ink; ctx.fillText("sheath (below)", wx + 14, wy - sh - 2);
  }
}

// ---------------------------------------------------------------- rf sheath above the features
class Sheath {
  constructor(el, data) {
    this.el = el; this.data = data; this.freq = "rf13";
    this.cv = document.createElement("canvas"); el.appendChild(this.cv);
    this.ions = []; this.elecs = []; this.hits = [];
    this.resize(); new ResizeObserver(() => this.resize()).observe(el);
  }
  resize() {
    this.W = this.el.clientWidth; this.H = Math.round(Math.max(this.W * 0.5, 320));
    this.cv.style.width = this.W + "px"; this.cv.style.height = this.H + "px";
    this.ctx = hiDPI(this.cv, this.W, this.H);
    const wide = this.W > 640;
    this.view = { x: 12, y: 14, w: wide ? this.W * 0.64 : this.W - 24, h: wide ? this.H - 28 : this.H * 0.62 };
    this.side = wide ? { x: this.view.x + this.view.w + 18, y: 14, w: this.W - this.view.w - 42, h: this.H - 28 }
                     : { x: 12, y: this.view.y + this.view.h + 12, w: this.W - 24, h: this.H - this.view.h - 38 };
  }
  setRow(row) { this.row = row; this.hist = new Array(40).fill(0); this.ions = []; this.hits = []; }
  geometry() {
    const v = this.view;
    const yTop = v.y + v.h * 0.06, yEdge = v.y + v.h * 0.28, yW = v.y + v.h * 0.78;   // plasma | sheath | wafer
    const holes = [0.16, 0.39, 0.62, 0.85].map(f => v.x + f * v.w), hw = v.w * 0.055, hd = v.h * 0.16;
    return { yTop, yEdge, yW, holes, hw, hd };
  }
  step(t) {
    const ctx = this.ctx, v = this.view, row = this.row, S = row[this.freq], g = this.geometry();
    const period = 0.9;                                            // seconds of animation per rf cycle
    const ph = (t / period) % 1, Vmax = S.V_mean + S.V_rf, Vt = S.V_mean + S.V_rf * Math.sin(2 * Math.PI * ph);
    const sE = Math.pow(Math.max(Vt, 1) / Vmax, 0.75);           // electron sheath edge, fraction of s from the wafer
    const yE = g.yW - sE * (g.yW - g.yEdge);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, this.W, this.H);
    // bulk plasma glow, then the sheath with its potential drop shading (Child profile, V(t))
    let gr = ctx.createLinearGradient(0, v.y, 0, g.yEdge);
    gr.addColorStop(0, "rgba(120,92,230,0.30)"); gr.addColorStop(1, "rgba(42,179,182,0.22)");
    ctx.fillStyle = gr; ctx.fillRect(v.x, v.y, v.w, g.yEdge - v.y);
    gr = ctx.createLinearGradient(0, g.yEdge, 0, g.yW);
    const a = 0.12 + 0.5 * Vt / Vmax;
    gr.addColorStop(0, "rgba(42,179,182,0.05)"); gr.addColorStop(1, `rgba(224,180,88,${a})`);
    ctx.fillStyle = gr; ctx.fillRect(v.x, g.yEdge, v.w, g.yW - g.yEdge);
    // electron-free region below the moving electron edge
    ctx.fillStyle = "rgba(11,18,32,0.35)"; ctx.fillRect(v.x, yE, v.w, g.yW - yE);
    ctx.strokeStyle = C.elec; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(v.x, yE); ctx.lineTo(v.x + v.w, yE); ctx.stroke(); ctx.setLineDash([]);
    // wafer: mask with four openings over Si
    ctx.fillStyle = C.si; ctx.fillRect(v.x, g.yW + g.hd * 0.55, v.w, v.y + v.h - g.yW - g.hd * 0.55);
    ctx.fillStyle = C.mask; ctx.fillRect(v.x, g.yW, v.w, g.hd * 0.55);
    for (const x of g.holes) { ctx.fillStyle = C.bg; ctx.fillRect(x - g.hw / 2, g.yW, g.hw, g.hd); }
    // ions: enter at the plasma edge at the current phase, follow petch's trajectory for that phase
    if (Math.random() < 0.55) {
      const k = Math.floor(ph * S.traj.length) % S.traj.length;
      this.ions.push({ x: v.x + Math.random() * v.w, k, t0: t, dx: (Math.random() - 0.5) * 0.02 * row.iadf_deg });
    }
    for (const ion of this.ions) {
      const tr = S.traj[ion.k], i = (t - ion.t0) / period * 48;
      const i0 = Math.floor(i), f = i - i0;
      const frac = i0 + 1 < tr.length ? tr[i0] * (1 - f) + tr[i0 + 1] * f : 1;
      ion.y = g.yEdge + frac * (g.yW - g.yEdge); ion.x += ion.dx;
      if (frac >= 1 && !ion.landed) {
        ion.landed = true;
        const inHole = g.holes.some(x => Math.abs(ion.x - x) < g.hw / 2);
        ion.floor = inHole; ion.tL = t;
        const E = S.E_traj[ion.k], b = Math.floor((E - S.E_min * 0.98) / ((S.E_max * 1.02 - S.E_min * 0.98) / 40));
        this.hist[Math.min(39, Math.max(0, b))] += 1;
      }
      if (ion.landed) { ion.y = ion.floor ? Math.min(g.yW + g.hd, ion.y + (t - ion.tL) * 120) : g.yW; }
      const alpha = ion.landed ? Math.max(0, 1 - (t - ion.tL) * 2.5) : 1;
      ctx.fillStyle = `rgba(42,179,182,${alpha})`; ctx.beginPath(); ctx.arc(ion.x, ion.y, 2.1, 0, 2 * Math.PI); ctx.fill();
    }
    this.ions = this.ions.filter(i => !i.landed || t - i.tL < 0.4).slice(-500);
    // electrons: thermal, reflected by the electron edge except when the sheath collapses
    while (this.elecs.length < 70) this.elecs.push({ x: v.x + Math.random() * v.w, y: v.y + Math.random() * (g.yEdge - v.y),
                                                     a: Math.random() * 2 * Math.PI, s: 2.2 + Math.random() * 2.2 });
    for (const e of this.elecs) {
      e.x += Math.cos(e.a) * e.s; e.y += Math.sin(e.a) * e.s;
      if (e.x < v.x || e.x > v.x + v.w) { e.a = Math.PI - e.a; e.x = Math.min(Math.max(e.x, v.x), v.x + v.w); }
      if (e.y < v.y) { e.a = -e.a; e.y = v.y; }
      if (e.y > yE) {
        if (sE > 0.12) { e.a = -e.a; e.y = yE - 1; }               // repelled by the sheath field
        else if (e.y >= g.yW) {                                     // collapse: electrons reach the surface
          const inHole = g.holes.some(x => Math.abs(e.x - x) < g.hw / 2);
          if (!inHole) this.hits.push({ x: e.x, y: g.yW, t });
          e.y = v.y + 2; e.x = v.x + Math.random() * v.w;
        }
      }
      ctx.fillStyle = C.elec; ctx.beginPath(); ctx.arc(e.x, e.y, 1.6, 0, 2 * Math.PI); ctx.fill();
    }
    for (const h of this.hits) { const al = Math.max(0, 1 - (t - h.t) * 2); ctx.fillStyle = `rgba(224,180,88,${al})`;
                                 ctx.fillRect(h.x - 3, h.y - 1, 6, 2); }
    this.hits = this.hits.filter(h => t - h.t < 0.5);
    // labels
    ctx.font = "12px -apple-system, sans-serif"; ctx.textAlign = "left"; ctx.fillStyle = C.ink;
    ctx.fillText("bulk plasma", v.x + 6, v.y + 16);
    ctx.fillStyle = C.elec; ctx.fillText("electron edge (moves with the rf)", v.x + 6, yE - 5);
    ctx.fillStyle = C.ink; ctx.textAlign = "right";
    ctx.fillText(`sheath ≈ ${fmt(S.thickness_um / 1000, 1)} mm; features drawn ~1000× larger`, v.x + v.w - 6, g.yW - 8);
    ctx.textAlign = "left";
    ctx.fillStyle = C.bg; ctx.fillText(`wafer, ${row.bias_V} V rf bias`, v.x + 6, g.yW + g.hd + 16);
    // side panel: sheath voltage over the cycle, then the ion energy distribution
    const sp = this.side, h1 = sp.h * 0.36, h2 = sp.h - h1 - 34;
    ctx.strokeStyle = C.line; ctx.strokeRect(sp.x, sp.y, sp.w, h1);
    ctx.fillStyle = C.dim; ctx.fillText("sheath voltage over two rf cycles", sp.x, sp.y - 2 + 14 - 14);
    ctx.beginPath(); ctx.strokeStyle = C.elec;
    for (let i = 0; i <= 120; i++) { const q = i / 120 * 2, V = S.V_mean + S.V_rf * Math.sin(2 * Math.PI * q);
      const x = sp.x + i / 120 * sp.w, y = sp.y + h1 - 6 - (V / Vmax) * (h1 - 14);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    const xq = sp.x + ph / 2 * sp.w, yq = sp.y + h1 - 6 - (Vt / Vmax) * (h1 - 14);
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(xq, yq, 3.5, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = C.dim; ctx.fillText(`${fmt(Vt, 0)} V`, sp.x + 4, sp.y + 14);
    const y2 = sp.y + h1 + 30;
    ctx.fillText("ion energy at the wafer (petch sheath model)", sp.x, y2 - 8);
    ctx.strokeStyle = C.line; ctx.strokeRect(sp.x, y2, sp.w, h2);
    const mx = Math.max(1, ...this.hist), bw = sp.w / 40;
    ctx.fillStyle = C.ion;
    this.hist.forEach((c, i) => { const hh = c / mx * (h2 - 20); ctx.fillRect(sp.x + i * bw + 0.5, y2 + h2 - 14 - hh, bw - 1, hh); });
    const ed = S.iedf.edges, cn = S.iedf.counts, cm = Math.max(...cn);
    ctx.beginPath(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2;
    cn.forEach((c, i) => { const e = 0.5 * (ed[i] + ed[i + 1]);
      const x = sp.x + (e - S.E_min * 0.98) / (S.E_max * 1.02 - S.E_min * 0.98) * sp.w, y = y2 + h2 - 14 - c / cm * (h2 - 20);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = C.dim; ctx.textAlign = "left"; ctx.fillText(`${fmt(S.E_min, 0)} eV`, sp.x + 2, y2 + h2 - 2);
    ctx.textAlign = "right"; ctx.fillText(`${fmt(S.E_max, 0)} eV`, sp.x + sp.w - 2, y2 + h2 - 2);
    ctx.textAlign = "left";
  }
}

export async function mountPlasma(root, url) {
  const data = await (await fetch(url)).json();
  const bar = root.querySelector(".pv-bar"), readout = root.querySelector(".pv-read");
  const ch = new Chamber(root.querySelector(".pv-chamber"), data);
  const sh = new Sheath(root.querySelector(".pv-sheath"), data);
  let row = data.rows[data.rows.length - 1];
  const show = () => {
    sh.setRow(row);
    readout.innerHTML = [
      ["electron density", `${sci(row.ne_m3)} m<sup>−3</sup>`], ["electron temperature", `${fmt(row.Te_eV)} eV`],
      ["F flux to the wafer", `${sci(row.Gamma_F)} m<sup>−2</sup>s<sup>−1</sup>`], ["O flux", `${sci(row.Gamma_O)} m<sup>−2</sup>s<sup>−1</sup>`],
      ["ion flux", `${sci(row.Gamma_i)} m<sup>−2</sup>s<sup>−1</sup>`], ["mean ion energy", `${fmt(row.E_ion, 0)} eV`],
      ["ion angle spread", `${fmt(row.iadf_deg)}°`]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
    bar.querySelectorAll("button[data-bias]").forEach(b => b.classList.toggle("on", +b.dataset.bias === row.bias_V));
  };
  bar.innerHTML = '<span class="pv-lab">rf bias</span>' + data.rows.map(r => `<button data-bias="${r.bias_V}">${r.bias_V} V</button>`).join("")
    + '<span class="pv-lab" style="margin-left:1rem">bias frequency</span><button data-f="rf13" class="on">13.56 MHz (tool)</button><button data-f="rf2">2 MHz</button>'
    + '<button data-p="1" style="margin-left:auto">pause</button>';
  bar.querySelectorAll("button[data-bias]").forEach(b => b.onclick = () => { row = data.rows.find(r => r.bias_V === +b.dataset.bias); show(); });
  bar.querySelectorAll("button[data-f]").forEach(b => b.onclick = () => { sh.freq = b.dataset.f; sh.setRow(row);
    bar.querySelectorAll("button[data-f]").forEach(x => x.classList.toggle("on", x === b)); });
  let paused = false;
  bar.querySelector("button[data-p]").onclick = e => { paused = !paused; e.target.textContent = paused ? "play" : "pause"; };
  show();
  let visible = true;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(root);
  let t = 0, last = performance.now();
  const loop = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (visible && !paused) { t += dt; ch.step(t, row); sh.step(t); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
