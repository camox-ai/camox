import type { Router } from "@camox/api";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

const CAMOX_API_URL = process.env.CAMOX_API_URL || "https://api.camox.ai";

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function createRpcClient(token: string) {
  const link = new RPCLink({
    url: `${CAMOX_API_URL}/rpc`,
    headers: { Authorization: `Bearer ${token}` },
  });
  return createORPCClient<RouterClient<Router>>(link);
}

// --- Session validation ---

export async function verifySession(token: string): Promise<boolean> {
  const res = await fetch(`${CAMOX_API_URL}/api/auth/get-session`, {
    method: "GET",
    headers: authHeaders(token),
  });
  return res.ok;
}

// --- Organizations ---

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export async function listOrganizations(token: string): Promise<Organization[]> {
  const res = await fetch(`${CAMOX_API_URL}/api/auth/organization/list`, {
    method: "GET",
    headers: authHeaders(token),
  });

  if (!res.ok) {
    throw new Error(`Failed to list organizations: ${res.status}`);
  }

  return res.json();
}

export async function createOrganization(
  token: string,
  name: string,
  slug: string,
): Promise<Organization> {
  const res = await fetch(`${CAMOX_API_URL}/api/auth/organization/create`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name, slug }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create organization: ${res.status} ${text}`);
  }

  return res.json();
}

export async function setActiveOrganization(token: string, organizationId: string): Promise<void> {
  const res = await fetch(`${CAMOX_API_URL}/api/auth/organization/set-active`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ organizationId }),
  });

  if (!res.ok) {
    throw new Error(`Failed to set active organization: ${res.status}`);
  }
}

// --- Projects ---

export async function createProject(token: string, name: string, organizationSlug: string) {
  const client = createRpcClient(token);
  const result = await client.projects.create({ name, organizationSlug });
  return result;
}
