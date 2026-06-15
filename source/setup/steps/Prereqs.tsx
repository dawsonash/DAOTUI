import {useEffect, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import Spinner from 'ink-spinner';
import {
	runPrereqChecks,
	requiredChecksPass,
	type PrereqCheck,
} from '../../lib/prereqs.js';

type Props = {
	onNext: () => void;
};

export default function Prereqs({onNext}: Props) {
	const [checks, setChecks] = useState<PrereqCheck[] | undefined>();
	const [loading, setLoading] = useState(true);

	async function check() {
		setLoading(true);
		setChecks(await runPrereqChecks());
		setLoading(false);
	}

	useEffect(() => {
		void check();
	}, []);

	const canAdvance = checks ? requiredChecksPass(checks) : false;

	useInput((input, key) => {
		if (loading) return;
		if (input === 'r') void check();
		if (key.return && canAdvance) onNext();
	});

	return (
		<Box flexDirection="column" borderStyle="round" padding={1}>
			<Text bold>Checking prerequisites</Text>
			<Box marginTop={1} flexDirection="column">
				{loading || !checks ? (
					<Text>
						<Spinner type="dots" /> Running checks…
					</Text>
				) : (
					checks.map(c => (
						<Box key={c.name} flexDirection="column">
							<Text>
								<Text color={c.ok ? 'green' : c.required ? 'red' : 'yellow'}>
									{c.ok ? '✓' : c.required ? '✗' : '!'}
								</Text>{' '}
								{c.label}
							</Text>
							{!c.ok && c.hint ? (
								<Text dimColor>    {c.hint}</Text>
							) : null}
						</Box>
					))
				)}
			</Box>
			<Box marginTop={1}>
				{loading ? null : canAdvance ? (
					<Text dimColor>Press Enter to continue · r to re-check</Text>
				) : (
					<Text color="red">
						Required tools missing — install them, then press r to re-check.
					</Text>
				)}
			</Box>
		</Box>
	);
}
