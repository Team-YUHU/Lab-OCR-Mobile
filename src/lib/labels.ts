// Shared label logic, copied from the web app's src/features/labels/lib so CSVs match exactly.

export const CSV_COLUMNS = [
	{ name: 'sampleId', label: 'Sample ID' },
	{ name: 'dateSampled', label: 'Date Sampled' },
	{ name: 'dateReceived', label: 'Date Received' },
	{ name: 'machine', label: 'Machine' },
	{ name: 'component', label: 'Component' },
	{ name: 'serialNumber', label: 'Serial Number' },
	{ name: 'referenceLube', label: 'Reference Lube' },
] as const;

export type FieldName = (typeof CSV_COLUMNS)[number]['name'];
export type Fields = Record<FieldName, string>;
export type OcrFieldName = Exclude<FieldName, 'dateReceived'>;
export type Alternatives = Partial<Record<FieldName, string[]>>;

export type FrameResult = {
	labelType: string | null;
	fields: Record<OcrFieldName, string>;
};

export type MergedResult = FrameResult & {
	alternatives: Partial<Record<OcrFieldName, string[]>>;
};

function escapeCell(value: string) {
	return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Builds the CSV from one label or many, one row each. */
export function buildCsv(fields: Fields | Fields[]) {
	const header = CSV_COLUMNS.map((column) => escapeCell(column.label));
	const rows = [fields]
		.flat()
		.map((row) => CSV_COLUMNS.map((column) => escapeCell(row[column.name] ?? '')));
	return [header, ...rows].map((cells) => `${cells.join(',')}\r\n`).join('');
}

/** Returns a safe file name ending in .csv, or null if nothing usable is left. */
export function toCsvFileName(input: string) {
	const base = input
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
		.trim()
		.replace(/\.csv$/i, '')
		.replace(/[. ]+$/, '');
	return base ? `${base}.csv` : null;
}

/** Today's date on this phone, as YYYY-MM-DD. */
export function todayLocal(now = new Date()) {
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${now.getFullYear()}-${month}-${day}`;
}

export function emptyFields(): Fields {
	return Object.fromEntries(CSV_COLUMNS.map(({ name }) => [name, ''])) as Fields;
}

function rankByCount(values: string[]) {
	const counts = new Map<string, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value]) => value);
}

/** Combines separate reads of one label; a blank read loses to any value read elsewhere. */
export function mergeFrameResults(results: FrameResult[]): MergedResult {
	const labelTypes = results.flatMap((result) => result.labelType ?? []);
	const fieldNames = Object.keys(results[0].fields) as OcrFieldName[];
	const fields = {} as Record<OcrFieldName, string>;
	const alternatives: MergedResult['alternatives'] = {};

	for (const name of fieldNames) {
		const [best = '', ...others] = rankByCount(
			results.map((result) => result.fields[name]).filter(Boolean),
		);
		fields[name] = best;
		if (others.length > 0) alternatives[name] = others;
	}
	return { labelType: rankByCount(labelTypes)[0] ?? null, fields, alternatives };
}

// Vials with no category are shown as this. It isn't a row in the categories table.
export const UNCATEGORIZED_NAME = 'Uncategorized';
export const UNCATEGORIZED_ID = 'uncategorized';

export type Category = { id: string; name: string };

export const byName = (a: Category, b: Category) =>
	a.name.toLowerCase().localeCompare(b.name.toLowerCase());

/** A vial as the API returns it (see the web app's src/server/vials.ts). */
export type Vial = {
	id: string;
	categoryId: string | null;
	categoryName: string;
	fields: Fields;
	labelType: string | null;
	fileName: string | null;
	name: string | null;
	description: string | null;
	scannedAt: string | null;
	createdByName: string | null;
	media: { resourceType: 'image' | 'video'; url: string } | null;
	createdAt: string;
	updatedAt: string;
};

/** Optional details people add to a vial. Not CSV columns. */
export type VialDetails = { name: string; description: string };
