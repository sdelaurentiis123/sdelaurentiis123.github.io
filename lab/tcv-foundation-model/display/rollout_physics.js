/* Saved diagnostic curves and quantized target maps; no inference. */
window.drawRolloutPhysics=function(meta,anchor,lead,field){
 const d=window.ROLLOUT_PHYSICS?.[anchor];if(!d)return;
 const cols=['#111111','#9333ea','#2563eb','#ea580c'];
 function plot(ctx,box,xs,series,title,xlabel,ylabel,log=false,mark=null,fixedValues=null){
  const [x,y,w,h]=box,L=x+80,R=x+w-22,T=y+52,B=y+h-52;
  let vals=(fixedValues||series.flat()).filter(v=>v!==null&&Number.isFinite(v)&&(!log||v>0));
  if(!vals.length)return;
  let lo=log?Math.floor(Math.log10(Math.min(...vals))):Math.min(0,...vals),hi=log?Math.ceil(Math.log10(Math.max(...vals))):Math.max(...vals)*1.08;
  if(hi<=lo)hi=lo+1;
  const px=v=>L+(v-xs[0])/(xs.at(-1)-xs[0])*(R-L),py=v=>B-((log?Math.log10(v):v)-lo)/(hi-lo)*(B-T);
  ctx.font='16px system-ui';ctx.fillStyle='#172033';ctx.textAlign='center';ctx.fillText(title,x+w/2,y+22);ctx.font='12px system-ui';ctx.fillText(ylabel,x+w/2,y+40);
  for(let j=0;j<=4;j++){let a=lo+(hi-lo)*j/4,Y=B-(B-T)*j/4;ctx.strokeStyle='#e2e8f0';ctx.beginPath();ctx.moveTo(L,Y);ctx.lineTo(R,Y);ctx.stroke();ctx.fillStyle='#475569';ctx.textAlign='right';ctx.fillText(log?'10^'+a.toFixed(1):a.toPrecision(3),L-8,Y+4);}
  for(let j=0;j<=4;j++){let v=xs[0]+(xs.at(-1)-xs[0])*j/4;ctx.textAlign='center';ctx.fillText(v.toFixed(0),px(v),B+18);}ctx.fillText(xlabel,x+w/2,B+40);
  if(mark!==null){ctx.strokeStyle='#64748b';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(px(mark),T);ctx.lineTo(px(mark),B);ctx.stroke();ctx.setLineDash([]);}
  series.forEach((s,m)=>{ctx.strokeStyle=cols[m];ctx.lineWidth=m===0?2.5:1.8;ctx.beginPath();let active=false;s.forEach((v,i)=>{if(v===null||!Number.isFinite(v)||(log&&v<=0)){active=false;return}const X=px(xs[i]),Y=py(v);if(active)ctx.lineTo(X,Y);else ctx.moveTo(X,Y);active=true;});ctx.stroke();});
 }
 const sc=document.getElementById('spectra').getContext('2d');sc.clearRect(0,0,1500,380);
 plot(sc,[0,0,750,380],d.n,d.power[lead-1].map(m=>m[field]),meta.fields[field]+' · power by toroidal mode','Toroidal mode n = 5k','Variance contribution · ('+meta.units[field]+')² · log scale',true,null,d.power.flatMap(t=>t.flatMap(m=>m[field])));
 const cumulative=[0,1,2,3].map(m=>d.power.map(a=>a[m][field].reduce((s,v)=>s+v,0)));
 plot(sc,[750,0,750,380],Array.from({length:16},(_,i)=>i+1),cumulative,'Total fluctuation variance through this rollout','Forecast lead','Sum over n > 0 · ('+meta.units[field]+')²',false,lead);
 document.getElementById('spectrumStatus').textContent=`Start ${anchor} · lead ${lead} · target ${anchor+lead} · ${meta.fields[field]} · full-volume fluctuations (n > 0).`;
 const h=d.heat[String(lead)],heatCanvas=document.getElementById('heatMaps'),profileCanvas=document.getElementById('heatProfiles');
 const q=+document.getElementById('heatQuantity').value,label=['Electron','Ion','Total'][q],limits=d.heat_limits[q];
 heatCanvas.dataset.available=profileCanvas.dataset.available=String(!!h);
 document.querySelectorAll('.heatStep').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.lead===lead)));
 document.getElementById('heatScale').textContent=`${label} heat: ${limits[0].toPrecision(3)} to ${limits[1].toPrecision(3)} MW/m². Fixed scale across all saved steps and models.`;
 if(!h){
  document.getElementById('heatStatus').textContent=`Lead ${lead} · target heat not saved. Available at steps 1, 2, 4, 8 and 16.`;
  for(const canvas of [heatCanvas,profileCanvas]){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f8fafc';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#64748b';ctx.textAlign='center';ctx.font='18px system-ui';ctx.fillText('No saved heat data at this step',canvas.width/2,canvas.height/2-12);ctx.font='14px system-ui';ctx.fillText('Choose “Saved heat steps” playback or select a step above.',canvas.width/2,canvas.height/2+16);}
  return;
 }
 document.getElementById('heatStatus').textContent=`${label} heat · start ${anchor} · lead ${lead} · target ${anchor+lead}. Gray = invalid.`;
 const hc=heatCanvas.getContext('2d');hc.clearRect(0,0,1500,420);
 const arc=d.arc,edges=[arc[0]-(arc[1]-arc[0])/2,...arc.slice(1).map((v,i)=>(v+arc[i])/2),arc.at(-1)+(arc.at(-1)-arc.at(-2))/2];
 const amin=edges[0],amax=edges.at(-1),Y=v=>340-(v-amin)/(amax-amin)*280;
 const lim=d.heat_limits[q],pal=lim[0]<0?'signed':'positive';
 for(let m=0;m<4;m++){
  const x=m*375+65,w=285;hc.font='14px system-ui';hc.textAlign='center';hc.fillStyle='#172033';hc.fillText(meta.models[m],m*375+187,20);hc.font='12px system-ui';
  for(let r=0;r<48;r++)for(let z=0;z<81;z++){const c=h.colors[m][q][r][z];hc.fillStyle=c<0?'#cbd5e1':`rgb(${meta.palettes[pal][c]})`;hc.fillRect(x+z*w/81,Y(edges[r+1]),w/81+.4,Y(edges[r])-Y(edges[r+1])+.4);}
  hc.fillStyle='#475569';hc.font='12px system-ui';hc.textAlign='center';for(let deg of [0,36,72])hc.fillText(deg,x+deg*w/72,358);hc.fillText('Native toroidal coordinate (degrees)',x+w/2,377);
  hc.textAlign='right';for(let j=0;j<4;j++){const v=amin+(amax-amin)*j/3;hc.fillText(v.toFixed(0),x-6,Y(v)+4);}hc.save();hc.translate(x-42,200);hc.rotate(-Math.PI/2);hc.textAlign='center';hc.fillText('Target arclength (mm)',0,0);hc.restore();
 }
 for(let i=0;i<256;i++){hc.fillStyle=`rgb(${meta.palettes[pal][i]})`;hc.fillRect(500+i*500/256,391,500/256+1,12)}hc.fillStyle='#475569';hc.font='12px system-ui';hc.textAlign='right';hc.fillText(lim[0].toPrecision(3),493,402);hc.textAlign='left';hc.fillText(lim[1].toPrecision(3)+' MW/m²',1007,402);
 const pc=profileCanvas.getContext('2d');pc.clearRect(0,0,1500,365);
 for(let j=0;j<3;j++)plot(pc,[500*j,0,500,365],arc,h.profiles.map(m=>m[j]),['Electron','Ion','Total'][j]+' · toroidal-average profile','Target arclength (mm)','Normal target heat (MW/m²)',false,null,Object.values(d.heat).flatMap(h=>h.profiles.flatMap(m=>m[j])));

};
