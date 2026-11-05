import { storeToRefs } from 'pinia'
import { nextTick, watch } from 'vue'
import { useAccountStore } from '@/stores/account'

const MAIN_CONTAINER = '#farm-page-content'
/** 切号后的保护窗口：期间持续还原滚动位置，并抑制「数据暂时为空」导致的子页回退。 */
export const ACCOUNT_SWITCH_WINDOW_MS = 3000
const USER_SIGNALS: string[] = ['wheel', 'touchstart', 'pointerdown', 'keydown']

interface ScrollEntry {
  el: HTMLElement
  top: number
  left: number
  selector: string
}

interface ScrollSnapshot {
  routeKey: string
  entries: ScrollEntry[]
  windowX: number
  windowY: number
}

let pendingSnapshot: ScrollSnapshot | null = null
let pendingAt = 0
let switchingUntil = 0
let activeCancel: (() => void) | null = null

/**
 * 切号后的短暂窗口。切号会清空 status / 活动快照，页面不应因为数据暂时为空
 * 就退出当前子页（例如星砂活动详情被误判为「不可用」而跳回活动目录）。
 */
export function isAccountSwitching() {
  return Date.now() < switchingUntil
}

function currentRouteKey() {
  return `${window.location.pathname}${window.location.search}`
}

function isScrollable(el: HTMLElement) {
  // 先读几何信息做廉价过滤，避免对页面里每个元素都调用 getComputedStyle
  const overflowsY = el.scrollHeight > el.clientHeight + 1
  const overflowsX = el.scrollWidth > el.clientWidth + 1
  if (!overflowsY && !overflowsX)
    return false
  const style = getComputedStyle(el)
  const scrollableY = /auto|scroll|overlay/.test(style.overflowY)
  const scrollableX = /auto|scroll|overlay/.test(style.overflowX)
  return (scrollableY && overflowsY) || (scrollableX && overflowsX)
}

/** 稳定选择器只用标签名 + nth-child，避免 Tailwind 类名里的 : / 等字符破坏选择器。 */
function scrollSelector(el: HTMLElement, root: HTMLElement) {
  if (el.id)
    return `#${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.id) : el.id}`
  const parts: string[] = []
  let node: HTMLElement | null = el
  while (node && node !== root) {
    const parent: HTMLElement | null = node.parentElement
    if (!parent)
      break
    const index = Array.prototype.indexOf.call(parent.children, node) + 1
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`)
    node = parent
  }
  return parts.length ? `${MAIN_CONTAINER} > ${parts.join(' > ')}` : MAIN_CONTAINER
}

function capture(): ScrollSnapshot | null {
  const root = document.querySelector<HTMLElement>(MAIN_CONTAINER)
  if (!root)
    return null

  const entries: ScrollEntry[] = []
  const candidates = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
  for (const el of candidates) {
    if (!isScrollable(el))
      continue
    entries.push({
      el,
      top: el.scrollTop,
      left: el.scrollLeft,
      selector: scrollSelector(el, root),
    })
  }

  return {
    routeKey: currentRouteKey(),
    entries,
    windowX: window.scrollX,
    windowY: window.scrollY,
  }
}

/** 右上角账号菜单在 setCurrentAccount 之前调用，记录最精确的切号前位置。 */
export function beginAccountSwitch() {
  pendingSnapshot = capture()
  pendingAt = Date.now()
}

function restore(snapshot: ScrollSnapshot) {
  activeCancel?.()

  let cancelled = false
  let frame = 0
  let observer: MutationObserver | null = null
  const timers: number[] = []

  function finish() {
    if (cancelled)
      return
    cancelled = true
    if (frame)
      cancelAnimationFrame(frame)
    observer?.disconnect()
    for (const timer of timers)
      window.clearTimeout(timer)
    for (const type of USER_SIGNALS)
      window.removeEventListener(type, onUserSignal, true)
    if (activeCancel === finish)
      activeCancel = null
  }

  function apply() {
    if (cancelled)
      return
    // 切号伴随正常路由跳转时不要干扰新页面的滚动位置
    if (currentRouteKey() !== snapshot.routeKey) {
      finish()
      return
    }
    if (snapshot.windowY !== window.scrollY || snapshot.windowX !== window.scrollX)
      window.scrollTo(snapshot.windowX, snapshot.windowY)

    for (const entry of snapshot.entries) {
      const el = entry.el.isConnected ? entry.el : document.querySelector<HTMLElement>(entry.selector)
      if (!el)
        continue
      // 数据还没回来时容器高度不足，设置会被浏览器钳制；后续轮次会再次尝试
      if (Math.abs(el.scrollTop - entry.top) > 1)
        el.scrollTop = entry.top
      if (Math.abs(el.scrollLeft - entry.left) > 1)
        el.scrollLeft = entry.left
    }
  }

  function schedule() {
    if (cancelled || frame)
      return
    frame = requestAnimationFrame(() => {
      frame = 0
      apply()
    })
  }

  function onUserSignal() {
    // 用户一旦开始触摸 / 滚轮 / 按键，立即交还滚动控制权
    finish()
  }

  for (const type of USER_SIGNALS)
    window.addEventListener(type, onUserSignal, { capture: true, passive: true })

  const root = document.querySelector<HTMLElement>(MAIN_CONTAINER)
  if (root) {
    observer = new MutationObserver(schedule)
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
  }

  void nextTick().then(schedule)
  schedule()
  for (const delay of [30, 120, 300, 600, 1000, 1600, 2200, 2800])
    timers.push(window.setTimeout(schedule, delay))
  timers.push(window.setTimeout(finish, ACCOUNT_SWITCH_WINDOW_MS))

  activeCancel = finish
}

/**
 * 在布局层常驻：任何入口改变 currentAccountId（右上角菜单、账号管理、首次自动选中）
 * 都保持当前页面与滚动位置。flush: 'sync' 保证在 status 被清空、DOM 更新前取到旧位置。
 */
export function useAccountSwitchScrollPreserve() {
  const { currentAccountId } = storeToRefs(useAccountStore())

  watch(currentAccountId, (next, previous) => {
    if (next === previous || !next)
      return

    switchingUntil = Date.now() + ACCOUNT_SWITCH_WINDOW_MS
    const snapshot = pendingSnapshot && Date.now() - pendingAt < 1000
      ? pendingSnapshot
      : capture()
    pendingSnapshot = null
    if (snapshot)
      restore(snapshot)
  }, { flush: 'sync' })
}
