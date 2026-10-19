// 章节公共摆放和镜头工具；复用已有热点与视图系统，鼠标和触屏始终走同一交互路径。
import '../../art/characters_p2.js';
import { makeCharacter } from '../../art/characters.js';
import { makeProp } from '../../art/props.js';
import { W } from './world.js';
export const instant = { instant: true };
export function character(ctx,id,spot,zone='exterior') {
  const rig=makeCharacter(id);rig.root.position.fromArray(spot.pos);rig.root.rotation.y=spot.rotY||0;
  W.zones[zone].add(rig.root);ctx.register('char',`p2_${id}`,rig);return rig;
}
export function prop(ctx,id,spot,zone='exterior') {
  const o=makeProp(id,spot.options);o.position.fromArray(spot.pos);o.rotation.y=spot.rotY||0;W.zones[zone].add(o);ctx.register('prop',`p2_${id}`,o);return o;
}
export function closeup(ctx,id,object,back,{target=[0,1.25,0],eye=[0,1.35,2.4],fov=36,zone='exterior',onEnter}={}) {
  object.updateWorldMatrix(true,false);
  const point=p=>object.localToWorld(new ctx.THREE.Vector3(...p)).toArray();
  ctx.views.define({id,zone,closeup:true,back,look:0,cam:{pos:point(eye),target:point(target),fov},onEnter});
}
export function replaceProp(ctx,current,id,options) {
  const next=makeProp(id,options);next.position.copy(current.position);next.rotation.copy(current.rotation);next.scale.copy(current.scale);current.parent.add(next);current.removeFromParent();
  ctx.register('prop',`p2_${id}`,next);return next;
}
export const numberFlag=(ctx,key,fallback=0)=>Number(ctx.flag(key)??fallback);
