import {execa} from 'execa';
import type {DaoConfig} from '../config/store.js';

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

/** Start the VM before a transcription run. */
export async function startVm(config: DaoConfig): Promise<void> {
	await execa('az', [
		'vm',
		'start',
		'-g',
		config.azure.resourceGroup,
		'-n',
		config.azure.vmName,
	]);
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
