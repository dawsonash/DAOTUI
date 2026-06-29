import {execa} from 'execa';
import type {DaoConfig} from '../config/store.js';
import {probeConnection} from './ssh.js';

const SSH_POLL_INTERVAL_MS = 3000;
const SSH_READY_TIMEOUT_MS = 5 * 60 * 1000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** True if the `az` CLI is on PATH and runnable. */
export async function isAzInstalled(): Promise<boolean> {
	try {
		const result = await execa('az', ['version'], {reject: false});
		return result.exitCode === 0;
	} catch {
		return false;
	}
}

/** True if `az` has an authenticated account (`az account show` succeeds). */
export async function isLoggedIn(): Promise<boolean> {
	try {
		const result = await execa('az', ['account', 'show'], {reject: false});
		return result.exitCode === 0;
	} catch {
		return false;
	}
}

// --- Workflow-phase mirror upload.sh / download.sh `az` calls. ---

/** True if the VM's power state is already `running`. */
export async function isVmRunning(config: DaoConfig): Promise<boolean> {
	const result = await execa(
		'az',
		[
			'vm',
			'get-instance-view',
			'-g',
			config.azure.resourceGroup,
			'-n',
			config.azure.vmName,
			'--query',
			"instanceView.statuses[?starts_with(code, 'PowerState/')].code | [0]",
			'-o',
			'tsv',
		],
		{reject: false},
	);
	return result.stdout.trim() === 'PowerState/running';
}

/**
 * Start the VM (if needed) and return only once it actually accepts SSH — the
 * real signal that the next phase (`upload`) can connect. `onStatus` surfaces
 * sub-progress so the UI shows what it's waiting on rather than a blank spinner.
 */
export async function startVm(
	config: DaoConfig,
	onStatus: (message: string) => void = () => {},
): Promise<void> {
	// Skip the start entirely when the VM is already up (the common case — the VM
	// stays alive until Teardown deallocates it).
	if (!(await isVmRunning(config))) {
		onStatus('Starting VM…');
		// `--no-wait` returns as soon as Azure accepts the request instead of
		// blocking on full ARM completion; we gate on the SSH probe below instead,
		// which is what actually matters for the upload phase.
		await execa('az', [
			'vm',
			'start',
			'--no-wait',
			'-g',
			config.azure.resourceGroup,
			'-n',
			config.azure.vmName,
		]);
	}

	// A VM can report `running` before sshd is accepting connections, so poll the
	// real SSH probe until it succeeds (or we time out).
	const target = {
		host: config.vm.host,
		username: config.vm.username,
		privateKeyPath: config.vm.privateKeyPath,
	};
	onStatus('Waiting for the VM to accept connections…');
	const deadline = Date.now() + SSH_READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const probe = await probeConnection(target);
		if (probe.ok) return;
		// The VM answered but rejected the key — polling won't authorize it, so
		// fail fast with an actionable message instead of waiting out the timeout.
		if (probe.reason === 'unauthorized') {
			throw new Error(
				`The VM rejected your SSH key — it isn't authorized on the VM yet. ` +
					`Re-run setup to re-authorize it. (${probe.detail})`,
			);
		}
		await sleep(SSH_POLL_INTERVAL_MS);
	}
	throw new Error('VM did not become reachable over SSH in time.');
}

/** Deallocate the VM when a user finishes, to save cost. */
export async function deallocateVm(config: DaoConfig): Promise<void> {
	await execa('az', [
		'vm',
		'deallocate',
		'-g',
		config.azure.resourceGroup,
		'-n',
		config.azure.vmName,
	]);
}
