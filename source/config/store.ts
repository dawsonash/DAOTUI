import {dirname, join} from 'node:path';
import Conf from 'conf';

export type DaoConfig = {
	setupComplete: boolean;
	vm: {
		host: string;
		username: string;
		privateKeyPath: string;
		remoteUploadDir: string;
		remoteEphemeralDir: string;
	};
	azure: {
		resourceGroup: string;
		vmName: string;
	};
};

// A single Conf instance backs the persisted config.json. `conf` resolves the
// platform config dir (e.g. ~/Library/Application Support/daotui on macOS) and
// writes atomically. The SSH key lives in a sibling `keys/` dir so raw `ssh -i`
// still works against the same file.
const store = new Conf<DaoConfig>({
	projectName: 'daotui',
	defaults: buildDefaults(),
});

function buildDefaults(): DaoConfig {
	// `store` isn't constructed yet when defaults are evaluated, so derive the
	// key path from Conf's own resolved path lazily in defaultPrivateKeyPath().
	return {
		setupComplete: false,
		vm: {
			// Single fixed VM; the IP does not rotate, so it's hardcoded rather
			// than prompted during setup.
			host: '40.125.40.244',
			username: 'azureuser',
			privateKeyPath: '',
			remoteUploadDir: '/home/azureuser/virtual',
			remoteEphemeralDir: 'ephemeral',
		},
		azure: {
			resourceGroup: 'test-group-2',
			vmName: 'test-gpu',
		},
	};
}

/** Absolute path to the directory holding config.json. */
export function getConfigDir(): string {
	return dirname(store.path);
}

/** Conventional location for the tool-managed SSH keypair. */
export function defaultPrivateKeyPath(): string {
	return join(getConfigDir(), 'keys', 'id_ed25519');
}

/** True until the user completes the setup wizard. */
export function isFirstLaunch(): boolean {
	return !store.get('setupComplete');
}

export function loadConfig(): DaoConfig {
	return store.store;
}

/** Shallow-merge a partial config and persist it. */
export function saveConfig(update: Partial<DaoConfig>): DaoConfig {
	const current = store.store;
	const next: DaoConfig = {
		...current,
		...update,
		vm: {...current.vm, ...update.vm},
		azure: {...current.azure, ...update.azure},
	};
	store.store = next;
	return next;
}
