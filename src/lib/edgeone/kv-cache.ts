import "server-only";

import {
  createEdgeOneListCache,
  type EdgeOneKvBinding,
} from "./kv-cache-core";

export function createBoundEdgeOneListCache(binding: EdgeOneKvBinding) {
  return createEdgeOneListCache(binding);
}
