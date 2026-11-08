import { readJson, type ApiFetch } from './api';
import type { Category, Fields, Vial, VialDetails } from './labels';
import type { UploadedMedia } from './media';

/** Adds a vial, or replaces one when vialId is given. Returns the saved vial. */
export async function saveVial(
	api: ApiFetch,
	{
		vialId,
		fields,
		category,
		details,
		labelType,
		fileName,
		scannedAt,
		media,
	}: {
		vialId?: string | null;
		fields: Fields;
		category: Category | null;
		details: VialDetails;
		labelType: string | null;
		fileName: string | null;
		scannedAt: string;
		media: UploadedMedia | null;
	},
): Promise<Vial> {
	const data = await readJson<{ vial: Vial }>(
		await api(`/api/v1/vials${vialId ? `/${vialId}` : ''}`, {
			method: vialId ? 'PUT' : 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				categoryId: category?.id ?? null,
				fields,
				labelType,
				fileName: fileName?.slice(0, 255) ?? null,
				name: details.name,
				description: details.description,
				scannedAt,
				// Only a new vial takes media; an edit keeps what it has.
				media: vialId ? undefined : media,
			}),
		}),
	);
	return data.vial;
}

export async function deleteVial(api: ApiFetch, id: string) {
	const response = await api(`/api/v1/vials/${id}`, { method: 'DELETE' });
	// 404 means it's already gone, which is what was asked for.
	if (!response.ok && response.status !== 404) await readJson(response);
}
