import { config, explorerTxUrl } from "./config";
import { getDb } from "./db";
import { provider, trialFenceContract } from "./chain";

interface EnrollmentEvent {
  protocolId: string;
  siteId: string;
  nullifier: string;
  scope: string;
  relayer: string;
  txHash: string;
  blockNumber: number;
  explorerUrl: string;
}

interface Observation {
  severity: "info" | "warning" | "alert";
  message: string;
}

/**
 * Deterministic, PII-free anomaly monitor. It only ever looks at public on-chain
 * events and signed denial records — never participant names or raw identities.
 * If an LLM API key is configured the findings are summarized into a plain-language
 * report; otherwise the structured observations are returned directly.
 */
export async function monitorSummary(): Promise<{
  generatedAt: string;
  observations: Observation[];
  report?: string;
  totals: Record<string, unknown>;
}> {
  const db = getDb();

  const events = await readEnrollmentEvents();
  const denials = db.prepare("SELECT * FROM denials ORDER BY id ASC").all() as Record<string, unknown>[];

  const observations: Observation[] = [];

  // Totals per protocol / site.
  const perProtocol = new Map<string, { accepted: number; denied: number }>();
  const perSite = new Map<string, { accepted: number; denied: number }>();
  const count = (map: Map<string, { accepted: number; denied: number }>, key: string, accepted: boolean) => {
    const entry = map.get(key) ?? { accepted: 0, denied: 0 };
    if (accepted) entry.accepted += 1;
    else entry.denied += 1;
    map.set(key, entry);
  };

  for (const e of events) {
    count(perProtocol, e.protocolId, true);
    count(perSite, e.siteId, true);
  }
  for (const d of denials) {
    count(perProtocol, String(d.protocol_id), false);
    count(perSite, String(d.site_id), false);
  }

  for (const [protocol, totals] of perProtocol) {
    if (totals.denied >= 2) {
      observations.push({
        severity: "warning",
        message: `Protocol ${protocol}: ${totals.denied} denied attempt(s) blocked. Possible repeat participant or targeted re-enrollment pressure.`,
      });
    }
  }

  for (const [site, totals] of perSite) {
    const total = totals.accepted + totals.denied;
    if (total >= 3 && totals.denied / total > 0.34) {
      observations.push({
        severity: "alert",
        message: `Site ${site}: ${totals.denied}/${total} attempts denied (${Math.round(
          (totals.denied / total) * 100
        )}%). High duplicate-rejection rate warrants coordinator review.`,
      });
    }
  }

  // Repeated duplicate nullifier behavior.
  const dupCount = denials.filter((d) => d.reason === "DUPLICATE").length;
  if (dupCount > 0) {
    observations.push({
      severity: dupCount >= 3 ? "alert" : "info",
      message: `Duplicate-enrollment gate fired ${dupCount} time(s) across participating sites.`,
    });
  }

  if (observations.length === 0) {
    observations.push({
      severity: "info",
      message: "No anomalies detected in the current enrollment/denial pattern.",
    });
  }

  const totals = {
    accepted: events.length,
    denied: denials.length,
    perProtocol: Object.fromEntries(perProtocol),
    perSite: Object.fromEntries(perSite),
  };

  let report: string | undefined;
  if (config.openaiApiKey) {
    try {
      report = await llmNarrative(observations, totals);
    } catch (err) {
      console.error("[monitor] LLM call failed:", err);
    }
  }

  return { generatedAt: new Date().toISOString(), observations, report, totals };
}

async function readEnrollmentEvents(): Promise<EnrollmentEvent[]> {
  const contract = trialFenceContract(provider());
  const logs = await contract.queryFilter(contract.filters.EnrollmentAccepted(), 0);
  return (
    logs as Array<{
      args: { protocolId: string; siteId: string; nullifier: string; scope: string; relayer: string };
      transactionHash: string;
      blockNumber: number;
    }>
  ).map((log) => ({
      protocolId: log.args.protocolId.toString(),
      siteId: log.args.siteId.toString(),
      nullifier: log.args.nullifier.toString(),
      scope: log.args.scope.toString(),
      relayer: log.args.relayer.toString(),
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      explorerUrl: explorerTxUrl(log.transactionHash),
    })
  );
}

async function llmNarrative(
  observations: Observation[],
  totals: Record<string, unknown>
): Promise<string> {
  const payload = {
    model: config.openaiModel,
    temperature: 0.2,
    messages: [
      {
        role: "system" as const,
        content:
          "You are the TrialFence integrity monitor. Summarize the following PII-free " +
          "observations in 2-4 plain-language sentences for a clinical trial sponsor. " +
          "Do not invent data points not present in the JSON.",
      },
      {
        role: "user" as const,
        content: JSON.stringify({ observations, totals }),
      },
    ],
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content?.trim() ?? "No summary generated.";
}