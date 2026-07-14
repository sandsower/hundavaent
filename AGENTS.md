## Agent skills

This repo uses [Beislið](https://github.com/sandsower/beislid) for orchestrator skills.

- Read `.beislid/workflow.md` first.
- Existing ticket or branch → `kickoff`
- Clear requirements, implementation still undecided → `blueprint`
- Work is done but not yet proven → `verify`
- Branch is ready for PR → `ready-for-review`
- Enter `ready-for-review` before running verification for a PR handoff, and let it select verification gates from the change size and project policy.
- Run `verify` separately only when explicitly requested or when the work is not yet entering review.
- Use direct skill invocation when the right entry point is already obvious.
- Run `/setup` when the repo workflow config is missing or needs updating.

- Project config: `.beislid/workflow.md`
- Audit setup: `/doctor`
- Configure: `/setup`

## Mutation isolation

Treat the primary checkout as a read-only coordination surface.
Do not edit files, run mutating quality gates, switch branches, or commit there.

Before any repository mutation:

1. Create or reuse a dedicated linked worktree in a sibling worktree directory.
2. Use a dedicated non-default branch for exactly one implementation slice.
3. Verify `git rev-parse --show-toplevel` equals the assigned worktree path.
4. Verify the worktree is clean before starting unless it contains explicitly preserved work for that same slice.
5. Record the worktree path and branch in the agent handoff.

Never put uncommitted work in a temporary directory.
Temporary worktrees are allowed only for disposable clean evaluation and must never contain the sole copy of progress.

### Agent ownership

Only one mutating agent may own a worktree at a time.
Parallel read-only agents may inspect the same worktree.
Every parallel mutating agent must receive a different dedicated worktree and branch before dispatch.
If separate worktrees cannot be provisioned, run the tasks sequentially in one agent instead of sharing a checkout.
Never spawn a replacement agent into a worktree until live processes for that path have stopped.

### Runtime isolation

A worktree does not isolate external mutable state by itself.
Every concurrently active worktree must use its own:

- Supabase project identity, ports, and containers
- application and Playwright server ports
- generated build and evaluation artifacts
- reserved Supabase migration number

Run local Playwright with `CI=1` or otherwise disable reuse of an existing server so a test cannot silently attach to another worktree's process.
Do not run mutating builds, Svelte checks, database resets, end-to-end tests, accessibility tests, or visual tests concurrently against shared resources.
