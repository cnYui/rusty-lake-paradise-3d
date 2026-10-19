// 厨房道具复现陶锅肩线、铁架、砖圈和木器结构；状态方法可逆，供新游戏和读档恢复。
import { THREE, TAU, toon, unlit, mesh, lathe, rod, merge, hit, motion, woodMaterial, seg } from './props_p2_shared.js';

export function makeSideTable({ height = .55, radius = .24, color = '#998066' } = {}) {
  const root=new THREE.Group(),wood=woodMaterial(color,31);
  mesh(root,new THREE.CylinderGeometry(radius,radius*.96,.04,40),wood,'table_top',[0,height,0]);
  const legs=[];for(let i=0;i<3;i++){const a=i/3*TAU+.3;legs.push(rod([Math.sin(a)*radius*.92,.01,Math.cos(a)*radius*.92],[Math.sin(a)*radius*.66,height-.015,Math.cos(a)*radius*.66],.022,10,.016));}
  merge(root,legs,wood,'table_legs');return root;
}
export function makeChest(){
  const root=new THREE.Group(),wood=woodMaterial('#8e644c',12),edge=woodMaterial('#634736',8);
  mesh(root,new THREE.BoxGeometry(.42,.23,.3),wood,'chest_box',[0,.14,0]);
  mesh(root,new THREE.BoxGeometry(.365,.015,.25),toon('#32251d'),'chest_inside',[0,.261,0]);
  const trims=[];for(const x of[-.2,.2])trims.push(new THREE.BoxGeometry(.022,.23,.32).translate(x,.14,0));
  for(const y of[.032,.242])trims.push(new THREE.BoxGeometry(.43,.022,.012).translate(0,y,.158));merge(root,trims,edge,'chest_trim');
  const lid=new THREE.Group();lid.name='chest_lid';lid.position.set(0,.256,-.15);root.add(lid);
  mesh(lid,new THREE.BoxGeometry(.44,.065,.32),wood,'lid',[0,.032,.15]);
  const lock=mesh(root,new THREE.BoxGeometry(.063,.075,.008),toon('#d8a020'),'lock_plate',[0,.17,.159]);
  mesh(lock,new THREE.CircleGeometry(.009,16),toon('#181512',{outline:false}),'keyhole',[0,.012,.005]);mesh(lock,new THREE.BoxGeometry(.009,.026,.002),toon('#181512',{outline:false}),'keyhole_stem',[0,-.003,.006]);
  const nails=[];for(const x of[-.184,.184])for(const y of[.064,.215])nails.push(new THREE.SphereGeometry(.0045,8,6).translate(x,y,.17));merge(root,nails,toon('#241d17',{outline:false}),'nails');
  hit(root,'chest_hit',[.46,.32,.34],[0,.16,0]);
  let opened=false;root.setOpen=(on,opts={})=>{const from=lid.rotation.x,to=on?-Math.PI*.52:0;opened=on;return motion(800,k=>{lid.rotation.x=from+(to-from)*k;},opts);};root.open=opts=>root.setOpen(true,opts);root.isOpen=()=>opened;return root;
}
export function makeMemoryFrame({w=1.3,h=1.25}={}){
  const root=new THREE.Group(),ink=toon('#151716',{outline:false});
  const edges=[mesh(root,new THREE.BoxGeometry(w,.015,.012),ink,'bottom',[0,0,0]),mesh(root,new THREE.BoxGeometry(.015,h,.012),ink,'right',[w/2,h/2,0]),mesh(root,new THREE.BoxGeometry(w,.015,.012),ink,'top',[0,h,0]),mesh(root,new THREE.BoxGeometry(.015,h,.012),ink,'left',[-w/2,h/2,0])];
  const pose=k=>edges.forEach((e,i)=>{const t=seg(k,i/4,(i+1)/4);e.visible=t>0;const horizontal=i%2===0;e.scale[horizontal?'x':'y']=Math.max(.001,t);if(i===0)e.position.x=-w/2+w*t/2;if(i===1)e.position.y=h*t/2;if(i===2)e.position.x=w/2-w*t/2;if(i===3)e.position.y=h-h*t/2;});
  root.draw=(k=1,opts={})=>motion(1100,t=>pose(k*t),opts);root.erase=opts=>motion(900,k=>pose(1-k),opts);root.setProgress=pose;pose(0);return root;
}
export function makeCauldron(){
  const root=new THREE.Group();root.name='cauldron';
  const ceramic=toon('#a18f8d'),iron=toon('#7c7a74'),brick=toon('#a08770'),dark=toon('#524948',{outline:false});
  const pot=mesh(root,lathe([[.01,.35],[.23,.35],[.28,.4],[.315,.51],[.325,.58],[.36,.6],[.32,.77],[.29,.86],[.31,.88],[.31,.905],[.278,.898],[.274,.874],[.262,.84],[.29,.75],[.3,.62],[.29,.5],[.22,.39],[.01,.39]]),ceramic,'cauldron_body');
  for(const[r,y]of[[.316,.371],[.355,.599],[.302,.891]])mesh(root,new THREE.TorusGeometry(r,.007,6,64),toon('#66595a',{outline:false}),'pot_seam',[0,y,0],[Math.PI/2,0,0]);
  const liquid=mesh(root,new THREE.CircleGeometry(.275,48),dark,'pot_water',[0,.856,0],[-Math.PI/2,0,0]);
  const legs=[];for(const x of[-.26,.26])for(const z of[-.17,.17])legs.push(rod([x*1.16,.075,z*1.28],[x,.37,z],.012,8));merge(root,legs,iron,'iron_legs');
  mesh(root,new THREE.TorusGeometry(.294,.009,6,48),iron,'iron_seat',[0,.36,0],[Math.PI/2,0,0]);
  const mortar=mesh(root,new THREE.TorusGeometry(.32,.039,8,64),toon('#a39989',{outline:false}),'fire_ring_mortar',[0,.023,0],[Math.PI/2,0,0]);mortar.scale.set(1.13,.88,.7);
  const bricks=[];for(let i=0;i<16;i++){const a=i/16*TAU;const g=new THREE.BoxGeometry(.128,.056,.079);g.rotateY(a);g.translate(Math.sin(a)*.36,.035,Math.cos(a)*.28);bricks.push(g);}merge(root,bricks,brick,'brick_fire_ring');
  const wood=new THREE.Group();wood.name='cauldron_wood';root.add(wood);const logs=[];
  for(let i=0;i<8;i++){const a=i*1.11;logs.push(rod([Math.sin(a)*.23,.068,Math.cos(a)*.18],[Math.sin(a+1)*.13,.26,Math.cos(a+1)*.1],.019,7,.013));}merge(wood,logs,woodMaterial('#593d28',9),'fire_logs');wood.visible=false;
  const fire=new THREE.Group();fire.name='cauldron_fire';root.add(fire);
  for(let i=0;i<11;i++){const x=Math.sin(i*2.4)*.12,z=Math.cos(i*2.4)*.11;const flame=mesh(fire,lathe([[0,-1],[.5,-.8],[.8,-.5],[1,-.12],[.72,.3],[.33,.6],[0,1]],12),unlit(i%2?'#dc931b':'#b74719'),'flame',[x,.18,z]);flame.scale.set(.027,.11+i%3*.027,.027);flame.castShadow=false;flame.userData.base=flame.scale.clone();}fire.visible=false;
  const steam=new THREE.Group();root.add(steam);steam.visible=false;
  for(let i=0;i<7;i++){const m=mesh(steam,new THREE.SphereGeometry(.024,8,6),unlit('#eeeade',{transparent:true,opacity:.13,depthWrite:false}),'steam');m.userData.phase=i/7;}
  const glow=new THREE.Group();root.add(glow);glow.visible=false;
  const rays=[];for(let i=0;i<16;i++){const a=i/16*TAU;rays.push(rod([0,.88,0],[Math.cos(a)*.31,1.13+(i%3)*.08,Math.sin(a)*.31],.002,4));}merge(glow,rays,unlit('#ffffff',{transparent:true,opacity:.75,depthWrite:false}),'cauldron_glow');
  hit(root,'cauldron_pot_hit',[.73,.61,.7],[0,.62,0]);hit(root,'cauldron_fire_hit',[.68,.29,.55],[0,.17,.01]);
  const top=new THREE.Object3D();top.name='cauldron_stick_top';top.position.set(.01,1.4,-.07);root.add(top);
  let count=0,glowUntil=0,time=0;
  root.setWood=on=>{wood.visible=!!on;return Promise.resolve();};root.setLit=on=>{fire.visible=!!on;steam.visible=!!on;return Promise.resolve();};root.setFrogs=n=>{count=n;liquid.material.color.set(n>=4?'#6a8b35':n?'#778452':'#524948');return Promise.resolve();};
  root.dropFrog=frog=>{root.add(frog);const from=top.position.clone();frog.position.copy(from);return motion(900,k=>{frog.position.set(from.x,from.y-(from.y-.78)*k+Math.sin(k*Math.PI)*.09,from.z);frog.scale.setScalar(1-k*.4);if(k===1)root.remove(frog);});};
  root.glow=on=>{glow.visible=!!on;glowUntil=time+5;return Promise.resolve();};root.steam=on=>{steam.visible=!!on;return Promise.resolve();};
  root.update=(dt,t)=>{time=t;for(let i=0;i<fire.children.length;i++){const m=fire.children[i];m.scale.y=m.userData.base.y*(.78+Math.sin(t*12+i*1.6)*.22);m.rotation.z=Math.sin(t*9+i)*.18;}for(const m of steam.children){const k=(t*.22+m.userData.phase)%1;m.position.set(Math.sin(k*7+m.userData.phase*8)*.1,.9+k*.53,Math.cos(k*5)*.09);m.scale.setScalar(.5+k*1.7);m.material.opacity=Math.sin(k*Math.PI)*.12;}if(glow.visible&&t>glowUntil)glow.visible=false;};
  root.userData.frogs=()=>count;root.userData.pot=pot;return root;
}
export const FACTORIES={cauldron:makeCauldron,side_table:makeSideTable,chest:makeChest,memory_frame:makeMemoryFrame};
