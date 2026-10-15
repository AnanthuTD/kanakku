/**
 * Read-only parser for Android 16 `dumpsys window windows` output. UIAutomator omits
 * TYPE_APPLICATION_OVERLAY views, so use the currently drawn window frame instead.
 * This helper deliberately refuses uncertain matches rather than tapping a guessed point.
 */
export const COMPANION_TEST_PACKAGE = "app.tinkerbox.kanakku.e2e";

const rectangle = String.raw`\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]`;
const toRect = (match) =>
  match && {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4]),
  };
const validRect = (r) =>
  r &&
  Object.values(r).every(Number.isSafeInteger) &&
  r.right > r.left &&
  r.bottom > r.top;
const within = (inner, outer) =>
  inner.left >= outer.left &&
  inner.top >= outer.top &&
  inner.right <= outer.right &&
  inner.bottom <= outer.bottom;

/** Visible exact-owner WindowState entries. No title, guessed coordinate or footer copies are used. */
function companionWindows(dump, options = {}) {
  if (typeof dump !== "string") return [];
  dump = dump.split(
    /^\s{0,2}(?:mGlobalConfiguration=|AccessibilityController:|SnapshotCache )/m,
  )[0];
  const { displayId = 0, userId = 0, displaySize } = options;
  if (
    !Number.isSafeInteger(displayId) ||
    displayId < 0 ||
    !Number.isSafeInteger(userId) ||
    userId < 0
  )
    return [];
  const screen = displaySize && {
    left: 0,
    top: 0,
    right: displaySize.width,
    bottom: displaySize.height,
  };
  if (
    displaySize &&
    (!validRect(screen) || screen.right > 16384 || screen.bottom > 16384)
  )
    return [];
  const headers = [
    ...dump.matchAll(
      /^\s*Window #(\d+) Window\{([^\s}]+) u(\d+) [^\n}]+\}:\s*$/gm,
    ),
  ];
  const candidates = [];
  for (let index = 0; index < headers.length; index++) {
    const header = headers[index];
    if (Number(header[3]) !== userId) continue;
    const block = dump.slice(
      header.index + header[0].length,
      headers[index + 1]?.index ?? dump.length,
    );
    const owner = /^\s*mOwnerUid=\d+[^\n]*\bpackage=([^\s]+)(?:\s|$)/m.exec(
      block,
    )?.[1];
    if (
      owner !== COMPANION_TEST_PACKAGE ||
      Number(/\bmDisplayId=(\d+)\b/.exec(block)?.[1]) !== displayId ||
      !/\bty=(?:APPLICATION_OVERLAY|2038)\b/.test(block)
    )
      continue;
    if (
      !/\bmViewVisibility=0x0\b/.test(block) ||
      !/\bmHaveFrame=true\b/.test(block) ||
      !/\bmHasSurface=true\b/.test(block) ||
      !/\bisReadyForDisplay\(\)=true\b/.test(block) ||
      !/^\s*isOnScreen=true\s*$/m.test(block) ||
      !/^\s*isVisible=true\s*$/m.test(block) ||
      !/\bSurface:\s+shown=true\b/.test(block) ||
      !/\bmDrawState=HAS_DRAWN\b/.test(block)
    )
      continue;
    if (
      /\b(?:mRemoved|mRemoveOnExit|mDestroying|mAnimatingExit|mAppDied|mLastHidden|mObscured)=true\b/.test(
        block,
      ) ||
      /\bNOT_TOUCHABLE\b/.test(block) ||
      /\b(?:mShownAlpha|mAlpha)=0(?:\.0+)?(?:\s|$)/.test(block)
    )
      continue;
    const dimensions = /\bmAttrs=\{\(-?\d+,-?\d+\)\(([^)]+)\)/.exec(block)?.[1];
    const config = /\bmFullConfiguration=\{([^\n}]*)/.exec(block)?.[1] ?? "";
    const density = Number(/\b(\d+)dpi\b/.exec(config)?.[1]);
    if (!dimensions || !density || density < 72 || density > 960) continue;
    const frames = /^\s*Frames:[^\n]+$/m.exec(block)?.[0];
    if (!frames) continue;
    const frame = toRect(
      new RegExp(String.raw`\bframe=${rectangle}`).exec(frames),
    );
    const display = toRect(
      new RegExp(String.raw`\bdisplay=${rectangle}`).exec(frames),
    );
    if (
      !validRect(frame) ||
      !validRect(display) ||
      display.left < 0 ||
      display.top < 0 ||
      display.right > 16384 ||
      display.bottom > 16384 ||
      !within(frame, display) ||
      (screen && (!within(frame, screen) || !within(display, screen)))
    )
      continue;
    candidates.push({
      x: Math.floor((frame.left + frame.right) / 2),
      y: Math.floor((frame.top + frame.bottom) / 2),
      windowId: header[2],
      displayId,
      frame,
      dimensions,
      density,
      fontScale: Number(/^([\d.]+)\s/.exec(config)?.[1]),
      leftToRight: /\bldltr\b/.test(config),
    });
  }
  return candidates;
}
const pointAndFrame = ({ x, y, windowId, displayId, frame }) => ({
  x,
  y,
  windowId,
  displayId,
  frame,
});

/**
 * @param {string} dump Fresh `adb -s emulator-5580 shell dumpsys window windows` output.
 * @param {{displayId?:number,userId?:number,displaySize?:{width:number,height:number},avatarSizesDp?:number[]}} options
 * @returns {{x:number,y:number,windowId:string,displayId:number,frame:{left:number,top:number,right:number,bottom:number}}|null}
 * Avatar builds used 72/104 dp. Bubbles wrap content; the dismiss target is untouchable.
 */
export function findCompanionOverlay(dump, options = {}) {
  const { avatarSizesDp = [72, 104] } = options;
  if (
    !Array.isArray(avatarSizesDp) ||
    !avatarSizesDp.length ||
    avatarSizesDp.some(
      (size) => !Number.isFinite(size) || size < 48 || size > 128,
    )
  )
    return null;
  const candidates = companionWindows(dump, options).filter(
    ({ dimensions, density, frame }) => {
      const fixed = /^(\d+)x(\d+)$/.exec(dimensions);
      if (!fixed) return false;
      const width = Number(fixed[1]),
        height = Number(fixed[2]);
      return (
        width === height &&
        avatarSizesDp.some(
          (size) => Math.abs(width - Math.trunc((size * density) / 160)) <= 1,
        ) &&
        Math.abs(frame.right - frame.left - width) <= 1 &&
        Math.abs(frame.bottom - frame.top - height) <= 1
      );
    },
  );
  return candidates.length === 1 ? pointAndFrame(candidates[0]) : null;
}

function bubbleWindow(dump, options) {
  const candidates = companionWindows(dump, options).filter(
    ({ dimensions }) => dimensions === "wrapxwrap",
  );
  return candidates.length === 1 ? candidates[0] : null;
}

/** Returns only a unique visible wrap-content E2E bubble, never an avatar/dismiss target. */
export function findCompanionBubble(dump, options = {}) {
  const bubble = bubbleWindow(dump, options);
  return bubble ? pointAndFrame(bubble) : null;
}

/**
 * Centre of a native Companion.kt action at normal LTR font scale. Caller establishes pose
 * from actual voice/session evidence; window dumps do not contain the speech text. The answer
 * row is Photo/Edit/Save, each minWidth72dp, marginStart8dp, height48dp, right padding12dp.
 * The 9dp tail is bottom padding above the avatar, top padding below it. Refuse changed/large
 * font layouts, missing avatar, ambiguous bubbles or a frame that cannot fit this exact row.
 */
export function findCompanionAction(
  dump,
  label,
  pose = "answer",
  options = {},
) {
  const labels =
    pose === "answer"
      ? ["Photo", "Edit", "Save"]
      : pose === "asking"
        ? ["Photo"]
        : [];
  const index = labels.indexOf(label);
  if (index < 0) return null;
  const bubble = bubbleWindow(dump, options);
  const avatar = findCompanionOverlay(dump, options);
  if (
    !bubble ||
    !avatar ||
    !bubble.leftToRight ||
    !(bubble.fontScale > 0 && bubble.fontScale <= 1)
  )
    return null;
  const dp = (value) => Math.trunc((value * bubble.density) / 160);
  const frame = bubble.frame;
  const tailDown = bubble.y < avatar.y;
  if (
    tailDown
      ? Math.abs(frame.bottom - avatar.frame.top - dp(14)) > 2
      : Math.abs(frame.top - avatar.frame.bottom + dp(6)) > 2
  )
    return null;
  const cell = dp(72),
    gap = dp(8),
    padding = dp(12),
    height = dp(48);
  const rowWidth = 3 * (cell + gap) + 2 * padding;
  const actualWidth = frame.right - frame.left;
  if (
    pose === "answer"
      ? Math.abs(actualWidth - rowWidth) > 1
      : actualWidth < cell + gap + 2 * padding || actualWidth >= rowWidth - 1
  )
    return null;
  const bottomPadding = padding + (tailDown ? dp(9) : 0);
  const actionLeft =
    frame.right - padding - cell - (labels.length - 1 - index) * (cell + gap);
  const actionTop = frame.bottom - bottomPadding - height;
  if (
    actionLeft < frame.left + padding ||
    actionTop < frame.top + padding + dp(8)
  )
    return null;
  const x = Math.floor(actionLeft + cell / 2),
    y = Math.floor(actionTop + height / 2);
  if (
    x <= frame.left ||
    x >= frame.right ||
    y <= frame.top ||
    y >= frame.bottom
  )
    return null;
  return { x, y };
}
