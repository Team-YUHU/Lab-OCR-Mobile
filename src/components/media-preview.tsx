import { View } from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTheme } from '@/lib/theme';
import type { LocalMedia } from '@/lib/media';

function VideoPreview({ uri, height }: { uri: string; height: number }) {
	const player = useVideoPlayer(uri, (instance) => {
		instance.muted = true;
		instance.loop = true;
	});
	return (
		<VideoView
			player={player}
			nativeControls
			contentFit='contain'
			style={{ width: '100%', height }}
			accessibilityLabel='Video of the label'
		/>
	);
}

/** The photo or video a label was read from. */
export function MediaPreview({ media, height = 220 }: { media: LocalMedia; height?: number }) {
	const { theme } = useTheme();
	return (
		<View
			style={{
				borderRadius: theme.radius * 1.4,
				borderWidth: 1,
				borderColor: theme.colors.border,
				backgroundColor: theme.colors.muted,
				overflow: 'hidden',
			}}
		>
			{media.isVideo ? (
				<VideoPreview uri={media.uri} height={height} />
			) : (
				<Image
					source={{ uri: media.uri }}
					contentFit='contain'
					style={{ width: '100%', height }}
					accessibilityLabel={`Photo of ${media.name}`}
				/>
			)}
		</View>
	);
}
