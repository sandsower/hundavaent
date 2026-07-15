import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function countCopyRows(sql: string): Map<string, number> {
  const counts = new Map<string, number>();
  let currentTable: string | undefined;
  let currentCount = 0;

  for (const [index, line] of sql.split(/\r?\n/).entries()) {
    if (line.startsWith('COPY ')) {
      if (currentTable) {
        throw new Error(`COPY for ${currentTable} is unterminated before line ${index + 1}`);
      }
      const match = line.match(/^COPY\s+([^\s(]+)\s+\(.+\)\s+FROM\s+stdin;$/);
      if (!match) throw new Error(`Invalid COPY declaration at line ${index + 1}`);
      currentTable = match[1].replaceAll('"', '');
      if (counts.has(currentTable)) throw new Error(`Duplicate COPY section for ${currentTable}`);
      currentCount = 0;
      continue;
    }
    if (line === '\\.') {
      if (!currentTable) throw new Error(`Unexpected COPY terminator at line ${index + 1}`);
      counts.set(currentTable, currentCount);
      currentTable = undefined;
      currentCount = 0;
      continue;
    }
    if (currentTable) currentCount += 1;
  }

  if (currentTable) throw new Error(`COPY for ${currentTable} is unterminated at end of dump`);
  return counts;
}

export function parseExpectedCounts(input: string): Map<string, number> {
  const counts = new Map<string, number>();

  for (const [index, line] of input.split(/\r?\n/).entries()) {
    if (line.trim().length === 0) continue;
    const match = line.match(/^(\S+)\s+(\d+)$/);
    if (!match) throw new Error(`Invalid expected count at line ${index + 1}`);
    if (counts.has(match[1])) throw new Error(`Duplicate expected count for ${match[1]}`);
    counts.set(match[1], Number(match[2]));
  }

  return counts;
}

export function verifyRecoveryCopyDump(sql: string, expectedInput: string): string {
  const actual = countCopyRows(sql);
  const expected = parseExpectedCounts(expectedInput);
  const failures: string[] = [];

  if (expected.size === 0) throw new Error('expected table set is empty');

  for (const [table, expectedCount] of expected) {
    const actualCount = actual.get(table);
    if (actualCount === undefined) failures.push(`dump is missing table ${table}`);
    else if (actualCount !== expectedCount) {
      failures.push(`${table}: expected ${expectedCount} rows, dump has ${actualCount}`);
    }
  }
  for (const table of actual.keys()) {
    if (!expected.has(table)) failures.push(`dump contains unexpected table ${table}`);
  }
  if (failures.length > 0) throw new Error(failures.join('; '));

  return [...actual.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([table, count]) => `${table} ${count}`)
    .join('\n');
}

function main(): void {
  const [dumpPath, expectedPath, outputPath] = process.argv.slice(2);
  if (!dumpPath || !expectedPath || !outputPath) {
    throw new Error(
      'Usage: verify-recovery-copy-dump.ts <dump.sql> <expected-counts.txt> <output-counts.txt>'
    );
  }
  const verified = verifyRecoveryCopyDump(
    readFileSync(dumpPath, 'utf8'),
    readFileSync(expectedPath, 'utf8')
  );
  writeFileSync(outputPath, `${verified}${verified ? '\n' : ''}`, 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
