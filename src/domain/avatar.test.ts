import { describe, expect, it } from "vitest";
import {
  avatarBounds,
  avatarDragPosition,
  clampAvatar,
  restoreAvatarPosition,
  savedAvatarPosition,
} from "./avatar";

describe("companion placement", () => {
  const bounds = avatarBounds(412, 915, 292, 95, 24);
  it("keeps the whole card on screen, above navigation and below the safe inset", () => {
    expect(bounds).toEqual({ minX: -84, minY: -684, maxY: 0 });
    expect(clampAvatar(-1000, -1000, bounds)).toEqual({ x: -84, y: -684 });
    expect(clampAvatar(100, 100, bounds)).toEqual({ x: 0, y: 0 });
    expect(avatarBounds(1440, 915, 292, 95).minX).toBe(-212);
  });
  it("adapts remembered placement to a smaller or rotated display", () => {
    const remembered = JSON.stringify(savedAvatarPosition(true, -342, bounds));
    const landscape = avatarBounds(915, 412, 292, 95, 0);
    expect(restoreAvatarPosition(remembered, landscape)).toEqual({
      x: -212,
      y: -102.5,
    });
    expect(
      restoreAvatarPosition(remembered, avatarBounds(320, 240, 288, 180)),
    ).toEqual({ x: 0, y: 0 });
  });
  it("preserves full pointer movement and snaps from release even if intermediate updates were skipped", () => {
    const desktop = avatarBounds(1440, 1000, 292, 77);
    const position = avatarDragPosition(0, 0, 720, 864, 590, 679, desktop);
    expect(position).toEqual({ x: -130, y: -185 });
    expect(position.x).toBeLessThan(desktop.minX / 2);
    expect(savedAvatarPosition(true, position.y, desktop)).toMatchObject({
      edge: "left",
      fraction: 185 / 811,
    });
    // Pointer positions stay in screen coordinates as the card moves.
    expect(
      avatarDragPosition(-212, -185, 498, 679, 1000, 2000, desktop),
    ).toEqual({ x: 0, y: 0 });
  });
  it("rejects malformed storage and non-finite coordinates", () => {
    for (const raw of [
      null,
      "{",
      "null",
      "{}",
      '{"fraction":"bad"}',
      '{"fraction":null}',
    ]) {
      expect(restoreAvatarPosition(raw, bounds)).toEqual({ x: 0, y: 0 });
    }
    expect(clampAvatar(NaN, Infinity, bounds)).toEqual({ x: 0, y: 0 });
    expect(
      restoreAvatarPosition('{"edge":"left","version":2,"fraction":9}', bounds),
    ).toEqual({ x: -84, y: -684 });
  });
  it("migrates the original negative fractional offset", () => {
    expect(
      restoreAvatarPosition('{"edge":"left","fraction":-0.5}', bounds),
    ).toEqual({ x: -84, y: -342 });
    expect(savedAvatarPosition(false, 500, bounds)).toEqual({
      version: 2,
      edge: "right",
      fraction: 0,
    });
  });
});
