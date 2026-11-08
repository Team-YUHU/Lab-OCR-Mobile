import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, ThemeProvider as NavigationThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClerkProvider, useAuth, useClerk } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { ServerConfigProvider, useServerConfig } from '@/lib/server-config';
import { clearLastCrash, describeError, installCrashReporter, readLastCrash, saveCrash } from '@/lib/crash-report';
import { prepareClerk, useClerkLoadError } from '@/lib/clerk-diagnostics';
import { ToastProvider } from '@/components/toast';
import { Button, Heading, Text } from '@/components/ui';

installCrashReporter();

/** Shows a problem on screen instead of closing the app. */
function ProblemScreen({ title, detail, actions }: { title: string; detail: string; actions: ReactNode }) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: theme.colors.background }}
			contentContainerStyle={{ padding: 20, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24, gap: 16 }}
		>
			<Heading size={22}>{title}</Heading>
			<Text size={14} tone='muted'>
				Take a screenshot of this screen and send it to whoever maintains the app.
			</Text>
			<View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12, backgroundColor: theme.colors.card }}>
				<Text size={12} mono selectable>
					{detail}
				</Text>
			</View>
			<View style={{ gap: 10 }}>{actions}</View>
		</ScrollView>
	);
}

function ResetActions({ onRetry }: { onRetry: () => void }) {
	const { reset } = useServerConfig();
	return (
		<>
			<Button title='Try again' onPress={onRetry} />
			<Button
				title='Reset server settings and try again'
				variant='outline'
				onPress={() => {
					void reset().finally(onRetry);
				}}
			/>
		</>
	);
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
	state = { error: null as unknown };

	static getDerivedStateFromError(error: unknown) {
		return { error };
	}

	componentDidCatch(error: unknown) {
		saveCrash(error);
	}

	render() {
		if (this.state.error) {
			return (
				<ProblemScreen
					title='Something went wrong'
					detail={describeError(this.state.error)}
					actions={
						<ResetActions
							onRetry={() => {
								clearLastCrash();
								this.setState({ error: null });
							}}
						/>
					}
				/>
			);
		}
		return this.props.children;
	}
}

/** If the app closed on an error last time, says so before carrying on. */
function LastCrashNotice({ children }: { children: ReactNode }) {
	const [crash, setCrash] = useState(() => readLastCrash());
	if (!crash) return <>{children}</>;
	return (
		<ProblemScreen
			title='The app closed unexpectedly last time'
			detail={crash}
			actions={
				<ResetActions
					onRetry={() => {
						clearLastCrash();
						setCrash(null);
					}}
				/>
			}
		/>
	);
}

function RootStack() {
	const { isLoaded, isSignedIn } = useAuth();
	const clerk = useClerk();
	const loadError = useClerkLoadError();
	const { theme } = useTheme();
	const [, setTick] = useState(0);

	const status = (clerk as unknown as { status?: string }).status;
	// A Clerk that failed to start counts as not ready: the loading screen explains why.
	const ready = isLoaded && !loadError && status !== 'error';

	// Clerk's status doesn't always re-render us, so look again every second until ready.
	useEffect(() => {
		if (ready) return;
		const ticker = setInterval(() => setTick((tick) => tick + 1), 1000);
		return () => clearInterval(ticker);
	}, [ready]);

	// Always a navigator, as Expo Router expects; the guards pick which screens exist.
	return (
		<Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
			<Stack.Protected guard={!ready}>
				<Stack.Screen name='loading' />
			</Stack.Protected>
			<Stack.Protected guard={ready && !!isSignedIn}>
				<Stack.Screen name='(tabs)' />
			</Stack.Protected>
			{/* Signed out, the sign-in screen is all anyone can see. Sign-up is closed. */}
			<Stack.Protected guard={ready && !isSignedIn}>
				<Stack.Screen name='sign-in' />
			</Stack.Protected>
		</Stack>
	);
}

function App() {
	const { config } = useServerConfig();
	const { theme } = useTheme();
	// Before ClerkProvider renders, so it picks up the same instance with errors recorded.
	useMemo(() => prepareClerk(config.publishableKey), [config.publishableKey]);
	const base = theme.dark ? DarkTheme : DefaultTheme;
	const navigationTheme = {
		...base,
		colors: {
			...base.colors,
			background: theme.colors.background,
			card: theme.colors.background,
			text: theme.colors.foreground,
			border: theme.colors.border,
			primary: theme.colors.foreground,
		},
	};

	return (
		<NavigationThemeProvider value={navigationTheme}>
			<StatusBar style={theme.dark ? 'light' : 'dark'} />
			<ErrorBoundary>
				<LastCrashNotice>
					{/* Keyed, so pointing the app at another server starts Clerk afresh. */}
					<ClerkProvider key={config.publishableKey} publishableKey={config.publishableKey} tokenCache={tokenCache}>
						<ToastProvider>
							<RootStack />
						</ToastProvider>
					</ClerkProvider>
				</LastCrashNotice>
			</ErrorBoundary>
		</NavigationThemeProvider>
	);
}

export default function RootLayout() {
	// Only Retro uses these; they're also embedded at build time by the expo-font plugin.
	useFonts({
		'minecraft-regular': require('../../assets/fonts/minecraft-regular.otf'),
		'minecraft-bold': require('../../assets/fonts/minecraft-bold.otf'),
	});

	return (
		<SafeAreaProvider>
			<ThemeProvider>
				<ServerConfigProvider>
					<App />
				</ServerConfigProvider>
			</ThemeProvider>
		</SafeAreaProvider>
	);
}

