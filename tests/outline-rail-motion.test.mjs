import assert from 'node:assert/strict';

import {
  OUTLINE_PREVIEW_TEST_ID,
  OUTLINE_RAIL_OFFSET_PX,
  OUTLINE_RAIL_TEST_ID,
  outlineRailDuration,
  outlineRailKeyframes,
  outlineRailProgress,
} from '../client/outline-rail-motion.ts';

assert.equal(OUTLINE_RAIL_TEST_ID, 'chat-outline-rail');
assert.equal(OUTLINE_PREVIEW_TEST_ID, 'chat-outline-preview');
assert.equal(OUTLINE_RAIL_OFFSET_PX, -24);

assert.deepEqual(outlineRailKeyframes('enter'), [
  { translate: '-24px 0', opacity: 0 },
  { translate: '0 0', opacity: 1 },
]);

assert.deepEqual(outlineRailKeyframes('exit'), [
  { translate: '0 0', opacity: 1 },
  { translate: '-24px 0', opacity: 0 },
]);

// If an exit animation is interrupted 40% of the way through (72ms of 180ms),
// the rail is at -9.6px with 0.6 opacity. Re-entering from that progress
// starts from the exact in-flight position rather than snapping to -24px.
const enterSpanAfterInterruptedExit = outlineRailProgress(72, 180, 1);
assert.equal(enterSpanAfterInterruptedExit, 0.4);
assert.deepEqual(outlineRailKeyframes('enter', enterSpanAfterInterruptedExit), [
  { translate: '-9.6px 0', opacity: 0.6 },
  { translate: '0 0', opacity: 1 },
]);

// If that resumed entrance (starting at span 0.4, i.e. -9.6px / opacity 0.6)
// is interrupted halfway through (50%), the rail is now at -4.8px with 0.8 opacity.
// Reversing back to exit starts from that exact position (-4.8px / opacity 0.8).
const exitSpanAfterInterruptedEnter = outlineRailProgress(
  50,
  100,
  enterSpanAfterInterruptedExit,
);
assert.equal(exitSpanAfterInterruptedEnter, 0.8);
assert.deepEqual(outlineRailKeyframes('exit', exitSpanAfterInterruptedEnter), [
  { translate: '-4.8px 0', opacity: 0.8 },
  { translate: '-24px 0', opacity: 0 },
]);

assert.equal(outlineRailProgress(-10, 180, 1), 0);
assert.equal(outlineRailProgress(300, 180, 1), 1);
assert.equal(outlineRailProgress(90, 0, 1), 1);

assert.equal(outlineRailDuration(180, 1), 180);
assert.equal(outlineRailDuration(180, 0.5), 90);
assert.equal(outlineRailDuration(180, 0.1), 60);
assert.equal(outlineRailDuration(0, 1), 0);
