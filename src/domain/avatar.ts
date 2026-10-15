export interface AvatarBounds {
  minX: number;
  minY: number;
  maxY: number;
}
export interface AvatarPosition {
  edge: "left" | "right";
  fraction: number;
  version: 2;
}
export function avatarBounds(
  width: number,
  height: number,
  cardWidth: number,
  cardHeight: number,
  topInset = 0,
): AvatarBounds {
  return {
    minX: Math.min(0, cardWidth + 36 - Math.min(width, 540)),
    minY: Math.min(0, -height + 94 + cardHeight + topInset + 18),
    maxY: 0,
  };
}
export function clampAvatar(x: number, y: number, bounds: AvatarBounds) {
  "worklet";
  return {
    x: Math.max(bounds.minX, Math.min(0, Number.isFinite(x) ? x : 0)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, Number.isFinite(y) ? y : 0)),
  };
}
export function avatarDragPosition(
  startX: number,
  startY: number,
  pointerStartX: number,
  pointerStartY: number,
  pointerX: number,
  pointerY: number,
  bounds: AvatarBounds,
) {
  "worklet";
  return clampAvatar(
    startX + pointerX - pointerStartX,
    startY + pointerY - pointerStartY,
    bounds,
  );
}
export function savedAvatarPosition(
  left: boolean,
  y: number,
  bounds: AvatarBounds,
): AvatarPosition {
  return {
    version: 2,
    edge: left ? "left" : "right",
    fraction:
      bounds.minY === 0 || y >= 0
        ? 0
        : clampAvatar(0, y, bounds).y / bounds.minY,
  };
}
export function restoreAvatarPosition(
  raw: string | null,
  bounds: AvatarBounds,
) {
  if (!raw) return { x: 0, y: 0 };
  try {
    const position = JSON.parse(raw);
    if (
      !position ||
      typeof position.fraction !== "number" ||
      !Number.isFinite(position.fraction)
    )
      return { x: 0, y: 0 };
    // The original format stored a negative upward offset. V2 stores 0..1.
    const fraction =
      position.version === 2 ? position.fraction : -position.fraction;
    return clampAvatar(
      position.edge === "left" ? bounds.minX : 0,
      Math.min(1, Math.max(0, fraction)) * bounds.minY,
      bounds,
    );
  } catch {
    return { x: 0, y: 0 };
  }
}
