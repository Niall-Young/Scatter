import type { ScatterApi } from "../../../preload";

declare global {
  interface Window {
    scatter: ScatterApi;
  }
}

export {};
