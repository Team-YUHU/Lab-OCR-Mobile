import * as ImagePicker from 'expo-image-picker';
import { fileNameFrom, type LocalMedia } from './media';

function toMedia(asset: ImagePicker.ImagePickerAsset, index: number): LocalMedia {
	const isVideo = asset.type === 'video' || (asset.mimeType ?? '').startsWith('video/');
	const fallback = `${isVideo ? 'video' : 'photo'}-${Date.now()}-${index}.${isVideo ? 'mp4' : 'jpg'}`;
	return {
		uri: asset.uri,
		name: asset.fileName || fileNameFrom(asset.uri, fallback),
		mimeType: asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
		isVideo,
		durationMs: asset.duration ?? null,
		size: asset.fileSize ?? null,
	};
}

/** Photos and videos from the library. Empty when the person cancels. */
export async function pickMedia({ multiple = false, limit = 20 } = {}) {
	const result = await ImagePicker.launchImageLibraryAsync({
		mediaTypes: ['images', 'videos'],
		allowsMultipleSelection: multiple,
		selectionLimit: multiple ? limit : 1,
		quality: 1,
		orderedSelection: true,
	});
	if (result.canceled) return [];
	return result.assets.map(toMedia);
}

/** A photo from the camera, through the system camera app. Null when cancelled. */
export async function takePhoto() {
	const permission = await ImagePicker.requestCameraPermissionsAsync();
	if (!permission.granted) throw new Error('Camera access was blocked. Allow the camera in Settings.');
	const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
	if (result.canceled) return null;
	return toMedia(result.assets[0], 0);
}
