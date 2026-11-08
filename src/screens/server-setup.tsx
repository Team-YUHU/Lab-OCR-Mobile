import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, ErrorText, Field, Heading, Input, Text } from '@/components/ui';
import { isComplete, normalizeUrl, useServerConfig } from '@/lib/server-config';
import { useTheme } from '@/lib/theme';

/**
 * Where the web app is deployed, and its Clerk publishable key. Shown on first launch when
 * neither was built in, and from Settings to point the app somewhere else.
 */
export function ServerSetup({ onDone }: { onDone?: () => void }) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const { config, save, reset, builtIn } = useServerConfig();
	const [apiUrl, setApiUrl] = useState(config?.apiUrl ?? '');
	const [publishableKey, setPublishableKey] = useState(config?.publishableKey ?? '');
	const [checking, setChecking] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSave() {
		setError(null);
		const next = { apiUrl: normalizeUrl(apiUrl), publishableKey: publishableKey.trim() };
		if (!isComplete(next)) {
			setError('Enter the server address and a publishable key starting with pk_live_ or pk_test_.');
			return;
		}
		setChecking(true);
		try {
			// Any answer at all (even 401) means the server is there.
			await fetch(`${next.apiUrl}/api/v1/categories`);
		} catch {
			setChecking(false);
			setError(`Could not reach ${next.apiUrl}. Check the address and your connection.`);
			return;
		}
		setChecking(false);
		await save(next);
		onDone?.();
	}

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === 'ios' ? 'padding' : undefined}
			style={{ flex: 1, backgroundColor: theme.colors.background }}
		>
			<ScrollView
				keyboardShouldPersistTaps='handled'
				contentContainerStyle={{
					flexGrow: 1,
					justifyContent: 'center',
					padding: 20,
					paddingTop: insets.top + 24,
					paddingBottom: insets.bottom + 24,
					gap: 24,
				}}
			>
				<View style={{ alignItems: 'center', gap: 10 }}>
					<Image source={require('../../assets/mrg-logo.png')} style={{ width: 80, height: 48 }} contentFit='contain' />
					<Heading>Connect to your server</Heading>
					<Text tone='muted' size={14} style={{ textAlign: 'center' }}>
						The app talks to the same server as the MRG Labs OCR website.
					</Text>
				</View>
				<Card>
					<Field label='Server address' hint='Where the website is deployed. Only the address is used, not the page.'>
						<Input
							value={apiUrl}
							onChangeText={setApiUrl}
							placeholder={builtIn.apiUrl || 'https://'}
							autoCapitalize='none'
							keyboardType='url'
							inputMode='url'
						/>
					</Field>
					<Field
						label='Clerk publishable key'
						hint='The NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY value from the website’s environment.'
					>
						<Input
							value={publishableKey}
							onChangeText={setPublishableKey}
							placeholder='pk_live_…'
							autoCapitalize='none'
							mono
						/>
					</Field>
					<ErrorText>{error}</ErrorText>
					<Button title={checking ? 'Checking…' : 'Save and continue'} busy={checking} size='lg' onPress={() => void handleSave()} />
					<Button
						title='Use the built-in server'
						variant='outline'
						onPress={() => {
							setApiUrl(builtIn.apiUrl);
							setPublishableKey(builtIn.publishableKey);
							void reset().then(() => onDone?.());
						}}
					/>
					{onDone && <Button title='Cancel' variant='ghost' onPress={onDone} />}
				</Card>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}
