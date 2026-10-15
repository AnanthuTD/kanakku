import React from "react";
import Svg, { Path, Rect, G } from "react-native-svg";
import { leafBody, leafRib, leafStem } from "../brand/mark";

// The same tile and leaf as the launcher icon and the native splash
// (src/brand/mark.ts, rendered by scripts/render-brand.mjs).
export function BrandMark({
  size,
  tile,
  leaf,
}: {
  size: number;
  tile: string;
  leaf: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect width="100" height="100" rx="30" fill={tile} />
      <G transform="translate(14.72 12.56) scale(0.72)">
        <Path d={leafBody} fill={leaf} />
        <Path
          d={leafStem}
          stroke={leaf}
          strokeWidth={7}
          strokeLinecap="round"
        />
        <Path
          d={leafRib}
          fill="none"
          stroke={tile}
          strokeWidth={5}
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}
