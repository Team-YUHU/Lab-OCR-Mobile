import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Where the app's server lives (the deployed Next.js app, which serves /api/v1) and the
// Clerk publishable key it signs in with. Built in below; EXPO_PUBLIC_API_URL and
// EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY override them at build time, and Settings → Server
// can override them on one phone.

export type ServerConfig = { apiUrl: string; publishableKey: string };

const DEFAULTS: ServerConfig = {
	apiUrl: 'https://lab-ocr-frontend-five.vercel.app',
	publishableKey: 'pk_test_Y3Jpc3AtdGhydXNoLTY1OTMuY2xlcmsuYWNjb3VudHMuZGV2JA',
};

// Bumped from "server-config", so values typed into the first build are ignored.
const STORAGE_KEY = 'server-config-v2';

/** The site's origin: "lab.example.com/sign-in?x=1" → "https://lab.example.com". */
export function normalizeUrl(input: string) {
	let url = input.trim();
	if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
	const origin = url.match(/^https?:\/\/[^/?#\s]+/i)?.[0];
	return origin ? origin.toLowerCase() : '';
}

export function isComplete(config: ServerConfig) {
	return Boolean(config.apiUrl && /^pk_(test|live)_[A-Za-z0-9+/=]+$/.test(config.publishableKey));
}

const BUILT_IN: ServerConfig = {
	apiUrl: normalizeUrl(process.env.EXPO_PUBLIC_API_URL || DEFAULTS.apiUrl),
	publishableKey: (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || DEFAULTS.publishableKey).trim(),
};

type Value = {
	config: ServerConfig;
	save: (config: ServerConfig) => Promise<void>;
	reset: () => Promise<void>;
	builtIn: ServerConfig;
};

const ServerConfigContext = createContext<Value | null>(null);

export function ServerConfigProvider({ children }: { children: ReactNode }) {
	// Starts with the built-in values, so Clerk can start straight away.
	const [config, setConfig] = useState<ServerConfig>(BUILT_IN);

	useEffect(() => {
		AsyncStorage.getItem(STORAGE_KEY)
			.then((saved) => {
				const parsed = saved ? (JSON.parse(saved) as Partial<ServerConfig>) : {};
				const candidate = {
					apiUrl: normalizeUrl(parsed.apiUrl ?? '') || BUILT_IN.apiUrl,
					publishableKey: parsed.publishableKey?.trim() || BUILT_IN.publishableKey,
				};
				// A broken override never locks the app out: fall back to the built-in values.
				if (isComplete(candidate) && (candidate.apiUrl !== BUILT_IN.apiUrl || candidate.publishableKey !== BUILT_IN.publishableKey)) {
					setConfig(candidate);
				}
			})
			.catch(() => {});
	}, []);

	const value = useMemo<Value>(
		() => ({
			config,
			builtIn: BUILT_IN,
			save: async (next) => {
				const cleaned = { apiUrl: normalizeUrl(next.apiUrl), publishableKey: next.publishableKey.trim() };
				await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
				setConfig(cleaned);
			},
			reset: async () => {
				await AsyncStorage.removeItem(STORAGE_KEY);
				setConfig(BUILT_IN);
			},
		}),
		[config],
	);

	return <ServerConfigContext.Provider value={value}>{children}</ServerConfigContext.Provider>;
}

export function useServerConfig() {
	const value = useContext(ServerConfigContext);
	if (!value) throw new Error('useServerConfig must be used inside ServerConfigProvider');
	return value;
}
