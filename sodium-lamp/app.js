import { CONSTANTS, lteUpperFraction, rateBalance, checkRateBalance } from './physics.js';

const NX = 64, NZ = 112, FLOATS = 8, CELL_BYTES = FLOATS * 4;
const stateBytes = NX * NZ * CELL_BYTES;
const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(['gpu-status','pause','reset','volume','volume-field','volume-definition','volume-scale','slice','field','field-definition','probe-label','preset','power','oxygen','sodium','pressure','reflect','pump','quench','speed','power-out','oxygen-out','sodium-out','pressure-out','reflect-out','pump-out','quench-out','speed-out','sim-time','r-pump','r-abs','r-sp','r-stim','r-q','upper-solved','upper-lte','enhancement','balance','scale','fatal'].map(id => [id, $(id)]));

const params = new Float32Array(32);
const P = {NX:0,NZ:1,R:2,L:3,PRESSURE:4,NA_PPM:5,POWER:6,O2:7,REFLECT:8,QUENCH:9,PUMP:10,SPEED:11,FIELD:12,TIME:13,SALT:14};
Object.assign(params, {[P.NX]:NX,[P.NZ]:NZ,[P.R]:0.038,[P.L]:0.18,[P.PRESSURE]:1.4e5,[P.NA_PPM]:80,[P.POWER]:10,[P.O2]:0.38,[P.REFLECT]:0.94,[P.QUENCH]:1e-16,[P.PUMP]:2e7,[P.SPEED]:1,[P.FIELD]:0,[P.TIME]:0,[P.SALT]:0});
let paused = false, orbit = 0.65, pitch = 0.10, dragging = false, lastX = 0, lastY = 0, probeR = 0.28, probeZ = 0.28, probePinned = false, volumeMode = 2;

const WGSL = /* wgsl */`
const PI:f32=3.14159265359; const C:f32=2.99792458e8; const KB:f32=1.380649e-23;
const H:f32=6.62607015e-34; const EV:f32=1.602176634e-19; const A:f32=6.15e7;
const G:f32=3.0; const LAMBDA:f32=5.8916e-7; const MNA:f32=3.81754e-26;
struct Cell { a:vec4<f32>, b:vec4<f32> }
@group(0) @binding(0) var<storage,read> src:array<Cell>;
@group(0) @binding(1) var<storage,read_write> dst:array<Cell>;
@group(0) @binding(2) var<storage,read> p:array<f32>;
fn ix(x:u32,z:u32)->u32{return z*u32(p[0])+x;}
fn clampCell(x:i32,z:i32)->Cell{return src[ix(u32(clamp(x,0,i32(p[0])-1)),u32(clamp(z,0,i32(p[1])-1)))];}
fn bilerp(pos:vec2<f32>)->Cell{
  let q=clamp(pos,vec2<f32>(0.0),vec2<f32>(p[0]-1.001,p[1]-1.001)); let i=vec2<i32>(floor(q)); let f=fract(q);
  let c00=clampCell(i.x,i.y); let c10=clampCell(i.x+1,i.y); let c01=clampCell(i.x,i.y+1); let c11=clampCell(i.x+1,i.y+1);
  var o:Cell; o.a=mix(mix(c00.a,c10.a,f.x),mix(c01.a,c11.a,f.x),f.y); o.b=mix(mix(c00.b,c10.b,f.x),mix(c01.b,c11.b,f.x),f.y); return o;
}
fn flow(r:f32,z:f32)->vec2<f32>{
  let recirc=sin(PI*z); let vr=-0.24*recirc*r*(1.0-r); let vz=0.55*(1.0-2.2*r*r)+0.08*cos(2.0*PI*z); return vec2<f32>(vr,vz);
}
@compute @workgroup_size(8,8) fn init(@builtin(global_invocation_id) gid:vec3<u32>){
  if(gid.x>=u32(p[0])||gid.y>=u32(p[1])){return;} let r=f32(gid.x)/(p[0]-1.0); let z=f32(gid.y)/(p[1]-1.0);
  let core=exp(-pow((r-0.28)/0.18,2.0)-pow((z-0.28)/0.22,2.0)); let plume=exp(-pow(r/0.48,2.0))*smoothstep(0.08,0.48,z)*(1.0-smoothstep(0.76,1.0,z));
  let temp=320.0+1450.0*core+500.0*plume; let fuel=exp(-pow(r/0.35,2.0))*(1.0-smoothstep(0.0,0.3,z)); let ox=0.25+0.75*r;
  let reaction=core; let na=p[5]*1e-6*(0.12+0.88*smoothstep(850.0,1500.0,temp));
  dst[ix(gid.x,gid.y)]=Cell(vec4<f32>(temp,na,1e-10,1.0),vec4<f32>(fuel,ox,reaction,length(flow(r,z))));
}
@compute @workgroup_size(8,8) fn advance(@builtin(global_invocation_id) gid:vec3<u32>){
  if(gid.x>=u32(p[0])||gid.y>=u32(p[1])){return;} let r=f32(gid.x)/(p[0]-1.0); let z=f32(gid.y)/(p[1]-1.0); let v=flow(r,z)*p[11];
  let dt=0.018; let back=vec2<f32>(f32(gid.x),f32(gid.y))-vec2<f32>(v.x*dt*(p[0]-1.0),v.y*dt*(p[1]-1.0)); let q=bilerp(back);
  let l=clampCell(i32(gid.x)-1,i32(gid.y)); let rr=clampCell(i32(gid.x)+1,i32(gid.y)); let d=clampCell(i32(gid.x),i32(gid.y)-1); let u=clampCell(i32(gid.x),i32(gid.y)+1);
  let lapA=l.a+rr.a+d.a+u.a-4.0*q.a; let lapB=l.b+rr.b+d.b+u.b-4.0*q.b;
  var fuel=max(0.0,q.b.x+0.018*lapB.x); var ox=max(0.0,q.b.y+0.018*lapB.y);
  let inlet=1.0-smoothstep(0.02,0.20,z); let fuelSupply=exp(-pow(r/0.34,2.0)); let oxidizerSupply=clamp(0.20+0.80*r,0.0,1.0); fuel=mix(fuel,fuelSupply,clamp(dt*3.2*inlet,0.0,1.0)); ox=mix(ox,oxidizerSupply,clamp(dt*3.2*inlet,0.0,1.0));
  let ignition=smoothstep(650.0,1250.0,q.a.x); let mixture=4.0*fuel*ox/max(fuel+ox,0.05); let flameholder=exp(-pow((r-0.28)/0.18,2.0)-pow((z-0.25)/0.16,2.0)); let reaction=clamp(ignition*mixture+0.48*flameholder*mixture,0.0,1.0);
  fuel=max(0.0,fuel-dt*0.42*reaction); ox=max(0.0,ox-dt*0.26*reaction);
  if(gid.y==0u){fuel=exp(-pow(r/0.34,2.0));ox=clamp(0.20+0.8*r,0.0,1.0);} 
  let targetHot=330.0+1820.0*clamp(p[6]/10.0,0.25,2.0)*clamp(p[7]/0.38,0.6,1.65)*reaction;
  let wallLoss=(q.a.x-330.0)*(0.002+0.018*pow(r,8.0)); var temp=clamp(q.a.x+0.035*lapA.x+dt*(targetHot-q.a.x)*0.46-wallLoss,300.0,2850.0); temp=mix(temp,325.0,clamp(dt*2.4*inlet,0.0,1.0));
  let activation=smoothstep(780.0,1450.0,temp); let chemistry=select(1.0,1.18,p[14]>0.5); let naTarget=p[5]*1e-6*activation*chemistry*(0.18+0.82*reaction);
  let na=max(0.0,q.a.y+0.025*lapA.y+dt*1.6*(naTarget-q.a.y));
  dst[ix(gid.x,gid.y)]=Cell(vec4<f32>(temp,na,q.a.z,max(q.a.w,0.0)),vec4<f32>(fuel,ox,reaction,length(v)));
}
fn modes(T:f32,pressure:f32)->f32{let nu=C/LAMBDA;let doppler=nu/C*sqrt(2.0*KB*T/MNA);let pressureWidth=30.4e6*(pressure/133.322368)*sqrt(450.0/T);let width=max(doppler,pressureWidth);return 8.0*PI*nu*nu*width/(C*C*C);}
fn lte(T:f32)->f32{let ratio=G*exp(-(2.104*EV)/(KB*T));return ratio/(1.0+ratio);}
@compute @workgroup_size(8,8) fn radiation(@builtin(global_invocation_id) gid:vec3<u32>){
  if(gid.x>=u32(p[0])||gid.y>=u32(p[1])){return;} let id=ix(gid.x,gid.y); let s=src[id]; let T=max(s.a.x,300.0); let nbuf=p[4]/(KB*T); let nna=nbuf*s.a.y;
  let nm=max(modes(T,p[4]),1.0); let photons=max(s.a.w,0.0); let occ=photons/nm; let lower=1.0-s.a.z;
  let pump=p[10]*s.b.z; let quench=p[9]*nbuf; let upTarget=(pump+G*A*occ)/max(pump+G*A*occ+A*(1.0+occ)+quench,1.0); let upper=mix(s.a.z,clamp(upTarget,0.0,0.74),0.58);
  let nu=C/LAMBDA;let dnu=nu/C*sqrt(2.0*KB*T/MNA);let sigma=PI*2.8179403262e-15*C*0.961/(max(dnu,1.0)*sqrt(PI));let kappa=max(nna*sigma,0.02);
  let path=min(p[2],p[3]); let D=C/(3.0*(kappa+1.0/path)); let dr=p[2]/p[0];let dz=p[3]/p[1];let r=(f32(gid.x)+0.5)*dr;
  let aw=select(0.0,D*max(r-0.5*dr,0.0)/(max(r,0.5*dr)*dr*dr),gid.x>0u); let ae=select(4.0*D/(dr*dr),D*(r+0.5*dr)/(r*dr*dr),gid.x>0u);
  let az=D/(dz*dz); let refl=clamp(p[8],0.0,0.999); var west=photons;var east=photons*refl;var south=photons*refl;var north=photons*refl;
  if(gid.x>0u){west=src[ix(gid.x-1u,gid.y)].a.w;} if(gid.x+1u<u32(p[0])){east=src[ix(gid.x+1u,gid.y)].a.w;}
  if(gid.y>0u){south=src[ix(gid.x,gid.y-1u)].a.w;} if(gid.y+1u<u32(p[1])){north=src[ix(gid.x,gid.y+1u)].a.w;}
  let nupper=nna*upper;let nlower=nna*(1.0-upper);let source=A*nupper;let atomicSink=max((G*A*nlower-A*nupper)/nm,0.0);let endEscape=C*(1.0-refl)/(20.0*p[3]);
  let nextPhotons=(source+aw*west+ae*east+az*(south+north))/max(atomicSink+endEscape+aw+ae+2.0*az,1.0);
  dst[id]=Cell(vec4<f32>(T,s.a.y,upper,max(nextPhotons,0.0)),s.b);
}
`;

const RENDER_WGSL = /* wgsl */`
const PI:f32=3.14159265359;const KB:f32=1.380649e-23;const EV:f32=1.602176634e-19;const C:f32=2.99792458e8;const LAMBDA:f32=5.8916e-7;const MNA:f32=3.81754e-26;
struct Cell{a:vec4<f32>,b:vec4<f32>} @group(0) @binding(0)var<storage,read>s:array<Cell>;@group(0)@binding(1)var<storage,read>p:array<f32>;@group(0)@binding(2)var<storage,read>v:array<f32>;
struct O{@builtin(position)pos:vec4<f32>,@location(0)uv:vec2<f32>};@vertex fn vs(@builtin(vertex_index)i:u32)->O{var q=array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));var o:O;o.pos=vec4(q[i],0.,1.);o.uv=q[i];return o;}
fn cell(r:f32,z:f32)->Cell{let x=u32(clamp(r,0.,.999)*p[0]);let y=u32(clamp(z,0.,.999)*p[1]);return s[y*u32(p[0])+x];}
fn lte(T:f32)->f32{let q=3.*exp(-(2.104*EV)/(KB*T));return q/(1.+q);}
fn modes(T:f32)->f32{let nu=C/LAMBDA;let d=max(nu/C*sqrt(2.*KB*T/MNA),30.4e6*(p[4]/133.322368)*sqrt(450./T));return 8.*PI*nu*nu*d/(C*C*C);}
fn palette(x:f32)->vec3<f32>{let q=clamp(x,0.,1.);let a=vec3(.025,.04,.11);let b=vec3(.02,.32,.50);let c=vec3(.95,.31,.025);let d=vec3(1.,.94,.55);return select(mix(a,b,q*2.),mix(c,d,(q-.5)*2.),q>.5);}
fn sodiumMap(x:f32)->vec3<f32>{let q=clamp(x,0.,1.);if(q<.33){return mix(vec3(.025,.005,.09),vec3(.36,.03,.42),q/.33);}if(q<.68){return mix(vec3(.36,.03,.42),vec3(1.,.27,.015),(q-.33)/.35);}return mix(vec3(1.,.27,.015),vec3(1.,.96,.52),(q-.68)/.32);}
fn thermalMap(x:f32)->vec3<f32>{let q=clamp(x,0.,1.);if(q<.33){return mix(vec3(.02,0.,.08),vec3(.32,.03,.48),q/.33);}if(q<.68){return mix(vec3(.32,.03,.48),vec3(.88,.23,.13),(q-.33)/.35);}return mix(vec3(.88,.23,.13),vec3(.99,1.,.64),(q-.68)/.32);}
fn photonMap(x:f32)->vec3<f32>{let q=clamp(x,0.,1.);if(q<.5){return mix(vec3(.27,.005,.33),vec3(.12,.42,.55),q*2.);}return mix(vec3(.12,.42,.55),vec3(.82,.91,.10),(q-.5)*2.);}
fn logten(x:f32)->f32{return log2(x)/3.32192809489;}
fn field(c:Cell)->f32{let mode=i32(v[0]);if(mode==0){return (c.a.x-300.)/2100.;}if(mode==1){return clamp(logten(max(c.a.z/lte(c.a.x),1.))/6.,0.,1.);}if(mode==2){return clamp((logten(max(c.a.w/modes(c.a.x),1e-9))+9.)/10.,0.,1.);}if(mode==3){return c.b.z;}return clamp(c.a.y/(p[5]*1e-6),0.,1.);}
@fragment fn slice(in:O)->@location(0)vec4<f32>{let uv=in.uv*.5+.5;let r=uv.x;let z=uv.y;let c=cell(r,z);var col=palette(field(c));let axis=select(1.,.68,uv.x<.003);let grid=select(1.,.82,fract(uv.y*10.)<.008||fract(r*5.)<.008);if(abs(r-.52)<.0018&&z<.72){col=mix(col,vec3(.88,.92,.94),.82);}let probeDistance=length(vec2((r-v[4])*.72,z-v[5]));if(abs(probeDistance-.016)<.0023){col=mix(col,vec3(1.),.88);}return vec4(col*axis*grid,1.);}
fn hitCylinder(ro:vec3<f32>,rd:vec3<f32>)->vec2<f32>{let a=dot(rd.xy,rd.xy);let b=2.*dot(ro.xy,rd.xy);let cc=dot(ro.xy,ro.xy)-1.;let d=b*b-4.*a*cc;if(d<0.){return vec2(1.,-1.);}let sd=sqrt(d);var t0=(-b-sd)/(2.*a);var t1=(-b+sd)/(2.*a);let z0=(-1.-ro.z)/rd.z;let z1=(1.-ro.z)/rd.z;let za=min(z0,z1);let zb=max(z0,z1);t0=max(t0,za);t1=min(t1,zb);return vec2(t0,t1);}
fn hash(q:vec3<f32>)->f32{return fract(sin(dot(q,vec3(12.9898,78.233,41.37)))*43758.5453);}
@fragment fn volume(in:O)->@location(0)vec4<f32>{let uv=in.uv;let yaw=v[1];let pitch=v[2];let aspect=v[3];let mode=i32(v[6]);let ro=vec3(3.1*cos(yaw)*cos(pitch),3.1*sin(yaw)*cos(pitch),3.1*sin(pitch));let fw=normalize(-ro);let right=normalize(cross(fw,vec3(0.,0.,1.)));let up=cross(right,fw);let rd=normalize(fw+right*uv.x*aspect*.57+up*uv.y*.57);let hit=hitCylinder(ro,rd);if(hit.y<=max(hit.x,0.)){return vec4(.008,.01,.013,1.);}var col=vec3(0.);var alpha=0.;let start=max(hit.x,0.);let step=(hit.y-start)/72.;for(var i=0;i<72;i++){let t=start+(f32(i)+.5)*step;let pos=ro+rd*t;let angle=atan2(pos.y,pos.x);if(angle>-.45&&angle<1.05){continue;}let rr=length(pos.xy);let z=pos.z*.5+.5;let q=cell(rr,z);let occ=q.a.w/modes(q.a.x);let emit=clamp(q.a.z*3e5+log2(1.+occ)*.04+q.b.z*.12,0.,1.);var value=emit;var rgb=sodiumMap(value);var density=.012+emit*.10;if(mode==1){value=clamp((q.a.x-300.)/2100.,0.,1.);rgb=thermalMap(value);density=.006+value*.072;}if(mode==2){value=clamp((logten(max(occ,1e-9))+9.)/10.,0.,1.);rgb=photonMap(value);density=.004+value*.082;}let da=density*(1.-alpha);col+=rgb*da*(1.25+hash(pos*90.+p[13])*.10);alpha+=da;if(alpha>.97){break;}}let rim=pow(max(0.,dot(-rd,normalize(vec3((ro+rd*hit.x).xy,0.)))),18.);col+=vec3(.18,.21,.23)*rim;return vec4(col,1.);}
`;

function fmtRate(x){if(!Number.isFinite(x))return '—';return `${x.toExponential(2)} s⁻¹`;}
function syncControls(){
  params[P.POWER]=+ui.power.value;params[P.O2]=+ui.oxygen.value/100;params[P.NA_PPM]=+ui.sodium.value;params[P.PRESSURE]=+ui.pressure.value*1e5;params[P.REFLECT]=+ui.reflect.value/100;params[P.PUMP]=10**(+ui.pump.value);params[P.QUENCH]=10**(+ui.quench.value);params[P.SPEED]=+ui.speed.value;params[P.FIELD]=+ui.field.value;volumeMode=+ui['volume-field'].value;
  ui['power-out'].value=`${params[P.POWER].toFixed(1)} kW`;ui['oxygen-out'].value=`${Math.round(params[P.O2]*100)}%`;ui['sodium-out'].value=`${Math.round(params[P.NA_PPM])} ppm`;ui['pressure-out'].value=`${(params[P.PRESSURE]/1e5).toFixed(1)} bar`;ui['reflect-out'].value=`${(params[P.REFLECT]*100).toFixed(1)}%`;ui['pump-out'].value=`${params[P.PUMP].toExponential(1)} s⁻¹`;ui['quench-out'].value=`${params[P.QUENCH].toExponential(1)} m³/s`;ui['speed-out'].value=`${params[P.SPEED].toFixed(1)}×`;
  const labels=[['300 K','2400 K'],['1× LTE','10⁶× LTE'],['10⁻⁹','10¹ occupation'],['0','peak'],['0','feed limit']];const definitions=['Gas kinetic temperature. It sets the LTE reference but does not set the 3p population.','Departure b₃p = solved 3p fraction ÷ LTE fraction. Above 1 means non-equilibrium enhancement.','Photons per resonant electromagnetic mode. This drives absorption and stimulated emission.','Reduced local H₂/O₂ reaction progress. It supplies heat and the exposed chemical pump.','Active gas-phase neutral Na. Salt activation/speciation is an experimental closure.'];ui.scale.firstElementChild.textContent=labels[params[P.FIELD]][0];ui.scale.lastElementChild.textContent=labels[params[P.FIELD]][1];ui['field-definition'].textContent=definitions[params[P.FIELD]];
  const volumeText=['Color + opacity = local sodium D-line emission. Gray = optical cavity boundary.','Color = gas temperature; opacity emphasizes hot gas. Gray = optical cavity boundary.','Trapped photons are solved as a radiation field (not fake particles): color + opacity = occupation per resonant mode.'];const volumeEnds=[['dark','intense 589 nm'],['300 K','2400 K'],['10⁻⁹','10¹ / mode']];ui['volume-definition'].textContent=volumeText[volumeMode];ui['volume-scale'].className=`volume-scale ${['sodium','thermal','photon'][volumeMode]}`;ui['volume-scale'].firstElementChild.textContent=volumeEnds[volumeMode][0];ui['volume-scale'].lastElementChild.textContent=volumeEnds[volumeMode][1];
}
for(const id of ['power','oxygen','sodium','pressure','reflect','pump','quench','speed','field','volume-field'])ui[id].addEventListener('input',syncControls);
ui.preset.addEventListener('change',()=>{const x=ui.preset.value;if(x==='nai'){ui.sodium.value=130;ui.oxygen.value=80;ui.pump.value=7.6;params[P.SALT]=1;}else if(x==='hps'){ui.sodium.value=300;ui.oxygen.value=21;ui.pump.value=5.8;ui.pressure.value=4;params[P.SALT]=2;}else{ui.sodium.value=80;ui.oxygen.value=38;ui.pump.value=7.3;ui.pressure.value=1.4;params[P.SALT]=0;}syncControls();});

async function main(){
  if(!navigator.gpu)throw new Error('WebGPU is unavailable. Open this page in a current Chrome, Edge, Firefox Nightly, or Safari release over HTTPS or localhost.');
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new Error('No WebGPU adapter was returned by the browser.');
  const device=await adapter.requestDevice();device.lost.then(i=>fail(`GPU device lost: ${i.message}`));device.addEventListener('uncapturederror',e=>fail(`WebGPU validation error: ${e.error.message}`));
  const format=navigator.gpu.getPreferredCanvasFormat();const contexts=[ui.volume,ui.slice].map(c=>c.getContext('webgpu'));contexts.forEach(c=>c.configure({device,format,alphaMode:'opaque'}));
  const state=[0,1].map(()=>device.createBuffer({size:stateBytes,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}));
  const paramBuffer=device.createBuffer({size:params.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const viewBuffers=[0,1].map(()=>device.createBuffer({size:32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}));
  const readback=device.createBuffer({size:stateBytes,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const simModule=device.createShaderModule({code:WGSL});const renderModule=device.createShaderModule({code:RENDER_WGSL});
  const reports=await Promise.all([simModule.getCompilationInfo(),renderModule.getCompilationInfo()]);
  const shaderErrors=reports.flatMap((report,index)=>report.messages.filter(m=>m.type==='error').map(m=>`${index?'render':'compute'}:${m.lineNum}:${m.linePos} ${m.message}`));
  if(shaderErrors.length)throw new Error(`WGSL compilation failed:\n${shaderErrors.join('\n')}`);
  const simLayout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}}]});
  const simPipelineLayout=device.createPipelineLayout({bindGroupLayouts:[simLayout]});
  const [initPipeline,advancePipeline,radiationPipeline]=await Promise.all(['init','advance','radiation'].map(entryPoint=>device.createComputePipelineAsync({layout:simPipelineLayout,compute:{module:simModule,entryPoint}})));
  const pipelines={init:initPipeline,advance:advancePipeline,radiation:radiationPipeline};
  const bind=(a,b)=>device.createBindGroup({layout:simLayout,entries:[{binding:0,resource:{buffer:state[a]}},{binding:1,resource:{buffer:state[b]}},{binding:2,resource:{buffer:paramBuffer}}]});
  const groups=[bind(0,1),bind(1,0)];
  const renderLayout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'read-only-storage'}},{binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'read-only-storage'}},{binding:2,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'read-only-storage'}}]});
  const renderPipelineLayout=device.createPipelineLayout({bindGroupLayouts:[renderLayout]});
  const renderPipelines=await Promise.all(['volume','slice'].map(entryPoint=>device.createRenderPipelineAsync({layout:renderPipelineLayout,vertex:{module:renderModule,entryPoint:'vs'},fragment:{module:renderModule,entryPoint,targets:[{format}]},primitive:{topology:'triangle-list'}})));
  let current=1, frame=0, reading=false;
  function writeParams(){device.queue.writeBuffer(paramBuffer,0,params);}
  function compute(pass,pipeline){pass.setPipeline(pipeline);pass.setBindGroup(0,groups[current===0?0:1]);pass.dispatchWorkgroups(Math.ceil(NX/8),Math.ceil(NZ/8));current=1-current;}
  function initialize(){writeParams();const enc=device.createCommandEncoder();const pass=enc.beginComputePass();pass.setPipeline(pipelines.init);pass.setBindGroup(0,groups[0]);pass.dispatchWorkgroups(Math.ceil(NX/8),Math.ceil(NZ/8));pass.end();device.queue.submit([enc.finish()]);current=1;params[P.TIME]=0;}
  function resize(canvas){const dpr=Math.min(devicePixelRatio,2);const w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}return w/h;}
  async function inspect(){if(reading)return;reading=true;const enc=device.createCommandEncoder();enc.copyBufferToBuffer(state[current],0,readback,0,stateBytes);device.queue.submit([enc.finish()]);await readback.mapAsync(GPUMapMode.READ);const data=new Float32Array(readback.getMappedRange());let best=0,bestT=0,minT=Infinity,maxUpper=0,maxPhotons=0;for(let i=0;i<NX*NZ;i++){const o=i*8;minT=Math.min(minT,data[o]);maxUpper=Math.max(maxUpper,data[o+2]);maxPhotons=Math.max(maxPhotons,data[o+3]);if(data[o]>bestT){bestT=data[o];best=i;}}if(!probePinned){probeR=(best%NX)/(NX-1);probeZ=Math.floor(best/NX)/(NZ-1);}const px=Math.min(NX-1,Math.max(0,Math.round(probeR*(NX-1)))),py=Math.min(NZ-1,Math.max(0,Math.round(probeZ*(NZ-1))));const off=(py*NX+px)*8;const T=data[off],upper=data[off+2],photons=data[off+3],reaction=data[off+6];const rates=rateBalance({temperatureK:T,pressurePa:params[P.PRESSURE],upperFraction:upper,photonDensity:photons,reaction,pumpMax:params[P.PUMP],quenchCoefficient:params[P.QUENCH]});const chk=checkRateBalance(rates);ui['probe-label'].textContent=`${probePinned?'pinned':'hot core'} · r ${(probeR*params[P.R]*1000).toFixed(0)} mm · z ${(probeZ*params[P.L]*1000).toFixed(0)} mm`;ui['r-pump'].textContent=fmtRate(rates.pump);ui['r-abs'].textContent=fmtRate(rates.absorption);ui['r-sp'].textContent=fmtRate(rates.spontaneous);ui['r-stim'].textContent=fmtRate(rates.stimulated);ui['r-q'].textContent=fmtRate(rates.quench);ui['upper-solved'].textContent=upper.toExponential(2);ui['upper-lte'].textContent=rates.lte.toExponential(2);ui.enhancement.textContent=`${(upper/Math.max(rates.lte,1e-30)).toExponential(2)}×`;ui.balance.textContent=`T ${T.toFixed(0)} K · photon occupation ${rates.occupation.toExponential(2)} · local rate residual ${(chk.relativeResidual*100).toFixed(1)}%`;window.__lampStats={minT,bestT,maxUpper,maxPhotons,probe:{r:probeR,z:probeZ,pinned:probePinned},selected:{T,upper,photons,reaction},rates};readback.unmap();reading=false;}
  function tick(){
    syncControls();params[P.TIME]+=paused?0:0.018*params[P.SPEED];writeParams();const enc=device.createCommandEncoder();if(!paused){let pass=enc.beginComputePass();compute(pass,pipelines.advance);for(let i=0;i<10;i++)compute(pass,pipelines.radiation);pass.end();}
    const aspects=[resize(ui.volume),resize(ui.slice)];const views=[new Float32Array([params[P.FIELD],orbit,pitch,aspects[0],probeR,probeZ,volumeMode,0]),new Float32Array([params[P.FIELD],orbit,pitch,aspects[1],probeR,probeZ,volumeMode,0])];
    for(let i=0;i<2;i++){device.queue.writeBuffer(viewBuffers[i],0,views[i]);const bg=device.createBindGroup({layout:renderLayout,entries:[{binding:0,resource:{buffer:state[current]}},{binding:1,resource:{buffer:paramBuffer}},{binding:2,resource:{buffer:viewBuffers[i]}}]});const rp=enc.beginRenderPass({colorAttachments:[{view:contexts[i].getCurrentTexture().createView(),clearValue:{r:.005,g:.006,b:.008,a:1},loadOp:'clear',storeOp:'store'}]});rp.setPipeline(renderPipelines[i]);rp.setBindGroup(0,bg);rp.draw(3);rp.end();}
    device.queue.submit([enc.finish()]);ui['sim-time'].value=`${(params[P.TIME]).toFixed(2)} ms model time`;if(frame++%45===0)inspect();requestAnimationFrame(tick);
  }
  ui.reset.addEventListener('click',()=>{probePinned=false;initialize();});ui.pause.addEventListener('click',()=>{paused=!paused;ui.pause.textContent=paused?'Resume':'Pause';});
  ui.volume.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;ui.volume.setPointerCapture(e.pointerId)});ui.volume.addEventListener('pointermove',e=>{if(!dragging)return;orbit+=(e.clientX-lastX)*.008;pitch=Math.max(-.65,Math.min(.65,pitch-(e.clientY-lastY)*.006));lastX=e.clientX;lastY=e.clientY});ui.volume.addEventListener('pointerup',()=>dragging=false);
  ui.slice.addEventListener('pointerdown',e=>{const rect=ui.slice.getBoundingClientRect();probePinned=true;probeR=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));probeZ=Math.max(0,Math.min(1,1-(e.clientY-rect.top)/rect.height));inspect();});
  initialize();ui['gpu-status'].textContent=`WebGPU · ${NX}×${NZ} · coupled non-LTE`;ui['gpu-status'].classList.add('ok');tick();
}
function fail(error){console.error(error);if(!ui.fatal.hidden)return;ui.fatal.hidden=false;ui.fatal.textContent=`Sodium Lamp could not start.\n\n${error.message||error}`;ui['gpu-status'].textContent='WebGPU failed';ui['gpu-status'].classList.add('error');}
syncControls();main().catch(fail);
