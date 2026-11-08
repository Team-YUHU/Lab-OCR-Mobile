import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The four themes from the web app's globals.css, as plain colours.

export type ThemeId = 'light' | 'dark' | 'retro' | 'mgr';

export type Palette = {
	background: string;
	foreground: string;
	card: string;
	popover: string;
	primary: string;
	primaryForeground: string;
	secondary: string;
	muted: string;
	mutedForeground: string;
	accent: string;
	accentForeground: string;
	destructive: string;
	border: string;
	input: string;
	ring: string;
	success: string;
	warning: string;
};

export type Theme = {
	id: ThemeId;
	dark: boolean;
	colors: Palette;
	radius: number;
	/** Font families: undefined means the system font. */
	font?: string;
	fontBold?: string;
	mono: string;
};

const MONO = 'monospace';

const THEMES: Record<ThemeId, Theme> = {
	light: {
		id: 'light',
		dark: false,
		radius: 10,
		mono: MONO,
		colors: {
			background: '#ffffff',
			foreground: '#0a0a0a',
			card: '#ffffff',
			popover: '#ffffff',
			primary: '#171717',
			primaryForeground: '#fafafa',
			secondary: '#f5f5f5',
			muted: '#f5f5f5',
			mutedForeground: '#737373',
			accent: '#f5f5f5',
			accentForeground: '#171717',
			destructive: '#e7000b',
			border: '#e5e5e5',
			input: '#e5e5e5',
			ring: '#a1a1a1',
			success: '#16a34a',
			warning: '#b45309',
		},
	},
	dark: {
		id: 'dark',
		dark: true,
		radius: 10,
		mono: MONO,
		colors: {
			background: '#070707',
			foreground: '#f5f5f5',
			card: '#121212',
			popover: '#161616',
			primary: '#f5f5f5',
			primaryForeground: '#0b0b0b',
			secondary: '#1d1d1d',
			muted: '#181818',
			mutedForeground: '#929292',
			accent: '#1f1f1f',
			accentForeground: '#f5f5f5',
			destructive: '#ff6467',
			border: 'rgba(255,255,255,0.09)',
			input: 'rgba(255,255,255,0.12)',
			ring: '#808080',
			success: '#22c55e',
			warning: '#fbbf24',
		},
	},
	retro: {
		id: 'retro',
		dark: false,
		radius: 4,
		font: 'minecraft-regular',
		fontBold: 'minecraft-bold',
		mono: 'minecraft-regular',
		colors: {
			background: '#a0a389',
			foreground: '#252914',
			card: '#a5a88e',
			popover: '#a5a88e',
			primary: '#252914',
			primaryForeground: '#a0a389',
			secondary: '#898d72',
			muted: '#929678',
			mutedForeground: '#454a30',
			accent: '#85896c',
			accentForeground: '#252914',
			destructive: '#704c3f',
			border: '#30351d',
			input: '#656b4d',
			ring: '#515735',
			success: '#3f5f1f',
			warning: '#6b4f12',
		},
	},
	mgr: {
		id: 'mgr',
		dark: false,
		radius: 10,
		mono: MONO,
		colors: {
			background: '#f5f6f8',
			foreground: '#20365f',
			card: '#ffffff',
			popover: '#ffffff',
			primary: '#20365f',
			primaryForeground: '#ffffff',
			secondary: '#e8ebf0',
			muted: '#eef0f3',
			mutedForeground: '#566784',
			accent: '#78a94b',
			accentForeground: '#20365f',
			destructive: '#b4232c',
			border: '#dce1e8',
			input: '#cbd2dd',
			ring: '#78a94b',
			success: '#4d7c24',
			warning: '#b45309',
		},
	},
};

export const THEME_OPTIONS: { id: ThemeId; name: string; description: string }[] = [
	{ id: 'light', name: 'Light', description: 'Bright surfaces and crisp contrast.' },
	{ id: 'dark', name: 'Dark', description: 'A comfortable, low-light workspace.' },
	{ id: 'retro', name: 'Retro', description: 'Pixel lettering with muted sage and olive tones.' },
	{ id: 'mgr', name: 'MRG', description: 'Navy, white, and light green inspired by MRG Laboratories.' },
];

export function getTheme(id: ThemeId) {
	return THEMES[id];
}

const STORAGE_KEY = 'theme';

type ThemeContextValue = { theme: Theme; setTheme: (id: ThemeId) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
	// Dark by default, like the web app.
	const [id, setId] = useState<ThemeId>('dark');

	useEffect(() => {
		AsyncStorage.getItem(STORAGE_KEY)
			.then((saved) => {
				if (saved && saved in THEMES) setId(saved as ThemeId);
			})
			.catch(() => {});
	}, []);

	const value = useMemo<ThemeContextValue>(
		() => ({
			theme: THEMES[id],
			setTheme: (next) => {
				setId(next);
				AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
			},
		}),
		[id],
	);
	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
	const value = useContext(ThemeContext);
	if (!value) throw new Error('useTheme must be used inside ThemeProvider');
	return value;
}
