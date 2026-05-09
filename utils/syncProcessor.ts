import { authFetch } from './apiClient';
import { API_URL } from './db';
import {
  SyncQueueItem,
  SyncEntity,
  SyncOperation,
  getProcessableItems,
  dequeueSync,
  markSyncFailed,
  updateLastSyncedAt,
  getQueueStats,
  generateQueueItemId,
  enqueueSync,
} from './syncQueue';

let processingTimeout: NodeJS.Timeout | null = null;
let isProcessing = false;

const entityEndpoints: Record<SyncEntity, string> = {
  transactions: '/transactions',
  categories: '/categories',
  dues: '/dues',
  savingsItems: '/savingsItems',
  profile: '/userProfiles',
};

interface SyncResult {
  success: boolean;
  response?: Response;
  error?: string;
}

export interface QueueStats {
  total: number;
  failed: number;
  pending: number;
}

let queueChangeListeners: (() => void)[] = [];

export function addQueueChangeListener(listener: () => void): () => void {
  queueChangeListeners.push(listener);
  return () => {
    queueChangeListeners = queueChangeListeners.filter(l => l !== listener);
  };
}

function notifyQueueChange(): void {
  queueChangeListeners.forEach(listener => listener());
}

async function processSingleItem(item: SyncQueueItem): Promise<SyncResult> {
  if (!API_URL) {
    return { success: true };
  }

  const endpoint = entityEndpoints[item.entity];

  try {
    let response: Response;
    const url = item.entityId
      ? `${endpoint}/${item.entityId}`
      : endpoint;

    switch (item.operation) {
      case 'create':
        response = await authFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify(item.data),
        });
        break;

      case 'update':
        response = await authFetch(url, {
          method: 'PUT',
          body: JSON.stringify(item.data),
        });
        break;

      case 'delete':
        response = await authFetch(url, {
          method: 'DELETE',
        });
        break;

      default:
        return { success: false, error: 'Unknown operation' };
    }

    if (response.ok) {
      return { success: true, response };
    } else if (response.status === 401) {
      return { success: false, error: 'Unauthorized - session expired' };
    } else {
      return {
        success: false,
        error: `HTTP ${response.status}`,
        response,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Network error',
    };
  }
}

export async function processSyncQueue(): Promise<void> {
  if (!API_URL || isProcessing) return;

  isProcessing = true;

  try {
    let items = await getProcessableItems();

    while (items.length > 0) {
      const item = items[0];

      const result = await processSingleItem(item);

      if (result.success) {
        await dequeueSync(item.id);
        await updateLastSyncedAt();
      } else {
        await markSyncFailed(item.id, result.error || 'Unknown error');
      }

      notifyQueueChange();
      items = await getProcessableItems();
    }
  } catch (e) {
    console.error('Error processing sync queue:', e);
  } finally {
    isProcessing = false;
  }
}

export function triggerSyncProcessing(debounceMs: number = 500): void {
  if (processingTimeout) {
    clearTimeout(processingTimeout);
  }

  processingTimeout = setTimeout(() => {
    processSyncQueue();
  }, debounceMs);
}

export async function getCurrentQueueStats(): Promise<QueueStats> {
  const stats = await getQueueStats();
  return {
    total: stats.total,
    failed: stats.failed,
    pending: stats.pending,
  };
}

export async function enqueueAndTrigger(
  entity: SyncEntity,
  operation: SyncOperation,
  entityId?: string,
  data?: any
): Promise<void> {
  if (!API_URL) return;

  const itemId = generateQueueItemId(entity, operation, entityId);

  const existingQueue = await getProcessableItems();
  const existingItem = existingQueue.find(i => i.id === itemId);

  if (existingItem && existingItem.retryCount > 0 && existingItem.lastError) {
    console.log(`[Sync] Retrying previously failed item: ${itemId}`);
  }

  await enqueueSync(entity, operation, entityId, data);

  notifyQueueChange();
  triggerSyncProcessing();
}
