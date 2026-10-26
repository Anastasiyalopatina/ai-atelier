import type { ChangeProposal, KnowledgeEntry } from '../../contracts/src/index.ts';
import { canonical, sha256 } from './integrity.ts';
import { evaluateExpression } from './calculations.ts';
import type { Analysis, Issue, ResearchInput } from './types.ts';

export function proposalsFor(analysis: Analysis, input: ResearchInput, issues: Issue[]): ChangeProposal[] {
  const existing = [...input.request.context.facts, ...input.request.context.decisions];
  const proposals: ChangeProposal[] = [];
  for (const draft of analysis.proposalDrafts) {
    const claim = analysis.claims.find(x => x.id === draft.claimId);
    if (!claim) continue;
    const old = existing.find(x => x.id === draft.targetEntryId);
    const invalid = issues.some(x => x.severity === 'error' && (x.claimId === claim.id || x.claimId === null));
    if (draft.kind === 'review_existing') {
      if (!old) continue;
      // Store a conflict proposal with a review annotation, never a silent replacement of a decision.
      proposals.push({ id: `proposal_${sha256(canonical({ digest: input.approvedInputSha256, draft })).slice(0, 32)}`,
        projectId: input.request.projectId, baseVersion: input.request.context.projectVersion, status: 'conflict',
        changes: [{ path: `/research/review/${old.id.replace(/~/g, '~0').replace(/\//g, '~1')}`,
          before: { entry: old }, after: { entry: old, suggestedByClaimId: claim.id, reason: draft.reason, requiresUserDecision: true } }] });
      continue;
    }
    const entry: KnowledgeEntry = { id: `research_${sha256(`${input.approvedInputSha256}:${claim.id}`).slice(0, 32)}`,
      projectId: input.request.projectId, kind: claim.kind, verification: claim.support === 'contradicts' ? 'disputed' : invalid ? 'needs_review' : 'unverified',
      text: claim.text, scope: claim.scope, evidence: claim.evidence, disclosure: 'codex_allowed', version: 1 };
    // All model-generated decisions are explicitly proposals, never accepted project decisions.
    const calc = analysis.calculations.find(x => x.claimId === claim.id);
    if (calc && !invalid) entry.calculation = { formula: evaluateExpression(calc.expression).displayFormula,
      inputs: Object.fromEntries(calc.expression.inputs.map(x => [x.name, x.quantity.value])), units: calc.expression.expected.unit,
      assumptions: calc.expression.assumptions };
    proposals.push({ id: `proposal_${sha256(canonical({ digest: input.approvedInputSha256, draft })).slice(0, 32)}`,
      projectId: input.request.projectId, baseVersion: input.request.context.projectVersion, status: invalid ? 'conflict' : 'pending',
      changes: [{ path: `/research/findings/${entry.id}`, before: null, after: entry }] });
  }
  return proposals;
}
/** Backend can use this guard before showing/applying a proposal. It does not write memory. */
export function rebaseProposals(proposals: ChangeProposal[], currentProjectVersion: number): ChangeProposal[] {
  return proposals.map(p => ({ ...structuredClone(p), status: p.baseVersion !== currentProjectVersion ? 'conflict' : p.status }));
}
