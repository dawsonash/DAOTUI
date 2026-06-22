import {useEffect, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import Spinner from 'ink-spinner';
import type {DaoConfig} from '../../config/store.js';
import {deallocateVm} from '../../lib/azure.js';
import {cleanupRemote} from '../../lib/ssh.js';

type Props = {
	config: DaoConfig;
	inputName: string;
	outputName: string;
	jsonName: string;
	onDone: () => void;
};

type Status =
	| {state: 'running'}
	| {state: 'failed'; message: string}
	| {state: 'done'};

// Final phase of the transcribe flow: now that the transcript is downloaded and
// QC review is finished, remove the uploaded input + transcript from the VM and
// deallocate it. Deferred to here (rather than RunTranscription) so the VM stays
// alive while Result/ReviewWords read the confidence JSON and transcript over ssh.
export default function Teardown({
	config,
	inputName,
	outputName,
	jsonName,
	onDone,
}: Props) {
	const [status, setStatus] = useState<Status>({state: 'running'});

	async function run() {
		setStatus({state: 'running'});
		try {
			await cleanupRemote(config, inputName, outputName, jsonName);
			await deallocateVm(config);
			setStatus({state: 'done'});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setStatus({state: 'failed', message});
		}
	}

	useEffect(() => {
		void run();
	}, []);

	useInput((input, key) => {
		if (status.state === 'running') return;
		if (status.state === 'failed' && input === 'r') {
			void run();
			return;
		}
		if (key.return) onDone();
	});

	if (status.state === 'running') {
		return (
			<Box borderStyle="round" padding={1}>
				<Text>
					<Spinner type="dots" /> Cleaning up and deallocating the VM…
				</Text>
			</Box>
		);
	}

	if (status.state === 'failed') {
		return (
			<Box flexDirection="column" borderStyle="round" padding={1}>
				<Text bold color="red">
					Could not clean up the VM
				</Text>
				<Box marginTop={1}>
					<Text color="red">{status.message}</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Press r to retry · Enter to return to the menu</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Text bold color="green">
				✓ VM cleaned up and deallocated
			</Text>
			<Box marginTop={1}>
				<Text dimColor>Press Enter to return to the menu</Text>
			</Box>
		</Box>
	);
}
