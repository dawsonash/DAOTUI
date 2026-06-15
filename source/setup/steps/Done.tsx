import {Box, Text, useInput} from 'ink';

type Props = {
	onFinish: () => void;
};

export default function Done({onFinish}: Props) {
	useInput((_input, key) => {
		if (key.return) onFinish();
	});

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Text bold color="green">
				✓ Setup complete
			</Text>
			<Box marginTop={1}>
				<Text>You're all set — future launches will skip this wizard.</Text>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>Press Enter to continue.</Text>
			</Box>
		</Box>
	);
}
