import {useState} from 'react';
import {
	defaultPrivateKeyPath,
	loadConfig,
	saveConfig,
} from '../config/store.js';
import Welcome from './steps/Welcome.js';
import Prereqs from './steps/Prereqs.js';
import GenerateKey from './steps/GenerateKey.js';
import TestConnection from './steps/TestConnection.js';
import Done from './steps/Done.js';

type Step = 'welcome' | 'prereqs' | 'key' | 'test' | 'done';

type Props = {
	onComplete: () => void;
};

export default function SetupWizard({onComplete}: Props) {
	const [step, setStep] = useState<Step>('welcome');
	const config = loadConfig();
	const keyPath = config.vm.privateKeyPath || defaultPrivateKeyPath();

	// Persist the key path + mark setup complete once the key exists. The
	// connection test is best-effort and doesn't gate completion, since the admin
	// may not have authorized the key yet.
	function persist() {
		saveConfig({
			setupComplete: true,
			vm: {...config.vm, privateKeyPath: keyPath},
		});
	}

	switch (step) {
		case 'welcome':
			return <Welcome onNext={() => setStep('prereqs')} />;
		case 'prereqs':
			return <Prereqs onNext={() => setStep('key')} />;
		case 'key':
			return (
				<GenerateKey
					keyPath={keyPath}
					onNext={() => {
						persist();
						setStep('test');
					}}
				/>
			);
		case 'test':
			return (
				<TestConnection
					target={{
						host: config.vm.host,
						username: config.vm.username,
						privateKeyPath: keyPath,
					}}
					onNext={() => setStep('done')}
				/>
			);
		case 'done':
			return <Done onFinish={onComplete} />;
	}
}
