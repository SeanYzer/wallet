import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './db';

export const authFetch = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
    const token = await AsyncStorage.getItem('authToken');

    // Ensure the endpoint starts with a slash
    const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    console.info(endpoint, formattedEndpoint);

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    // If options.headers exists, merge them (and handle Headers obj if needed, but we keep it simple Record)
    if (options.headers) {
        Object.assign(headers, options.headers);
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    console.info(API_URL);

    const response = await fetch(`${API_URL}${formattedEndpoint}`, {
        ...options,
        headers,
    });

    // Intercept .json() to unwrap the `{ status: 'success', data: { items: [...] } }` payload automatically
    if (response.ok) {
        const originalJson = response.json.bind(response);
        response.json = async () => {
            const data = await originalJson();
            if (data && data.status === 'success' && data.data) {
                const keys = Object.keys(data.data);
                // Extract if it's `{ data: { transactions: [...] } }`
                if (keys.length === 1 && typeof data.data[keys[0]] === 'object') {
                    return data.data[keys[0]];
                }
                return data.data; // e.g. profile
            }
            return data;
        };
    }

    return response;
};
