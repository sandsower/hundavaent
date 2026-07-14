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
Remote writes, destructive actions, and secret-bearing operations always require explicit supervision.

```beislid:action_policy
modes:
  supervised-auto:
    sandbox:
      minimum: separate-worktree
      on_insufficient_baseline: deny
      on_uncommitted_changes: deny
    rules:
      read: allow
      workspace-write: allow
      dependency-install: allow
      network-read: allow
      git-local: allow
      git-remote: ask
      destructive: ask
      secret-bearing: ask
    unknown_action: ask
    unclassified_action: ask
  unattended-auto:
    sandbox:
      minimum: separate-worktree
      on_insufficient_baseline: deny
      on_uncommitted_changes: deny
    rules:
      read: allow
      workspace-write: allow
      dependency-install: allow
      network-read: allow
      git-local: allow
      git-remote: deny
      destructive: deny
      secret-bearing: deny
    unknown_action: ask
    unclassified_action: ask
```

## Quality gates

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
- name: unit
  command: 'pnpm test:unit'
  timeout_seconds: 180
  cost: medium
  parallel_safe: true
- name: component
  command: 'pnpm test:component'
  timeout_seconds: 300
  cost: expensive
- name: database
  command: 'pnpm test:database'
  timeout_seconds: 300
  cost: expensive
- name: end-to-end
  command: 'pnpm test:e2e'
  timeout_seconds: 600
  cost: expensive
  mutates: true
- name: accessibility
  command: 'pnpm test:a11y'
  timeout_seconds: 300
  cost: expensive
  mutates: true
- name: visual
  command: 'pnpm test:visual'
  timeout_seconds: 300
  cost: expensive
  mutates: true
- name: map-smoke
  command: 'pnpm test:map-smoke'
  timeout_seconds: 180
  cost: medium
- name: performance
  command: 'pnpm test:performance'
  timeout_seconds: 600
  cost: expensive
  mutates: true
- name: build
  command: 'pnpm build'
  timeout_seconds: 300
  cost: medium
  mutates: true
- name: clean-evaluation
  command: 'pnpm eval:release'
  timeout_seconds: 1800
  cost: expensive
  mutates: true
```

## Ready-for-review

```beislid:ready_for_review
approval_gates:
  pr_title_body: auto
  gate_failure: prompt
  autofix_commit: prompt
  clean_eval_failure: prompt
  reduced_review_coverage: prompt
```

```beislid:clean_eval
mode: require
surface: worktree
artifact_root: .beislid/clean-eval
```

## Probe cache

```beislid:probe_cache
ttl_hours: 24
```
