import {access, mkdir, readdir, readFile, rm, stat} from 'node:fs/promises';
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

// --- Workflow-phase mirror upload.sh / caption.sh functionality ---

// Hardening flags shared by non-interactive scp/ssh, mirroring testConnection:
// the key, BatchMode so a missing/unauthorized key fails fast instead of
// prompting, and accept-new host keys so a first connection isn't blocked.
function hardeningOptions(privateKeyPath: string): string[] {
	return [
		'-i',
		privateKeyPath,
		'-o',
		'BatchMode=yes',
		'-o',
		'StrictHostKeyChecking=accept-new',
		'-o',
		'ConnectTimeout=8',
	];
}

// Single-quote a value for safe interpolation into a remote shell command,
// escaping any embedded single quotes. Lets file names with spaces survive the
// trip through ssh's remote shell.
function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Make a file name safe to pass through caption.sh's *unquoted* `$1 $2` and the
 * remote shell: keep alphanumerics, dot, dash, underscore; collapse everything
 * else (spaces, quotes, …) to underscores. The user's local file is untouched —
 * this only governs the name of the copy uploaded to the VM.
 */
export function sanitizeRemoteName(name: string): string {
	return name.replace(/[^A-Za-z0-9._-]/g, '_');
}

export type LocalFileResult = {ok: true} | {ok: false; error: string};

/**
 * Confirm a local path points at a real file before we start the VM and upload.
 * Rejects missing paths and directories with a student-friendly message.
 */
export async function validateLocalFile(
	localPath: string,
): Promise<LocalFileResult> {
	try {
		const info = await stat(localPath);
		if (!info.isFile()) {
			return {ok: false, error: `${localPath} is not a file`};
		}
		return {ok: true};
	} catch {
		return {ok: false, error: `No file found at ${localPath}`};
	}
}

/**
 * Upload a local media file into the VM's upload dir (see upload.sh), storing it
 * under `remoteName` (a sanitized, space-free name — see sanitizeRemoteName).
 */
export async function uploadFile(
	config: DaoConfig,
	localPath: string,
	remoteName: string,
): Promise<void> {
	const {host, username, privateKeyPath, remoteUploadDir} = config.vm;
	const result = await execa(
		'scp',
		[
			...hardeningOptions(privateKeyPath),
			localPath,
			`${username}@${host}:${remoteUploadDir}/${remoteName}`,
		],
		{reject: false},
	);
	if (result.exitCode !== 0) {
		throw new Error(result.stderr || `scp failed (exit ${result.exitCode})`);
	}
}

// The transcription script on the VM, invoked as `bash <script> <in> <out>`
// (see vm/caption_qc.sh): it activates the venv, runs WhisperX over the uploaded
// input via test_qc.py, then moves *both* the transcript and the word-confidence
// JSON sidecar into the ephemeral dir. This is the QC variant of the original
// caption.sh — deploy vm/caption_qc.sh + vm/test_qc.py to the VM (see vm/README).
const REMOTE_CAPTION_SCRIPT = 'caption_qc.sh';

/**
 * Run caption.sh on the VM against an already-uploaded file. `inputName` and
 * `outputName` are basenames relative to the upload dir (caption.sh cd's into
 * it before running). This blocks for the duration of the transcription.
 */
export async function runTranscription(
	config: DaoConfig,
	inputName: string,
	outputName: string,
): Promise<void> {
	const {host, username, privateKeyPath, remoteEphemeralDir} = config.vm;
	const transcriptPath = `${remoteEphemeralDir}/${outputName}`;
	// `mkdir -p` is idempotent: it ensures the ephemeral dir exists (so caption.sh's
	// `mv` lands the transcript *inside* a folder rather than renaming it to a
	// stray file) and is a no-op on every subsequent run. The trailing `test -f`
	// is the real success check: caption.sh ends in `deactivate` and so exits 0
	// even when test.py crashed, so we instead require the transcript to exist.
	const remoteCommand = `mkdir -p ${shellQuote(
		remoteEphemeralDir,
	)} && bash ${REMOTE_CAPTION_SCRIPT} ${shellQuote(inputName)} ${shellQuote(
		outputName,
	)} && test -f ${shellQuote(transcriptPath)}`;
	const result = await execa(
		'ssh',
		[...hardeningOptions(privateKeyPath), `${username}@${host}`, remoteCommand],
		{reject: false},
	);
	if (result.exitCode !== 0) {
		const detail = result.stderr?.trim();
		throw new Error(
			detail ||
				`No transcript "${outputName}" appeared in ${remoteEphemeralDir} — test.py likely failed.`,
		);
	}
}

/**
 * Read a file out of the VM's ephemeral dir as text (via `ssh … cat`). Used to pull
 * the word-confidence JSON sidecar and, when applying corrections, the transcript
 * itself. `name` is a basename relative to remoteEphemeralDir.
 */
export async function fetchEphemeralFile(
	config: DaoConfig,
	name: string,
): Promise<string> {
	const {host, username, privateKeyPath, remoteEphemeralDir} = config.vm;
	const remotePath = `${remoteEphemeralDir}/${name}`;
	const result = await execa(
		'ssh',
		[
			...hardeningOptions(privateKeyPath),
			`${username}@${host}`,
			`cat ${shellQuote(remotePath)}`,
		],
		{reject: false},
	);
	if (result.exitCode !== 0) {
		const detail = result.stderr?.trim();
		throw new Error(
			detail || `Could not read ${name} from ${remoteEphemeralDir} on the VM.`,
		);
	}
	return result.stdout;
}

/**
 * Download a transcript from the VM's ephemeral dir to `localPath` (see
 * download2.sh). `remoteName` is the (sanitized) transcript basename; the local
 * file may keep the user's original, unsanitized name.
 */
export async function downloadFile(
	config: DaoConfig,
	remoteName: string,
	localPath: string,
): Promise<void> {
	const {host, username, privateKeyPath, remoteEphemeralDir} = config.vm;
	const result = await execa(
		'scp',
		[
			...hardeningOptions(privateKeyPath),
			`${username}@${host}:${remoteEphemeralDir}/${remoteName}`,
			localPath,
		],
		{reject: false},
	);
	if (result.exitCode !== 0) {
		throw new Error(result.stderr || `scp failed (exit ${result.exitCode})`);
	}
}

/**
 * Delete the uploaded audio, the transcript, and the word-confidence JSON sidecar
 * (caption_qc.sh moves all three off the VM into the upload/ephemeral dirs) once
 * the transcript is safely downloaded, so we don't accrue cloud storage. Uses
 * `rm -f` because caption.sh may already have removed the input and a non-QC run
 * leaves no JSON — a missing file shouldn't fail the cleanup. Only the named files
 * are removed; the persistent upload/ephemeral dirs themselves are left intact.
 */
export async function cleanupRemote(
	config: DaoConfig,
	inputName: string,
	outputName: string,
	jsonName: string,
): Promise<void> {
	const {host, username, privateKeyPath, remoteUploadDir, remoteEphemeralDir} =
		config.vm;
	const transcriptPath = `${remoteEphemeralDir}/${outputName}`;
	const jsonPath = `${remoteEphemeralDir}/${jsonName}`;
	const inputPath = `${remoteUploadDir}/${inputName}`;
	const remoteCommand = `rm -f ${shellQuote(transcriptPath)} ${shellQuote(
		jsonPath,
	)} ${shellQuote(inputPath)}`;
	const result = await execa(
		'ssh',
		[...hardeningOptions(privateKeyPath), `${username}@${host}`, remoteCommand],
		{reject: false},
	);
	if (result.exitCode !== 0) {
		throw new Error(
			result.stderr?.trim() || `Cleanup failed (exit ${result.exitCode})`,
		);
	}
}
