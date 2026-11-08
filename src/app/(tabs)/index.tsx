import { useState } from 'react';
import { LayoutAnimation, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import {
	ArchiveIcon,
	ArrowUpIcon,
	CameraIcon,
	ChevronDownIcon,
	ImageIcon,
	SearchIcon,
	UploadIcon,
	type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '@/components/screen';
import { Button, Card, ErrorText, Field, Heading, Input, Loading, Text } from '@/components/ui';
import { MediaPreview } from '@/components/media-preview';
import { useToast } from '@/components/toast';
import { useApi } from '@/lib/api';
import { CSV_COLUMNS, buildCsv, emptyFields, toCsvFileName, todayLocal, type Fields } from '@/lib/labels';
import { readLabel, shareCsv, type LocalMedia } from '@/lib/media';
import { pickMedia, takePhoto } from '@/lib/pick';
import { useTheme } from '@/lib/theme';

const ACTIONS: { href: '/camera' | '/upload' | '/inventory'; label: string; icon: LucideIcon }[] = [
	{ href: '/camera', label: 'Scan with camera', icon: CameraIcon },
	{ href: '/upload', label: 'Upload labels', icon: UploadIcon },
	{ href: '/inventory', label: 'Browse inventory', icon: ArchiveIcon },
];

/** The prompt box: searching opens the inventory filtered by the query. */
function HomeComposer() {
	const { theme } = useTheme();
	const [query, setQuery] = useState('');

	function submit() {
		const q = query.trim();
		router.navigate(q ? { pathname: '/inventory', params: { q } } : '/inventory');
		setQuery('');
	}

	return (
		<View style={{ gap: 16, width: '100%' }}>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					gap: 8,
					borderRadius: 28,
					borderWidth: 1,
					borderColor: theme.colors.border,
					backgroundColor: theme.colors.card,
					padding: 6,
					paddingLeft: 18,
					shadowColor: '#000',
					shadowOpacity: theme.dark ? 0.35 : 0.08,
					shadowRadius: 20,
					shadowOffset: { width: 0, height: 8 },
					elevation: 6,
				}}
			>
				<SearchIcon size={20} color={theme.colors.mutedForeground} />
				<TextInput
					value={query}
					onChangeText={setQuery}
					placeholder='Search vials by sample ID, machine, lube…'
					placeholderTextColor={theme.colors.mutedForeground}
					returnKeyType='search'
					onSubmitEditing={submit}
					autoCorrect={false}
					accessibilityLabel='Search the inventory'
					style={{ flex: 1, height: 44, fontSize: 16, color: theme.colors.foreground, fontFamily: theme.font }}
				/>
				<Pressable
					onPress={submit}
					accessibilityLabel='Search'
					style={{
						width: 42,
						height: 42,
						borderRadius: 21,
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: theme.colors.foreground,
					}}
				>
					<ArrowUpIcon size={20} color={theme.colors.background} />
				</Pressable>
			</View>

			<View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
				{ACTIONS.map(({ href, label, icon }) => (
					<Button key={href} title={label} icon={icon} variant='outline' size='sm' onPress={() => router.navigate(href)} />
				))}
			</View>
		</View>
	);
}

/** Read one label and share it as a CSV. Nothing is saved. */
function QuickRead() {
	const api = useApi();
	const toast = useToast();
	const [media, setMedia] = useState<LocalMedia | null>(null);
	const [fields, setFields] = useState<Fields | null>(null);
	const [labelType, setLabelType] = useState<string | null>(null);
	const [fileName, setFileName] = useState('');
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function read(next: LocalMedia | null) {
		if (!next) return;
		setMedia(next);
		setFields(null);
		setLabelType(null);
		setError(null);
		setStatus(next.isVideo ? 'Reading the video…' : 'Reading label…');
		try {
			const result = await readLabel(api, next);
			setLabelType(result.labelType);
			setFields({ ...emptyFields(), ...result.fields, dateReceived: todayLocal() });
		} catch (caught) {
			setError((caught as Error).message || 'Could not read the label');
		} finally {
			setStatus(null);
		}
	}

	async function choose(source: 'library' | 'camera') {
		try {
			await read(source === 'camera' ? await takePhoto() : (await pickMedia())[0] ?? null);
		} catch (caught) {
			setError((caught as Error).message);
		}
	}

	async function share() {
		const name = toCsvFileName(fileName);
		if (!fields || !name) {
			setError('Enter a valid file name.');
			return;
		}
		setError(null);
		try {
			await shareCsv(name, buildCsv(fields));
		} catch (caught) {
			toast.error((caught as Error).message);
		}
	}

	return (
		<View style={{ gap: 16 }}>
			<View style={{ flexDirection: 'row', gap: 8 }}>
				<Button title='Take photo' icon={CameraIcon} variant='outline' disabled={!!status} onPress={() => void choose('camera')} style={{ flex: 1 }} />
				<Button title='Choose file' icon={ImageIcon} variant='outline' disabled={!!status} onPress={() => void choose('library')} style={{ flex: 1 }} />
			</View>
			{media && <MediaPreview media={media} height={200} />}
			{status && <Loading label={status} />}
			<ErrorText>{error}</ErrorText>
			{fields && (
				<View style={{ gap: 14 }}>
					<Text size={14} tone='muted'>
						{labelType ? `Detected a ${labelType} label. ` : ''}Check each value against the{' '}
						{media?.isVideo ? 'video' : 'photo'} and correct any mistakes. Empty fields stay empty in the CSV.
					</Text>
					{CSV_COLUMNS.map(({ name, label }) => (
						<Field key={name} label={label}>
							<Input mono value={fields[name]} autoCapitalize='none' onChangeText={(text) => setFields({ ...fields, [name]: text })} />
						</Field>
					))}
					<Field label='CSV file name'>
						<Input value={fileName} onChangeText={setFileName} autoCapitalize='none' />
					</Field>
					<Button title='Share CSV' onPress={() => void share()} style={{ alignSelf: 'flex-start' }} />
				</View>
			)}
		</View>
	);
}

export default function HomeScreen() {
	const { theme } = useTheme();
	const [open, setOpen] = useState(false);

	return (
		<Screen contentStyle={{ flexGrow: 1 }}>
			<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 28, paddingVertical: 32 }}>
				<View style={{ alignItems: 'center', gap: 8 }}>
					<Heading size={28}>What are we reading today?</Heading>
					<Text tone='muted' style={{ textAlign: 'center' }}>
						Scan a sample label, upload a batch, or find a vial.
					</Text>
				</View>
				<HomeComposer />
			</View>

			<Card style={{ padding: 0, gap: 0 }}>
				<Pressable
					accessibilityRole='button'
					accessibilityState={{ expanded: open }}
					onPress={() => {
						LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
						setOpen(!open);
					}}
					style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18 }}
				>
					<View style={{ flex: 1, gap: 2 }}>
						<Text weight='medium'>Quick read</Text>
						<Text size={14} tone='muted'>
							Read one label and share it as a CSV. Nothing is saved.
						</Text>
					</View>
					<ChevronDownIcon
						size={20}
						color={theme.colors.mutedForeground}
						style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
					/>
				</Pressable>
				{open && (
					<View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, padding: 18 }}>
						<QuickRead />
					</View>
				)}
			</Card>
		</Screen>
	);
}
