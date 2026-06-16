import {useState} from 'react';
import {Box, Text, useApp} from 'ink';
import SelectInput from 'ink-select-input';
import {loadConfig} from '../config/store.js';
import TranscribeFlow from '../workflow/TranscribeFlow.js';

type View = 'menu' | 'transcribe';
type MenuItem = {label: string; value: string};

// Landing screen for returning users. Entry point for the upload → WhisperX
// workflow; more actions (download, settings) can slot into the menu later.
export default function Home() {
	const config = loadConfig();
	const {exit} = useApp();
	const [view, setView] = useState<View>('menu');

	if (view === 'transcribe') {
		return <TranscribeFlow onDone={() => setView('menu')} />;
	}

	const items: MenuItem[] = [
		{label: 'Transcribe a file', value: 'transcribe'},
		{label: 'Quit', value: 'quit'},
	];

	function handleSelect(item: MenuItem) {
		if (item.value === 'transcribe') setView('transcribe');
		else if (item.value === 'quit') exit();
	}

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
			<Box marginTop={1}>
				<SelectInput items={items} onSelect={handleSelect} />
			</Box>
		</Box>
	);
}
