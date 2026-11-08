import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useApi, readJson } from '@/lib/api';
import { UNCATEGORIZED_NAME, byName, type Category } from '@/lib/labels';
import { Button, Field, Input, Select, Text } from './ui';

/** Choose a category from the shared list, add a new one, or leave it uncategorized. */
export function CategoryField({
	value,
	onChange,
	adding,
	onAddingChange,
}: {
	value: Category | null;
	onChange: (category: Category | null) => void;
	adding: boolean;
	onAddingChange: (adding: boolean) => void;
}) {
	const api = useApi();
	const [categories, setCategories] = useState<Category[] | null>(null);
	const [loadFailed, setLoadFailed] = useState(false);
	const [loadAttempt, setLoadAttempt] = useState(0);
	const [newName, setNewName] = useState('');
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	// Loaded each time the form opens, to pick up categories other people added.
	useEffect(() => {
		const controller = new AbortController();
		api('/api/v1/categories', { signal: controller.signal })
			.then(readJson)
			.then((result) => setCategories(result.categories))
			.catch(() => {
				if (!controller.signal.aborted) setLoadFailed(true);
			});
		return () => controller.abort();
	}, [api, loadAttempt]);

	async function addCategory() {
		setSaving(true);
		setSaveError(null);
		try {
			const result = await readJson(
				await api('/api/v1/categories', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: newName }),
				}),
			);
			const added: Category = result.category;
			setCategories((current) =>
				[...(current ?? []).filter((category) => category.id !== added.id), added].sort(byName),
			);
			onChange(added);
			setNewName('');
			onAddingChange(false);
		} catch (error) {
			setSaveError((error as Error).message);
		} finally {
			setSaving(false);
		}
	}

	if (loadFailed) {
		return (
			<Field label='Category'>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
					<Text tone='destructive' size={14}>
						Couldn&apos;t load categories.
					</Text>
					<Button
						title='Try again'
						variant='outline'
						size='sm'
						onPress={() => {
							setLoadFailed(false);
							setLoadAttempt((attempt) => attempt + 1);
						}}
					/>
				</View>
			</Field>
		);
	}

	if (adding) {
		return (
			<Field label='New category' error={saveError}>
				<Input
					autoFocus
					value={newName}
					maxLength={100}
					onChangeText={setNewName}
					returnKeyType='done'
					onSubmitEditing={() => newName.trim() && !saving && void addCategory()}
				/>
				<View style={{ flexDirection: 'row', gap: 8 }}>
					<Button
						title={saving ? 'Adding…' : 'Add'}
						size='sm'
						disabled={!newName.trim() || saving}
						onPress={() => void addCategory()}
					/>
					<Button
						title='Cancel'
						size='sm'
						variant='outline'
						onPress={() => {
							onAddingChange(false);
							setNewName('');
							setSaveError(null);
						}}
					/>
				</View>
			</Field>
		);
	}

	return (
		<Field label='Category'>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
				<Select
					label='Category'
					style={{ flex: 1 }}
					disabled={!categories}
					value={value?.id ?? ''}
					placeholder='Loading…'
					options={[
						{ value: '', label: categories ? UNCATEGORIZED_NAME : 'Loading…' },
						...(categories ?? []).map((category) => ({ value: category.id, label: category.name })),
					]}
					onChange={(id) => onChange(categories?.find((category) => category.id === id) ?? null)}
				/>
				<Button title='New' size='sm' variant='outline' onPress={() => onAddingChange(true)} />
			</View>
		</Field>
	);
}
