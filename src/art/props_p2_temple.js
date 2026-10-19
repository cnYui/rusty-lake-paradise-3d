// 神殿木柜与转盘的刻线是真实几何，圈的角度和点击区一起旋转；木器工厂可跨章复用。
import { THREE, TAU, toon, mesh, rod, merge, motion, woodMaterial } from './props_p2_shared.js';
import { makeSideTable } from './props_p2_house.js';
import { FACTORIES as FROGS } from './props_frogs.js';

export function makeStool(){const o=makeSideTable({height:.45,radius:.225,color:'#ad9476'});o.getObjectByName('table_top').name='stool_top';return o;}
export function makeWoodPile(){
  const root=new THREE.Group(),logs=[];for(let i=0;i<8;i++){const a=i*.93;logs.push(rod([Math.cos(a)*-.4,.04+i*.012,Math.sin(a)*-.18],[Math.cos(a)*.4,.08+i*.012,Math.sin(a)*.18],.032,8,.023));}
  merge(root,logs,woodMaterial('#5c3f29',45),'wood_pile_hit');root.take=()=>{root.visible=false;return Promise.resolve();};return root;
}
function ring(parent,name,outer,inner,y){
  const g=new THREE.RingGeometry(inner,outer,72),m=mesh(parent,g,toon('#765d43',{side:THREE.DoubleSide}),name,[0,y,.015]);m.userData.proxy=true;return m;
}
export function makeDialCabinet(){
  const root=new THREE.Group(),wood=woodMaterial('#6e5948',18),trim=woodMaterial('#463a2e',21);
  const parts=[new THREE.BoxGeometry(.59,.06,.45).translate(0,1.015,0),new THREE.BoxGeometry(.035,.86,.41).translate(-.264,.55,0),new THREE.BoxGeometry(.035,.86,.41).translate(.264,.55,0),new THREE.BoxGeometry(.54,.026,.4).translate(0,.125,0),new THREE.BoxGeometry(.53,.83,.025).translate(0,.55,-.194)];
  for(const x of[-.248,.248])for(const z of[-.163,.163])parts.push(rod([x*1.12,0,z*1.1],[x,.17,z],.019,6,.027));merge(root,parts,wood,'cabinet_frame');
  mesh(root,new THREE.BoxGeometry(.485,.79,.03),toon('#323431'),'cabinet_back',[0,.55,-.172]);
  const door=new THREE.Group();door.name='cabinet_door_hit';door.position.set(0,.55,.217);root.add(door);
  mesh(door,new THREE.BoxGeometry(.465,.79,.032),wood,'door_panel');
  const edges=[];for(const x of[-.215,.215])edges.push(new THREE.BoxGeometry(.022,.76,.014).translate(x,0,.022));for(const y of[-.367,.367])edges.push(new THREE.BoxGeometry(.44,.025,.014).translate(0,y,.022));merge(door,edges,trim,'door_trim');
  const dial=new THREE.Group();dial.name='dial';dial.position.set(0,.1,.046);door.add(dial);
  mesh(dial,new THREE.CircleGeometry(.184,64),toon('#8d7557'),'dial_base');
  const out=new THREE.Group(),mid=new THREE.Group();out.name='dial_out';mid.name='dial_mid';dial.add(out,mid);
  ring(out,'dial_out_hit',.166,.126,.0);ring(mid,'dial_mid_hit',.123,.077,.0);
  const ink=toon('#262823',{outline:false}),fixed=[];
  const line=(p,a,b,w=.003)=>merge(p,[rod([a[0],a[1],.02],[b[0],b[1],.02],w,5)],ink,'engraving');
  for(const y of[-.008,.008])fixed.push(rod([-.21,y,.022],[-.184,y,.022],.0027,5));fixed.push(rod([.182,0,.022],[.214,0,.022],.003,5));merge(dial,fixed,ink,'frame_marks');
  line(out,[.13,0],[.162,0]);line(out,[-.132,-.007],[-.159,-.007]);line(out,[-.132,.007],[-.159,.007]);
  for(const a of[0,Math.PI/2,Math.PI]){const x=Math.sin(a),y=Math.cos(a);line(mid,[x*.078,y*.078],[x*.124,y*.124]);mesh(mid,new THREE.CircleGeometry(.006,14),ink,'pin',[x*.124,y*.124,.024]);}
  const triangle=(parent,pts)=>{const s=new THREE.Shape();s.moveTo(...pts[0]);s.lineTo(...pts[1]);s.lineTo(...pts[2]);s.closePath();mesh(parent,new THREE.ShapeGeometry(s),ink,'triangle',[0,0,.024]);};
  triangle(mid,[[-.082,-.018],[-.082,.018],[-.123,0]]);triangle(dial,[[-.075,-.018],[-.075,.018],[-.047,0]]);line(dial,[0,.047],[0,.076]);line(dial,[0,-.047],[0,-.076]);
  for(const p of[out,mid]){const r=p===out?.145:.098;mesh(p,new THREE.TorusGeometry(r,.0013,4,40,1.1),toon('#b59a71',{outline:false}),'turn_arc',[0,0,.025],[0,0,.7]);}
  const hole=mesh(dial,new THREE.RingGeometry(.022,.031,24),ink,'dial_center');hole.position.z=.026;
  const solved=mesh(dial,new THREE.CircleGeometry(.031,24),toon('#4d4f4c',{outline:false}),'dial_solved',[0,0,.028]);solved.visible=false;
  const flute=FROGS.frog_flute();flute.name='cabinet_flute';flute.scale.setScalar(1.15);flute.position.set(0,.3,.03);root.add(flute);
  root.setRing=(which,step,opts={})=>{const o=which==='mid'?mid:out,angle=-step*(which==='mid'?Math.PI/4:Math.PI/6),from=o.rotation.z;return motion(350,k=>{o.rotation.z=from+(angle-from)*k;},opts);};
  root.setSolved=on=>{solved.visible=!!on;hole.visible=!on;return Promise.resolve();};root.solve=()=>root.setSolved(true);
  root.setOpen=on=>{door.visible=!on;return Promise.resolve();};root.open=()=>root.setOpen(true);
  root.setFlute=on=>{flute.visible=!!on;return Promise.resolve();};root.takeFlute=()=>root.setFlute(false);
  root.dial=dial;return root;
}
export const FACTORIES={temple_stool:makeStool,dial_cabinet:makeDialCabinet,wood_pile:makeWoodPile};
