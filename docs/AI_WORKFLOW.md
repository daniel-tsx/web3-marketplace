# AI-assisted engineering workflow

Status: **current**. This is a practical collaboration process for a human engineer
and coding agents. The human owns goals, consequential tradeoffs, review and
acceptance; this workflow does not claim fully autonomous development.

```text
Human intent
    ↓
Agent loads repository rules (AGENTS.md)
    ↓
AGENT_START_HERE routes task context
    ↓
Inspect code + relevant docs
    ↓
State assumptions / invariant / plan
    ↓
Surgical implementation
    ↓
Regression coverage
    ↓
Domain-specific verification
    ↓
Review diff
    ↓
Update durable project memory if behavior changed
```

For reproducible bugs and invariants, write/run the regression before the fix,
then rerun it after implementation. The coverage step above also checks whether
the complete change is covered. Documentation-only work uses path/command checks
instead of inventing application tests.

## Load the smallest useful context

[AGENTS.md](../AGENTS.md) owns shared behavioral rules.
[AGENT_START_HERE](AGENT_START_HERE.md) owns orientation, implementation paths and
known drift. [docs/README](README.md) assigns document ownership, lifecycle and
task-specific reads. The run guides provide deep chain-specific explanations;
[verification](operations/verification.md) selects commands by layer.

Start from the task's affected state and owner, not from all documentation.
For example, an EVM purchase invariant needs Run 1, H1, Solidity, its Foundry tests,
and affected client code; it does not need the entire Sui authentication story.
If the task crosses identity and execution, load both owners and their tests.

Durable docs carry stable decisions and verification limits across sessions.
Chat history is useful working context but may be unavailable to the next engineer
or agent. Keep accepted behavior, ownership and unresolved limits in the owning
document; omit incidental debugging and transcripts.

## Plan, implement, review, verify

1. **Define the outcome.** Restate the requested invariant, relevant assumptions,
   affected layer/files, and a short plan with acceptance checks. Surface ambiguity
   before a consequential choice.
2. **Inspect existing patterns.** Trace state from its owner through reads, signing,
   execution and refresh where relevant. Compare docs with actual source/tests.
3. **Reproduce and implement.** For bugs/invariants, encode a regression including
   forbidden cases first. Make the minimum scoped change using neighboring conventions.
4. **Verify the affected domain.** Run the selected scripts and record their real
   outcomes. A successful offline builder test proves construction, not execution.
5. **Review the diff.** Check scope, authorization, stale intent, compatibility,
   partial failures and test relevance. Run `git diff --check`.
6. **Update memory and hand off.** Update the subject's current doc when durable
   behavior changes. Report results, limits and unresolved decisions for human acceptance.

## Multiple agents, shared project truth

Codex, Claude Code and Cursor use the same policy, task router, source and tests.
[CLAUDE.md](../CLAUDE.md) forwards to shared context; Cursor's
[always-applied rule](../.cursor/rules/windows-cmd-shell.mdc) provides the Windows
shell default and entry links. No vendor owns the architecture, and no vendor-only
state is required to understand a decision.

When the human chooses multiple agents, use lightweight roles rather than extra
infrastructure:

| Role | Responsibility |
| --- | --- |
| Coordinator | Define invariant/scope, route context, assign file ownership and checks, integrate results. |
| Implementer | Inspect and change the assigned area; report assumptions, regressions and remaining limits. |
| Reviewer | Review the resulting diff against the invariant and trust boundaries; report actionable findings. |
| Verifier | Run selected checks and report command, scope, result and tooling limitations. |

One agent can perform all roles sequentially for a small task. With parallel work,
assign non-overlapping write areas, identify shared interfaces before editing, and
coordinate any overlap explicitly. Preserve the user's existing changes. The
coordinator reviews the integrated diff and verification evidence before handoff.

A compact handoff contains: objective/invariant, relevant doc and code paths,
assigned/changed files, assumptions, checks with status, unresolved findings and
next action. Do not pass only a chat summary that bypasses repository truth or
claim another agent's unrun check as a pass.

## Drift, evidence and chain semantics

When documentation and implementation disagree, code determines implemented
behavior. Record the concrete mismatch in
[known drift](AGENT_START_HERE.md#known-documentation-drift); correct the owning
current doc when warranted by scope, or leave an explicit cleanup item. A design
plan alone does not make a behavior implemented. Follow the
[lifecycle](README.md#documentation-lifecycle) so stale plans/reviews cannot compete
with current knowledge.

Use **passed**, **failed**, **not run**, and **environment unavailable** exactly as
[AGENTS.md](../AGENTS.md) requires. Preserve historical results as attributed
evidence. A typecheck, compiler build, runtime test, deployment and wallet flow each
answer a different question; report only the layer actually exercised.

[H1](audit-fix-01-purchase-intent.md) illustrates the approach: preserve reviewed
purchase intent with EVM storage generations, persistent Solana PDA generations
and mint identity, and Sui Listing object identity. The invariant is shared, but
allowances, account constraints/CPI, and object/Coin ownership remain explicit.
The shared resolver is readiness orchestration, not a universal chain executor.
