'use strict';
const $ = id => document.getElementById(id);
const runs = ['b10','b100'];
const colors = {b10:'#17638c', b100:'#b75c20'};
const nearest = (rows,t) => rows.reduce((a,b)=>Math.abs(b.time-t)<Math.abs(a.time-t)?b:a);
const fmt = n => n == null ? 'unavailable' : Number(n).toLocaleString('en-US',{maximumFractionDigits:3});
let frames, histories, playing=false, current=4060, generation=0, timer=null;
const decoded=new Map();
function loadImage(url){if(decoded.has(url))return decoded.get(url);const im=new Image();im.src=url;const promise=im.decode().then(()=>im).catch(e=>{decoded.delete(url);throw e;});decoded.set(url,promise);if(decoded.size>32)decoded.delete(decoded.keys().next().value);return promise;}
const panels=[];
function source(run,field,frame){return `assets/${run}/cinema_highdpi/${field}/${field==='density'?'xy':'xz'}/frame_${String(frame.index).padStart(5,'0')}.png`;}
function panel(run,field,parent){const f=document.createElement('figure');f.innerHTML=`<img alt=""><figcaption><span></span><a target="_blank" rel="noopener">Open original ↗</a></figcaption>`;$(parent).append(f);panels.push({run,field,f});}
function makeCharts(){for(const [key,title,max] of [['mdot','Accretion rate Ṁ · code units',700],['phi_raw','Raw horizon flux ΦHL · code units',18],['phi_G','Normalized horizon flux φG',18]]){
const el=document.createElement('article');el.className='chart';el.dataset.key=key;el.innerHTML=`<h3>${title}</h3><svg viewBox="0 0 440 235" role="img" aria-label="${title}: beta10 and beta100 over simulation time"></svg><div class="values"></div>`;$('charts').append(el);const svg=el.querySelector('svg');let s='';
const x=t=>52+t/6640*368,y=v=>185-v/max*155;
for(let n=0;n<=4;n++){const v=max*n/4;s+=`<path d="M52 ${y(v)}H420" stroke="#e1e6e9"/><text x="44" y="${y(v)+5}" text-anchor="end" font-size="14" fill="#536470">${fmt(v)}</text>`;}
for(const t of [0,2000,4000,6640])s+=`<text x="${x(t)}" y="207" text-anchor="middle" font-size="14" fill="#536470">${t}</text>`;
for(const t of [1505.025253,4070.710678,6636.396103])s+=`<path d="M${x(t)} 30V185" stroke="#b7c2c8" stroke-dasharray="3 4"/>`;
if(key==='phi_G')s+=`<path d="M52 ${y(15)}H420" stroke="#737373" stroke-dasharray="6 4"/><text x="58" y="${y(15)-7}" font-size="13" fill="#666">15 · reference</text>`;
for(const r of runs){const rows=histories.series[r].filter(d=>Number.isFinite(d[key]));s+=`<path d="${rows.map((d,i)=>(i?'L':'M')+x(d.time).toFixed(2)+' '+y(d[key]).toFixed(2)).join(' ')}" fill="none" stroke="${colors[r]}" stroke-width="2"/>`;}
s+='<path class="cursor" stroke="#172a37" stroke-width="1.5"/><text x="235" y="230" text-anchor="middle" font-size="14" fill="#536470">t / (GM₂/c³)</text>';svg.innerHTML=s;svg.addEventListener('click',e=>{const rect=svg.getBoundingClientRect();seek(Math.max(0,Math.min(6640,((e.clientX-rect.left)/rect.width*440-52)/368*6640)));});}}
async function render(t=current){
 const token=++generation, quantity=$('quantity').value;
 try {
  const loaded=await Promise.all(panels.map(async p=>{
   const frame=nearest(frames[p.run],t), field=p.field==='near'?quantity:p.field;
   const url=source(p.run,field,frame), im=await loadImage(url);return {p,frame,url,field,im};
  }));
  if(token!==generation)return false;
  // Commit images, captions and diagnostics together, only after all images decode.
  current=t;
  for(const {p,frame,url,field,im} of loaded){
   const old=p.f.querySelector('img');
   if(old.getAttribute('src')!==url){const next=im.cloneNode();next.alt=`Beta ${p.run.slice(1)}, ${field}, actual simulation time ${frame.time}`;old.replaceWith(next);}
   p.f.querySelector('span').textContent=`β = ${p.run.slice(1)} · slice t = ${fmt(frame.time)} · Δt = ${fmt(frame.time-t)}`;
   p.f.querySelector('a').href=url;
  }
  $('time').value=t;$('clock').textContent=`t = ${fmt(t)} GM₂/c³`;
  $('phase').textContent=t<1505?'Before capture entry':t<4000?'Approaching center':t<4142?'Central slab crossing':t<6636?'Trailing delivery':'Capture column cleared';
  for(const el of document.querySelectorAll('#charts .chart')){
   const key=el.dataset.key;el.querySelector('.cursor').setAttribute('d',`M${52+t/6640*368} 25V185`);
   el.querySelector('.values').innerHTML=runs.map(r=>{const d=nearest(histories.series[r],t);return `<p style="color:${colors[r]}">β = ${r.slice(1)}: ${fmt(d[key])} <span style="color:#536470">(history t = ${fmt(d.time)})</span></p>`;}).join('');
  }
  $('near-caption').textContent=quantity==='sigma'?'x–z slice, BH at origin; z is the spin axis. Fixed ±100 rg,2 and logarithmic σ scale 10⁻⁴–10³. The horizon is masked. Magnetized structure alone does not establish an escaping jet.':'x–z slice, BH at origin; z is the spin axis. Fixed ±100 rg,2 and logarithmic density scale 10⁻⁴–10² in code units, including the ambient medium. The horizon is masked.';
  $('status').textContent=`Ready · ${frames.b10.length} / ${frames.b100.length} saved snapshots · preloaded, synchronized playback`;
  const upcoming=frames.b10.filter(f=>f.time>t).slice(0,4);
  for(const f of upcoming)for(const p of panels){const field=p.field==='near'?quantity:p.field;loadImage(source(p.run,field,nearest(frames[p.run],f.time))).catch(()=>{});}
  return true;
 }catch(err){if(token!==generation)return false;pause();$('status').textContent='Snapshot unavailable; playback stopped on the last complete, synchronized frame. '+err.message;return false;}
}
function pause(){playing=false;clearTimeout(timer);$('play').textContent='▶ Play';}
function seek(t){pause();return render(Math.max(0,Math.min(6640,t)));}
function schedule(){clearTimeout(timer);if(playing)timer=setTimeout(advance,1000/Number($('speed').value));}
async function advance(){if(!playing)return;const next=frames.b10.find(f=>f.time>current+.001);if(!next){pause();return;}if(await render(next.time))schedule();}
Promise.all(['assets/frames.json','assets/histories.json'].map(p=>fetch(p).then(r=>{if(!r.ok)throw Error(p);return r.json();}))).then(([f,h])=>{
 frames=f;histories=h;runs.forEach(r=>panel(r,'density','wide'));runs.forEach(r=>panel(r,'near','near'));makeCharts();
 $('speed').innerHTML='<option value="1">1</option><option value="2" selected>2</option><option value="4">4</option>';
 $('speed').parentElement.lastChild.textContent=' snapshots / s';
 $('speed').onchange=schedule;
 $('time').oninput=e=>seek(Number(e.target.value));$('quantity').onchange=()=>seek(current);
 document.querySelectorAll('[data-time]').forEach(b=>b.onclick=()=>seek(Number(b.dataset.time)));
 $('play').onclick=async()=>{if(playing){pause();return;}if(current===6640)await render(0);playing=true;$('play').textContent='Ⅱ Pause';schedule();};
 for(const [id,sign] of [['prev',-1],['next',1]])$(id).onclick=()=>{
  const ts=[...new Set(Object.values(frames).flat().map(f=>f.time))].sort((a,b)=>a-b);
  seek(sign>0?(ts.find(t=>t>current+.001)??6640):([...ts].reverse().find(t=>t<current-.001)??0));
 };
 render();
}).catch(e=>{$('status').textContent='Could not load data. Serve this folder over HTTP. '+e.message;});
