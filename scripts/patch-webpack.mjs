/**
 * Patch powerbi-visuals-tools webpack config for Power BI sandbox compatibility.
 *
 * 1. Adds .wasm to the asset/inline rule (base64 data URL)
 * 2. Disables webpack's new URL() asset emission for .wasm files
 *    so the WASM bytes are inlined instead of fetched separately.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const configPath = resolve('node_modules/powerbi-visuals-tools/lib/webpack.config.js');

try {
    let content = readFileSync(configPath, 'utf8');

    if (content.includes('PATCHED_FOR_PBIVIZ')) {
        console.log('[patch-webpack] Already patched, skipping.');
        process.exit(0);
    }

    // Add .wasm to the asset/inline rule
    content = content.replace(
        /\.(woff\|ttf\|ico\|woff2\|jpg\|jpeg\|png\|webp\|gif\|svg\|eot)\$/i,
        '.(woff|ttf|ico|woff2|jpg|jpeg|png|webp|gif|svg|eot|wasm)$'
    );

    // Add a rule to disable new URL() asset emission for .wasm files
    // This must go BEFORE the general asset/inline rule
    const wasmRule = `
            // PATCHED_FOR_PBIVIZ: Force .wasm to inline as base64 data URL
            {
                test: /\\.wasm$/,
                type: 'asset/inline',
            },`;

    content = content.replace(
        'rules: [',
        `rules: [${wasmRule}`
    );

    writeFileSync(configPath, content, 'utf8');
    console.log('[patch-webpack] Patched webpack config for WASM inlining.');
} catch (err) {
    console.warn('[patch-webpack] Could not patch webpack config:', err.message);
}
