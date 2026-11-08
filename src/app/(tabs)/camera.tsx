import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useIsFocused } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, XIcon } from 'lucide-react-native';
import { Button, ErrorText, Heading, Loading, Text } from '@/components/ui';
import { ReviewSheet } from '@/components/review-form';
import { useToast } from '@/components/toast';
import { useApi } from '@/lib/api';
import { UNCATEGORIZED_NAME, emptyFields, type Alternatives, type Category, type Fields, type VialDetails } from '@/lib/labels';
import { readLabel, stillFor, uploadVialMedia, type LocalMedia, type UploadedMedia } from '@/lib/media';
import { saveVial } from '@/lib/vials';
import { useTheme } from '@/lib/theme';

type Phase = 'ready' | 'recording' | 'uploading' | 'done';
type Mode = 'video' | 'photo';
type OcrResult = { labelType: string | null; fields: Fields; alternatives: Alternatives; scannedAt: string };
type Saved = { vialId: string; category: Category | null };

function formatElapsed(seconds: number) {
	const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
	return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function CameraScreen() {
	const api = useApi();
	const toast = useToast();
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const focused = useIsFocused();
	const [permission, requestPermission] = useCameraPermissions();

	const cameraRef = useRef<CameraView>(null);
	/** Set when leaving mid-recording, so the clip is thrown away rather than read. */
	const discardRef = useRef(false);
	const stillRef = useRef<{ media: LocalMedia; still: Promise<string> } | null>(null);
	const uploadedRef = useRef<{ media: LocalMedia; uploaded: UploadedMedia } | null>(null);

	const [mode, setMode] = useState<Mode>('video');
	const [cameraReady, setCameraReady] = useState(false);
	const [phase, setPhase] = useState<Phase>('ready');
	const [captured, setCaptured] = useState<LocalMedia | null>(null);
	const [elapsed, setElapsed] = useState(0);
	const [cameraError, setCameraError] = useState<string | null>(null);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [result, setResult] = useState<OcrResult | null>(null);
	const [reviewing, setReviewing] = useState(false);
	const [saved, setSaved] = useState<Saved | null>(null);

	useEffect(() => {
		if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
	}, [permission, requestPermission]);

	// Leaving the tab mid-recording discards the recording.
	useFocusEffect(
		useCallback(
			() => () => {
				if (cameraRef.current && phase === 'recording') {
					discardRef.current = true;
					cameraRef.current.stopRecording();
				}
			},
			[phase],
		),
	);

	useEffect(() => {
		if (phase !== 'recording') return;
		const startedAt = Date.now();
		const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
		return () => clearInterval(timer);
	}, [phase]);

	async function upload(media: LocalMedia) {
		setPhase('uploading');
		setUploadError(null);
		try {
			const read = await readLabel(api, media);
			setResult({
				labelType: read.labelType,
				fields: { ...emptyFields(), ...read.fields },
				alternatives: read.alternatives,
				scannedAt: new Date().toISOString(),
			});
			setReviewing(true);
		} catch (error) {
			setUploadError((error as Error).message || 'Could not read the label.');
		} finally {
			setPhase('done');
		}
	}

	function onCaptured(media: LocalMedia) {
		setCaptured(media);
		void upload(media);
		// Only a still is kept, not the video. Picked while the label is being read.
		const still = stillFor(media);
		still.catch(() => {}); // Reported when the label is saved, not here.
		stillRef.current = { media, still };
	}

	async function startRecording() {
		const camera = cameraRef.current;
		if (!camera || !cameraReady) return;
		discardRef.current = false;
		setElapsed(0);
		setPhase('recording');
		const startedAt = Date.now();
		try {
			const recorded = await camera.recordAsync({ maxDuration: 120 });
			if (discardRef.current) {
				setPhase('ready');
				return;
			}
			if (!recorded?.uri) {
				setUploadError('The recording was empty. Please record again.');
				setPhase('done');
				return;
			}
			onCaptured({
				uri: recorded.uri,
				name: 'recording.mp4',
				mimeType: 'video/mp4',
				isVideo: true,
				durationMs: Date.now() - startedAt,
			});
		} catch {
			setCameraError('Could not record. Close any other app using the camera, then try again.');
			setPhase('ready');
		}
	}

	async function takePicture() {
		const camera = cameraRef.current;
		if (!camera || !cameraReady) return;
		try {
			const picture = await camera.takePictureAsync({ quality: 1 });
			if (!picture?.uri) return;
			onCaptured({ uri: picture.uri, name: 'photo.jpg', mimeType: 'image/jpeg', isVideo: false });
		} catch {
			setCameraError('Could not take a photo. Please try again.');
		}
	}

	async function saveToInventory(fields: Fields, category: Category | null, details: VialDetails) {
		if (!result || !captured) return;

		// Keep the still in Cloudinary. If that fails the label values still save.
		let uploaded = uploadedRef.current?.media === captured ? uploadedRef.current.uploaded : null;
		let mediaError: string | null = null;
		if (!uploaded) {
			try {
				const pending = stillRef.current;
				const still = await (pending?.media === captured ? pending.still : stillFor(captured));
				uploaded = await uploadVialMedia(api, still, captured.name);
				// Remembered so a failed save can retry without uploading again.
				uploadedRef.current = { media: captured, uploaded };
			} catch (error) {
				mediaError = (error as Error).message;
			}
		}

		const vial = await saveVial(api, {
			fields,
			category,
			details,
			labelType: result.labelType,
			fileName: captured.name,
			scannedAt: result.scannedAt,
			media: uploaded,
		});
		setSaved({ vialId: vial.id, category });
		setReviewing(false);
		if (mediaError) {
			toast.warning('Label saved without its photo', {
				description: `A still couldn't be stored: ${mediaError}`,
			});
		} else {
			toast.success('Label confirmed', {
				description: category?.name ?? UNCATEGORIZED_NAME,
				action: { label: 'View inventory', onPress: () => router.navigate('/inventory') },
			});
		}
	}

	function recordAgain() {
		setCaptured(null);
		setResult(null);
		setReviewing(false);
		setUploadError(null);
		setSaved(null);
		setElapsed(0);
		setPhase('ready');
	}

	const isRecording = phase === 'recording';
	const showControls = !cameraError && permission?.granted && (phase === 'ready' || isRecording);

	return (
		<View style={{ flex: 1, backgroundColor: '#000' }}>
			{focused && permission?.granted && phase !== 'done' && (
				<CameraView
					ref={cameraRef}
					style={StyleSheet.absoluteFill}
					facing='back'
					mode={mode === 'video' ? 'video' : 'picture'}
					mute
					videoQuality='1080p'
					onCameraReady={() => setCameraReady(true)}
					onMountError={() => setCameraError('Could not start the camera. Close any other app using it, then try again.')}
				/>
			)}

			<View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}>
				<Pressable
					onPress={() => router.navigate('/')}
					accessibilityLabel='Close the camera'
					style={[styles.roundButton, { position: 'absolute', left: 16, top: insets.top + 12 }]}
				>
					<XIcon size={20} color='#fff' />
				</Pressable>
				{showControls && mode === 'video' && (
					<View style={[styles.timer, { backgroundColor: isRecording ? '#dc2626' : 'rgba(0,0,0,0.4)' }]}>
						<Text size={18} mono style={{ color: '#fff' }} accessibilityRole='timer'>
							{formatElapsed(elapsed)}
						</Text>
					</View>
				)}
			</View>

			{permission && !permission.granted && (
				<View style={styles.centered}>
					<Text style={{ color: '#fff', textAlign: 'center' }}>
						{permission.canAskAgain
							? 'Allow the camera to scan labels.'
							: 'Camera access was blocked. Allow the camera for MRG Labs OCR in your phone’s settings.'}
					</Text>
					{permission.canAskAgain && <Button title='Allow camera' onPress={() => void requestPermission()} />}
				</View>
			)}

			{cameraError && (
				<View style={styles.centered}>
					<Text style={{ color: '#fff', textAlign: 'center' }} accessibilityRole='alert'>
						{cameraError}
					</Text>
					<Button title='Try again' variant='outline' onPress={() => setCameraError(null)} style={{ borderColor: '#fff' }} />
				</View>
			)}

			{showControls && (
				<View style={[styles.controls, { paddingBottom: insets.bottom + 28 }]}>
					{!isRecording && (
						<View style={styles.modeSwitch}>
							{(['video', 'photo'] as const).map((option) => (
								<Pressable
									key={option}
									onPress={() => {
										setCameraReady(false);
										setMode(option);
									}}
									style={[styles.modeOption, mode === option && { backgroundColor: 'rgba(255,255,255,0.2)' }]}
									accessibilityState={{ selected: mode === option }}
								>
									<Text size={13} weight='medium' style={{ color: '#fff' }}>
										{option === 'video' ? 'Video' : 'Photo'}
									</Text>
								</Pressable>
							))}
						</View>
					)}
					<Pressable
						onPress={() =>
							mode === 'photo'
								? void takePicture()
								: isRecording
									? cameraRef.current?.stopRecording()
									: void startRecording()
						}
						accessibilityLabel={mode === 'photo' ? 'Take photo' : isRecording ? 'Stop recording' : 'Start recording'}
						style={styles.shutter}
					>
						<View
							style={
								mode === 'photo'
									? { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff' }
									: isRecording
										? { width: 32, height: 32, borderRadius: 6, backgroundColor: '#dc2626' }
										: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#dc2626' }
							}
						/>
					</Pressable>
				</View>
			)}

			{phase === 'uploading' && (
				<View style={[StyleSheet.absoluteFill, styles.overlay]}>
					<Loading label='Reading the label…' />
				</View>
			)}

			{phase === 'done' && (
				<View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }]}>
					<ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 72, gap: 16 }}>
						<ErrorText>{uploadError}</ErrorText>

						{result && (
							<>
								<Heading size={22}>
									{saved ? 'Saved to inventory' : result.labelType ? `Read a ${result.labelType} label` : 'Label read'}
								</Heading>
								{saved ? (
									<View
										style={{
											flexDirection: 'row',
											alignItems: 'center',
											gap: 8,
											borderWidth: 1,
											borderColor: theme.colors.border,
											backgroundColor: theme.colors.card,
											borderRadius: 24,
											paddingHorizontal: 18,
											paddingVertical: 14,
										}}
									>
										<CheckIcon size={16} color={theme.colors.success} />
										<Text size={14} style={{ flex: 1 }}>
											Saved to {saved.category?.name ?? UNCATEGORIZED_NAME}.
										</Text>
										<Pressable onPress={() => router.navigate('/inventory')}>
											<Text size={14} weight='medium'>
												View inventory
											</Text>
										</Pressable>
									</View>
								) : (
									<Text size={14} tone='muted'>
										This label hasn&apos;t been saved yet.
									</Text>
								)}
								<View style={{ flexDirection: 'row', gap: 12 }}>
									<Button title={mode === 'photo' ? 'Scan again' : 'Record again'} variant='outline' onPress={recordAgain} />
									{!saved && <Button title='Review label' onPress={() => setReviewing(true)} style={{ marginLeft: 'auto' }} />}
								</View>
							</>
						)}

						{uploadError && captured && (
							<View style={{ flexDirection: 'row', gap: 12 }}>
								<Button title='Try upload again' onPress={() => void upload(captured)} />
								<Button title={mode === 'photo' ? 'Scan again' : 'Record again'} variant='outline' onPress={recordAgain} />
							</View>
						)}
					</ScrollView>

					<Pressable
						onPress={() => router.navigate('/')}
						accessibilityLabel='Close'
						style={[styles.roundButton, { position: 'absolute', left: 16, top: insets.top + 12, backgroundColor: theme.colors.accent }]}
					>
						<XIcon size={20} color={theme.colors.foreground} />
					</Pressable>
				</View>
			)}

			{captured && result && (
				<ReviewSheet
					open={reviewing}
					media={captured}
					fields={result.fields}
					alternatives={saved ? {} : result.alternatives}
					category={saved?.category ?? null}
					onCancel={() => setReviewing(false)}
					onConfirm={saveToInventory}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	roundButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'rgba(0,0,0,0.4)',
		zIndex: 2,
	},
	timer: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 2 },
	centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
	controls: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: 'center',
		gap: 18,
		paddingTop: 48,
		backgroundColor: 'rgba(0,0,0,0.35)',
	},
	modeSwitch: { flexDirection: 'row', gap: 4, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 999, padding: 4 },
	modeOption: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 },
	shutter: {
		width: 80,
		height: 80,
		borderRadius: 40,
		borderWidth: 4,
		borderColor: '#fff',
		alignItems: 'center',
		justifyContent: 'center',
	},
	overlay: { backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
});
