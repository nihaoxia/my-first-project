import {
  resolveRevisionState,
  type Revision,
  type RevisionState,
} from "../edgeone/revisions-core.ts";
import type { PasswordHash } from "./edgeone-password-core.ts";

export type AccountValue = {
  userId: string;
  accountLabel: string;
  passwordHash: PasswordHash;
  recoveryHash: string;
  generation: number;
  role: "USER" | "ADMIN" | "BANNED";
};

export type AccountRevision = Revision<AccountValue>;

export class EdgeOneAccountStateError extends Error {
  readonly code: "ACCOUNT_CONFLICT" | "ACCOUNT_UNAVAILABLE";

  constructor(code: "ACCOUNT_CONFLICT" | "ACCOUNT_UNAVAILABLE") {
    super(code);
    this.code = code;
    this.name = "EdgeOneAccountStateError";
  }
}

export function resolveAccountRevisions(
  revisions: AccountRevision[],
): RevisionState<AccountValue> {
  return resolveRevisionState(revisions);
}

export function requireLoginableAccount(
  state: RevisionState<AccountValue>,
): AccountRevision {
  if (state.kind === "conflict") {
    throw new EdgeOneAccountStateError("ACCOUNT_CONFLICT");
  }
  if (
    state.kind !== "current" ||
    state.revision.deleted ||
    state.revision.value.role === "BANNED"
  ) {
    throw new EdgeOneAccountStateError("ACCOUNT_UNAVAILABLE");
  }
  return state.revision;
}

