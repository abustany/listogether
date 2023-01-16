import { Component } from "solid-js";

import { IconProps, withDefaultIconProps } from "./props";

export const X: Component<IconProps> = (props) => {
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
};
