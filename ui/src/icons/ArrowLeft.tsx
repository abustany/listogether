import { Component } from "solid-js";

import { IconProps, withDefaultIconProps } from "./props";

export const ArrowLeft: Component<IconProps> = (props) => {
  const [std, other] = withDefaultIconProps(props);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={std.size}
      height={std.size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={std.color}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      {...other}
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
};
