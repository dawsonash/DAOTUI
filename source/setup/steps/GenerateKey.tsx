import {useEffect, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import Spinner from 'ink-spinner';
import {generateKey, readPublicKey} from '../../lib/ssh.js';

type Props = {
	keyPath: string;
	onNext: () => void;
};

type State =
	| {status: 'working'}
	| {status: 'done'; publicKey: string}
	| {status: 'error'; message: string};

export default function GenerateKey({keyPath, onNext}: Props) {
	const [state, setState] = useState<State>({status: 'working'});

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				await generateKey(keyPath);
				const publicKey = await readPublicKey(keyPath);
				if (!cancelled) setState({status: 'done', publicKey});
			} catch (error) {
				if (!cancelled)
					setState({
						status: 'error',
						message: error instanceof Error ? error.message : String(error),
					});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [keyPath]);

	useInput((_input, key) => {
		if (state.status === 'done' && key.return) onNext();
	});

	if (state.status === 'working') {
		return (
			<Box borderStyle="round" padding={1}>
				<Text>
					<Spinner type="dots" /> Generating SSH key…
				</Text>
			</Box>
		);
	}

	if (state.status === 'error') {
		return (
			<Box flexDirection="column" borderStyle="round" padding={1}>
				<Text color="red">Could not generate SSH key:</Text>
				<Text>{state.message}</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Text bold color="green">
				✓ SSH key created
			</Text>
			<Box marginTop={1} flexDirection="column">
				<Text>Send this public key to your admin to authorize VM access:</Text>
				<Box marginTop={1} borderStyle="single" paddingX={1}>
					<Text wrap="wrap">{state.publicKey}</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Private key saved at {keyPath}</Text>
				</Box>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>Press Enter once you've sent it to your admin.</Text>
			</Box>
		</Box>
	);
}
