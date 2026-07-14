interface RpcError {
  code?: string;
}

interface RpcResponse {
  data: unknown;
  error: RpcError | null;
}

export interface QueueSummaryRpcClient {
  rpc: (functionName: string) => Promise<RpcResponse>;
}

export const implementedModerationQueueIds = [
  'suggestions',
  'corrections-and-reports',
  'candidate-places'
] as const;

export type ImplementedModerationQueueId = (typeof implementedModerationQueueIds)[number];

export interface ModerationQueueSummaryItem {
  queueId: ImplementedModerationQueueId;
  actionableCount: number;
}

export type ModerationQueueSummaryResult =
  | { status: 'success'; value: ModerationQueueSummaryItem[] }
  | { status: 'forbidden' | 'infrastructure_error' };

export async function listModerationQueueSummary(
  client: QueueSummaryRpcClient
): Promise<ModerationQueueSummaryResult> {
  try {
    const { data, error } = await client.rpc('list_moderation_queue_summary');
    if (error) {
      return { status: error.code === '42501' ? 'forbidden' : 'infrastructure_error' };
    }

    if (!Array.isArray(data) || data.length !== implementedModerationQueueIds.length) {
      return { status: 'infrastructure_error' };
    }

    const rows = new Map<ImplementedModerationQueueId, number>();
    for (const value of data) {
      if (!isQueueSummaryRow(value) || rows.has(value.queue_id)) {
        return { status: 'infrastructure_error' };
      }
      rows.set(value.queue_id, value.actionable_count);
    }

    if (rows.size !== implementedModerationQueueIds.length) {
      return { status: 'infrastructure_error' };
    }

    return {
      status: 'success',
      value: implementedModerationQueueIds.map((queueId) => ({
        queueId,
        actionableCount: rows.get(queueId) as number
      }))
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function isQueueSummaryRow(value: unknown): value is {
  queue_id: ImplementedModerationQueueId;
  actionable_count: number;
} {
  if (!isRecord(value) || !isImplementedQueueId(value.queue_id)) return false;

  return (
    typeof value.actionable_count === 'number' &&
    Number.isSafeInteger(value.actionable_count) &&
    value.actionable_count >= 0
  );
}

function isImplementedQueueId(value: unknown): value is ImplementedModerationQueueId {
  return (
    typeof value === 'string' && implementedModerationQueueIds.some((queueId) => queueId === value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
