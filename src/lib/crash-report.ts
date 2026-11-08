import { File, Paths } from 'expo-file-system';

// A release build closes on any uncaught JavaScript error, with no message. This keeps the
// last fatal error on disk, so the next launch can show what went wrong.

const crashFile = () => new File(Paths.document, 'last-crash.txt');

type ErrorUtilsType = {
	getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
	setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

export function describeError(error: unknown) {
	const value = error as { name?: string; message?: string; stack?: string } | null;
	const head = `${value?.name ?? 'Error'}: ${value?.message ?? String(error)}`;
	const stack = value?.stack ? value.stack.split('\n').slice(0, 12).join('\n') : '';
	return stack.startsWith(head) ? stack : `${head}\n${stack}`;
}

export function saveCrash(error: unknown) {
	try {
		const file = crashFile();
		if (!file.exists) file.create();
		file.writeSync(`${new Date().toISOString()}\n${describeError(error)}`);
	} catch {
		// Nothing more we can do.
	}
}

let installed = false;

export function installCrashReporter() {
	if (installed) return;
	installed = true;
	const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsType }).ErrorUtils;
	if (!errorUtils) return;
	const previous = errorUtils.getGlobalHandler();
	errorUtils.setGlobalHandler((error, isFatal) => {
		if (isFatal) saveCrash(error);
		previous(error, isFatal);
	});
}

export function readLastCrash(): string | null {
	try {
		const file = crashFile();
		return file.exists ? file.textSync() : null;
	} catch {
		return null;
	}
}

export function clearLastCrash() {
	try {
		const file = crashFile();
		if (file.exists) file.delete();
	} catch {
		// Ignore.
	}
}
