/**
 * 老版地块气泡的浮动定位（LandCard.updateFloatingBubblePosition 的纯函数版）。
 * 气泡固定在视口里，按老版口径默认贴在锚点上方；只有上方放不下且下方更宽裕时才翻到下方，
 * 水平方向钳制在视口内。
 */

export interface BubbleRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface BubblePosition {
  top: number
  left: number
  placement: 'above' | 'below'
  /** 小箭头相对气泡左边缘的偏移，保证始终指向锚点中心。 */
  arrowLeft: number
}

const EDGE = 8
const GAP = 10

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function computeBubblePosition(
  anchor: BubbleRect,
  viewport: { width: number, height: number },
  bubble: { width: number, height: number },
): BubblePosition {
  const centerX = anchor.left + anchor.width / 2
  const left = clamp(centerX - bubble.width / 2, EDGE, viewport.width - bubble.width - EDGE)

  const spaceAbove = anchor.top - EDGE - GAP
  const spaceBelow = viewport.height - anchor.bottom - EDGE - GAP
  // 老版口径：上方放不下且下方更宽裕时才改到下方；否则默认贴上方。
  const below = spaceAbove < bubble.height && spaceBelow > spaceAbove
  const idealTop = below ? anchor.bottom + GAP : anchor.top - bubble.height - GAP
  const top = clamp(idealTop, EDGE, viewport.height - bubble.height - EDGE)
  const arrowLeft = clamp(centerX - left, 18, bubble.width - 18)

  return {
    top,
    left,
    placement: below ? 'below' : 'above',
    arrowLeft,
  }
}
