# Repository agent policy

This is the canonical behavioral policy for Codex, Claude Code, Cursor, and other
coding agents. Project knowledge and task routing live in
[docs/AGENT_START_HERE.md](docs/AGENT_START_HERE.md); document ownership and lifecycle
live in [docs/README.md](docs/README.md).

## Before changing files

1. Confirm the repository and read this policy, plus any nearer `AGENTS.md` or
   `CLAUDE.md` in the area being changed. More specific instructions apply within
   their scope; they cannot authorize exposing secrets or unrequested external changes.
2. Read [AGENT_START_HERE](docs/AGENT_START_HERE.md) before non-trivial work, then
   the root [README](README.md) and only the task-relevant documents it routes to.
3. Check `git status`; preserve existing work and work around unrelated changes.
4. Inspect the actual source, neighboring implementations, relevant manifests,
   and test scripts. Code wins over stale documentation; record meaningful drift.

## Think before coding

- State meaningful assumptions, ambiguity, and tradeoffs. Do not silently choose
  an unclear interpretation; ask when the answer determines what should be built.
- For non-trivial work, state a small plan with verifiable outcomes. Explain a
  consequential implementation choice briefly before proceeding.
- Identify which layer owns the state being changed before introducing a pattern.
  Reuse established conventions where appropriate.

## Simplicity and surgical changes

- Implement the minimum correct change. No unrequested features, speculative
  abstractions, or unnecessary configurability.
- Prefer explicit chain-specific code when EVM, Solana, and Sui semantics differ.
- Touch only files needed for the task; every meaningful changed line should be
  traceable to it. Match existing patterns and avoid adjacent refactors or formatting.
- Remove only unused code introduced by this change. Report unrelated problems
  instead of silently fixing them.

## Goal-driven execution

Use plan → implement → review → verify, with regression coverage before a fix
where a bug or invariant can be reproduced:

| Task | Verifiable outcome |
| --- | --- |
| Bug | Reproduce with a regression, fix, then make it pass. |
| Contract/program invariant | Encode positive and negative cases, implement, run the relevant chain suite. |
| Authentication/authorization | Test both permitted and forbidden paths, including replay or ownership conflicts where relevant. |
| Cross-chain behavior | Verify the shared invariant using each chain's mechanics; preserve differing execution semantics. |
| Documentation/tooling | Check referenced paths, commands, configuration, and `git diff --check`; avoid unrelated runtime suites. |

## Web3 correctness

- Frontend state is not a security boundary. Wallet connection is not application identity.
- A submitted transaction is not a confirmed transaction. A hash, signature, or
  digest alone does not prove successful execution.
- Cached reads are not canonical chain state. Approvals/allowances are not purchase intent.
- Keep on-chain/off-chain ownership explicit. The API owns identity; each chain
  validates its own marketplace actions. Do not hide different execution models
  behind a fake universal transaction abstraction.
- Review authorization, stale state, replay, transaction intent, concurrency,
  deterministic identity, partial failures, confirmation, idempotency where
  applicable, chain/network configuration, and precise user-facing failure states.
- For purchase work, read [H1](docs/audit-fix-01-purchase-intent.md) and its tests.
  Preserve reviewed terms; do not silently retry against a replacement listing.

## Documentation as working memory

- Follow the source-of-truth map in AGENT_START_HERE and verify claims against code.
- Update the owning document when durable behavior changes: architecture,
  routes/APIs, configuration, schema, identity/security, or user-visible features.
  Avoid documenting incidental implementation details or copying chat transcripts.
- Keep one current source-of-truth document per subject. Link to deeper references
  rather than maintaining duplicate rulebooks or competing explanations.
- Label documents using the lifecycle in [docs/README](docs/README.md). Archive stale
  plans/reviews when replaced, retaining a replacement link. Preserve existing run
  guides as scoped references until a separate reorganization is requested.

## Verification and handoff

Use the actual package scripts and the task's layer-specific checks from
[operations/verification.md](docs/operations/verification.md). Report each check as
**passed**, **failed**, **not run**, or **environment unavailable**, with command,
scope, and reason/evidence. A previous run's result is historical evidence, not a
new pass.

Never claim runtime verification from typechecking, offline encoding, transaction
construction, mocked results, or static review. In particular, unavailable
Anchor/Solana or Sui/Move toolchains leave those runtimes unverified. Compilation,
runtime tests, deployment, and actual wallet interaction are separate claims.

Before handoff, review the diff for scope and correctness, run `git diff --check`,
and report files changed, results and failures, remaining issues, assumptions, and
the next step. Do not overclaim production readiness or invent project traction.

## Git, infrastructure, and secrets

- Do not commit, push, deploy, reset ledgers, rewrite history, or mutate external
  infrastructure unless explicitly requested in the current session.
- Never overwrite/revert work you did not make. Ask before destructive or
  hard-to-reverse operations.
- Never print or commit secrets or `.env` values. Browser `VITE_*` settings must
  contain public configuration only. Deterministic development keys are local-only.
- Do not mutate production data, run production migrations, or touch live payment
  flows without explicit instruction. Security work stays defensive.

## Windows shell

Prefer `cmd.exe` and Command Prompt-compatible syntax on Windows. Use PowerShell
only when the task needs it. Use pnpm as pinned in the root `package.json`; inspect
scripts before running them. Avoid POSIX environment assignments, `export`, and
shell-specific inline comments in cmd command examples. Do not upgrade dependencies
or install tools unless the task requires and justifies them.
