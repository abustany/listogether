import { test as base } from "@playwright/test";

type Fixtures = {};

export const test = base.extend<Fixtures>({});

export * from "@playwright/test";
