import { readFile, writeFile } from 'node:fs/promises';

const generatedTypesPath = new URL('../src/lib/server/db/generated.types.ts', import.meta.url);
let source = await readFile(generatedTypesPath, 'utf8');

function normalizeFunctionFields(
  functionName: string,
  replacements: ReadonlyArray<readonly [generated: string, accurate: string]>
): void {
  const marker = `      ${functionName}: {`;
  const functionStart = source.indexOf(marker);
  if (functionStart < 0) {
    throw new Error(`Could not find ${functionName} in generated database types`);
  }

  const remainderStart = functionStart + marker.length;
  const nextFunction = source.slice(remainderStart).match(/\n      [a-z][a-z0-9_]*: \{/);
  const functionEnd =
    nextFunction?.index !== undefined
      ? remainderStart + nextFunction.index
      : source.indexOf('\n    }\n', remainderStart);
  if (functionEnd < 0) {
    throw new Error(`Could not find the end of ${functionName} in generated database types`);
  }

  let block = source.slice(functionStart, functionEnd);
  for (const [generated, accurate] of replacements) {
    if (block.includes(generated)) {
      block = block.replaceAll(generated, accurate);
    } else if (!block.includes(accurate)) {
      throw new Error(`Could not normalize ${functionName}: ${generated.trim()}`);
    }
  }
  source = source.slice(0, functionStart) + block + source.slice(functionEnd);
}

normalizeFunctionFields('apply_pending_member_rating', [
  ['          overall_score: number\n', '          overall_score: number | null\n']
]);
normalizeFunctionFields('complete_auth_pending_intent', [
  ['          overall_rating: number\n', '          overall_rating: number | null\n']
]);
normalizeFunctionFields('create_auth_pending_intent', [
  [
    '          requested_overall_rating: number\n',
    '          requested_overall_rating: number | null\n'
  ]
]);
normalizeFunctionFields('get_auth_pending_intent', [
  ['          overall_rating: number\n', '          overall_rating: number | null\n']
]);

const nullableRatingReturnFields = [
  'clarity_score',
  'comfort_score',
  'private_note',
  'private_note_updated_at',
  'thoughtfulness_score',
  'welcome_score'
] as const;
normalizeFunctionFields(
  'get_my_dog_friendliness_rating',
  nullableRatingReturnFields.map((field) => [
    `          ${field}: ${field.startsWith('private_note') ? 'string' : 'number'}\n`,
    `          ${field}: ${field.startsWith('private_note') ? 'string' : 'number'} | null\n`
  ])
);
normalizeFunctionFields('save_inline_dog_friendliness_rating', [
  ...['clarity', 'comfort', 'thoughtfulness', 'welcome'].map(
    (dimension) =>
      [
        `          requested_${dimension}_score: number\n`,
        `          requested_${dimension}_score: number | null\n`
      ] as const
  ),
  [
    '          requested_private_note?: string\n',
    '          requested_private_note?: string | null\n'
  ],
  [
    '          requested_private_note_classification?: string\n',
    '          requested_private_note_classification?: string | null\n'
  ],
  ...nullableRatingReturnFields.map(
    (field) =>
      [
        `          ${field}: ${field.startsWith('private_note') ? 'string' : 'number'}\n`,
        `          ${field}: ${field.startsWith('private_note') ? 'string' : 'number'} | null\n`
      ] as const
  )
]);
normalizeFunctionFields(
  'submit_dog_friendliness_rating',
  nullableRatingReturnFields.map((field) => [
    `          ${field}: ${field.startsWith('private_note') ? 'string' : 'number'}\n`,
    `          ${field}: ${field.startsWith('private_note') ? 'string' : 'number'} | null\n`
  ])
);
normalizeFunctionFields('list_current_favourites', [
  ['          successor_name: string\n', '          successor_name: string | null\n'],
  ['          successor_place_id: string\n', '          successor_place_id: string | null\n']
]);

await writeFile(generatedTypesPath, source.trimEnd() + '\n');
