import {Box, Text, useInput} from 'ink';
import type {DaoConfig} from '../../config/store.js';

type Props = {
	config: DaoConfig;
	localPath: string;
	inputName: string;
	outputName: string;
	onNext: () => void;
	onBack: () => void;
};

export default function Confirm({
	config,
	localPath,
	inputName,
	outputName,
	onNext,
	onBack,
}: Props) {
	useInput((input, key) => {
		if (key.return) onNext();
		if (input === 'b') onBack();
	});

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Text bold>Ready to transcribe</Text>
			<Box marginTop={1} flexDirection="column">
				<Text>
					Local file: <Text color="cyan">{localPath}</Text>
				</Text>
				<Text dimColor>Uploads as: {inputName}</Text>
				<Text dimColor>Transcript: {outputName}</Text>
				<Text dimColor>
					Target: {config.vm.username}@{config.vm.host}:
					{config.vm.remoteUploadDir}
				</Text>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>
					The VM is started if it isn&apos;t already. Your local file is kept.
				</Text>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>Press Enter to start · b to pick a different file</Text>
			</Box>
		</Box>
	);
}
