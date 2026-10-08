// Same-origin proxy by default: the Next.js server forwards /api/relayer/* and
// /api/issuer/* to the internal issuer (4001) / relayer (4002) ports, so the
// browser only ever talks to one origin (works locally and on Render without
// exposing extra ports). Set NEXT_PUBLIC_* to override.
export const RELAYER_URL =
  process.env.NEXT_PUBLIC_RELAYER_URL?.trim() || "/api/relayer";
export const ISSUER_URL =
  process.env.NEXT_PUBLIC_ISSUER_URL?.trim() || "/api/issuer";

export interface SiteConfig {
  network: string;
  chainId: number;
  rpcUrl: string;
  contractAddress: string;
  abi: unknown[];
  explorerUrl: string;
  issuerUrl: string;
  groupId: number;
}

export interface MemberRow {
  index: number;
  commitment: string;
}

export interface ProtocolRow {
  id: string;
  name: string;
  scope: string;
}

export interface SiteRow {
  id: string;
  name: string;
}

export interface EnrollmentEvent {
  protocolId: string;
  siteId: string;
  nullifier: string;
  scope: string;
  relayer: string;
  txHash: string;
  blockNumber: number;
  explorerUrl: string;
}

export interface DenialRecord {
  protocol_id: string;
  site_id: string;
  reason: string;
  nullifier: string | null;
  digest: string;
  signature: string;
  signer: string;
  created_at: string;
}

export interface SemaphoreProof {
  merkleTreeDepth: number;
  merkleTreeRoot: string;
  message: string;
  nullifier: string;
  scope: string;
  points: string[];
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const body = (await res.json()) as T & { error?: string; detail?: string };
  if (!res.ok) {
    throw new Error(body?.error ? `${body.error}: ${body.detail ?? "request failed"}` : `HTTP ${res.status}`);
  }
  return body;
}

export const getConfig = (): Promise<SiteConfig> => http(`${RELAYER_URL}/config`);
export const getIssuerStatus = (): Promise<Record<string, unknown>> => http(`${ISSUER_URL}/status`);
export const getMembers = (): Promise<{ members: MemberRow[]; count: number }> =>
  http(`${ISSUER_URL}/members`);
export const getProtocols = (): Promise<{ protocols: ProtocolRow[] }> => http(`${RELAYER_URL}/protocols`);
export const getSites = (): Promise<{ sites: SiteRow[] }> => http(`${RELAYER_URL}/sites`);
export const getEvents = (): Promise<{ events: EnrollmentEvent[]; count: number }> =>
  http(`${RELAYER_URL}/events`);
export const getDenials = (): Promise<{ denials: DenialRecord[] }> => http(`${RELAYER_URL}/denials`);
export const getMonitorSummary = (): Promise<{
  generatedAt: string;
  observations: { severity: string; message: string }[];
  report?: string;
  totals: Record<string, unknown>;
}> => http(`${RELAYER_URL}/monitor/summary`);

export interface RegistryResult {
  status: string;
  protocolId?: string;
  siteId?: string;
  scope?: string;
  name?: string;
  txHash: string;
  explorerUrl: string;
}

export const registerProtocol = (protocolId: string, name?: string) =>
  http<RegistryResult>(`${RELAYER_URL}/protocol`, {
    method: "POST",
    body: JSON.stringify({ protocolId, name }),
  });

export const registerSite = (siteId: string, name?: string) =>
  http<RegistryResult>(`${RELAYER_URL}/site`, {
    method: "POST",
    body: JSON.stringify({ siteId, name }),
  });

export interface EnrollmentResult {
  status: "accepted" | "denied" | "error";
  reason?: string;
  protocolId?: string;
  siteId?: string;
  scope?: string;
  nullifier?: string;
  txHash?: string;
  explorerUrl?: string;
  signedRecord?: { message: string; signature: string; signer: string };
  staticCallError?: string;
}

export const enroll = (protocolId: string, siteId: string, proof: SemaphoreProof) =>
  http<EnrollmentResult>(`${RELAYER_URL}/enroll`, {
    method: "POST",
    body: JSON.stringify({ protocolId, siteId, proof }),
  });

export const registerIdentity = (
  commitment: string,
  testId: { docType: string; documentNumber: string; fullName: string }
): Promise<number> =>
  http<number>(`${ISSUER_URL}/register`, {
    method: "POST",
    body: JSON.stringify({ commitment, testId }),
  });