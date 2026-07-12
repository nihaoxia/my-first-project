import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { AuthoritativeBlobStore } from "../edgeone/blob-store-core.ts";
import type { Revision } from "../edgeone/revisions-core.ts";
import {
  requireLoginableAccount,
  resolveAccountRevisions,
  type AccountRevision,
  type AccountValue,
} from "./edgeone-account-core.ts";
import {
  generateRecoveryCode,
  hashPassword,
  hashRecoveryCode,
  hashUsername,
  normalizeUsername,
  verifyPassword,
} from "./edgeone-password-core.ts";

export type EdgeOneSessionRecord = {
  userId: string;
  usernameHash: string;
  generation: number;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
};

type AccountClaim = {
  userId: string;
  accountLabel: string;
};

type Dependencies = {
  blob: AuthoritativeBlobStore;
  usernamePepper: string;
  now: () => Date;
  uuid: () => string;
  randomBytes: (length: number) => Uint8Array;
};

type StableAccountErrorCode =
  | "INVALID_CREDENTIALS"
  | "USERNAME_UNAVAILABLE"
  | "ACCOUNT_SERVICE_UNAVAILABLE";

class EdgeOneAccountServiceError extends Error {
  readonly code: StableAccountErrorCode;

  constructor(code: StableAccountErrorCode) {
    super(code);
    this.code = code;
    this.name = "EdgeOneAccountServiceError";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function tokenFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function tokenHash(token: string): string {
  return bytesToHex(sha256(utf8ToBytes(token)));
}

function safeEqualHex(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function createEdgeOneAccountService(dependencies: Dependencies) {
  const { blob, usernamePepper, now, uuid, randomBytes } = dependencies;

  const accountPrefix = (usernameHash: string) =>
    `auth/accounts/${usernameHash}/revisions/`;

  async function loadClaim(usernameHash: string): Promise<AccountClaim | null> {
    return blob.getJSON<AccountClaim>(`auth/accounts/${usernameHash}/claim.json`);
  }

  async function loadAccount(usernameHash: string): Promise<AccountRevision> {
    const items = await blob.listAll(accountPrefix(usernameHash));
    const revisions: AccountRevision[] = [];
    for (const item of items) {
      const revision = await blob.getJSON<AccountRevision>(item.key);
      if (!revision) throw new EdgeOneAccountServiceError("ACCOUNT_SERVICE_UNAVAILABLE");
      revisions.push(revision);
    }
    return requireLoginableAccount(resolveAccountRevisions(revisions));
  }

  async function createSession(usernameHash: string, account: AccountValue) {
    const bytes = randomBytes(32);
    if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
      throw new EdgeOneAccountServiceError("ACCOUNT_SERVICE_UNAVAILABLE");
    }
    const sessionToken = tokenFromBytes(bytes);
    const timestamp = now();
    if (Number.isNaN(timestamp.getTime())) {
      throw new EdgeOneAccountServiceError("ACCOUNT_SERVICE_UNAVAILABLE");
    }
    const record: EdgeOneSessionRecord = {
      userId: account.userId,
      usernameHash,
      generation: account.generation,
      createdAt: timestamp.toISOString(),
      lastSeenAt: timestamp.toISOString(),
      idleExpiresAt: new Date(timestamp.getTime() + 7 * DAY_MS).toISOString(),
      absoluteExpiresAt: new Date(timestamp.getTime() + 30 * DAY_MS).toISOString(),
    };
    try {
      await blob.createJSON(`auth/sessions/${tokenHash(sessionToken)}.json`, record);
    } catch {
      throw new EdgeOneAccountServiceError("ACCOUNT_SERVICE_UNAVAILABLE");
    }
    return sessionToken;
  }

  return {
    async register(username: string, password: string) {
      const accountLabel = normalizeUsername(username);
      const usernameHash = hashUsername(accountLabel, usernamePepper);
      const userId = uuid();
      const recoveryCode = generateRecoveryCode(randomBytes);
      const value: AccountValue = {
        userId,
        accountLabel,
        passwordHash: await hashPassword(password, randomBytes),
        recoveryHash: hashRecoveryCode(recoveryCode),
        generation: 1,
        role: "USER",
      };
      const revision: Revision<AccountValue> = {
        id: uuid(),
        parentIds: [],
        operationId: uuid(),
        createdAt: now().toISOString(),
        deleted: false,
        value,
      };
      const revisionKey = `${accountPrefix(usernameHash)}${revision.id}.json`;
      try {
        await blob.createJSON(revisionKey, revision);
      } catch {
        throw new EdgeOneAccountServiceError("ACCOUNT_SERVICE_UNAVAILABLE");
      }
      try {
        await blob.createJSON(`auth/accounts/${usernameHash}/claim.json`, {
          userId,
          accountLabel,
        } satisfies AccountClaim);
      } catch (error) {
        try {
          await blob.remove(revisionKey);
        } catch {
          throw new EdgeOneAccountServiceError("ACCOUNT_SERVICE_UNAVAILABLE");
        }
        if ((error as { code?: string }).code === "BLOB_ALREADY_EXISTS") {
          throw new EdgeOneAccountServiceError("USERNAME_UNAVAILABLE");
        }
        throw new EdgeOneAccountServiceError("ACCOUNT_SERVICE_UNAVAILABLE");
      }
      const sessionToken = await createSession(usernameHash, value);
      return { userId, accountLabel, recoveryCode, sessionToken };
    },

    async login(username: string, password: string) {
      try {
        const accountLabel = normalizeUsername(username);
        const usernameHash = hashUsername(accountLabel, usernamePepper);
        const claim = await loadClaim(usernameHash);
        if (!claim) throw new Error("missing");
        const revision = await loadAccount(usernameHash);
        if (revision.value.userId !== claim.userId) throw new Error("mismatch");
        if (!(await verifyPassword(password, revision.value.passwordHash))) {
          throw new Error("password");
        }
        const sessionToken = await createSession(usernameHash, revision.value);
        return { userId: revision.value.userId, accountLabel, sessionToken };
      } catch {
        throw new EdgeOneAccountServiceError("INVALID_CREDENTIALS");
      }
    },

    async recover(username: string, recoveryCode: string, newPassword: string) {
      try {
        const accountLabel = normalizeUsername(username);
        const usernameHash = hashUsername(accountLabel, usernamePepper);
        const claim = await loadClaim(usernameHash);
        if (!claim) throw new Error("missing");
        const current = await loadAccount(usernameHash);
        if (
          current.value.userId !== claim.userId ||
          !safeEqualHex(hashRecoveryCode(recoveryCode), current.value.recoveryHash)
        ) {
          throw new Error("recovery");
        }
        const nextRecoveryCode = generateRecoveryCode(randomBytes);
        const value: AccountValue = {
          ...current.value,
          passwordHash: await hashPassword(newPassword, randomBytes),
          recoveryHash: hashRecoveryCode(nextRecoveryCode),
          generation: current.value.generation + 1,
        };
        const revision: AccountRevision = {
          id: uuid(),
          parentIds: [current.id],
          operationId: uuid(),
          createdAt: now().toISOString(),
          deleted: false,
          value,
        };
        await blob.createJSON(`${accountPrefix(usernameHash)}${revision.id}.json`, revision);
        const sessionToken = await createSession(usernameHash, value);
        return {
          userId: value.userId,
          accountLabel: value.accountLabel,
          recoveryCode: nextRecoveryCode,
          sessionToken,
        };
      } catch {
        throw new EdgeOneAccountServiceError("INVALID_CREDENTIALS");
      }
    },

    async validateSession(sessionToken: string) {
      if (!/^[A-Za-z0-9_-]{43}$/u.test(sessionToken)) return null;
      try {
        const session = await blob.getJSON<EdgeOneSessionRecord>(
          `auth/sessions/${tokenHash(sessionToken)}.json`,
        );
        if (!session) return null;
        const timestamp = now().getTime();
        if (
          !Number.isFinite(timestamp) ||
          timestamp >= Date.parse(session.idleExpiresAt) ||
          timestamp >= Date.parse(session.absoluteExpiresAt)
        ) return null;
        const claim = await loadClaim(session.usernameHash);
        if (!claim || claim.userId !== session.userId) return null;
        const current = await loadAccount(session.usernameHash);
        if (
          current.value.userId !== session.userId ||
          current.value.generation !== session.generation
        ) return null;
        return {
          userId: current.value.userId,
          accountLabel: current.value.accountLabel,
          role: current.value.role as "USER" | "ADMIN",
        };
      } catch {
        return null;
      }
    },

    async logout(sessionToken: string) {
      if (!/^[A-Za-z0-9_-]{43}$/u.test(sessionToken)) return;
      try {
        await blob.remove(`auth/sessions/${tokenHash(sessionToken)}.json`);
      } catch {
        throw new EdgeOneAccountServiceError("ACCOUNT_SERVICE_UNAVAILABLE");
      }
    },
  };
}

export type EdgeOneAccountService = ReturnType<typeof createEdgeOneAccountService>;
