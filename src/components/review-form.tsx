import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { CSV_COLUMNS, todayLocal, type Alternatives, type Category, type Fields, type VialDetails } from '@/lib/labels';
import type { LocalMedia } from '@/lib/media';
import { CategoryField } from './category-field';
import { MediaPreview } from './media-preview';
import { Button, ErrorText, Field, Input, Sheet, Text } from './ui';

/** The review step for one read label, as a bottom sheet. */
export function ReviewSheet({
	open,
	media,
	fields: initialFields,
	alternatives = {},
	category: initialCategory,
	details: initialDetails = { name: '', description: '' },
	onCancel,
	onConfirm,
}: {
	open: boolean;
	media: LocalMedia;
	fields: Fields;
	alternatives?: Alternatives;
	category: Category | null;
	details?: VialDetails;
	onCancel: () => void;
	onConfirm: (fields: Fields, category: Category | null, details: VialDetails) => Promise<void>;
}) {
	const [fields, setFields] = useState<Fields>(initialFields);
	const [category, setCategory] = useState(initialCategory);
	const [details, setDetails] = useState(initialDetails);
	const [addingCategory, setAddingCategory] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	// Starts from the latest values each time the sheet opens.
	useEffect(() => {
		if (!open) return;
		setFields({ ...initialFields, dateReceived: initialFields.dateReceived || todayLocal() });
		setCategory(initialCategory);
		setDetails(initialDetails);
		setAddingCategory(false);
		setSaving(false);
		setSaveError(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	async function handleSubmit() {
		if (addingCategory || saving) return;
		setSaving(true);
		setSaveError(null);
		try {
			await onConfirm(fields, category, {
				name: details.name.trim(),
				description: details.description.trim(),
			});
		} catch (error) {
			setSaveError((error as Error).message);
		} finally {
			setSaving(false);
		}
	}

	return (
		<Sheet
			open={open}
			onClose={onCancel}
			title='Review label'
			description={`Check each value against the ${media.isVideo ? 'video' : 'photo'} and correct any mistakes.`}
			footer={
				<>
					<Button title='Cancel' variant='outline' onPress={onCancel} />
					{/* Disabled mid-add, so a half-typed category can't save as uncategorized. */}
					<Button
						title={saving ? 'Saving…' : 'Confirm'}
						disabled={addingCategory || saving}
						onPress={() => void handleSubmit()}
					/>
				</>
			}
		>
			{open && <MediaPreview media={media} height={200} />}
			<CategoryField
				value={category}
				onChange={setCategory}
				adding={addingCategory}
				onAddingChange={setAddingCategory}
			/>
			<Field label='Name' optional>
				<Input
					value={details.name}
					maxLength={100}
					placeholder='e.g. Pump 3 weekly sample'
					onChangeText={(name) => setDetails({ ...details, name })}
				/>
			</Field>
			<Field label='Description' optional>
				<Input
					value={details.description}
					maxLength={1000}
					multiline
					placeholder='Notes about this vial'
					onChangeText={(description) => setDetails({ ...details, description })}
				/>
			</Field>
			<Text size={12} tone='muted'>
				Name and description are kept in the inventory, not the CSV.
			</Text>
			<View style={{ gap: 14 }}>
				{CSV_COLUMNS.map(({ name, label }) => (
					<Field
						key={name}
						label={label}
						hint={
							alternatives[name] ? (
								<Text size={12} tone='warning'>
									Video frames disagreed. Also read: {alternatives[name]!.join(', ')}
								</Text>
							) : undefined
						}
					>
						<Input
							mono
							value={fields[name] ?? ''}
							autoCapitalize='none'
							onChangeText={(text) => setFields({ ...fields, [name]: text })}
						/>
					</Field>
				))}
			</View>
			<ErrorText>{saveError}</ErrorText>
		</Sheet>
	);
}
