import {Box, Text, useInput} from 'ink';

type Props = {
	onNext: () => void;
};

export default function Welcome({onNext}: Props) {
	useInput((_input, key) => {
		if (key.return) onNext();
	});

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Text>
				Welcome to <Text color="green">Digital Accessibility Offices Terminal User Interface</Text> setup.
			</Text>
			<Box marginTop={1} flexDirection="column">
				<Text>This one-time wizard will:</Text>
				<Text>• check required tools (ssh, scp, Azure CLI)</Text>
				<Text>• use your existing SSH key, or generate a new one for you</Text>
			</Box>
			<Box marginTop={1}>
				<Text>Your setup is saved, so you only have to do this once.</Text>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>Press Enter to begin.</Text>
			</Box>
		</Box>
	);
}
