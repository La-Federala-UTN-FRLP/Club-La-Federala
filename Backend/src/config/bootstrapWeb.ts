import { loadLocalEnv } from './loadEnv';
import { EnvValidationError, initWebEnv } from './env';

loadLocalEnv();

try {
    initWebEnv(process.env);
} catch (error) {
    if (error instanceof EnvValidationError) {
        console.error('[config] Invalid web environment configuration:');
        for (const issue of error.issues) {
            console.error(`  - ${issue}`);
        }
    } else {
        console.error('[config] Invalid web environment configuration.');
    }
    process.exitCode = 1;
    process.exit(1);
}
