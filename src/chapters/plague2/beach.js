// 海滩的 David 与五关睡莲；脚边青蛙使用独立特写，关内跳跃进度随存档恢复。
import { makeProp } from '../../art/props.js';
import { W, SPOTS } from './world.js';
import { character, prop, closeup, instant, numberFlag } from './shared.js';
import { LILY_LEVELS, lilyLevel, lilyTargets, lilyReach, lilyJump, sameCell } from './puzzles.js';
let S;
function readLily(ctx) {
  const level=Math.min(5,Math.max(1,numberFlag(ctx,'lily_level',1))),def=lilyLevel(level);
  const saved=ctx.flag('lily_progress');
  if(saved&&saved.level===level&&Array.isArray(saved.from)&&Array.isArray(saved.left))return {level,def,from:saved.from,left:saved.left};
  return {level,def,from:[...def.start],left:def.pads.map(p=>[...p])};
}
function restoreLily(ctx) {
  const p=readLily(ctx);S.lily.restore(p.def,p.from,p.left,!!ctx.flag('lily_done'));S.lily.setHighlight(lilyTargets(p.def,p.left,p.from));
}
export async function setup(ctx) {
  const david=character(ctx,'david_p2',SPOTS.david);
  const stone=W.davidTop.getWorldPosition(new ctx.THREE.Vector3());david.root.position.copy(stone);
  const looseFrog=makeProp('frog');looseFrog.scale.setScalar(1.8);looseFrog.rotation.y=david.root.rotation.y;david.root.updateWorldMatrix(true,false);looseFrog.position.copy(david.root.localToWorld(new ctx.THREE.Vector3(.23,.015,.2)));W.zones.exterior.add(looseFrog);ctx.register('prop','p2_david_frog',looseFrog);
  const lily=prop(ctx,'lily_board',SPOTS.lilyBoard);S={david,looseFrog,lily};Object.assign(W,S);
  closeup(ctx,'david',david.root,'beach_left',{target:[0,1.24,0],eye:[0,1.3,2.25],fov:37});
  closeup(ctx,'david_rock',david.root,'david',{target:[.17,.17,.15],eye:[.17,.88,1.72],fov:43});
  closeup(ctx,'lily_pads',lily,'beach_right',{target:[1.375,0,1.1],eye:[1.375,3.8,1.13],fov:52});
  ctx.hotspots.define({id:'david',views:['beach_left','david'],object:david.root,cursor:'talk',onClick:async()=>{
    if(ctx.state.view!=='david')return ctx.go('david');if(!ctx.flag('david_belt')){ctx.sfx('frog_croak');await david.eatFrog();}else if(!ctx.flag('david_frog_taken'))return ctx.go('david_rock');
  },onItem:{belt:()=>ctx.cutscene(async()=>{if(ctx.flag('david_belt'))return;ctx.take('belt');ctx.setFlag('david_belt');await david.setBelt(true);looseFrog.visible=true;await ctx.go('david_rock');})}});
  ctx.hotspots.define({id:'david_frog',views:['beach_left','david_rock'],object:looseFrog,cursor:'grab',when:()=>ctx.flag('david_belt')&&!ctx.flag('david_frog_taken'),onClick:async()=>{ctx.setFlag('david_frog_taken');looseFrog.visible=false;await ctx.give('frog',{from:looseFrog});}});
  ctx.hotspots.define({id:'lily_board',views:['beach_right'],object:lily,cursor:'zoom',when:()=>!ctx.flag('lily_done'),goto:'lily_pads'});
  for(let c=0;c<6;c++)for(let r=0;r<5;r++){
    const hit=ctx.hotspots.makeProxy(.47,.12,.47,[c*.55,.055,r*.55],lily);
    ctx.hotspots.define({id:`lily_${c}_${r}`,views:['lily_pads'],object:hit,cursor:'pointer',when:()=>{
      if(ctx.flag('lily_done'))return false;const p=readLily(ctx);return lilyReach(p.from).some(x=>sameCell(x,[c,r]))&&(p.left.some(x=>sameCell(x,[c,r]))||sameCell(p.def.goal,[c,r]));
    },onClick:()=>ctx.cutscene(async()=>{
      const p=readLily(ctx),to=[c,r],next=lilyJump(p.def,p.left,p.from,to);if(next.kind==='illegal')return;
      ctx.sfx('frog_hop');await lily.jumpTo(to);
      if(next.kind==='fail'||next.stuck){ctx.sfx('lily_splash');await lily.fail();ctx.setFlag('lily_progress',null);restoreLily(ctx);return;}
      if(next.kind==='win'){
        if(p.level===5){ctx.setFlag('lily_done');await lily.win();await ctx.give('frog',{from:lily.frog});return;}
        ctx.setFlag('lily_level',p.level+1);ctx.setFlag('lily_progress',null);await lily.setLevel(LILY_LEVELS[p.level]);
      }else ctx.setFlag('lily_progress',{level:p.level,from:to,left:next.padsLeft});
      const n=readLily(ctx);lily.setHighlight(lilyTargets(n.def,n.left,n.from));
    })});
  }
}
export function sync(ctx) {if(!S)return;S.david.setBelt(!!ctx.flag('david_belt'),instant);S.looseFrog.visible=!!ctx.flag('david_belt')&&!ctx.flag('david_frog_taken');restoreLily(ctx);}
export const walkthrough=[{go:'beach_right'},{click:'lily_board'},...LILY_LEVELS.flatMap(d=>d.solution.map(([c,r])=>({click:`lily_${c}_${r}`}))),{expectFlag:'lily_done'}];
