import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  appendEvaluationLaneEnvironment,
  configureEvaluationSupabase,
  isEvaluationLaneName
} from './evaluation-lanes.ts';

const lane = process.argv[2];
const githubEnvironmentIndex = process.argv.indexOf('--github-env');
const githubEnvironmentPath =
  githubEnvironmentIndex >= 0 ? process.argv[githubEnvironmentIndex + 1] : undefined;

if (!lane || !isEvaluationLaneName(lane)) {
  throw new Error(`Unknown evaluation lane: ${lane ?? '(missing)'}`);
}

const configPath = resolve('supabase/config.toml');
const source = readFileSync(configPath, 'utf8');
writeFileSync(configPath, configureEvaluationSupabase(source, lane), 'utf8');

if (githubEnvironmentPath) {
  appendEvaluationLaneEnvironment(githubEnvironmentPath, lane);
}
