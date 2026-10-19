// 神殿转盘、木柴与黑方块仪式；中途读档可继续结尾，恢复时避免重复下降。
import { makeProp } from '../../art/props.js';
import { W, SPOTS, playEnding } from './world.js';
import { prop, closeup, instant, replaceProp, numberFlag } from './shared.js';
import { DIAL, dialNext, dialSolved } from './puzzles.js';
let S;
const HOLDER_OPTIONS={ropeLength:3.05};
function cleanFont(font) {
  // 第一灾的圣水盆默认脉动血色；只调整本章实例，保留公共模型和其它章节的材质。
  const u=font.getObjectByName('font_liquid').material.uniforms;
  u.uRedDark.value.copy(u.uGreyDark.value);u.uRedMid.value.copy(u.uGreyLight.value);u.uRedLight.value.set('#565854');
  font.userData.state.ambient=false;return font;
}
async function finishRitual(ctx) {
  if(!ctx.flag('cube_inserted')||ctx.flag('plague2_complete'))return;
  if(!ctx.flag('holder_closed')){await S.holder.close();ctx.setFlag('holder_closed');}
  await ctx.go('temple_int');
  if(!ctx.flag('holder_lowered')){await S.holder.lower(1.2-S.holder.userData.state.lowered);ctx.setFlag('holder_lowered');}
  ctx.sfx('holy');await S.font.ignite();await ctx.wait(700);await ctx.go('painting');
  if(!ctx.flag('frogs_banished')){await S.painting.glowCube();await S.painting.banishFrogs();ctx.setFlag('frogs_banished');}
  if(!ctx.flag('woman_framed')){await S.painting.frameWoman();ctx.setFlag('woman_framed');}
  await playEnding(ctx);
}
export async function setup(ctx) {
  const position=id=>ctx.world.anchor(id).getWorldPosition(new ctx.THREE.Vector3()).toArray();
  const holder=prop(ctx,'winged_holder',{pos:position('temple_int.holder'),options:HOLDER_OPTIONS},'temple_int'),font=cleanFont(prop(ctx,'font',{pos:position('temple_int.font')},'temple_int'));
  ctx.world.buildings.sets.temple_int.getObjectByName('temple_int_rope').visible=false;
  const painting=makeProp('plague_painting');painting.position.copy(font.getObjectByName('font_niche').position);painting.position.z+=.01;font.add(painting);ctx.register('prop','p2_plague_painting',painting);painting.cleanStream();
  const stool=prop(ctx,'temple_stool',SPOTS.temple.stool,'temple_int'),cabinet=prop(ctx,'dial_cabinet',SPOTS.temple.cabinet,'temple_int'),wood=prop(ctx,'wood_pile',SPOTS.woodPile);
  const belt=makeProp('belt');belt.position.set(0,.48,0);belt.scale.setScalar(1.2);stool.add(belt);
  // 腰带是中空的细环（约 31×14×18 cm）：点在环中间会穿过去，镜头微偏时也容易滑出去，点击区域放宽成一个盒子
  const beltHit=ctx.hotspots.makeProxy(.44,.17,.36,[0,.48,0],stool);
  S={holder,font,painting,stool,cabinet,wood,belt};Object.assign(W,S);
  closeup(ctx,'cabinet',cabinet,'temple_int',{zone:'temple_int',target:[0,.6,0],eye:[0,.64,1.55],fov:43});
  closeup(ctx,'dial',cabinet.dial,'cabinet',{zone:'temple_int',target:[0,0,0],eye:[0,0,.59],fov:48});
  closeup(ctx,'holder',holder,'temple_int',{zone:'temple_int',target:[0,-.24,0],eye:[0,-.18,1.5],fov:36});
  closeup(ctx,'painting',painting,'temple_int',{zone:'temple_int',target:[0,.177,0],eye:[0,.18,.7],fov:41});
  ctx.hotspots.define({id:'wood_pile',views:['lake_shore','temple_door'],object:wood,cursor:'grab',when:()=>!ctx.flag('wood_taken'),onClick:async()=>{ctx.setFlag('wood_taken');wood.visible=false;await ctx.give('wood',{from:wood});}});
  ctx.hotspots.define({id:'temple_belt',views:['temple_int'],object:beltHit,cursor:'grab',when:()=>!ctx.flag('belt_taken'),onClick:async()=>{ctx.setFlag('belt_taken');belt.visible=false;await ctx.give('belt',{from:stool});}});
  ctx.hotspots.define({id:'cabinet',views:['temple_int'],object:cabinet,cursor:'zoom',goto:'cabinet'});
  ctx.hotspots.define({id:'cabinet_door',views:['cabinet'],object:cabinet.getObjectByName('cabinet_door_hit'),cursor:'pointer',onClick:async()=>{
    if(!ctx.flag('dial_solved'))return ctx.go('dial');ctx.setFlag('cabinet_open');ctx.sfx('cabinet_open');await cabinet.open();
  }});
  ctx.hotspots.define({id:'cabinet_flute',views:['cabinet'],object:cabinet.getObjectByName('cabinet_flute'),cursor:'grab',when:()=>ctx.flag('cabinet_open')&&!ctx.flag('flute_taken'),onClick:async()=>{ctx.setFlag('flute_taken');cabinet.takeFlute();await ctx.give('frog_flute',{from:cabinet});}});
  for(const ring of['mid','out'])ctx.hotspots.define({id:`dial_${ring}`,views:['dial'],object:cabinet.getObjectByName(`dial_${ring}_hit`),cursor:'pointer',when:()=>!ctx.flag('dial_solved'),onClick:()=>ctx.cutscene(async()=>{
    const step=dialNext(ring,numberFlag(ctx,`dial_${ring}`,DIAL[ring].start));ctx.setFlag(`dial_${ring}`,step);ctx.sfx('dial_click');await cabinet.setRing(ring,step);
    if(dialSolved(numberFlag(ctx,'dial_mid',DIAL.mid.start),numberFlag(ctx,'dial_out',DIAL.out.start))){ctx.setFlag('dial_solved');await cabinet.solve();await ctx.ui.flash('#e8c27a');await ctx.go('cabinet');}
  })});
  ctx.hotspots.define({id:'holder',views:['temple_int','holder'],object:holder.getObjectByName('holder_body'),cursor:'use',when:()=>!ctx.flag('plague2_complete'),onClick:async()=>{
    if(ctx.flag('cube_inserted'))return ctx.cutscene(()=>finishRitual(ctx));
    if(ctx.state.view!=='holder')return ctx.go('holder');if(!ctx.flag('holder_open')){await S.holder.open();ctx.setFlag('holder_open');}
  },onItem:{black_cube:()=>ctx.cutscene(async()=>{
    if(!ctx.flag('cube_taken'))return;
    if(!ctx.flag('holder_open')){await S.holder.open();ctx.setFlag('holder_open');}
    if(!ctx.flag('cube_inserted')){ctx.take('black_cube');await S.holder.insertCube();ctx.setFlag('cube_inserted');}
    await finishRitual(ctx);
  })}});
  ctx.hotspots.define({id:'painting',views:['painting'],object:painting,cursor:'pointer',when:()=>ctx.flag('cube_inserted')&&!ctx.flag('plague2_complete'),onClick:()=>ctx.cutscene(()=>finishRitual(ctx))});
}
export function sync(ctx) {
  if(!S)return;
  const cube=!!ctx.flag('cube_inserted'),closed=!!ctx.flag('holder_closed'),lit=!!ctx.flag('holder_lowered');
  if(S.holder.userData.state.cube&&!cube){S.holder=replaceProp(ctx,S.holder,'winged_holder',HOLDER_OPTIONS);ctx.hotspots.get('holder').object=S.holder.getObjectByName('holder_body');}
  if(ctx.flag('holder_open')&&!closed)S.holder.open(instant);else S.holder.close(instant);
  if(cube)S.holder.insertCube(instant);
  const lowering=lit?1.2:0;S.holder.lower(lowering-S.holder.userData.state.lowered,instant);
  if(S.font.userData.state.lit&&!lit){
    const p=S.painting;S.font=cleanFont(replaceProp(ctx,S.font,'font'));S.painting=makeProp('plague_painting');S.painting.position.copy(p.position);S.font.add(S.painting);ctx.register('prop','p2_plague_painting',S.painting);
  }else if((S.painting.userData.state.banished&&!ctx.flag('frogs_banished'))||(S.painting.userData.state.womanFramed&&!ctx.flag('woman_framed'))){const p=S.painting;S.painting=makeProp('plague_painting');S.painting.position.copy(p.position);p.removeFromParent();S.font.add(S.painting);ctx.register('prop','p2_plague_painting',S.painting);}
  S.painting.cleanStream();if(lit)S.font.ignite(instant);if(ctx.flag('frogs_banished'))S.painting.banishFrogs(instant);if(ctx.flag('woman_framed'))S.painting.frameWoman(instant);
  ctx.hotspots.get('painting').object=S.painting;
  S.wood.visible=!ctx.flag('wood_taken');S.belt.visible=!ctx.flag('belt_taken');S.cabinet.setRing('mid',numberFlag(ctx,'dial_mid',DIAL.mid.start),instant);S.cabinet.setRing('out',numberFlag(ctx,'dial_out',DIAL.out.start),instant);S.cabinet.setSolved(!!ctx.flag('dial_solved'));S.cabinet.setOpen(!!ctx.flag('cabinet_open'));S.cabinet.setFlute(!ctx.flag('flute_taken'));
  Object.assign(W,{holder:S.holder,font:S.font,painting:S.painting});
}
export const walkthrough=[{go:'temple_door'},{click:'wood_pile'},{click:'temple_entry'},{click:'temple_belt'},{click:'cabinet'},{click:'cabinet_door'},{repeat:5,step:{click:'dial_mid'}},{repeat:4,step:{click:'dial_out'}},{click:'cabinet_door'},{click:'cabinet_flute'},{back:true},{back:true}];
