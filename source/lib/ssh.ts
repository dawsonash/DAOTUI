import {access, mkdir, readdir, readFile, rm} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
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

export type KeyCandidate = {
	/** Absolute path to the private key. */
	privateKeyPath: string;
	/** True when a sibling `<path>.pub` exists. */
	hasPublic: boolean;
};

// Non-key files that live in ~/.ssh and should never be offered as a keypair.
const SSH_NON_KEY_FILES = new Set(['config', 'authorized_keys']);

/**
 * Discover existing SSH keypairs in the user's `~/.ssh`. A candidate is any file
 * `X` (not itself a `.pub`) that has a sibling `X.pub`. This is local-only: it
 * lists filenames and never reads private key contents. A missing `~/.ssh`
 * yields an empty list.
 */
export async function discoverKeys(): Promise<KeyCandidate[]> {
	const sshDir = join(homedir(), '.ssh');
	let entries: string[];
	try {
		entries = await readdir(sshDir);
	} catch {
		return [];
	}

	const pubs = new Set(entries.filter(name => name.endsWith('.pub')));
	const candidates: KeyCandidate[] = [];
	for (const name of entries) {
		if (name.endsWith('.pub')) continue;
		if (name.startsWith('known_hosts')) continue;
		if (SSH_NON_KEY_FILES.has(name)) continue;
		if (!pubs.has(`${name}.pub`)) continue;
		candidates.push({privateKeyPath: join(sshDir, name), hasPublic: true});
	}
	return candidates;
}

/**
 * Return the public key text for `keyPath`. Prefers an existing `<path>.pub`;
 * otherwise derives it from the private key via `ssh-keygen -y`. Does not write
 * anything to disk (so we never touch the user's ~/.ssh).
 */
export async function ensurePublicKey(keyPath: string): Promise<string> {
	try {
		await access(`${keyPath}.pub`);
		return await readPublicKey(keyPath);
	} catch {
		// Fall through to deriving from the private key.
	}
	const result = await execa('ssh-keygen', ['-y', '-f', keyPath]);
	return result.stdout.trim();
}

export type ExistingKeyResult =
	| {ok: true; publicKey: string}
	| {ok: false; error: string};

/**
 * Validate that `keyPath` points at a usable private key and resolve its public
 * key. Maps the common failures (missing file, passphrase-protected key) to a
 * student-friendly message rather than a raw ssh-keygen error.
 */
export async function validateExistingKey(
	keyPath: string,
): Promise<ExistingKeyResult> {
	try {
		await access(keyPath);
	} catch {
		return {ok: false, error: `No file found at ${keyPath}`};
	}
	try {
		const publicKey = await ensurePublicKey(keyPath);
		return {ok: true, publicKey};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/passphrase|incorrect passphrase|load failed/i.test(message)) {
			return {
				ok: false,
				error:
					'This key looks passphrase-protected. Use a key without a passphrase, or generate a new one.',
			};
		}
		return {ok: false, error: `Could not read a valid SSH key: ${message}`};
	}
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
