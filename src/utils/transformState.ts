/**
 * Global transform-active flag — used by beforeunload handler to warn
 * users before navigating away during an active AI transform.
 */

let active = false;

export function setTransformActive(v: boolean): void {
  active = v;
}

export function isTransformActive(): boolean {
  return active;
}
