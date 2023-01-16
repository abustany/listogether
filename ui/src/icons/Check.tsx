import { Component } from "solid-js";

import { IconProps, withDefaultIconProps } from "./props";

export const Check: Component<IconProps> = (props) => {
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
};
