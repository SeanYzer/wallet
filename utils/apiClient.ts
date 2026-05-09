import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './db';

let onAuthFailure: (() => void) | null = null;

export const setAuthFailureCallback = (callback: () => void) => {
    onAuthFailure = callback;
};

const clearAuthStorage = async () => {
    await AsyncStorage.multiRemove(['authToken', 'activeUserId']);
};

export const authFetch = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
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

    if (response.ok) {
        const originalJson = response.json.bind(response);
        response.json = async () => {
            const data = await originalJson();
            if (data && data.status === 'success' && data.data) {
                const keys = Object.keys(data.data);
                if (keys.length === 1 && typeof data.data[keys[0]] === 'object') {
                    return data.data[keys[0]];
                }
                return data.data;
            }
            return data;
        };
    }

    return response;
};
