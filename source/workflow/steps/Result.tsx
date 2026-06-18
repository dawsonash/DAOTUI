import {useEffect, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import Spinner from 'ink-spinner';
import type {DaoConfig} from '../../config/store.js';
import {fetchEphemeralFile} from '../../lib/ssh.js';
import {
	analyzeConfidence,
	DEFAULT_THRESHOLD,
	parseWhisperJson,
	type ConfidenceAnalysis,
	type WhisperDoc,
} from '../../lib/confidence.js';
import ReviewWords from './ReviewWords.js';

type Props = {
	config: DaoConfig;
	outputName: string;
	jsonName: string;
	localPath: string;
	onDone: () => void;
};

// Confidence is shown as a percentage; the flag threshold copy is derived from
// DEFAULT_THRESHOLD so it stays in sync if the cutoff changes.
const THRESHOLD_PCT = Math.round(DEFAULT_THRESHOLD * 100);

type State =
	| {status: 'loading'}
	| {status: 'unavailable'}
	| {status: 'ready'; doc: WhisperDoc; analysis: ConfidenceAnalysis}
	| {status: 'reviewing'; doc: WhisperDoc; analysis: ConfidenceAnalysis};

export default function Result({
	config,
	outputName,
	jsonName,
	localPath,
	onDone,
}: Props) {
	const [state, setState] = useState<State>({status: 'loading'});

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const raw = await fetchEphemeralFile(config, jsonName);
				const doc = parseWhisperJson(raw);
				const analysis = analyzeConfidence(doc);
				if (!cancelled) setState({status: 'ready', doc, analysis});
			} catch {
				// No JSON / parse failure: fall back to the plain "it's on the VM"
				// message rather than erroring out a successful transcription.
				if (!cancelled) setState({status: 'unavailable'});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [config, jsonName]);

	useInput((input, key) => {
		if (state.status === 'loading' || state.status === 'reviewing') return;
		if (
			state.status === 'ready' &&
			(input === 'r' || input === 'R') &&
			state.analysis.flagged.length > 0
		) {
			setState({status: 'reviewing', doc: state.doc, analysis: state.analysis});
			return;
		}
		if (key.return) onDone();
	});

	if (state.status === 'reviewing') {
		return (
			<ReviewWords
				config={config}
				outputName={outputName}
				localPath={localPath}
				flagged={state.analysis.flagged}
				doc={state.doc}
				onDone={onDone}
			/>
		);
	}

	const ephemeralLine = (
		<Text dimColor>
			{'  '}
			{config.vm.username}@{config.vm.host}:~/{config.vm.remoteEphemeralDir}
		</Text>
	);

	if (state.status === 'loading') {
		return (
			<Box flexDirection="column" borderStyle="round" padding={1}>
				<Text bold color="green">
					✓ Transcription complete
				</Text>
				<Box marginTop={1}>
					<Text>
						<Spinner type="dots" /> Analyzing word confidence…
					</Text>
				</Box>
			</Box>
		);
	}

	if (state.status === 'unavailable') {
		return (
			<Box flexDirection="column" borderStyle="round" padding={1}>
				<Text bold color="green">
					✓ Transcription complete
				</Text>
				<Box marginTop={1} flexDirection="column">
					<Text>
						Your transcript <Text color="cyan">{outputName}</Text> is on the VM in:
					</Text>
					{ephemeralLine}
					<Box marginTop={1}>
						<Text dimColor>
							Word-confidence data wasn&apos;t available for this run, so QC review
							is skipped.
						</Text>
					</Box>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Press Enter to return to the menu</Text>
				</Box>
			</Box>
		);
	}

	// status === 'ready'
	const {averageConfidence, scoredWordCount, flagged} = state.analysis;
	const avgPct = (averageConfidence * 100).toFixed(1);
	const avgColor =
		averageConfidence >= 0.85
			? 'green'
			: averageConfidence >= 0.75
			? 'yellow'
			: 'red';

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Text bold color="green">
				✓ Transcription complete
			</Text>
			<Box marginTop={1} flexDirection="column">
				<Text>
					Transcript <Text color="cyan">{outputName}</Text> is on the VM in:
				</Text>
				{ephemeralLine}
			</Box>
			<Box marginTop={1} flexDirection="column">
				<Text>
					Average word confidence:{' '}
					<Text bold color={avgColor}>
						{avgPct}%
					</Text>{' '}
					<Text dimColor>({scoredWordCount} words)</Text>
				</Text>
				{flagged.length > 0 ? (
					<Text>
						<Text bold color="red">
							{flagged.length}
						</Text>{' '}
						{flagged.length === 1 ? 'word' : 'words'} below {THRESHOLD_PCT}% —
						possible lexical errors.
					</Text>
				) : (
					<Text color="green">
						No words below {THRESHOLD_PCT}% — looks clean.
					</Text>
				)}
			</Box>
			<Box marginTop={1}>
				{flagged.length > 0 ? (
					<Text dimColor>Press R to review flagged words · Enter to return</Text>
				) : (
					<Text dimColor>Press Enter to return to the menu</Text>
				)}
			</Box>
		</Box>
	);
}
