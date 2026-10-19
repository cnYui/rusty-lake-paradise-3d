// 睡莲与蛙卵盆按参考视频的轮廓和配对外形建模；棋盘状态由章节提供，模型只呈现状态。
import { THREE, TAU, toon, unlit, canvasTexture, mesh, lathe, rod, merge, hit, motion, woodMaterial, seg } from './props_p2_shared.js';
import { makeFrog } from './props_frogs.js';

function padGeometry(radius) {
  const shape = new THREE.Shape(); shape.moveTo(0, 0);
  for (let i = 0; i <= 48; i++) { const a = .22 + i / 48 * (TAU - .44); shape.lineTo(Math.cos(a) * radius, Math.sin(a) * radius); }
  shape.closePath(); return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}
export function makeLilyBoard({ cell = .55 } = {}) {
  const root = new THREE.Group(); root.name = 'lily_board';
  const leaf = toon('#79926c', { side: THREE.DoubleSide }), stone = toon('#979996'), bark = woodMaterial('#8a6238', 23);
  const pads = new THREE.Group(); root.add(pads);
  const frog = makeFrog(); frog.scale.setScalar(2.2); root.add(frog); root.frog = frog;
  const objects = new Map(); let current = [0, 0], def, rotations = [];
  const key = p => p.join(','); const xyz = ([c, r]) => [c * cell, .025, r * cell];
  const mark = o => merge(o, [rod([-.065,.055,0],[.065,.055,0],.004),rod([0,.055,-.065],[0,.055,.065],.004)], toon('#44453e',{outline:false}), 'cross');
  root.setLevel = (level, opts = {}) => {
    def = level; pads.children.slice().forEach(o => { pads.remove(o); o.traverse(m => m.geometry?.dispose()); }); objects.clear(); rotations = [];
    for (const p of level.pads) {
      const o = new THREE.Group(); o.position.fromArray(xyz(p)); o.name = `pad_${p.join('_')}`; pads.add(o);
      const m = mesh(o, padGeometry(cell*.43), leaf.clone(), 'leaf'); m.rotation.y = (p[0]*3.1+p[1]*2.7)%TAU;
      const veins=[]; for(let i=1;i<=9;i++){const a=i*.59;veins.push(rod([0,.004,0],[Math.cos(a)*cell*.36,.004,Math.sin(a)*cell*.36],.0018,4));}
      merge(o,veins,toon('#587349',{outline:false}),'veins');objects.set(key(p),o);rotations.push([o,m.rotation.y]);
    }
    for (const [p, kind] of [[level.start,'stone'],[level.goal,level.goalKind]]) {
      const o=new THREE.Group();o.position.fromArray(xyz(p));pads.add(o);objects.set(key(p),o);
      if(kind==='stump'){
        mesh(o,new THREE.CylinderGeometry(cell*.39,cell*.43,.1,24),bark,'stump',[0,.008,0]);
        mesh(o,new THREE.CircleGeometry(cell*.36,36),woodMaterial('#a47c50',41),'stump_top',[0,.06,0],[-Math.PI/2,0,0]);
        for(let i=1;i<5;i++)mesh(o,new THREE.TorusGeometry(cell*(.05+i*.057),.0018,4,40),toon('#725332',{outline:false}),'growth_ring',[0,.064,0],[Math.PI/2,0,0]);
      }else{const g=new THREE.CylinderGeometry(cell*.39,cell*.42,.08,7);g.rotateY(p[0]*.73);mesh(o,g,stone,'stone',[0,.015,0]);}mark(o);
    }
    current=[...level.start];frog.visible=true;frog.position.fromArray(xyz(current));frog.position.y+=.08;
    return motion(750,k=>{for(const o of objects.values())o.scale.setScalar(Math.max(.001,k));},opts);
  };
  root.restore=(level,from,left,done=false)=>{
    root.setLevel(level,{instant:true});current=[...from];frog.position.fromArray(xyz(from));frog.position.y+=.08;
    for(const p of level.pads)if(!left.some(c=>key(c)===key(p))&&key(p)!==key(from))objects.get(key(p)).visible=false;
    if(key(from)!==key(level.start))objects.get(key(level.start)).visible=false;
    if(done){for(const [k,o]of objects)o.visible=k===key(level.goal);frog.visible=false;}
  };
  root.setHighlight=cells=>{const selected=new Set(cells.map(key));for(const [k,o]of objects){const m=o.getObjectByName('leaf');if(m)m.material.color.set(selected.has(k)?'#7bc65a':'#79926c');}};
  root.jumpTo=(to,opts={})=>{
    const from=frog.position.clone(),dest=new THREE.Vector3(...xyz(to));dest.y+=.08;const previous=objects.get(key(current));current=[...to];
    return motion(650,k=>{frog.position.lerpVectors(from,dest,k);frog.position.y+=Math.sin(k*Math.PI)*.35;if(previous){previous.position.y=.025-k*.16;previous.scale.setScalar(Math.max(.001,1-k));previous.visible=k<1;}},opts);
  };
  root.fail=opts=>motion(500,k=>{pads.scale.y=1-Math.sin(k*Math.PI)*.12;},opts);
  root.win=opts=>motion(500,k=>{frog.scale.setScalar(Math.max(.001,2.2*(1-k)));if(k===1){frog.visible=false;frog.scale.setScalar(2.2);for(const [id,o]of objects)o.visible=id===key(def.goal);}},opts);
  root.cellWorld=p=>root.localToWorld(new THREE.Vector3(...xyz(p)));
  root.update=(dt,t)=>{frog.update?.(dt,t);for(const [o,phase]of rotations)if(o.visible)o.rotation.y=Math.sin(t*.17+phase)*.06;};return root;
}

export const CLUMP_POSITIONS=[[-.14,-.62],[.18,-.73],[.47,-.62],[-.26,-.33],[.1,-.42],[.59,-.29],[-.49,-.02],[.33,-.14],[-.03,.09],[.47,.2],[-.24,.32],[.18,.47]];
const TYPES=[1,4,3,2,5,5,0,4,0,2,3,1];
function reflectionTexture(){
  return canvasTexture(768,512,g=>{
    const line=(pts,w=3)=>{g.strokeStyle='#485052';g.lineWidth=w;g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke();};
    const ellipse=(x,y,rx,ry,c)=>{g.fillStyle=c;g.beginPath();g.ellipse(x,y,rx,ry,0,0,TAU);g.fill();g.strokeStyle='#485052';g.lineWidth=3;g.stroke();};g.globalAlpha=.6;
    // 倒影自绘，参考帧只用于核对，避免把视频截图作为游戏资产。
    g.fillStyle='#879295';g.beginPath();g.moveTo(218,474);g.lineTo(224,286);g.quadraticCurveTo(238,256,330,264);g.lineTo(352,474);g.fill();
    ellipse(282,226,34,46,'#a0aaa9');line([[254,213],[275,202],[307,210]]);line([[266,238],[279,241],[300,235]],2);
    for(const s of[-1,1])line([[282+s*55,288],[282+s*64,372],[282+s*57,453]]);line([[226,373],[338,373]]);line([[282,379],[282,473]]);
    g.fillStyle='#a5aca2';g.beginPath();g.moveTo(375,474);g.lineTo(380,250);g.lineTo(428,222);g.lineTo(473,251);g.lineTo(490,474);g.fill();
    ellipse(430,182,22,44,'#848d80');line([[418,208],[431,230],[445,203]]);line([[386,298],[451,329],[443,353],[388,331]]);line([[472,294],[410,341],[417,362],[475,329]]);
    for(const s of[-1,1]){line([[430+s*13,149],[430+s*29,121],[430+s*48,92],[430+s*46,56]],5);line([[430+s*29,121],[430+s*62,120],[430+s*80,96]],4);line([[430+s*48,92],[430+s*75,69],[430+s*85,38]],3);line([[430+s*46,66],[430+s*28,47]],3);}
  },{wrap:false});
}
export function makeSpawnBasin(){
  const root=new THREE.Group();root.name='spawn_basin';
  const rim=mesh(root,lathe([[.62,.02],[.73,.02],[.75,.1],[.75,.16],[.71,.19],[.66,.16],[.62,.11],[.62,.02]]),woodMaterial('#98703a',4),'basin_rim');rim.scale.z=.7;
  for(const[r,y,c]of[[.738,.166,'#342d21'],[.679,.164,'#564122'],[.638,.127,'#342c1e']]){const o=mesh(root,new THREE.TorusGeometry(r,.005,5,80),toon(c,{outline:false}),'rim_line',[0,y,0],[Math.PI/2,0,0]);o.scale.y=.7;}
  const waterTex=canvasTexture(768,768,g=>{g.fillStyle='#93908a';g.fillRect(0,0,768,768);for(let i=0;i<520;i++){g.strokeStyle=i%2?'rgba(219,218,209,.065)':'rgba(41,38,34,.045)';g.lineWidth=1;g.beginPath();g.ellipse((i*97)%768,(i*173)%768,8+i%21,3+i%9,i,0,TAU);g.stroke();}});
  const water=mesh(root,new THREE.CircleGeometry(.627,80),toon('#ffffff',{map:waterTex,outline:false}),'basin_water',[0,.112,0],[-Math.PI/2,0,0]);water.scale.y=.64;
  const eggsMat=toon('#b6c9c7',{outline:false}),eyesMat=toon('#25302e',{outline:false}),reedsMat=toon('#42653d',{side:THREE.DoubleSide}),clumps=[];
  for(let i=0;i<12;i++){
    const type=TYPES[i],o=new THREE.Group();o.name=`clump_${i+1}`;const[u,v]=CLUMP_POSITIONS[i];o.position.set(u*.62,.12,v*.4);root.add(o);clumps.push(o);
    const eggs=[],dots=[],width=.065+type*.012,height=.027+type%3*.004;
    // 孪生堆共享布局和尺寸；草丛与轮廓共同构成可读的配对线索。
    for(let j=0;j<42+type*7;j++){const a=j*2.399963,rad=Math.sqrt((j+.5)/(42+type*7)),x=Math.cos(a)*rad*width,z=Math.sin(a)*rad*.032,y=Math.pow(1-rad,.55)*height;const g=new THREE.SphereGeometry(.0075,8,6);g.scale(1,.82,1);g.translate(x,y,z);eggs.push(g);dots.push(new THREE.SphereGeometry(.0024,5,4).translate(x,y+.006,z+.001));}
    merge(o,eggs,eggsMat,'eggs').castShadow=false;merge(o,dots,eyesMat,'egg_centers').castShadow=false;
    const sides=type===1?[-1,1]:type===0||type===3?[1]:[];
    for(const s of sides)for(let j=0;j<(type===3?3:5);j++){
      const h=(type===3?.057:.098)+j*.009,x=s*(width-.008)+j*.008,shape=new THREE.Shape();
      shape.moveTo(0,0);shape.quadraticCurveTo((j-2)*.016,h*.5,(j-2)*.016,h);shape.quadraticCurveTo(.008,h*.48,.006,0);shape.closePath();
      // 倾斜的叶片在俯视和侧面都有轮廓，配对线索不会因为镜头方向消失。
      const reed=mesh(o,new THREE.ShapeGeometry(shape),reedsMat,'reed',[x,0,-.018],[-.67+j*.04,0,.08*s]);reed.castShadow=false;
      mesh(reed,rod([.002,.008,.001],[(j-2)*.01,h*.77,.001],.0009,4),toon('#8f9e64',{outline:false}),'reed_vein').castShadow=false;
    }
    hit(o,`clump_hit_${i+1}`,[width*2+.025,.13,.095],[0,.035,0]);
  }
  const frog=makeFrog();frog.name='basin_frog';frog.scale.setScalar(2.1);frog.position.set(0,.11,.04);frog.visible=false;root.add(frog);
  const vision=mesh(root,new THREE.PlaneGeometry(1.06,.67),unlit('#ffffff',{map:reflectionTexture(),transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}),'basin_vision',[0,.116,0],[-Math.PI/2,0,0]);vision.visible=false;
  root.setClump=(i,on,opts={})=>{const o=clumps[i-1];if(!o)return Promise.resolve();o.visible=true;return motion(500,k=>{const t=on?k:1-k;o.scale.set(1,Math.max(.001,t),1);o.position.y=.06+.06*t;if(k===1)o.visible=!!on;},opts);};
  root.press=(i,opts)=>motion(330,k=>{clumps[i-1].scale.y=1-Math.sin(k*Math.PI)*.4;},opts);
  root.clumpWorld=i=>clumps[i-1].getWorldPosition(new THREE.Vector3());
  root.showFrog=(on,opts={})=>{frog.visible=on;return motion(900,k=>{frog.position.y=.065+.07*k;},opts);};root.hideFrog=()=>{frog.visible=false;};
  root.showVision=(on,opts={})=>{vision.visible=on;return motion(1500,k=>{vision.material.opacity=on?.4*seg(k,0,1):0;},opts);};
  root.update=(dt,t)=>frog.update?.(dt,t);return root;
}
export const FACTORIES={lily_board:makeLilyBoard,spawn_basin:makeSpawnBasin};
