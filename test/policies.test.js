import test from "node:test";
import assert from "node:assert/strict";

import { policies } from "../src/policies.js";

const task = {
  prompt: "Which Apollo missions successfully landed astronauts on the Moon?",
  discoveryQuery: "discover Apollo missions",
  verifyPhrase: /landed|moon landing/i,
};

const targetedQuery = candidate =>
  `\"${candidate}\" successfully landed astronauts on the Moon?`;

const searchFrom = responses => ({
  async search(query) {
    const results = responses[query];
    if (!results) throw new Error(`Unexpected query: ${query}`);
    return { query, results };
  },
});

test("targeted follow-up rejects evidence split across different results", async () => {
  const exactCandidatePage = {
    title: "Apollo 10",
    snippet: "Apollo 10 orbited the Moon as a dress rehearsal.",
  };
  const unrelatedQualifyingResult = {
    title: "List of Apollo missions",
    snippet: "The Apollo program landed astronauts on the Moon.",
  };
  const search = searchFrom({
    [task.discoveryQuery]: [{ title: "Apollo 10", snippet: "Apollo mission" }],
    [targetedQuery("Apollo 10")]: [exactCandidatePage, unrelatedQualifyingResult],
  });

  const run = await policies.broad_discovery_with_targeted_followup.run(task, search);

  assert.deepEqual(run.predictions, []);
  assert.deepEqual(run.unknowns, ["Apollo 10"]);
  assert.deepEqual(run.verificationVerdicts, [
    {
      candidate: "Apollo 10",
      query: targetedQuery("Apollo 10"),
      searchLimit: 5,
      verdict: "rejected",
      reasonCode: "candidate_bound_evidence_missing",
      candidatePage: { rank: 1, ...exactCandidatePage },
      candidateBoundEvidence: null,
    },
  ]);
});

test("targeted follow-up accepts and retains one exact candidate-bound result", async () => {
  const exactEvidence = {
    title: "Apollo 14",
    snippet: "Apollo   14 was the third successful   Moon landing mission.",
  };
  const search = searchFrom({
    [task.discoveryQuery]: [{ title: "Apollo 14", snippet: "Apollo mission" }],
    [targetedQuery("Apollo 14")]: [exactEvidence],
  });

  const run = await policies.broad_discovery_with_targeted_followup.run(task, search);

  assert.deepEqual(run.predictions, ["Apollo 14"]);
  assert.deepEqual(run.unknowns, []);
  assert.deepEqual(run.verificationVerdicts, [
    {
      candidate: "Apollo 14",
      query: targetedQuery("Apollo 14"),
      searchLimit: 5,
      verdict: "accepted",
      reasonCode: "candidate_bound_evidence_found",
      candidatePage: { rank: 1, ...exactEvidence },
      candidateBoundEvidence: { rank: 1, ...exactEvidence },
    },
  ]);
});

test("targeted rejection retains candidate-bound evidence when the page guard fails", async () => {
  const candidateBoundEvidence = {
    title: "List of Apollo astronauts",
    snippet: "The commander of Apollo 14 completed the third successful Moon landing mission.",
  };
  const search = searchFrom({
    [task.discoveryQuery]: [{ title: "Apollo 14", snippet: "Apollo mission" }],
    [targetedQuery("Apollo 14")]: [candidateBoundEvidence],
  });

  const run = await policies.broad_discovery_with_targeted_followup.run(task, search);

  assert.deepEqual(run.predictions, []);
  assert.deepEqual(run.verificationVerdicts, [
    {
      candidate: "Apollo 14",
      query: targetedQuery("Apollo 14"),
      searchLimit: 5,
      verdict: "rejected",
      reasonCode: "candidate_page_missing",
      candidatePage: null,
      candidateBoundEvidence: { rank: 1, ...candidateBoundEvidence },
    },
  ]);
});

test("targeted follow-up rejects unrelated evidence outside the bounded context", async () => {
  const result = {
    title: "Apollo 14",
    snippet: `Apollo 14 flew a mission. ${"x".repeat(240)} Moon landing programs succeeded.`,
  };
  const search = searchFrom({
    [task.discoveryQuery]: [{ title: "Apollo 14", snippet: "Apollo mission" }],
    [targetedQuery("Apollo 14")]: [result],
  });

  const run = await policies.broad_discovery_with_targeted_followup.run(task, search);

  assert.deepEqual(run.predictions, []);
  assert.deepEqual(run.verificationVerdicts, [
    {
      candidate: "Apollo 14",
      query: targetedQuery("Apollo 14"),
      searchLimit: 5,
      verdict: "rejected",
      reasonCode: "candidate_bound_evidence_missing",
      candidatePage: { rank: 1, ...result },
      candidateBoundEvidence: null,
    },
  ]);
});

test("batch verification also rejects cross-result evidence joins", async () => {
  const verificationQuery = `\"${task.prompt}\"`;
  const search = searchFrom({
    [task.discoveryQuery]: [{ title: "Apollo 10", snippet: "Apollo mission" }],
    [verificationQuery]: [
      { title: "Apollo 10", snippet: "The mission orbited the Moon." },
      { title: "Moon landings", snippet: "NASA landed astronauts on the Moon." },
    ],
  });

  const run = await policies.broad_discovery_then_verify.run(task, search);

  assert.deepEqual(run.predictions, []);
  assert.deepEqual(run.unknowns, ["Apollo 10"]);
  assert.deepEqual(run.verificationVerdicts, [
    {
      candidate: "Apollo 10",
      query: verificationQuery,
      searchLimit: 20,
      verdict: "rejected",
      reasonCode: "candidate_bound_evidence_missing",
      candidatePage: {
        rank: 1,
        title: "Apollo 10",
        snippet: "The mission orbited the Moon.",
      },
      candidateBoundEvidence: null,
    },
  ]);
});
