import {useEffect, useState} from 'react';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {readdir} from 'node:fs/promises';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import {validateLocalFile} from '../../lib/ssh.js';

type Props = {
	onNext: (localPath: string) => void;
	onCancel: () => void;
};

type State =
	| {status: 'input'}
	| {status: 'checking'}
	| {status: 'error'; message: string};

type Suggestion = {name: string; isDir: boolean; full: string};

// How many completions to show at once.
const MAX_SUGGESTIONS = 8;

/** Expand a leading `~` to the user's home directory (mirrors KeyChoice). */
function expandHome(input: string): string {
	const trimmed = input.trim();
	if (trimmed === '~') return homedir();
	if (trimmed.startsWith('~/')) return homedir() + trimmed.slice(1);
	return trimmed;
}

// Split a typed path into the directory to read, the string to prepend to each
// completion (so a chosen suggestion is a usable full path), and the trailing
// partial name we filter on. A trailing slash means "list this dir, empty
// partial"; no slash at all means "complete a name in the cwd".
function splitPath(input: string): {
	dirForRead: string;
	prefix: string;
	partial: string;
} {
	const expanded = expandHome(input);
	const idx = expanded.lastIndexOf('/');
	if (idx === -1) {
		return {dirForRead: '.', prefix: '', partial: expanded};
	}
	const prefix = expanded.slice(0, idx + 1);
	return {
		dirForRead: prefix === '/' ? '/' : prefix,
		prefix,
		partial: expanded.slice(idx + 1),
	};
}

/** Longest common prefix across names, used to grow the path on Tab. */
function longestCommonPrefix(values: string[]): string {
	if (values.length === 0) return '';
	let prefix = values[0]!;
	for (const value of values) {
		while (!value.startsWith(prefix)) prefix = prefix.slice(0, -1);
	}
	return prefix;
}

async function computeSuggestions(input: string): Promise<Suggestion[]> {
	if (input.trim() === '') return [];
	const {dirForRead, prefix, partial} = splitPath(input);
	let entries;
	try {
		entries = await readdir(dirForRead, {withFileTypes: true});
	} catch {
		return [];
	}
	return entries
		.filter(entry => entry.name.startsWith(partial))
		.sort((a, b) => a.name.localeCompare(b.name))
		.slice(0, MAX_SUGGESTIONS)
		.map(entry => {
			const isDir = entry.isDirectory();
			return {
				name: entry.name,
				isDir,
				full: prefix + entry.name + (isDir ? '/' : ''),
			};
		});
}

export default function SelectFile({onNext, onCancel}: Props) {
	const [typed, setTyped] = useState('');
	const [state, setState] = useState<State>({status: 'input'});
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

	// Recompute completions whenever the typed path changes.
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const list = await computeSuggestions(typed);
			if (!cancelled) setSuggestions(list);
		})();
		return () => {
			cancelled = true;
		};
	}, [typed]);

	function applyCompletion() {
		if (suggestions.length === 0) return;
		if (suggestions.length === 1) {
			setTyped(suggestions[0]!.full);
			return;
		}
		const lcp = longestCommonPrefix(suggestions.map(s => s.name));
		if (lcp.length > 0) setTyped(splitPath(typed).prefix + lcp);
	}

	useInput((_input, key) => {
		if (key.escape) onCancel();
		// ink-text-input ignores Tab, so it's free for completion here.
		if (key.tab) applyCompletion();
	});

	async function submit(value: string) {
		const expanded = expandHome(value);
		if (!expanded) return;
		const path = resolve(expanded);
		setState({status: 'checking'});
		const result = await validateLocalFile(path);
		if (result.ok) {
			onNext(path);
		} else {
			setState({status: 'error', message: result.error});
		}
	}

	if (state.status === 'checking') {
		return (
			<Box borderStyle="round" padding={1}>
				<Text>
					<Spinner type="dots" /> Checking file…
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Text bold>Select a file to transcribe</Text>
			<Box marginTop={1}>
				<Text>{'> '}</Text>
				<TextInput
					value={typed}
					onChange={setTyped}
					onSubmit={submit}
					placeholder="/path/to/video.mp4"
				/>
			</Box>
			{suggestions.length > 0 ? (
				<Box marginTop={1} flexDirection="column">
					{suggestions.map(s => (
						<Text key={s.full} color={s.isDir ? 'blue' : undefined} dimColor>
							{s.name}
							{s.isDir ? '/' : ''}
						</Text>
					))}
				</Box>
			) : null}
			{state.status === 'error' ? (
				<Box marginTop={1}>
					<Text color="red">{state.message}</Text>
				</Box>
			) : null}
			<Box marginTop={1}>
				<Text dimColor>
					Type a path · Tab to autocomplete · Enter to continue · Esc to cancel
				</Text>
			</Box>
		</Box>
	);
}
