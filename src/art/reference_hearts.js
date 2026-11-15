// 第六灾心脏：病心按心室、耳状心房和血管建形；发条心复现原作的圆形黄铜机芯与咬合齿轮。
import * as THREE from 'three';
import { toon } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI=Math.PI,cache=new Map();
const mat=(color,outline=.0006)=>{const key=color+':'+outline;if(!cache.has(key))cache.set(key,toon(color,{outline}));return cache.get(key);};
const mesh=(parent,name,geo,color,pos=[0,0,0])=>{const m=new THREE.Mesh(geo,typeof color==='string'?mat(color):color);m.name=name;m.position.fromArray(pos);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
const ball=(p,n,r,c,pos)=>mesh(p,n,new THREE.SphereGeometry(1,28,18).scale(...r),c,pos);
function tube(p,n,points,r,color,end=r){
  const path=new THREE.CatmullRomCurve3(points.map(a=>new THREE.Vector3(...a))),N=32,R=10,frames=path.computeFrenetFrames(N,false),pos=[],ix=[];
  for(let i=0;i<=N;i++){
    const q=path.getPointAt(i/N),radius=r+(end-r)*i/N;
    for(let j=0;j<=R;j++){const a=j/R*PI*2,v=q.clone().addScaledVector(frames.normals[i],Math.cos(a)*radius).addScaledVector(frames.binormals[i],Math.sin(a)*radius);pos.push(...v.toArray());if(i<N&&j<R){const k=i*(R+1)+j;ix.push(k,k+1,k+R+1,k+1,k+R+2,k+R+1);}}
  }
  for(const t of [0,1]){const i=pos.length/3,b=t*N*(R+1);pos.push(...path.getPointAt(t).toArray());for(let j=0;j<R;j++)t?ix.push(i,b+j,b+j+1):ix.push(i,b+j+1,b+j);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ix);g.computeVertexNormals();return mesh(p,n,g,mat(color,Math.min(.0007,r*.18)));
}
function batch(root){
  root.updateMatrixWorld(true);const batches=new Map();root.traverse(n=>{if(!n.isMesh)return;const key=n.material.uuid;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(n);});
  for(const list of batches.values())if(list.length>1){const g=mergeGeometries(list.map(n=>(n.geometry.index?n.geometry.toNonIndexed():n.geometry.clone()).applyMatrix4(n.matrixWorld)),false);list.forEach(n=>n.removeFromParent());mesh(root,'heart_surfaces',g,list[0].material);}
}

export function organicHeart(){
  const root=new THREE.Group();root.name='anatomical_sick_heart';
  const rows=[[0,.015,.001,.001],[.014,.010,.017,.012],[.033,.001,.030,.022],[.056,-.005,.040,.028],[.076,-.009,.037,.027],[.092,-.012,.027,.021],[.104,-.015,.002,.002]],pos=[],ix=[],N=48;
  const curve=new THREE.CatmullRomCurve3(rows.map(([y,x,rx,rz])=>new THREE.Vector3(y,x,rx))),depth=new THREE.SplineCurve(rows.map(([y,x,rx,rz],i)=>new THREE.Vector2(i/(rows.length-1),rz)));
  for(let i=0;i<=48;i++){
    const t=i/48,q=curve.getPoint(t),rz=Math.max(.0002,depth.getPoint(t).y),rx=Math.max(.0002,q.z);
    for(let j=0;j<=N;j++){const a=j/N*PI*2,relief=1+.025*Math.sin(a*3+t*5);pos.push(q.y+Math.cos(a)*rx*relief,q.x,Math.sin(a)*rz*relief);if(i<48&&j<N){const k=i*(N+1)+j;ix.push(k,k+N+1,k+1,k+1,k+N+1,k+N+2);}}
  }
  for(const side of [0,1]){const center=pos.length/3,q=curve.getPoint(side),b=side*48*(N+1);pos.push(q.y,q.x,0);for(let j=0;j<N;j++)side?ix.push(center,b+j+1,b+j):ix.push(center,b+j,b+j+1);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(ix);geo.computeVertexNormals();mesh(root,'asymmetric_ventricles',geo,'#a9473e');
  ball(root,'right_auricle',[.018,.021,.019],'#9a3d3a',[.022,.080,-.007]);
  ball(root,'left_auricle',[.016,.015,.014],'#ba5b50',[-.029,.093,-.006]);
  const vessel=(name,points,r,c)=>{
    tube(root,name,points,r,c,r*.86);const end=new THREE.Vector3(...points[points.length-1]),direction=end.clone().sub(new THREE.Vector3(...points[points.length-2])).normalize();
    const rim=mesh(root,name+'_rim',new THREE.TorusGeometry(r*.74,r*.19,8,24),c,end.toArray());rim.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);
    const mouth=mesh(root,name+'_opening',new THREE.CircleGeometry(r*.56,24),mat('#5e302d',0),end.clone().addScaledVector(direction,.0003).toArray());mouth.quaternion.copy(rim.quaternion);
  };
  vessel('aortic_arch',[[-.014,.089,-.003],[-.021,.115,-.002],[-.005,.132,-.006],[.016,.123,-.010]],.0095,'#c37766');
  vessel('pulmonary_stump',[[.008,.086,.012],[.018,.107,.018],[.034,.116,.021]],.007,'#bd7266');
  vessel('vena_cava',[[.025,.080,-.008],[.033,.104,-.010],[.029,.123,-.011]],.006,'#956365');
  for(const s of [-1,1])tube(root,'coronary_vessel_'+s,[[s*.006,.091,.021],[s*.021,.071,.027],[s*.015,.048,.024],[.012,.020,.014]],.0017,'#d18a74',.0007);
  for(const [x,y,z]of [[-.018,.062,.027],[.012,.043,.023],[.023,.072,.023]]){
    ball(root,'pale_lesion',[.005,.004,.0014],'#c5a17a',[x,y,z]);
    ball(root,'lesion_center',[.0017,.0014,.001],'#8b5d45',[x,y,z+.001]);
  }
  batch(root);root.userData.anatomy='ventricles,auricles,aorta,pulmonary_vessel,coronaries';return root;
}

function gear(parent,name,r,teeth,color,pos){
  const shape=new THREE.Shape();
  for(let i=0;i<teeth*4;i++){const a=i/(teeth*4)*PI*2,rad=r*(i%4===1||i%4===2?1:.84),x=Math.cos(a)*rad,y=Math.sin(a)*rad;i?shape.lineTo(x,y):shape.moveTo(x,y);}shape.closePath();
  const hole=new THREE.Path();hole.absarc(0,0,r*.21,0,PI*2,true);shape.holes.push(hole);
  for(let i=0;i<5;i++){
    const a=(i+.17)/5*PI*2,b=(i+.83)/5*PI*2,h=new THREE.Path();h.moveTo(Math.cos(a)*r*.38,Math.sin(a)*r*.38);h.lineTo(Math.cos(a)*r*.70,Math.sin(a)*r*.70);h.absarc(0,0,r*.70,a,b,false);h.lineTo(Math.cos(b)*r*.38,Math.sin(b)*r*.38);h.absarc(0,0,r*.38,b,a,true);h.closePath();shape.holes.push(h);
  }
  const g=new THREE.ExtrudeGeometry(shape,{depth:.0025,bevelEnabled:true,bevelSize:.0005,bevelThickness:.0004,bevelSegments:1});
  mesh(parent,name,g,color,pos);
  const spokes=[];for(let i=0;i<5;i++){const a=i/5*PI*2;spokes.push(new THREE.BoxGeometry(r*.72,r*.09,.0018).translate(r*.43,0,0).rotateZ(a).translate(...pos));}mesh(parent,name+'_spokes',mergeGeometries(spokes),color);
  mesh(parent,name+'_axle',new THREE.CylinderGeometry(r*.09,r*.09,.006,16).rotateX(PI/2),'#77572f',[pos[0],pos[1],pos[2]+.003]);
}
export function mechanicalHeart(){
  const root=new THREE.Group();root.name='brass_clockwork_heart';
  mesh(root,'circular_case',new THREE.CylinderGeometry(.046,.045,.016,64).rotateX(PI/2),'#927338',[0,.048,0]);
  const plate=new THREE.Shape();plate.absarc(0,0,.043,0,PI*2,false);
  for(const [x,y,r]of [[-.019,.012,.016],[.016,.006,.013],[.006,-.021,.015]]){const h=new THREE.Path();h.absarc(x,y,r,0,PI*2,true);plate.holes.push(h);}
  mesh(root,'pierced_brass_plate',new THREE.ExtrudeGeometry(plate,{depth:.0025,bevelEnabled:true,bevelSize:.0006,bevelThickness:.0006,bevelSegments:2}),'#c8a551',[0,.048,.009]);
  mesh(root,'rolled_case_rim',new THREE.TorusGeometry(.045,.0025,8,64),'#d7b968',[0,.048,.010]);
  gear(root,'wheel_large',.0185,16,'#dfc36f',[-.016,.061,.014]);
  gear(root,'wheel_small',.0134,12,'#b18435',[.014,.055,.017]);
  gear(root,'wheel_lower',.0145,14,'#d3ac55',[.005,.030,.014]);
  const spring=[];for(let i=0;i<100;i++){const t=i/99,a=t*PI*5,r=.001+t*.009;spring.push([-.016+Math.cos(a)*r,.061+Math.sin(a)*r,.020]);}tube(root,'mainspring',spring,.00055,'#7c5f35');
  for(const a of [PI*.18,PI*.82,PI*1.5]){const x=Math.cos(a)*.038,y=.048+Math.sin(a)*.038;mesh(root,'slotted_screw',new THREE.CylinderGeometry(.002,.002,.002,16).rotateX(PI/2),'#80612f',[x,y,.013]);mesh(root,'screw_slot',new THREE.BoxGeometry(.0025,.0005,.0003),'#4b3e29',[x,y,.0142]);}
  mesh(root,'winding_stem',new THREE.CylinderGeometry(.003,.003,.018,16),'#b08d47',[0,.103,0]);
  for(const s of [-1,1]){const wing=mesh(root,'winding_key',new THREE.TorusGeometry(.008,.0022,8,24),'#d2b167',[s*.009,.113,0]);wing.scale.y=.68;}
  batch(root);root.userData.mechanism='round_case,three_toothed_wheels,mainspring,winding_key';return root;
}
