import { useCallback } from 'react';
import { useAuth } from '@clerk/expo';
import { useServerConfig } from './server-config';

// The web app's API, called with the Clerk session token as a Bearer header.
// Clerk's middleware on the server accepts that in place of the browser's cookie.

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export function useApi(): ApiFetch {
	const { getToken } = useAuth();
	const { config } = useServerConfig();
	const base = config?.apiUrl ?? '';

	return useCallback(
		async (path, init = {}) => {
			const token = await getToken();
			const headers = new Headers(init.headers);
			if (token) headers.set('Authorization', `Bearer ${token}`);
			headers.set('Accept', headers.get('Accept') ?? 'application/json');
			try {
				return await fetch(`${base}${path}`, { ...init, headers });
			} catch (error) {
				if ((error as Error).name === 'AbortError') throw error;
				const detail = (error as Error).message;
				throw new Error(
					`Could not reach the server. Check your connection and try again.${detail ? ` (${detail})` : ''}`,
				);
			}
		},
		[base, getToken],
	);
}

/** Parses a JSON response, throwing the server's error message when it isn't ok. */
export async function readJson<T = any>(response: Response): Promise<T> {
	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		if (response.status === 413) {
			throw new Error('That file is too large for the server to accept.');
		}
		if (response.status === 401) {
			throw new Error('Your session has ended. Sign in again to continue.');
		}
		throw new Error(data.error ?? 'Something went wrong');
	}
	return data as T;
}
