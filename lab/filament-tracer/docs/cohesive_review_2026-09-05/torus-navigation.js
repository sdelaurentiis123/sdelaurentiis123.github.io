/* Camera motion in physical Cartesian metres. No field or mesh transformations. */
(() => {
  class TorusCamera {
    constructor() { this.enabled=false; this.speed=.3; this.reset(); }
    reset() { this.eye=[0,-2.8,1]; this.heading=Math.PI/2; this.tilt=-.34; }
    basis() {
      const c=Math.cos(this.heading),s=Math.sin(this.heading),p=Math.sin(this.tilt),q=Math.cos(this.tilt);
      return {forward:[q*c,q*s,p],right:[s,-c,0],up:[-p*c,-p*s,q]};
    }
    look(dx,dy) { this.heading-=dx*.005; this.tilt=Math.max(-1.5,Math.min(1.5,this.tilt-dy*.005)); }
    move(forward,right,up,distance) {
      const b=this.basis(),length=Math.hypot(forward,right,up);if(!length)return;
      for(let i=0;i<3;i++)this.eye[i]+=distance*(forward*b.forward[i]+right*b.right[i]+(i===2?up:0))/length;
    }
    project(position,width,height) {
      const b=this.basis(),v=position.map((x,i)=>x-this.eye[i]),dot=a=>a.reduce((s,x,i)=>s+x*v[i],0),depth=dot(b.forward);
      if(depth<=.002||depth>=20)return null;
      const f=1/Math.tan(Math.PI/6),x=dot(b.right)*f/(width/height)/depth,y=dot(b.up)*f/depth;
      if(Math.abs(x)>1||Math.abs(y)>1)return null;
      return [(x+1)*width/2,(1-y)*height/2];
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=TorusCamera;
  else window.TorusCamera=TorusCamera;
})();
