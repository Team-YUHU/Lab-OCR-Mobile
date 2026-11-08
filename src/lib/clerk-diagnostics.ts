import { useEffect, useState } from 'react';
import { getClerkInstance } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { describeError } from './crash-report';

// Clerk swallows the reason when it fails to start (it only sets its status to "error"),
// which leaves the app stuck with nothing to show. This records that reason, and can ask
// Clerk's server directly what it says to this phone.

let loadError: string | null = null;
const listeners = new Set<(error: string | null) => void>();
const patched = new WeakSet<object>();

function setLoadError(error: string | null) {
	loadError = error;
	for (const listener of listeners) listener(error);
}

/**
 * Creates (or reuses) Clerk's instance for this key before ClerkProvider does, so the
 * provider gets the same instance with its load wrapped to keep any error.
 */
export function prepareClerk(publishableKey: string) {
	setLoadError(null);
	try {
		const clerk = getClerkInstance({ publishableKey, tokenCache }) as unknown as {
			load: (...args: unknown[]) => Promise<unknown>;
		};
		if (!patched.has(clerk)) {
			patched.add(clerk);
			const load = clerk.load.bind(clerk);
			clerk.load = async (...args: unknown[]) => {
				try {
					const result = await load(...args);
					setLoadError(null);
					return result;
				} catch (error) {
					setLoadError(describeError(error));
					throw error;
				}
			};
		}
	} catch (error) {
		setLoadError(describeError(error));
	}
}

export function useClerkLoadError() {
	const [error, setError] = useState(loadError);
	useEffect(() => {
		listeners.add(setError);
		setError(loadError);
		return () => {
			listeners.delete(setError);
		};
	}, []);
	return error;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64(input: string) {
	let bits = 0;
	let value = 0;
	let output = '';
	for (const char of input.replace(/=+$/, '')) {
		const index = BASE64.indexOf(char);
		if (index < 0) continue;
		value = (value << 6) | index;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			output += String.fromCharCode((value >> bits) & 0xff);
		}
	}
	return output;
}

/** pk_test_Y3Jp… → crisp-thrush-6593.clerk.accounts.dev */
export function frontendApiHost(publishableKey: string) {
	const encoded = publishableKey.replace(/^pk_(test|live)_/, '');
	return decodeBase64(encoded).replace(/\$$/, '');
}

/** What Clerk's Frontend API answers this phone, in one line. */
export async function probeClerk(publishableKey: string) {
	const host = frontendApiHost(publishableKey);
	const url = `https://${host}/v1/environment?_is_native=1`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 12000);
	try {
		const response = await fetch(url, {
			headers: { 'x-mobile': '1' },
			signal: controller.signal,
		});
		const body = await response.json().catch(() => null);
		const first = body?.errors?.[0];
		if (response.ok) return `${host} answered OK (HTTP ${response.status}).`;
		return `${host} answered HTTP ${response.status}${first ? `: ${first.code} – ${first.long_message ?? first.message}` : ''}`;
	} catch (error) {
		return `Could not reach ${host}: ${(error as Error).name === 'AbortError' ? 'timed out' : (error as Error).message}`;
	} finally {
		clearTimeout(timer);
	}
}
