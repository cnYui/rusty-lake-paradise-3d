// 沿用公共物品栏与检视器，章节只提供名称和模型。
import { makeProp } from '../../art/props.js';
import { FLY_FACTORIES } from '../../art/props_flies.js';
import { T } from './text.js';

export function defineItems(ctx) {
  for (const [id, name] of Object.entries(T.names)) {
    const factory = FLY_FACTORIES[id] || (() => makeProp(id === 'branch' ? 'stick' : id));
    ctx.items.define({ id, name: { zh: name }, model: factory });
  }
}
