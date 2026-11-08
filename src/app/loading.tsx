import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/expo';
import { Button, Heading, Text } from '@/components/ui';
import { probeClerk, useClerkLoadError } from '@/lib/clerk-diagnostics';
import { useServerConfig } from '@/lib/server-config';
import { useTheme } from '@/lib/theme';
import { ServerSettingsModal } from '@/screens/server-setup';

const SLOW_MS = 10000;

/**
 * Shown while Clerk starts. If it fails, or takes too long, says why instead of spinning,
 * so there's something to act on (or screenshot).
 */
export default function LoadingScreen() {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const clerk = useClerk();
	const { config } = useServerConfig();
	const loadError = useClerkLoadError();
	const [slow, setSlow] = useState(false);
	const [probe, setProbe] = useState<string | null>(null);
	const [serverOpen, setServerOpen] = useState(false);
	const [, setTick] = useState(0);

	useEffect(() => {
		const timer = setTimeout(() => setSlow(true), SLOW_MS);
		// Clerk's status doesn't always re-render us, so look again every second.
		const ticker = setInterval(() => setTick((tick) => tick + 1), 1000);
		return () => {
			clearTimeout(timer);
			clearInterval(ticker);
		};
	}, []);

	const status = (clerk as unknown as { status?: string }).status ?? 'unknown';
	const failed = Boolean(loadError) || status === 'error';
	const showProblem = failed || slow;

	useEffect(() => {
		if (!showProblem) return;
		let cancelled = false;
		setProbe('Checking…');
		probeClerk(config.publishableKey).then((result) => !cancelled && setProbe(result));
		return () => {
			cancelled = true;
		};
	}, [showProblem, config.publishableKey]);

	if (!showProblem) {
		return (
			<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: theme.colors.background }}>
				<ActivityIndicator color={theme.colors.mutedForeground} />
				<Text size={13} tone='muted'>
					Starting sign-in…
				</Text>
			</View>
		);
	}

	const detail = [
		`Clerk status: ${status}`,
		loadError ? `Clerk error: ${loadError}` : 'Clerk error: none reported',
		`Clerk server check: ${probe ?? '…'}`,
		`Website: ${config.apiUrl}`,
	].join('\n\n');

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: theme.colors.background }}
			contentContainerStyle={{ padding: 20, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24, gap: 16 }}
		>
			<Heading size={22}>{failed ? 'Sign-in couldn’t start' : 'Sign-in is taking a long time'}</Heading>
			<Text size={14} tone='muted'>
				Check your internet connection. If this keeps happening, take a screenshot of this screen and send it to
				whoever maintains the app.
			</Text>
			<View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12, backgroundColor: theme.colors.card }}>
				<Text size={12} mono selectable>
					{detail}
				</Text>
			</View>
			<Text size={13} tone='muted'>
				Close the app fully and open it again to retry.
			</Text>
			<Button title='Server settings' variant='outline' onPress={() => setServerOpen(true)} />
			<ServerSettingsModal open={serverOpen} onClose={() => setServerOpen(false)} />
		</ScrollView>
	);
}
