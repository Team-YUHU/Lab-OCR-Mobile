import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';

/** A scrolling page with safe-area padding. */
export function Screen({
	children,
	contentStyle,
}: {
	children: ReactNode;
	contentStyle?: StyleProp<ViewStyle>;
}) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === 'ios' ? 'padding' : undefined}
			style={{ flex: 1, backgroundColor: theme.colors.background }}
		>
			<ScrollView
				keyboardShouldPersistTaps='handled'
				contentContainerStyle={[
					{ paddingHorizontal: 16, paddingTop: insets.top + 24, paddingBottom: 32, gap: 20 },
					contentStyle,
				]}
			>
				{children}
			</ScrollView>
		</KeyboardAvoidingView>
	);
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
	return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;
}
