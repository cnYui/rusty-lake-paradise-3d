// 厨房收集、四蛙煮汤和母亲回忆；家具碰撞与特写复用室内漫游系统。
import { makeProp } from '../../art/props.js';
import { W, SPOTS, addKitchenObstacles } from './world.js';
import { character, prop, closeup, instant, numberFlag } from './shared.js';
import { POT_FROGS_NEEDED } from './puzzles.js';
import { T } from './text.js';
let S;
export async function setup(ctx) {
  const k=SPOTS.kitchen,table=prop(ctx,'side_table',k.table,'house_int'),chest=prop(ctx,'chest',k.chest,'house_int'),cauldron=prop(ctx,'cauldron',k.cauldron,'house_int'),frame=prop(ctx,'memory_frame',k.memoryFrame,'house_int');
  const margaret=character(ctx,'margaret_cook',{pos:[k.cauldron.pos[0]+.17,0,k.cauldron.pos[2]-.28],rotY:0},'house_int');
  const bowl=makeProp('bowl'),candle=makeProp('candle');bowl.scale.setScalar(1.2);candle.scale.setScalar(1.25);bowl.position.set(-.09,.586,.02);candle.position.set(.095,.65,-.01);table.add(bowl,candle);ctx.register('prop','p2_kitchen_candle',candle);
  const cube=makeProp('black_cube');cube.scale.setScalar(.65);cube.position.set(k.chest.pos[0],.53,k.chest.pos[2]);W.zones.house_int.add(cube);
  const caroline=character(ctx,'caroline',{pos:[k.memoryFrame.pos[0],0,k.memoryFrame.pos[2]+.32]},'house_int');caroline.root.visible=false;
  S={table,chest,cauldron,frame,margaret,bowl,candle,cube,caroline};Object.assign(W,S);
  addKitchenObstacles({circles:[[k.table.pos[0],k.table.pos[2],.32],[k.cauldron.pos[0],k.cauldron.pos[2],.43],[margaret.root.position.x,margaret.root.position.z,.24]],boxes:[[k.chest.pos[0]-.26,k.chest.pos[2]-.2,k.chest.pos[0]+.26,k.chest.pos[2]+.2]]});
  closeup(ctx,'cauldron',cauldron,'house_int',{zone:'house_int',target:[.02,.8,0],eye:[.02,1.17,2.1],fov:43});
  closeup(ctx,'kitchen_table',table,'house_int',{zone:'house_int',target:[0,.6,0],eye:[0,1.05,1],fov:40});
  ctx.views.define({id:'kitchen_memory',zone:'house_int',closeup:true,look:0,back:'house_int',cam:{pos:[300,1.28,3.05],target:[300,1,-1.2],fov:51}});
  const room=['house_int','kitchen_table'];
  ctx.hotspots.define({id:'kitchen_table',views:['house_int'],object:table.getObjectByName('table_top'),cursor:'zoom',goto:'kitchen_table'});
  ctx.hotspots.define({id:'kitchen_bowl',views:room,object:bowl,cursor:'grab',when:()=>!ctx.flag('kitchen_bowl_taken'),onClick:async()=>{ctx.setFlag('kitchen_bowl_taken');bowl.visible=false;await ctx.give('bowl',{from:table});}});
  ctx.hotspots.define({id:'kitchen_candle',views:room,object:candle,cursor:'grab',when:()=>!ctx.flag('kitchen_candle_taken'),onClick:async()=>{ctx.setFlag('kitchen_candle_taken');candle.visible=false;await ctx.give('candle',{from:table});}});
  ctx.hotspots.define({id:'margaret',views:['house_int','cauldron'],object:margaret.root,cursor:'talk',onClick:async()=>{
    ctx.setFlag('margaret_asked');await ctx.thought(margaret.headTop,'frog',{draw:(g,w,h)=>{g.fillStyle='#eee';g.font=`${h*.38}px serif`;g.fillText('4 ×',w*.12,h*.67);}});
  }});
  const drop=id=>ctx.cutscene(async()=>{
    const n=numberFlag(ctx,'pot_frogs');if(n>=POT_FROGS_NEEDED||ctx.flag('soup_taken'))return;
    ctx.take(id);ctx.setFlag('pot_frogs',n+1);const f=makeProp(id);ctx.sfx('pot_drop');await cauldron.dropFrog(f);cauldron.setFrogs(n+1);cauldron.glow(true);ctx.sfx('pot_glow');
  });
  const putWood=()=>{if(ctx.flag('pot_wood'))return;ctx.take('wood');ctx.setFlag('pot_wood');return cauldron.setWood(true);};
  const light=()=>{if(!ctx.flag('pot_wood')||ctx.flag('pot_lit'))return;ctx.setFlag('pot_lit');ctx.state.select(null);ctx.sfx('fire_light');return cauldron.setLit(true);};
  const fill=()=>ctx.cutscene(async()=>{
    if(numberFlag(ctx,'pot_frogs')!==4||!ctx.flag('pot_lit')||ctx.flag('soup_taken'))return;
    ctx.setFlag('soup_taken');ctx.replace('bowl','frog_soup');ctx.sfx('soup_pour');await ctx.wait(500);
  });
  ctx.hotspots.define({id:'cauldron',views:['house_int','cauldron'],object:cauldron.getObjectByName('cauldron_pot_hit'),cursor:'use',onClick:()=>ctx.state.view==='cauldron'?ctx.thought(margaret.headTop,'frog'):ctx.go('cauldron'),onItem:{frog:()=>drop('frog'),frog_orange:()=>drop('frog_orange'),wood:putWood,candle:light,bowl:fill}});
  ctx.hotspots.define({id:'cauldron_fire',views:['cauldron'],object:cauldron.getObjectByName('cauldron_fire_hit'),cursor:'use',onItem:{wood:putWood,candle:light},onClick:async()=>{if(!ctx.flag('pot_wood'))await ctx.thought(margaret.headTop,'wood');else if(!ctx.flag('pot_lit'))await ctx.thought(margaret.headTop,'candle');}});
  ctx.hotspots.define({id:'chest',views:['house_int'],object:chest,cursor:'use',onClick:async()=>{if(!ctx.flag('chest_open'))await ctx.say(T.chestLocked);},onItem:{key:()=>ctx.cutscene(async()=>{if(ctx.flag('chest_open'))return;ctx.take('key');ctx.setFlag('chest_open');ctx.sfx('chest_open');await chest.open();cube.visible=true;})}});
  ctx.hotspots.define({id:'chest_cube',views:['house_int'],object:cube,cursor:'grab',when:()=>ctx.flag('chest_open')&&!ctx.flag('cube_taken'),onClick:()=>ctx.cutscene(async()=>{
    if(!ctx.flag('memory_seen')){
      await ctx.go('kitchen_memory');ctx.sfx('memory_whoosh');cube.visible=false;await frame.draw();caroline.root.visible=true;
      await ctx.animate(1100,k=>caroline.setOpacity(k));await ctx.say(T.memory);await ctx.wait(900);await ctx.animate(1000,k=>caroline.setOpacity(1-k));caroline.root.visible=false;await frame.erase();ctx.setFlag('memory_seen');cube.visible=true;await ctx.go('house_int');return;
    }
    ctx.setFlag('cube_taken');cube.visible=false;await ctx.give('black_cube',{from:chest});
  })});
  ctx.register('prop','p2_cube_idle',{update:(dt,t)=>{if(cube.visible)cube.rotation.y=Math.sin(t*.8)*.13;}});
}
export function sync(ctx) {
  if(!S)return;const {chest,cauldron,frame,bowl,candle,cube,caroline}=S;
  bowl.visible=!ctx.flag('kitchen_bowl_taken');candle.visible=!ctx.flag('kitchen_candle_taken');
  chest.setOpen(!!ctx.flag('chest_open'),instant);cube.visible=!!ctx.flag('chest_open')&&!ctx.flag('cube_taken');
  cauldron.setWood(!!ctx.flag('pot_wood'));cauldron.setLit(!!ctx.flag('pot_lit'));cauldron.setFrogs(numberFlag(ctx,'pot_frogs'));cauldron.glow(false);frame.setProgress(0);caroline.root.visible=false;caroline.setOpacity(1);
}
export const walkthrough=[{go:'house_clearing'},{click:'house_entry'},{click:'kitchen_table'},{click:'kitchen_bowl'},{click:'kitchen_candle'},{back:true},{back:true}];
