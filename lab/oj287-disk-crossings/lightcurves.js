'use strict';
fetch('assets/observables/observer_surrogate.json').then(r=>r.json()).then(data=>{
const $=id=>document.getElementById(id), colors=['#17638c','#b75c20'], keys=['beta10','beta100'];
const nearest=(rows,t)=>rows.reduce((a,b)=>Math.abs(b.observer_day-t)<Math.abs(a.observer_day-t)?b:a);
data.models.forEach(m=>$('model').add(new Option(m.label,m.id)));$('model').value='fiducial_soft_x';
const specs=[['optical_r','Optical r','mJy','flux_density_mJy',-4,1],['uvot_uvw2','Near-UV','mJy','flux_density_mJy',-4,1],['soft_x','Soft X-ray · 0.3–2 keV','erg cm⁻² s⁻¹','flux_erg_cm2_s',-15,-8]];
let model, day=50;
function path(rows,x,y,value){let out='',pen=false;for(const p of rows){const v=value(p);if(!(v>0)){pen=false;continue;}out+=(pen?'L':'M')+x(p).toFixed(2)+' '+y(v).toFixed(2)+' ';pen=true;}return out;}
function setup(){model=data.models.find(m=>m.id===$('model').value);$('parameters').innerHTML=[['Imposed β=10 peak',model.peak_edd+' LEdd'],['Hot temperature',model.hot_kT_keV+' keV'],['Reprocessed',100*model.reprocessed_fraction+'%'],['Diffusion delay',model.diffusion_days_observer+' days']].map(([l,v])=>`<div><small>${l}</small><strong>${v}</strong></div>`).join('');
$('lightplots').innerHTML=specs.map(([band,title,unit,key,min,max])=>{const y=v=>215-(Math.log10(v)-min)/(max-min)*180;let s='';for(let n=min;n<=max;n++)s+=`<path d="M62 ${y(10**n)}H415" stroke="#e1e6e9"/><text x="54" y="${y(10**n)+5}" text-anchor="end" font-size="14">1e${n}</text>`;for(const t of [0,25,50,75])s+=`<text x="${62+t/75*353}" y="237" text-anchor="middle" font-size="14">${t}</text>`;
keys.forEach((r,i)=>s+=`<path d="${path(model.runs[r].lightcurve,p=>62+p.observer_day/75*353,y,p=>p.bands[band][key])}" fill="none" stroke="${colors[i]}" stroke-width="2" clip-path="url(#clip-${band})"/>`);
return `<article class="chart" data-band="${band}"><h3>${title}</h3><p class="micro">${unit} · logarithmic</p><svg viewBox="0 0 440 270" role="img" aria-label="${title} light curves"><defs><clipPath id="clip-${band}"><rect x="62" y="35" width="353" height="180"/></clipPath></defs>${s}<path class="lc-cursor" stroke="#182a36" stroke-dasharray="3 3"/><text x="235" y="262" text-anchor="middle" font-size="14">Observer days</text></svg><div class="readout"></div></article>`;}).join('');
document.querySelectorAll('#lightplots svg').forEach(svg=>svg.onclick=e=>{const r=svg.getBoundingClientRect();setDay(((e.clientX-r.left)/r.width*440-62)/353*75);});update();}
function update(){const selected=keys.map(r=>nearest(model.runs[r].lightcurve,day));$('day').value=day;$('day-label').textContent=day.toFixed(1)+' d';
for(const [band,,,key] of specs){const panel=document.querySelector(`[data-band="${band}"]`);panel.querySelector('.lc-cursor').setAttribute('d',`M${62+day/75*353} 30V215`);panel.querySelector('.readout').innerHTML=selected.map((p,i)=>`<span style="color:${colors[i]}">β ${i?100:10}: <strong>${p.bands[band][key].toExponential(2)}</strong><br><small>sample ${p.observer_day.toFixed(2)} d</small></span>`).join('');}
const x=e=>65+(Math.log10(e)+5)/7*570,y=f=>245-(Math.log10(f)+16)/9*215;let s='';
const bandChoice=$('band-select')?.value || 'all';
const windows=[[.00165,.00225,'Optical','#3b7fa3'],[.0054,.0074,'UV','#7760a1'],[.3,2,'Soft X','#a66a26']];
if($('bandpass')){
let bp='';windows.forEach(([lo,hi,label,color],i)=>{const active=bandChoice==='all'||+bandChoice===i;bp+=`<path d="M65 90H${x(lo)}V35H${x(hi)}V90H635" fill="none" stroke="${color}" stroke-width="2" opacity="${active?1:.12}"/><text x="${(x(lo)+x(hi))/2}" y="23" text-anchor="middle" font-size="14" fill="${color}">${label}</text>`;});
for(const n of [-5,-3,-1,1,2])bp+=`<text x="${x(10**n)}" y="112" text-anchor="middle" font-size="14">1e${n}</text>`;
$('bandpass').innerHTML=`<p class="micro">Idealized relative response · 0 outside / 1 inside each band</p><svg viewBox="0 0 660 142" role="img" aria-label="Idealized optical UV and soft X-ray top-hat bandpass windows"><text x="57" y="40" text-anchor="end" font-size="14">1</text><text x="57" y="94" text-anchor="end" font-size="14">0</text>${bp}<text x="350" y="137" text-anchor="middle" font-size="14">Observed photon energy · keV (logarithmic)</text></svg>`;
}
for(const [i,[lo,hi,label,color]] of [[.00165,.00225,'r','#d4e8f4'],[.0054,.0074,'UV','#dedbf5'],[.3,2,'soft X','#f6e4cf']].entries())s+=`<rect x="${x(lo)}" y="30" width="${x(hi)-x(lo)}" height="215" opacity="${bandChoice==='all'||+bandChoice===i?1:.12}" fill="${color}"/><text x="${(x(lo)+x(hi))/2}" y="22" text-anchor="middle" font-size="13">${label}</text>`;
for(const n of [-16,-13,-10,-7])s+=`<path d="M65 ${y(10**n)}H635" stroke="#e1e6e9"/><text x="57" y="${y(10**n)+5}" text-anchor="end" font-size="14">1e${n}</text>`;for(const n of [-5,-3,-1,1,2])s+=`<text x="${x(10**n)}" y="267" text-anchor="middle" font-size="14">1e${n}</text>`;
selected.forEach((p,i)=>{const scale=p.Lbol_over_LEdd/model.peak_edd;s+=`<path d="${path(model.spectra,p=>x(p.energy_observer_keV),y,p=>p.nuFnu_peak_erg_cm2_s*scale)}" stroke="${colors[i]}" stroke-width="2" fill="none" clip-path="url(#specclip)"/>`;});
$('spectrum').innerHTML=`<p class="micro">νFν · erg cm⁻² s⁻¹ · both axes logarithmic</p><svg viewBox="0 0 660 302" role="img" aria-label="Conditional spectral energy distribution at selected observer time"><defs><clipPath id="specclip"><rect x="65" y="30" width="570" height="215"/></clipPath></defs>${s}<text x="350" y="295" text-anchor="middle" font-size="14">Observed photon energy · keV</text></svg>`;
}
function setDay(t){day=Math.max(0,Math.min(74.15688,t));update();}
if($('band-select'))$('band-select').onchange=update;
$('model').onchange=setup;$('day').oninput=e=>setDay(Number(e.target.value));$('peak').onclick=()=>setDay(model.runs.beta10.peak.observer_day);$('crossing').onclick=()=>setDay(4070.710678*data.metadata.observer_days_per_M);setup();
}).catch(e=>{document.getElementById('parameters').textContent='Data failed to load: '+e.message;});
