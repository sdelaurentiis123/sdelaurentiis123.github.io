'use strict';
const canvas=document.getElementById('scene'),ctx=canvas.getContext('2d'),ids=['mesh','input','shell','cut','target','downstream','samples','spin','zoom'],controls=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));
let yaw=-.75,pitch=.3,center=[.75,.48,-.12],pan=[0,0],drag=null,queued=false,previous=0;
function focus(kind){pan=[0,0];if(kind==='omp'){center=TCV_MESH.anchors['OMP input'];yaw=0;pitch=0;controls.zoom.value=650;}else if(kind==='target'){center=TCV_MESH.anchors['Outer divertor target'];yaw=-.75;pitch=.3;controls.zoom.value=400;}else{center=[.75,.48,-.12];yaw=-.75;pitch=.3;controls.zoom.value=100;}requestDraw();}
function requestDraw(){if(!queued){queued=true;requestAnimationFrame(draw);}}
function draw(now){queued=false;const W=canvas.clientWidth,H=canvas.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);if(canvas.width!==W*dpr||canvas.height!==H*dpr){canvas.width=W*dpr;canvas.height=H*dpr;}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);if(controls.spin.checked&&!drag){yaw+=Math.min((now-previous)||16,50)*.0002;}previous=now;
const scale=Math.min(W*.67,H*.69)*Number(controls.zoom.value)/100;
function p(a){const x=a[0]-center[0],y=a[1]-center[1],z=a[2]-center[2],u=Math.cos(yaw)*x-Math.sin(yaw)*y,v=Math.sin(yaw)*x+Math.cos(yaw)*y;return [W/2+pan[0]+scale*u,H/2+pan[1]-scale*(Math.cos(pitch)*z-Math.sin(pitch)*v),Math.sin(pitch)*z+Math.cos(pitch)*v];}
const groups=[],mode=controls.mesh.value,input=controls.input.value;
if(controls.shell.checked)groups.push([mode+'_shell','rgba(155,173,188,.07)','rgba(115,136,151,.24)']);
if(controls.cut.checked)groups.push([mode+'_cut','rgba(182,198,207,.13)','rgba(113,135,150,.3)']);
if(controls.downstream.checked)groups.push(['downstream','rgba(155,94,166,.10)','rgba(155,94,166,.23)']);
if(input==='omp'||input==='both')groups.push(['omp','rgba(39,122,180,.36)','rgba(39,122,180,.25)']);
if(controls.target.checked)groups.push(['target','rgba(217,98,24,.80)','rgba(155,65,20,.18)']);
if(input==='patch'||input==='both')groups.push(['patch','rgba(0,135,104,.98)','rgba(0,70,50,.24)']);
const polys=[];for(const [key,fill,stroke] of groups)for(const q of TCV_MESH[key]){const v=q.map(p);polys.push({v,depth:v.reduce((s,a)=>s+a[2],0)/v.length,fill,stroke});}polys.sort((a,b)=>a.depth-b.depth);
for(const q of polys){ctx.beginPath();q.v.forEach((v,i)=>i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1]));ctx.closePath();ctx.fillStyle=q.fill;ctx.fill();ctx.strokeStyle=q.stroke;ctx.lineWidth=.45;ctx.stroke();}
if(controls.samples.checked){ctx.fillStyle='#277ab4';for(const a of TCV_MESH.points){const v=p(a);ctx.beginPath();ctx.arc(v[0],v[1],2,0,Math.PI*2);ctx.fill();}}
if(input==='line'){ctx.strokeStyle='#277ab4';ctx.lineWidth=3;ctx.beginPath();TCV_MESH.line.forEach((a,i)=>{const v=p(a);i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1]);});ctx.stroke();}
ctx.font='13px system-ui';ctx.fillStyle='#243849';ctx.fillText('72° simulation wedge · geometry only',14,22);
for(const [name,a] of Object.entries(TCV_MESH.anchors)){if(name.includes('target')&&!controls.target.checked)continue;const v=p(a);if(v[0]>0&&v[0]<W-100&&v[1]>35&&v[1]<H-20){ctx.fillStyle='rgba(255,255,255,.9)';ctx.fillRect(v[0]+5,v[1]-18,160,22);ctx.fillStyle='#263a4c';ctx.fillText(name,v[0]+9,v[1]-3);}}
// Orientation inset, each vector represents 0.2 m independent of scene zoom.
const o=[65,H-55];for(const [a,label] of [[[.2,0,0],'X'],[[0,.2,0],'Y'],[[0,0,.2],'Z']]){const u=Math.cos(yaw)*a[0]-Math.sin(yaw)*a[1],v=Math.sin(yaw)*a[0]+Math.cos(yaw)*a[1],b=[o[0]+180*u,o[1]-180*(Math.cos(pitch)*a[2]-Math.sin(pitch)*v)];ctx.strokeStyle='#516c7f';ctx.beginPath();ctx.moveTo(...o);ctx.lineTo(...b);ctx.stroke();ctx.fillStyle='#344c5e';ctx.fillText(label,b[0]+3,b[1]+(label==='Y'?13:-3));}ctx.fillText('Cartesian axes · arrows: 0.2 m',14,H-10);
const desc={patch:'Input: interpolated physical XY patch at one toroidal angle (64 radial × 21 vertical samples, five fields).',omp:'Input: native y18 full OMP XZ slab (64 radial × 81 toroidal samples, five fields).',line:'Input: native y18, z0 radial line (64 samples, five fields).',both:'Compare the tiny physical XY patch (green) with the much larger full OMP XZ input (blue).'};
document.getElementById('selection').textContent=desc[input]+' Output of interest: outer-divertor XZ target (orange), 48 radial × 81 toroidal samples.';
canvas.dataset.drawn='true';canvas.dataset.polygons=String(polys.length);if(controls.spin.checked)requestDraw();}
controls&&Object.values(controls).forEach(e=>e.addEventListener('input',requestDraw));
canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY,e.shiftKey];canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag[0],dy=e.clientY-drag[1];if(drag[2]){pan[0]+=dx;pan[1]+=dy;}else{yaw+=dx*.008;pitch=Math.max(-1.45,Math.min(1.45,pitch+dy*.006));}drag=[e.clientX,e.clientY,drag[2]];requestDraw();});for(const ev of ['pointerup','pointercancel'])canvas.addEventListener(ev,()=>drag=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();controls.zoom.value=Math.max(70,Math.min(1100,Number(controls.zoom.value)*Math.exp(-e.deltaY*.001)));requestDraw();},{passive:false});
document.getElementById('reset').onclick=()=>focus('all');document.getElementById('ompview').onclick=()=>focus('omp');document.getElementById('targetview').onclick=()=>focus('target');document.getElementById('poloidal').onclick=()=>{center=[.95,0,-.1];yaw=0;pitch=0;controls.zoom.value=140;controls.shell.checked=false;pan=[0,0];requestDraw();};new ResizeObserver(requestDraw).observe(canvas);requestDraw();
