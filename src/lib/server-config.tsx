import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Where the app's server lives (the deployed Next.js app, which serves /api/v1) and the
// Clerk publishable key it signs in with. Both can be baked in at build time with
// EXPO_PUBLIC_API_URL and EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, or entered on first launch.

export type ServerConfig = { apiUrl: string; publishableKey: string };

const STORAGE_KEY = 'server-config';

const BUILT_IN: ServerConfig = {
	apiUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
	publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
};

/** https://example.com/ → https://example.com, so paths join cleanly. */
export function normalizeUrl(input: string) {
	let url = input.trim().replace(/\/+$/, '');
	if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
	return url;
}

export function isComplete(config: ServerConfig) {
	return Boolean(config.apiUrl && /^pk_(test|live)_/.test(config.publishableKey));
}

type Value = {
	/** Null while loading from storage. */
	config: ServerConfig | null;
	save: (config: ServerConfig) => Promise<void>;
	builtIn: ServerConfig;
};

const ServerConfigContext = createContext<Value | null>(null);

export function ServerConfigProvider({ children }: { children: ReactNode }) {
	const [config, setConfig] = useState<ServerConfig | null>(null);

	useEffect(() => {
		AsyncStorage.getItem(STORAGE_KEY)
			.then((saved) => {
				const parsed = saved ? (JSON.parse(saved) as Partial<ServerConfig>) : {};
				setConfig({
					apiUrl: parsed.apiUrl || BUILT_IN.apiUrl,
					publishableKey: parsed.publishableKey || BUILT_IN.publishableKey,
				});
			})
			.catch(() => setConfig(BUILT_IN));
	}, []);

	const value = useMemo<Value>(
		() => ({
			config,
			builtIn: BUILT_IN,
			save: async (next) => {
				const cleaned = {
					apiUrl: normalizeUrl(next.apiUrl),
					publishableKey: next.publishableKey.trim(),
				};
				await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
				setConfig(cleaned);
			},
		}),
		[config],
	);

	return (
		<ServerConfigContext.Provider value={value}>{children}</ServerConfigContext.Provider>
	);
}

export function useServerConfig() {
	const value = useContext(ServerConfigContext);
	if (!value) throw new Error('useServerConfig must be used inside ServerConfigProvider');
	return value;
}
