import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, Linking, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
	ArrowLeftIcon,
	CameraIcon,
	ChevronDownIcon,
	DownloadIcon,
	ExternalLinkIcon,
	FolderIcon,
	ImageIcon,
	PlusIcon,
	SearchIcon,
	Trash2Icon,
	UploadIcon,
	XIcon,
} from 'lucide-react-native';
import { Button, Card, ErrorText, Field, Input, Loading, Select, Sheet, Text } from '@/components/ui';
import { useToast } from '@/components/toast';
import { readJson, useApi } from '@/lib/api';
import {
	CSV_COLUMNS,
	UNCATEGORIZED_ID,
	UNCATEGORIZED_NAME,
	byName,
	toCsvFileName,
	type Category,
	type Vial,
} from '@/lib/labels';
import { shareCsv } from '@/lib/media';
import { deleteVial } from '@/lib/vials';
import { useTheme } from '@/lib/theme';

type Group = { id: string; name: string; vials: Vial[] };

function vialTitle(vial: Vial) {
	return vial.name || vial.fields.sampleId || vial.fileName || `Vial #${vial.id}`;
}

function vialSubtitle(vial: Vial) {
	return [vial.fields.machine, vial.fields.component].filter(Boolean).join(' · ') || vial.labelType || 'No machine recorded';
}

function formatDate(value: string, withTime = false) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		...(withTime && { hour: 'numeric', minute: '2-digit' }),
	});
}

function matches(vial: Vial, query: string) {
	if (!query) return true;
	const haystack = [
		...Object.values(vial.fields),
		vial.labelType,
		vial.fileName,
		vial.categoryName,
		vial.name,
		vial.description,
		vial.createdByName,
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
	return query
		.toLowerCase()
		.split(/\s+/)
		.every((word) => haystack.includes(word));
}

/** Downloads a category's CSV from the server and opens the share sheet. */
function useExportCsv() {
	const api = useApi();
	const toast = useToast();
	return async (categoryId: string, name: string) => {
		try {
			const response = await api(`/api/v1/categories/${categoryId}/csv`, { headers: { Accept: 'text/csv' } });
			if (!response.ok) await readJson(response);
			const csv = await response.text();
			await shareCsv(toCsvFileName(name) ?? `category-${categoryId}.csv`, csv);
		} catch (error) {
			toast.error((error as Error).message);
		}
	};
}

export default function InventoryScreen() {
	const api = useApi();
	const toast = useToast();
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const exportCsv = useExportCsv();
	const params = useLocalSearchParams<{ q?: string }>();

	const [query, setQuery] = useState(params.q ?? '');
	const [categories, setCategories] = useState<Category[] | null>(null);
	const [vials, setVials] = useState<Vial[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [refreshing, setRefreshing] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
	const [addingCategory, setAddingCategory] = useState(false);

	// A search from the home screen.
	useEffect(() => {
		if (params.q !== undefined) {
			setQuery(params.q);
			setSelectedId(null);
		}
	}, [params.q]);

	const load = useCallback(async () => {
		try {
			const [categoryData, vialData] = await Promise.all([
				api('/api/v1/categories').then(readJson),
				api('/api/v1/vials').then(readJson),
			]);
			setCategories(categoryData.categories);
			setVials(vialData.vials);
			setLoadError(null);
		} catch (error) {
			setLoadError((error as Error).message);
		}
	}, [api]);

	// Refreshed each time the tab opens, to pick up vials just saved.
	useFocusEffect(
		useCallback(() => {
			void load();
		}, [load]),
	);

	// Android's back button returns from a vial to the list.
	useFocusEffect(
		useCallback(() => {
			if (!selectedId) return;
			const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
				setSelectedId(null);
				return true;
			});
			return () => subscription.remove();
		}, [selectedId]),
	);

	const groups = useMemo<Group[]>(() => {
		if (!categories || !vials) return [];
		const q = query.trim();
		const visible = vials.filter((vial) => matches(vial, q)).sort((a, b) => Number(b.id) - Number(a.id));
		const list: Group[] = categories.map((category) => ({
			...category,
			vials: visible.filter((vial) => vial.categoryId === category.id),
		}));
		const uncategorized = visible.filter((vial) => vial.categoryId === null);
		if (uncategorized.length > 0) list.push({ id: UNCATEGORIZED_ID, name: UNCATEGORIZED_NAME, vials: uncategorized });
		return q ? list.filter((group) => group.vials.length > 0) : list;
	}, [categories, vials, query]);

	const selected = vials?.find((vial) => vial.id === selectedId) ?? null;
	const matchCount = groups.reduce((sum, group) => sum + group.vials.length, 0);
	const loading = !loadError && (!categories || !vials);

	async function moveVial(vial: Vial, categoryId: string) {
		try {
			const data = await readJson(
				await api(`/api/v1/vials/${vial.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ categoryId: categoryId || null }),
				}),
			);
			setVials((current) => current?.map((item) => (item.id === data.vial.id ? data.vial : item)) ?? null);
			toast.success(`Moved to ${data.vial.categoryName}`);
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	function confirmDelete(vial: Vial) {
		Alert.alert(`Delete ${vialTitle(vial)}?`, "This can't be undone.", [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: async () => {
					try {
						await deleteVial(api, vial.id);
						setVials((current) => current?.filter((item) => item.id !== vial.id) ?? null);
						setSelectedId(null);
						toast.success('Vial deleted');
					} catch (error) {
						toast.error((error as Error).message);
					}
				},
			},
		]);
	}

	function toggleGroup(id: string) {
		setCollapsed((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	if (selected && categories) {
		return (
			<VialDetails
				vial={selected}
				categories={categories}
				onBack={() => setSelectedId(null)}
				onMove={(categoryId) => void moveVial(selected, categoryId)}
				onDelete={() => confirmDelete(selected)}
				onExport={() => void exportCsv(selected.categoryId ?? UNCATEGORIZED_ID, selected.categoryName)}
			/>
		);
	}

	return (
		<View style={{ flex: 1, backgroundColor: theme.colors.background }}>
			<View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 8, gap: 12 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
					<View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
						<Text size={22} weight='semibold'>
							Inventory
						</Text>
						{vials && (
							<Text size={14} tone='muted'>
								{vials.length} {vials.length === 1 ? 'vial' : 'vials'}
							</Text>
						)}
					</View>
					<Button title='Category' icon={PlusIcon} size='sm' variant='outline' onPress={() => setAddingCategory(true)} />
				</View>

				<View
					style={{
						flexDirection: 'row',
						alignItems: 'center',
						gap: 8,
						borderRadius: 999,
						borderWidth: 1,
						borderColor: theme.colors.border,
						backgroundColor: theme.colors.card,
						paddingHorizontal: 16,
					}}
				>
					<SearchIcon size={16} color={theme.colors.mutedForeground} />
					<TextInput
						value={query}
						onChangeText={setQuery}
						placeholder='Search vials'
						placeholderTextColor={theme.colors.mutedForeground}
						autoCorrect={false}
						returnKeyType='search'
						accessibilityLabel='Search vials'
						style={{ flex: 1, height: 42, fontSize: 15, color: theme.colors.foreground, fontFamily: theme.font }}
					/>
					{query ? (
						<Pressable onPress={() => setQuery('')} accessibilityLabel='Clear search' hitSlop={8}>
							<XIcon size={16} color={theme.colors.mutedForeground} />
						</Pressable>
					) : null}
				</View>
			</View>

			<ScrollView
				keyboardShouldPersistTaps='handled'
				contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 24 }}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						tintColor={theme.colors.mutedForeground}
						onRefresh={async () => {
							setRefreshing(true);
							await load();
							setRefreshing(false);
						}}
					/>
				}
			>
				{loading && <Loading label='Loading inventory…' />}

				{loadError && (
					<View style={{ gap: 12, padding: 12, alignItems: 'flex-start' }}>
						<ErrorText>{loadError}</ErrorText>
						<Button title='Try again' variant='outline' size='sm' onPress={() => void load()} />
					</View>
				)}

				{!loading && !loadError && query.trim() && matchCount === 0 && (
					<Text tone='muted' size={14} style={{ padding: 12 }}>
						No vials match “{query.trim()}”.
					</Text>
				)}

				{!loading && !loadError && !query.trim() && vials?.length === 0 && (
					<View style={{ gap: 12, padding: 12 }}>
						<Text tone='muted' size={14}>
							No vials yet. Scan or upload a label to add one.
						</Text>
						<View style={{ flexDirection: 'row', gap: 8 }}>
							<Button title='Scan' icon={CameraIcon} variant='outline' size='sm' onPress={() => router.navigate('/camera')} />
							<Button title='Upload' icon={UploadIcon} variant='outline' size='sm' onPress={() => router.navigate('/upload')} />
						</View>
					</View>
				)}

				{groups.map((group) => {
					const isOpen = !collapsed.has(group.id) || Boolean(query.trim());
					return (
						<View key={group.id} style={{ marginTop: 12 }}>
							<View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 4 }}>
								<Pressable
									onPress={() => toggleGroup(group.id)}
									accessibilityRole='button'
									accessibilityState={{ expanded: isOpen }}
									style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}
								>
									<ChevronDownIcon
										size={14}
										color={theme.colors.mutedForeground}
										style={{ transform: [{ rotate: isOpen ? '0deg' : '-90deg' }] }}
									/>
									<Text size={13} weight='medium' tone='muted' numberOfLines={1} style={{ flexShrink: 1 }}>
										{group.name}
									</Text>
									<Text size={13} tone='muted' style={{ opacity: 0.7 }}>
										{group.vials.length}
									</Text>
								</Pressable>
								{group.vials.length > 0 && (
									<Button
										icon={DownloadIcon}
										size='icon'
										variant='ghost'
										accessibilityLabel={`Export ${group.name} as CSV`}
										onPress={() => void exportCsv(group.id, group.name)}
									/>
								)}
							</View>

							{isOpen && group.vials.length === 0 && (
								<Text size={12} tone='muted' style={{ paddingHorizontal: 12, paddingVertical: 6, opacity: 0.7 }}>
									No vials yet
								</Text>
							)}
							{isOpen &&
								group.vials.map((vial) => (
									<Pressable
										key={vial.id}
										onPress={() => setSelectedId(vial.id)}
										style={({ pressed }) => ({
											flexDirection: 'row',
											alignItems: 'center',
											gap: 12,
											paddingHorizontal: 12,
											paddingVertical: 10,
											borderRadius: 14,
											backgroundColor: pressed ? theme.colors.accent : 'transparent',
										})}
									>
										<View style={{ flex: 1, minWidth: 0 }}>
											<Text size={15} numberOfLines={1}>
												{vialTitle(vial)}
											</Text>
											<Text size={12} tone='muted' numberOfLines={1}>
												{vialSubtitle(vial)}
											</Text>
										</View>
										<Text size={11} tone='muted'>
											{formatDate(vial.scannedAt ?? vial.createdAt)}
										</Text>
									</Pressable>
								))}
						</View>
					);
				})}
			</ScrollView>

			<NewCategorySheet
				open={addingCategory}
				onClose={() => setAddingCategory(false)}
				onAdded={(category) =>
					setCategories((current) => [...(current ?? []).filter((item) => item.id !== category.id), category].sort(byName))
				}
			/>
		</View>
	);
}

function VialDetails({
	vial,
	categories,
	onBack,
	onMove,
	onDelete,
	onExport,
}: {
	vial: Vial;
	categories: Category[];
	onBack: () => void;
	onMove: (categoryId: string) => void;
	onDelete: () => void;
	onExport: () => void;
}) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const fromVideo = /\.(mp4|webm|mov|m4v)$/i.test(vial.fileName ?? '');
	const mediaHeading = fromVideo ? 'Still from the video' : 'Original photo';

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: theme.colors.background }}
			contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, gap: 20 }}
		>
			<View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
				<Button icon={ArrowLeftIcon} variant='ghost' size='icon' accessibilityLabel='Back to the list' onPress={onBack} />
				<View style={{ flex: 1, minWidth: 0 }}>
					<Text size={12} tone='muted'>
						{vial.categoryName}
						{vial.labelType ? ` · ${vial.labelType} label` : ''}
					</Text>
					<Text size={24} weight='semibold' numberOfLines={2}>
						{vialTitle(vial)}
					</Text>
					{vial.name && vial.fields.sampleId ? (
						<Text size={14} tone='muted' mono numberOfLines={1}>
							{vial.fields.sampleId}
						</Text>
					) : null}
				</View>
			</View>

			{vial.description ? <Text size={14}>{vial.description}</Text> : null}

			<View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 32, rowGap: 12 }}>
				{[
					{ label: 'Scanned', value: vial.scannedAt ? formatDate(vial.scannedAt, true) : null, empty: 'Not recorded' },
					{ label: 'Added by', value: vial.createdByName, empty: 'Unknown' },
					{ label: 'Added', value: formatDate(vial.createdAt, true), empty: '' },
				].map(({ label, value, empty }) => (
					<View key={label} style={{ gap: 2 }}>
						<Text size={12} tone='muted'>
							{label}
						</Text>
						<Text size={14} tone={value ? 'default' : 'muted'}>
							{value || empty}
						</Text>
					</View>
				))}
			</View>

			<Card style={{ padding: 14 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
						<ImageIcon size={16} color={theme.colors.mutedForeground} />
						<Text size={14} weight='medium'>
							{mediaHeading}
						</Text>
					</View>
					{vial.media && (
						<Pressable onPress={() => void Linking.openURL(vial.media!.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} hitSlop={8}>
							<Text size={12} tone='muted'>
								Open
							</Text>
							<ExternalLinkIcon size={14} color={theme.colors.mutedForeground} />
						</Pressable>
					)}
				</View>
				{vial.media ? (
					<Image
						key={vial.media.url}
						source={{ uri: vial.media.url }}
						contentFit='contain'
						transition={150}
						accessibilityLabel={`${mediaHeading} of ${vialTitle(vial)}`}
						style={{ width: '100%', height: 280, borderRadius: 16, backgroundColor: theme.colors.muted }}
					/>
				) : (
					<Text size={14} tone='muted' style={{ paddingHorizontal: 4 }}>
						No photo was kept for this vial.
					</Text>
				)}
			</Card>

			<View style={{ borderRadius: theme.radius * 2.2, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden', gap: 1, backgroundColor: theme.colors.border }}>
				{CSV_COLUMNS.map(({ name, label }) => (
					<View key={name} style={{ backgroundColor: theme.colors.card, paddingHorizontal: 18, paddingVertical: 12, gap: 2 }}>
						<Text size={12} tone='muted'>
							{label}
						</Text>
						<Text size={14} mono tone={vial.fields[name] ? 'default' : 'muted'} selectable>
							{vial.fields[name] || '—'}
						</Text>
					</View>
				))}
			</View>

			<Card>
				<Field label='Category'>
					<Select
						label='Move to category'
						value={vial.categoryId ?? ''}
						onChange={onMove}
						options={[
							{ value: '', label: UNCATEGORIZED_NAME },
							...categories.map((category) => ({ value: category.id, label: category.name })),
						]}
					/>
				</Field>
				<View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
					<Button title='Export category' icon={DownloadIcon} variant='outline' size='sm' onPress={onExport} />
					<Button title='Delete' icon={Trash2Icon} variant='destructive' size='sm' onPress={onDelete} />
				</View>
				{vial.fileName ? (
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
						<FolderIcon size={14} color={theme.colors.mutedForeground} />
						<Text size={12} tone='muted' numberOfLines={1}>
							From {vial.fileName}
						</Text>
					</View>
				) : null}
			</Card>
		</ScrollView>
	);
}

function NewCategorySheet({
	open,
	onClose,
	onAdded,
}: {
	open: boolean;
	onClose: () => void;
	onAdded: (category: Category) => void;
}) {
	const api = useApi();
	const toast = useToast();
	const [name, setName] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function close() {
		setName('');
		setError(null);
		onClose();
	}

	async function submit() {
		setSaving(true);
		setError(null);
		try {
			const data = await readJson(
				await api('/api/v1/categories', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name }),
				}),
			);
			onAdded(data.category);
			toast.success(`Added ${data.category.name}`);
			close();
		} catch (caught) {
			setError((caught as Error).message);
		} finally {
			setSaving(false);
		}
	}

	return (
		<Sheet
			open={open}
			onClose={close}
			title='New category'
			footer={
				<>
					<Button title='Cancel' variant='outline' onPress={close} />
					<Button title={saving ? 'Adding…' : 'Add'} disabled={!name.trim() || saving} onPress={() => void submit()} />
				</>
			}
		>
			<Field label='Name' error={error}>
				<Input autoFocus value={name} maxLength={100} onChangeText={setName} returnKeyType='done' onSubmitEditing={() => name.trim() && void submit()} />
			</Field>
		</Sheet>
	);
}
