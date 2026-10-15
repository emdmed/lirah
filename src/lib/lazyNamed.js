import { lazy } from "react";

// React.lazy for a module's named export (components here use named exports only).
export function lazyNamed(load, name) {
  return lazy(() => load().then((module) => ({ default: module[name] })));
}
