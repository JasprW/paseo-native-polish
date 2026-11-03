export const OUTLINE_RAIL_TEST_ID = 'chat-outline-rail';
export const OUTLINE_PREVIEW_TEST_ID = 'chat-outline-preview';
export const OUTLINE_RAIL_OFFSET_PX = -24;

function clampUnit(value: number, fallback = 1): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function roundMetric(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Computes the remaining normalized travel span `[0, 1]` when an in-flight
 * outline rail entrance or exit animation is interrupted and reversed.
 *
 * When a full animation (`fromSpan = 1`) is interrupted at `elapsedMs / durationMs`,
 * the reversed animation needs to travel back across the fraction already covered
 * (`ratio`). When a previously reversed animation (`fromSpan < 1`) is interrupted
 * again, the reversed animation travels `1 - (1 - ratio) * fromSpan`.
 */
export function outlineRailProgress(
  elapsedMs: number,
  durationMs: number,
  fromSpan = 1,
): number {
  const span = clampUnit(fromSpan, 1);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1;
  if (!Number.isFinite(elapsedMs)) return span;
  const ratio = clampUnit(elapsedMs / durationMs, 0);
  return roundMetric(1 - (1 - ratio) * span);
}

export function outlineRailDuration(baseDurationMs: number, span = 1): number {
  if (!Number.isFinite(baseDurationMs) || baseDurationMs <= 0) return 0;
  const clamped = Math.min(1, Math.max(0.25, clampUnit(span, 1)));
  return Math.max(60, Math.round(baseDurationMs * clamped));
}

export function outlineRailKeyframes(
  direction: 'enter' | 'exit',
  span = 1,
): Record<string, string | number>[] {
  const clamped = clampUnit(span, 1);
  if (direction === 'enter') {
    const startX = roundMetric(OUTLINE_RAIL_OFFSET_PX * clamped);
    const startOpacity = roundMetric(1 - clamped);
    return [
      { translate: startX === 0 ? '0 0' : `${startX}px 0`, opacity: startOpacity },
      { translate: '0 0', opacity: 1 },
    ];
  }

  const startX = roundMetric(OUTLINE_RAIL_OFFSET_PX * (1 - clamped));
  const startOpacity = roundMetric(clamped);
  return [
    { translate: startX === 0 ? '0 0' : `${startX}px 0`, opacity: startOpacity },
    { translate: `${OUTLINE_RAIL_OFFSET_PX}px 0`, opacity: 0 },
  ];
}
