// 233 乐园激励视频广告封装（官方 RewardAdService.ts 的 JS 版，参考副本在 dev/common/leyuan-ref/，说明见 iaa-ad-SKILL.md）。
//
// - code === 0 只表示 SDK 调用成功，不代表奖励成功；
// - status 0（展示成功）、3（点击广告）是过程态，继续等，不结算；
// - 只有 status 4 才是奖励完成；1 关闭、2 跳过、-1 或 code !== 0 失败都是终态，不发奖励；
// - 一次广告只结算一次（settled），超时默认 120 s（长广告要给足时间）。
//
// 本文件不碰 DOM：本机测试 / 乐园预览里没有真实广告时，模拟结果由调用方传入的 pickMock() 选（见 hintflow.js）。
// 真机乐园（有 window.MetaH5Ad）永远不模拟；发布环境、没注入构建档位、未知值都不模拟。

const AD_TYPE_REWARD_VIDEO = 1;
const STATUS = { FAILED: -1, SHOWN: 0, CLOSED: 1, SKIPPED: 2, CLICKED: 3, REWARDED: 4 };
const REWARD_AD_TIMEOUT_MS = 120000;

const log = (event, detail, raw) => console.log(`[RewardAd] ${event}: ${detail}`, raw ?? '');

function getWindow() { return typeof window === 'undefined' ? null : window; }

function parseMaybeJson(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
}

// 真机上可能外包一层 { response: "{\"code\":0,...}" }，data 也可能是 JSON 字符串
function unwrapSdkEnvelope(v, depth = 0) {
  const parsed = parseMaybeJson(v);
  if (depth >= 5 || parsed === null || parsed === undefined || typeof parsed !== 'object') return parsed;
  if ('response' in parsed) return unwrapSdkEnvelope(parsed.response, depth + 1);
  return parsed;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 把 SDK 回调的原始结构归一成 { code, status, message, isApiOk, isRewarded }（纯函数）。 */
export function normalizeAdResult(raw) {
  const result = unwrapSdkEnvelope(raw);
  const data = unwrapSdkEnvelope(result && result.data);
  const dataIsObject = !!data && typeof data === 'object';
  const code = toNumber(result?.code ?? result?.errCode);
  const rawStatus = dataIsObject
    ? data.status ?? data.rewardStatus ?? data.state
    : data ?? result?.status ?? result?.rewardStatus ?? result?.state;
  const status = toNumber(rawStatus);
  const message = String(result?.message ?? result?.msg ?? (dataIsObject ? data.message : '') ?? '');
  // 最可信的是 status 4；显式 reward 字段只作兼容兜底
  const explicitReward = !!(
    result?.rewarded === true || result?.reward === true || result?.completed === true ||
    (dataIsObject && (data.rewarded === true || data.reward === true || data.completed === true))
  );
  return { code, status, message, isApiOk: code === 0, isRewarded: status === STATUS.REWARDED || explicitReward };
}

// SDK 内部会调 logBlue 之类的全局函数，缺了会抛 “logBlue is not defined”；只给缺失的补兜底，不覆盖已有的
function installLogFallback(w) {
  for (const name of ['logBlue', 'logGreen', 'logRed', 'logYellow']) {
    if (typeof w[name] !== 'function') w[name] = (...args) => console.debug(`[MetaH5Ad:${name}]`, ...args);
  }
}

/**
 * 是否用模拟广告：（乐园预览 __PM_BUILD_PROFILE__ === 'fast'，或本机 localhost / 127.0.0.1 / [::1]）并且没有 MetaH5Ad。
 * 线上发布的包不会跑在 localhost，也不会被注入 fast，所以玩家拿不到模拟广告。
 */
export function isMockMode() {
  const w = getWindow();
  if (!w || w.MetaH5Ad) return false;
  try {
    if (w.__PM_BUILD_PROFILE__ === 'fast') return true;
    const host = (w.location && w.location.hostname) || '';
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}

/** 当前环境能不能放广告（模拟模式算能）。 */
export async function isSupported(adType = AD_TYPE_REWARD_VIDEO) {
  const w = getWindow();
  if (isMockMode()) return true;
  if (!w || !w.MetaH5Ad || typeof w.MetaH5Ad.isAdSupport !== 'function') return false;
  return new Promise((resolve) => {
    try {
      w.MetaH5Ad.isAdSupport(adType, (raw) => {
        const r = unwrapSdkEnvelope(raw);
        const ok = Number(r?.code) === 0 && Number(r?.data) === 1;
        log('support', `supported=${ok}`, raw);
        resolve(ok);
      });
    } catch (error) {
      log('support_exception', 'isAdSupport 异常', error);
      resolve(false);
    }
  });
}

const MOCK_RESULTS = {
  rewarded: { success: true, status: STATUS.REWARDED, reason: 'rewarded' },
  failed: { success: false, status: STATUS.FAILED, reason: 'failed' },
  closed: { success: false, status: STATUS.CLOSED, reason: 'closed' },
  skipped: { success: false, status: STATUS.SKIPPED, reason: 'skipped' },
};

async function showMock(pickMock) {
  if (typeof pickMock !== 'function') return { success: false, status: null, reason: 'unsupported', mocked: true };
  let pick = 'closed';
  try { pick = await pickMock(); } catch { pick = 'closed'; }
  const base = MOCK_RESULTS[pick] || MOCK_RESULTS.closed;
  const result = { ...base, mocked: true, raw: { mock: true, status: base.status } };
  log('mock_result', `${result.reason} status=${result.status}`);
  return result;
}

/**
 * 放一次激励视频广告，返回 { success, status, reason, mocked, raw }。
 * reason：'rewarded' | 'sdk_missing' | 'unsupported' | 'failed' | 'closed' | 'skipped' | 'timeout' | 'exception'。
 * options：timeoutMs（默认 120000）；pickMock（模拟模式下由它异步选 'rewarded' | 'failed' | 'closed' | 'skipped'）。
 */
export async function showRewardVideoAd({ timeoutMs = REWARD_AD_TIMEOUT_MS, pickMock } = {}) {
  const w = getWindow();
  if (w) installLogFallback(w);
  if (isMockMode()) return showMock(pickMock);
  if (!w || !w.MetaH5Ad || typeof w.MetaH5Ad.showAd !== 'function') {
    return { success: false, status: null, reason: 'sdk_missing', mocked: false };
  }
  if (!(await isSupported())) return { success: false, status: null, reason: 'unsupported', mocked: false };

  return new Promise((resolve) => {
    let settled = false;
    let lastRaw;
    let lastStatus = null;
    let timer = null;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      log('settled', `${result.reason} status=${result.status}`, result.raw);
      resolve(result);
    };
    const fail = (reason, status, raw, extra) => settle({ success: false, status, reason, mocked: false, raw, ...extra });

    timer = setTimeout(() => fail('timeout', lastStatus, lastRaw), timeoutMs);

    try {
      w.MetaH5Ad.showAd(AD_TYPE_REWARD_VIDEO, (raw) => {
        lastRaw = raw;
        const n = normalizeAdResult(raw);
        lastStatus = n.status;
        log('showAd_event', `code=${n.code} status=${n.status} message=${n.message}`, raw);

        if (n.code !== null && n.code !== 0) { fail('failed', n.status ?? STATUS.FAILED, raw); return; }
        if (n.isRewarded) { settle({ success: true, status: STATUS.REWARDED, reason: 'rewarded', mocked: false, raw }); return; }
        // 过程态：不结算、不提示失败，继续等后面的回调
        if (n.status === STATUS.SHOWN || n.status === STATUS.CLICKED) { log('progress', `过程态 status=${n.status}，继续等待`); return; }
        if (n.status === STATUS.CLOSED) { fail('closed', STATUS.CLOSED, raw); return; }
        if (n.status === STATUS.SKIPPED) { fail('skipped', STATUS.SKIPPED, raw); return; }
        if (n.status === STATUS.FAILED) { fail('failed', STATUS.FAILED, raw); return; }
        log('unknown_status', '未知非终态，继续等待到超时', raw);
      });
    } catch (error) {
      fail('exception', lastStatus, lastRaw, { error });
    }
  });
}

export const rewardAd = { isMockMode, isSupported, showRewardVideoAd };
