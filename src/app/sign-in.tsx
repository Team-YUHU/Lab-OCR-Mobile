import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSignIn } from '@clerk/expo';
import { Button, Card, ErrorText, Field, Heading, Input, Text } from '@/components/ui';
import { useTheme } from '@/lib/theme';

// The same steps as the web app's sign-in form. Email and password only: accounts are
// added in Clerk by an admin.

type Step = 'password' | 'verify' | 'reset-code' | 'reset-password';

function clerkMessage(error: unknown) {
	if (!error) return null;
	const apiError = (error as { errors?: { longMessage?: string; message?: string }[] }).errors?.[0];
	return (
		apiError?.longMessage ??
		apiError?.message ??
		(error as { longMessage?: string }).longMessage ??
		(error as { message?: string }).message ??
		'Something went wrong. Please try again.'
	);
}

function isBreachedPassword(error: unknown) {
	const code = (error as { errors?: { code?: string }[] } | null)?.errors?.[0]?.code;
	return code?.startsWith('form_password_pwned') ?? false;
}

function AuthCard({
	title,
	description,
	children,
	footer,
}: {
	title: string;
	description?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
}) {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === 'ios' ? 'padding' : undefined}
			style={{ flex: 1, backgroundColor: theme.colors.background }}
		>
			<ScrollView
				keyboardShouldPersistTaps='handled'
				contentContainerStyle={{
					flexGrow: 1,
					justifyContent: 'center',
					paddingHorizontal: 20,
					paddingTop: insets.top + 24,
					paddingBottom: insets.bottom + 24,
					gap: 24,
				}}
			>
				<View style={{ alignItems: 'center', gap: 10 }}>
					<Image source={require('../../assets/mrg-logo.png')} style={{ width: 80, height: 48 }} contentFit='contain' />
					<Heading>{title}</Heading>
					{description ? (
						<Text tone='muted' size={14} style={{ textAlign: 'center' }}>
							{description}
						</Text>
					) : null}
				</View>
				<Card style={{ padding: 22, gap: 16 }}>{children}</Card>
				{footer}
			</ScrollView>
		</KeyboardAvoidingView>
	);
}

export default function SignInScreen() {
	const { theme } = useTheme();
	const { signIn, errors, fetchStatus } = useSignIn();

	const [step, setStep] = useState<Step>('password');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [code, setCode] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [problem, setProblem] = useState<string | null>(null);
	const [breached, setBreached] = useState(false);

	const busy = fetchStatus === 'fetching';
	const formError = problem ?? clerkMessage(errors.global?.[0]);

	/** Finishes the sign-in, or moves to whatever step Clerk still needs. */
	async function continueSignIn() {
		if (signIn.status === 'complete') {
			// The root layout moves into the app once the session is active.
			await signIn.finalize();
			return;
		}
		if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
			const canEmail = signIn.supportedSecondFactors.some((factor) => factor.strategy === 'email_code');
			if (!canEmail) {
				setProblem('This account needs a verification method this app does not support.');
				return;
			}
			const { error } = await signIn.mfa.sendEmailCode();
			if (!error) {
				setCode('');
				setStep('verify');
			}
			return;
		}
		setProblem('Could not finish signing in. Please try again.');
	}

	async function handlePassword() {
		setProblem(null);
		setBreached(false);
		const { error } = await signIn.password({ identifier: email.trim(), password });
		if (!error) await continueSignIn();
		else if (isBreachedPassword(error)) setBreached(true);
	}

	async function handleVerify() {
		setProblem(null);
		const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
		if (!error) await continueSignIn();
	}

	async function startReset() {
		setProblem(null);
		setBreached(false);
		if (!email.trim()) {
			setProblem('Enter your email first, then choose "Forgot password?".');
			return;
		}
		const created = await signIn.create({ identifier: email.trim() });
		if (created.error) return;
		const { error } = await signIn.resetPasswordEmailCode.sendCode();
		if (!error) {
			setCode('');
			setStep('reset-code');
		}
	}

	async function handleResetCode() {
		setProblem(null);
		const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
		if (!error) {
			setNewPassword('');
			setStep('reset-password');
		}
	}

	async function handleNewPassword() {
		setProblem(null);
		const { error } = await signIn.resetPasswordEmailCode.submitPassword({ password: newPassword });
		if (!error) await continueSignIn();
	}

	async function startOver() {
		setProblem(null);
		setCode('');
		setStep('password');
		await signIn.reset();
	}

	const backButton = <Button title='Back to sign in' variant='ghost' onPress={() => void startOver()} />;

	const codeField = (
		<Field label='Code' error={errors.fields.code?.message}>
			<Input
				value={code}
				onChangeText={setCode}
				keyboardType='number-pad'
				textContentType='oneTimeCode'
				autoComplete='one-time-code'
				maxLength={6}
				mono
				style={{ fontSize: 22, letterSpacing: 8, textAlign: 'center' }}
			/>
		</Field>
	);

	if (step === 'verify' || step === 'reset-code') {
		const isVerify = step === 'verify';
		return (
			<AuthCard
				title={isVerify ? 'Check your email' : 'Reset your password'}
				description={
					isVerify
						? `Enter the code we sent to ${email.trim()} to finish signing in.`
						: `Enter the code we sent to ${email.trim()}.`
				}
			>
				{codeField}
				<ErrorText>{formError}</ErrorText>
				<Button
					title={busy ? 'Checking…' : isVerify ? 'Verify' : 'Continue'}
					size='lg'
					busy={busy}
					disabled={!code.trim()}
					onPress={() => void (isVerify ? handleVerify() : handleResetCode())}
				/>
				<Button
					title='Send a new code'
					variant='ghost'
					disabled={busy}
					onPress={() =>
						void (isVerify ? signIn.mfa.sendEmailCode() : signIn.resetPasswordEmailCode.sendCode())
					}
				/>
				{backButton}
			</AuthCard>
		);
	}

	if (step === 'reset-password') {
		return (
			<AuthCard title='Choose a new password'>
				<Field label='New password' hint='At least 15 characters.' error={errors.fields.password?.message}>
					<Input
						value={newPassword}
						onChangeText={setNewPassword}
						secureTextEntry
						autoComplete='new-password'
						textContentType='newPassword'
						autoCapitalize='none'
					/>
				</Field>
				<ErrorText>{formError}</ErrorText>
				<Button
					title={busy ? 'Saving…' : 'Save and sign in'}
					size='lg'
					busy={busy}
					disabled={newPassword.length < 15}
					onPress={() => void handleNewPassword()}
				/>
				{backButton}
			</AuthCard>
		);
	}

	return (
		<AuthCard
			title='Sign in'
			description='Welcome back to MRG Labs OCR.'
			footer={
				<View style={{ alignItems: 'center', gap: 12 }}>
					<Text tone='muted' size={14} style={{ textAlign: 'center' }}>
						No account yet? Ask your lab administrator to add you.
					</Text>
					<Link href='/server' asChild>
						<Pressable hitSlop={8}>
							<Text tone='muted' size={13} style={{ textDecorationLine: 'underline' }}>
								Server settings
							</Text>
						</Pressable>
					</Link>
				</View>
			}
		>
			<Field label='Email' error={errors.fields.identifier?.message}>
				<Input
					value={email}
					onChangeText={setEmail}
					keyboardType='email-address'
					autoComplete='email'
					textContentType='username'
					autoCapitalize='none'
				/>
			</Field>
			<View style={{ gap: 6 }}>
				<Field label='Password' error={breached ? null : errors.fields.password?.message}>
					<Input
						value={password}
						onChangeText={(text) => {
							setPassword(text);
							setBreached(false);
						}}
						secureTextEntry
						autoComplete='current-password'
						textContentType='password'
						autoCapitalize='none'
						returnKeyType='go'
						onSubmitEditing={() => void handlePassword()}
					/>
				</Field>
				<Pressable onPress={() => void startReset()} disabled={busy} style={{ alignSelf: 'flex-end' }} hitSlop={8}>
					<Text tone='muted' size={13}>
						Forgot password?
					</Text>
				</Pressable>
			</View>
			<ErrorText>{formError}</ErrorText>
			{breached ? (
				<View
					style={{
						gap: 12,
						padding: 12,
						borderRadius: theme.radius,
						borderWidth: 1,
						borderColor: theme.colors.warning,
					}}
				>
					<Text size={14}>
						This password appears in a known data breach, so it can&apos;t be used to sign in any more. Choose a
						new one: we&apos;ll email you a code.
					</Text>
					<Button title='Set a new password' disabled={busy} onPress={() => void startReset()} />
				</View>
			) : (
				<Button
					title={busy ? 'Signing in…' : 'Sign in'}
					size='lg'
					busy={busy}
					disabled={!email.trim() || !password}
					onPress={() => void handlePassword()}
				/>
			)}
		</AuthCard>
	);
}
