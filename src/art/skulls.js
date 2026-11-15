// 原作头骨的立体重建：颅盖、贯通眼眶、颧弓、分离的鼻骨和牙槽；墙饰与餐盘共用。
import * as THREE from 'three';
import { toon } from './materials.js';
import { sculptedDeerGeometry } from './deer_skull_mesh.js';

const V = (a) => new THREE.Vector3(...a);
const BONE = toon('#ddd4b8', { outline: 0.002 });
const EDGE = toon('#c7b997', { outline: 0.0012 });
const INSIDE = toon('#635944', { side: THREE.DoubleSide, outline: 0 });
const SUTURE = toon('#8d8267', { outline: 0 });

function part(root, name, geometry, material = BONE) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name; m.castShadow = true; m.receiveShadow = true;
  root.add(m); return m;
}

// 沿高度放样闭合截面。各截面的前后深度独立，吻部向前探出，不再是一块挤出的平板。
function loft(root, name, rows, material = BONE, segments = 24) {
  const pos = [], index = [];
  rows.forEach(([y, x, rx, z, rz]) => {
    for (let j = 0; j <= segments; j++) {
      const a = j / segments * Math.PI * 2;
      pos.push(x + Math.cos(a) * rx, y, z + Math.sin(a) * rz);
    }
  });
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < segments; j++) {
    const a = i * (segments + 1) + j, b = a + segments + 1;
    index.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index); g.computeVertexNormals();
  return part(root, name, g, material);
}

function curve(root, name, points, radius, material = BONE, endRadius = radius) {
  const path = new THREE.CatmullRomCurve3(points.map(V));
  const frames = path.computeFrenetFrames(28, false), p = [], idx = [], radial = 8;
  for (let i = 0; i <= 28; i++) {
    const c = path.getPointAt(i / 28), r = THREE.MathUtils.lerp(radius, endRadius, i / 28);
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2;
      const v = c.clone().addScaledVector(frames.normals[i], Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r);
      p.push(...v.toArray());
      if (i < 28 && j < radial) { const k = i * (radial + 1) + j; idx.push(k, k + 1, k + radial + 1, k + 1, k + radial + 2, k + radial + 1); }
    }
  }
  const first=p.length/3,last=first+1;p.push(...path.getPointAt(0).toArray(),...path.getPointAt(1).toArray());
  for(let j=0;j<radial;j++){idx.push(first,j+1,j);const end=28*(radial+1);idx.push(last,end+j,end+j+1);}
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(idx); g.computeVertexNormals();
  return part(root, name, g, material);
}

// 眼眶是真实的骨环及向后收拢的腔壁；侧面也能看见开口和深度。
function orbit(root, name, x, y, z, rx, ry, angle = 0) {
  const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); g.rotation.y = angle; root.add(g);
  const ring = new THREE.TorusGeometry(1, .105, 8, 36);
  ring.scale(rx, ry, Math.min(rx, ry)); part(g, name + '_rim', ring);
  const p = [], idx = [], N = 32;
  for (let layer = 0; layer < 3; layer++) for (let j = 0; j <= N; j++) {
    const a = j / N * Math.PI * 2, k = 1 - layer * .18;
    p.push(Math.cos(a) * rx * .9 * k, Math.sin(a) * ry * .9 * k, -layer * .022);
    if (layer < 2 && j < N) { const n = layer * (N + 1) + j; idx.push(n, n + 1, n + N + 1, n + 1, n + N + 2, n + N + 1); }
  }
  const wall = new THREE.BufferGeometry(); wall.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); wall.setIndex(idx); wall.computeVertexNormals();
  part(g, name + '_cavity', wall, INSIDE);
  const back = new THREE.CircleGeometry(1, 24); back.scale(rx*.66, ry*.66, 1); back.translate(0, 0, -.046);
  part(g, name + '_depth', back, INSIDE);
  return g;
}

/** 鹿头骨默认高 0.51 m，原点对齐 1 号房木盾中心，正面 +Z。 */
export function makeDeerBone({ antlers = false, raw = false } = {}) {
  const root = new THREE.Group(); root.name = 'deer_bone_anatomy';
  if(!raw){
    part(root,'sculpted_deer_bone',sculptedDeerGeometry()).receiveShadow=false;
    for(const s of [-1,1]){const eye=orbit(root,'orbit_'+s,s*.089,.081,.124,.037,.047,s*.42);eye.traverse(o=>{if(o.isMesh){o.visible=o.name.endsWith('_depth');o.receiveShadow=false;}});}
    const cavity=new THREE.SphereGeometry(1,20,12);cavity.scale(.019,.037,.020);cavity.translate(0,-.206,.146);part(root,'nasal_cavity',cavity,INSIDE);
    curve(root,'sagittal_suture',[[0,.251,.095],[.002,.218,.138],[-.002,.189,.149],[.001,.148,.151],[0,.119,.145]],.0009,SUTURE,.0005);
    curve(root,'nasal_mid_suture',[[0,.11,.164],[.0004,.04,.181],[-.0005,-.04,.193],[.0004,-.13,.199],[0,-.174,.196]],.00055,SUTURE,.00035);
    if(antlers){const source=makeDeerBone({antlers:true,raw:true});for(const child of [...source.children])if(child.name.startsWith('antler_'))root.add(child);}
    root.userData.anatomy='deer:sculpted_open_orbits,zygomatic_arch,nasal_plates';return root;
  }
  loft(root, 'cranial_vault', [
    [.258, 0, .002, .070, .002], [.246, 0, .048, .075, .038],
    [.218, 0, .079, .078, .061], [.178, 0, .090, .083, .069],
    [.135, 0, .077, .083, .062], [.109, 0, .048, .079, .050],
  ]);
  loft(root, 'frontal_bridge', [[.17,0,.033,.131,.018],[.108,0,.036,.143,.018],[.048,0,.022,.155,.014],[.005,0,.014,.166,.009]]);
  for (const s of [-1, 1]) {
    loft(root, 'frontal_ridge_' + s, [[.20, s * .040, .020, .128, .015], [.13, s * .043, .030, .129, .022], [.075, s * .041, .022, .137, .020], [.025, s * .024, .010, .152, .010]]);
    orbit(root, 'orbit_' + s, s * .089, .081, .124, .037, .047, s * .42);
    curve(root, 'zygomatic_arch_' + s, [[s * .068, .164, .070], [s * .122, .112, .072], [s * .127, .055, .086], [s * .100, .016, .124], [s * .054, -.035, .146]], .011, BONE, .0065);
    loft(root, 'maxilla_' + s, [[.044, s * .050, .024, .101, .035], [-.030, s * .044, .022, .115, .034], [-.112, s * .030, .014, .135, .031], [-.198, s * .026, .010, .158, .024], [-.241, s * .022, .006, .160, .010]]);
    loft(root, 'nasal_plate_' + s, [[.064, s * .016, .015, .157, .009], [-.014, s * .015, .014, .172, .010], [-.086, s * .013, .012, .183, .008], [-.153, s * .011, .009, .191, .006], [-.188, s * .010, .004, .188, .002]], BONE, 16);
    curve(root, 'nasal_border_' + s, [[s * .014, -.168, .185], [s * .023, -.199, .182], [s * .017, -.237, .173], [0, -.245, .173]], .004, BONE, .003);
    curve(root, 'tear_fossa_' + s, [[s * .057, .046, .149], [s * .041, .004, .154], [s * .031, -.052, .165]], .0012, SUTURE, .0005);
    // 牙槽在骨的后侧，近看有真实的独立咬合面。
    for (let i = 0; i < 5; i++) {
      const t = new THREE.SphereGeometry(1, 8, 6); t.scale(.005, .009, .010); t.translate(s * (.037 - i * .003), -.055 - i * .021, .107 + i * .005);
      part(root, 'molar_' + s + '_' + i, t, EDGE);
    }
    const pedicle = new THREE.CylinderGeometry(.021, .027, .061, 16);
    pedicle.rotateZ(-s * .36); pedicle.translate(s * .068, .218, .065); part(root, 'pedicle_' + s, pedicle, EDGE);
    if (antlers) {
      const a = [[s*.068,.23,.065],[s*.12,.29,.042],[s*.19,.37,.025],[s*.24,.49,.01],[s*.25,.61,-.005]];
      curve(root, 'antler_beam_' + s, a, .017, EDGE, .001);
      for (let i = 0; i < 3; i++) curve(root, 'antler_tine_' + s + '_' + i, [[s*(.12+i*.045),.29+i*.085,.04], [s*(.19+i*.054),.30+i*.11,.035],[s*(.23+i*.05),.37+i*.11,.01]], .008-i*.0015, EDGE, .0008);
    }
  }
  loft(root,'nasal_bridge_shell',[[.115,0,.033,.150,.011],[.040,0,.029,.166,.013],[-.040,0,.024,.179,.012],[-.130,0,.018,.188,.009],[-.180,0,.012,.189,.006],[-.191,0,.003,.186,.003]],BONE,24);
  // 后方鼻腔深在两片鼻骨之间，不与正面的骨面共面。
  const cavity = new THREE.SphereGeometry(1, 20, 12); cavity.scale(.019, .037, .020); cavity.translate(0, -.206, .146); part(root, 'nasal_cavity', cavity, INSIDE);
  curve(root, 'sagittal_suture', [[0,.251,.095],[.002,.218,.138],[-.002,.189,.149],[.001,.148,.151],[0,.119,.145]], .0009, SUTURE, .0005);
  root.userData.anatomy = 'deer:open_orbits,zygomatic_arch,nasal_plates';
  return root;
}

/** 第六灾地上的牛头骨：宽额、向前的长吻和上扬中空牛角。 */
export function makeBovineBone(){
  const root=new THREE.Group();root.name='reference_bovine_skull';
  const face=makeDeerBone();face.rotation.x=-Math.PI/2;face.position.set(0,.065,.025);root.add(face);
  for(const s of [-1,1]){
    curve(root,'horn_'+s,[[s*.075,.17,-.17],[s*.19,.18,-.20],[s*.32,.23,-.18],[s*.41,.34,-.09],[s*.43,.40,-.04]],.034,EDGE,.001);
    for(let i=0;i<4;i++){
      const ridge=new THREE.TorusGeometry(.031-i*.001,.0015,6,20);ridge.rotateY(Math.PI/2);ridge.translate(s*(.12+i*.022),.175+i*.006,-.184);part(root,'horn_growth_ridge',ridge,EDGE);
    }
  }
  return root;
}

/** 地上的羊头骨：眼眶、鼻腔和颧弓复用雕刻面，角向颅后弯曲。 */
export function makeGoatBone({size=.26,horns=true}={}){
  const root=new THREE.Group();root.name='reference_goat_skull';
  const face=makeDeerBone();face.rotation.x=-Math.PI/2;root.add(face);
  root.updateMatrixWorld(true);const k=size/.51;
  const bake=[];root.traverse(o=>{if(o.isMesh)bake.push([o,o.matrixWorld.clone()]);});
  for(const[o,m]of bake)o.geometry=o.geometry.clone().applyMatrix4(m).scale(k,k,k);
  root.traverse(o=>{o.position.set(0,0,0);o.quaternion.identity();o.scale.set(1,1,1);});
  if(horns)for(const s of [-1,1]){
    curve(root,'goat_horn_'+s,[[s*size*.13,size*.20,-size*.38],[s*size*.24,size*.43,-size*.51],[s*size*.26,size*.53,-size*.83],[s*size*.17,size*.29,-size*1.01]],size*.052,EDGE,size*.003);
  }
  return root;
}

/** 人类头骨有独立颅后部、眉弓、颧弓、梨状鼻孔及上下牙列。 */
export function makeHumanBone(size=.12){
  const r=new THREE.Group();r.name='reference_human_skull';
  loft(r,'cranial_dome',[[.064,0,.003,-.006,.003],[.058,0,.029,-.005,.023],[.036,0,.043,-.006,.033],[.019,0,.042,-.014,.025],[.003,0,.029,-.023,.018],[-.014,0,.022,-.023,.010]]);
  for(const s of [-1,1]){
    orbit(r,'human_orbit_'+s,s*.023,.004,.027,.016,.017,s*.13);
    curve(r,'brow_'+s,[[s*.004,.019,.033],[s*.023,.026,.031],[s*.040,.015,.022]],.004,BONE,.002);
    curve(r,'zygomatic_'+s,[[s*.041,.010,.005],[s*.047,-.006,.020],[s*.035,-.018,.035],[s*.020,-.023,.035]],.005,BONE,.003);
    loft(r,'maxillary_'+s,[[-.017,s*.018,.009,.032,.008],[-.028,s*.015,.012,.033,.009],[-.035,s*.015,.011,.029,.007]],BONE,16);
    curve(r,'mandibular_ramus_'+s,[[s*.039,-.010,.008],[s*.034,-.043,.009],[s*.022,-.050,.033],[0,-.051,.039]],.005,EDGE,.004);
    for(let i=0;i<4;i++){
      const x=s*(.003+i*.006),z=.040-i*i*.0012;
      const tooth=new THREE.SphereGeometry(1,10,8);tooth.scale(.0031,.0045,.0042);tooth.translate(x,-.035,z);part(r,'upper_tooth',tooth);
      const lower=tooth.clone().translate(0,-.010,-.001);part(r,'lower_tooth',lower);
    }
  }
  curve(r,'nasal_bridge',[[0,.023,.033],[0,.005,.041],[0,-.009,.043]],.003,BONE,.002);
  const nasal=new THREE.Shape();nasal.moveTo(0,-.010);nasal.lineTo(-.006,-.023);nasal.quadraticCurveTo(0,-.027,.006,-.023);nasal.closePath();
  const hole=new THREE.ShapeGeometry(nasal);hole.translate(0,0,.041);part(r,'piriform_aperture',hole,INSIDE);
  curve(r,'frontal_suture',[[0,.060,.010],[.001,.046,.026],[0,.031,.029]],.0005,SUTURE,.0003);
  const k=size/.12;r.updateMatrixWorld(true);const bake=[];r.traverse(o=>{if(o.isMesh)bake.push([o,o.matrixWorld.clone()]);});
  for(const[o,m]of bake)o.geometry=o.geometry.clone().applyMatrix4(m).scale(k,k,k);
  r.traverse(o=>{o.position.set(0,0,0);o.quaternion.identity();o.scale.set(1,1,1);});return r;
}

/** 餐盘与标本上的不同物种：保留各自的颅吻比例，不再全部共用两个球。 */
export function makeDisplaySkull(kind = 'deer', size = .25) {
  const root = new THREE.Group(); root.name = 'anatomical_skull_' + kind;
  if (kind === 'deer' || kind === 'horse') {
    const bone = makeDeerBone({ antlers: kind === 'deer' }); root.add(bone);
    const scale = size / .45;
    bone.traverse(o => { if (o.isMesh) o.geometry = o.geometry.clone().scale(scale * (kind === 'horse' ? .82 : 1), scale, scale); });
    // 眼眶是局部节点，其平移也按同一比例烘入。
    bone.traverse(o => { if (!o.isMesh) o.position.multiplyScalar(scale); });
    return root;
  }
  const bird = kind === 'bird' || kind === 'pigeon' || kind === 'pheasant';
  const k = size;
  loft(root, 'braincase', [[k*.45,0,k*.01,0,k*.01],[k*.36,0,k*.38,0,k*.31],[0,0,k*.47,0,k*.38],[-k*.25,0,k*.25,k*.08,k*.22],[-k*.28,0,k*.01,k*.08,k*.01]]);
  for (const s of [-1,1]) {
    orbit(root, 'eye_' + s, s*k*.29, k*.04, k*.27, k*(bird?.23:.16), k*(bird?.24:.17), s*.45);
    curve(root, 'cheek_arch_' + s, [[s*k*.31,k*.15,-k*.1],[s*k*.49,-k*.03,k*.03],[s*k*.40,-k*.2,k*.35],[s*k*.18,-k*.2,k*.49]], k*.045);
  }
  if (bird) {
    const shape = new THREE.Shape(); shape.moveTo(-k*.15,k*.02); shape.quadraticCurveTo(0,-k*.02,k*.15,k*.02); shape.quadraticCurveTo(k*.12,-k*.23,0,-k*.65); shape.quadraticCurveTo(-k*.12,-k*.23,-k*.15,k*.02);
    const beak = new THREE.ExtrudeGeometry(shape,{depth:k*.10,bevelEnabled:true,bevelSize:k*.025,bevelThickness:k*.025,bevelSegments:2,steps:1});
    beak.rotateX(-Math.PI/2.7); beak.translate(0,-k*.09,k*.35); part(root,'hollow_beak',beak);
    curve(root,'beak_seam',[[0,-k*.05,k*.39],[0,-k*.15,k*.64],[0,-k*.33,k*.90]],k*.009,SUTURE,k*.002);
  } else {
    loft(root,'snout',[[-k*.05,0,k*.25,k*.24,k*.20],[-k*.18,0,k*.27,k*.49,k*.27],[-k*.33,0,k*.21,k*.55,k*.20],[-k*.36,0,k*.01,k*.52,k*.01]]);
    for(const s of [-1,1]) { orbit(root,'nostril_'+s,s*k*.10,-k*.19,k*.71,k*.055,k*.065); curve(root,'tusk_'+s,[[s*k*.22,-k*.30,k*.48],[s*k*.35,-k*.32,k*.54],[s*k*.43,-k*.16,k*.61]],k*.045,BONE,k*.002); }
  }
  root.userData.anatomy = bird ? 'bird:large_orbits,beak' : 'boar:short_rostrum,tusks';
  return root;
}
