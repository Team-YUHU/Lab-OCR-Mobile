import { router } from 'expo-router';
import { ServerSetup } from '@/screens/server-setup';

export default function ServerScreen() {
	return <ServerSetup onDone={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
}
