import {useEffect, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import Spinner from 'ink-spinner';
import {testConnection, type ConnectionTarget} from '../../lib/ssh.js';

type Props = {
	target: ConnectionTarget;
	onNext: () => void;
};

type State = 'testing' | 'ok' | 'failed';

export default function TestConnection({target, onNext}: Props) {
	const [state, setState] = useState<State>('testing');

	async function run() {
		setState('testing');
		setState((await testConnection(target)) ? 'ok' : 'failed');
	}

	useEffect(() => {
		void run();
	}, []);

	useInput((input, key) => {
		if (state === 'testing') return;
		if (input === 'r') void run();
		if (key.return) onNext();
	});

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Text bold>Testing VM connection</Text>
			<Box marginTop={1} flexDirection="column">
				{state === 'testing' ? (
					<Text>
						<Spinner type="dots" /> Connecting to {target.host}…
					</Text>
				) : state === 'ok' ? (
					<Text color="green">✓ Connected — your key is authorized.</Text>
				) : (
					<>
						<Text color="yellow">
							! Could not connect yet. This is expected until your admin
							authorizes the key you just sent.
						</Text>
						<Text dimColor>
							Your setup is still saved. Re-run the tool once authorized, and your VM is allocated.
						</Text>
					</>
				)}
			</Box>
			<Box marginTop={1}>
				{state === 'testing' ? null : (
					<Text dimColor>Press Enter to finish · r to retry</Text>
				)}
			</Box>
		</Box>
	);
}
