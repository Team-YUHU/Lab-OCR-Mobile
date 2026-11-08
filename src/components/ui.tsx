import { useState, type ReactNode } from 'react';
import {
	ActivityIndicator,
	FlatList,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text as RNText,
	TextInput,
	View,
	KeyboardAvoidingView,
	Platform,
	type PressableProps,
	type StyleProp,
	type TextInputProps,
	type TextProps,
	type TextStyle,
	type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, ChevronDownIcon, XIcon, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';

// Small themed building blocks standing in for the web app's shadcn/ui components.

type Tone = 'default' | 'muted' | 'destructive' | 'warning' | 'success';

export function Text({
	tone = 'default',
	size = 15,
	weight = 'normal',
	mono,
	style,
	...props
}: TextProps & {
	tone?: Tone;
	size?: number;
	weight?: 'normal' | 'medium' | 'semibold' | 'bold';
	mono?: boolean;
}) {
	const { theme } = useTheme();
	const { colors } = theme;
	const color = {
		default: colors.foreground,
		muted: colors.mutedForeground,
		destructive: colors.destructive,
		warning: colors.warning,
		success: colors.success,
	}[tone];
	const bold = weight !== 'normal';
	const fontFamily = mono
		? theme.mono
		: bold && theme.fontBold
			? theme.fontBold
			: theme.font;
	const fontWeight = theme.font
		? undefined
		: ({ normal: '400', medium: '500', semibold: '600', bold: '700' } as const)[weight];
	return (
		<RNText
			{...props}
			style={[{ color, fontSize: size, fontFamily, fontWeight, lineHeight: size * 1.4 }, style]}
		/>
	);
}

export function Heading({ children, size = 26 }: { children: ReactNode; size?: number }) {
	return (
		<Text size={size} weight='semibold' style={{ letterSpacing: -0.4 }} accessibilityRole='header'>
			{children}
		</Text>
	);
}

type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive' | 'confirm';

export function Button({
	title,
	icon: Icon,
	variant = 'default',
	size = 'md',
	busy,
	disabled,
	style,
	...props
}: Omit<PressableProps, 'style' | 'children'> & {
	title?: string;
	icon?: LucideIcon;
	variant?: ButtonVariant;
	size?: 'sm' | 'md' | 'lg' | 'icon';
	busy?: boolean;
	style?: StyleProp<ViewStyle>;
}) {
	const { theme } = useTheme();
	const { colors } = theme;
	const palette = {
		default: { bg: colors.primary, fg: colors.primaryForeground, border: colors.primary },
		outline: { bg: 'transparent', fg: colors.foreground, border: colors.border },
		ghost: { bg: 'transparent', fg: colors.foreground, border: 'transparent' },
		destructive: { bg: 'transparent', fg: colors.destructive, border: 'transparent' },
		confirm: { bg: 'transparent', fg: colors.success, border: colors.success },
	}[variant];
	const height = { sm: 34, md: 42, lg: 48, icon: 38 }[size];
	const isDisabled = disabled || busy;

	return (
		<Pressable
			accessibilityRole='button'
			accessibilityState={{ disabled: !!isDisabled, busy: !!busy }}
			disabled={isDisabled}
			{...props}
			style={({ pressed }) => [
				{
					height,
					minWidth: height,
					paddingHorizontal: size === 'icon' ? 0 : size === 'sm' ? 12 : 18,
					borderRadius: 999,
					backgroundColor: pressed && variant !== 'default' ? colors.accent : palette.bg,
					borderColor: palette.border,
					borderWidth: 1,
					flexDirection: 'row',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 8,
					opacity: isDisabled ? 0.5 : pressed && variant === 'default' ? 0.85 : 1,
				},
				style,
			]}
		>
			{busy ? (
				<ActivityIndicator size='small' color={palette.fg} />
			) : (
				Icon && <Icon size={size === 'sm' ? 15 : 18} color={palette.fg} />
			)}
			{title ? (
				<Text size={size === 'sm' ? 13 : 15} weight='medium' style={{ color: palette.fg }}>
					{title}
				</Text>
			) : null}
		</Pressable>
	);
}

export function Input({ style, ...props }: TextInputProps & { mono?: boolean }) {
	const { theme } = useTheme();
	const { colors } = theme;
	const [focused, setFocused] = useState(false);
	return (
		<TextInput
			placeholderTextColor={colors.mutedForeground}
			autoCorrect={false}
			{...props}
			onFocus={(event) => {
				setFocused(true);
				props.onFocus?.(event);
			}}
			onBlur={(event) => {
				setFocused(false);
				props.onBlur?.(event);
			}}
			style={[
				{
					minHeight: 44,
					borderWidth: 1,
					borderColor: focused ? colors.ring : colors.input,
					borderRadius: theme.radius,
					paddingHorizontal: 12,
					paddingVertical: 10,
					fontSize: 16,
					color: colors.foreground,
					fontFamily: props.mono ? theme.mono : theme.font,
					backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'transparent',
				},
				props.multiline && { minHeight: 70, textAlignVertical: 'top' },
				style as StyleProp<TextStyle>,
			]}
		/>
	);
}

export function Field({
	label,
	optional,
	hint,
	error,
	children,
}: {
	label: string;
	optional?: boolean;
	hint?: ReactNode;
	error?: string | null;
	children: ReactNode;
}) {
	return (
		<View style={{ gap: 6 }}>
			<Text size={14} weight='medium'>
				{label}
				{optional && (
					<Text size={14} tone='muted'>
						{' '}
						(optional)
					</Text>
				)}
			</Text>
			{children}
			{hint ? (typeof hint === 'string' ? <Text size={12} tone='muted'>{hint}</Text> : hint) : null}
			{error ? (
				<Text size={12} tone='destructive' accessibilityRole='alert'>
					{error}
				</Text>
			) : null}
		</View>
	);
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
	const { theme } = useTheme();
	return (
		<View
			style={[
				{
					backgroundColor: theme.colors.card,
					borderColor: theme.colors.border,
					borderWidth: theme.id === 'retro' ? 2 : 1,
					borderRadius: theme.radius * 2.2,
					padding: 18,
					gap: 12,
				},
				style,
			]}
		>
			{children}
		</View>
	);
}

export function ErrorText({ children }: { children: ReactNode }) {
	if (!children) return null;
	return (
		<Text tone='destructive' size={14} accessibilityRole='alert'>
			{children}
		</Text>
	);
}

/** A native-feeling dropdown: a field that opens a list of choices. */
export function Select<T extends string>({
	value,
	options,
	onChange,
	disabled,
	placeholder,
	style,
	label,
}: {
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
	disabled?: boolean;
	placeholder?: string;
	style?: StyleProp<ViewStyle>;
	label: string;
}) {
	const { theme } = useTheme();
	const [open, setOpen] = useState(false);
	const current = options.find((option) => option.value === value);

	return (
		<>
			<Pressable
				accessibilityRole='button'
				accessibilityLabel={`${label}: ${current?.label ?? placeholder ?? ''}`}
				disabled={disabled}
				onPress={() => setOpen(true)}
				style={[
					{
						minHeight: 44,
						borderWidth: 1,
						borderColor: theme.colors.input,
						borderRadius: theme.radius,
						paddingHorizontal: 12,
						flexDirection: 'row',
						alignItems: 'center',
						gap: 8,
						opacity: disabled ? 0.5 : 1,
					},
					style,
				]}
			>
				<Text style={{ flex: 1 }} numberOfLines={1} tone={current ? 'default' : 'muted'}>
					{current?.label ?? placeholder}
				</Text>
				<ChevronDownIcon size={16} color={theme.colors.mutedForeground} />
			</Pressable>
			<Sheet open={open} onClose={() => setOpen(false)} title={label} scroll={false}>
				<FlatList
					data={options}
					keyExtractor={(option) => option.value}
					renderItem={({ item }) => (
						<Pressable
							onPress={() => {
								onChange(item.value);
								setOpen(false);
							}}
							style={({ pressed }) => ({
								flexDirection: 'row',
								alignItems: 'center',
								paddingVertical: 14,
								paddingHorizontal: 8,
								borderRadius: theme.radius,
								backgroundColor: pressed ? theme.colors.accent : 'transparent',
							})}
						>
							<Text style={{ flex: 1 }}>{item.label}</Text>
							{item.value === value && <CheckIcon size={18} color={theme.colors.foreground} />}
						</Pressable>
					)}
				/>
			</Sheet>
		</>
	);
}

/** A bottom sheet, standing in for the web app's upload modal. */
export function Sheet({
	open,
	onClose,
	title,
	description,
	children,
	footer,
	scroll = true,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	description?: string;
	children: ReactNode;
	footer?: ReactNode;
	scroll?: boolean;
}) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	return (
		<Modal visible={open} transparent animationType='slide' onRequestClose={onClose} statusBarTranslucent>
			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : undefined}
				style={{ flex: 1 }}
			>
				<Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel='Close' />
				<View
					style={{
						maxHeight: '92%',
						backgroundColor: theme.colors.popover,
						borderTopLeftRadius: 24,
						borderTopRightRadius: 24,
						borderColor: theme.colors.border,
						borderWidth: 1,
						paddingBottom: insets.bottom + 12,
					}}
				>
					<View style={styles.sheetHeader}>
						<View style={{ flex: 1, gap: 4 }}>
							<Text size={18} weight='semibold'>
								{title}
							</Text>
							{description ? (
								<Text size={14} tone='muted'>
									{description}
								</Text>
							) : null}
						</View>
						<Button icon={XIcon} variant='ghost' size='icon' accessibilityLabel='Close' onPress={onClose} />
					</View>
					{scroll ? (
						<ScrollView
							keyboardShouldPersistTaps='handled'
							contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 16 }}
						>
							{children}
						</ScrollView>
					) : (
						<View style={{ paddingHorizontal: 12, flexShrink: 1 }}>{children}</View>
					)}
					{footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
}

export function Loading({ label }: { label: string }) {
	const { theme } = useTheme();
	return (
		<View accessibilityRole='progressbar' style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 }}>
			<ActivityIndicator color={theme.colors.mutedForeground} />
			<Text tone='muted' size={14}>
				{label}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
	sheetHeader: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 12,
		paddingHorizontal: 20,
		paddingTop: 18,
		paddingBottom: 12,
	},
	sheetFooter: {
		flexDirection: 'row',
		justifyContent: 'flex-end',
		gap: 10,
		paddingHorizontal: 20,
		paddingTop: 12,
	},
});
