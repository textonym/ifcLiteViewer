/**
 * Patch powerbi-visuals-tools webpack config to inline .wasm files.
 * Power BI's sandbox serves assets from its own domain, breaking WASM loading.
 * Inlining as base64 data URLs avoids the CORS/path issue.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const configPath = resolve('node_modules/powerbi-visuals-tools/lib/webpack.config.js');

try {
    let content = readFileSync(configPath, 'utf8');

    if (content.includes('|wasm)')) {
        console.log('[patch-webpack] Already patched, skipping.');
        process.exit(0);
    }

    // Add .wasm to the asset/inline rule
    content = content.replace(
        /\.(woff\|ttf\|ico\|woff2\|jpg\|jpeg\|png\|webp\|gif\|svg\|eot)\$/i,
        '.(woff|ttf|ico|woff2|jpg|jpeg|png|webp|gif|svg|eot|wasm)$'
    );

    writeFileSync(configPath, content, 'utf8');
    console.log('[patch-webpack] Patched webpack config to inline .wasm files.');
} catch (err) {
    console.warn('[patch-webpack] Could not patch webpack config:', err.message);
}
