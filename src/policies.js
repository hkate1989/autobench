import { missionTitles } from "./tasks.js";

const normalizeText = value =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const resultText = result => normalizeText(`${result.title ?? ""} ${result.snippet ?? ""}`);

const sameTitle = (title, candidate) =>
  normalizeText(title).toLocaleLowerCase("en-US") ===
  normalizeText(candidate).toLocaleLowerCase("en-US");

const supportsCandidate = (result, candidate, verifyPhrase) => {
  const escapedCandidate = escapeRegExp(normalizeText(candidate));
  const flags = verifyPhrase.flags.replace(/[gy]/gu, "");
  const pattern = new RegExp(
    `(?:\\b${escapedCandidate}\\b[^.]{0,220}(?:${verifyPhrase.source})|(?:${verifyPhrase.source})[^.]{0,220}\\b${escapedCandidate}\\b)`,
    flags,
  );
  return pattern.test(resultText(result));
};

const snapshotResult = (result, index) => ({
  rank: index + 1,
  title: result.title ?? "",
  snippet: result.snippet ?? "",
});

const verificationVerdict = ({
  candidate,
  query,
  searchLimit,
  results,
  verifyPhrase,
  requireCandidatePage,
}) => {
  const rankedResults = results.map((result, index) => ({ result, index }));
  const candidatePageMatch = rankedResults.find(({ result }) =>
    sameTitle(result.title, candidate),
  );
  const supportingMatches = rankedResults.filter(({ result }) =>
    supportsCandidate(result, candidate, verifyPhrase),
  );
  const supportingMatch =
    supportingMatches.find(({ result }) => sameTitle(result.title, candidate)) ??
    supportingMatches[0];
  const candidatePage = candidatePageMatch
    ? snapshotResult(candidatePageMatch.result, candidatePageMatch.index)
    : null;
  const candidateBoundEvidence = supportingMatch
    ? snapshotResult(supportingMatch.result, supportingMatch.index)
    : null;
  const accepted = Boolean(candidateBoundEvidence && (!requireCandidatePage || candidatePage));

  return {
    accepted,
    record: {
      candidate,
      query,
      searchLimit,
      verdict: accepted ? "accepted" : "rejected",
      reasonCode: accepted
        ? "candidate_bound_evidence_found"
        : results.length === 0
          ? "verification_results_empty"
          : requireCandidatePage && !candidatePage
            ? "candidate_page_missing"
            : "candidate_bound_evidence_missing",
      candidatePage,
      candidateBoundEvidence,
    },
  };
};

const candidates = results =>
  missionTitles(results.map(result => `${result.title} ${result.snippet}`).join(" "));

export const policies = {
  direct_search: {
    name: "direct_search",
    queryBudget: 1,
    unknownHandling: "reject",
    async run(task, search) {
      const response = await search.search(task.directQuery, 5);
      return {
        predictions: candidates(response.results),
        queries: [response.query],
        unknowns: [],
        verificationVerdicts: [],
      };
    },
  },

  broad_discovery_then_verify: {
    name: "broad_discovery_then_verify",
    queryBudget: 2,
    unknownHandling: "reject",
    async run(task, search) {
      const discovery = await search.search(task.discoveryQuery, 20);
      const found = candidates(discovery.results);
      const verification = await search.search(`\"${task.prompt}\"`, 20);
      const outcomes = found.map(candidate =>
        verificationVerdict({
          candidate,
          query: verification.query,
          searchLimit: 20,
          results: verification.results,
          verifyPhrase: task.verifyPhrase,
          requireCandidatePage: false,
        }),
      );
      const predictions = outcomes
        .filter(outcome => outcome.accepted)
        .map(outcome => outcome.record.candidate);

      return {
        predictions,
        queries: [discovery.query, verification.query],
        unknowns: found.filter(candidate => !predictions.includes(candidate)),
        verificationVerdicts: outcomes.map(outcome => outcome.record),
      };
    },
  },

  broad_discovery_with_targeted_followup: {
    name: "broad_discovery_with_targeted_followup",
    queryBudget: 20,
    unknownHandling: "targeted_followup",
    async run(task, search) {
      const discovery = await search.search(task.discoveryQuery, 20);
      const found = candidates(discovery.results);
      const predictions = [];
      const unknowns = [];
      const queries = [discovery.query];
      const verificationVerdicts = [];

      for (const candidate of found) {
        const query = `\"${candidate}\" ${task.prompt.replace(/^Which Apollo missions /, "")}`;
        const verification = await search.search(query, 5);
        const outcome = verificationVerdict({
          candidate,
          query: verification.query,
          searchLimit: 5,
          results: verification.results,
          verifyPhrase: task.verifyPhrase,
          requireCandidatePage: true,
        });
        queries.push(verification.query);
        verificationVerdicts.push(outcome.record);
        (outcome.accepted ? predictions : unknowns).push(candidate);
      }

      return { predictions, queries, unknowns, verificationVerdicts };
    },
  },
};
