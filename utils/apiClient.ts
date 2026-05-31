import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './db';

let onAuthFailure: (() => void) | null = null;

export const setAuthFailureCallback = (callback: () => void) => {
    onAuthFailure = callback;
};

const clearAuthStorage = async () => {
    await AsyncStorage.multiRemove(['authToken', 'activeUserId']);
};

export interface ApiResult<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export async function authFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  const token = await AsyncStorage.getItem('authToken');

  const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_URL}${formattedEndpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      console.warn('401 Unauthorized - clearing auth credentials');
      await clearAuthStorage();
      if (onAuthFailure) {
        onAuthFailure();
      }
    }

    const body = await response.json();
    const unwrapped = body?.status === 'success' && body?.data ? body.data : body;

    return {
      ok: response.ok,
      status: response.status,
      data: unwrapped,
      error: !response.ok ? (body?.error ?? `HTTP ${response.status}`) : undefined,
    };
  } catch (e: any) {
    return { ok: false, status: 0, error: e.message };
  }
}
