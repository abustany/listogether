import { mergeProps, splitProps } from "solid-js";

export interface IconProps {
  size?: string;
  color?: string;
  [key: string]: unknown;
}

export const withDefaultIconProps = (p: IconProps) =>
  splitProps(
    mergeProps(
      {
        size: "24",
        color: "currentColor",
      },
      p,
    ),
    ["size", "color"],
  );
