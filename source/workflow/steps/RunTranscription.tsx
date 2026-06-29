import {useEffect, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import Spinner from 'ink-spinner';
import type {DaoConfig} from '../../config/store.js';
import {startVm} from '../../lib/azure.js';
import {downloadFile, runTranscription, uploadFile} from '../../lib/ssh.js';

type Props = {
	config: DaoConfig;
	localPath: string;
	inputName: string;
	outputName: string;
	localOutputName: string;
	localOutputPath: string;
	onNext: () => void;
	onBack: () => void;
};

// Cleanup/deallocate intentionally happen later (see Teardown): the VM must stay
// alive past download so Result/ReviewWords can read the confidence JSON and
// transcript over ssh for QC review.
type Phase = 'vm' | 'upload' | 'transcribe' | 'download';

type Status =
	| {state: 'running'; phase: Phase; detail?: string}
	| {state: 'failed'; phase: Phase; message: string}
	| {state: 'done'};

const PHASES: Phase[] = ['vm', 'upload', 'transcribe', 'download'];

export default function RunTranscription({
	config,
	localPath,
	inputName,
	outputName,
	localOutputName,
	localOutputPath,
	onNext,
	onBack,
}: Props) {
	const [status, setStatus] = useState<Status>({state: 'running', phase: 'vm'});

	function label(phase: Phase): string {
		if (phase === 'vm') return 'Start VM';
		if (phase === 'upload') return `Upload ${inputName}`;
		if (phase === 'transcribe') return 'Transcribe (this can take a while)';
		return `Download ${localOutputName}`;
	}

	// Run phases sequentially from `fromIndex`; the earlier phases are idempotent
	// enough that retrying from the failed one is safe.
	async function run(fromIndex: number) {
		for (let i = fromIndex; i < PHASES.length; i++) {
			const phase = PHASES[i]!;
			setStatus({state: 'running', phase});
			try {
				if (phase === 'vm')
					await startVm(config, detail =>
						setStatus({state: 'running', phase, detail}),
					);
				else if (phase === 'upload')
					await uploadFile(config, localPath, inputName);
				else if (phase === 'transcribe')
					await runTranscription(config, inputName, outputName);
				else await downloadFile(config, outputName, localOutputPath);
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
							<Text dimColor={!done && !running && !failed}>
								{label(phase)}
								{running && status.state === 'running' && status.detail
									? ` — ${status.detail}`
									: ''}
							</Text>
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
