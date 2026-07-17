import test from "node:test";
import assert from "node:assert/strict";

import { DeterministicScientist, LLMScientist } from "../src/scientist.js";

const observation = ({ policy = "direct_search", omissions = [], unknowns = [] } = {}) => ({
  policy,
  predictions: [],
  failureAnalysis: {
    candidateOmission: omissions,
    falsePositives: [],
    unknownRejected: unknowns,
    queryCount: 1,
    queries: [policy],
  },
});

const context = observed => ({
  observation: observed,
  incumbent: observed,
  history: [],
  availableInterventions: [
    "broad_discovery_then_verify",
    "broad_discovery_with_targeted_followup",
  ],
});

const responseWithText = text => ({
  ok: true,
  status: 200,
  async json() {
    return { output: [{ content: [{ type: "output_text", text }] }] };
  },
});

test("deterministic Scientist maps omissions to broad discovery with evidence", () => {
  const proposal = new DeterministicScientist().propose(
    context(observation({ omissions: ["Apollo 11", "Apollo 12"] })),
  );

  assert.equal(proposal.source, "deterministic");
  assert.equal(proposal.diagnosis.code, "candidate_omission_high");
  assert.equal(proposal.diagnosis.evidence.candidateOmissionCount, 2);
  assert.deepEqual(proposal.diagnosis.evidence.candidateOmission, ["Apollo 11", "Apollo 12"]);
  assert.match(proposal.hypothesis.statement, /broad candidate discovery/i);
  assert.equal(proposal.intervention, "broad_discovery_then_verify");
});

test("deterministic Scientist maps rejected unknowns to targeted follow-up", () => {
  const proposal = new DeterministicScientist().propose(
    context(
      observation({
        policy: "broad_discovery_then_verify",
        omissions: ["Apollo 11"],
        unknowns: ["Apollo 11", "Apollo 12"],
      }),
    ),
  );

  assert.equal(proposal.diagnosis.code, "unknown_rejection_high");
  assert.equal(proposal.diagnosis.evidence.unknownRejectedCount, 2);
  assert.deepEqual(proposal.diagnosis.evidence.unknownRejected, ["Apollo 11", "Apollo 12"]);
  assert.match(proposal.hypothesis.statement, /targeted follow-up/i);
  assert.equal(proposal.intervention, "broad_discovery_with_targeted_followup");
});

test("deterministic Scientist stops when evidence or its intervention is absent", () => {
  const scientist = new DeterministicScientist();
  assert.equal(scientist.propose(context(observation())), null);
  assert.equal(
    scientist.propose({
      ...context(observation({ omissions: ["Apollo 11"] })),
      availableInterventions: ["broad_discovery_with_targeted_followup"],
    }),
    null,
  );
});

test("optional LLM Scientist falls back deterministically without destabilizing P0", async t => {
  const observed = context(observation({ omissions: ["Apollo 11"] }));

  await t.test("missing API key", async () => {
    const proposal = await new LLMScientist({ apiKey: "" }).propose(observed);
    assert.equal(proposal.source, "deterministic_fallback");
    assert.equal(proposal.fallbackReason, "missing_api_key");
    assert.equal(proposal.intervention, "broad_discovery_then_verify");
  });

  await t.test("request error", async () => {
    const proposal = await new LLMScientist({
      apiKey: "test",
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }).propose(observed);
    assert.equal(proposal.source, "deterministic_fallback");
    assert.equal(proposal.fallbackReason, "OpenAI 503");
  });

  await t.test("malformed response", async () => {
    const proposal = await new LLMScientist({
      apiKey: "test",
      fetchImpl: async () => responseWithText("not json"),
    }).propose(observed);
    assert.equal(proposal.source, "deterministic_fallback");
    assert.equal(proposal.intervention, "broad_discovery_then_verify");
  });

  await t.test("blank structured response", async () => {
    const proposal = await new LLMScientist({
      apiKey: "test",
      fetchImpl: async () =>
        responseWithText(
          JSON.stringify({
            pattern: "   ",
            hypothesis: "",
            intervention: "broad_discovery_then_verify",
          }),
        ),
    }).propose(observed);
    assert.equal(proposal.source, "deterministic_fallback");
    assert.equal(proposal.fallbackReason, "invalid_structured_response");
  });

  await t.test("out-of-catalog response", async () => {
    const proposal = await new LLMScientist({
      apiKey: "test",
      fetchImpl: async () =>
        responseWithText(
          JSON.stringify({
            pattern: "omissions",
            hypothesis: "invent something",
            intervention: "invented_policy",
          }),
        ),
    }).propose(observed);
    assert.equal(proposal.source, "deterministic_fallback");
    assert.equal(proposal.intervention, "broad_discovery_then_verify");
  });

  await t.test("valid response stays bounded and retains deterministic evidence", async () => {
    const proposal = await new LLMScientist({
      apiKey: "test",
      fetchImpl: async () =>
        responseWithText(
          JSON.stringify({
            pattern: "The direct query omitted one ground-truth mission.",
            hypothesis: "Broad discovery should expose the omitted mission before verification.",
            intervention: "broad_discovery_then_verify",
          }),
        ),
    }).propose(observed);
    assert.equal(proposal.source, "llm");
    assert.equal(proposal.intervention, "broad_discovery_then_verify");
    assert.deepEqual(proposal.diagnosis.evidence.candidateOmission, ["Apollo 11"]);
  });
});
