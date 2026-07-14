export type CommandResult<T> =
  | { status: 'success'; value: T }
  | { status: 'validation_error' }
  | { status: 'forbidden' }
  | { status: 'conflict' }
  | { status: 'infrastructure_error' };
