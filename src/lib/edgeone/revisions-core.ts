export type Revision<T> = {
  id: string;
  parentIds: string[];
  operationId: string;
  createdAt: string;
  deleted: boolean;
  value: T;
};

export type RevisionState<T> =
  | { kind: "missing" }
  | { kind: "current"; revision: Revision<T> }
  | { kind: "conflict"; leaves: Revision<T>[] };

export class RevisionError extends Error {
  readonly code: "INVALID_REVISION_GRAPH" | "INVALID_MERGE_PARENTS";

  constructor(code: "INVALID_REVISION_GRAPH" | "INVALID_MERGE_PARENTS") {
    super(code);
    this.code = code;
    this.name = "RevisionError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateRevision<T>(revision: Revision<T>): boolean {
  return Boolean(
    revision &&
      UUID.test(revision.id) &&
      UUID.test(revision.operationId) &&
      Array.isArray(revision.parentIds) &&
      revision.parentIds.every((id) => UUID.test(id)) &&
      new Set(revision.parentIds).size === revision.parentIds.length &&
      !Number.isNaN(Date.parse(revision.createdAt)) &&
      typeof revision.deleted === "boolean",
  );
}

export function resolveRevisionState<T>(
  revisions: Revision<T>[],
): RevisionState<T> {
  if (revisions.length === 0) return { kind: "missing" };
  const byId = new Map<string, Revision<T>>();
  for (const revision of revisions) {
    if (!validateRevision(revision) || byId.has(revision.id)) {
      throw new RevisionError("INVALID_REVISION_GRAPH");
    }
    byId.set(revision.id, revision);
  }

  const childIds = new Set<string>();
  for (const revision of revisions) {
    for (const parentId of revision.parentIds) {
      if (!byId.has(parentId) || parentId === revision.id) {
        throw new RevisionError("INVALID_REVISION_GRAPH");
      }
      childIds.add(parentId);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new RevisionError("INVALID_REVISION_GRAPH");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const parentId of byId.get(id)!.parentIds) visit(parentId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);

  const leaves = revisions
    .filter((revision) => !childIds.has(revision.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (leaves.length === 0) throw new RevisionError("INVALID_REVISION_GRAPH");
  return leaves.length === 1
    ? { kind: "current", revision: leaves[0] }
    : { kind: "conflict", leaves };
}

export function assertMergeParents<T>(
  parentIds: string[],
  leaves: Revision<T>[],
): void {
  const actual = [...new Set(parentIds)].sort();
  const expected = leaves.map((leaf) => leaf.id).sort();
  if (
    actual.length !== parentIds.length ||
    actual.length !== expected.length ||
    actual.some((id, index) => id !== expected[index])
  ) {
    throw new RevisionError("INVALID_MERGE_PARENTS");
  }
}
