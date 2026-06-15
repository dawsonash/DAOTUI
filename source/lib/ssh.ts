import {mkdir, readFile, rm} from 'node:fs/promises';
import {dirname} from 'node:path';
import {execa} from 'execa';
import type {DaoConfig} from '../config/store.js';

export type ConnectionTarget = {
	host: string;
	username: string;
	privateKeyPath: string;
};

/**
 * Generate an ed25519 keypair at `keyPath` (and `keyPath.pub`). The containing
 * directory is created if needed. No passphrase, so the key can be used
 * non-interactively from the TUI (`ssh-keygen -t ed25519 -f <path> -N ""`).
 */
export async function generateKey(keyPath: string): Promise<void> {
	await mkdir(dirname(keyPath), {recursive: true, mode: 0o700});
	// Remove any stale keypair first; ssh-keygen refuses to overwrite.
	await rm(keyPath, {force: true});
	await rm(`${keyPath}.pub`, {force: true});
	await execa('ssh-keygen', [
		'-t',
		'ed25519',
		'-f',
		keyPath,
		'-N',
		'',
		'-C',
		'daotui',
	]);
}

/** Read the public key text the student hands to the admin for authorization. */
export async function readPublicKey(keyPath: string): Promise<string> {
	const pub = await readFile(`${keyPath}.pub`, 'utf8');
	return pub.trim();
}

/**
 * Probe passwordless SSH. Returns true only if the key is already authorized on
 * the VM. Uses BatchMode so a missing/unauthorized key fails fast instead of
 * prompting for a password.
 */
export async function testConnection(target: ConnectionTarget): Promise<boolean> {
	try {
		await execa(
			'ssh',
			[
				'-i',
				target.privateKeyPath,
				'-o',
				'BatchMode=yes',
				'-o',
				'StrictHostKeyChecking=accept-new',
				'-o',
				'ConnectTimeout=8',
				`${target.username}@${target.host}`,
				'echo',
				'ok',
			],
			{reject: false},
		).then(result => {
			if (result.exitCode !== 0) throw new Error(result.stderr);
		});
		return true;
	} catch {
		return false;
	}
}

// --- Workflow-phase mirror upload.sh / download.sh functionality ---

/** Upload a local audio file to the VM's upload dir (see upload.sh). */
export async function uploadFile(
	_config: DaoConfig,
	_localPath: string,
): Promise<void> {
	throw new Error('uploadFile not implemented yet (workflow phase)');
}

/** Download a transcript from the VM's ephemeral dir (see download.sh). */
export async function downloadFile(
	_config: DaoConfig,
	_remoteName: string,
	_localPath: string,
): Promise<void> {
	throw new Error('downloadFile not implemented yet (workflow phase)');
}
