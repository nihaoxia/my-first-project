const MIB = 1024 * 1024;

export const PLATFORM_BLOB_LIMIT_BYTES = 1024 * MIB;
export const PLATFORM_MAX_OBJECT_BYTES = 25 * MIB;
export const SAFE_BLOB_LIMIT_BYTES =
  PLATFORM_BLOB_LIMIT_BYTES - PLATFORM_MAX_OBJECT_BYTES;
export const APPLICATION_UPLOAD_LIMIT_BYTES = 2 * MIB;
export const PLATFORM_MONTHLY_TOKEN_LIMIT = 500_000;
export const SAFE_MONTHLY_TOKEN_LIMIT = 450_000;

export type UsageEvent =
  | { type: "UPLOAD_RESERVED"; id: string; userId: string; bytes: number; at: string }
  | { type: "UPLOAD_COMMITTED"; id: string; reservationId: string; objectId: string; actualBytes: number; at: string }
  | { type: "UPLOAD_RELEASED"; id: string; reservationId: string; at: string }
  | { type: "OBJECT_DELETED"; id: string; objectId: string; bytes: number; at: string }
  | { type: "TOKENS_RESERVED"; id: string; tokens: number; month: string; at: string }
  | { type: "TOKENS_COMMITTED"; id: string; reservationId: string; actualTokens: number; at: string }
  | { type: "TOKENS_RELEASED"; id: string; reservationId: string; at: string };

export type ReadyUsage = {
  state: "ready";
  committed: number;
  reserved: number;
  tokensCommitted: number;
  tokensReserved: number;
};
export type UsageState = ReadyUsage | { state: "unavailable" };

export class QuotaError extends Error {
  readonly code:
    | "USAGE_LEDGER_UNAVAILABLE"
    | "USAGE_LEDGER_INVALID"
    | "FREE_QUOTA_EXHAUSTED";

  constructor(code: QuotaError["code"]) {
    super(code);
    this.code = code;
    this.name = "QuotaError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(): never {
  throw new QuotaError("USAGE_LEDGER_INVALID");
}

function natural(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
}

function validateCommon(event: UsageEvent): void {
  if (!event || !UUID.test(event.id) || Number.isNaN(Date.parse(event.at))) invalid();
}

const priority: Record<UsageEvent["type"], number> = {
  UPLOAD_RESERVED: 0,
  TOKENS_RESERVED: 0,
  UPLOAD_COMMITTED: 1,
  UPLOAD_RELEASED: 1,
  TOKENS_COMMITTED: 1,
  TOKENS_RELEASED: 1,
  OBJECT_DELETED: 2,
};

export function foldUsageEvents(events: UsageEvent[]): ReadyUsage {
  const ids = new Set<string>();
  for (const event of events) {
    validateCommon(event);
    if (ids.has(event.id)) invalid();
    ids.add(event.id);
  }
  const ordered = [...events].sort((a, b) =>
    Date.parse(a.at) - Date.parse(b.at) || priority[a.type] - priority[b.type] || a.id.localeCompare(b.id),
  );
  const uploads = new Map<string, { bytes: number; terminal: boolean }>();
  const objects = new Map<string, { bytes: number; deleted: boolean }>();
  const tokens = new Map<string, { tokens: number; terminal: boolean }>();
  let committed = 0;
  let reserved = 0;
  let tokensCommitted = 0;
  let tokensReserved = 0;

  for (const event of ordered) {
    switch (event.type) {
      case "UPLOAD_RESERVED": {
        if (!UUID.test(event.userId) || !natural(event.bytes, APPLICATION_UPLOAD_LIMIT_BYTES) || event.bytes !== APPLICATION_UPLOAD_LIMIT_BYTES || uploads.has(event.id)) invalid();
        uploads.set(event.id, { bytes: event.bytes, terminal: false });
        reserved += event.bytes;
        break;
      }
      case "UPLOAD_COMMITTED": {
        const reservation = uploads.get(event.reservationId);
        if (!reservation || reservation.terminal || !event.objectId || objects.has(event.objectId) || !natural(event.actualBytes, reservation.bytes)) invalid();
        reservation.terminal = true;
        reserved -= reservation.bytes;
        committed += event.actualBytes;
        objects.set(event.objectId, { bytes: event.actualBytes, deleted: false });
        break;
      }
      case "UPLOAD_RELEASED": {
        const reservation = uploads.get(event.reservationId);
        if (!reservation || reservation.terminal) invalid();
        reservation.terminal = true;
        reserved -= reservation.bytes;
        break;
      }
      case "OBJECT_DELETED": {
        const object = objects.get(event.objectId);
        if (!object || object.deleted || event.bytes !== object.bytes) invalid();
        object.deleted = true;
        committed -= object.bytes;
        break;
      }
      case "TOKENS_RESERVED": {
        if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(event.month) || !natural(event.tokens, SAFE_MONTHLY_TOKEN_LIMIT) || event.tokens === 0 || tokens.has(event.id)) invalid();
        tokens.set(event.id, { tokens: event.tokens, terminal: false });
        tokensReserved += event.tokens;
        break;
      }
      case "TOKENS_COMMITTED": {
        const reservation = tokens.get(event.reservationId);
        if (!reservation || reservation.terminal || !natural(event.actualTokens, reservation.tokens)) invalid();
        reservation.terminal = true;
        tokensReserved -= reservation.tokens;
        tokensCommitted += event.actualTokens;
        break;
      }
      case "TOKENS_RELEASED": {
        const reservation = tokens.get(event.reservationId);
        if (!reservation || reservation.terminal) invalid();
        reservation.terminal = true;
        tokensReserved -= reservation.tokens;
        break;
      }
      default:
        invalid();
    }
  }

  const usage = { state: "ready" as const, committed, reserved, tokensCommitted, tokensReserved };
  if (
    [committed, reserved, tokensCommitted, tokensReserved].some((value) => !natural(value)) ||
    committed + reserved > SAFE_BLOB_LIMIT_BYTES ||
    tokensCommitted + tokensReserved > SAFE_MONTHLY_TOKEN_LIMIT
  ) invalid();
  return usage;
}

export function assertFreeCapacity(
  usage: Pick<ReadyUsage, "state" | "committed" | "reserved"> | { state: "unavailable" },
  bytes: number,
): void {
  if (usage.state !== "ready") throw new QuotaError("USAGE_LEDGER_UNAVAILABLE");
  if (!natural(bytes, APPLICATION_UPLOAD_LIMIT_BYTES) || usage.committed + usage.reserved + bytes > SAFE_BLOB_LIMIT_BYTES) {
    throw new QuotaError("FREE_QUOTA_EXHAUSTED");
  }
}

export function reserveUpload(
  usage: Pick<ReadyUsage, "state" | "committed" | "reserved">,
  input: { reservationId: string; maxUploadBytes: number },
) {
  if (!UUID.test(input.reservationId) || input.maxUploadBytes !== APPLICATION_UPLOAD_LIMIT_BYTES) invalid();
  assertFreeCapacity(usage, input.maxUploadBytes);
  return { ...usage, reserved: usage.reserved + input.maxUploadBytes };
}

export function assertFreeTokenCapacity(usage: UsageState, tokens: number): void {
  if (usage.state !== "ready") throw new QuotaError("USAGE_LEDGER_UNAVAILABLE");
  if (!natural(tokens, SAFE_MONTHLY_TOKEN_LIMIT) || tokens === 0 || usage.tokensCommitted + usage.tokensReserved + tokens > SAFE_MONTHLY_TOKEN_LIMIT) {
    throw new QuotaError("FREE_QUOTA_EXHAUSTED");
  }
}
