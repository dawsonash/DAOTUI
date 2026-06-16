import {useEffect, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import Spinner from 'ink-spinner';
import {validateExistingKey} from '../../lib/ssh.js';

type Props = {
	keyPath: string;
	onNext: () => void;
	onBack: () => void;
};

type State =
	| {status: 'checking'}
	| {status: 'ok'; publicKey: string}
	| {status: 'error'; message: string};

export default function UseExistingKey({keyPath, onNext, onBack}: Props) {
	const [state, setState] = useState<State>({status: 'checking'});

	async function check() {
		setState({status: 'checking'});
		const result = await validateExistingKey(keyPath);
		setState(
			result.ok
				? {status: 'ok', publicKey: result.publicKey}
				: {status: 'error', message: result.error},
		);
	}

	useEffect(() => {
		void check();
	}, [keyPath]);

	useInput((input, key) => {
		if (state.status === 'checking') return;
		if (input === 'b') onBack();
		if (state.status === 'error') {
			if (input === 'r') void check();
			return;
		}
		if (key.return) onNext();
	});

	if (state.status === 'checking') {
		return (
			<Box borderStyle="round" padding={1}>
				<Text>
					<Spinner type="dots" /> Checking key at {keyPath}…
				</Text>
			</Box>
		);
	}

	if (state.status === 'error') {
		return (
			<Box flexDirection="column" borderStyle="round" padding={1}>
				<Text color="red">Could not use that key:</Text>
				<Text>{state.message}</Text>
				<Box marginTop={1}>
					<Text dimColor>Press b to choose a different key · r to retry</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Text bold color="green">
				✓ Using existing key
			</Text>
			<Box marginTop={1} flexDirection="column">
				<Text>
					If this key isn&apos;t already authorized on the VM, send this public
					key to your admin. If it is, the next step will just connect.
				</Text>
				<Box marginTop={1} borderStyle="single" paddingX={1}>
					<Text wrap="wrap">{state.publicKey}</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Private key: {keyPath}</Text>
				</Box>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>Press Enter to continue · b to choose a different key</Text>
			</Box>
		</Box>
	);
}
