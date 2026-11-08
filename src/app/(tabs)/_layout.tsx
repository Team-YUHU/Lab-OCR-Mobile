import { Tabs } from 'expo-router';
import { ArchiveIcon, CameraIcon, HouseIcon, Settings2Icon, UploadIcon, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';

const icon =
	(Icon: LucideIcon) =>
	({ color }: { color: unknown }) => <Icon size={22} color={String(color)} />;

/** The bottom tab bar from the web app's phone layout. */
export default function TabsLayout() {
	const { theme } = useTheme();
	return (
		<Tabs
			screenOptions={{
				headerShown: false,
				tabBarActiveTintColor: theme.colors.foreground,
				tabBarInactiveTintColor: theme.colors.mutedForeground,
				tabBarStyle: {
					backgroundColor: theme.colors.background,
					borderTopColor: theme.colors.border,
					borderTopWidth: theme.id === 'retro' ? 2 : 1,
				},
				tabBarLabelStyle: { fontSize: 11, fontFamily: theme.font },
				sceneStyle: { backgroundColor: theme.colors.background },
			}}
		>
			<Tabs.Screen name='index' options={{ title: 'Home', tabBarIcon: icon(HouseIcon) }} />
			<Tabs.Screen
				name='camera'
				options={{
					title: 'Scan',
					tabBarIcon: icon(CameraIcon),
					// The camera fills the screen, like the web app's.
					tabBarStyle: { display: 'none' },
				}}
			/>
			<Tabs.Screen name='upload' options={{ title: 'Upload', tabBarIcon: icon(UploadIcon) }} />
			<Tabs.Screen name='inventory' options={{ title: 'Inventory', tabBarIcon: icon(ArchiveIcon) }} />
			<Tabs.Screen name='settings' options={{ title: 'Settings', tabBarIcon: icon(Settings2Icon) }} />
		</Tabs>
	);
}
