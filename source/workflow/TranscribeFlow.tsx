import {useState} from 'react';
import {basename, extname} from 'node:path';
import {loadConfig} from '../config/store.js';
import {sanitizeRemoteName} from '../lib/ssh.js';
import SelectFile from './steps/SelectFile.js';
import Confirm from './steps/Confirm.js';
import RunTranscription from './steps/RunTranscription.js';
import Result from './steps/Result.js';

type Step = 'selectFile' | 'confirm' | 'run' | 'result';

type Props = {
	onDone: () => void;
};

// Transcript extension caption.sh/WhisperX writes. Adjust once a real run
// confirms what actually lands in the ephemeral dir.
const OUTPUT_EXT = '.srt';

/** Derive the transcript name caption.sh should write from the input file. */
export function deriveOutputName(localPath: string): string {
	const base = basename(localPath);
	const stem = base.slice(0, base.length - extname(base).length) || base;
	return `${stem}${OUTPUT_EXT}`;
}

/**
 * Derive the word-confidence JSON name from the transcript name (same stem, `.json`).
 * Mirrors what caption_qc.sh/test_qc.py write next to the transcript.
 */
export function deriveJsonName(outputName: string): string {
	const stem =
		outputName.slice(0, outputName.length - extname(outputName).length) ||
		outputName;
	return `${stem}.json`;
}

// Linear upload → transcribe flow, mirroring SetupWizard's switch-on-step shape.
export default function TranscribeFlow({onDone}: Props) {
	const config = loadConfig();
	const [step, setStep] = useState<Step>('selectFile');
	const [localPath, setLocalPath] = useState('');

	// Sanitize once: the upload, the caption.sh args, and the transcript name all
	// use the space-free remote name so caption.sh's unquoted `$1 $2` can't split.
	const inputName = localPath ? sanitizeRemoteName(basename(localPath)) : '';
	const outputName = inputName ? deriveOutputName(inputName) : '';
	const jsonName = outputName ? deriveJsonName(outputName) : '';

	switch (step) {
		case 'selectFile':
			return (
				<SelectFile
					onNext={path => {
						setLocalPath(path);
						setStep('confirm');
					}}
					onCancel={onDone}
				/>
			);
		case 'confirm':
			return (
				<Confirm
					config={config}
					localPath={localPath}
					inputName={inputName}
					outputName={outputName}
					onNext={() => setStep('run')}
					onBack={() => setStep('selectFile')}
				/>
			);
		case 'run':
			return (
				<RunTranscription
					config={config}
					localPath={localPath}
					inputName={inputName}
					outputName={outputName}
					onNext={() => setStep('result')}
					onBack={() => setStep('selectFile')}
				/>
			);
		case 'result':
			return (
				<Result
					config={config}
					outputName={outputName}
					jsonName={jsonName}
					localPath={localPath}
					onDone={onDone}
				/>
			);
	}
}
