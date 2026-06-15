import {useState} from 'react';
import {isFirstLaunch} from './config/store.js';
import SetupWizard from './setup/SetupWizard.js';
import Home from './components/Home.js';

export default function App() {
	// Snapshot first-launch on mount; after the wizard completes we flip to Home
	// without re-reading, so the freshly-saved config routes correctly.
	const [needsSetup, setNeedsSetup] = useState(isFirstLaunch());

	if (needsSetup) {
		return <SetupWizard onComplete={() => setNeedsSetup(false)} />;
	}

	return <Home />;
}
