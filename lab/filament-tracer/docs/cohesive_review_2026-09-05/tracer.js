/* Saved data only. Optional periodic Fourier display interpolation; no fitting or alignment shift. */
const dataVersion=document.currentScript?.dataset.dataVersion||'current';
const el=id=>document.getElementById(id), count=48*81;
const unpack=s=>new Float32Array(Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer);
const number=x=>x===0?'0':Math.abs(x)<.001?x.toExponential(2):Number(x).toFixed(Math.abs(x)<.1?4:2);
let data=null, task='plane', frame=0, timer=null, request=0, shown={};
const cache={};
const symbol=f=>({Ne:'nₑ',Te:'Tₑ',phi:'φ'}[f]);
function transform(a,mean,k,mode,nz=81){
 const n=48*nz,v=Float64Array.from(a.subarray(k*n,(k+1)*n));
 if(mode==='anomaly')for(let i=0;i<n;i++)v[i]-=mean[i];
 if(mode==='toroidal')for(let x=0;x<48;x++){let m=0;for(let z=0;z<nz;z++)m+=v[x*nz+z]/nz;for(let z=0;z<nz;z++)v[x*nz+z]-=m;}
 return v;
}
function rgb(v,scale,absolute=false){
 const u=absolute?Math.max(0,Math.min(1,v/scale)):Math.max(-1,Math.min(1,v/scale));
 return BEN_RDBU[Math.max(0,Math.min(255,Math.floor((u+1)*128)))];
}
function colorbar(canvas,s,absolute=false){
 const c=canvas.getContext('2d');for(let i=0;i<canvas.width;i++){c.fillStyle=`rgb(${rgb((absolute?i/(canvas.width-1):2*i/(canvas.width-1)-1)*s,s,absolute).join(',')})`;c.fillRect(i,0,1,canvas.height);}
}
function pane(id,title,nz=81){
 const windowInput=nz===9;
 return `<figure class="pane ${id}" id="pane-${id}" style="--cell-half:${50/nz}%"><h4 id="title-${id}">${title}</h4><div class="plot"><div class="radial-title">Radial index x</div><div class="radial-ticks"><span style="top:1.0417%">63</span><span style="top:65.625%">32</span><span style="top:98.9583%">16</span></div><canvas class="heat" id="heat-${id}" width="${nz===81?972:108}" height="576" role="img" aria-labelledby="title-${id}"></canvas></div><div class="axis"><div class="axis-ticks"><span>${windowInput?'14':'0'}</span><span>${windowInput?'18':'35.6'}</span><span>${windowInput?'22':'71.1'}</span></div><div>${windowInput?'Poloidal index y':'Toroidal angle ζ (°)'}</div></div><p class="saturation" id="clip-${id}"></p>${id.startsWith('input')?`<div class="input-scale" id="scale-${id}"></div>`:''}</figure>`;
}
const smoothKernels={};
function fourierDisplay(v,nz,factor=8){
 const m=nz*factor;let K=smoothKernels[nz];
 if(!K){K=new Float64Array(m*nz);for(let j=0;j<m;j++)for(let k=0;k<nz;k++){
  const d=(j+.5)/factor-.5-k;
  K[j*nz+k]=Math.abs(d)<1e-12?1:Math.sin(Math.PI*d)/(nz*Math.sin(Math.PI*d/nz));
 }smoothKernels[nz]=K;}
 const out=new Float64Array(48*m);
 for(let x=0;x<48;x++)for(let j=0;j<m;j++){
  let q=0;for(let k=0;k<nz;k++)q+=v[x*nz+k]*K[j*nz+k];out[x*m+j]=q;
 }return out;
}
function paint(id,v,s,nz,absolute,unit,sourceFrame=data.frames[frame]){
 const smooth=el('sampling').value==='fourier'&&nz===81;
 const w=smooth?nz*8:nz, values=smooth?fourierDisplay(v,nz):v;
 const c=el('heat-'+id),ctx=c.getContext('2d'),buf=document.createElement('canvas');buf.width=w;buf.height=48;
 const b=buf.getContext('2d'),im=b.createImageData(w,48);let clip=0,displayClip=0;
 for(const a of v)if(a>s||a<(absolute?0:-s))clip++;
 for(let x=0;x<48;x++)for(let z=0;z<w;z++){const a=values[x*w+z];if(a>s||a<(absolute?0:-s))displayClip++;im.data.set([...rgb(a,s,absolute),255],((47-x)*w+z)*4);}
 b.putImageData(im,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(buf,0,0,c.width,c.height);
 el('clip-'+id).textContent=`${clip} / ${48*nz} native cells beyond limits`+(smooth?`; ${displayClip} / ${48*w} display samples; Fourier toroidal interpolation`:'; native display');
 c.setAttribute('aria-label',`${el('title-'+id).textContent}; frame ${sourceFrame}; ${unit}; radial cells 16 bottom to 63 top; ${smooth?'Fourier-interpolated toroidal display':'native-cell display'}; ${clip} saturated native cells.`);
 shown[id]={v,s,nz,unit,absolute,clip};
}
function stop(){if(timer)clearInterval(timer);timer=null;el('play').textContent='▶ Play';}
function stat(value,label,unit='',cls=''){
 return `<div class="score ${cls}"><div class="value">${value}</div><div class="label">${label}</div><div class="unit">${unit}</div></div>`;
}
function draw(){
 if(!data||task==='geometry')return;
 frame=+el('frame').value;
 const field=el('field').value,leg=el('leg').value,model=el('model').value,mode=el('display').value,q=data.targets[leg+':'+field];
 const windowInput=data.input_kind==='window',h=windowInput&&model==='H4'?+el('history').value:0;
 el('sampling-label').textContent=windowInput?'Target sampling':'Plane sampling';
 el('display').setAttribute('aria-label',windowInput?'Target color quantity':'Color quantity');
 el('history-control').hidden=!(windowInput&&model==='H4');if(model==='H1')el('history').value='0';
 el('time').textContent=`${data.time_ms[frame].toFixed(4)} ms · frame ${data.frames[frame]} · ${frame+1}/48`;
 for(const [f,v] of Object.entries(data.inputs)){
  let a,scale;
  if(windowInput){a=v.history.subarray((frame*4+h)*48*9,(frame*4+h+1)*48*9);scale=v.history_scale;}
  else{a=transform(v.full,v.mean,frame,mode);scale=v.scales[mode];}
  paint('input-'+f,a,scale,v.nz||81,!windowInput&&mode==='full',v.unit,data.frames[frame]-h);
  const label=windowInput?`${symbol(f)} anomaly (${v.unit})`:mode==='full'?`${symbol(f)} (${v.unit})`:mode==='toroidal'?`${symbol(f)} − ⟨${symbol(f)}⟩ζ (${v.unit})`:`${symbol(f)} − ⟨${symbol(f)}⟩train (${v.unit})`;
  const box=el('scale-input-'+f);box.innerHTML=`<div>${label} · input scale</div><canvas width="256" height="8" aria-hidden="true"></canvas><div class="ticks"><span>${number(!windowInput&&mode==='full'?0:-scale)}</span><span>${number(scale)}</span></div>`;
  colorbar(box.querySelector('canvas'),scale,!windowInput&&mode==='full');
 }
 const a=transform(q.truth,q.mean,frame,mode),p=transform(q.models[model],q.mean,frame,mode),res=Float64Array.from(a,(v,i)=>v-p[i]),s=q.scales[mode];
 el('title-truth').textContent=`(a) Truth · ${leg} ${symbol(field)}`;
 el('title-prediction').textContent=`(b) Prediction · ${data.models[model]}`;
 el('title-error').textContent='(c) Error · truth − prediction';
 paint('truth',a,s,81,mode==='full',q.unit);paint('prediction',p,s,81,mode==='full',q.unit);paint('error',res,s,81,false,q.unit);
 el('output-label').textContent=`${leg==='inner'?'Inner':'Outer'} target · ${symbol(field)} · y=${leg==='inner'?0:31} · same time t`;
 el('input-note').textContent=windowInput?`nₑ, Tₑ, φ · 48×9 cells at ζ=0. Showing t${h?' − '+h+' frames':''} = ${(data.time_ms[frame]-h*data.dt_us/1000).toFixed(4)} ms. Native poloidal strip; target sampling does not change this input. Colors: training-standardized.`:'nₑ and Tₑ · two complete 48×81 planes · y=18 · same time t';
 const quantity=mode==='full'?symbol(field):mode==='toroidal'?`${symbol(field)} − ⟨${symbol(field)}⟩ζ`:`${symbol(field)} − ⟨${symbol(field)}⟩train`;
 el('quantity').textContent=`${quantity} (${q.unit}) · fixed target scale`;
 el('color-note').textContent=mode==='full'?'Truth and prediction: white at zero → red at higher values. Residual: blue = prediction too high; red = too low.':mode==='toroidal'?'Each image subtracts its own toroidal row mean. Blue: below that mean; red: above. Residual excludes errors in the row mean.':'All target panels subtract the same cellwise training mean. Blue: below it; red: above. Residual equals the full-field error.';
 colorbar(el('legend'),s,mode==='full');el('legend-ticks').innerHTML=[mode==='full'?0:-s,mode==='full'?s/2:0,s].map(x=>`<span>${number(x)}</span>`).join('');
 let extra=el('error-extra');if(!extra){extra=document.createElement('div');extra.id='error-extra';extra.className='input-scale';el('pane-error').append(extra);}
 extra.hidden=mode!=='full';if(mode==='full'){extra.innerHTML=`<div>Signed residual (${q.unit})</div><canvas width="256" height="8"></canvas><div class="ticks"><span>${number(-s)}</span><span>0</span><span>${number(s)}</span></div>`;colorbar(extra.querySelector('canvas'),s,false);}
 el('legend').setAttribute('aria-label',`${quantity} in ${q.unit}; linear limits ${mode==='full'?0:number(-s)} to ${number(s)}; fixed through 48 frames.`);
 const sc=q.scores[model].full,n1=q.scores[model].n1.rmse_reduction_percent;
 const good=x=>x>=0?'good':'bad';
 el('score-block').textContent=`${data.score_frames} scored frames · ${data.id==='clean'?'controlled rerun':data.id==='pilot'?'archived pilot':'older window pilot'}`;
 el('score-heading').textContent=`${leg==='inner'?'Inner':'Outer'} ${field==='Ne'?'density':'temperature'} · ${data.models[model]}`;
 el('score-cards').innerHTML=stat(number(sc.mae),'Mean absolute error ↓',q.unit)+stat(number(sc.rmse),'Root mean square error ↓',q.unit)+stat(sc.rmse_reduction_percent.toFixed(1)+'%','Full-field RMSE removed ↑','vs training-mean reference',good(sc.rmse_reduction_percent))+stat(n1.toFixed(1)+'%','Varying-pattern RMSE removed ↑','n≠0 · own reference',good(n1));
 el('model-note').textContent=data.id==='clean'?(model==='native'||model==='aligned'?`Completed 400 epochs; these predictions restore the validation-selected checkpoint at epoch ${data.model_checkpoints[model]}. The scored block did not select this checkpoint.`:'Fit and validation precede the regression block. No target observations enter the model at prediction time.'):data.id==='pilot'?'These are the earlier saved models. GAOT stopped at epoch 192/400. Verified 400-epoch reruns are in the controlled comparison selection.':'Historical pilot: PCA preprocessing included inner-validation inputs. This scored block was not fitted. A fresh protocol is needed before model selection.';
 let ae=0,se=0;for(let i=0;i<count;i++){const e=q.truth[frame*count+i]-q.models[model][frame*count+i];ae+=Math.abs(e)/count;se+=e*e/count;}
 el('frame-score').textContent=`This frame, full physical field: MAE ${number(ae)} ${q.unit}; RMSE ${number(Math.sqrt(se))} ${q.unit}. Cards above score all ${data.score_frames} frames, regardless of the color view.`;
 el('movie-methods').textContent=`Figure ${windowInput?10:5}. ${data.block}. Playback shows ${data.frames[0]}–${data.frames.at(-1)}: 48 consecutive frames selected by index, with Δt = ${data.dt_us.toFixed(3)} µs. Each step uses a new upstream observation${model==='H4'?' and its previous three frames':''}; this is same-time reconstruction, not an autonomous forecast. Observed inputs appear above (a) true target, (b) predicted target and (c) truth − prediction. Blue residual = overprediction; red = underprediction. Playback is slowed for inspection. ${el('sampling').value==='fourier'?'Display: periodic Fourier interpolation within each 81-column plane; radial rows unchanged. Window inputs remain native. Interpolation may overshoot; scores and hover values use original cells.':'Display: original native cells.'}`;
 el('movie-caption').textContent=`Figure ${windowInput?10:5}. Input → truth / prediction / error · same time · ${el('sampling').value==='fourier'?'toroidal interpolation':'native cells'} · scores on native cells.`;
 el('protocol').textContent=data.protocol;
 el('probe').textContent='Hover over a target to compare the same native cell in truth, prediction and residual.';
 document.body.dataset.tracerReady=data.id;
}
async function getData(id){
 if(cache[id])return cache[id];
 const r=await fetch('../cohesive_review_2026-09-05/tracer-'+id+'.json?v='+encodeURIComponent(dataVersion));if(!r.ok)throw Error('Could not load '+id+' arrays');
 const d=await r.json();
 for(const v of Object.values(d.inputs)){v.full=unpack(v.full);v.mean=unpack(v.mean);v.nz=v.nz||81;if(v.history){v.history=unpack(v.history);const a=Array.from(v.history,Math.abs).sort((a,b)=>a-b);v.history_scale=Math.max(a[Math.floor((a.length-1)*.99)],1e-12);}}
 for(const v of Object.values(d.targets)){v.truth=unpack(v.truth);v.mean=unpack(v.mean);for(const m in v.models)v.models[m]=unpack(v.models[m]);}
 cache[id]=d;return d;
}
async function loadData(id){
 const n=++request;stop();data=null;shown={};document.body.dataset.tracerReady='loading';el('play').disabled=true;el('save').disabled=true;
 el('time').textContent='Loading native arrays…';el('outputs').style.opacity='.25';el('inputs').style.opacity='.25';
 try{
  const d=await getData(id);if(n!==request)return;data=d;
  el('inputs').classList.toggle('window',d.input_kind==='window');
  el('inputs').innerHTML=Object.keys(d.inputs).map(f=>pane('input-'+f,symbol(f)+' · observed',d.inputs[f].nz)).join('');
  el('outputs').innerHTML=pane('truth','(a) Held-out target · truth')+pane('prediction','(b) Model prediction')+pane('error','(c) Truth − prediction');
  el('model').innerHTML=Object.entries(d.models).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');el('model').value=d.default_model;
  el('frame').max=d.frames.length-1;el('frame').value='0';el('history').value='0';
  el('play').disabled=false;el('save').disabled=false;el('inputs').style.opacity='1';el('outputs').style.opacity='1';
  el('clean-results').hidden=id!=='clean';el('pilot-results').hidden=id!=='pilot';
  el('plane-conclusion').hidden=id==='pilot';draw();
  for(const id of ['truth','prediction','error']){
   el('heat-'+id).onpointermove=e=>{
    const r=e.currentTarget.getBoundingClientRect(),x=47-Math.max(0,Math.min(47,Math.floor((e.clientY-r.top)/r.height*48))),z=Math.max(0,Math.min(80,Math.floor((e.clientX-r.left)/r.width*81))),i=x*81+z;
    el('probe').textContent=`Displayed quantity · x=${x+16} (Ben raw ${x+18}), ζ=${(z*72/81).toFixed(2)}°: truth ${number(shown.truth.v[i])}; prediction ${number(shown.prediction.v[i])}; truth − prediction ${number(shown.error.v[i])} ${shown.truth.unit}.`;
   };
  }
 }catch(e){if(n!==request)return;el('time').textContent=e.message;el('outputs').innerHTML='';el('inputs').innerHTML='';console.error(e);}
}
function setTab(next,updateHash=true){
 task=next;stop();
 document.querySelectorAll('[data-tab]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.tab===next));b.tabIndex=b.dataset.tab===next?0:-1;});
 el('prediction-view').hidden=next==='geometry';el('geometry-view').hidden=next!=='geometry';
 if(next!=='geometry'){
  el('prediction-view').setAttribute('aria-labelledby','tab-'+next);
  const win=next==='window';el('run-control').hidden=true;el('plane-results').hidden=win;el('window-results').hidden=!win;
  el('task-title').textContent=win?'Upstream window → native target planes':'Upstream plane → native target planes';
  el('task-note').textContent=win?'Observe a radial–poloidal strip of nₑ, Tₑ and φ at one toroidal angle; predict radial–toroidal nₑ and Tₑ planes at both targets. Truth, prediction and error use the native target grid.':'Observe upstream nₑ and Tₑ; predict both fields at the inner and outer targets. Each frame uses a fresh upstream observation at the same time.';
  el('task-caveat').hidden=!win;el('task-caveat').textContent='Exploratory older pilot. This is a 48×9 strip of exact simulation fields, not an optical camera. PCA preprocessing included inner-validation inputs. It is not a controlled plane-versus-window comparison.';
  loadData(win?'window':el('run').value);
 }else{request++;document.body.dataset.tracerReady='geometry';}
 if(updateHash)history.replaceState(null,'','#'+(next==='plane'?'movie':next==='window'?'camera':'geometry'));
}
for(const b of document.querySelectorAll('[data-tab]')){
 b.onclick=()=>setTab(b.dataset.tab);
 b.onkeydown=e=>{const tabs=[...document.querySelectorAll('[data-tab]')],i=tabs.indexOf(b);let j;if(e.key==='ArrowRight')j=(i+1)%3;if(e.key==='ArrowLeft')j=(i+2)%3;if(e.key==='Home')j=0;if(e.key==='End')j=2;if(j!==undefined){e.preventDefault();tabs[j].focus();setTab(tabs[j].dataset.tab);}};
}
el('run').onchange=()=>loadData(el('run').value);
for(const id of ['field','leg','model','display','history','sampling'])el(id).onchange=draw;
el('frame').oninput=draw;
el('play').onclick=()=>{if(!data)return;if(timer){stop();return;}el('play').textContent='Ⅱ Pause';timer=setInterval(()=>{el('frame').value=(+el('frame').value+1)%data.frames.length;draw();},160);};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});

// A standalone journal figure: exact native raster, vector labels, units and caption.
function exportSVG(){
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const ids=[...Object.keys(data.inputs).map(f=>'input-'+f),'truth','prediction','error'];
 const rows=Math.ceil(ids.length/3),W=1500,panelH=440,captionY=125+rows*panelH;
 let a=[];const text=(x,y,s,size=16,extra='')=>a.push(`<text x="${x}" y="${y}" font-size="${size}" ${extra}>${esc(s)}</text>`);
 text(30,36,'Figure '+(data.input_kind==='window'?10:5)+' · Filament Tracer · '+data.block,23);text(30,66,el('time').textContent+' · '+el('output-label').textContent,18);
 text(30,93,'Target colors: '+el('quantity').textContent+' · Inputs: '+el('input-note').textContent,13);
 ids.forEach((id,i)=>{
  const q=shown[id],x=30+(i%3)*495,y=125+Math.floor(i/3)*panelH,l=x+45,w=420,h=249;
  text(x,y,el('title-'+id).textContent,16);
  a.push(`<image x="${l}" y="${y+13}" width="${w}" height="${h}" preserveAspectRatio="none" href="${el('heat-'+id).toDataURL()}" style="image-rendering:pixelated"/><rect x="${l}" y="${y+13}" width="${w}" height="${h}" fill="none" stroke="#76858a"/>`);
  for(const row of [16,32,63])text(l-8,y+13+(63-row+.5)/48*h+4,row,12,'text-anchor="end"');
  a.push(`<text transform="translate(${x+10} ${y+13+h/2}) rotate(-90)" text-anchor="middle" font-size="13">Radial index x</text>`);
  const ticks=q.nz===9?['14','18','22']:['0','35.6','71.1'];ticks.forEach((s,k)=>text(l+(k*(q.nz-1)/2+.5)/q.nz*w,y+h+33,s,12,'text-anchor="middle"'));
  text(l+w/2,y+h+56,q.nz===9?'Poloidal index y':'Toroidal angle ζ (°)',13,'text-anchor="middle"');
  const label=id.startsWith('input')?el('scale-'+id).firstElementChild.textContent:id==='error'?'Truth − prediction ('+q.unit+')':el('quantity').textContent;
  text(l,y+h+81,label,13);
  const bc=document.createElement('canvas');bc.width=512;bc.height=14;colorbar(bc,q.s,q.absolute);
  a.push(`<image x="${l}" y="${y+h+90}" width="${w}" height="12" preserveAspectRatio="none" href="${bc.toDataURL()}"/>`);
  [q.absolute?0:-q.s,q.absolute?q.s/2:0,q.s].forEach((v,k)=>text(l+k*w/2,y+h+121,number(v),12,`text-anchor="${k===0?'start':k===2?'end':'middle'}"`));
  text(l,y+h+146,el('clip-'+id).textContent,12);
 });
 let yy=captionY;const wrap=s=>{let line='';for(const word of s.split(' ')){if((line+' '+word).length>170){text(30,yy,line,14);yy+=21;line=word;}else line+=(line?' ':'')+word;}text(30,yy,line,14);yy+=28;};
 [el('movie-caption').textContent,el('input-note').textContent,el('color-note').textContent,`Display: ${el('sampling').value==='fourier'?'Fourier interpolation within toroidal planes':'native cells'}; no alignment shift. Radial x=16 bottom (first SOL row), x=63 top (farther into SOL). Native toroidal centers 0–71.11°, repeated at 72°. Inputs have separate fixed scales. Truth and prediction share fixed target limits. Signed residual: blue = prediction too high; red = too low.`,el('frame-score').textContent,
 `${el('score-heading').textContent}. All ${data.score_frames} scored frames: MAE ${number(data.targets[el('leg').value+':'+el('field').value].scores[el('model').value].full.mae)}; RMSE ${number(data.targets[el('leg').value+':'+el('field').value].scores[el('model').value].full.rmse)} ${shown.truth.unit}.`,data.protocol].forEach(wrap);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${yy+20}" viewBox="0 0 ${W} ${yy+20}"><rect width="${W}" height="${yy+20}" fill="white"/><g font-family="Arial,sans-serif" fill="#182b32">${a.join('')}</g></svg>`;
}
el('save').onclick=()=>{if(!data)return;const url=URL.createObjectURL(new Blob([exportSVG()],{type:'image/svg+xml'})),a=document.createElement('a');a.href=url;a.download=`filament-${data.id}-${el('leg').value}-${el('field').value}-${data.frames[frame]}.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function route(){
 const h=location.hash,geo=['#geometry','#connection','#ben-snapshot','#figure-1','#figure-8','#figure-9','#figure-13','#our-movie'],win=['#camera','#figure-4'];
 if(!['#meeting-response','#first-principles','#record'].includes(h))setTab(geo.includes(h)?'geometry':win.includes(h)?'window':'plane',false);
 else if(!data&&task!=='geometry')setTab(task,false);
 if(h&&el(h.slice(1)))requestAnimationFrame(()=>{const target=el(h.slice(1));for(let p=target.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;target.scrollIntoView();});
}
window.addEventListener('hashchange',route);
window.tracer={get data(){return data;},get shown(){return shown;},get frame(){return frame;},get task(){return task;},draw,setTab,loadData,stop,exportSVG};
route();
