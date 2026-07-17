export const SCIENTIST_INTERVENTIONS = Object.freeze([
  "broad_discovery_then_verify",
  "broad_discovery_with_targeted_followup",
]);

const asList = value => (Array.isArray(value) ? value : []);

const deterministicProposal = observation => {
  const failure = observation?.failureAnalysis ?? {};
  const unknownRejected = asList(failure.unknownRejected);
  const candidateOmission = asList(failure.candidateOmission);

  if (unknownRejected.length) {
    return {
      diagnosis: {
        code: "unknown_rejection_high",
        summary: `${unknownRejected.length} discovered candidates were rejected without entity-level verification.`,
        evidence: {
          observationPolicy: observation.policy,
          unknownRejectedCount: unknownRejected.length,
          unknownRejected: [...unknownRejected],
        },
      },
      hypothesis: {
        statement:
          "Batch verification is losing entity-specific evidence; verifying each discovered mission with a targeted follow-up should recover valid missions while filtering invalid ones.",
        expectedEffect: "Increase recall and F1 by resolving rejected candidates individually.",
      },
      intervention: "broad_discovery_with_targeted_followup",
    };
  }

  if (candidateOmission.length) {
    return {
      diagnosis: {
        code: "candidate_omission_high",
        summary: `${candidateOmission.length} ground-truth missions were omitted by the observed policy.`,
        evidence: {
          observationPolicy: observation.policy,
          candidateOmissionCount: candidateOmission.length,
          candidateOmission: [...candidateOmission],
          predictedCount: asList(observation.predictions).length,
        },
      },
      hypothesis: {
        statement:
          "Separating broad candidate discovery from verification should recover missions missed by a single direct query while verification protects precision.",
        expectedEffect: "Increase recall and F1 by expanding the candidate set before verification.",
      },
      intervention: "broad_discovery_then_verify",
    };
  }

  return null;
};

const withFallback = (proposal, fallbackReason) =>
  proposal ? { ...proposal, source: "deterministic_fallback", fallbackReason } : null;

const responseText = json =>
  json.output?.flatMap(item => item.content ?? []).find(item => item.type === "output_text")?.text;

export class DeterministicScientist {
  constructor({ interventions = SCIENTIST_INTERVENTIONS } = {}) {
    if (new Set(interventions).size !== interventions.length) {
      throw new Error("Scientist interventions must be unique");
    }
    this.interventions = Object.freeze([...interventions]);
  }

  propose({ observation, availableInterventions = this.interventions } = {}) {
    const proposal = deterministicProposal(observation);
    if (!proposal) return null;
    if (!this.interventions.includes(proposal.intervention)) return null;
    if (!availableInterventions.includes(proposal.intervention)) return null;
    return { source: "deterministic", ...proposal };
  }
}

export class LLMScientist {
  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_MODEL || "gpt-5.6-luna",
    fetchImpl = globalThis.fetch,
    fallback = new DeterministicScientist(),
  } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
    this.fallback = fallback;
    this.interventions = fallback.interventions;
  }

  async propose(context = {}) {
    const fallback = this.fallback.propose(context);
    if (!fallback) return null;
    if (!this.apiKey) return withFallback(fallback, "missing_api_key");

    const allowed = [fallback.intervention];
    let response;
    try {
      response = await this.fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          instructions:
            "Explain the observed benchmark failure and mechanism for the one allowed intervention. Do not invent interventions, keys, code, or evidence.",
          input: JSON.stringify({
            observation: context.observation,
            deterministicEvidence: fallback.diagnosis.evidence,
            allowedInterventions: allowed,
          }),
          text: {
            format: {
              type: "json_schema",
              name: "research_hypothesis",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  pattern: { type: "string" },
                  hypothesis: { type: "string" },
                  intervention: { type: "string", enum: allowed },
                },
                required: ["pattern", "hypothesis", "intervention"],
              },
            },
          },
        }),
      });
    } catch (error) {
      return withFallback(fallback, `${error.name}: ${error.message}`);
    }

    if (!response.ok) return withFallback(fallback, `OpenAI ${response.status}`);

    try {
      const proposal = JSON.parse(responseText(await response.json()));
      if (!allowed.includes(proposal.intervention)) throw new Error("out_of_catalog_intervention");
      if (
        typeof proposal.pattern !== "string" ||
        !proposal.pattern.trim() ||
        typeof proposal.hypothesis !== "string" ||
        !proposal.hypothesis.trim()
      ) {
        throw new Error("invalid_structured_response");
      }
      return {
        source: "llm",
        diagnosis: { ...fallback.diagnosis, summary: proposal.pattern.trim() },
        hypothesis: { ...fallback.hypothesis, statement: proposal.hypothesis.trim() },
        intervention: proposal.intervention,
      };
    } catch (error) {
      return withFallback(fallback, error.message || "invalid_structured_response");
    }
  }
}
