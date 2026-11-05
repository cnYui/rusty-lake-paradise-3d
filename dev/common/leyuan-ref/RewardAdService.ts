/**
 * 233 乐园 IAA 激励视频广告封装 —— 直接复制到项目 src/services/ 使用。
 *
 * 关键规则：
 * - code === 0 只表示 SDK 调用成功，不代表奖励成功。
 * - status=0（展示成功）/ status=3（点击广告）是过程态，必须继续等待。
 * - 只有 status=4 才是奖励完成，可发放奖励。
 * - fast 预览 + PC/浏览器不支持广告时，业务调用 showRewardVideoAd() 才弹出 mock 结果选择框。
 */

export const AD_TYPE = {
  REWARD_VIDEO: 1,
} as const

export const AD_STATUS = {
  FAILED: -1,
  SHOWN: 0,
  CLOSED: 1,
  SKIPPED: 2,
  CLICKED: 3,
  REWARDED: 4,
} as const

export type RewardAdFailReason =
  | 'sdk_missing'
  | 'unsupported'
  | 'failed'
  | 'closed'
  | 'skipped'
  | 'timeout'
  | 'exception'

export type RewardAdResult =
  | { success: true; status: 4; reason: 'rewarded'; mocked: boolean; raw: unknown }
  | { success: false; status: number | null; reason: RewardAdFailReason; mocked: boolean; raw?: unknown; error?: unknown }

export interface RewardAdDiagnostic {
  time: string
  event: string
  detail: string
  raw?: unknown
}

type BuildProfile = 'fast' | 'release'

const REWARD_AD_TIMEOUT_MS = 120_000

export function getBuildProfile(): BuildProfile | null {
  try {
    const profile = (window as any).__PM_BUILD_PROFILE__
    return profile === 'fast' || profile === 'release' ? profile : null
  } catch {
    return null
  }
}

function hasQueryFlag(name: string): boolean {
  try {
    if (typeof location === 'undefined') return false
    return new URLSearchParams(location.search).get(name) === '1'
  } catch { /* ignore */ }
  return false
}

/** 只有后端明确注入 fast 才是预览；未注入/未知不算预览。 */
export function isPreviewBuild(): boolean {
  return getBuildProfile() === 'fast'
}

/** 诊断入口默认不显示；?iaaDebug=1 仅强制显示入口，不代表预览。 */
export function shouldShowIaaDebugPanel(): boolean {
  return hasQueryFlag('iaaDebug')
}

export function isLikelyLeyuanApp(): boolean {
  try {
    const ua = navigator.userAgent || ''
    if (/233(?:leyuan|乐园|xyx)?|MetaApp|metaapp|leyuan/i.test(ua)) return true
    if (/android|iphone|ipad|ipod/i.test(ua) && !/windows nt|macintosh|linux x86/i.test(ua)) {
      const w = window as any
      if (w.android || w.webkit?.messageHandlers) return true
    }
  } catch { /* ignore */ }
  return false
}

export function shouldAutoMockOnFailure(): boolean {
  if (!isPreviewBuild()) return false
  if (isLikelyLeyuanApp()) return false
  return true
}

function safeJson(v: unknown): unknown {
  try { return JSON.parse(JSON.stringify(v)) } catch { return String(v) }
}

function parseMaybeJson<T = any>(v: unknown): T | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') {
    try { return JSON.parse(v) as T } catch { return null }
  }
  return v as T
}

function unwrapSdkEnvelope(v: unknown, depth = 0): any {
  const parsed = parseMaybeJson<any>(v)
  if (depth >= 5 || parsed === null || parsed === undefined || typeof parsed !== 'object') return parsed
  if ('response' in parsed) return unwrapSdkEnvelope(parsed.response, depth + 1)
  return parsed
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function installMetaH5AdLogFallback(): void {
  const w = window as any
  for (const name of ['logBlue', 'logGreen', 'logRed', 'logYellow']) {
    if (typeof w[name] !== 'function') {
      w[name] = (...args: unknown[]) => console.debug(`[MetaH5Ad:${name}]`, ...args)
    }
  }
}

function normalizeAdResult(raw: any): { code: number | null; status: number | null; message: string; isRewarded: boolean } {
  const result = unwrapSdkEnvelope(raw)
  const data = unwrapSdkEnvelope(result?.data)
  const dataIsObject = data && typeof data === 'object'
  const code = toNumber(result?.code ?? result?.errCode)
  const rawStatus = dataIsObject
    ? data.status ?? data.rewardStatus ?? data.state
    : data ?? result?.status ?? result?.rewardStatus ?? result?.state
  const status = toNumber(rawStatus)
  const message = String(result?.message ?? result?.msg ?? (dataIsObject ? data.message : '') ?? '')
  const explicitRewardFlag = Boolean(
    result?.rewarded === true ||
    result?.reward === true ||
    result?.completed === true ||
    (dataIsObject && (data.rewarded === true || data.reward === true || data.completed === true))
  )
  return { code, status, message, isRewarded: status === AD_STATUS.REWARDED || explicitRewardFlag }
}

class RewardAdService {
  private diagnostics: RewardAdDiagnostic[] = []
  private mockEnabled = false

  private log(event: string, detail: string, raw?: unknown): void {
    this.diagnostics.unshift({
      time: new Date().toLocaleTimeString(),
      event,
      detail,
      raw: raw !== undefined ? safeJson(raw) : undefined,
    })
    if (this.diagnostics.length > 60) this.diagnostics.length = 60
    console.log(`[RewardAd] ${event}: ${detail}`, raw ?? '')
  }

  getDiagnostics(): RewardAdDiagnostic[] {
    return this.diagnostics.slice()
  }

  isMockMode(): boolean {
    return this.mockEnabled
  }

  enableMockMode(): void {
    if (!isPreviewBuild()) {
      this.log('mock_rejected', '非 fast 预览构建禁止开启 mock', { buildProfile: getBuildProfile() ?? '(未注入)' })
      return
    }
    if (isLikelyLeyuanApp()) {
      this.log('mock_rejected', '疑似乐园真机环境禁止开启 mock', { buildProfile: getBuildProfile() })
      return
    }
    this.mockEnabled = true
    this.log('mock_enabled', '已开启 IAA mock')
  }

  isSdkLoaded(): boolean {
    return typeof window !== 'undefined' && !!(window as any).MetaH5Ad
  }

  async isAdSupported(adType: number = AD_TYPE.REWARD_VIDEO): Promise<boolean> {
    const win = window as any
    if (!win.MetaH5Ad || typeof win.MetaH5Ad.isAdSupport !== 'function') {
      if (shouldAutoMockOnFailure()) {
        this.enableMockMode()
        return true
      }
      return false
    }
    return new Promise((resolve) => {
      try {
        win.MetaH5Ad.isAdSupport(adType, (raw: any) => {
          const result = unwrapSdkEnvelope(raw)
          const supported = Number(result?.code) === 0 && Number(result?.data) === 1
          this.log('support', `supported=${supported}`, raw)
          resolve(supported)
        })
      } catch (error) {
        this.log('support_exception', 'isAdSupport 异常', error)
        resolve(false)
      }
    })
  }

  async showRewardVideoAd(options: { timeoutMs?: number } = {}): Promise<RewardAdResult> {
    installMetaH5AdLogFallback()
    if (this.mockEnabled) return this.showMockRewardAdModal()

    const win = window as any
    if (!win.MetaH5Ad || typeof win.MetaH5Ad.showAd !== 'function') {
      if (shouldAutoMockOnFailure()) {
        this.enableMockMode()
        return this.showMockRewardAdModal()
      }
      return { success: false, status: null, reason: 'sdk_missing', mocked: false }
    }

    const supported = await this.isAdSupported(AD_TYPE.REWARD_VIDEO)
    if (!supported) {
      if (shouldAutoMockOnFailure()) {
        this.enableMockMode()
        return this.showMockRewardAdModal()
      }
      return { success: false, status: null, reason: 'unsupported', mocked: false }
    }

    return new Promise((resolve) => {
      let settled = false
      let lastRaw: unknown
      let lastStatus: number | null = null
      const timeoutMs = options.timeoutMs ?? REWARD_AD_TIMEOUT_MS
      let timer: ReturnType<typeof setTimeout> | null = null

      const settle = (result: RewardAdResult) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        this.log('settled', `${result.reason} status=${result.status}`, result.raw)
        resolve(result)
      }

      timer = setTimeout(() => {
        settle({ success: false, status: lastStatus, reason: 'timeout', mocked: false, raw: lastRaw })
      }, timeoutMs)

      try {
        win.MetaH5Ad.showAd(AD_TYPE.REWARD_VIDEO, (raw: any) => {
          lastRaw = raw
          const normalized = normalizeAdResult(raw)
          lastStatus = normalized.status
          this.log('showAd_event', `code=${normalized.code} status=${normalized.status} message=${normalized.message}`, raw)

          if (normalized.code !== null && normalized.code !== 0) {
            settle({ success: false, status: normalized.status ?? AD_STATUS.FAILED, reason: 'failed', mocked: false, raw })
            return
          }
          if (normalized.isRewarded) {
            settle({ success: true, status: AD_STATUS.REWARDED, reason: 'rewarded', mocked: false, raw })
            return
          }
          if (normalized.status === AD_STATUS.SHOWN || normalized.status === AD_STATUS.CLICKED) {
            this.log('progress', `过程态 status=${normalized.status}，继续等待`, raw)
            return
          }
          if (normalized.status === AD_STATUS.CLOSED) {
            settle({ success: false, status: AD_STATUS.CLOSED, reason: 'closed', mocked: false, raw })
            return
          }
          if (normalized.status === AD_STATUS.SKIPPED) {
            settle({ success: false, status: AD_STATUS.SKIPPED, reason: 'skipped', mocked: false, raw })
            return
          }
          if (normalized.status === AD_STATUS.FAILED) {
            settle({ success: false, status: AD_STATUS.FAILED, reason: 'failed', mocked: false, raw })
            return
          }
          this.log('unknown_status', '未知非终态，继续等待到超时', raw)
        })
      } catch (error) {
        settle({ success: false, status: lastStatus, reason: 'exception', mocked: false, raw: lastRaw, error })
      }
    })
  }

  private showMockRewardAdModal(): Promise<RewardAdResult> {
    if (typeof document === 'undefined') {
      return Promise.resolve({ success: true, status: AD_STATUS.REWARDED, reason: 'rewarded', mocked: true, raw: { mock: true } })
    }
    return new Promise((resolve) => {
      const old = document.getElementById('iaa-mock-ad-modal')
      if (old) old.remove()

      const overlay = document.createElement('div')
      overlay.id = 'iaa-mock-ad-modal'
      overlay.setAttribute('role', 'dialog')
      overlay.setAttribute('aria-modal', 'true')
      overlay.setAttribute('aria-label', '模拟广告结果')
      overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:100000',
        'display:flex', 'align-items:center', 'justify-content:center',
        'padding:22px', 'background:rgba(9,12,20,.58)',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      ].join(';')

      const card = document.createElement('div')
      card.style.cssText = [
        'width:min(420px,100%)', 'box-sizing:border-box',
        'background:#fff', 'color:#1f2430', 'border-radius:18px 18px 14px 14px',
        'box-shadow:0 24px 70px rgba(0,0,0,.28)',
        'padding:22px', 'border:1px solid rgba(20,26,38,.08)',
      ].join(';')

      const choices: Array<{ label: string; hint: string; result: RewardAdResult; tone: string }> = [
        { label: '完整观看，发放奖励', hint: '返回 status=4，业务应发奖', result: { success: true, status: AD_STATUS.REWARDED, reason: 'rewarded', mocked: true, raw: { mock: true, status: 4 } }, tone: '#16a34a' },
        { label: '广告播放失败', hint: '返回 status=-1，不发奖', result: { success: false, status: AD_STATUS.FAILED, reason: 'failed', mocked: true, raw: { mock: true, status: -1 } }, tone: '#dc2626' },
        { label: '中途关闭广告', hint: '返回 status=1，不发奖', result: { success: false, status: AD_STATUS.CLOSED, reason: 'closed', mocked: true, raw: { mock: true, status: 1 } }, tone: '#64748b' },
        { label: '跳过广告', hint: '返回 status=2，不发奖', result: { success: false, status: AD_STATUS.SKIPPED, reason: 'skipped', mocked: true, raw: { mock: true, status: 2 } }, tone: '#d97706' },
      ]

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px">
          <div>
            <div style="font-size:12px;color:#64748b;margin-bottom:5px">233 乐园 IAA · 预览模拟</div>
            <div style="font-size:20px;font-weight:700;letter-spacing:-.02em">选择广告结果</div>
          </div>
          <button type="button" data-close aria-label="关闭并按中途关闭处理" style="border:0;background:#f1f5f9;color:#475569;border-radius:999px;width:32px;height:32px;cursor:pointer;font-size:18px;line-height:1">×</button>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px 14px;margin-bottom:14px;color:#475569">
          这是 fast 预览环境的模拟广告弹框，只在业务调用 showRewardVideoAd() 时出现。
        </div>
        <div data-list style="display:grid;gap:9px"></div>
      `

      const cleanup = (result: RewardAdResult) => {
        document.removeEventListener('keydown', onKeyDown)
        overlay.remove()
        this.log('mock_result', `${result.reason} status=${result.status}`, result.raw)
        resolve(result)
      }
      const closeResult: RewardAdResult = { success: false, status: AD_STATUS.CLOSED, reason: 'closed', mocked: true, raw: { mock: true, status: 1 } }
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') cleanup(closeResult)
      }
      const list = card.querySelector('[data-list]') as HTMLElement
      choices.forEach((item, index) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.style.cssText = [
          'width:100%', 'text-align:left', 'border:1px solid #e2e8f0',
          'background:#fff', 'border-radius:13px', 'padding:12px 13px',
          'cursor:pointer', 'display:flex', 'gap:12px', 'align-items:center',
          'transition:transform .12s ease,border-color .12s ease,background .12s ease',
        ].join(';')
        btn.innerHTML = `
          <span style="width:10px;height:34px;border-radius:999px;background:${item.tone};flex:none"></span>
          <span style="min-width:0">
            <span style="display:block;font-size:15px;font-weight:650;color:#0f172a">${item.label}</span>
            <span style="display:block;font-size:12px;color:#64748b;margin-top:2px">${item.hint}</span>
          </span>
        `
        btn.addEventListener('mouseenter', () => {
          btn.style.transform = 'translateY(-1px)'
          btn.style.borderColor = item.tone
          btn.style.background = '#f8fafc'
        })
        btn.addEventListener('mouseleave', () => {
          btn.style.transform = 'translateY(0)'
          btn.style.borderColor = '#e2e8f0'
          btn.style.background = '#fff'
        })
        btn.addEventListener('click', () => cleanup(item.result))
        list.appendChild(btn)
        if (index === 0) setTimeout(() => btn.focus(), 0)
      })
      card.querySelector<HTMLButtonElement>('[data-close]')?.addEventListener('click', () => cleanup(closeResult))
      overlay.appendChild(card)
      document.body.appendChild(overlay)
      document.addEventListener('keydown', onKeyDown)
    })
  }
}

export const rewardAd = new RewardAdService()
