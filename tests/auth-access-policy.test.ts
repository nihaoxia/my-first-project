import test from "node:test";
import assert from "node:assert/strict";

import {
  getRouteAccessDecision,
  shouldShowAdminNavigation,
} from "../src/lib/auth/access-policy.ts";
import type { MockSession } from "../src/lib/auth/mock-session.ts";

const userSession: MockSession = {
  phone: "13811112222",
  role: "USER",
};

const adminSession: MockSession = {
  phone: "13800000000",
  role: "ADMIN",
};

test("allows guests to open the login page", () => {
  assert.deepEqual(getRouteAccessDecision("/login", null), { type: "allow" });
});

test("redirects authenticated users away from the login page", () => {
  assert.deepEqual(getRouteAccessDecision("/login", userSession), {
    type: "redirect",
    destination: "/library",
  });
});

test("redirects guests from protected pages and preserves the target path", () => {
  assert.deepEqual(getRouteAccessDecision("/upload?from=library", null), {
    type: "redirect",
    destination: "/login?next=%2Fupload%3Ffrom%3Dlibrary",
  });
});

test("redirects guests from admin pages to login", () => {
  assert.deepEqual(getRouteAccessDecision("/admin/users", null), {
    type: "redirect",
    destination: "/login?next=%2Fadmin%2Fusers",
  });
});

test("redirects normal users away from admin pages", () => {
  assert.deepEqual(getRouteAccessDecision("/admin", userSession), {
    type: "redirect",
    destination: "/library?error=admin",
  });
});

test("allows administrators to open admin pages", () => {
  assert.deepEqual(getRouteAccessDecision("/admin", adminSession), { type: "allow" });
});

test("only administrators can see admin navigation", () => {
  assert.equal(shouldShowAdminNavigation(null), false);
  assert.equal(shouldShowAdminNavigation(userSession), false);
  assert.equal(shouldShowAdminNavigation(adminSession), true);
});
