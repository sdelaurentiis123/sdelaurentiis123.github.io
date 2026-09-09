/* Volume display of the same SOL fields, using the supplied R/Z mesh.
 * Opacity is a visualization transfer function, not synthetic emission. */
(() => {
 class TorusVolume {
  constructor(gl,d) {
   this.gl=gl;this.d=d;this.nphi=648;this.ny=d.ny;this.valid=false;
   if(d.ny!==497)throw Error('Unexpected refined poloidal mesh size.');
   if(!gl.getExtension('EXT_color_buffer_float')||!gl.getExtension('OES_texture_float_linear'))throw Error('Floating-point volume rendering is unavailable on this device.');
   this.bounds=[Math.min(...d.R),Math.max(...d.R),Math.min(...d.Z),Math.max(...d.Z)];
   this.fb=gl.createFramebuffer();this.vao=gl.createVertexArray();
   const vertex=`#version 300 es
   precision highp float;out vec2 screen;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);screen=p*2.-1.;gl_Position=vec4(screen,0.,1.);}`;
   this.bake=this.program(vertex,`#version 300 es
   precision highp float;out vec4 result;uniform sampler2D coefficients;uniform sampler2D shifts;uniform int row;uniform float nphi;
   void main(){float y=(gl_FragCoord.y-.5)/16.;int lo=min(31,int(floor(y)));float w=y-float(lo),ds=texelFetch(shifts,ivec2(lo,row),0).r;
    float phi=(gl_FragCoord.x-.5)*6.283185307179586/(5.*nphi),base=5.*(phi-ds*w),v=0.;
    for(int k=0;k<41;k++){vec2 a=mix(texelFetch(coefficients,ivec2(k,row*32+lo),0).rg,texelFetch(coefficients,ivec2(k+41,row*32+lo),0).rg,w);float phase=float(k)*base;v+=(k==0?1.:2.)*(a.x*cos(phase)-a.y*sin(phase));}
    result=vec4(v,0.,0.,1.);
   }`);
   this.ray=this.program(vertex,`#version 300 es
   precision highp float;precision highp sampler3D;in vec2 screen;out vec4 result;
   uniform sampler2D inverseMesh,geometry;uniform sampler3D field;uniform sampler2D palette;
   uniform vec4 bounds;uniform vec3 eye,forward,right,up;uniform vec2 scale,pan,cut;uniform vec4 orbit;
   uniform bool interior;uniform float aspect,limit,opacity,nphi;
   bool box(vec3 ro,vec3 rd,out float a,out float b){vec3 low=vec3(-bounds.y,-bounds.y,bounds.z),high=vec3(bounds.y,bounds.y,bounds.w);vec3 inv=1./(sign(rd)*max(abs(rd),vec3(1.e-8))+vec3(equal(rd,vec3(0.)))*1.e-8);vec3 p=(low-ro)*inv,q=(high-ro)*inv;vec3 near=min(p,q),far=max(p,q);a=max(0.,max(near.x,max(near.y,near.z)));b=min(far.x,min(far.y,far.z));return b>a;}
   void main(){
    vec3 ro,rd;
    if(interior){ro=eye;rd=normalize(forward+screen.x*aspect*.57735026919*right+screen.y*.57735026919*up);}
    else{vec3 r=vec3(orbit.x,-orbit.y,0.),u=vec3(orbit.w*orbit.y,orbit.w*orbit.x,orbit.z);rd=vec3(orbit.z*orbit.y,orbit.z*orbit.x,-orbit.w);vec2 p=screen/scale-pan;ro=r*p.x+u*(p.y+.18-.2*orbit.z)-rd*4.;}
    vec3 bg=vec3(16.,17.,23.)/255.;float start,end;if(!box(ro,rd,start,end)){result=vec4(bg,1.);return;}
    float stepLength=(end-start)/640.,trans=1.;vec3 light=vec3(0.);
    for(int j=0;j<640;j++){
     vec3 p=ro+rd*(start+(float(j)+.5)*stepLength);float phi=atan(p.y,p.x);if(mod(phi-cut.x+12.566370614359172,6.283185307179586)>cut.y)continue;float R=length(p.xy);vec2 uv=vec2((R-bounds.x)/(bounds.y-bounds.x),(p.z-bounds.z)/(bounds.w-bounds.z));
     if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))continue;
     vec4 map=texture(inverseMesh,uv);if(map.b<.0001)continue;vec2 xy=map.rg/map.b*vec2(47.,496.);
     // The lookup is only an initial guess. Invert the actual local R/Z cell,
     // including thin cells at the separatrix; reject points outside the mesh.
     for(int k=0;k<3;k++){ivec2 i=ivec2(clamp(floor(xy),vec2(0.),vec2(46.,495.)));vec2 f=xy-vec2(i);
      vec2 a=texelFetch(geometry,i.yx,0).rg,b=texelFetch(geometry,i.yx+ivec2(0,1),0).rg,c=texelFetch(geometry,i.yx+ivec2(1,0),0).rg,d=texelFetch(geometry,i.yx+ivec2(1,1),0).rg;
      vec2 rx=mix(b-a,d-c,f.y),ry=mix(c-a,d-b,f.x),err=vec2(R,p.z)-mix(mix(a,b,f.x),mix(c,d,f.x),f.y);float det=rx.x*ry.y-rx.y*ry.x;
      xy+=vec2(err.x*ry.y-err.y*ry.x,rx.x*err.y-rx.y*err.x)/det;
     }
     if(any(lessThan(xy,vec2(0.)))||any(greaterThan(xy,vec2(47.,496.))))continue;
     float v=texture(field,vec3(phi*5./6.283185307179586+.5/nphi,(xy.y+.5)/497.,(xy.x+.5)/48.)).r;
     float fraction=clamp(v/limit,-1.,1.);int c=clamp(int(floor((fraction+1.)*128.)),0,255);vec3 col=texelFetch(palette,ivec2(c,0),0).rgb;
     float sigma=opacity*(2.+24.*pow(abs(fraction),.8)),alpha=1.-exp(-sigma*stepLength);light+=trans*alpha*col;trans*=1.-alpha;if(trans<.008)break;
    }
    result=vec4(light+trans*bg,1.);
   }`);
   this.inverse=this.makeInverse();this.geometry=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.geometry);const rz=new Float32Array(d.R.length*2);for(let i=0;i<d.R.length;i++){rz[i*2]=d.R[i];rz[i*2+1]=d.Z[i];}gl.texImage2D(gl.TEXTURE_2D,0,gl.RG32F,this.ny,48,0,gl.RG,gl.FLOAT,rz);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
   this.field=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,this.field);
   gl.texStorage3D(gl.TEXTURE_3D,1,gl.R32F,this.nphi,this.ny,48);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
  }
  program(vs,fs){const gl=this.gl,p=gl.createProgram();for(const [type,source] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);gl.deleteShader(s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
  makeInverse(){
   const gl=this.gl,d=this.d,N=1536,p=this.program(`#version 300 es
    precision highp float;layout(location=0)in vec2 position;layout(location=1)in vec2 native;out vec2 mapped;void main(){mapped=native;gl_Position=vec4(position,0.,1.);}`,`#version 300 es
    precision highp float;in vec2 mapped;out vec4 result;void main(){result=vec4(mapped,1.,1.);}`);
   const vertices=[],indices=[];for(let x=0;x<48;x++)for(let y=0;y<d.ny;y++){const i=x*d.ny+y;vertices.push(2*(d.R[i]-this.bounds[0])/(this.bounds[1]-this.bounds[0])-1,2*(d.Z[i]-this.bounds[2])/(this.bounds[3]-this.bounds[2])-1,x/47,y/(d.ny-1));}
   for(let x=0;x<47;x++)for(let y=0;y<d.ny-1;y++){const i=x*d.ny+y;indices.push(i,i+d.ny,i+d.ny+1,i,i+d.ny+1,i+1);}
   const vao=gl.createVertexArray(),vb=gl.createBuffer(),ib=gl.createBuffer(),tex=gl.createTexture();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
   gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,16,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,16,8);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(indices),gl.STATIC_DRAW);
   gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,N,N,0,gl.RGBA,gl.FLOAT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Mesh lookup framebuffer unavailable');
   gl.viewport(0,0,N,N);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(p);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_INT,0);
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);gl.deleteVertexArray(vao);gl.deleteBuffer(vb);gl.deleteBuffer(ib);gl.deleteProgram(p);return tex;
  }
  upload(coefficients,shifts){const gl=this.gl,p=this.bake;gl.useProgram(p);gl.bindVertexArray(this.vao);gl.bindFramebuffer(gl.FRAMEBUFFER,this.fb);gl.viewport(0,0,this.nphi,this.ny);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,coefficients);gl.uniform1i(gl.getUniformLocation(p,'coefficients'),0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,shifts);gl.uniform1i(gl.getUniformLocation(p,'shifts'),1);gl.uniform1f(gl.getUniformLocation(p,'nphi'),this.nphi);
   for(let x=0;x<48;x++){gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,this.field,0,x);gl.uniform1i(gl.getUniformLocation(p,'row'),x);gl.drawArrays(gl.TRIANGLES,0,3);}
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);this.valid=true;
  }
  render({width,height,camera,orbit,scale,pan,limit,opacity,palette,cut}){
   const gl=this.gl,p=this.ray,b=camera.basis();gl.useProgram(p);gl.bindVertexArray(this.vao);gl.viewport(0,0,width,height);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
   for(const [unit,target,tex,name] of [[0,gl.TEXTURE_2D,this.inverse,'inverseMesh'],[1,gl.TEXTURE_3D,this.field,'field'],[2,gl.TEXTURE_2D,palette,'palette'],[3,gl.TEXTURE_2D,this.geometry,'geometry']]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(target,tex);gl.uniform1i(gl.getUniformLocation(p,name),unit);}
   for(const [name,value] of [['eye',camera.eye],['forward',b.forward],['right',b.right],['up',b.up]])gl.uniform3fv(gl.getUniformLocation(p,name),value);
   gl.uniform2fv(gl.getUniformLocation(p,'cut'),cut);gl.uniform4fv(gl.getUniformLocation(p,'bounds'),this.bounds);gl.uniform4fv(gl.getUniformLocation(p,'orbit'),orbit);gl.uniform2fv(gl.getUniformLocation(p,'scale'),scale);gl.uniform2fv(gl.getUniformLocation(p,'pan'),pan);gl.uniform1i(gl.getUniformLocation(p,'interior'),camera.enabled);
   for(const [name,value] of [['aspect',width/height],['limit',limit],['opacity',opacity],['nphi',this.nphi]])gl.uniform1f(gl.getUniformLocation(p,name),value);
   gl.drawArrays(gl.TRIANGLES,0,3);gl.bindVertexArray(null);
  }
  verify(reference){const gl=this.gl,a=new Float32Array(this.nphi*this.ny*4);let max=0,count=0;gl.bindFramebuffer(gl.FRAMEBUFFER,this.fb);
   for(let x=0;x<48;x++){gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,this.field,0,x);gl.readPixels(0,0,this.nphi,this.ny,gl.RGBA,gl.FLOAT,a);for(let y=0;y<32;y++)for(let z=0;z<81;z++){max=Math.max(max,Math.abs(a[(y*16*this.nphi+z*this.nphi/81)*4]-reference[(x*32+y)*81+z]));count++;}}
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);return {count,max_abs_error:max,passed:max<2e-4,webgl_error:gl.getError()};
  }
  verifyMesh(){
   if(this.meshCheck)return this.meshCheck;const gl=this.gl,N=1536,a=new Float32Array(N*N*4),d=this.d;gl.bindFramebuffer(gl.FRAMEBUFFER,this.fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.inverse,0);gl.readPixels(0,0,N,N,gl.RGBA,gl.FLOAT,a);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   let count=0,missing=0,radial=0,poloidal=0,physical=0;
   for(let x=1;x<47;x++)for(let y=16;y<d.ny-16;y+=16){const i=x*d.ny+y,u=(d.R[i]-this.bounds[0])/(this.bounds[1]-this.bounds[0])*N-.5,v=(d.Z[i]-this.bounds[2])/(this.bounds[3]-this.bounds[2])*N-.5,j=Math.floor(u),k=Math.floor(v),wx=u-j,wy=v-k,m=[0,0,0];
    for(const [dx,dy,w] of [[0,0,(1-wx)*(1-wy)],[1,0,wx*(1-wy)],[0,1,(1-wx)*wy],[1,1,wx*wy]])for(let c=0;c<3;c++)m[c]+=w*a[((k+dy)*N+j+dx)*4+c];
    if(m[2]<.0001){missing++;continue;}let fx=m[0]/m[2]*47,fy=m[1]/m[2]*(d.ny-1);
    for(let step=0;step<3;step++){const ix=Math.max(0,Math.min(46,Math.floor(fx))),iy=Math.max(0,Math.min(d.ny-2,Math.floor(fy))),tx=fx-ix,ty=fy-iy,parts=arr=>{const a=Math.fround(arr[ix*d.ny+iy]),b=Math.fround(arr[(ix+1)*d.ny+iy]),c=Math.fround(arr[ix*d.ny+iy+1]),z=Math.fround(arr[(ix+1)*d.ny+iy+1]);return [a*(1-tx)*(1-ty)+b*tx*(1-ty)+c*(1-tx)*ty+z*tx*ty,(b-a)*(1-ty)+(z-c)*ty,(c-a)*(1-tx)+(z-b)*tx];},r=parts(d.R),z=parts(d.Z),er=d.R[i]-r[0],ez=d.Z[i]-z[0],det=r[1]*z[2]-r[2]*z[1];fx+=(er*z[2]-ez*r[2])/det;fy+=(r[1]*ez-z[1]*er)/det;}
    const ix=Math.max(0,Math.min(46,Math.floor(fx))),iy=Math.max(0,Math.min(d.ny-2,Math.floor(fy))),tx=fx-ix,ty=fy-iy;
    const interp=arr=>arr[ix*d.ny+iy]*(1-tx)*(1-ty)+arr[(ix+1)*d.ny+iy]*tx*(1-ty)+arr[ix*d.ny+iy+1]*(1-tx)*ty+arr[(ix+1)*d.ny+iy+1]*tx*ty;
    radial=Math.max(radial,Math.abs(fx-x));poloidal=Math.max(poloidal,Math.abs(fy-y)/16);physical=Math.max(physical,Math.hypot(interp(d.R)-d.R[i],interp(d.Z)-d.Z[i]));count++;
   }
   this.meshCheck={count,missing,max_radial_index_error:radial,max_native_poloidal_index_error:poloidal,max_physical_roundtrip_error_m:physical,lookup_size:N,passed:missing===0&&physical<.001};return this.meshCheck;
  }
 }
 window.TorusVolume=TorusVolume;
})();
