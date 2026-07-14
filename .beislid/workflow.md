<!-- beislid-workflow: v1 -->

# Beislið workflow config - hundavaent

## Issue tracker

Project work uses Linear through the authenticated Linear MCP connection.
Workspace-specific names and URLs are configured outside the repository.

```beislid:ticket_source
type: mcp
tool: mcp__linear__get_issue
id_pattern: '^[A-Z]+-\d+$'
```

```beislid:branch_pattern
^[a-z]+/([a-z]+-\d+)
```

```beislid:ticket_update
type: mcp
comment_tool: mcp__linear__save_comment
issue_tool: mcp__linear__save_issue
```

## Action policy

Every mutating agent run uses an isolated worktree.
During pre-launch, both automatic modes permit every action class to favor rapid delivery.
Worktree isolation remains mandatory.

```beislid:action_policy
modes:
  supervised-auto:
    sandbox:
      minimum: separate-worktree
      on_insufficient_baseline: deny
      on_uncommitted_changes: allow
    rules:
      read: allow
      workspace-write: allow
      dependency-install: allow
      network-read: allow
      git-local: allow
      git-remote: allow
      destructive: allow
      secret-bearing: allow
    actions:
      gate.autofix: allow
    unknown_action: allow
    unclassified_action: allow
  unattended-auto:
    sandbox:
      minimum: separate-worktree
      on_insufficient_baseline: deny
      on_uncommitted_changes: allow
    rules:
      read: allow
      workspace-write: allow
      dependency-install: allow
      network-read: allow
      git-local: allow
      git-remote: allow
      destructive: allow
      secret-bearing: allow
    actions:
      gate.autofix: allow
    unknown_action: allow
    unclassified_action: allow
```

## Quality gates

During pre-launch, ready-for-review runs only fast branch-wide gates.
Implementation and review-fix work runs targeted behavior tests for the changed surface before handoff.

```beislid:gates
- name: open-source-boundary
  command: 'pnpm open-source:check'
  timeout_seconds: 120
  cost: cheap
  parallel_safe: true
- name: format
  command: 'pnpm format:check'
  timeout_seconds: 120
  cost: cheap
  parallel_safe: true
- name: lint
  command: 'pnpm lint'
  timeout_seconds: 120
  cost: cheap
  parallel_safe: true
- name: check
  command: 'pnpm check'
  timeout_seconds: 180
  cost: medium
  mutates: true
- name: build
  command: 'pnpm build'
  timeout_seconds: 300
  cost: medium
  mutates: true
```

## Ready-for-review

```beislid:ready_for_review
approval_gates:
  pr_title_body: auto
  gate_failure: auto
  autofix_commit: auto
  clean_eval_failure: auto
  reduced_review_coverage: auto
```

```beislid:fresh_eyes
enabled: false
reason: 'Pre-launch fast shipping prioritizes targeted checks and production visual verification.'
```

## Probe cache

```beislid:probe_cache
ttl_hours: 24
```
