import {useState} from 'react';
import {basename, extname} from 'node:path';
import {loadConfig} from '../config/store.js';
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

// Linear upload → transcribe flow, mirroring SetupWizard's switch-on-step shape.
export default function TranscribeFlow({onDone}: Props) {
	const config = loadConfig();
	const [step, setStep] = useState<Step>('selectFile');
	const [localPath, setLocalPath] = useState('');

	const inputName = localPath ? basename(localPath) : '';
	const outputName = localPath ? deriveOutputName(localPath) : '';

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
				<Result config={config} outputName={outputName} onDone={onDone} />
			);
	}
}
