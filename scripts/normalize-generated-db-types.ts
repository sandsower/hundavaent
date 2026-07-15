import { readFile, writeFile } from 'node:fs/promises';

const generatedTypesPath = new URL('../src/lib/server/db/generated.types.ts', import.meta.url);
const source = await readFile(generatedTypesPath, 'utf8');
const functionStart = source.indexOf('      list_current_favourites: {');
const functionEnd = source.indexOf('\n      list_member_contributor_priority:', functionStart);

if (functionStart < 0 || functionEnd < 0) {
  throw new Error('Could not find list_current_favourites in generated database types');
}

const functionTypes = source.slice(functionStart, functionEnd);
const normalizedFunctionTypes = functionTypes
  .replace('          successor_name: string\n', '          successor_name: string | null\n')
  .replace(
    '          successor_place_id: string\n',
    '          successor_place_id: string | null\n'
  );

if (
  normalizedFunctionTypes === functionTypes &&
  !functionTypes.includes('successor_name: string | null')
) {
  throw new Error('Generated favourite successor fields were not normalized');
}

await writeFile(
  generatedTypesPath,
  (
    source.slice(0, functionStart) +
    normalizedFunctionTypes +
    source.slice(functionEnd)
  ).trimEnd() + '\n'
);
