// 原版实况中的小道具重建：按物种、器物结构和真实开口分别建网格，保留章节原有状态接口。
import * as THREE from 'three';
import { toon, canvasTexture } from './materials.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;
const mats = new Map();
const material = (color) => {
  if (!mats.has(color)) mats.set(color, toon(color, { outline: .0018 }));
  return mats.get(color);
};
const group = name => { const g=new THREE.Group();g.name=name;return g; };
const mesh=(p,n,g,c,pos=[0,0,0])=>{const m=new THREE.Mesh(g,typeof c==='string'?material(c):c);m.name=n;m.position.fromArray(pos);m.castShadow=m.receiveShadow=true;p.add(m);return m;};
const ball=(p,n,xyz,c,pos)=>mesh(p,n,new THREE.SphereGeometry(1,24,16).scale(...xyz),c,pos);
const box=(p,n,size,c,pos,r=.003)=>mesh(p,n,new RoundedBoxGeometry(...size,2,Math.min(r,...size.map(x=>x*.22))),c,pos);
const ring=(p,n,r,t,c,pos)=>mesh(p,n,new THREE.TorusGeometry(r,t,8,40),c,pos);
const lathe=(p,n,pts,c,pos=[0,0,0],smooth=false)=>{
  let profile=pts.map(a=>new THREE.Vector2(...a));
  if(smooth)profile=new THREE.SplineCurve(profile).getPoints(72).map(v=>new THREE.Vector2(Math.max(0,v.x),v.y));
  return mesh(p,n,new THREE.LatheGeometry(profile,40),c,pos);
};
function sweep(p,n,points,r,c,end=r,{segments=24,radial=8}={}){
  const path=new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v))),N=segments,R=radial,frames=path.computeFrenetFrames(N,false),pos=[],uv=[],idx=[];
  for(let i=0;i<=N;i++){
    const center=path.getPointAt(i/N),radius=r+(end-r)*i/N;
    for(let j=0;j<=R;j++){
      const a=j/R*PI*2,v=center.clone().addScaledVector(frames.normals[i],Math.cos(a)*radius).addScaledVector(frames.binormals[i],Math.sin(a)*radius);pos.push(...v.toArray());uv.push(j/R,i/N);
      if(i<N&&j<R){const k=i*(R+1)+j;idx.push(k,k+1,k+R+1,k+1,k+R+2,k+R+1);}
    }
  }
  for(const end of [0,1]){const center=pos.length/3,v=path.getPointAt(end),base=end*N*(R+1);pos.push(...v.toArray());uv.push(.5,end);for(let j=0;j<R;j++)end?idx.push(center,base+j,base+j+1):idx.push(center,base+j+1,base+j);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();
  let mat=c;if(typeof c==='string'){const outline=Math.min(.0018,r*.2),key='curve:'+c+':'+outline;if(!mats.has(key))mats.set(key,toon(c,{outline}));mat=mats.get(key);}return mesh(p,n,geo,mat);
}
function blade(p,n,outline,depth,c){const s=new THREE.Shape(outline.map(v=>new THREE.Vector2(...v)));return mesh(p,n,new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelThickness:.0015,bevelSize:.0015,bevelSegments:2,steps:1,curveSegments:20}),c);}
function grain(base='#845d3e'){
  const key='grain'+base;if(mats.has(key))return mats.get(key);
  const map=canvasTexture(256,512,(ctx,w,h)=>{
    ctx.fillStyle=base;ctx.fillRect(0,0,w,h);
    for(let i=0;i<42;i++){const x=(i*71)%w;ctx.strokeStyle=i%3?'rgba(44,28,17,.20)':'rgba(232,204,153,.20)';ctx.lineWidth=i%4===0?2:1;ctx.beginPath();ctx.moveTo(x,0);ctx.bezierCurveTo(x+Math.sin(i)*17,h*.31,x-Math.cos(i)*21,h*.68,x+Math.sin(i*2)*8,h);ctx.stroke();}
  });const m=toon('#fff',{map,outline:.0018});mats.set(key,m);return m;
}

export function bottle({color=null,graduated=false,flask=false}={}){
  const r=group('reference_glass_bottle');
  const glass=toon('#dfebe6',{transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide,outline:false});
  const H=flask?.26:.125,K=H/.125;
  const rows=[[0,.001],[.020,.001],[.024,.004],[.025,.011],[.025,.076],[.023,.082],[.013,.095],[.010,.101],[.010,.120],[.012,.120],[.012,.124],[.008,.124],[.008,.101],[.011,.096],[.021,.081],[.022,.074],[.022,.007],[.019,.005],[0,.005]];
  lathe(r,'hollow_glass',rows.map(([a,b])=>[a*K,b*K]),glass);
  ring(r,'bottle_rim',.010*K,.0014*K,'#aabbb1',[0,H-.002*K,0]).rotation.x=PI/2;
  if(color){
    lathe(r,'liquid',[[0,.005],[.021,.005],[.022,.010],[.022,.068],[.021,.071],[0,.071]].map(([a,b])=>[a*K,b*K]),toon(color,{transparent:true,opacity:.82,outline:0}));
    const meniscus=ring(r,'meniscus',.021*K,.0007*K,color,[0,.070*K,0]);meniscus.rotation.x=PI/2;
  }
  if(!graduated){lathe(r,'cork',[[0,.115],[.008,.115],[.010,.118],[.010,.130],[0,.130]].map(([a,b])=>[a*K,b*K]),grain('#ac8862'));}
  if(graduated)for(let i=0;i<6;i++)box(r,'etched_measure_'+i,[i%2?.017*K:.024*K,.00055*K,.0005*K],'#9b5b54',[0,(.015+i*.012)*K,.0252*K],.0001);
  sweep(r,'glass_highlight',[[.015*K,.015*K,.018*K],[.015*K,.047*K,.019*K],[.014*K,.073*K,.017*K]],.0007*K,'#f1f0d7',.0002*K);
  return r;
}

export function mushroom(){
  const r=group('reference_mushroom');
  sweep(r,'curved_stem',[[0,0,0],[-.003,.018,.002],[.001,.042,0],[.002,.055,0]],.011,'#d9c7a6',.007);
  lathe(r,'cap',[[0,.055],[.012,.056],[.029,.050],[.036,.046],[.037,.049],[.032,.061],[.020,.071],[.004,.074],[0,.074]],'#a3764d',[0,0,0],true);
  for(let i=0;i<22;i++){const a=i*PI/11;sweep(r,'gill_'+i,[[Math.cos(a)*.010,.052,Math.sin(a)*.010],[Math.cos(a)*.024,.048,Math.sin(a)*.024],[Math.cos(a)*.034,.047,Math.sin(a)*.034]],.0006,'#73533a',.0003);}
  return r;
}

export function onion(leaves=false){
  const r=group('reference_onion');
  lathe(r,'papery_bulb',[[0,0],[.018,.004],[.032,.015],[.039,.037],[.034,.058],[.020,.075],[.010,.086],[.006,.099],[0,.102]],'#c9a579',[0,0,0],true);
  for(let i=0;i<15;i++){
    const a=i*2*PI/15;const points=[[.005,.003],[.026,.013],[.038,.037],[.032,.059],[.015,.080],[.006,.096]].map(([rad,y])=>[Math.cos(a)*rad,y,Math.sin(a)*rad]);
    sweep(r,'skin_fold_'+i,points,.0007,i%3?'#b88d60':'#e2c595',.00035);
  }
  for(let i=0;i<7;i++)sweep(r,'root_'+i,[[0,.002,0],[Math.sin(i)*.013,-.008,Math.cos(i)*.008],[Math.sin(i*2)*.017,-.015,Math.cos(i)*.013]],.0008,'#987249',.00015);
  if(leaves)for(let i=0;i<7;i++){
    const a=i*2.4,len=.15+(i%3)*.035;
    sweep(r,'onion_leaf_'+i,[[0,.09,0],[Math.sin(a)*.01,.14,Math.cos(a)*.01],[Math.sin(a)*.04,.09+len*.7,Math.cos(a)*.035],[Math.sin(a)*.08,.09+len,Math.cos(a)*.06]],.0038,i%2?'#6c8443':'#849655',.0002);
  }
  return r;
}

export function tool(kind){
  const r=group('reference_'+kind),steel='#aeb3a7',edge='#deddd0',dark='#3e423d';
  if(kind==='key'){
    ring(r,'bow',.025,.0045,'#b59655',[0,.15,0]);
    lathe(r,'shaft',[[.005,0],[.005,.12],[.007,.124],[.007,.129],[.004,.133]],'#b59655');
    for(const [x,y,h]of [[.012,.016,.018],[.012,.044,.013]])box(r,'bit',[.022,h,.009],'#aa8b4d',[x,y,0],.001);
    return r;
  }
  if(kind==='needle_thread'){
    lathe(r,'spool',[[.020,0],[.020,.006],[.013,.009],[.013,.055],[.020,.058],[.020,.064],[0,.064]],grain('#b8976c'));
    for(let i=0;i<32;i++)ring(r,'thread_winding',.014,.0009,'#8c3334',[0,.010+i*.00135,0]).rotation.x=PI/2;
    sweep(r,'loose_thread',[[.013,.031,0],[.043,.020,.009],[.053,.072,.007],[.025,.086,0]],.0008,'#8c3334');
    const n=group('needle');r.add(n);n.position.set(.035,.005,0);n.rotation.z=.37;
    sweep(n,'needle_shaft',[[0,0,0],[0,.105,0]],.0013,steel,.0001);
    const eye=ring(n,'needle_eye',.003,.00065,steel,[0,.108,0]);eye.scale.y=1.6;return r;
  }
  if(kind==='horn'){
    const pts=[[0,0,0],[.03,.05,0],[.06,.12,-.01],[.055,.20,-.015],[.02,.27,0]];
    sweep(r,'horn_wall',pts,.040,'#c2b28b',.001);
    const mouth=ring(r,'hollow_mouth',.035,.005,'#8c7f60',[0,0,0]);mouth.rotation.x=PI/2;
    mesh(r,'mouth_depth',new THREE.CircleGeometry(.030,24),material('#39382c'),[0,.001,0]).rotation.x=-PI/2;return r;
  }
  if(kind==='hammer'){
    sweep(r,'handle',[[0,0,0],[.006,.13,0],[0,.29,0]],.014,grain('#96734b'),.011);
    box(r,'hammer_head',[.135,.048,.046],dark,[0,.29,0],.006);
    box(r,'striking_face',[.013,.052,.052],steel,[-.069,.29,0]);
    for(const s of [-1,1])sweep(r,'claw_'+s,[[.05,.30,s*.012],[.081,.30,s*.014],[.093,.27,s*.014]],.009,dark,.003);return r;
  }
  if(kind==='staff'){
    lathe(r,'ebony_staff',[[0,0],[.014,0],[.013,.12],[.010,1.36],[.017,1.39],[.014,1.43],[0,1.43]],grain('#4c493f'));
    for(const y of [.12,1.37,1.42])ring(r,'staff_ferrule',.015,.0025,'#b7a267',[0,y,0]).rotation.x=PI/2;
    ball(r,'carved_palm',[.037,.046,.014],'#cfc7b0',[0,1.47,0]);
    for(let i=0;i<4;i++){
      const x=(i-1.5)*.018,tipY=1.56+(i===1?.014:0)-(i===3?.012:0);
      sweep(r,'finger_'+i,[[x,1.495,0],[x*1.2,1.535,.004],[x*1.15,tipY,.012]],.0075,'#d7cfb9',.004);
      ball(r,'knuckle_'+i,[.008,.009,.008],'#c1b8a0',[x,1.510,.001]);
    }
    sweep(r,'thumb',[[.025,1.458,0],[.055,1.475,.009],[.065,1.502,.015]],.009,'#d7cfb9',.004);return r;
  }
  if(kind==='bow'){
    sweep(r,'bow_limb',[[.02,0,0],[-.025,.09,0],[0,.22,0],[.05,.34,0],[0,.48,0],[-.025,.59,0],[.02,.68,0]],.013,grain('#9a794a'),.006);
    sweep(r,'bow_string',[[.02,0,0],[.02,.34,0],[.02,.68,0]],.0011,'#c4ba98');
    for(let i=0;i<11;i++)ring(r,'grip_wrap',.015,.0013,'#694f32',[.033,.296+i*.007,0]).rotation.x=PI/2;return r;
  }
  if(kind==='arrow'){
    sweep(r,'arrow_shaft',[[0,0,0],[0,.44,0]],.0035,grain('#a5885b'),.0028);
    blade(r,'arrow_head',[[0,.52],[-.018,.43],[0,.445],[.018,.43]],.003,steel);
    for(const s of [-1,1])blade(r,'fletching_'+s,[[s*.004,.025],[s*.023,.055],[s*.023,.105],[s*.004,.085]],.0015,'#d5cfba');return r;
  }
  if(kind==='shovel'){
    const grip=ring(r,'D_grip',.045,.009,grain('#8d6b49'),[0,.76,0]);grip.scale.y=1.25;
    sweep(r,'shovel_shaft',[[0,.16,0],[0,.70,0]],.012,grain('#967047'));
    blade(r,'spade',[[-.065,.22],[-.075,.10],[-.052,.035],[0,0],[.052,.035],[.075,.10],[.065,.22]],.012,steel);
    sweep(r,'spade_rib',[[0,.035,.015],[0,.13,.022],[0,.22,.014]],.004,edge);return r;
  }
  if(kind==='axe'){
    sweep(r,'axe_handle',[[0,0,0],[-.012,.12,0],[.006,.27,0],[0,.44,0]],.014,grain('#96754c'),.012);
    blade(r,'axe_head',[[-.035,.39],[.018,.43],[.055,.41],[.135,.45],[.147,.37],[.127,.28],[.058,.33],[.01,.34],[-.035,.34]],.027,steel);
    sweep(r,'axe_cutting_edge',[[.135,.45,.028],[.148,.37,.028],[.127,.28,.028]],.0025,edge);return r;
  }
  // 刀与砍刀：刃面、磨锋、木柄、铆钉分开，刀柄不再是无纹理的方棍。
  const long=kind==='machete',L=long?.33:.24;
  blade(r,'knife_blade',[[0,.075],[-.018,.09],[-.020,L-.02],[-.009,L],[.014,L-.008],[.021,L-.06],[.019,.075]],.005,steel);
  sweep(r,'sharpened_edge',[[.019,.083,.005],[.021,L-.06,.005],[.014,L-.008,.005],[-.009,L,.005]],.0014,edge,.0005);
  box(r,'knife_handle',[.036,.09,.024],grain('#68492f'),[0,.035,0],.007);
  for(const y of [.012,.058])ball(r,'rivet',[.0023,.0023,.0011],'#b6b29d',[0,y,.013]);
  return r;
}

function leaf(p,name,base,tip,width,color){
  const A=new THREE.Vector3(...base),B=new THREE.Vector3(...tip),D=B.clone().sub(A),side=new THREE.Vector3(D.y,-D.x,.1).normalize().multiplyScalar(width),pos=[],idx=[];
  for(let i=0;i<=12;i++){const t=i/12,center=A.clone().lerp(B,t);center.z+=Math.sin(t*PI)*width*.65;const w=Math.sin(t*PI);
    for(const s of [-1,0,1]){const v=center.clone().addScaledVector(side,s*w);v.z-=Math.abs(s)*width*.22*w;pos.push(...v.toArray());}
    if(i<12)for(let j=0;j<2;j++){const a=i*3+j;idx.push(a,a+3,a+1,a+1,a+3,a+4);}}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();const m=toon(color,{side:THREE.DoubleSide,outline:.0008});mesh(p,name,geo,m);
  sweep(p,name+'_vein',[base,A.clone().lerp(B,.5).add(new THREE.Vector3(0,0,width*.7)).toArray(),tip],width*.025,'#798a48',width*.004);
}

function lettuceHead(){
  const r=group('reference_lettuce');
  const key='lettuce_veins';let texture=mats.get(key);
  if(!texture){
    texture=canvasTexture(256,256,(g,w,h)=>{
      g.fillStyle='#bccb8d';g.fillRect(0,0,w,h);g.strokeStyle='rgba(232,239,181,.70)';g.lineWidth=3;
      g.beginPath();g.moveTo(w/2,0);g.lineTo(w/2,h);g.stroke();g.lineWidth=1.6;
      for(let i=1;i<9;i++)for(const s of [-1,1]){const y=i*h/10;g.beginPath();g.moveTo(w/2,y);g.quadraticCurveTo(w/2+s*w*.30,y-14,w/2+s*w*.48,y-36);g.stroke();}
    });mats.set(key,texture);
  }
  for(let n=0;n<24;n++){
    const layer=Math.floor(n/8),a=n*2.39996,len=.092-layer*.017,width=.047-layer*.007,rise=.024+layer*.029,rows=18,cols=16,pos=[],uv=[],ix=[];
    for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){
      const t=i/rows,u=j/cols*2-1,rad=len*Math.sin(t*(1.57+layer*.26)),across=u*width*Math.pow(Math.sin(t*PI),.75);
      const frill=Math.pow(Math.abs(u),3)*t*.007*Math.sin(t*26+n*.7);
      const y=.005+layer*.007+rise*Math.sin(t*PI*.82)+.012*u*u*Math.sin(t*PI)+frill;
      pos.push(Math.cos(a)*rad-Math.sin(a)*across,y,Math.sin(a)*rad+Math.cos(a)*across);uv.push(j/cols,t);
      if(i<rows&&j<cols){const k=i*(cols+1)+j;ix.push(k,k+1,k+cols+1,k+1,k+cols+2,k+cols+1);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();
    const c=['#759050','#91a567','#b1bf7d'][layer],mk='lettuce_mat_'+layer;
    if(!mats.has(mk))mats.set(mk,toon(c,{map:texture,side:THREE.DoubleSide,outline:.0007}));
    mesh(r,'ruffled_leaf_'+n,g,mats.get(mk));
  }
  return r;
}

export function food(kind){
  const r=group('reference_'+kind);
  if(kind==='mushroom')return mushroom();if(kind==='onion')return onion();
  if(kind==='carrot'){
    lathe(r,'carrot',[[0,0],[.006,.020],[.017,.080],[.024,.150],[.022,.180],[.013,.191],[0,.191]],'#ca7838');
    for(let i=0;i<9;i++){const y=.04+i*.016;const m=ring(r,'carrot_crease',.010+i*.0011,.0007,'#a85f30',[0,y,0]);m.rotation.x=PI/2;}
    for(let i=0;i<5;i++)leaf(r,'carrot_leaf_'+i,[0,.185,0],[Math.sin(i*2.4)*.06,.26+(i%2)*.02,Math.cos(i*2.4)*.025],.012,'#5b7845');return r;
  }
  if(kind==='strawberry'){
    const rows=[[0,0],[.009,.004],[.023,.025],[.028,.047],[.023,.059],[0,.062]];
    lathe(r,'berry_flesh',rows,'#a8423d',[0,0,0],true);
    for(let i=0;i<46;i++){const a=i*2.4,y=.009+(i%7)*.0064;let j=1;while(j<rows.length-1&&rows[j][1]<y)j++;const t=(y-rows[j-1][1])/(rows[j][1]-rows[j-1][1]),rad=THREE.MathUtils.lerp(rows[j-1][0],rows[j][0],t);ball(r,'seed',[.0008,.0012,.0008],'#cda658',[Math.cos(a)*rad,y,Math.sin(a)*rad]);}
    for(let i=0;i<6;i++)leaf(r,'calyx_'+i,[0,.060,0],[Math.cos(i)*.025,.061,Math.sin(i)*.025],.006,'#597646');return r;
  }
  if(kind==='tomato'){
    const g=new THREE.SphereGeometry(1,32,20),p=g.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),a=Math.atan2(z,x),lobe=1+.045*Math.cos(a*6)*(1-Math.abs(p.getY(i)));p.setXYZ(i,x*.046*lobe,p.getY(i)*.039+.039,z*.046*lobe);}g.computeVertexNormals();mesh(r,'lobed_tomato',g,'#a84437');
    for(let i=0;i<6;i++)leaf(r,'tomato_sepal_'+i,[0,.076,0],[Math.cos(i)*.034,.072,Math.sin(i)*.034],.006,'#536b3a');return r;
  }
  if(kind==='cucumber'){
    const b=ball(r,'cucumber',[.022,.12,.022],'#607747',[0,.12,0]);b.rotation.z=.05;
    for(let i=0;i<8;i++){const a=i*PI/4;sweep(r,'cucumber_rib_'+i,[[Math.cos(a)*.015,.015,Math.sin(a)*.015],[Math.cos(a)*.022,.09,Math.sin(a)*.022],[Math.cos(a)*.020,.20,Math.sin(a)*.020]],.0009,'#87915b',.0004);}return r;
  }
  if(kind==='lettuce'){
    return lettuceHead();
  }
  if(kind==='pistachio'){
    for(const s of [-1,1]){const sh=ball(r,'shell_'+s,[.010,.022,.008],'#d2b889',[s*.008,.024,0]);sh.rotation.z=-s*.27;}
    ball(r,'kernel',[.009,.017,.010],'#7d8b46',[0,.025,.005]);return r;
  }
  if(kind==='egg'){
    lathe(r,'eggshell',[[0,0],[.014,.004],[.023,.018],[.025,.036],[.020,.059],[.010,.073],[0,.077]],'#d8cfb5');return r;
  }
  if(kind==='apple'){
    for(let i=0;i<5;i++){const a=i*PI*.4;ball(r,'apple_lobe',[.027,.036,.028],i%2?'#bcad59':'#c5b665',[Math.cos(a)*.014,.037,Math.sin(a)*.014]);}
    sweep(r,'apple_stem',[[0,.067,0],[.002,.085,0]],.0025,'#665338',.0015);leaf(r,'apple_leaf',[.001,.077,0],[.026,.090,0],.007,'#667b48');return r;
  }
  if(kind==='worm'){
    const points=[];for(let i=0;i<8;i++)points.push([Math.sin(i*.8)*.019,.006,i*.012]);sweep(r,'segmented_worm',points,.005,'#aa8268',.0025);
    for(let i=1;i<17;i++){const a=i/17*7;ring(r,'worm_annulus',.0048,.00035,'#805b49',[Math.sin(a*.8)*.019,.006,a*.012]).rotation.x=PI/2;}return r;
  }
  if(kind==='pepper'){
    lathe(r,'pepper_saucer',[[0,0],[.04,0],[.05,.006],[.055,.016],[.052,.019],[.044,.010],[0,.007]],'#d8ccb1');
    for(let i=0;i<21;i++){const a=i*2.4,rad=.007+((i*7)%11)*.003;ball(r,'peppercorn',[.004,.0038,.004],i%2?'#4a3a2b':'#65543c',[Math.cos(a)*rad,.010+(i%3)*.002,Math.sin(a)*rad]);}return r;
  }
  return null;
}

export function mandolin(){
  const r=group('reference_mandolin');
  const outline=new THREE.Shape();outline.moveTo(0,.03);outline.bezierCurveTo(-.17,.03,-.18,.23,-.09,.32);outline.quadraticCurveTo(-.02,.38,-.018,.41);outline.lineTo(.018,.41);outline.quadraticCurveTo(.02,.38,.09,.32);outline.bezierCurveTo(.18,.23,.17,.03,0,.03);
  const hole=new THREE.Path();hole.absarc(0,.235,.029,0,PI*2,true);outline.holes.push(hole);
  const body=new THREE.ExtrudeGeometry(outline,{depth:.040,bevelEnabled:true,bevelSize:.009,bevelThickness:.012,bevelSegments:3,curveSegments:32});mesh(r,'soundboard',body,grain('#b18a58'));
  ball(r,'bowl_back',[.135,.17,.072],grain('#725138'),[0,.20,-.025]);
  mesh(r,'soundhole',new THREE.CircleGeometry(.029,32),'#302d24',[0,.235,.029]);
  ring(r,'rosette',.034,.0018,'#6a5134',[0,.235,.054]);ring(r,'rosette_inlay',.038,.0008,'#c3b08a',[0,.235,.054]);
  box(r,'neck',[.031,.28,.029],grain('#725138'),[0,.49,.011]);box(r,'fingerboard',[.029,.29,.006],'#3a342b',[0,.49,.030],.001);
  box(r,'headstock',[.050,.094,.018],grain('#906a45'),[0,.675,.018],.005);box(r,'bridge',[.070,.014,.010],'#59422e',[0,.125,.057]);
  for(let i=0;i<11;i++)box(r,'fret_'+i,[.030,.001,.003],'#b6ae90',[0,.36+i*.021,.035],.0002);
  for(let i=0;i<4;i++){const x=(i-1.5)*.006;sweep(r,'string_'+i,[[x,.125,.064],[x,.34,.044],[x,.70,.034]],.00045,'#c5bfa8');for(const s of [-1,1])ball(r,'tuning_peg',[.009,.004,.004],'#d6c8a4',[s*.033,.65+i*.016,.018]);}
  return r;
}

export function lantern(){
  const r=group('reference_lantern');
  lathe(r,'foot',[[0,0],[.055,0],[.062,.008],[.050,.025],[.046,.036]],'#5a594a');
  const glass=toon('#e3d9b5',{transparent:true,opacity:.25,depthWrite:false,side:THREE.DoubleSide,outline:false});
  for(const s of [-1,1])for(const t of [-1,1])sweep(r,'frame_post',[[s*.042,.03,t*.042],[s*.051,.19,t*.051]],.0045,'#5b5948');
  for(let i=0;i<4;i++){const g=mesh(r,'glass_panel',new THREE.PlaneGeometry(.09,.15),glass,[Math.sin(i*PI/2)*.047,.11,Math.cos(i*PI/2)*.047]);g.rotation.y=i*PI/2;}
  const cap=new THREE.ConeGeometry(.082,.06,4);cap.rotateY(PI/4);mesh(r,'pitched_roof',cap,'#686653',[0,.22,0]);
  ring(r,'carrying_loop',.026,.0035,'#686653',[0,.29,0]);
  lathe(r,'candle',[[0,.025],[.012,.025],[.012,.097],[.009,.10],[0,.10]],'#d9c9a0');
  ball(r,'flame',[.008,.018,.008],'#e2b66a',[0,.117,0]);return r;
}

export function clusterFood(kind,count){
  const r=group('reference_'+kind+'_cluster');
  for(let i=0;i<count;i++){const item=food(kind);item.position.set((i-(count-1)/2)*.045,0,Math.sin(i*2.4)*.018);item.rotation.y=i*.6;r.add(item);}
  return r;
}

export function iceCream(flavor){
  const r=group('reference_ice_cream_'+flavor),coneColor='#bc965e';
  lathe(r,'wafer_cone',[[0,0],[.003,.008],[.031,.121],[.033,.125],[.029,.126],[.001,.008]],coneColor);
  for(const side of [-1,1])for(let line=0;line<12;line++){
    const points=[];
    for(let j=1;j<=16;j++){const t=j/16,y=t*.123,a=line*PI/6+side*t*2.15,rad=y*.25+.001;points.push([Math.cos(a)*rad,y,Math.sin(a)*rad]);}
    sweep(r,'waffle_ridge',points,.0008,'#ddbb81',.0008);
  }
  const g=new THREE.SphereGeometry(1,32,24),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),n=1+.035*Math.sin(x*21+y*7)*Math.cos(z*19-y*11);p.setXYZ(i,x*.039*n,y*.035*n+.148,z*.039*n);}g.computeVertexNormals();
  mesh(r,'ice_cream_scoop',g,flavor==='pistachio'?'#a0b47b':'#cc9095');
  for(let i=0;i<9;i++){const a=i*PI*2/9;ball(r,'scoop_edge',[.010,.006,.010],flavor==='pistachio'?'#9eae77':'#c68b90',[Math.cos(a)*.029,.125,Math.sin(a)*.029]);}
  return r;
}

/** 两层有厚度的泪滴形贝壳：外壳生长纹与内部珍珠层共用同一壳沿。开口朝 +Y，铰链在 -X。 */
export function musselValve({length=.09,width=.047,depth=.017}={}){
  const pos=[],uv=[],idx=[],R=18,N=56,wall=.0014;
  const vertex=(r,a,inner)=>{
    const c=Math.cos(a),s=Math.sin(a),shape=.78+.22*c;
    const x=c*length*.5*r,z=s*width*.5*shape*r;
    const y=-depth*(1-r*r)*(1+.04*Math.sin(a*9)*r)+(inner?wall*(1-.25*r):0);
    return[x,y,z];
  };
  const starts=[];
  for(let inner=0;inner<2;inner++){
    const base=pos.length/3;starts.push(base);pos.push(...vertex(0,0,inner));uv.push(.5,.5);
    for(let i=1;i<=R;i++)for(let j=0;j<N;j++){const a=j/N*PI*2;pos.push(...vertex(i/R,a,inner));uv.push(.5+Math.cos(a)*i/R*.5,.5+Math.sin(a)*i/R*.5);}
    const tri=(a,b,c)=>inner?idx.push(a,b,c):idx.push(a,c,b);
    for(let j=0;j<N;j++)tri(base,base+1+(j+1)%N,base+1+j);
    for(let i=1;i<R;i++)for(let j=0;j<N;j++){const a=base+1+(i-1)*N+j,b=base+1+(i-1)*N+(j+1)%N;tri(a,b,a+N);tri(b,b+N,a+N);}
  }
  const outerCount=(2*R-1)*N*3;
  for(let j=0;j<N;j++){const a=starts[0]+1+(R-1)*N+j,b=starts[0]+1+(R-1)*N+(j+1)%N,c=starts[1]+1+(R-1)*N+j,d=starts[1]+1+(R-1)*N+(j+1)%N;idx.push(a,c,b,b,c,d);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();geo.addGroup(0,outerCount,0);geo.addGroup(outerCount,outerCount,1);geo.addGroup(outerCount*2,N*6,1);
  const key='mussel_growth_material';let shell=mats.get(key);
  if(!shell){
    const map=canvasTexture(384,384,(g,w,h)=>{
      g.fillStyle='#4d3b49';g.fillRect(0,0,w,h);g.lineWidth=1.7;
      for(let i=1;i<24;i++){g.strokeStyle=i%3?'rgba(160,129,148,.35)':'rgba(213,185,198,.45)';g.beginPath();g.ellipse(w*.04,h*.5,i*w/24,i*h/38,0,0,PI*2);g.stroke();}
      g.lineWidth=.8;g.strokeStyle='rgba(220,202,202,.15)';for(let i=0;i<25;i++){const a=(i-12)*.10;g.beginPath();g.moveTo(w*.04,h*.5);g.lineTo(w,h*.5+Math.sin(a)*h*.6);g.stroke();}
    });shell=toon('#fff',{map,outline:.0007});mats.set(key,shell);
  }
  return new THREE.Mesh(geo,[shell,toon('#b8a8b4',{outline:.0005})]);
}

export function specimen(kind){
  const r=group('reference_'+kind);
  if(kind==='scissors'){
    for(const s of [-1,1]){
      const arm=group('scissor_half_'+s);r.add(arm);arm.rotation.z=s*.17;
      const handle=ring(arm,'finger_loop',.022,.005,'#4a4b42',[-.090,s*.019,0]);handle.scale.x=1.3;
      sweep(arm,'tang',[[-.072,s*.025,0],[-.035,s*.012,0],[.005,0,0]],.0055,'#8c9185');
      blade(arm,'scissor_blade',[[0,0],[.112,s*.013],[.13,s*.004],[.038,-s*.010]],.005,'#b2b5a7');
    }
    const rivet=mesh(r,'pivot_rivet',new THREE.CylinderGeometry(.007,.007,.013,18),'#a4a996',[0,0,.005]);rivet.rotation.x=Math.PI/2;return r;
  }
  if(kind==='swatter'){
    sweep(r,'turned_wood_handle',[[-.22,0,0],[-.15,.002,0],[-.06,0,0],[.035,0,0]],.009,grain('#99744b'),.007);
    ball(r,'handle_end',[.011,.011,.011],grain('#99744b'),[-.222,0,0]);
    const featherMat=toon('#eee9dd',{side:THREE.DoubleSide,outline:.0007});
    for(let n=0;n<13;n++){
      const a=(n/12-.5)*1.05,len=.205-Math.abs(n-6)*.009,w=.019+(n%3)*.001,rows=24,cols=8,pos=[],uv=[],ix=[];
      const point=(t,u)=>{
        const breadth=Math.pow(Math.sin(PI*t),.7)*w*u*(1+.05*Math.sin(t*53+n));
        const x=.025+t*len,y=breadth+t*t*.018,z=Math.sin(t*PI)*.008+(1-u*u)*.002;
        return[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a),z+(n%3)*.002];
      };
      for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){
        pos.push(...point(i/rows,j/cols*2-1));uv.push(j/cols,i/rows);
        if(i<rows&&j<cols){const k=i*(cols+1)+j;ix.push(k,k+1,k+cols+1,k+1,k+cols+2,k+cols+1);}
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(ix);geo.computeVertexNormals();mesh(r,'separate_feather_'+n,geo,featherMat);
      sweep(r,'feather_quill_'+n,[point(0,0),point(.38,0),point(.74,0),point(1,0)],.0012,'#b8ad91',.0002);
      for(let i=3;i<16;i++)for(const s of [-1,1])sweep(r,'barbs_'+n+'_'+i+'_'+s,[point(i/18,0),point((i+1)/18,s*.50),point((i+2)/18,s*.96)],.00027,'#c8bfaa',.00012,{segments:4,radial:4});
    }
    for(let i=0;i<7;i++){const twine=ring(r,'binding_'+i,.010-i*.00035,.0014,'#70573a',[-.012+i*.006,0,0]);twine.rotation.y=PI/2;}
    return r;
  }
  if(kind==='snail'){
    const body=new THREE.SphereGeometry(1,40,20),p=body.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),base=.005+Math.max(0,x)*.013;p.setXYZ(i,x*.052,y<0?base*(1+y):base+y*.016,z*.017*(1-.22*x));}body.computeVertexNormals();mesh(r,'continuous_foot',body,'#8b8393');
    sweep(r,'raised_neck',[[.028,.015,0],[.040,.024,0],[.052,.028,0]],.012,'#8b8393',.009);
    for(const s of [-1,1]){
      sweep(r,'foot_frill_'+s,[[-.043,.004,s*.006],[-.025,.005,s*.016],[.006,.005,s*.018],[.039,.006,s*.011]],.0012,'#b0a7b5',.0007);
      sweep(r,'eye_stalk_'+s,[[.045,.030,s*.005],[.052,.042,s*.009],[.059,.050,s*.012]],.0018,'#a39aaa',.0011);
      ball(r,'eye_'+s,[.0021,.0021,.0021],'#34303b',[.059,.050,s*.012]);
      sweep(r,'short_feeler_'+s,[[.050,.023,s*.005],[.063,.027,s*.014]],.0012,'#a39aaa',.0006);
    }
    const shell=new THREE.SphereGeometry(1,64,40),sp=shell.attributes.position;
    for(let i=0;i<sp.count;i++){
      const x=sp.getX(i),y=sp.getY(i),z=sp.getZ(i),rad=Math.hypot(x,y),phase=Math.atan2(y,x)-Math.log(Math.max(.03,rad))/.205;
      sp.setXYZ(i,-.009+x*.029,.035+y*.030,z*.017*(1+.035*Math.sin(phase)));
    }
    shell.computeVertexNormals();mesh(r,'continuous_shell_whorls',shell,toon('#b99973',{outline:.0007}));
    for(const side of [-1,1]){
      const pts=[];
      for(let i=0;i<=110;i++){const t=i/110,a=-PI*.25-(1-t)*PI*4.6,rad=.0015*Math.exp(2.9*t);pts.push([-.009+Math.cos(a)*rad,.035+Math.sin(a)*rad,side*(.017*Math.sqrt(Math.max(0,1-(rad/.029)**2))+.0004)]);}
      sweep(r,'spiral_suture_'+side,pts,.00055,'#705541',.00055,{segments:110,radial:4});
    }
    const aperture=ring(r,'shell_aperture_lip',.011,.0022,'#c6a780',[.012,.020,0]);aperture.rotation.y=PI/2;aperture.scale.y=1.25;
    return r;
  }
  if(kind==='mussel'){
    const lower=musselValve();lower.name='lower_valve';r.add(lower);
    ball(r,'mussel_mantle',[.030,.006,.014],'#ca8e4b',[.007,-.006,0]);
    ball(r,'mussel_body',[.022,.008,.010],'#e8aa55',[.012,-.004,.002]);
    for(const s of [-1,1])sweep(r,'mantle_fold_'+s,[[-.018,-.003,s*.008],[.008,.003,s*.013],[.031,-.003,s*.007]],.002,'#aa6934',.001);
    const hinge=group('upper_hinge');hinge.position.x=-.045;r.add(hinge);const upper=musselValve();upper.geometry.rotateX(PI).translate(.045,0,0);upper.name='upper_valve';hinge.add(upper);hinge.rotation.z=.92;
    r.rotation.x=.30;return r;
  }
  if(kind==='ear'){
    ball(r,'concha',[.020,.038,.010],'#bd947c',[0,.042,0]);
    sweep(r,'helix',[[.003,.003,.006],[-.021,.018,.010],[-.027,.054,.006],[-.018,.083,.003],[.007,.088,.002],[.026,.067,.006],[.018,.045,.010]],.007,'#d4ae93',.0045);
    sweep(r,'antihelix',[[.004,.020,.012],[-.009,.042,.016],[-.006,.064,.013],[.008,.074,.010]],.004,'#cda387',.0025);
    ball(r,'ear_canal',[.006,.009,.003],'#8f6858',[.009,.041,.011]);ball(r,'tragus',[.006,.008,.007],'#d4ae93',[.017,.035,.016]);ball(r,'earlobe',[.014,.014,.009],'#d4ae93',[0,.012,.005]);return r;
  }
  if(kind==='berries'){
    for(let i=0;i<11;i++){
      const a=i*2.4,rad=.012+(i%3)*.007,x=Math.sin(a)*rad,z=Math.cos(a)*rad,y=.015+(i%3)*.013;
      ball(r,'currant_'+i,[.0105,.011,.0105],i%3?'#973c3d':'#b14b48',[x,y,z]);
      sweep(r,'berry_stalk_'+i,[[0,.086,0],[x*.5,.060,z*.5],[x,y+.010,z]],.0009,'#576b3b',.0005);
      for(let j=0;j<4;j++){const b=j*PI/2;sweep(r,'calyx',[[x,y-.011,z],[x+Math.cos(b)*.003,y-.012,z+Math.sin(b)*.003]],.0006,'#6a3c36');}
    }
    leaf(r,'berry_leaf',[0,.08,0],[.035,.106,.009],.011,'#526f3b');return r;
  }
  if(kind==='honey'){
    const shape=new THREE.Shape();for(let i=0;i<6;i++){const a=i*PI/3,x=Math.cos(a)*.056,y=Math.sin(a)*.043;if(i)shape.lineTo(x,y);else shape.moveTo(x,y);}shape.closePath();
    const centers=[[0,0],[-.021,0],[.021,0],[-.0105,.018],[.0105,.018],[-.0105,-.018],[.0105,-.018]];
    for(const[x,y]of centers){const hole=new THREE.Path();for(let j=0;j<6;j++){const a=j*PI/3,X=x+Math.cos(a)*.0085,Y=y+Math.sin(a)*.0085;if(j)hole.lineTo(X,Y);else hole.moveTo(X,Y);}hole.closePath();shape.holes.push(hole);}
    const wax=new THREE.ExtrudeGeometry(shape,{depth:.023,bevelEnabled:true,bevelSize:.001,bevelThickness:.001,bevelSegments:1});wax.rotateX(-PI/2);mesh(r,'honeycomb_cells',wax,'#bf9144');
    for(const[x,z]of centers){const m=mesh(r,'honey_cell_depth',new THREE.CircleGeometry(.008,6),'#8e692e',[x,.004,-z]);m.rotation.x=-PI/2;}
    ball(r,'honey_pool',[.064,.003,.049],toon('#ba8a37',{transparent:true,opacity:.78,outline:false}),[.008,.002,0]);return r;
  }
  if(kind==='feather'){
    sweep(r,'quill',[[-.095,.003,0],[-.020,.004,0],[.090,.003,0]],.0022,'#d8cdb0',.0004);
    for(let i=0;i<34;i++){
      const x=-.058+i*.0043,span=Math.sin((i+2)/37*PI)*.027;
      for(const s of [-1,1]){
        const shape=new THREE.Shape();shape.moveTo(x,0);shape.quadraticCurveTo(x-.010,s*span*.65,x-.022,s*span);shape.quadraticCurveTo(x-.007,s*span*.82,x+.003,0);shape.closePath();
        const geo=new THREE.ShapeGeometry(shape,8);geo.rotateX(-PI/2);geo.translate(0,.004+Math.sin(i*.3)*.001,0);mesh(r,'feather_barb',geo,toon(i%7===0?'#b8a17c':'#ded2b4',{side:THREE.DoubleSide,outline:false}));
      }
    }return r;
  }
  if(kind==='shrimp'){
    const points=[[.02,.022,.010],[-.003,.030,0],[-.033,.021,-.001],[-.044,.006,0],[-.034,.004,0],[-.020,.011,0]];
    const path=new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v)));
    for(let i=0;i<10;i++){const t=i/10,p=path.getPoint(t),next=path.getPoint(Math.min(1,t+.06)),m=ball(r,'carapace_segment',[.008*(1-t*.65),.0085*(1-t*.6),.009*(1-t*.55)],i%2?'#c47b50':'#b56a45',p.toArray());m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),next.sub(p).normalize());}
    for(const s of [-1,1]){
      ball(r,'shrimp_eye',[.002,.002,.002],'#28291d',[.024,.032,s*.006]);
      sweep(r,'antenna',[[.021,.031,s*.004],[.047,.047,s*.010],[.071,.045,s*.017]],.0008,'#88543a',.0002);
      for(let i=0;i<5;i++)sweep(r,'shrimp_leg',[[.009-i*.008,.020,s*.006],[.007-i*.008,.006,s*.015],[.014-i*.008,.002,s*.019]],.0009,'#a95f3e',.0002);
      const tail=ball(r,'tail_fan',[.009,.0015,.005],'#c6875e',[-.014,.012,s*.005]);tail.rotation.y=s*.45;
    }return r;
  }
  throw new Error('未登记的标本模型：'+kind);
}

/** 合并指定的静态表面；门、灯光和热点保留独立节点，以便状态可逆恢复。 */
export function batchStaticSurfaces(root,select=()=>true){
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),batches=new Map();
  root.traverse(n=>{
    if(!n.isMesh||n.userData.proxy||!select(n)||Array.isArray(n.material))return;
    const key=n.material.uuid+'|'+Object.keys(n.geometry.attributes).sort().join(',');
    if(!batches.has(key))batches.set(key,[]);batches.get(key).push(n);
  });
  for(const nodes of batches.values()){
    if(nodes.length<2)continue;
    const geometry=mergeGeometries(nodes.map(n=>{const g=n.geometry.index?n.geometry.toNonIndexed():n.geometry.clone();return g.applyMatrix4(inverse.clone().multiply(n.matrixWorld));}),false);
    if(!geometry)throw Error('静态表面合并失败');
    const merged=new THREE.Mesh(geometry,nodes[0].material);merged.name='reference_static_surfaces';merged.castShadow=merged.receiveShadow=true;
    nodes.forEach(n=>n.removeFromParent());root.add(merged);
  }
}

/** 只替换静态外观；原名、热点代理、状态方法和收取位置继续由原工厂负责。 */
export function rebuildItems(factories, recipes) {
  for(const [id,recipe] of Object.entries(recipes)){
    const original=factories[id];if(!original)throw new Error('重建清单不存在的道具：'+id);
    factories[id]=(...args)=>{
      const root=original(...args),item=recipe();if(!item)throw new Error('重建未生成网格：'+id);
      root.updateMatrixWorld(true);item.updateMatrixWorld(true);
      const oldBox=new THREE.Box3(),newBox=new THREE.Box3();
      const collect=(o,b)=>o.traverse(n=>{if(n.isMesh&&!n.userData.proxy&&n.visible){if(!n.geometry.boundingBox)n.geometry.computeBoundingBox();b.union(n.geometry.boundingBox.clone().applyMatrix4(n.matrixWorld));}});
      collect(root,oldBox);collect(item,newBox);
      const oldSize=oldBox.getSize(new THREE.Vector3()),newSize=newBox.getSize(new THREE.Vector3());
      const k=Math.max(...oldSize.toArray())/Math.max(...newSize.toArray());
      const center=oldBox.getCenter(new THREE.Vector3()),nc=newBox.getCenter(new THREE.Vector3());
      // 所有变换烘进新网格，运行时道具根节点仍然 scale=1。
      const meshes=[];item.traverse(n=>{if(n.isMesh)meshes.push([n,n.matrixWorld.clone()]);});
      for(const[n,m]of meshes){m.premultiply(new THREE.Matrix4().makeScale(k,k,k));m.premultiply(new THREE.Matrix4().makeTranslation(center.x-nc.x*k,center.y-nc.y*k,center.z-nc.z*k));n.geometry=n.geometry.clone().applyMatrix4(m);}
      item.traverse(n=>{n.position.set(0,0,0);n.quaternion.identity();n.scale.set(1,1,1);});
      const batches=new Map();
      for(const[n]of meshes){if(Array.isArray(n.material))continue;const key=n.material.uuid+'|'+Object.keys(n.geometry.attributes).sort().join(',');if(!batches.has(key))batches.set(key,[]);batches.get(key).push(n);}
      for(const nodes of batches.values()){
        if(nodes.length<2)continue;
        const geometry=mergeGeometries(nodes.map(n=>n.geometry.index?n.geometry.toNonIndexed():n.geometry),false);
        if(!geometry)throw Error('静态道具合批失败：'+id);
        const merged=new THREE.Mesh(geometry,nodes[0].material);merged.name='reference_static_surfaces';merged.castShadow=merged.receiveShadow=true;
        nodes.forEach(n=>n.removeFromParent());item.add(merged);
      }
      for(const child of [...root.children])child.traverse(n=>{if(n.isMesh&&!n.userData.proxy)n.visible=false;});
      root.add(item);root.userData.referenceRemodel=true;root.userData.referenceItem=id;
      return root;
    };
  }
}
