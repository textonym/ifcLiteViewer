"use strict";

import powerbi from "powerbi-visuals-api";
import "./../style/visual.less";
import { IfcThreeViewer } from "./ifcThreeViewer";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;

export class Visual implements IVisual {
    private target: HTMLElement;
    private canvas: HTMLCanvasElement;
    private statusDiv: HTMLDivElement;
    private overlay: HTMLDivElement;
    private overlayText: HTMLDivElement;
    private viewer: IfcThreeViewer;
    private viewerReady: Promise<void>;
    private currentModelUrl: string | null = null;

    constructor(options: VisualConstructorOptions) {
        this.target = options.element;

        const root = document.createElement("div");
        root.className = "ifc-viewer-root";
        this.target.appendChild(root);

        // Top bar with status
        const topBar = document.createElement("div");
        topBar.className = "ifc-viewer-topbar";
        root.appendChild(topBar);

        this.statusDiv = document.createElement("div");
        this.statusDiv.textContent = "Ready";
        this.statusDiv.className = "ifc-viewer-status";
        topBar.appendChild(this.statusDiv);

        // Canvas container
        const canvasContainer = document.createElement("div");
        canvasContainer.className = "ifc-viewer-canvas-container";
        root.appendChild(canvasContainer);

        this.canvas = document.createElement("canvas");
        canvasContainer.appendChild(this.canvas);

        // Loading overlay
        this.overlay = document.createElement("div");
        this.overlay.className = "ifc-viewer-overlay";
        canvasContainer.appendChild(this.overlay);

        const spinner = document.createElement("div");
        spinner.className = "ifc-spinner";
        this.overlay.appendChild(spinner);

        this.overlayText = document.createElement("div");
        this.overlayText.className = "ifc-viewer-overlay-text";
        this.overlayText.textContent = "Loading...";
        this.overlay.appendChild(this.overlayText);

        // Initialize Three.js + ifc-lite geometry viewer
        this.viewer = new IfcThreeViewer(this.canvas);
        this.viewer.onProgress = (msg: string) => {
            this.statusDiv.textContent = msg;
            this.overlayText.textContent = msg;
        };
        this.viewerReady = this.viewer.init().catch((err) => {
            console.error("[ifcLiteViewer] init failed:", err);
            this.statusDiv.textContent = "Viewer init failed";
        });
    }

    public async update(options: VisualUpdateOptions): Promise<void> {
        const dataView = options.dataViews?.[0];
        if (!dataView?.table?.rows?.length) {
            return;
        }

        const modelUrl = dataView.table.rows[0][0] as string;
        if (!modelUrl || typeof modelUrl !== "string") return;
        if (modelUrl === this.currentModelUrl) return;

        this.currentModelUrl = modelUrl;
        this.showLoadOverlay("Loading IFC model...");

        await this.viewerReady;
        try {
            await this.viewer.loadFromUrl(modelUrl);
        } catch (err: any) {
            console.error("[ifcLiteViewer] load failed:", err);
            this.statusDiv.textContent = `Error: ${err?.message || err}`;
        } finally {
            this.hideLoadOverlay();
        }
    }

    private showLoadOverlay(msg: string): void {
        this.overlay.classList.add("visible");
        this.overlayText.textContent = msg;
        this.statusDiv.textContent = msg;
    }

    private hideLoadOverlay(): void {
        this.overlay.classList.remove("visible");
    }
}
