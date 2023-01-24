import { Component } from "solid-js";

import { IconProps, withDefaultIconProps } from "./props";

export const Link: Component<IconProps> = (props) => {
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
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
};
