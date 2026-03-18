import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock IfcThreeViewer
// ---------------------------------------------------------------------------

class MockIfcThreeViewer {
    static instances: MockIfcThreeViewer[] = [];
    onProgress?: (msg: string) => void;
    initCalled = false;
    loadedUrls: string[] = [];
    disposed = false;

    constructor(public canvas: HTMLCanvasElement) {
        MockIfcThreeViewer.instances.push(this);
    }

    async init(): Promise<void> {
        this.initCalled = true;
    }

    async loadFromUrl(url: string): Promise<void> {
        this.loadedUrls.push(url);
    }

    setBackgroundColor(_hex: string): void {}
    dispose(): void {
        this.disposed = true;
    }

    static reset(): void {
        MockIfcThreeViewer.instances = [];
    }
}

vi.mock('./ifcThreeViewer', () => ({
    IfcThreeViewer: MockIfcThreeViewer,
}));

vi.mock('powerbi-visuals-api', () => ({
    default: {
        extensibility: { visual: {} },
        visuals: {},
        VisualUpdateType: { Data: 2 },
    },
}));

vi.mock('./../style/visual.less', () => ({}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConstructorOptions(): any {
    const element = document.createElement('div');
    const host = {
        createSelectionManager: vi.fn().mockReturnValue({
            select: vi.fn(),
            clear: vi.fn(),
        }),
    };
    return { element, host };
}

function makeUpdateOptions(rows: unknown[][] | null): any {
    return {
        dataViews: rows
            ? [{ table: { rows, columns: [{ displayName: 'url' }] } }]
            : undefined,
        type: 2,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Visual', () => {
    let Visual: typeof import('./visual').Visual;

    beforeEach(async () => {
        MockIfcThreeViewer.reset();
        vi.resetModules();
        vi.doMock('./ifcThreeViewer', () => ({ IfcThreeViewer: MockIfcThreeViewer }));
        vi.doMock('powerbi-visuals-api', () => ({
            default: {
                extensibility: { visual: {} },
                visuals: {},
                VisualUpdateType: { Data: 2 },
            },
        }));
        vi.doMock('./../style/visual.less', () => ({}));

        const mod = await import('./visual');
        Visual = mod.Visual;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    it('creates a root element with canvas', () => {
        const opts = makeConstructorOptions();
        new Visual(opts);
        const root = opts.element.querySelector('.ifc-viewer-root');
        expect(root).toBeTruthy();
        const canvas = root!.querySelector('canvas');
        expect(canvas).toBeTruthy();
    });

    it('initialises the Three.js viewer', () => {
        new Visual(makeConstructorOptions());
        expect(MockIfcThreeViewer.instances).toHaveLength(1);
        expect(MockIfcThreeViewer.instances[0].initCalled).toBe(true);
    });

    // -----------------------------------------------------------------------
    // update() — no data
    // -----------------------------------------------------------------------

    it('does not load when dataViews is empty', async () => {
        const v = new Visual(makeConstructorOptions());
        await v.update(makeUpdateOptions(null));
        expect(MockIfcThreeViewer.instances[0].loadedUrls).toHaveLength(0);
    });

    it('does not load when rows are empty', async () => {
        const v = new Visual(makeConstructorOptions());
        await v.update({ dataViews: [{ table: { rows: [] } }] } as any);
        expect(MockIfcThreeViewer.instances[0].loadedUrls).toHaveLength(0);
    });

    it('does not load when URL is not a string', async () => {
        const v = new Visual(makeConstructorOptions());
        await v.update(makeUpdateOptions([[123]]));
        expect(MockIfcThreeViewer.instances[0].loadedUrls).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // update() — with valid URL
    // -----------------------------------------------------------------------

    it('loads model when valid URL is provided', async () => {
        const v = new Visual(makeConstructorOptions());
        await v.update(makeUpdateOptions([['https://example.com/model.ifc']]));
        expect(MockIfcThreeViewer.instances[0].loadedUrls).toEqual([
            'https://example.com/model.ifc',
        ]);
    });

    it('does not reload when the same URL is provided', async () => {
        const v = new Visual(makeConstructorOptions());
        await v.update(makeUpdateOptions([['https://example.com/model.ifc']]));
        await v.update(makeUpdateOptions([['https://example.com/model.ifc']]));
        expect(MockIfcThreeViewer.instances[0].loadedUrls).toHaveLength(1);
    });

    it('loads new model when URL changes', async () => {
        const v = new Visual(makeConstructorOptions());
        await v.update(makeUpdateOptions([['https://example.com/model1.ifc']]));
        await v.update(makeUpdateOptions([['https://example.com/model2.ifc']]));
        expect(MockIfcThreeViewer.instances[0].loadedUrls).toEqual([
            'https://example.com/model1.ifc',
            'https://example.com/model2.ifc',
        ]);
    });

    // -----------------------------------------------------------------------
    // Loading overlay
    // -----------------------------------------------------------------------

    it('shows and hides overlay during loading', async () => {
        const opts = makeConstructorOptions();
        const v = new Visual(opts);
        const overlay = opts.element.querySelector('.ifc-viewer-overlay');
        expect(overlay).toBeTruthy();

        await v.update(makeUpdateOptions([['https://example.com/model.ifc']]));
        // After load completes, overlay should be hidden
        expect(overlay!.classList.contains('visible')).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------

    it('handles load errors gracefully', async () => {
        const v = new Visual(makeConstructorOptions());
        // Make loadFromUrl throw
        MockIfcThreeViewer.instances[0].loadFromUrl = async () => {
            throw new Error('Network timeout');
        };
        // Should not throw
        await v.update(makeUpdateOptions([['https://example.com/model.ifc']]));
    });

    // -----------------------------------------------------------------------
    // Uses first row only
    // -----------------------------------------------------------------------

    it('uses the first row URL', async () => {
        const v = new Visual(makeConstructorOptions());
        await v.update(makeUpdateOptions([
            ['https://example.com/arch.ifc'],
            ['https://example.com/struct.ifc'],
        ]));
        expect(MockIfcThreeViewer.instances[0].loadedUrls).toEqual([
            'https://example.com/arch.ifc',
        ]);
    });
});
