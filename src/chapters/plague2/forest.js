// 林中的 Gerard、Ida 与蛙卵配对；人物动作和道具状态均从旗标恢复。
import { W, SPOTS, addCircle } from './world.js';
import { character, prop, closeup, instant, numberFlag } from './shared.js';
import { SPAWN, SPAWN_PAIRS, IDA_COLORS, IDA_FINAL_PHRASE } from './puzzles.js';
import { T } from './text.js';
let S;
const spawnState=ctx=>({mask:numberFlag(ctx,'spawn_mask',SPAWN.full),pending:numberFlag(ctx,'spawn_pending')});
export async function setup(ctx) {
  const gerard=character(ctx,'gerard',SPOTS.gerard),ida=character(ctx,'ida',SPOTS.ida),basin=prop(ctx,'spawn_basin',SPOTS.basin);
  for(const [spot,r]of[[SPOTS.gerard,.38],[SPOTS.ida,.27],[SPOTS.basin,.62]])addCircle(spot.pos[0],spot.pos[2],r);
  S={gerard,ida,basin};Object.assign(W,S);
  closeup(ctx,'gerard',gerard.root,'forest_clearing',{target:[0,1.36,0],eye:[0,1.4,2.5],fov:36});
  closeup(ctx,'ida',ida.root,'pump_clearing',{target:[0,1.16,0],eye:[0,1.25,2.1],fov:36});
  closeup(ctx,'spawn_basin',basin,'pump_clearing',{target:[0,.1,0],eye:[0,1.7,.03],fov:48});
  closeup(ctx,'gerard_bowl',gerard.bowlObj,'gerard',{target:[0,0,0],eye:[0,.4,.035],fov:45});
  ctx.hotspots.define({id:'gerard',views:['forest_clearing','gerard'],object:gerard.root,cursor:'talk',onClick:async()=>{
    if(ctx.state.view!=='gerard')return ctx.go('gerard');
    if(!ctx.flag('gerard_swallowed'))return ctx.cutscene(async()=>{await gerard.swallowKey();ctx.setFlag('gerard_swallowed');});
    await ctx.thought(gerard.headTop,ctx.flag('gerard_drank')?'bowl':'frog_soup');
  },onItem:{frog_soup:()=>ctx.cutscene(async()=>{
    if(ctx.flag('gerard_drank'))return;
    if(!ctx.flag('gerard_swallowed')){await gerard.swallowKey();ctx.setFlag('gerard_swallowed');}
    ctx.sfx('soup_pour');await gerard.drinkSoup();ctx.replace('frog_soup','bowl');ctx.setFlag('gerard_drank');await ctx.thought(gerard.headTop,'bowl');
  }),bowl:()=>ctx.cutscene(async()=>{
    if(!ctx.flag('gerard_drank')||ctx.flag('gerard_bowl'))return;ctx.take('bowl');await gerard.holdBowl(true);ctx.sfx('vomit');await gerard.vomit();ctx.setFlag('gerard_bowl');
  })}});
  ctx.hotspots.define({id:'gerard_bowl',views:['gerard'],object:gerard.bowlObj,cursor:'zoom',when:()=>ctx.flag('gerard_bowl'),goto:'gerard_bowl'});
  const bowlKey=gerard.bowlObj.getObjectByName('bowl_key_item');
  ctx.hotspots.define({id:'gerard_key',views:['gerard_bowl'],object:bowlKey,cursor:'grab',when:()=>ctx.flag('gerard_bowl')&&!ctx.flag('key_taken'),onClick:async()=>{ctx.setFlag('key_taken');bowlKey.visible=false;ctx.sfx('key_glint');await ctx.give('key',{from:bowlKey});ctx.achieve('a_rusty_key');}});
  ctx.hotspots.define({id:'ida',views:['pump_clearing','ida'],object:ida.root,cursor:'talk',onClick:async()=>{
    if(ctx.state.view!=='ida')return ctx.go('ida');if(!ctx.flag('ida_talked')){ctx.setFlag('ida_talked');ida.play('talk');await ctx.say(T.ida);ida.play('idle');}else if(!ctx.flag('ida_playing')&&!ctx.flag('ida_frog_taken'))await ctx.thought(ida.headTop,'frog_flute');
  },onItem:{frog_flute:()=>ctx.cutscene(async()=>{if(ctx.flag('ida_playing')||ctx.flag('ida_frog_taken'))return;ctx.take('frog_flute');ctx.setFlag('ida_playing');await ida.holdFlute(true);})}});
  ctx.hotspots.define({id:'ida_flute',views:['ida'],object:ida.fluteObj,cursor:'pointer',when:()=>ctx.flag('ida_playing')&&numberFlag(ctx,'ida_phrase')<IDA_FINAL_PHRASE,onClick:()=>ctx.cutscene(async()=>{
    const phrase=numberFlag(ctx,'ida_phrase')+1;ctx.sfx('flute_phrase');await ida.playPhrase();await ida.setFrogColor(IDA_COLORS[phrase]);ctx.setFlag('ida_phrase',phrase);await ctx.ui.flash('#e8c27a');if(phrase===IDA_FINAL_PHRASE){ctx.setFlag('ida_playing',false);await ida.stopPlaying();}
  })});
  ctx.hotspots.define({id:'ida_frog',views:['ida'],object:ida.frog,cursor:'grab',when:()=>!ctx.flag('ida_frog_taken'),onClick:async()=>{
    if(numberFlag(ctx,'ida_phrase')<IDA_FINAL_PHRASE){ctx.sfx('frog_croak');return ida.croak();}ctx.setFlag('ida_frog_taken');ida.showFrog(false);await ctx.give('frog_orange',{from:ida.frog});
  }});
  ctx.hotspots.define({id:'spawn_basin',views:['pump_clearing'],object:basin,cursor:'zoom',goto:'spawn_basin'});
  for(let i=1;i<=12;i++)ctx.hotspots.define({id:`spawn_${i}`,views:['spawn_basin'],object:basin.getObjectByName(`clump_${i}`),cursor:'pointer',when:()=>!ctx.flag('spawn_cleared')&&SPAWN.isOn(spawnState(ctx).mask,i),onClick:()=>ctx.cutscene(async()=>{
    const next=SPAWN.press(spawnState(ctx),i);ctx.setFlag('spawn_mask',next.mask);ctx.setFlag('spawn_pending',next.pending);
    if(next.kind==='fail'){ctx.sfx('spawn_rise');await basin.press(i);await Promise.all(Array.from({length:12},(_,j)=>basin.setClump(j+1,true)));await ctx.wait(180);return;}
    ctx.sfx('spawn_sink');await basin.setClump(i,false);
    if(next.kind==='win'){ctx.setFlag('spawn_cleared');await ctx.wait(470);await ctx.ui.flash('#e8c27a');await basin.showFrog(true);}
  })});
  const basinFrog=basin.getObjectByName('basin_frog');
  ctx.hotspots.define({id:'spawn_frog',views:['spawn_basin'],object:basinFrog,cursor:'grab',when:()=>ctx.flag('spawn_cleared')&&!ctx.flag('spawn_frog_taken'),onClick:async()=>{ctx.setFlag('spawn_frog_taken');basin.hideFrog();await ctx.give('frog',{from:basinFrog});ctx.achieve('the_first_frog');}});
  ctx.hotspots.define({id:'spawn_water',views:['spawn_basin'],object:basin.getObjectByName('basin_water'),cursor:'pointer',when:()=>ctx.flag('spawn_frog_taken'),onClick:()=>ctx.cutscene(async()=>{
    if(ctx.flag('reflection_seen'))return;const n=numberFlag(ctx,'reflection_taps')+1;ctx.setFlag('reflection_taps',n);if(n>=3){ctx.sfx('memory_whoosh');await basin.showVision(true);ctx.setFlag('reflection_seen');ctx.achieve('reflection_in_the_water');}
  })});
}
export function sync(ctx) {
  if(!S)return;const {gerard,ida,basin}=S;gerard.reset();
  if(ctx.flag('gerard_drank'))gerard.drinkSoup(instant);
  if(ctx.flag('gerard_bowl')){gerard.holdBowl(true,instant);gerard.vomit(instant);}gerard.bowlObj.getObjectByName('bowl_key_item').visible=!ctx.flag('key_taken');
  ida.setFrogColor(IDA_COLORS[Math.min(5,numberFlag(ctx,'ida_phrase'))]);ida.showFrog(!ctx.flag('ida_frog_taken'));ida.holdFlute(!!ctx.flag('ida_playing'),instant);
  const st=spawnState(ctx);for(let i=1;i<=12;i++)basin.setClump(i,!ctx.flag('spawn_cleared')&&SPAWN.isOn(st.mask,i),instant);
  basin.showFrog(!!ctx.flag('spawn_cleared')&&!ctx.flag('spawn_frog_taken'),instant);basin.showVision(!!ctx.flag('reflection_seen'),instant);
}
export const walkthrough=[{go:'pump_clearing'},{click:'spawn_basin'},...SPAWN_PAIRS.flat().map(i=>({click:`spawn_${i}`})),{click:'spawn_frog'},{repeat:3,step:{click:'spawn_water'}},{expectFlag:'reflection_seen'}];
