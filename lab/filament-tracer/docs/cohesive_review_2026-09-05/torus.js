/* Display interpolation of verified native fields. Prediction arrays are not used here. */
(()=>{
 const e=id=>document.getElementById(id),panel=e('torus-panel');if(!panel)return;
 const canvas=e('torus-canvas'),overlay=e('torus-overlay');
 const gl=canvas.getContext('webgl2',{antialias:true,preserveDrawingBuffer:true,alpha:false});
 let d=null,loading=null,t=1,yaw=0,pitch=24*Math.PI/180,zoom=1,timer=null,drag=null,groups=[],ready=false,serial=0,currentValues=null;
 let pan=[0,0],volume=null;const insideCamera=new TorusCamera();
 const cache=new Map(),root='../cohesive_review_2026-09-05/torus-smooth/';
 const settings=()=>({field:e('torus-field').value,row:+e('torus-row').value,mode:e('torus-mode').value,view:e('torus-view').value,volume:e('torus-rendering').value==='volume',angle:+e('torus-angle').value,arc:+e('torus-arc').value});
 const fmt=x=>Number(x).toPrecision(3),decode=s=>new Float64Array(Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer);
 const color=(v,L)=>BEN_RDBU[Math.max(0,Math.min(255,Math.floor((Math.max(-1,Math.min(1,v/L))+1)*128)))];
 function stop(){clearTimeout(timer);timer=null;e('torus-play').textContent='▶ Play';}
 if(!gl){e('torus-time').textContent='The 3D renderer could not initialize.';return;}
 function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
 const program=gl.createProgram();
 gl.attachShader(program,shader(gl.VERTEX_SHADER,`#version 300 es
 precision highp float;in vec3 position;in vec2 uv;out vec2 coords;uniform vec4 camera;uniform vec2 scale;uniform vec2 pan;uniform bool poloidal;uniform bool verify;uniform bool inside;uniform vec3 eye;uniform vec3 forward;uniform vec3 right;uniform vec3 up;uniform float aspect;
 void main(){coords=uv;if(verify){gl_Position=vec4(position.xy,0.,1.);return;}if(inside){vec3 v=position-eye;float depth=dot(v,forward);gl_Position=vec4(dot(v,right)*1.7320508075688772/aspect,dot(v,up)*1.7320508075688772,1.000200020002*depth-.00400040004,depth);return;}float u,v,q;if(poloidal){u=position.x-.85;v=position.z+.2;q=0.;}else{u=camera.x*position.x-camera.y*position.y;float dep=camera.y*position.x+camera.x*position.y;v=camera.z*(position.z+.2)+camera.w*dep-.18;q=camera.z*dep-camera.w*(position.z+.2);}gl_Position=vec4((u+pan.x)*scale.x,(v+pan.y)*scale.y,q*.2,1.);}`));
 gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`#version 300 es
 precision highp float;in vec2 coords;out vec4 outColor;
 uniform sampler2D values;uniform sampler2D palette;uniform sampler2D shifts;
 uniform bool periodic;uniform bool wire;uniform bool verify;uniform float limit;uniform int row;uniform float cutPhi;
 float sinc(float a){return abs(a)<.001?1.-a*a/6.:sin(a)/a;}
 float atRow(int x,float y,float phi){
  int lo=min(31,int(floor(y)));float w=y-float(lo),ds=texelFetch(shifts,ivec2(lo,x),0).r;
  float base=5.*(phi-ds*w),dx=5.*(dFdx(phi)-ds*dFdx(y)),dy=5.*(dFdy(phi)-ds*dFdy(y)),v=0.;
  for(int k=0;k<41;k++){
   vec2 a=mix(texelFetch(values,ivec2(k,x*32+lo),0).rg,texelFetch(values,ivec2(k+41,x*32+lo),0).rg,w);
   float phase=float(k)*base,attenuation=verify?1.:sinc(float(k)*dx*.5)*sinc(float(k)*dy*.5);
   v+=(k==0?1.:2.)*(a.x*cos(phase)-a.y*sin(phase))*attenuation;
  }return v;
 }
 void main(){
  if(wire){outColor=vec4(.75,.82,.85,1.);return;}
  float y=verify?floor(coords.y*32.):clamp(coords.y*31.,0.,31.);
  float phi=verify?floor(coords.x*81.)*6.283185307179586/(5.*81.):coords.x*6.283185307179586/5.;
  float v;
  if(periodic)v=atRow(row,y,phi);
  else{float x=verify?floor(coords.x*48.):clamp(coords.x*47.,0.,47.);int low=int(floor(x));v=mix(atRow(low,y,cutPhi),atRow(min(47,low+1),y,cutPhi),fract(x));}
  if(verify){outColor=vec4(v,0.,0.,1.);return;}
  int c=clamp(int(floor((clamp(v/limit,-1.,1.)+1.)*128.)),0,255);outColor=texelFetch(palette,ivec2(c,0),0);
 }`));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 const loc={};for(const n of ['camera','scale','pan','poloidal','values','palette','periodic','wire','limit','row','cutPhi','shifts','verify','inside','eye','forward','right','up','aspect'])loc[n]=gl.getUniformLocation(program,n);
 const pos=gl.getAttribLocation(program,'position'),uv=gl.getAttribLocation(program,'uv');
 const coefficientTexture=gl.createTexture(),shiftTexture=gl.createTexture();
 const palette=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,palette);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB8,256,1,0,gl.RGB,gl.UNSIGNED_BYTE,new Uint8Array(BEN_RDBU.flat()));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
 function group(points,uvs,nr,nc,periodic,name){
  const indices=[],lines=[];for(let i=0;i<nr-1;i++)for(let j=0;j<nc-1;j++){const a=i*nc+j,b=a+nc;indices.push(a,b,b+1,a,b+1,a+1);}
  for(let i=0;i<nr;i++)for(let j=0;j<nc-1;j++)if(i%16===0)lines.push(i*nc+j,i*nc+j+1);
  for(let j=0;j<nc;j++)for(let i=0;i<nr-1;i++)if(j%(periodic?8:4)===0)lines.push(i*nc+j,(i+1)*nc+j);
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);const buffers=[];
  for(const [data,at,size] of [[points,pos,3],[uvs,uv,2]]){const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,size,gl.FLOAT,false,0,0);}
  const ib=gl.createBuffer(),lb=gl.createBuffer();for(const [b,a] of [[ib,indices],[lb,lines]]){gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(a),gl.STATIC_DRAW);}
  gl.bindVertexArray(null);return {vao,ib,lb,buffers,triangles:indices.length,lines:lines.length,texture:gl.createTexture(),periodic,name};
 }
 function buildMesh(){
  for(const g of groups){gl.deleteVertexArray(g.vao);[g.ib,g.lb,...g.buffers].forEach(b=>gl.deleteBuffer(b));gl.deleteTexture(g.texture);}groups=[];
  const s=settings(),ny=d.ny,row=s.row-16;
  if(s.view==='torus'){
   const np=Math.ceil(s.arc*2.25)+1,p=[],u=[];for(let j=0;j<ny;j++)for(let z=0;z<np;z++){const phi=(s.angle+z*s.arc/(np-1))*Math.PI/180,i=row*ny+j;p.push(d.R[i]*Math.cos(phi),d.R[i]*Math.sin(phi),d.Z[i]);u.push(phi*5/(2*Math.PI),j/(ny-1));}
   groups.push(group(p,u,ny,np,true,'surface'));
  }
  for(const [side,phi] of (s.view==='torus'?(s.arc===360?[]:[[0,s.angle*Math.PI/180],[1,(s.angle+s.arc)*Math.PI/180]]):[[0,s.angle*Math.PI/180]])){
   const nx=s.view==='torus'?row+1:48;if(nx<2)continue;const p=[],u=[];
   for(let j=0;j<ny;j++)for(let x=0;x<nx;x++){const i=x*ny+j;p.push(d.R[i]*(s.view==='poloidal'?1:Math.cos(phi)),s.view==='poloidal'?0:d.R[i]*Math.sin(phi),d.Z[i]);u.push(x/47,j/(ny-1));}
   groups.push(Object.assign(group(p,u,ny,nx,false,'cut'+side),{phi}));
  }
 }
 let cs,ss,phaseC,phaseS;
 function kernels(){
  cs=new Float64Array(162*41);ss=new Float64Array(cs.length);
  for(let z=0;z<162;z++)for(let k=0;k<41;k++){const a=2*Math.PI*z*k/162;cs[z*41+k]=Math.cos(a);ss[z*41+k]=Math.sin(a);}
  phaseC=new Float64Array(48*d.ny*41);phaseS=new Float64Array(phaseC.length);
  for(let x=0;x<48;x++)for(let y=0;y<d.ny;y++)for(let k=0;k<41;k++){const i=(x*d.ny+y)*41+k,a=5*k*d.shift[x*d.ny+y];phaseC[i]=Math.cos(a);phaseS[i]=Math.sin(a);}
 }
 function interpolate(a,row){
  const ny=d.ny,cut0=new Float32Array(ny*48),cut1=new Float32Array(ny*48),fr=new Float64Array(ny*41),fi=new Float64Array(fr.length);
  for(let x=0;x<48;x++)for(let y=0;y<ny;y++){
   const yy=y/16,lo=Math.min(30,Math.floor(yy)),w=yy-lo;let v0=0,v1=0;
   for(let k=0;k<41;k++){
    const i=((x*32+lo)*41+k)*2,hi=i+82,phase=(x*ny+y)*41+k;
    const ar=a[i]*(1-w)+a[hi]*w,ai=a[i+1]*(1-w)+a[hi+1]*w;
    const re=ar*phaseC[phase]+ai*phaseS[phase],im=ai*phaseC[phase]-ar*phaseS[phase],weight=k?2:1;
    v0+=weight*re;v1+=weight*re*(k%2?-1:1);
    if(x===row){fr[y*41+k]=weight*re;fi[y*41+k]=weight*im;}
   }
   cut0[y*48+x]=v0;cut1[y*48+x]=v1;
  }
  const surface=new Float32Array(ny*162);
  for(let y=0;y<ny;y++)for(let z=0;z<162;z++){let v=0;for(let k=0;k<41;k++)v+=fr[y*41+k]*cs[z*41+k]-fi[y*41+k]*ss[z*41+k];surface[y*162+z]=v;}
  return {surface,cut0,cut1};
 }
 async function coefficients(){const s=settings(),key=`${s.field}-${s.mode}-${String(t).padStart(2,'0')}`;if(cache.has(key))return cache.get(key);
  const r=await fetch(root+key+'.bin');if(!r.ok)throw Error('Could not load verified frame '+d.frames[t]);const a=new Float32Array(await r.arrayBuffer());if(a.length!==48*32*41*2)throw Error('Invalid coefficient dimensions');cache.set(key,a);if(cache.size>8)cache.delete(cache.keys().next().value);return a;}
 function upload(a){
  const packed=new Float32Array(48*32*82*2);
  for(let x=0;x<48;x++)for(let y=0;y<32;y++)for(let k=0;k<41;k++){
   const ph=(x*d.ny+y*16)*41+k,c=phaseC[ph],s=phaseS[ph];
   for(let side=0;side<2;side++){
    const i=((x*32+Math.min(31,y+side))*41+k)*2,j=((x*32+y)*82+side*41+k)*2;
    packed[j]=a[i]*c+a[i+1]*s;packed[j+1]=a[i+1]*c-a[i]*s;
   }
  }
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,coefficientTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RG32F,82,48*32,0,gl.RG,gl.FLOAT,packed);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
 }
 function uploadShifts(){
  const a=new Float32Array(48*32);for(let x=0;x<48;x++)for(let y=0;y<31;y++)a[x*32+y]=d.shift[x*d.ny+(y+1)*16]-d.shift[x*d.ny+y*16];
  gl.bindTexture(gl.TEXTURE_2D,shiftTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,32,48,0,gl.RED,gl.FLOAT,a);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
 }

 function scale(w,h){const pol=settings().view==='poloidal',k=Math.min(w/(pol?.85:2.65),h/(pol?1.2:1.35))*zoom;return [2*k/w,2*k/h];}
 function render(){
  if(!ready)return;const s=settings(),L=s.mode==='relative'?.12:d.fields[s.field].limit;
  if(s.volume&&volume?.valid){volume.render({width:canvas.width,height:canvas.height,camera:insideCamera,orbit:[Math.cos(yaw),Math.sin(yaw),Math.cos(pitch),Math.sin(pitch)],scale:scale(canvas.width,canvas.height),pan,limit:L,opacity:+e('torus-opacity').value,palette,cut:[s.angle*Math.PI/180,s.arc*Math.PI/180]});drawOverlay();navigationLabels();return;}
  gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(16/255,17/255,23/255,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.useProgram(program);
  gl.uniform2fv(loc.pan,pan);const basis=insideCamera.basis();gl.uniform1i(loc.inside,insideCamera.enabled&&s.view==='torus');gl.uniform3fv(loc.eye,insideCamera.eye);gl.uniform3fv(loc.forward,basis.forward);gl.uniform3fv(loc.right,basis.right);gl.uniform3fv(loc.up,basis.up);gl.uniform1f(loc.aspect,canvas.width/canvas.height);
  gl.uniform4f(loc.camera,Math.cos(yaw),Math.sin(yaw),Math.cos(pitch),Math.sin(pitch));gl.uniform2fv(loc.scale,scale(canvas.width,canvas.height));gl.uniform1i(loc.poloidal,s.view==='poloidal');gl.uniform1f(loc.limit,L);gl.uniform1i(loc.values,0);gl.uniform1i(loc.verify,0);gl.uniform1i(loc.row,s.row-16);gl.uniform1i(loc.shifts,2);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,shiftTexture);gl.uniform1i(loc.palette,1);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,palette);gl.activeTexture(gl.TEXTURE0);
  for(const g of groups){gl.bindVertexArray(g.vao);gl.bindTexture(gl.TEXTURE_2D,coefficientTexture);gl.uniform1f(loc.cutPhi,g.phi||0);gl.uniform1i(loc.periodic,g.periodic);gl.uniform1i(loc.wire,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,g.ib);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);gl.drawElements(gl.TRIANGLES,g.triangles,gl.UNSIGNED_INT,0);gl.disable(gl.POLYGON_OFFSET_FILL);if(e('torus-wire').checked){gl.uniform1i(loc.wire,1);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,g.lb);gl.drawElements(gl.LINES,g.lines,gl.UNSIGNED_INT,0);}}
  gl.bindVertexArray(null);drawOverlay();navigationLabels();
 }
 function point(R,Z,phi,w,h){const s=settings(),X=R*Math.cos(phi),Y=R*Math.sin(phi),ca=Math.cos(yaw),sa=Math.sin(yaw),ce=Math.cos(pitch),se=Math.sin(pitch);let u,v;
  if(insideCamera.enabled&&s.view==='torus')return insideCamera.project([X,Y,Z],w,h);
  if(s.view==='poloidal'){u=R-.85;v=Z+.2;}else{u=ca*X-sa*Y;v=ce*(Z+.2)+se*(sa*X+ca*Y)-.18;}const sc=scale(w,h);return [((u+pan[0])*sc[0]+1)*w/2,(1-(v+pan[1])*sc[1])*h/2];}
 function drawOverlay(){
  const ctx=overlay.getContext('2d'),w=overlay.width,h=overlay.height;ctx.clearRect(0,0,w,h);if(!d)return;
  const s=settings(),size=Math.max(11,w/85);ctx.font=`600 ${size}px "Source Sans 3",sans-serif`;ctx.fillStyle='#e7e8ed';
  const heading=(s.volume?`${insideCamera.enabled?'Inside plasma':`${s.arc}° plasma volume`} · SOL x=16–63`:s.view==='torus'?`Surface x=${s.row} · ζ=${s.angle}° · arc ${s.arc}°`:`Poloidal cut · ζ=${s.angle}° · R horizontal, Z vertical`)+(!insideCamera.enabled&&zoom>1.05?` · ${zoom.toFixed(1)}× zoom`:'');
  ctx.fillStyle='rgba(16,17,23,.84)';ctx.fillRect(w*.016,h*.015,Math.max(ctx.measureText(heading).width,w*.48)+w*.025,h*.09);ctx.fillStyle='#e7e8ed';ctx.fillText(heading,w*.025,h*.05);
  ctx.font=`${Math.max(10,w/100)}px "Source Sans 3",sans-serif`;ctx.fillText(s.volume?'Same field · transparency for visualization':'New refined grid · display interpolation along B',w*.025,h*.09);
  if(s.volume)return;
  if(s.view==='poloidal'){
   const left=point(.48,-.71,0,w,h),right=point(1.22,-.71,0,w,h),top=point(.48,.3,0,w,h),tick=size*.4;
   ctx.strokeStyle='#87939f';ctx.lineWidth=Math.max(1,w/1600);ctx.beginPath();ctx.moveTo(...top);ctx.lineTo(...left);ctx.lineTo(...right);ctx.stroke();ctx.fillStyle='#c4ccd5';ctx.textAlign='center';
   for(const R of [.6,.8,1,1.2]){const p=point(R,-.71,0,w,h);ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(p[0],p[1]+tick);ctx.stroke();ctx.fillText(R.toFixed(1),p[0],p[1]+size*1.5);}
   ctx.fillText('R (m)',(left[0]+right[0])/2,Math.min(h*.988,left[1]+size*3));ctx.textAlign='right';
   for(const Z of [-.6,-.4,-.2,0,.2]){const p=point(.48,Z,0,w,h);ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(p[0]-tick,p[1]);ctx.stroke();ctx.fillText(Z.toFixed(1),p[0]-size*.8,p[1]+size*.3);}
   ctx.save();ctx.translate(left[0]-size*4,(left[1]+top[1])/2);ctx.rotate(-Math.PI/2);ctx.textAlign='center';ctx.fillText('Z (m)',0,0);ctx.restore();ctx.textAlign='left';
  }
  for(const [y,label] of [[0,'Inner y=0'],[18,'Upstream y=18'],[31,'Outer y=31']]){
   const i=(s.row-16)*d.ny+y*16,p=point(d.R[i],d.Z[i],s.angle*Math.PI/180,w,h);if(!p||p[0]<0||p[0]>w||p[1]<h*.12||p[1]>h*.96)continue;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(...p,Math.max(2,w/450),0,Math.PI*2);ctx.fill();
   const tw=ctx.measureText(label).width,tx=Math.max(w*.025,Math.min(w*.975-tw,p[0]+(y===0?-tw-15:12))),ty=p[1]+(y===0?-12:y===31?25:-14);ctx.fillStyle='rgba(16,17,23,.88)';ctx.fillRect(tx-3,ty-size,tw+6,size*1.35);ctx.fillStyle='#e7e8ed';ctx.fillText(label,tx,ty);
  }
 }
 function resize(){const box=canvas.getBoundingClientRect();if(!box.width)return;const ratio=Math.min(devicePixelRatio||1,2);canvas.width=overlay.width=Math.round(box.width*ratio);canvas.height=overlay.height=Math.round(box.height*ratio);render();}
 function quantity(){const s=settings();return s.mode==='relative'?'(nₑ − ⟨nₑ⟩ζ) / ⟨nₑ⟩ζ · dimensionless':(s.field==='Ne'?'nₑ':'Tₑ')+' − toroidal row mean ('+d.fields[s.field].unit+')';}
 function labels(){
  const s=settings(),compare=e('torus-compare').checked,L=s.mode==='relative'?.12:d.fields[s.field].limit;
  e('torus-row').disabled=s.view==='poloidal'||s.volume;e('torus-rendering').disabled=s.view==='poloidal';e('torus-wire').disabled=s.volume;e('torus-field').disabled=compare;e('torus-mode').disabled=compare;e('torus-mode').querySelector('[value=relative]').disabled=s.field!=='Ne';e('torus-volume-note').hidden=!s.volume;
  e('torus-view').querySelector('[value=torus]').textContent='Toroidal cutaway';e('torus-view').querySelector('[value=poloidal]').textContent='Poloidal cross-section';e('torus-angle-label').textContent=s.angle+'°';e('torus-arc-label').textContent=s.arc+'°';e('torus-arc').disabled=s.view==='poloidal';canvas.dataset.cut=JSON.stringify({angle:s.angle,arc:s.arc});
  e('torus-frame').min=compare?'1':'0';e('torus-frame').step=compare?'2':'1';e('torus-frame').value=t;
  e('torus-time').textContent=`${d.time_ms[t].toFixed(4)} ms · frame ${d.frames[t]}`;e('torus-quantity').textContent=quantity();
  e('torus-note').textContent=s.mode==='relative'?'Fixed ±0.12, matching Ben’s density-fraction scale.':'Same fixed limits as the controlled outer-target '+(s.field==='Te'?'temperature':'density')+' movie.';
  const ctx=e('torus-legend').getContext('2d');for(let i=0;i<512;i++){ctx.fillStyle='rgb('+color((i/511*2-1)*L,L).join(',')+')';ctx.fillRect(i,0,1,14);}e('torus-legend-ticks').innerHTML=[-L,0,L].map(v=>'<span>'+fmt(v)+'</span>').join('');
  navigationLabels();
  e('torus-probe').textContent=`Native grid: x=16–63, y=0–31, z=0–80. ${s.volume?'All 48 SOL rows fill the volume; the core is outside this displayed data. ':s.view==='torus'?'Surface at native x='+s.row+' (raw '+(s.row+2)+'). ':''}The fine display samples are interpolated; native prediction cells are unchanged.`;
  canvas.setAttribute('aria-label',`${s.volume?`${s.arc} degree plasma volume from toroidal angle ${s.angle}, all available SOL rows`:s.view==='torus'?`${s.arc} degree toroidal surface from angle ${s.angle}, radial surface ${s.row}`:`Poloidal cut at toroidal angle ${s.angle} degrees`}; ${quantity()}; simulation frame ${d.frames[t]}; verified refined mesh; field-following interpolation.`);canvas.dataset.frame=d.frames[t];canvas.dataset.ready='true';canvas.dataset.triangles=groups.reduce((a,g)=>a+g.triangles/3,0);
  e('torus-ben-reference').hidden=!compare;if(compare){e('torus-ben-image').src='../ben_surface_audit_2026-09-05/matched-'+String((t-1)/2+1).padStart(2,'0')+'.png';e('torus-ben-time').textContent=`Ben’s original · same time ${d.time_ms[t].toFixed(4)} ms`;}e('torus-save').disabled=false;
 }
 function verifyGPU(a,row){
  if(!gl.getExtension('EXT_color_buffer_float'))throw Error('Float framebuffer unavailable for GPU verification');
  const fb=gl.createFramebuffer(),tex=gl.createTexture(),quad=group([-1,-1,0,1,-1,0,-1,1,0,1,1,0],[0,0,1,0,0,1,1,1],2,2,false,'verify');
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.useProgram(program);gl.uniform1i(loc.verify,1);gl.uniform1i(loc.wire,0);gl.uniform1i(loc.row,row);gl.disable(gl.DEPTH_TEST);gl.bindVertexArray(quad.vao);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,quad.ib);let err=0,count=0;
  gl.uniform1i(loc.values,0);gl.uniform1i(loc.shifts,2);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,coefficientTexture);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,shiftTexture);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,tex);
  const s=settings(),angles=[0,Math.PI,s.angle*Math.PI/180,(s.angle+s.arc)*Math.PI/180];
  for(const [surface,phi] of [[true,0],...angles.map(phi=>[false,phi])]){
   const width=surface?81:48;gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,width,32,0,gl.RGBA,gl.FLOAT,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete verification framebuffer');
   gl.viewport(0,0,width,32);gl.uniform1i(loc.periodic,surface);gl.uniform1f(loc.cutPhi,phi);gl.drawElements(gl.TRIANGLES,quad.triangles,gl.UNSIGNED_INT,0);
   const pixels=new Float32Array(width*32*4);gl.readPixels(0,0,width,32,gl.RGBA,gl.FLOAT,pixels);
   const weights=Array.from({length:81},(_,z)=>{const theta=5*phi-z*2*Math.PI/81,den=Math.sin(theta/2);return Math.abs(den)<1e-10?1:Math.sin(81*theta/2)/(81*den);});
   for(let y=0;y<32;y++)for(let j=0;j<width;j++){let expected;if(surface)expected=a[(row*32+y)*81+j];else{expected=0;for(let z=0;z<81;z++)expected+=weights[z]*a[(j*32+y)*81+z];}err=Math.max(err,Math.abs(pixels[(y*width+j)*4]-expected));count++;}
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(fb);gl.deleteTexture(tex);gl.deleteTexture(quad.texture);gl.deleteVertexArray(quad.vao);[quad.ib,quad.lb,...quad.buffers].forEach(b=>gl.deleteBuffer(b));render();
  return {count,max_abs_error:err,passed:err<2e-4};
 }
 async function verifyNative(v){
  if(!new URLSearchParams(location.search).has('verify_mesh')||![1,47].includes(t))return;
  const s=settings(),key=`${s.field}-${s.mode}-${String(t).padStart(2,'0')}`,r=await fetch('../mesh_repair_2026-09-07/check-'+key+'.bin');if(!r.ok)throw Error('Missing independent native reference');
  const a=new Float64Array(await r.arrayBuffer());let err=0,count=0;
  for(let y=0;y<32;y++)for(let z=0;z<81;z++){err=Math.max(err,Math.abs(v.surface[y*16*162+z*2]-a[((s.row-16)*32+y)*81+z]));count++;}
  for(let x=0;x<48;x++)for(let y=0;y<32;y++){err=Math.max(err,Math.abs(v.cut0[y*16*48+x]-a[(x*32+y)*81]),Math.abs(v.cut1[y*16*48+x]-a[48*32*81+x*32+y]));count+=2;}
  const gpu=verifyGPU(a,s.row-16),result={passed:err<2e-5&&gpu.passed,key,row:s.row,view:s.view,count,max_abs_error:err,gpu,webgl_error:gl.getError()};result.passed=result.passed&&result.webgl_error===0;canvas.dataset.validation=JSON.stringify(result);if(!result.passed)throw Error('Browser native-value check failed');
  if(s.volume){const check=volume.verify(a),mesh=volume.verifyMesh();check.passed=check.passed&&check.webgl_error===0&&mesh.passed;canvas.dataset.volumeValidation=JSON.stringify({...check,key,mesh});render();if(!check.passed)throw Error('Volume native-value check failed');}
 }
 async function draw(rebuild=false){if(!d)return;const ticket=++serial;e('torus-save').disabled=true;canvas.dataset.ready='false';delete canvas.dataset.validation;delete canvas.dataset.volumeValidation;try{const a=await coefficients();if(ticket!==serial)return;if(rebuild||!groups.length)buildMesh();upload(a);if(settings().volume){if(!volume)volume=new TorusVolume(gl,d);volume.upload(coefficientTexture,shiftTexture);}ready=true;labels();render();await verifyNative(new URLSearchParams(location.search).has('verify_mesh')?interpolate(a,settings().row-16):null);}catch(err){e('torus-time').textContent=err.message;console.error(err);stop();}}
 async function init(){if(d){resize();return;}if(loading)return loading;loading=(async()=>{const r=await fetch(root+'meta.json');if(!r.ok)throw Error('Unable to load verified mesh');d=await r.json();d.R=decode(d.R);d.Z=decode(d.Z);d.shift=decode(d.shift);kernels();uploadShifts();e('torus-frame').value=t;e('torus-play').disabled=false;resize();await draw(true);})();return loading;}
 panel.addEventListener('toggle',()=>{if(panel.open)init().catch(err=>{e('torus-time').textContent=err.message;console.error(err);});else stop();});
 new ResizeObserver(resize).observe(canvas);new MutationObserver(()=>{if(e('geometry-view').hidden)stop();else if(panel.open)init();}).observe(e('geometry-view'),{attributes:true,attributeFilter:['hidden']});
 for(const id of ['torus-field','torus-mode','torus-row','torus-view'])e(id).onchange=()=>{stop();if(id==='torus-view'){insideCamera.enabled=false;zoom=1;pan=[0,0];if(settings().view==='poloidal')e('torus-rendering').value='surface';}if(e('torus-field').value==='Te')e('torus-mode').value='physical';draw(id==='torus-row'||id==='torus-view');};
 for(const id of ['torus-angle','torus-arc'])e(id).oninput=()=>{if(!ready)return;stop();e('torus-compare').checked=false;buildMesh();labels();render();};
 e('torus-rendering').onchange=()=>{stop();if(settings().volume){e('torus-compare').checked=false;enterPlasma();}else resetView();draw(true);};e('torus-opacity').oninput=render;
 e('torus-wire').onchange=render;e('torus-compare').onchange=()=>{stop();if(e('torus-compare').checked){e('torus-rendering').value='surface';e('torus-angle').value=0;e('torus-arc').value=180;insideCamera.enabled=false;zoom=1;pan=[0,0];e('torus-field').value='Ne';e('torus-mode').value='relative';if(t%2===0)t++;}draw(true);};
 e('torus-frame').oninput=()=>{stop();t=+e('torus-frame').value;if(e('torus-compare').checked&&t%2===0)t=Math.min(47,t+1);draw();};
 e('torus-play').onclick=()=>{if(timer)return stop();e('torus-play').textContent='Ⅱ Pause';const tick=async()=>{if(timer===null)return;t=(t+(e('torus-compare').checked?2:1))%48;await draw();if(timer!==null)timer=setTimeout(tick,120);};timer=setTimeout(tick,120);};
 function navigationLabels(){
  const inside=insideCamera.enabled,pol=settings().view==='poloidal';e('torus-inside').disabled=pol||!ready;e('torus-inside').textContent=inside?'Overview':'Enter plasma';e('torus-inside').setAttribute('aria-pressed',String(inside));
  e('torus-tools-note').textContent=inside?'Scroll toward cursor · drag to look · Shift-drag to pan':zoom>1.05||pol?'Scroll over a section to zoom · drag to pan · Alt-drag to rotate':'Scroll over a section to zoom · drag to rotate';
  canvas.dataset.navigation=inside?'inside':'overview';canvas.dataset.rendering=settings().volume?'volume':'surface';canvas.dataset.zoom=zoom;canvas.dataset.pan=JSON.stringify(pan);canvas.dataset.camera=JSON.stringify({eye:insideCamera.eye,heading:insideCamera.heading,tilt:insideCamera.tilt});
 }
 function resetView(){insideCamera.enabled=false;zoom=1;pan=[0,0];yaw=0;pitch=24*Math.PI/180;render();}
 function zoomAt(factor,px,py){
  const box=canvas.getBoundingClientRect(),w=box.width,h=box.height,oldK=scale(w,h)[0]*w/2;
  zoom=Math.max(.6,Math.min(64,zoom*factor));const newK=scale(w,h)[0]*w/2;
  pan[0]+=(px-w/2)*(1/newK-1/oldK);pan[1]+=(h/2-py)*(1/newK-1/oldK);render();
 }
 function dollyAt(distance,px,py){
  const box=canvas.getBoundingClientRect(),b=insideCamera.basis(),nx=(2*px/box.width-1)*(box.width/box.height)/Math.sqrt(3),ny=(1-2*py/box.height)/Math.sqrt(3),ray=b.forward.map((v,i)=>v+nx*b.right[i]+ny*b.up[i]),len=Math.hypot(...ray);
  insideCamera.eye=insideCamera.eye.map((v,i)=>v+distance*ray[i]/len);render();
 }
 function enterPlasma(){const i=23*d.ny+18*16,s=settings(),phi=s.angle*Math.PI/180+Math.min(.25,s.arc*Math.PI/360);insideCamera.eye=[d.R[i]*Math.cos(phi),d.R[i]*Math.sin(phi),d.Z[i]];insideCamera.heading=phi+Math.PI/2;insideCamera.tilt=0;insideCamera.enabled=true;}
 e('torus-inside').onclick=()=>{
  if(insideCamera.enabled)return resetView();
  stop();e('torus-rendering').value='volume';e('torus-compare').checked=false;enterPlasma();draw(true);canvas.focus({preventScroll:true});
 };
 e('torus-reset').onclick=resetView;
 canvas.onpointerdown=ev=>{canvas.focus({preventScroll:true});drag={x:ev.clientX,y:ev.clientY,pan:insideCamera.enabled?ev.shiftKey:!ev.altKey&&(zoom>1.05||ev.shiftKey||settings().view==='poloidal')};canvas.setPointerCapture(ev.pointerId);};
 canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=()=>drag=null;
 canvas.onpointermove=ev=>{
  if(!drag)return;const dx=ev.clientX-drag.x,dy=ev.clientY-drag.y;
  if(insideCamera.enabled){if(drag.pan){const b=insideCamera.basis();insideCamera.eye=insideCamera.eye.map((v,i)=>v+(-dx*b.right[i]+dy*b.up[i])*.0008);}else insideCamera.look(dx,dy);}
  else if(drag.pan){const box=canvas.getBoundingClientRect(),k=scale(box.width,box.height)[0]*box.width/2;pan[0]+=dx/k;pan[1]-=dy/k;}
  else{yaw+=dx*.008;pitch=Math.max(-1.3,Math.min(1.3,pitch+dy*.006));}
  drag.x=ev.clientX;drag.y=ev.clientY;render();
 };
 canvas.addEventListener('wheel',ev=>{
  ev.preventDefault();const box=canvas.getBoundingClientRect(),delta=ev.deltaY*(ev.deltaMode===1?16:ev.deltaMode===2?400:1),px=ev.clientX-box.left,py=ev.clientY-box.top;
  if(insideCamera.enabled)dollyAt(-Math.max(-300,Math.min(300,delta))*.0008,px,py);else zoomAt(Math.exp(-Math.max(-500,Math.min(500,delta))*.002),px,py);
 },{passive:false});
 canvas.onkeydown=ev=>{
  if(ev.metaKey||ev.ctrlKey||ev.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','Escape'].includes(ev.key))return;ev.preventDefault();
  if(ev.key==='Escape')return resetView();const box=canvas.getBoundingClientRect();
  if(['+','-','='].includes(ev.key)){if(insideCamera.enabled)dollyAt(ev.key==='-'?-.04:.04,box.width/2,box.height/2);else zoomAt(ev.key==='-'?1/1.25:1.25,box.width/2,box.height/2);return;}
  if(insideCamera.enabled)insideCamera.look(ev.key==='ArrowLeft'?-12:ev.key==='ArrowRight'?12:0,ev.key==='ArrowUp'?-12:ev.key==='ArrowDown'?12:0);
  else if(zoom>1.05||settings().view==='poloidal'){pan[0]+=(ev.key==='ArrowLeft'?.08:ev.key==='ArrowRight'?-.08:0)/zoom;pan[1]+=(ev.key==='ArrowUp'?-.08:ev.key==='ArrowDown'?.08:0)/zoom;}
  else{if(ev.key==='ArrowLeft')yaw-=.1;if(ev.key==='ArrowRight')yaw+=.1;if(ev.key==='ArrowUp')pitch=Math.min(1.3,pitch+.08);if(ev.key==='ArrowDown')pitch=Math.max(-1.3,pitch-.08);}render();
 };
 e('torus-save').onclick=()=>{stop();const c=document.createElement('canvas');c.width=3840;c.height=2700;const ctx=c.getContext('2d'),s=settings(),L=s.mode==='relative'?.12:d.fields[s.field].limit;
  canvas.width=overlay.width=3840;canvas.height=overlay.height=2080;render();gl.finish();ctx.fillStyle='#101117';ctx.fillRect(0,0,3840,2700);ctx.drawImage(canvas,0,180);ctx.drawImage(overlay,0,180);resize();
  ctx.fillStyle='#e7e8ed';ctx.font='600 48px "Source Sans 3",sans-serif';ctx.fillText('Figure 13 · TCV 85604 · refined mesh',90,80);ctx.font='34px "Source Sans 3",sans-serif';ctx.fillText(`${d.time_ms[t].toFixed(4)} ms · frame ${d.frames[t]} · simulation truth`,90,137);
  ctx.textAlign='center';ctx.fillText(quantity(),1920,2290);for(let i=0;i<1024;i++){ctx.fillStyle='rgb('+color((i/1023*2-1)*L,L).join(',')+')';ctx.fillRect(896+i*2,2330,3,28);}ctx.fillStyle='#e7e8ed';[-L,0,L].forEach((v,i)=>ctx.fillText(fmt(v),896+i*1024,2410));ctx.textAlign='left';ctx.font='29px "Source Sans 3",sans-serif';
  ctx.fillText('New supplied R/Z mesh. PCHIP geometry; Fourier interpolation along B between poloidal planes.',90,2500);ctx.fillText(s.volume?`SOL volume x=16–63; ζ=${s.angle}°, arc=${s.arc}°. Transparency is not camera brightness.`:s.view==='torus'?`Toroidal cutaway: ζ=${s.angle}°, arc=${s.arc}°. Periodic 72° source; no new simulation resolution.`:`Poloidal section at ζ=${s.angle}°; SOL rows x=16–63. Native samples preserved; axes in metres.`,90,2560);ctx.fillText('Simulation truth, not a predicted 3D volume. Native target predictions and scores are unchanged.',90,2620);
  c.toBlob(async blob=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`filament-refined-${s.volume?'volume':s.view}-${s.field}-${s.volume?'SOL':'x'+s.row}-frame${d.frames[t]}-winding.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 if(panel.open)init();
})();
