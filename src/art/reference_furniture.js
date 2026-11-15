// 对照原作补足木器、石井和白色落地钟的结构细节，不改变活动零件和谜题接口。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, canvasTexture } from './materials.js';

const mats=new Map();
const material=c=>{if(!mats.has(c))mats.set(c,toon(c,{outline:.0015}));return mats.get(c);};
function mesh(p,n,geo,c,pos=[0,0,0]){const m=new THREE.Mesh(geo,typeof c==='string'?material(c):c);m.name=n;m.position.fromArray(pos);m.castShadow=m.receiveShadow=true;p.add(m);return m;}
function curve(p,n,pts,r,c){return mesh(p,n,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(v=>new THREE.Vector3(...v))),32,r,8),c);}

export function decorateClock(root){
  const ivory='#e2d7cb',shadow='#b9a99b';
  const old=root.getObjectByName('clock_crown');if(old)old.visible=false;
  const crown=new THREE.Shape();crown.moveTo(-.31,1.98);crown.lineTo(-.31,2.06);crown.bezierCurveTo(-.22,2.045,-.25,2.16,-.17,2.145);crown.bezierCurveTo(-.11,2.12,-.075,2.22,0,2.19);crown.bezierCurveTo(.075,2.22,.11,2.12,.17,2.145);crown.bezierCurveTo(.25,2.16,.22,2.045,.31,2.06);crown.lineTo(.31,1.98);crown.closePath();
  mesh(root,'clock_sculpted_crown',new THREE.ExtrudeGeometry(crown,{depth:.35,bevelEnabled:true,bevelSize:.006,bevelThickness:.006,bevelSegments:2,curveSegments:28}),ivory,[0,0,-.18]);
  for(const s of [-1,1]){
    curve(root,'clock_scroll',[[s*.20,2.02,.20],[s*.24,2.08,.20],[s*.20,2.13,.20],[s*.16,2.11,.20],[s*.18,2.08,.20]],.009,shadow);
    const flute=new THREE.LatheGeometry([[.018,0],[.024,.025],[.017,.055],[.014,.30],[.020,.37],[.023,.39]].map(v=>new THREE.Vector2(...v)),24);mesh(root,'clock_hood_column',flute,ivory,[s*.25,1.54,.20]);
    curve(root,'clock_trunk_moulding',[[s*.17,.31,.185],[s*.14,.38,.185],[s*.14,1.18,.185],[s*.20,1.35,.185]],.008,shadow);
  }
  for(const y of [.11,.23,1.43,1.49,1.98])mesh(root,'clock_cornice',new RoundedBoxGeometry(y<1?.58:.59,.022,.41,2,.005),ivory,[0,y,0]);
  const door=root.getObjectByName('clock_face_door');
  if(door)for(const[r,t,c]of [[.205,.009,ivory],[.193,.003,shadow]])mesh(door,'clock_face_bead',new THREE.TorusGeometry(r,t,8,48),c,[.19,0,.009]);
  root.userData.referenceRemodel=true;
}

export function dressStump(root){
  const bark=canvasTexture(256,512,(g,w,h)=>{g.fillStyle='#876447';g.fillRect(0,0,w,h);for(let i=0;i<28;i++){g.strokeStyle=i%3?'#654932':'#ac8258';g.lineWidth=1+i%3;g.beginPath();for(let y=0;y<=h;y+=12)g.lineTo(i*10+Math.sin(i+y*.018)*5,y);g.stroke();}});
  const cut=canvasTexture(256,256,(g,w,h)=>{g.fillStyle='#b09166';g.fillRect(0,0,w,h);for(let i=1;i<13;i++){g.strokeStyle=i%3?'rgba(86,61,36,.40)':'rgba(225,202,155,.40)';g.lineWidth=1.5;g.beginPath();g.ellipse(w*.47,h*.51,i*10,i*8,.18,0,Math.PI*2);g.stroke();}});
  const bm=toon('#fff',{map:bark,outline:.002}),cm=toon('#fff',{map:cut,outline:.0015});
  root.traverse(o=>{if(o.isMesh&&o.name==='stump_half')o.material=[bm,cm,cm];});root.userData.referenceRemodel=true;
}

export function rebuildWell(root){
  root.traverse(o=>{if(o.name==='well_stone')o.visible=false;});
  const N=14;
  for(let row=0;row<3;row++)for(let i=0;i<N;i++){
    const a=(i+(row%2)*.5)*Math.PI*2/N,b=a+Math.PI*2/N*.96;
    const shape=new THREE.Shape();shape.absarc(0,0,.72,a,b,false);shape.lineTo(Math.cos(b)*.535,Math.sin(b)*.535);shape.absarc(0,0,.535,b,a,true);shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:.178,bevelEnabled:true,bevelSize:.009,bevelThickness:.008,bevelSegments:2,curveSegments:4});geo.rotateX(-Math.PI/2);
    mesh(root,'well_masonry_course_'+row,geo,(i+row)%3?'#99968b':'#8a887f',[0,.014+row*.196,0]);
  }
  root.userData.referenceRemodel=true;
}
