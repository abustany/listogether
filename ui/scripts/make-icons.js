#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";

// Icons we want to generate.
const ICONS = ["arrow-left", "check", "link", "more-vertical", "plus", "refresh-cw", "share-2", "trash-2", "x"];

const kebabToCamelRe = /-(.)/g;

function camelCase(s) {
  if (!s) return s;

  return s[0].toUpperCase() + s.slice(1).replace(kebabToCamelRe, (_match, x) => x.toUpperCase());
}

const featherIcons = JSON.parse(fs.readFileSync("node_modules/feather-icons/dist/icons.json"));

const outFolder = path.join("src", "icons");
fs.mkdirSync(outFolder, { recursive: true });

const iconPropsSource = `
import { mergeProps, splitProps } from "solid-js";

export interface IconProps {
  size?: string;
  color?: string;
  [key: string]: unknown;
};

export const withDefaultIconProps = (p: IconProps) => splitProps(
  mergeProps(
    {
      size: "24",
      color: "currentColor",
    },
    p
  ),
  ["size", "color"]
);
`.trim();

fs.writeFileSync(path.join(outFolder, "props.ts"), iconPropsSource, "utf-8");

for (const iconName of ICONS) {
  const svgData = featherIcons[iconName];
  if (!svgData) throw new Error(`icon ${iconName} is not defined`);

  const componentName = camelCase(iconName);
  const componentSource = `
import { Component } from "solid-js";

import { IconProps, withDefaultIconProps } from "./props";

export const ${componentName}: Component<IconProps> = (props) => {
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
      ${svgData}
    </svg>
  );
}
`;
  const filename = path.join(outFolder, `${componentName}.tsx`);
  console.log(`Writing ${filename}`);
  fs.writeFileSync(filename, componentSource, "utf-8");
}
