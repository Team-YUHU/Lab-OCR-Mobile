import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleAlertIcon, CircleCheckIcon, TriangleAlertIcon } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Text } from './ui';

// A small stand-in for sonner: one toast at a time, with an optional action.

type Kind = 'success' | 'error' | 'warning';
type ToastData = {
	id: number;
	kind: Kind;
	title: string;
	description?: string;
	action?: { label: string; onPress: () => void };
};
type Options = Omit<ToastData, 'id' | 'kind' | 'title'>;

type Api = {
	success: (title: string, options?: Options) => void;
	error: (title: string, options?: Options) => void;
	warning: (title: string, options?: Options) => void;
};

const ToastContext = createContext<Api | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const [queue, setQueue] = useState<ToastData[]>([]);
	const nextId = useRef(1);
	const opacity = useRef(new Animated.Value(0)).current;
	const current = queue[0];

	const dismiss = useCallback(
		(id: number) => {
			Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() =>
				setQueue((items) => items.filter((item) => item.id !== id)),
			);
		},
		[opacity],
	);

	const show = useCallback(
		(kind: Kind, title: string, options: Options = {}) => {
			const id = nextId.current++;
			setQueue((items) => [...items, { id, kind, title, ...options }]);
			Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
			setTimeout(() => dismiss(id), options.action ? 6000 : 4000);
		},
		[dismiss, opacity],
	);

	const api = useMemo<Api>(
		() => ({
			success: (title, options) => show('success', title, options),
			error: (title, options) => show('error', title, options),
			warning: (title, options) => show('warning', title, options),
		}),
		[show],
	);

	const Icon = current
		? { success: CircleCheckIcon, error: CircleAlertIcon, warning: TriangleAlertIcon }[current.kind]
		: null;
	const iconColor = current
		? {
				success: theme.colors.success,
				error: theme.colors.destructive,
				warning: theme.colors.warning,
			}[current.kind]
		: undefined;

	return (
		<ToastContext.Provider value={api}>
			{children}
			{current && Icon && (
				<Animated.View
					pointerEvents='box-none'
					style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 8, opacity }}
				>
					<Pressable
						onPress={() => dismiss(current.id)}
						accessibilityLiveRegion='polite'
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							gap: 12,
							padding: 14,
							borderRadius: 16,
							borderWidth: 1,
							borderColor: theme.colors.border,
							backgroundColor: theme.colors.popover,
							shadowColor: '#000',
							shadowOpacity: 0.25,
							shadowRadius: 16,
							elevation: 8,
						}}
					>
						<Icon size={18} color={iconColor} />
						<View style={{ flex: 1 }}>
							<Text size={14} weight='medium'>
								{current.title}
							</Text>
							{current.description ? (
								<Text size={13} tone='muted'>
									{current.description}
								</Text>
							) : null}
						</View>
						{current.action && (
							<Pressable
								onPress={() => {
									current.action?.onPress();
									dismiss(current.id);
								}}
								style={{
									backgroundColor: theme.colors.primary,
									borderRadius: 999,
									paddingHorizontal: 12,
									paddingVertical: 6,
								}}
							>
								<Text size={13} weight='medium' style={{ color: theme.colors.primaryForeground }}>
									{current.action.label}
								</Text>
							</Pressable>
						)}
					</Pressable>
				</Animated.View>
			)}
		</ToastContext.Provider>
	);
}

export function useToast() {
	const value = useContext(ToastContext);
	if (!value) throw new Error('useToast must be used inside ToastProvider');
	return value;
}
