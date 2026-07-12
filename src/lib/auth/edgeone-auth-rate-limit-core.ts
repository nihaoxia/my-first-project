export type AuthAction = "login" | "register" | "recover";

export type AuthAttemptEvent = {
  id: string;
  subjectHash: string;
  clientHash: string;
  action: AuthAction;
  at: string;
};

export type AuthAttemptInput = {
  subjectHash: string;
  clientHash: string;
  action: AuthAction;
  now: Date;
};

export class EdgeOneAuthRateLimitError extends Error {
  readonly code: "AUTH_RATE_LIMITED" | "AUTH_RATE_LEDGER_INVALID";

  constructor(code: "AUTH_RATE_LIMITED" | "AUTH_RATE_LEDGER_INVALID") {
    super(code);
    this.code = code;
    this.name = "EdgeOneAuthRateLimitError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ACTIONS = new Set<AuthAction>(["login", "register", "recover"]);
const WINDOW_MS = 15 * 60 * 1000;

export function assertAuthAttemptAllowed(
  events: AuthAttemptEvent[],
  input: AuthAttemptInput,
): void {
  if (
    !ACTIONS.has(input.action) ||
    !(input.now instanceof Date) ||
    Number.isNaN(input.now.getTime())
  ) {
    throw new EdgeOneAuthRateLimitError("AUTH_RATE_LEDGER_INVALID");
  }
  const ids = new Set<string>();
  let attempts = 0;
  for (const event of events) {
    const timestamp = Date.parse(event.at);
    if (
      !UUID.test(event.id) ||
      ids.has(event.id) ||
      !ACTIONS.has(event.action) ||
      !Number.isFinite(timestamp)
    ) {
      throw new EdgeOneAuthRateLimitError("AUTH_RATE_LEDGER_INVALID");
    }
    ids.add(event.id);
    const age = input.now.getTime() - timestamp;
    if (
      age >= 0 &&
      age <= WINDOW_MS &&
      event.subjectHash === input.subjectHash &&
      event.clientHash === input.clientHash &&
      event.action === input.action
    ) {
      attempts += 1;
    }
  }
  if (attempts >= 5) {
    throw new EdgeOneAuthRateLimitError("AUTH_RATE_LIMITED");
  }
}

