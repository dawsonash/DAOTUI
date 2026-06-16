import {Box, Text, useInput} from 'ink';

type Props = {
	localOutputPath: string;
	onDone: () => void;
};

export default function Result({localOutputPath, onDone}: Props) {
	useInput((_input, key) => {
		if (key.return) onDone();
	});

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Text bold color="green">
				✓ Transcription complete
			</Text>
			<Box marginTop={1} flexDirection="column">
				<Text>Your transcript was saved to:</Text>
				<Text color="cyan">
					{'  '}
					{localOutputPath}
				</Text>
				<Box marginTop={1}>
					<Text dimColor>
						The VM was cleaned up and deallocated.
					</Text>
				</Box>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>Press Enter to return to the menu</Text>
			</Box>
		</Box>
	);
}
