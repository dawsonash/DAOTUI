import {useEffect, useState} from 'react';
import {homedir} from 'node:os';
import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import {discoverKeys} from '../../lib/ssh.js';

type Props = {
	defaultNewPath: string;
	onChoose: (keyPath: string, mode: 'new' | 'existing') => void;
};

// Sentinel values for the non-key menu items.
const CUSTOM = '\0custom';
const GENERATE = '\0generate';

type MenuItem = {label: string; value: string};

/** Expand a leading `~` to the user's home directory. */
function expandHome(input: string): string {
	const trimmed = input.trim();
	if (trimmed === '~') return homedir();
	if (trimmed.startsWith('~/')) return homedir() + trimmed.slice(1);
	return trimmed;
}

export default function KeyChoice({defaultNewPath, onChoose}: Props) {
	const [items, setItems] = useState<MenuItem[] | undefined>();
	const [customPath, setCustomPath] = useState<string | undefined>();
	const [typed, setTyped] = useState('');

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const found = await discoverKeys();
			if (cancelled) return;
			setItems([
				...found.map(k => ({label: k.privateKeyPath, value: k.privateKeyPath})),
				{label: 'Enter a custom path…', value: CUSTOM},
				{label: 'Generate a new key for me', value: GENERATE},
			]);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	function handleSelect(item: MenuItem) {
		if (item.value === GENERATE) {
			onChoose(defaultNewPath, 'new');
		} else if (item.value === CUSTOM) {
			setCustomPath('');
		} else {
			onChoose(item.value, 'existing');
		}
	}

	if (!items) {
		return (
			<Box borderStyle="round" padding={1}>
				<Text>
					<Spinner type="dots" /> Looking for existing SSH keys…
				</Text>
			</Box>
		);
	}

	if (customPath !== undefined) {
		return (
			<Box flexDirection="column" borderStyle="round" padding={1}>
				<Text bold>Path to your existing private key</Text>
				<Box marginTop={1}>
					<Text>{'> '}</Text>
					<TextInput
						value={typed}
						onChange={setTyped}
						onSubmit={value => onChoose(expandHome(value), 'existing')}
						placeholder="~/.ssh/id_ed25519"
					/>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Press Enter to confirm.</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Text bold>Choose your SSH key</Text>
			<Box marginTop={1}>
				<Text dimColor>
					Use an existing key, or have one generated for you.
				</Text>
			</Box>
			<Box marginTop={1}>
				<SelectInput items={items} onSelect={handleSelect} />
			</Box>
		</Box>
	);
}
