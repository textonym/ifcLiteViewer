import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EmbedOptions, EventMap } from '@ifc-lite/embed-sdk';

// ---------------------------------------------------------------------------
// Mock @ifc-lite/embed-sdk
// ---------------------------------------------------------------------------

type EventCallback<T> = (data: T) => void;

class MockIFCLiteEmbed {
  static instances: MockIFCLiteEmbed[] = [];
  destroyed = false;
  options: EmbedOptions;
  private eventHandlers = new Map<string, Set<EventCallback<unknown>>>();

  constructor(opts: EmbedOptions) {
    this.options = opts;
    MockIFCLiteEmbed.instances.push(this);
  }

  static async create(opts: EmbedOptions): Promise<MockIFCLiteEmbed> {
    return new MockIFCLiteEmbed(opts);
  }

  on<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): () => void {
    if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, new Set());
    this.eventHandlers.get(event)!.add(callback as EventCallback<unknown>);
    return () => this.eventHandlers.get(event)?.delete(callback as EventCallback<unknown>);
  }

  /** Test helper: simulate an event from the viewer */
  _emit<K extends keyof EventMap>(event: K, data?: EventMap[K]): void {
    this.eventHandlers.get(event)?.forEach(fn => fn(data));
  }

  destroy(): void {
    this.destroyed = true;
    this.eventHandlers.clear();
  }

  static reset(): void {
    MockIFCLiteEmbed.instances = [];
  }
}

vi.mock('@ifc-lite/embed-sdk', () => ({
  IFCLiteEmbed: MockIFCLiteEmbed,
}));

// ---------------------------------------------------------------------------
// Mock powerbi-visuals-api (import-assignment style used by visual.ts)
// ---------------------------------------------------------------------------

const mockSelectFn = vi.fn().mockResolvedValue(undefined);
const mockClearFn = vi.fn().mockResolvedValue(undefined);

const mockSelectionManager = {
  select: mockSelectFn,
  clear: mockClearFn,
};

const mockSelectionId = { key: 'mock-selection-id' };

const mockSelectionIdBuilder = {
  withTable: vi.fn().mockReturnThis(),
  createSelectionId: vi.fn().mockReturnValue(mockSelectionId),
};

const mockHost = {
  createSelectionManager: vi.fn().mockReturnValue(mockSelectionManager),
  createSelectionIdBuilder: vi.fn().mockReturnValue(mockSelectionIdBuilder),
};

vi.mock('powerbi-visuals-api', () => {
  return {
    default: {
      extensibility: {
        visual: {},
      },
      visuals: {},
      VisualUpdateType: { Data: 2 },
    },
  };
});

vi.mock('powerbi-visuals-utils-formattingmodel', () => ({
  FormattingSettingsService: vi.fn(),
  formattingSettings: {
    SimpleCard: class {},
    Slice: class {},
    Model: class {},
  },
}));

vi.mock('./../style/visual.less', () => ({}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConstructorOptions(): any {
  const element = document.createElement('div');
  return { element, host: mockHost };
}

function makeUpdateOptions(rows: unknown[][] | null, host?: any): any {
  const opts: any = {
    dataViews: rows
      ? [
        {
          table: {
            rows,
            columns: [{ displayName: 'url' }],
          },
        },
      ]
      : undefined,
    type: 2,
    host: host ?? mockHost,
  };
  // Ensure host is available on the options for createSelectionIdBuilder
  if (!opts.host) opts.host = mockHost;
  return opts;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Visual', () => {
  let Visual: typeof import('./visual').Visual;

  beforeEach(async () => {
    MockIFCLiteEmbed.reset();
    mockSelectFn.mockClear();
    mockClearFn.mockClear();
    mockHost.createSelectionManager.mockClear();
    mockHost.createSelectionIdBuilder.mockClear();
    mockSelectionIdBuilder.withTable.mockClear();
    mockSelectionIdBuilder.createSelectionId.mockClear();

    // Fresh import each time to reset module state
    vi.resetModules();
    vi.doMock('@ifc-lite/embed-sdk', () => ({ IFCLiteEmbed: MockIFCLiteEmbed }));
    vi.doMock('powerbi-visuals-api', () => ({
      default: {
        extensibility: { visual: {} },
        visuals: {},
        VisualUpdateType: { Data: 2 },
      },
    }));
    vi.doMock('powerbi-visuals-utils-formattingmodel', () => ({
      FormattingSettingsService: vi.fn(),
      formattingSettings: {
        SimpleCard: class {},
        Slice: class {},
        Model: class {},
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

  it('creates a container div in the target element', () => {
    const opts = makeConstructorOptions();
    new Visual(opts);
    const container = opts.element.querySelector('div');
    expect(container).toBeTruthy();
    expect(container!.style.width).toBe('100%');
    expect(container!.style.height).toBe('100%');
    expect(container!.style.position).toBe('relative');
  });

  it('initialises a selection manager from the host', () => {
    new Visual(makeConstructorOptions());
    expect(mockHost.createSelectionManager).toHaveBeenCalledOnce();
  });

  // -----------------------------------------------------------------------
  // update() — no data
  // -----------------------------------------------------------------------

  it('does not create an embed when dataViews is empty', async () => {
    const v = new Visual(makeConstructorOptions());
    await v.update(makeUpdateOptions(null));
    expect(MockIFCLiteEmbed.instances).toHaveLength(0);
  });

  it('does not create an embed when rows are empty', async () => {
    const v = new Visual(makeConstructorOptions());
    await v.update({
      dataViews: [{ table: { rows: [] } }],
      host: mockHost,
    } as any);
    expect(MockIFCLiteEmbed.instances).toHaveLength(0);
  });

  it('does not create an embed when URL is not a string', async () => {
    const v = new Visual(makeConstructorOptions());
    await v.update(makeUpdateOptions([[123]]));
    expect(MockIFCLiteEmbed.instances).toHaveLength(0);
  });

  it('does not create an embed when URL is empty string', async () => {
    const v = new Visual(makeConstructorOptions());
    await v.update(makeUpdateOptions([['']]));
    expect(MockIFCLiteEmbed.instances).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // update() — with valid URL
  // -----------------------------------------------------------------------

  it('creates an embed when a valid URL is provided', async () => {
    const v = new Visual(makeConstructorOptions());
    await v.update(makeUpdateOptions([['https://example.com/model.ifc']]));
    expect(MockIFCLiteEmbed.instances).toHaveLength(1);
    expect(MockIFCLiteEmbed.instances[0].options.modelUrl).toBe('https://example.com/model.ifc');
  });

  it('passes correct embed options', async () => {
    const v = new Visual(makeConstructorOptions());
    await v.update(makeUpdateOptions([['https://example.com/model.ifc']]));
    const opts = MockIFCLiteEmbed.instances[0].options;
    expect(opts.theme).toBe('dark');
    expect(opts.controls).toBe('all');
    expect(opts.hideAxis).toBe(false);
    expect(opts.hideScale).toBe(false);
    expect(opts.container).toBeInstanceOf(HTMLDivElement);
  });

  it('does not reinitialise when the same URL is provided', async () => {
    const v = new Visual(makeConstructorOptions());
    await v.update(makeUpdateOptions([['https://example.com/model.ifc']]));
    await v.update(makeUpdateOptions([['https://example.com/model.ifc']]));
    expect(MockIFCLiteEmbed.instances).toHaveLength(1);
  });

  it('destroys old embed and creates new one when URL changes', async () => {
    const v = new Visual(makeConstructorOptions());
    await v.update(makeUpdateOptions([['https://example.com/model1.ifc']]));
    const firstEmbed = MockIFCLiteEmbed.instances[0];

    await v.update(makeUpdateOptions([['https://example.com/model2.ifc']]));
    expect(firstEmbed.destroyed).toBe(true);
    expect(MockIFCLiteEmbed.instances).toHaveLength(2);
    expect(MockIFCLiteEmbed.instances[1].options.modelUrl).toBe('https://example.com/model2.ifc');
  });

  // -----------------------------------------------------------------------
  // update() — data removed after load
  // -----------------------------------------------------------------------

  it('destroys embed when data is removed', async () => {
    const v = new Visual(makeConstructorOptions());
    await v.update(makeUpdateOptions([['https://example.com/model.ifc']]));
    const embed = MockIFCLiteEmbed.instances[0];

    await v.update(makeUpdateOptions(null));
    expect(embed.destroyed).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Cross-filtering: entity-selected
  // -----------------------------------------------------------------------

  it('wires entity-selected to Power BI selection manager', async () => {
    const v = new Visual(makeConstructorOptions());
    await v.update(makeUpdateOptions([['https://example.com/model.ifc']]));
    const embed = MockIFCLiteEmbed.instances[0];

    // Simulate entity selection in the viewer
    embed._emit('entity-selected', { id: 42, globalId: 'abc123' } as any);
    // Give the async handler a tick
    await new Promise(r => setTimeout(r, 0));

    expect(mockSelectFn).toHaveBeenCalledOnce();
    expect(mockSelectFn).toHaveBeenCalledWith(mockSelectionId);
  });

  it('wires entity-deselected to clear Power BI selection', async () => {
    const v = new Visual(makeConstructorOptions());
    await v.update(makeUpdateOptions([['https://example.com/model.ifc']]));
    const embed = MockIFCLiteEmbed.instances[0];

    embed._emit('entity-deselected', undefined as any);
    await new Promise(r => setTimeout(r, 0));

    expect(mockClearFn).toHaveBeenCalledOnce();
  });

  // -----------------------------------------------------------------------
  // Selection ID building
  // -----------------------------------------------------------------------

  it('builds selection IDs from data view rows', async () => {
    const v = new Visual(makeConstructorOptions());
    const rows = [
      ['https://example.com/model.ifc'],
      ['https://example.com/model2.ifc'],
    ];
    await v.update(makeUpdateOptions(rows));

    expect(mockHost.createSelectionIdBuilder).toHaveBeenCalledTimes(rows.length);
    expect(mockSelectionIdBuilder.withTable).toHaveBeenCalledTimes(rows.length);
    expect(mockSelectionIdBuilder.createSelectionId).toHaveBeenCalledTimes(rows.length);
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it('shows an error overlay when embed creation fails', async () => {
    // Make create() throw
    const origCreate = MockIFCLiteEmbed.create;
    MockIFCLiteEmbed.create = async () => { throw new Error('Network timeout'); };

    const ctorOpts = makeConstructorOptions();
    const v = new Visual(ctorOpts);
    await v.update(makeUpdateOptions([['https://example.com/model.ifc']]));

    const errorEl = ctorOpts.element.querySelector('.ifc-error');
    expect(errorEl).toBeTruthy();
    expect(errorEl!.textContent).toContain('Network timeout');

    MockIFCLiteEmbed.create = origCreate;
  });

  it('clears error overlays when embed is destroyed', async () => {
    const origCreate = MockIFCLiteEmbed.create;
    MockIFCLiteEmbed.create = async () => { throw new Error('fail'); };

    const ctorOpts = makeConstructorOptions();
    const v = new Visual(ctorOpts);
    await v.update(makeUpdateOptions([['https://example.com/model.ifc']]));
    expect(ctorOpts.element.querySelector('.ifc-error')).toBeTruthy();

    // Restore and trigger destroy via no-data update
    MockIFCLiteEmbed.create = origCreate;
    await v.update(makeUpdateOptions(null));
    expect(ctorOpts.element.querySelector('.ifc-error')).toBeFalsy();
  });

  // -----------------------------------------------------------------------
  // Multiple models from rows (reads first row only)
  // -----------------------------------------------------------------------

  it('uses the first row URL for the embed model', async () => {
    const v = new Visual(makeConstructorOptions());
    await v.update(makeUpdateOptions([
      ['https://example.com/arch.ifc'],
      ['https://example.com/struct.ifc'],
    ]));
    expect(MockIFCLiteEmbed.instances[0].options.modelUrl).toBe('https://example.com/arch.ifc');
  });

  // -----------------------------------------------------------------------
  // Rapid URL changes
  // -----------------------------------------------------------------------

  it('handles rapid sequential URL changes correctly', async () => {
    const v = new Visual(makeConstructorOptions());
    await v.update(makeUpdateOptions([['https://example.com/a.ifc']]));
    await v.update(makeUpdateOptions([['https://example.com/b.ifc']]));
    await v.update(makeUpdateOptions([['https://example.com/c.ifc']]));

    expect(MockIFCLiteEmbed.instances).toHaveLength(3);
    expect(MockIFCLiteEmbed.instances[0].destroyed).toBe(true);
    expect(MockIFCLiteEmbed.instances[1].destroyed).toBe(true);
    expect(MockIFCLiteEmbed.instances[2].destroyed).toBe(false);
    expect(MockIFCLiteEmbed.instances[2].options.modelUrl).toBe('https://example.com/c.ifc');
  });
});
