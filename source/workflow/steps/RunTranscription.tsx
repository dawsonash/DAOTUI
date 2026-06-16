import {useEffect, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import Spinner from 'ink-spinner';
import type {DaoConfig} from '../../config/store.js';
import {startVm} from '../../lib/azure.js';
import {runTranscription, uploadFile} from '../../lib/ssh.js';

type Props = {
	config: DaoConfig;
	localPath: string;
	inputName: string;
	outputName: string;
	onNext: () => void;
	onBack: () => void;
};

type Phase = 'vm' | 'upload' | 'transcribe';

type Status =
	| {state: 'running'; phase: Phase}
	| {state: 'failed'; phase: Phase; message: string}
	| {state: 'done'};

const PHASES: Phase[] = ['vm', 'upload', 'transcribe'];

export default function RunTranscription({
	config,
	localPath,
	inputName,
	outputName,
	onNext,
	onBack,
}: Props) {
	const [status, setStatus] = useState<Status>({state: 'running', phase: 'vm'});

	function label(phase: Phase): string {
		if (phase === 'vm') return 'Start VM';
		if (phase === 'upload') return `Upload ${inputName}`;
		return 'Transcribe (this can take a while)';
	}

	// Run phases sequentially from `fromIndex`; the earlier phases are idempotent
	// enough that retrying from the failed one is safe.
	async function run(fromIndex: number) {
		for (let i = fromIndex; i < PHASES.length; i++) {
			const phase = PHASES[i]!;
			setStatus({state: 'running', phase});
			try {
				if (phase === 'vm') await startVm(config);
				else if (phase === 'upload') await uploadFile(config, localPath);
				else await runTranscription(config, inputName, outputName);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setStatus({state: 'failed', phase, message});
				return;
			}
		}
		setStatus({state: 'done'});
		onNext();
	}

	useEffect(() => {
		void run(0);
	}, []);

	useInput((input, key) => {
		if (status.state !== 'failed') return;
		if (input === 'r') void run(PHASES.indexOf(status.phase));
		if (input === 'b' || key.escape) onBack();
	});

	const activeIndex =
		status.state === 'done' ? PHASES.length : PHASES.indexOf(status.phase);

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Text bold>Transcribing {inputName}</Text>
			<Box marginTop={1} flexDirection="column">
				{PHASES.map((phase, i) => {
					const done = i < activeIndex;
					const failed = status.state === 'failed' && i === activeIndex;
					const running = status.state === 'running' && i === activeIndex;
					return (
						<Box key={phase}>
							{done ? (
								<Text color="green">✓ </Text>
							) : failed ? (
								<Text color="red">✗ </Text>
							) : running ? (
								<Text color="cyan">
									<Spinner type="dots" />{' '}
								</Text>
							) : (
								<Text dimColor>○ </Text>
							)}
							<Text dimColor={!done && !running && !failed}>{label(phase)}</Text>
						</Box>
					);
				})}
			</Box>
			{status.state === 'failed' ? (
				<Box marginTop={1} flexDirection="column">
					<Text color="red">{status.message}</Text>
					<Box marginTop={1}>
						<Text dimColor>Press r to retry · b to pick a different file</Text>
					</Box>
				</Box>
			) : null}
		</Box>
	);
}
