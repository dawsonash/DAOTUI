import {Box, Text, useInput} from 'ink';
import type {DaoConfig} from '../../config/store.js';

type Props = {
	config: DaoConfig;
	outputName: string;
	onDone: () => void;
};

export default function Result({config, outputName, onDone}: Props) {
	useInput((_input, key) => {
		if (key.return) onDone();
	});

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Text bold color="green">
				✓ Transcription complete
			</Text>
			<Box marginTop={1} flexDirection="column">
				<Text>
					Your transcript <Text color="cyan">{outputName}</Text> is on the VM in:
				</Text>
				<Text dimColor>
					{'  '}
					{config.vm.username}@{config.vm.host}:~/{config.vm.remoteEphemeralDir}
				</Text>
				<Box marginTop={1}>
					<Text dimColor>
						Downloading it from the TUI isn&apos;t wired up yet — grab it from the
						VM for now.
					</Text>
				</Box>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>Press Enter to return to the menu</Text>
			</Box>
		</Box>
	);
}
