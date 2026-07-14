# Contributing

Thank you for helping improve Hundavænt.

## Development setup

Use Node.js 22 or newer and pnpm 11.7.0.
Install the exact dependency graph with `pnpm install --frozen-lockfile`.
Copy `.env.example` to `.env` and configure only the services needed for your change.

## Before opening a pull request

Run `pnpm open-source:check`, `pnpm format:check`, `pnpm lint`, `pnpm check`, and the tests relevant to your change.
Changes to database behavior should include pgTAP coverage.
Changes to user journeys should include browser-level coverage.
Never commit credentials, private planning material, prospect data, production exports, or machine-local paths.
Describe behavior and policy directly in code and documentation instead of referring to private ticket identifiers.

## Pull requests

Keep pull requests focused and explain the user-visible outcome, verification performed, and any operational follow-up.
By contributing, you agree that your contribution is licensed under the MIT License.
