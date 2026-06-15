import {execa} from 'execa';
import {isAzInstalled, isLoggedIn} from './azure.js';

export type PrereqCheck = {
	name: string;
	label: string;
	ok: boolean;
	/** When false, ok=false should block advancing the wizard. */
	required: boolean;
	hint?: string;
};

async function onPath(command: string): Promise<boolean> {
	try {
		const result = await execa(command, ['-V'], {reject: false});
		// ssh/scp/ssh-keygen print version to stderr and may exit non-zero for -V;
		// the call resolving at all means the binary exists.
		return result.exitCode !== undefined;
	} catch {
		return false;
	}
}

/**
 * Run all setup prerequisite checks. OpenSSH tools and the Azure CLI (installed
 * and logged in) are all required: the workflow shells out to `az` to start and
 * deallocate the VM, so a student who finishes setup without it can't actually
 * run the tool.
 */
export async function runPrereqChecks(): Promise<PrereqCheck[]> {
	const [ssh, scp, keygen, azInstalled] = await Promise.all([
		onPath('ssh'),
		onPath('scp'),
		onPath('ssh-keygen'),
		isAzInstalled(),
	]);

	const azLoggedIn = azInstalled ? await isLoggedIn() : false;

	return [
		{name: 'ssh', label: 'ssh', ok: ssh, required: true},
		{name: 'scp', label: 'scp', ok: scp, required: true},
		{name: 'ssh-keygen', label: 'ssh-keygen', ok: keygen, required: true},
		{
			name: 'az',
			label: 'Azure CLI installed',
			ok: azInstalled,
			required: true,
			hint: 'Install: https://learn.microsoft.com/cli/azure/install-azure-cli',
		},
		{
			name: 'az-login',
			label: 'Azure CLI logged in',
			ok: azLoggedIn,
			required: true,
			hint: 'Run `! az login` to authenticate, then re-check.',
		},
	];
}

/** Wizard may advance only when every required check passes. */
export function requiredChecksPass(checks: PrereqCheck[]): boolean {
	return checks.filter(c => c.required).every(c => c.ok);
}
