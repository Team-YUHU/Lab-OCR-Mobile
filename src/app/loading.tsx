import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/lib/theme';

/** Shown while Clerk restores the session. */
export default function LoadingScreen() {
	const { theme } = useTheme();
	return (
		<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
			<ActivityIndicator color={theme.colors.mutedForeground} />
		</View>
	);
}
