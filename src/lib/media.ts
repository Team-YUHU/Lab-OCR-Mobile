import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { readJson, type ApiFetch } from './api';
import { mergeFrameResults, type FrameResult, type MergedResult } from './labels';

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

const MAX_SIDE = 1600;

/**
 * A file for FormData. Expo's fetch (the app's global fetch) can't send React Native's
 * { uri, name, type } parts: it needs a part it can read the bytes of.
 */
function filePart(uri: string, name: string, type: string) {
	const file = new File(uri);
	return { name, type, bytes: () => file.bytes() } as unknown as Blob;
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

/** Sends one JPEG to the OCR route. Each is well under Vercel's 4.5 MB request limit. */
async function readImage(api: ApiFetch, jpegUri: string, name: string, signal?: AbortSignal) {
	const body = new FormData();
	body.append('image', filePart(jpegUri, name.replace(/\.[^.]+$/, '') + '.jpg', 'image/jpeg'));
	const response = await api('/api/v1/ocr', { method: 'POST', body, signal });
	return readJson<FrameResult>(response);
}

/** Where to take frames from a video: a quarter, half and three quarters of the way in. */
function frameTimes(durationMs: number | null | undefined) {
	if (!durationMs || durationMs < 600) return [0, 500, 1000];
	return [0.25, 0.5, 0.75].map((share) => Math.round(durationMs * share));
}

async function videoFrame(uri: string, time: number) {
	const { uri: frame } = await VideoThumbnails.getThumbnailAsync(uri, { time, quality: 1 });
	return toJpeg(frame);
}

/**
 * Reads a label. A video is never sent whole: phone video quickly passes Vercel's 4.5 MB
 * limit, so three frames are read separately and combined, as the web app does for
 * uploaded videos. Values the frames disagree on come back as alternatives.
 */
export async function readLabel(
	api: ApiFetch,
	media: LocalMedia,
	signal?: AbortSignal,
): Promise<MergedResult> {
	if (!media.isVideo) {
		const result = await readImage(api, await toJpeg(media.uri), media.name, signal);
		return { ...result, alternatives: {} };
	}

	const frames: string[] = [];
	for (const time of frameTimes(media.durationMs)) {
		try {
			frames.push(await videoFrame(media.uri, time));
		} catch {
			// A time past the end of a short clip: the other frames still count.
		}
	}
	if (frames.length === 0) throw new Error('Could not take frames from this video');

	const settled = await Promise.allSettled(
		frames.map((frame) => readImage(api, frame, media.name, signal)),
	);
	const results = settled.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : []));
	if (results.length === 0) {
		throw (settled[0] as PromiseRejectedResult).reason;
	}
	return mergeFrameResults(results);
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
	body.append('file', filePart(jpegUri, name.replace(/\.[^.]+$/, '') + '.jpg', 'image/jpeg'));
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
