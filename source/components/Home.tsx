import {Box, Text} from 'ink';
import {loadConfig} from '../config/store.js';

// Placeholder landing screen for returning users. Entry point for the future
// upload → WhisperX → download workflow menu.
export default function Home() {
	const config = loadConfig();

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Text>
				<Text color="green">DAOTUI</Text> ready.
			</Text>
			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					VM: {config.vm.username}@{config.vm.host}
				</Text>
				<Text dimColor>Key: {config.vm.privateKeyPath}</Text>
			</Box>
		</Box>
	);
}
