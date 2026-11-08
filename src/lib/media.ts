import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { readJson, type ApiFetch } from './api';
import type { FrameResult } from './labels';

/** A photo or video on this phone, from the camera or the photo library. */
export type LocalMedia = {
	uri: string;
	name: string;
	mimeType: string;
	isVideo: boolean;
	/** Length of a video, in milliseconds, when known. */
	durationMs?: number | null;
	size?: number | null;
};

export const MAX_BYTES = 50 * 1024 * 1024; // the OCR route's limit
const MAX_SIDE = 1600;

const VIDEO_TYPES: Record<string, string> = {
	mp4: 'video/mp4',
	m4v: 'video/mp4',
	mov: 'video/quicktime',
	webm: 'video/webm',
};

function extension(name: string) {
	return name.split('.').pop()?.toLowerCase() ?? '';
}

/** The type the OCR route accepts: it refuses anything with a codecs suffix. */
export function videoType(media: LocalMedia) {
	const plain = media.mimeType.split(';')[0].trim();
	if (Object.values(VIDEO_TYPES).includes(plain)) return plain;
	return VIDEO_TYPES[extension(media.name)] ?? 'video/mp4';
}

export function fileNameFrom(uri: string, fallback: string) {
	const last = decodeURIComponent(uri.split('/').pop() ?? '').split('?')[0];
	return last && last.includes('.') ? last : fallback;
}

/**
 * A photo as a JPEG no larger than 1600px a side. Converts HEIC and other types the
 * server doesn't take, and keeps uploads small on mobile data.
 */
export async function toJpeg(uri: string) {
	const context = ImageManipulator.manipulate(uri);
	const probe = await context.renderAsync();
	const { width, height } = probe;
	const scale = Math.min(MAX_SIDE / Math.max(width, height), 1);
	if (scale < 1) {
		context.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
	}
	const image = scale < 1 ? await context.renderAsync() : probe;
	const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
	return saved.uri;
}

/** The still kept for a vial: the photo itself, or a frame from the middle of the video. */
export async function stillFor(media: LocalMedia) {
	if (!media.isVideo) return toJpeg(media.uri);
	const time = media.durationMs ? Math.round(media.durationMs / 2) : 1000;
	try {
		const { uri } = await VideoThumbnails.getThumbnailAsync(media.uri, { time, quality: 1 });
		return toJpeg(uri);
	} catch {
		const { uri } = await VideoThumbnails.getThumbnailAsync(media.uri, { time: 0, quality: 1 });
		return toJpeg(uri);
	}
}

/** Reads a label through the OCR route. Videos go up whole; the server picks the frames. */
export async function readLabel(
	api: ApiFetch,
	media: LocalMedia,
	signal?: AbortSignal,
): Promise<FrameResult> {
	if (media.size && media.size > MAX_BYTES) {
		throw new Error('File must be 50 MB or smaller');
	}
	const body = new FormData();
	if (media.isVideo) {
		body.append('video', {
			uri: media.uri,
			name: media.name,
			type: videoType(media),
		} as unknown as Blob);
	} else {
		const jpeg = await toJpeg(media.uri);
		body.append('image', {
			uri: jpeg,
			name: media.name.replace(/\.[^.]+$/, '') + '.jpg',
			type: 'image/jpeg',
		} as unknown as Blob);
	}
	const response = await api('/api/v1/ocr', { method: 'POST', body, signal });
	return readJson<FrameResult>(response);
}

export type UploadedMedia = { publicId: string; resourceType: 'image'; url: string };

type Signature = {
	cloudName: string;
	apiKey: string;
	timestamp: number;
	folder: string;
	signature: string;
};

/** Uploads a vial's still straight to Cloudinary, signed by our server. */
export async function uploadVialMedia(api: ApiFetch, jpegUri: string, name: string) {
	const signature = await readJson<Signature>(
		await api('/api/v1/cloudinary/signature', { method: 'POST' }),
	);
	const body = new FormData();
	body.append('file', {
		uri: jpegUri,
		name: name.replace(/\.[^.]+$/, '') + '.jpg',
		type: 'image/jpeg',
	} as unknown as Blob);
	body.append('api_key', signature.apiKey);
	body.append('timestamp', String(signature.timestamp));
	body.append('folder', signature.folder);
	body.append('signature', signature.signature);

	let response: Response;
	try {
		response = await fetch(
			`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`,
			{ method: 'POST', body },
		);
	} catch {
		throw new Error('Could not reach Cloudinary');
	}
	const result = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(result.error?.message ?? 'Could not upload the file');
	if (result.resource_type !== 'image') {
		throw new Error('Cloudinary stored the file as an unexpected type');
	}
	return {
		publicId: result.public_id,
		resourceType: 'image',
		url: result.secure_url,
	} satisfies UploadedMedia;
}

/** Writes a CSV to the cache and opens the share sheet (save to Files, Drive, email…). */
export async function shareCsv(fileName: string, csv: string) {
	const file = new File(Paths.cache, fileName);
	if (file.exists) file.delete();
	file.create();
	file.writeSync(csv);
	if (!(await Sharing.isAvailableAsync())) {
		throw new Error('Sharing is not available on this device');
	}
	await Sharing.shareAsync(file.uri, {
		mimeType: 'text/csv',
		dialogTitle: `Share ${fileName}`,
		UTI: 'public.comma-separated-values-text',
	});
}
