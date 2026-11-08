import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider as NavigationThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { ServerConfigProvider, isComplete, useServerConfig } from '@/lib/server-config';
import { ToastProvider } from '@/components/toast';
import { ServerSetup } from '@/screens/server-setup';

function Splash() {
	const { theme } = useTheme();
	return (
		<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
			<ActivityIndicator color={theme.colors.mutedForeground} />
		</View>
	);
}

function RootStack() {
	const { isLoaded, isSignedIn } = useAuth();
	const { theme } = useTheme();
	if (!isLoaded) return <Splash />;

	return (
		<Stack
			screenOptions={{
				headerShown: false,
				contentStyle: { backgroundColor: theme.colors.background },
			}}
		>
			{/* Signed out, the sign-in screen is all anyone can see. Sign-up is closed. */}
			<Stack.Protected guard={!!isSignedIn}>
				<Stack.Screen name='(tabs)' />
			</Stack.Protected>
			<Stack.Protected guard={!isSignedIn}>
				<Stack.Screen name='sign-in' />
			</Stack.Protected>
			<Stack.Screen name='server' options={{ presentation: 'modal' }} />
		</Stack>
	);
}

function Gate() {
	const { config } = useServerConfig();
	const { theme } = useTheme();

	const navigationTheme = {
		...(theme.dark ? DarkTheme : DefaultTheme),
		colors: {
			...(theme.dark ? DarkTheme : DefaultTheme).colors,
			background: theme.colors.background,
			card: theme.colors.background,
			text: theme.colors.foreground,
			border: theme.colors.border,
			primary: theme.colors.foreground,
		},
	};

	let content;
	if (!config) content = <Splash />;
	else if (!isComplete(config)) content = <ServerSetup />;
	else {
		content = (
			// Keyed, so pointing the app at another server starts Clerk afresh.
			<ClerkProvider key={config.publishableKey} publishableKey={config.publishableKey} tokenCache={tokenCache}>
				<ToastProvider>
					<RootStack />
				</ToastProvider>
			</ClerkProvider>
		);
	}

	return (
		<NavigationThemeProvider value={navigationTheme}>
			<StatusBar style={theme.dark ? 'light' : 'dark'} />
			{content}
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
					<Gate />
				</ServerConfigProvider>
			</ThemeProvider>
		</SafeAreaProvider>
	);
}
