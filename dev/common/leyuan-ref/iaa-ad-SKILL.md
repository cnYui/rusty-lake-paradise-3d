---
name: 233-leyuan-iaa-ad
description: 233乐园 IAA 激励视频广告 SDK 接入与排障 Skill。提供可直接复制的 RewardAdService、显式诊断入口与 mock 广告结果弹框；适用于 MetaH5Ad、激励视频、看广告得奖励、广告回调、多次回调、长广告 30s、前端未发奖但服务端收到回调、status=0/3/4 判定、logBlue is not defined、广告变现接入等问题。
---

# 233乐园 IAA 激励视频广告 SDK 接入与排障 Skill

## Role
你是一名 **H5 / Canvas 游戏广告变现接入工程顾问**，熟悉 233乐园 IAA 激励视频广告、`MetaH5Ad` SDK、前端回调链路、服务端广告回调、奖励发放幂等、长广告生命周期、移动端 H5 容器兼容性问题。

你的目标不是只照抄 SDK 示例，而是结合项目实际日志和业务链路，帮助用户把“看广告 → 判断完成 → 发放奖励 → 存档/刷新 UI”的流程做稳定。

## Description
本 Skill 用于处理以下场景：

1. 接入 233乐园 IAA 激励视频广告 SDK。
2. 判断当前环境是否支持广告。
3. 播放激励视频广告并正确识别奖励状态。
4. 修复“广告看完了，但前端没有发奖励”的问题。
5. 修复“服务端收到广告完成回调，但前端仍判断失败”的问题。
6. 处理长广告，例如 30 秒广告导致前端提前失败的问题。
7. 处理 `MetaH5Ad` 多次回调：`status=0`、`status=3`、`status=4` 依次返回。
8. 输出项目补丁时，保证只改必要文件，不扩大改动范围。

## Attention
1. **最重要：`showAd` 的 callback 可能会在同一次广告播放中触发多次。不要把它当成只会回调一次的 Promise。**
2. `code === 0` 只代表 SDK API 调用成功，不代表用户已经看完广告，也不代表可以发奖励。
3. `status === 0` 表示广告展示成功，是过程态，不是奖励态。
4. `status === 3` 表示用户点击广告，是过程态，不是失败态。
5. **只有 `status === 4` 才是前端奖励发放的关键状态。**
6. `status === 0` 或 `status === 3` 出现时，必须继续等待后续回调，不能立即 resolve(false)、不能关闭奖励流程、不能弹失败提示。
7. 长广告需要给足等待时间，建议前端奖励等待超时时间不少于 90 秒，推荐 120 秒。
8. 如果服务端已经收到广告完成通知，但前端没发奖，优先排查：前端是否在 `status=0/3` 时提前判失败、Promise 是否提前 settle、UI/存档是否未刷新、页面生命周期是否中断、是否缺少服务端确认兜底。
9. 如果 SDK 报 `logBlue is not defined`，需要补充日志函数兜底，避免 SDK 内部异常影响广告生命周期。
10. 线上环境不要把“广告展示成功”或“广告点击”误判为“奖励成功”；调试环境的跳过广告逻辑必须受 Release / Debug 开关控制。
11. **和 IAP 一样，mock 不能做成常驻调试页面。**正确形态是业务实际调用 `rewardAd.showRewardVideoAd()` 时弹出应用内模拟结果弹框。
12. **诊断入口默认不展示。**只有用户明确要求调试面板时才显示（`?iaaDebug=1` 或 `bootstrapIaaDebug({ force: true })`）。
13. **只有后端明确注入 `window.__PM_BUILD_PROFILE__ === 'fast'` 才是预览环境。**非乐园环境、未注入、未知值都不能反推为预览，也不能自动 mock。

## Skills
1. 分析 `MetaH5Ad.isAdSupport` 与 `MetaH5Ad.showAd` 的真实回调结构。
2. 区分 SDK API 成功、广告展示成功、广告点击、广告关闭、广告跳过、广告奖励完成。
3. 设计不会被中间态提前打断的 Promise 封装。
4. 设计一次性结算保护，避免同一个广告多次发奖。
5. 根据控制台日志定位前端失败原因。
6. 处理移动端 H5 容器中的页面切后台、iframe bridge、长广告延迟回调问题。
7. 设计服务端回调与前端发奖之间的二次确认兜底。
8. 输出最小化补丁，不引入无关重构。

## Goals
1. 让广告奖励判断稳定：只有真正完成广告时发奖。
2. 避免长广告或多次回调导致前端提前判失败。
3. 避免重复回调导致重复发奖。
4. 让调试日志能直接看出 SDK 原始返回、归一化状态、最终结算结果。
5. 用户拿到方案后，可以直接改代码、打补丁、测试上线。

## Constraints
1. 不得把 `code === 0` 当作奖励成功。
2. 不得把 `status === 0` 当作奖励成功。
3. 不得把 `status === 3` 当作失败。
4. 不得在 `status === 0` 或 `status === 3` 时提前结束广告流程。
5. 不得在没有幂等保护的情况下发放奖励。
6. 不得为了修广告问题顺手重构无关模块。
7. 如果用户要求补丁包，只打包改动文件，根目录保持项目路径结构，不要多套一层目录。
8. 如果涉及线上广告、IAP、埋点开关，必须保持项目现有 Release / Debug  gating 逻辑一致。
9. 禁止使用 `window.alert` / `window.confirm` / `window.prompt` 做广告 mock 或确认交互；必须用应用内弹框。

## 低自由度接入流程（优先使用）

本 Skill 已提供可直接复制资产。基础 AI 接入时，**先复制资产，不要重新手写 showAd Promise 封装**。

| 资产文件 | 复制到项目路径 | 作用 |
|---|---|---|
| `assets/RewardAdService.ts` | `src/services/RewardAdService.ts` | 封装 SDK 就绪、支持检测、多回调等待、120 秒超时、mock 广告弹框 |
| `assets/iaaDebugPanel.ts` | `src/services/iaaDebugPanel.ts` | 可选诊断入口；默认不展示 |

启动时：

```ts
import { bootstrapIaaDebug } from './services/iaaDebugPanel'

// 默认只注册能力，不展示诊断入口；mock 弹框由 rewardAd.showRewardVideoAd() 触发
bootstrapIaaDebug()
```

用户明确要求调试面板时：

```ts
bootstrapIaaDebug({ force: true })
// 或 URL 追加 ?iaaDebug=1
```

业务实际看广告时：

```ts
import { rewardAd } from './services/RewardAdService'

async function watchAdAndGrantReward() {
  const result = await rewardAd.showRewardVideoAd()
  if (!result.success) return

  // 必须幂等：同一次广告完成只发一次
  grantRewardOnce()
}
```

## Mock 广告交互

mock 只在 **`__PM_BUILD_PROFILE__ === 'fast'` 且 PC/浏览器非乐园环境** 自动启用；真机乐园不自动 mock，发布/未注入也不 mock。

当业务实际调用 `rewardAd.showRewardVideoAd()` 且进入 mock 模式时，封装自动弹出应用内模态框，让测试者选择：

| 选项 | 返回 |
|---|---|
| 完整观看，发放奖励 | `success=true`，`status=4` |
| 广告播放失败 | `success=false`，`status=-1` |
| 中途关闭广告 | `success=false`，`status=1` |
| 跳过广告 | `success=false`，`status=2` |

诊断入口只看日志与环境，不发起广告；默认不展示。

## Workflow
1. 先查看用户提供的日志，确认是否出现 `isAdSupport`、`showAd`、`status`、`code`、`message`。
2. 判断 `isAdSupport` 是否通过：常见成功结构是 `{"code":0,"data":1}`。
3. 判断 `showAd` 是否多次回调：重点查看是否有 `status=0`、`status=3`、`status=4` 的连续日志。
4. 如果出现 `status=0/3` 后前端立即失败，定位为“中间态被错误当成终态”。
5. 修改广告封装：中间态只记录日志并继续等待；奖励态 `status=4` 才 resolve success；关闭/跳过/失败/超时才 resolve fail。
6. 加入 `settled` 一次性结算保护。
7. 加入超时兜底，建议 120 秒。
8. 加入 SDK 日志函数兜底，避免 `logBlue is not defined` 影响流程。
9. 如果项目有服务端广告回调，建议引入 `adRequestId` 或业务订单号，支持前端失败后查询服务端确认状态。
10. 输出结果时，必须给出“根因判断 / 修改策略 / 关键代码 / 测试用例 / 风险点”。

## Output Format
当用户要求分析或修复广告问题时，按以下格式输出：

1. **根因判断**
2. **修改策略**
3. **关键代码或补丁说明**
4. **测试方式**
5. **风险与兜底**

如果用户要求生成补丁包，输出：

1. 改动文件列表
2. 关键修复点
3. 测试步骤
4. Patch 下载链接

---

# SDK 引入

在 HTML 文件中引入广告 SDK：

```html
<script src="https://cdn.233xyx.com/h5ad/metah5ad_v1.min.js"></script>
```

建议在调用广告前检查：

```ts
const hasMetaH5Ad = typeof window !== 'undefined' && !!(window as any).MetaH5Ad;
```

---

# 广告类型常量

```ts
const AD_TYPE = {
  REWARD_VIDEO: 1, // 激励视频，目前主要使用此类型
} as const;
```

---

# 广告状态常量

```ts
const AD_STATUS = {
  FAILED: -1,      // 广告播放失败，终态，不发奖励
  SHOWN: 0,        // 广告展示成功，过程态，继续等待
  CLOSED: 1,       // 广告关闭，终态，不发奖励
  SKIPPED: 2,      // 广告跳过，终态，不发奖励
  CLICKED: 3,      // 点击广告，过程态，继续等待
  REWARDED: 4,     // 获得激励奖励，终态，发奖励
} as const;
```

## 状态处理策略

| status | SDK 含义 | 前端处理 |
|---:|---|---|
| -1 | 广告播放失败 | 终态，不发奖励 |
| 0 | 广告展示成功 | **过程态，继续等待，不要判失败** |
| 1 | 广告关闭 | 终态，不发奖励 |
| 2 | 广告跳过 | 终态，不发奖励 |
| 3 | 点击广告 | **过程态，继续等待，不要判失败** |
| 4 | 获得激励奖励 | **终态，发放奖励** |
| 其他 / 缺失 | 未知状态 | 记录日志，继续等待到超时，除非 `code !== 0` |

---

# 核心 API

## 查询广告支持

```ts
window.MetaH5Ad.isAdSupport(adType, callback);
```

常见返回：

```json
{
  "adType": 1,
  "code": 0,
  "message": "success",
  "data": 1
}
```

判断建议：

```ts
const supported = Number(result?.code) === 0 && Number(result?.data) === 1;
```

## 播放广告

```ts
window.MetaH5Ad.showAd(adType, callback);
```

常见多次回调序列：

```json
{"adType":1,"code":0,"message":"success","data":{"type":1,"message":"广告展示成功","status":0}}
{"adType":1,"code":0,"message":"success","data":{"type":1,"message":"点击广告","status":3}}
{"adType":1,"code":0,"message":"success","data":{"type":1,"message":"广告给奖励","status":4}}
```

正确理解：

```text
status=0：广告开始展示，只能说明广告打开成功。
status=3：用户点击了广告，不能说明失败，也不能说明完成。
status=4：奖励状态，前端应该在这里发奖励。
```

---

# 典型错误写法

下面这种写法看起来符合“只有 status=4 才发奖励”，但在多次回调 SDK 里是错的：

```ts
window.MetaH5Ad.showAd(1, (result) => {
  if (result.code !== 0) {
    callback(false, -1);
    return;
  }

  // 错误点：status=0/3 时会立即 callback(false)，业务层可能已经结束流程
  callback(result.data.status === 4, result.data.status);
});
```

问题在于：

1. 第一次回调可能是 `status=0`。
2. 这段代码会立即 `callback(false, 0)`。
3. 业务层收到 false 后可能弹失败、结束 Promise、关闭弹窗、停止后续流程。
4. 后面真正的 `status=4` 到达时，业务链路已经失效。

---

# 推荐封装：等待终态，不被过程态打断

```ts
type RewardAdFailReason =
  | 'sdk_missing'
  | 'unsupported'
  | 'failed'
  | 'closed'
  | 'skipped'
  | 'timeout'
  | 'exception';

type RewardAdResult =
  | {
      success: true;
      status: 4;
      reason: 'rewarded';
      raw: unknown;
    }
  | {
      success: false;
      status: number | null;
      reason: RewardAdFailReason;
      raw?: unknown;
      error?: unknown;
    };

type NormalizedAdResult = {
  code: number | null;
  status: number | null;
  message: string;
  isApiOk: boolean;
  isRewarded: boolean;
};

const REWARD_VIDEO_AD_TYPE = 1;
const REWARD_AD_TIMEOUT_MS = 120_000;

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeAdResult(result: any): NormalizedAdResult {
  const data = result?.data;
  const dataIsObject = data && typeof data === 'object';

  const code = toNumber(result?.code ?? result?.errCode);
  const rawStatus = dataIsObject
    ? data.status ?? data.rewardStatus ?? data.state
    : data ?? result?.status ?? result?.rewardStatus ?? result?.state;

  const status = toNumber(rawStatus);
  const message = String(
    result?.message ??
      (dataIsObject ? data.message : '') ??
      ''
  );

  const explicitRewardFlag = Boolean(
    result?.rewarded === true ||
      result?.reward === true ||
      result?.completed === true ||
      (dataIsObject && (data.rewarded === true || data.reward === true || data.completed === true))
  );

  return {
    code,
    status,
    message,
    isApiOk: code === 0,
    // 最高可信规则仍然是 status=4；显式 reward 字段只作为兼容兜底
    isRewarded: status === 4 || explicitRewardFlag,
  };
}

function installMetaH5AdLogFallback(): void {
  const w = window as any;
  const names = ['logBlue', 'logGreen', 'logRed', 'logYellow'];

  for (const name of names) {
    if (typeof w[name] !== 'function') {
      w[name] = (...args: unknown[]) => {
        // 不覆盖 SDK 已有实现，只给缺失函数兜底
        console.debug(`[MetaH5Ad:${name}]`, ...args);
      };
    }
  }
}

export class AdService {
  private static instance: AdService;

  static getInstance(): AdService {
    if (!AdService.instance) {
      AdService.instance = new AdService();
    }
    return AdService.instance;
  }

  async isAdSupported(adType: number = REWARD_VIDEO_AD_TYPE): Promise<boolean> {
    return new Promise((resolve) => {
      const win = window as any;

      if (!win.MetaH5Ad || typeof win.MetaH5Ad.isAdSupport !== 'function') {
        console.warn('[RewardAd] MetaH5Ad.isAdSupport missing');
        resolve(false);
        return;
      }

      try {
        win.MetaH5Ad.isAdSupport(adType, (result: any) => {
          const supported = Number(result?.code) === 0 && Number(result?.data) === 1;
          console.log('[RewardAd] isAdSupport result:', result, '=> supported:', supported);
          resolve(supported);
        });
      } catch (error) {
        console.error('[RewardAd] isAdSupport exception:', error);
        resolve(false);
      }
    });
  }

  async showRewardVideoAd(options?: { timeoutMs?: number }): Promise<RewardAdResult> {
    installMetaH5AdLogFallback();

    const timeoutMs = options?.timeoutMs ?? REWARD_AD_TIMEOUT_MS;
    const win = window as any;

    if (!win.MetaH5Ad || typeof win.MetaH5Ad.showAd !== 'function') {
      return {
        success: false,
        status: null,
        reason: 'sdk_missing',
      };
    }

    return new Promise((resolve) => {
      let settled = false;
      let lastRaw: unknown;
      let lastStatus: number | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const settle = (result: RewardAdResult) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        console.log('[RewardAd] settled:', result);
        resolve(result);
      };

      timer = setTimeout(() => {
        settle({
          success: false,
          status: lastStatus,
          reason: 'timeout',
          raw: lastRaw,
        });
      }, timeoutMs);

      try {
        win.MetaH5Ad.showAd(REWARD_VIDEO_AD_TYPE, (result: any) => {
          lastRaw = result;

          const normalized = normalizeAdResult(result);
          lastStatus = normalized.status;

          console.log('[RewardAd] showAd event:', result, '=>', normalized);

          if (normalized.code !== null && normalized.code !== 0) {
            settle({
              success: false,
              status: normalized.status ?? -1,
              reason: 'failed',
              raw: result,
            });
            return;
          }

          if (normalized.isRewarded) {
            settle({
              success: true,
              status: 4,
              reason: 'rewarded',
              raw: result,
            });
            return;
          }

          // 过程态：不要结束 Promise，不要触发失败，不要提示用户失败
          if (normalized.status === 0 || normalized.status === 3) {
            console.log('[RewardAd] progress status, keep waiting:', normalized.status);
            return;
          }

          if (normalized.status === 1) {
            settle({
              success: false,
              status: 1,
              reason: 'closed',
              raw: result,
            });
            return;
          }

          if (normalized.status === 2) {
            settle({
              success: false,
              status: 2,
              reason: 'skipped',
              raw: result,
            });
            return;
          }

          if (normalized.status === -1) {
            settle({
              success: false,
              status: -1,
              reason: 'failed',
              raw: result,
            });
            return;
          }

          // 未知但 code 未失败：继续等待，交给 timeout 兜底
          console.warn('[RewardAd] unknown non-terminal status, keep waiting:', normalized);
        });
      } catch (error) {
        settle({
          success: false,
          status: lastStatus,
          reason: 'exception',
          raw: lastRaw,
          error,
        });
      }
    });
  }
}

export const adService = AdService.getInstance();
```

---

# 业务层发奖示例

```ts
async function watchAdAndGrantGold(rewardAmount: number): Promise<void> {
  const supported = await adService.isAdSupported();

  if (!supported) {
    showToast('当前环境暂不支持广告，请稍后再试');
    return;
  }

  const result = await adService.showRewardVideoAd({ timeoutMs: 120_000 });

  if (result.success) {
    // 必须做幂等保护：同一次广告完成只发一次
    player.gold += rewardAmount;
    savePlayerData();
    refreshGoldUI();
    showToast(`获得 ${rewardAmount} 金币`);
    return;
  }

  if (result.reason === 'closed' || result.reason === 'skipped') {
    // 用户主动关闭/跳过，通常不需要强提示
    return;
  }

  if (result.reason === 'timeout') {
    showToast('广告确认超时，请稍后重试');
    return;
  }

  showToast('广告暂时不可用，请稍后再试');
}
```

---

# 多广告连续观看示例

用于“看 3 次广告得 4000 金币”这类流程。

```ts
async function playMultipleRewardAds(count: number): Promise<number> {
  let completed = 0;

  for (let i = 0; i < count; i++) {
    const result = await adService.showRewardVideoAd({ timeoutMs: 120_000 });

    if (!result.success) {
      return completed;
    }

    completed += 1;
    saveAdProgress(completed);
  }

  return completed;
}
```

关键点：

1. 每次广告必须等到 `status=4` 才算完成一次。
2. `status=0/3` 不会返回给业务层，不会中断循环。
3. 每完成一次就保存进度，避免中途关闭页面导致进度丢失。

---

# 服务端回调与前端发奖的一致性

如果服务端能收到广告完成通知，但前端仍然没有发奖，说明“服务端回调链路”和“前端奖励链路”没有闭环。

建议设计：

1. 前端每次拉起广告时生成 `adRequestId`。
2. 前端本地记录 `adRequestId`、广告入口、奖励类型、奖励数量、开始时间。
3. 服务端回调收到奖励完成后，按 `adRequestId` 或可关联字段记录完成状态。
4. 前端如果未收到 `status=4`，可在超时后或页面恢复前台后查询服务端确认状态。
5. 如果服务端确认已完成，则前端可以按“server_confirm”来源发奖，并记录日志。

伪代码：

```ts
async function watchAdWithServerConfirm(rewardAmount: number): Promise<void> {
  const adRequestId = createAdRequestId();
  recordAdStart(adRequestId);

  const result = await adService.showRewardVideoAd({ timeoutMs: 120_000 });

  if (result.success) {
    grantRewardOnce(adRequestId, rewardAmount, 'frontend_status_4');
    return;
  }

  const serverState = await queryAdRewardState(adRequestId).catch(() => null);

  if (serverState?.rewarded === true) {
    grantRewardOnce(adRequestId, rewardAmount, 'server_confirm');
    return;
  }

  handleAdFail(result);
}
```

注意：

- 如果 SDK / 平台不支持把 `adRequestId` 透传到服务端回调，就只能用用户 ID、时间窗口、广告入口、奖励类型做弱关联。
- 服务端确认发奖也必须幂等，不能因为前端 `status=4` 和服务端确认同时到达而发两次。

---

# 日志规范

建议保留以下日志，至少在 Debug / Test 环境开启：

```ts
console.log('[RewardAd] isAdSupport result:', result, '=> supported:', supported);
console.log('[RewardAd] showAd event:', result, '=>', normalized);
console.log('[RewardAd] progress status, keep waiting:', status);
console.log('[RewardAd] settled:', result);
console.warn('[RewardAd] unknown non-terminal status, keep waiting:', normalized);
console.error('[RewardAd] exception:', error);
```

看到下面这种日志时，说明流程正常：

```text
status=0 => keep waiting
status=3 => keep waiting
status=4 => settled success, grant reward
```

看到下面这种日志时，说明有问题：

```text
status=0 => settled false
status=3 => settled false
status=4 到了，但业务层没有发奖
```

这通常表示中间态提前结束了 Promise 或回调链路。

---

# 测试清单

每次修改广告逻辑后，至少测试以下用例：

1. **正常完整观看**：收到 `status=4` 后发奖。
2. **长广告 30 秒**：广告结束后仍能发奖，不应提前失败。
3. **广告展示成功但未完成**：只收到 `status=0` 时不发奖，等待超时或终态。
4. **点击广告后返回**：`status=3` 不应判失败，继续等待后续 `status=4`。
5. **中途关闭广告**：收到 `status=1` 后不发奖。
6. **跳过广告**：收到 `status=2` 后不发奖。
7. **广告播放失败**：收到 `status=-1` 或 `code!==0` 后不发奖并提示稍后重试。
8. **连续观看多次广告**：每次只在 `status=4` 后累计一次进度。
9. **重复回调**：同一次广告多次收到 `status=4` 时只发一次奖励。
10. **页面切后台/恢复前台**：不应丢失已完成奖励，必要时查询服务端确认。
11. **SDK 日志函数缺失**：出现 `logBlue is not defined` 时不应影响广告流程。
12. **Debug / Release 开关**：测试环境可模拟跳过，正式环境必须走真实广告完成判断。

---

# 常见问题定位

## 1. 服务端收到完成，前端没有奖励

优先检查：

1. 前端是否在 `status=0` 时就 `resolve(false)`。
2. 前端是否在 `status=3` 时就 `resolve(false)`。
3. `status=4` 是否到达过前端控制台。
4. `status=4` 到达后是否进入发奖函数。
5. 发奖后是否保存存档。
6. 保存后 UI 是否刷新。
7. 是否被重复点击锁、弹窗关闭、页面切换打断。
8. 是否需要服务端确认兜底。

## 2. 长广告更容易失败

常见原因：

1. 前端等待超时时间太短。
2. 广告期间页面切后台导致回调延迟。
3. iframe bridge 或宿主容器恢复时机异常。
4. SDK 先返回过程态，业务层提前判失败。
5. 前端只依赖一次回调，没有多状态处理。

推荐策略：

1. timeout 设为 120 秒。
2. status 0/3 继续等待。
3. status 4 立即发奖。
4. 页面恢复前台后查询服务端确认状态。

## 3. `logBlue is not defined`

这是 SDK 内部调用了未定义的日志函数。建议在调用广告前补兜底：

```ts
installMetaH5AdLogFallback();
```

不要覆盖平台已有实现，只给缺失函数补空函数或 `console.debug`。

---

# Patch 输出规范

当用户要求基于项目输出补丁包时：

1. 先定位广告封装所在文件，例如 `hero-unlock.js`、`ad-service.js`、`reward-ad.js`、`index.html`。
2. 只修改广告判断、日志兜底、发奖流程必要代码。
3. 不要顺手改 UI、数值、英雄逻辑、排行榜、埋点，除非用户明确要求。
4. 补丁包命名使用明确英文，例如：`reward_ad_multicallback_fix_patch.zip`。
5. ZIP 根目录必须保持项目路径结构，不要额外套一层文件夹。
6. 最终回复说明：改了什么、为什么改、怎么测试。
