"use strict";

import powerbi from "powerbi-visuals-api";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualUpdateType = powerbi.VisualUpdateType;
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";

import { IfcViewer } from "./ifcViewer";
import { VisualFormattingSettingsModel } from "./settings";

export class Visual implements IVisual {
    private target: HTMLElement;
    private canvas: HTMLCanvasElement;
    private fileInput: HTMLInputElement;
    private statusDiv: HTMLDivElement;
    private overlay: HTMLDivElement;
    private overlayText: HTMLDivElement;
    private viewer: IfcViewer;
    private viewerReady: Promise<void>;
    private lastUrl: string | null = null;
    
    private formattingSettings: VisualFormattingSettingsModel = new VisualFormattingSettingsModel();
    private formattingSettingsService: FormattingSettingsService;

    constructor(options: VisualConstructorOptions) {
        this.target = options.element;
        this.formattingSettingsService = new FormattingSettingsService();

        // Root container
        const root = document.createElement("div");
        root.className = "ifc-viewer-root";
        this.target.appendChild(root);

        // Top bar: button + status
        const topBar = document.createElement("div");
        topBar.className = "ifc-viewer-topbar";
        root.appendChild(topBar);

        const localButtonLabel = document.createElement("label");
        localButtonLabel.textContent = "Load local GLB/GLTF";
        localButtonLabel.className = "ifc-viewer-btn";
        topBar.appendChild(localButtonLabel);

        this.fileInput = document.createElement("input");
        this.fileInput.type = "file";
        this.fileInput.accept = ".glb,.gltf";
        this.fileInput.style.display = "none";
        localButtonLabel.appendChild(this.fileInput);

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

        // Initialize Three.js viewer
        this.viewer = new IfcViewer(this.canvas);
        this.viewer.onProgress = (msg: string) => {
            this.statusDiv.textContent = msg;
            this.overlayText.textContent = msg;
        };
        this.viewerReady = this.viewer.init().catch((err) => {
            console.error("Viewer init failed", err);
            this.statusDiv.textContent = "Viewer init failed";
            this.overlayText.textContent = "Initialization failed.";
        });

        // Local file handler
        this.fileInput.addEventListener("change", () => {
            const file = this.fileInput.files && this.fileInput.files[0];
            if (!file) {
                return;
            }
            this.lastUrl = null; // switch to local mode
            this.showLoadOverlay(`Loading local model: ${file.name}`);
            void this.loadLocalFile(file);
        });
    }

    public update(options: VisualUpdateOptions) {
        try {
            const dataView = options.dataViews && options.dataViews.length > 0 ? options.dataViews[0] : undefined;

            // Always try to populate formatting settings from the dataView (which includes metadata.objects
            // from the formatting pane — available even with supportsEmptyDataView when no rows are bound)
            if (dataView) {
                this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            }

            const sceneCard = this.formattingSettings.sceneCard;

            // Apply scene settings to viewer
            if (this.viewer) {
                this.viewer.setBackgroundColor(sceneCard.backgroundColor.value.value);
                this.viewer.setLightIntensity(sceneCard.lightIntensity.value);
                this.viewer.setOrbitControlsEnabled(sceneCard.enableOrbitControls.value);
            }

            // 1. Check the formatting pane text field for a URL
            let url = (sceneCard.modelUrl.value || "").trim();

            // 2. If not set in pane, check if a data row was bound (optional fallback)
            if (!url && dataView?.table?.rows?.length) {
                url = (dataView.table.rows[0][0] as string) || "";
            }

            if (!url || url === this.lastUrl) {
                return; // no URL set, or already loaded
            }

            this.lastUrl = url;
            this.showLoadOverlay("Downloading model from URL...");
            void this.loadFromUrl(url);
        } catch (e) {
            console.error("Error in visual update:", e);
        }
    }
    
    /**
     * Returns properties pane formatting model content hierarchies, properties and latest formatting values.
     */
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
    
    private showLoadOverlay(msg: string) {
        this.overlay.classList.add("visible");
        this.overlayText.textContent = msg;
        this.statusDiv.textContent = msg;
    }
    
    private hideLoadOverlay() {
        this.overlay.classList.remove("visible");
    }

    private async loadLocalFile(file: File): Promise<void> {
        await this.viewerReady;
        try {
            await this.viewer.loadFromFile(file);
        } catch (err: any) {
            console.error("Error loading local model", err);
            const msg = err && err.message ? err.message : String(err);
            this.statusDiv.textContent = `Error loading local model: ${msg}`;
        } finally {
            this.hideLoadOverlay();
        }
    }

    private async loadFromUrl(url: string): Promise<void> {
        await this.viewerReady;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            await this.viewer.loadFromArrayBuffer(arrayBuffer, "Processing 3D model");
        } catch (err: any) {
            console.error("Error loading model from URL", err);
            const msg = err && err.message ? err.message : String(err);
            this.statusDiv.textContent = `Error loading model from URL: ${msg}`;
        } finally {
            this.hideLoadOverlay();
        }
    }
}