import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { CheckIcon, CircleAlertIcon, FilmIcon, ImagePlusIcon, RotateCwIcon, ScanTextIcon, XIcon } from 'lucide-react-native';
import { Screen } from '@/components/screen';
import { Button, Heading, Text } from '@/components/ui';
import { ReviewSheet } from '@/components/review-form';
import { useToast } from '@/components/toast';
import { useApi, type ApiFetch } from '@/lib/api';
import { UNCATEGORIZED_NAME, emptyFields, type Category, type Fields, type VialDetails } from '@/lib/labels';
import { MAX_BYTES, readLabel, stillFor, uploadVialMedia, type LocalMedia, type UploadedMedia } from '@/lib/media';
import { pickMedia } from '@/lib/pick';
import { deleteVial, saveVial } from '@/lib/vials';
import { useTheme } from '@/lib/theme';

const MAX_FILES = 20;

type LabelRead = {
	fields: Fields;
	labelType: string | null;
	category: Category | null;
	/** The saved row, once confirmed. Editing updates it rather than adding another. */
	vialId: string | null;
	scannedAt: string;
	details: VialDetails;
	/** That still's copy in Cloudinary, once uploaded. Kept so a retry doesn't upload it twice. */
	media: UploadedMedia | null;
};

type RowStatus = 'queued' | 'reading' | 'ready' | 'confirmed' | 'failed';

type Item = {
	id: string;
	media: LocalMedia;
	status: RowStatus;
	error?: string;
	label?: LabelRead;
};

const STATUS_TEXT: Record<Exclude<RowStatus, 'failed'>, string> = {
	queued: 'Queued',
	reading: 'Reading…',
	ready: 'Ready to confirm',
	confirmed: 'Confirmed',
};

async function read(api: ApiFetch, media: LocalMedia): Promise<LabelRead> {
	const result = await readLabel(api, media);
	return {
		fields: { ...emptyFields(), ...result.fields, dateReceived: '' },
		labelType: result.labelType,
		category: null,
		vialId: null,
		scannedAt: new Date().toISOString(),
		details: { name: '', description: '' },
		media: null,
	};
}

function StatusDot({ status }: { status: RowStatus }) {
	const { theme } = useTheme();
	if (status === 'failed') return <CircleAlertIcon size={14} color={theme.colors.destructive} />;
	if (status === 'confirmed') {
		return (
			<View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center' }}>
				<CheckIcon size={10} color='#fff' strokeWidth={3} />
			</View>
		);
	}
	const color = { queued: '#ef4444', reading: '#facc15', ready: '#22c55e' }[status];
	return <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />;
}

/** The photo, or the opening frame of the video. */
function Snapshot({ media }: { media: LocalMedia }) {
	const { theme } = useTheme();
	const [uri, setUri] = useState<string | null>(media.isVideo ? null : media.uri);

	useEffect(() => {
		if (!media.isVideo) return;
		let cancelled = false;
		VideoThumbnails.getThumbnailAsync(media.uri, { time: 100, quality: 0.5 })
			.then((result) => !cancelled && setUri(result.uri))
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [media]);

	return (
		<View
			style={{
				width: 80,
				aspectRatio: 4 / 3,
				borderRadius: theme.radius,
				borderWidth: 1,
				borderColor: theme.colors.border,
				backgroundColor: theme.colors.muted,
				overflow: 'hidden',
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			{uri ? (
				<Image source={{ uri }} contentFit='cover' style={{ width: '100%', height: '100%' }} />
			) : (
				<FilmIcon size={22} color={theme.colors.mutedForeground} />
			)}
		</View>
	);
}

function LabelRow({
	item,
	onReview,
	onRetry,
	onRemove,
	onDelete,
}: {
	item: Item;
	onReview: () => void;
	onRetry: () => void;
	onRemove: () => void;
	onDelete: () => void;
}) {
	const { theme } = useTheme();
	const { status, label } = item;
	const canReview = status === 'ready' || status === 'confirmed';
	const statusText =
		status === 'failed'
			? (item.error ?? 'Could not read the label')
			: status === 'confirmed'
				? `Confirmed · ${label?.category?.name ?? UNCATEGORIZED_NAME}`
				: STATUS_TEXT[status];

	return (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: 12,
				padding: 12,
				borderRadius: 24,
				borderWidth: 1,
				borderColor: theme.colors.border,
				backgroundColor: theme.colors.card,
			}}
		>
			<StatusDot status={status} />
			<Snapshot media={item.media} />
			<View style={{ flex: 1, gap: 2, minWidth: 0 }}>
				<Text size={12} weight='medium' tone={status === 'failed' ? 'destructive' : 'default'} numberOfLines={2} accessibilityLiveRegion='polite'>
					{statusText}
				</Text>
				<Text size={12} tone='muted' numberOfLines={1}>
					{item.media.name}
				</Text>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
					<Button
						title={status === 'confirmed' ? 'Edit' : 'Confirm'}
						size='sm'
						variant={status === 'confirmed' ? 'outline' : 'confirm'}
						disabled={!canReview}
						onPress={onReview}
					/>
					{status === 'failed' && (
						<Button icon={RotateCwIcon} size='icon' variant='ghost' accessibilityLabel={`Retry ${item.media.name}`} onPress={onRetry} />
					)}
					<Button
						icon={XIcon}
						size='icon'
						variant='ghost'
						accessibilityLabel={`${label?.vialId ? 'Delete' : 'Remove'} ${item.media.name}`}
						onPress={label?.vialId ? onDelete : onRemove}
					/>
				</View>
			</View>
		</View>
	);
}

export default function UploadScreen() {
	const api = useApi();
	const toast = useToast();
	const { theme } = useTheme();
	const [items, setItems] = useState<Item[]>([]);
	const [reviewingId, setReviewingId] = useState<string | null>(null);
	const nextId = useRef(1);
	const readingRef = useRef<string | null>(null);

	function update(id: string, patch: Partial<Item>) {
		setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
	}

	// Reads one file at a time, in the order they were added.
	useEffect(() => {
		if (readingRef.current) return;
		const next = items.find((item) => item.status === 'queued');
		if (!next) return;
		readingRef.current = next.id;
		update(next.id, { status: 'reading', error: undefined });
		read(api, next.media)
			.then((label) => update(next.id, { status: 'ready', label }))
			.catch((error: Error) => update(next.id, { status: 'failed', error: error.message }))
			.finally(() => {
				readingRef.current = null;
				// Kicks the effect so the next queued file starts.
				setItems((current) => [...current]);
			});
	}, [items, api]);

	async function addFiles() {
		const room = MAX_FILES - items.length;
		if (room <= 0) {
			toast.warning(`Up to ${MAX_FILES} files at a time`, { description: 'Remove some to add more.' });
			return;
		}
		let picked: LocalMedia[];
		try {
			picked = await pickMedia({ multiple: true, limit: room });
		} catch (error) {
			toast.error((error as Error).message);
			return;
		}
		const added: Item[] = picked.slice(0, room).map((media) => {
			const tooBig = media.size != null && media.size > MAX_BYTES;
			return {
				id: String(nextId.current++),
				media,
				status: tooBig ? 'failed' : 'queued',
				error: tooBig ? 'File must be 50 MB or smaller' : undefined,
			};
		});
		setItems((current) => [...current, ...added]);
	}

	async function handleConfirm(item: Item, fields: Fields, category: Category | null, details: VialDetails) {
		const label = item.label;
		if (!label) return;

		// Keep the still the first time it's saved. If that fails, the label values still save.
		let media = label.media;
		let mediaError: string | null = null;
		if (!label.vialId && !media) {
			try {
				media = await uploadVialMedia(api, await stillFor(item.media), item.media.name);
				update(item.id, { label: { ...label, media } });
			} catch (error) {
				mediaError = (error as Error).message;
			}
		}

		const vial = await saveVial(api, {
			vialId: label.vialId,
			fields,
			category,
			details,
			labelType: label.labelType,
			fileName: item.media.name,
			scannedAt: label.scannedAt,
			media,
		});
		update(item.id, {
			status: 'confirmed',
			label: { ...label, fields, category, vialId: vial.id, details, media },
		});
		setReviewingId(null);
		if (mediaError) {
			toast.warning('Label saved without its photo', {
				description: `The photo of ${item.media.name} couldn't be stored: ${mediaError}`,
			});
		} else {
			toast.success('Label confirmed', {
				description: item.media.name,
				action: { label: 'View inventory', onPress: () => router.navigate('/inventory') },
			});
		}
	}

	function confirmDelete(item: Item) {
		const vialId = item.label?.vialId;
		if (!vialId) return;
		Alert.alert('Delete this vial?', `${item.media.name} will be permanently removed from the database. This can't be undone.`, [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: async () => {
					try {
						await deleteVial(api, vialId);
						setItems((current) => current.filter((row) => row.id !== item.id));
						toast.success('Vial deleted', { description: item.media.name });
					} catch {
						toast.error('Could not delete the vial', {
							description: `${item.media.name} is still saved. Please try again.`,
						});
					}
				},
			},
		]);
	}

	const reviewing = items.find((item) => item.id === reviewingId);

	return (
		<Screen>
			<View style={{ gap: 4 }}>
				<Heading size={24}>Upload labels</Heading>
				<Text tone='muted'>Add photos or videos of sample labels, check what was read, and save them to your inventory.</Text>
			</View>

			<Pressable
				onPress={() => void addFiles()}
				accessibilityRole='button'
				accessibilityLabel='Add label photos or videos'
				style={({ pressed }) => ({
					alignItems: 'center',
					gap: 10,
					paddingVertical: 32,
					paddingHorizontal: 20,
					borderRadius: 24,
					borderWidth: 1.5,
					borderStyle: 'dashed',
					borderColor: theme.colors.input,
					backgroundColor: pressed ? theme.colors.accent : 'transparent',
				})}
			>
				<View
					style={{
						width: 48,
						height: 48,
						borderRadius: 14,
						borderWidth: 1,
						borderColor: theme.colors.border,
						backgroundColor: theme.colors.muted,
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<ScanTextIcon size={22} color={theme.colors.foreground} />
				</View>
				<Text weight='medium'>Choose label photos or videos</Text>
				<Text size={13} tone='muted' style={{ textAlign: 'center' }}>
					Labels are read one at a time, in the order you add them
				</Text>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
					<ImagePlusIcon size={16} color={theme.colors.mutedForeground} />
					<Text size={12} tone='muted'>
						Up to {MAX_FILES} files, 50 MB each
					</Text>
				</View>
			</Pressable>

			<View style={{ gap: 12 }}>
				{items.map((item) => (
					<LabelRow
						key={item.id}
						item={item}
						onReview={() => setReviewingId(item.id)}
						onRetry={() => update(item.id, { status: 'queued', error: undefined })}
						onRemove={() => setItems((current) => current.filter((row) => row.id !== item.id))}
						onDelete={() => confirmDelete(item)}
					/>
				))}
			</View>

			{reviewing?.label && (
				<ReviewSheet
					open
					media={reviewing.media}
					fields={reviewing.label.fields}
					category={reviewing.label.category}
					details={reviewing.label.details}
					onCancel={() => setReviewingId(null)}
					onConfirm={(fields, category, details) => handleConfirm(reviewing, fields, category, details)}
				/>
			)}
		</Screen>
	);
}
