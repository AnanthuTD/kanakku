import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPANION_TEST_PACKAGE,
  findCompanionOverlay,
  findCompanionBubble,
  findCompanionAction,
} from "./companion-overlay.mjs";

// Shape taken from API 36 WindowState dumps, with invented identifiers/coordinates.
const windowDump = (patch = {}) => {
  const p = {
    id: "abc123",
    owner: COMPANION_TEST_PACKAGE,
    user: 0,
    display: 0,
    type: "APPLICATION_OVERLAY",
    dimensions: "273x273",
    density: 420,
    frame: "[790,850][1063,1123]",
    displayFrame: "[0,0][1080,2400]",
    last: "[20,200][293,473]",
    visibility: "0x0",
    haveFrame: true,
    surface: true,
    ready: true,
    shown: true,
    drawn: "HAS_DRAWN",
    onScreen: true,
    visible: true,
    hidden: false,
    obscured: false,
    flags: "NOT_FOCUSABLE NOT_TOUCH_MODAL",
    extra: "",
    ...patch,
  };
  return `  Window #2 Window{${p.id} u${p.user} KanakkuApp}:
    mDisplayId=${p.display} mSession=Session{invented 1000:u0a10200}
    mOwnerUid=10200 showForAllUsers=false package=${p.owner} appop=SYSTEM_ALERT_WINDOW
    mAttrs={(9,9)(${p.dimensions}) gr=TOP LEFT ty=${p.type} fmt=TRANSLUCENT
      fl=${p.flags}}
    Requested w=273 h=273 mLayoutSeq=7
    mViewVisibility=${p.visibility} mHaveFrame=${p.haveFrame} mObscured=${p.obscured}
    mFullConfiguration={1.0 ldltr sw411dp w411dp h914dp ${p.density}dpi nrml long port}
    mHasSurface=${p.surface} isReadyForDisplay()=${p.ready} mWindowRemovalAllowed=false
    Frames: parent=[0,0][1080,2400] display=${p.displayFrame} frame=${p.frame} last=${p.last} insetsChanged=false
    WindowStateAnimator{invented KanakkuApp}:
      mSurface=Surface(name=KanakkuApp)/@0x123
      Surface: shown=${p.shown} mDrawState=${p.drawn} mLastHidden=${p.hidden}
    isOnScreen=${p.onScreen}
    isVisible=${p.visible}
    ${p.extra}
`;
};

test("selects the exact E2E avatar's CURRENT frame, ignoring requested position/last frame and other owners", () => {
  const dump =
    windowDump({ owner: "app.tinkerbox.kanakku", id: "personal" }) +
    windowDump({ owner: "app.tinkerbox.kanakku.e2e.fake", id: "prefix" }) +
    windowDump();
  assert.deepEqual(
    findCompanionOverlay(dump, { displaySize: { width: 1080, height: 2400 } }),
    {
      x: 926,
      y: 986,
      windowId: "abc123",
      displayId: 0,
      frame: { left: 790, top: 850, right: 1063, bottom: 1123 },
    },
  );
});

test("accepts numeric TYPE_APPLICATION_OVERLAY and measured 72 dp frames", () => {
  const result = findCompanionOverlay(
    windowDump({
      type: "2038",
      dimensions: "189x189",
      frame: "[15,600][204,789]",
    }),
  );
  assert.deepEqual([result.x, result.y], [109, 694]);
});

test("ignores wrap-content bubbles and the untouchable dismiss target", () => {
  const dump =
    windowDump({
      id: "bubble",
      dimensions: "wrapxwrap",
      frame: "[300,300][800,650]",
    }) +
    windowDump({
      id: "dismiss",
      dimensions: "168x168",
      frame: "[456,2100][624,2268]",
      flags: "NOT_FOCUSABLE NOT_TOUCHABLE NOT_TOUCH_MODAL",
    }) +
    windowDump();
  assert.equal(findCompanionOverlay(dump)?.windowId, "abc123");
  assert.equal(
    findCompanionOverlay(windowDump({ dimensions: "wrapxwrap" })),
    null,
  );
});

test("rejects stale, hidden, unready, undrawn, removed and obscured windows", () => {
  for (const patch of [
    { visibility: "0x4" },
    { visibility: "0x8" },
    { haveFrame: false },
    { surface: false },
    { ready: false },
    { shown: false },
    { drawn: "DRAW_PENDING" },
    { onScreen: false },
    { visible: false },
    { hidden: true },
    { obscured: true },
    { extra: "mRemoved=true" },
    { extra: "mDestroying=true" },
    { extra: "mAnimatingExit=true" },
    { extra: "mShownAlpha=0.0 mAlpha=1.0" },
  ])
    assert.equal(
      findCompanionOverlay(windowDump(patch)),
      null,
      JSON.stringify(patch),
    );
});

test("rejects base application, a different user/display/package, invalid geometry and missing data", () => {
  for (const patch of [
    { type: "BASE_APPLICATION" },
    { user: 10 },
    { display: 1 },
    { owner: "other.app" },
    { dimensions: "273x250" },
    { dimensions: "600x600" },
    { frame: "[0,0][0,0]" },
    { frame: "[790,850][1000,1100]" },
    { density: 0 },
    { density: "undefined" },
  ])
    assert.equal(
      findCompanionOverlay(windowDump(patch)),
      null,
      JSON.stringify(patch),
    );
  assert.equal(
    findCompanionOverlay(windowDump().replace(/^.*Frames:.*\n/m, "")),
    null,
  );
  assert.equal(findCompanionOverlay(""), null);
  assert.equal(findCompanionOverlay(undefined), null);
});

test("rejects fully and partially offscreen frames instead of clamping onto another app", () => {
  for (const frame of [
    "[-400,850][-127,1123]",
    "[-10,850][263,1123]",
    "[1000,850][1273,1123]",
    "[790,2300][1063,2573]",
  ])
    assert.equal(findCompanionOverlay(windowDump({ frame })), null, frame);
  assert.equal(
    findCompanionOverlay(windowDump(), {
      displaySize: { width: 1000, height: 2400 },
    }),
    null,
  );
});

test("fails closed on two live avatar-sized windows; a hidden old window cannot win", () => {
  assert.equal(
    findCompanionOverlay(windowDump() + windowDump({ id: "second" })),
    null,
  );
  assert.equal(
    findCompanionOverlay(
      windowDump({ id: "old", visible: false }) + windowDump(),
    )?.windowId,
    "abc123",
  );
});

test("does not read accessibility/footer frame copies as live windows", () => {
  const dump =
    windowDump({ visible: false }) +
    `  mGlobalConfiguration={1.0}
AccessibilityController:
  Window #8 Window{footer u0 KanakkuApp}:
    ${windowDump().split("\n").slice(1).join("\n")}`;
  // Footer text can contain saved copies; only actual WindowState sections count.
  assert.equal(findCompanionOverlay(dump), null);
});

test("rejects invalid caller display dimensions", () => {
  for (const displaySize of [
    { width: NaN, height: 2400 },
    { width: -1, height: 2 },
    { width: 1080, height: 999999 },
  ])
    assert.equal(findCompanionOverlay(windowDump(), { displaySize }), null);
});

const answerDump = (patch = {}) =>
  windowDump() +
  windowDump({
    id: "bubble",
    dimensions: "wrapxwrap",
    frame: "[371,450][1063,886]",
    ...patch,
  });
test("bubble locator chooses only the current wrap-content E2E window", () => {
  assert.deepEqual(findCompanionBubble(answerDump()), {
    x: 717,
    y: 668,
    windowId: "bubble",
    displayId: 0,
    frame: { left: 371, top: 450, right: 1063, bottom: 886 },
  });
  assert.equal(findCompanionBubble(windowDump()), null);
  for (const patch of [
    { owner: "other.app" },
    { visible: false },
    { user: 10 },
    { frame: "[1000,450][1692,886]" },
  ])
    assert.equal(findCompanionBubble(answerDump(patch)), null);
  assert.equal(
    findCompanionBubble(
      answerDump() +
        windowDump({ id: "other-bubble", dimensions: "wrapxwrap" }),
    ),
    null,
  );
});
test("answer action centres follow the three source-defined cells above the avatar", () => {
  assert.deepEqual(findCompanionAction(answerDump(), "Photo"), {
    x: 517,
    y: 769,
  });
  assert.deepEqual(findCompanionAction(answerDump(), "Edit"), {
    x: 727,
    y: 769,
  });
  assert.deepEqual(findCompanionAction(answerDump(), "Save"), {
    x: 937,
    y: 769,
  });
  assert.equal(findCompanionAction(answerDump(), "Delete"), null);
  assert.equal(findCompanionAction(answerDump(), "Edit", "asking"), null);
  assert.equal(findCompanionAction(answerDump(), "Photo", "asking"), null);
});
test("below-avatar bubbles move tail padding to the top rather than guessing the same vertical offset", () => {
  const dump =
    windowDump({ frame: "[790,130][1063,403]" }) +
    windowDump({
      id: "bubble",
      dimensions: "wrapxwrap",
      frame: "[371,388][1063,824]",
    });
  assert.deepEqual(findCompanionAction(dump, "Edit"), { x: 727, y: 730 });
});
test("asking Photo uses its single trailing cell and cannot masquerade as the answer row", () => {
  const dump = answerDump({ frame: "[463,530][1063,886]" });
  assert.deepEqual(findCompanionAction(dump, "Photo", "asking"), {
    x: 937,
    y: 769,
  });
  assert.equal(findCompanionAction(dump, "Edit"), null);
});
test("action locator refuses stale, ambiguous, scaled, RTL, relocated, clipped or unverified layouts", () => {
  for (const patch of [
    { owner: "app.tinkerbox.kanakku" },
    { visible: false },
    { frame: "[371,400][1063,836]" },
    { frame: "[400,450][1063,886]" },
    { frame: "[371,800][1063,886]" },
    { frame: "[-10,450][682,886]" },
  ])
    assert.equal(
      findCompanionAction(answerDump(patch), "Edit"),
      null,
      JSON.stringify(patch),
    );
  assert.equal(
    findCompanionAction(
      answerDump().replaceAll("{1.0 ldltr", "{2.0 ldltr"),
      "Edit",
    ),
    null,
  );
  assert.equal(
    findCompanionAction(answerDump().replaceAll("ldltr", "ldrtl"), "Edit"),
    null,
  );
  assert.equal(
    findCompanionAction(
      answerDump() + windowDump({ id: "second-avatar" }),
      "Edit",
    ),
    null,
  );
  assert.equal(
    findCompanionAction(
      answerDump() +
        windowDump({ id: "second-bubble", dimensions: "wrapxwrap" }),
      "Edit",
    ),
    null,
  );
  assert.equal(
    findCompanionAction(
      windowDump({ dimensions: "wrapxwrap", frame: "[371,450][1063,886]" }),
      "Edit",
    ),
    null,
  );
  assert.equal(
    findCompanionAction(answerDump(), "Edit", "answer", {
      displaySize: { width: 1000, height: 2400 },
    }),
    null,
  );
});
