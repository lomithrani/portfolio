import { expect, test } from 'bun:test'
import type { Portfolio } from 'portfolio-api'

type IsAny<T> = 0 extends (1 & T) ? true : false;

// This function will be valid only if Portfolio is of type `any`
const isAny: IsAny<Portfolio> = true as any;

test("Portolio import shouldn't be of any type", () => {
  expect(isAny).toBe(false)
})