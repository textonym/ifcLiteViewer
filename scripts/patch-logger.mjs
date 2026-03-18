/**
 * Patch @ifc-lite/data logger for Power BI sandbox compatibility.
 *
 * The sandbox forbids localStorage access (no 'allow-same-origin' flag).
 * The typeof check on localStorage triggers the SecurityError because
 * it's a window getter, not a simple variable. Wrap in try/catch.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const loggerPath = resolve('node_modules/@ifc-lite/data/dist/logger.js');

try {
    let content = readFileSync(loggerPath, 'utf8');

    if (content.includes('PATCHED_FOR_SANDBOX')) {
        console.log('[patch-logger] Already patched, skipping.');
        process.exit(0);
    }

    // Replace the isDebugEnabled function with a sandbox-safe version
    content = content.replace(
        `function isDebugEnabled() {
    // Check browser localStorage
    if (typeof localStorage !== 'undefined') {
        try {
            return localStorage.getItem('IFC_DEBUG') === 'true';
        }
        catch {
            // localStorage not available (e.g., in some workers)
        }
    }
    // Check Node.js environment
    if (typeof process !== 'undefined' && process.env) {
        return process.env.IFC_DEBUG === 'true';
    }
    return false;
}`,
        `function isDebugEnabled() {
    // PATCHED_FOR_SANDBOX: wrapped in try/catch for PBI sandbox
    try {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem('IFC_DEBUG') === 'true';
        }
    }
    catch {
        // localStorage getter throws SecurityError in sandboxed iframes
    }
    try {
        if (typeof process !== 'undefined' && process.env) {
            return process.env.IFC_DEBUG === 'true';
        }
    }
    catch {
        // process not available
    }
    return false;
}`
    );

    writeFileSync(loggerPath, content, 'utf8');
    console.log('[patch-logger] Patched logger for sandbox compatibility.');
} catch (err) {
    console.warn('[patch-logger] Could not patch logger:', err.message);
}
