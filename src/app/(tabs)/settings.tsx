import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useAuth, useUser } from '@clerk/expo';
import { CheckIcon, LogOutIcon, MonitorCogIcon, ServerIcon } from 'lucide-react-native';
import { Screen } from '@/components/screen';
import { Button, Card, Heading, Text } from '@/components/ui';
import { useServerConfig } from '@/lib/server-config';
import { ServerSettingsModal } from '@/screens/server-setup';
import { THEME_OPTIONS, getTheme, useTheme, type ThemeId } from '@/lib/theme';

function AccountCard() {
	const { user } = useUser();
	const { signOut } = useAuth();
	const { theme } = useTheme();
	if (!user) return null;
	const email = user.primaryEmailAddress?.emailAddress;
	const name = user.fullName || email || 'Your account';

	return (
		<Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
			<Image
				source={{ uri: user.imageUrl }}
				style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.muted }}
			/>
			<View style={{ flex: 1, minWidth: 0 }}>
				<Text weight='semibold' numberOfLines={1}>
					{name}
				</Text>
				{email && email !== name ? (
					<Text size={14} tone='muted' numberOfLines={1}>
						{email}
					</Text>
				) : null}
			</View>
			<Button title='Sign out' icon={LogOutIcon} size='sm' variant='outline' onPress={() => void signOut()} />
		</Card>
	);
}

/** The three-stripe swatch from the web app's theme picker. */
function Swatch({ id }: { id: ThemeId }) {
	const { colors } = getTheme(id);
	return (
		<View
			style={{
				width: 56,
				height: 40,
				borderRadius: 8,
				overflow: 'hidden',
				borderWidth: 1,
				borderColor: colors.border,
				backgroundColor: colors.background,
				padding: 6,
				gap: 4,
			}}
		>
			<View style={{ height: 6, width: '70%', borderRadius: 3, backgroundColor: colors.foreground }} />
			<View style={{ height: 6, width: '50%', borderRadius: 3, backgroundColor: colors.mutedForeground }} />
			<View style={{ height: 6, width: '35%', borderRadius: 3, backgroundColor: colors.accent === colors.muted ? colors.primary : colors.accent }} />
		</View>
	);
}

export default function SettingsScreen() {
	const { theme, setTheme } = useTheme();
	const { config } = useServerConfig();
	const [serverOpen, setServerOpen] = useState(false);

	return (
		<Screen>
			<View style={{ gap: 6 }}>
				<Text size={13} weight='medium' tone='muted'>
					PREFERENCES
				</Text>
				<Heading size={28}>Settings</Heading>
				<Text tone='muted'>Personalize the look and feel of your workspace.</Text>
			</View>

			<AccountCard />

			<Card>
				<View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
					<View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.muted, alignItems: 'center', justifyContent: 'center' }}>
						<MonitorCogIcon size={20} color={theme.colors.foreground} />
					</View>
					<View style={{ flex: 1, gap: 2 }}>
						<Text size={17} weight='semibold'>
							Appearance
						</Text>
						<Text size={14} tone='muted'>
							Choose a theme for the whole app. Your choice is saved on this device.
						</Text>
					</View>
				</View>
				<View accessibilityRole='radiogroup' style={{ gap: 10 }}>
					{THEME_OPTIONS.map((option) => {
						const selected = theme.id === option.id;
						return (
							<Pressable
								key={option.id}
								accessibilityRole='radio'
								accessibilityState={{ checked: selected }}
								onPress={() => setTheme(option.id)}
								style={{
									flexDirection: 'row',
									alignItems: 'center',
									gap: 12,
									padding: 12,
									borderRadius: theme.radius * 1.4,
									borderWidth: selected ? 2 : 1,
									borderColor: selected ? theme.colors.primary : theme.colors.border,
									backgroundColor: theme.colors.background,
								}}
							>
								<Swatch id={option.id} />
								<View style={{ flex: 1 }}>
									<Text weight='semibold'>{option.name}</Text>
									<Text size={13} tone='muted'>
										{option.description}
									</Text>
								</View>
								<View
									style={{
										width: 22,
										height: 22,
										borderRadius: 11,
										borderWidth: 1,
										borderColor: selected ? theme.colors.primary : theme.colors.border,
										backgroundColor: selected ? theme.colors.primary : 'transparent',
										alignItems: 'center',
										justifyContent: 'center',
									}}
								>
									{selected && <CheckIcon size={14} color={theme.colors.primaryForeground} />}
								</View>
							</Pressable>
						);
					})}
				</View>
			</Card>

			<Card>
				<View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
					<View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.muted, alignItems: 'center', justifyContent: 'center' }}>
						<ServerIcon size={20} color={theme.colors.foreground} />
					</View>
					<View style={{ flex: 1, minWidth: 0 }}>
						<Text size={17} weight='semibold'>
							Server
						</Text>
						<Text size={13} tone='muted' numberOfLines={1}>
							{config.apiUrl}
						</Text>
					</View>
					<Button title='Change' size='sm' variant='outline' onPress={() => setServerOpen(true)} />
					<ServerSettingsModal open={serverOpen} onClose={() => setServerOpen(false)} />
				</View>
			</Card>
		</Screen>
	);
}
