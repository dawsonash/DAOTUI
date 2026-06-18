import {useState} from 'react';
import {writeFile} from 'node:fs/promises';
import {basename, dirname, extname, join} from 'node:path';
import {Box, Text, useInput} from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import type {DaoConfig} from '../../config/store.js';
import {fetchEphemeralFile} from '../../lib/ssh.js';
import {
	applyCorrectionsToSrt,
	formatTimestamp,
	type FlaggedWord,
	type SrtCorrection,
	type WhisperDoc,
} from '../../lib/confidence.js';

type Props = {
	config: DaoConfig;
	outputName: string;
	localPath: string;
	flagged: FlaggedWord[];
	doc: WhisperDoc;
	onDone: () => void;
};

type Phase =
	| {kind: 'review'}
	| {kind: 'saving'}
	| {kind: 'saved'; path: string; count: number}
	| {kind: 'nochange'}
	| {kind: 'error'; message: string};

// Build the local path for the corrected transcript: next to the source video,
// `<stem>.corrected.srt` (so the user QCs against their local copy).
function correctedPath(localPath: string, outputName: string): string {
	const stem = outputName.slice(0, outputName.length - extname(outputName).length);
	return join(dirname(localPath), `${stem || basename(outputName)}.corrected.srt`);
}

export default function ReviewWords({
	config,
	outputName,
	localPath,
	flagged,
	doc,
	onDone,
}: Props) {
	const [index, setIndex] = useState(0);
	// Corrections keyed by "segmentIndex:wordIndex" so re-visiting a word overwrites.
	const [corrections, setCorrections] = useState<Map<string, SrtCorrection>>(
		new Map(),
	);
	const [phase, setPhase] = useState<Phase>({kind: 'review'});

	const current = flagged[index];
	const originalWord = current?.word ?? '';
	const [draft, setDraft] = useState(originalWord);

	async function finish(collected: Map<string, SrtCorrection>) {
		if (collected.size === 0) {
			setPhase({kind: 'nochange'});
			return;
		}
		setPhase({kind: 'saving'});
		try {
			const srt = await fetchEphemeralFile(config, outputName);
			const corrected = applyCorrectionsToSrt(srt, [...collected.values()]);
			const outPath = correctedPath(localPath, outputName);
			await writeFile(outPath, corrected, 'utf8');
			setPhase({kind: 'saved', path: outPath, count: collected.size});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setPhase({kind: 'error', message});
		}
	}

	function advance(value: string) {
		if (!current) return;
		const next = new Map(corrections);
		const trimmed = value.trim();
		const key = `${current.segmentIndex}:${current.wordIndex}`;
		if (trimmed && trimmed !== current.word) {
			next.set(key, {
				start: current.start,
				word: current.word,
				newWord: trimmed,
			});
		} else {
			// Re-visiting and clearing a previously-entered correction removes it.
			next.delete(key);
		}
		setCorrections(next);

		if (index + 1 < flagged.length) {
			const following = flagged[index + 1]!;
			setIndex(index + 1);
			setDraft(following.word);
		} else {
			void finish(next);
		}
	}

	useInput((_input, key) => {
		// During review, Enter is handled by TextInput's onSubmit; only the terminal
		// phases react to Enter here. Esc finishes early, saving what's collected.
		if (phase.kind === 'review') {
			if (key.escape) void finish(corrections);
			return;
		}
		if (phase.kind === 'saving') return;
		if (key.return) onDone();
	});

	if (phase.kind === 'saving') {
		return (
			<Box borderStyle="round" padding={1}>
				<Text>
					<Spinner type="dots" /> Writing corrected transcript…
				</Text>
			</Box>
		);
	}

	if (phase.kind === 'saved') {
		return (
			<Box flexDirection="column" borderStyle="round" padding={1}>
				<Text bold color="green">
					✓ Corrected transcript written
				</Text>
				<Box marginTop={1} flexDirection="column">
					<Text>
						Applied{' '}
						<Text bold>{phase.count}</Text>{' '}
						{phase.count === 1 ? 'correction' : 'corrections'} to:
					</Text>
					<Text color="cyan">{'  '}{phase.path}</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Press Enter to return to the menu</Text>
				</Box>
			</Box>
		);
	}

	if (phase.kind === 'nochange') {
		return (
			<Box flexDirection="column" borderStyle="round" padding={1}>
				<Text>No corrections entered — transcript left as-is.</Text>
				<Box marginTop={1}>
					<Text dimColor>Press Enter to return to the menu</Text>
				</Box>
			</Box>
		);
	}

	if (phase.kind === 'error') {
		return (
			<Box flexDirection="column" borderStyle="round" padding={1}>
				<Text bold color="red">
					Could not write the corrected transcript
				</Text>
				<Box marginTop={1}>
					<Text color="red">{phase.message}</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Press Enter to return to the menu</Text>
				</Box>
			</Box>
		);
	}

	// phase === 'review'
	if (!current) {
		// Shouldn't happen (Result only enters review when flagged.length > 0).
		return null;
	}

	const segment = doc.segments[current.segmentIndex];
	const words = segment?.words ?? [];
	const scorePct = (current.score * 100).toFixed(0);

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Box justifyContent="space-between">
				<Text bold>Review flagged words</Text>
				<Text dimColor>
					{index + 1}/{flagged.length}
				</Text>
			</Box>

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>Sentence:</Text>
				<Text>
					{words.map((w, i) => (
						<Text key={i}>
							{i > 0 ? ' ' : ''}
							{i === current.wordIndex ? (
								<Text bold color="red">
									{w.word}
								</Text>
							) : (
								w.word
							)}
						</Text>
					))}
				</Text>
			</Box>

			<Box marginTop={1} flexDirection="column">
				<Text>
					Flagged word: <Text bold color="red">{current.word}</Text>{' '}
					<Text dimColor>({scorePct}% confidence)</Text>
				</Text>
				<Text>
					Timestamp: <Text color="cyan">{formatTimestamp(current.start)}</Text>{' '}
					<Text dimColor>(scrub here in your video to check)</Text>
				</Text>
			</Box>

			<Box marginTop={1}>
				<Text>Correct word: </Text>
				<TextInput value={draft} onChange={setDraft} onSubmit={advance} />
			</Box>

			<Box marginTop={1}>
				<Text dimColor>
					Enter to confirm &amp; next (leave unchanged to skip) · Esc to finish
				</Text>
			</Box>
		</Box>
	);
}
