"use strict";

import powerbi from "powerbi-visuals-api";
import "./../style/visual.less";
import { IFCLiteEmbed, EmbedOptions } from "@ifc-lite/embed-sdk";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;

export class Visual implements IVisual {
    private target: HTMLElement;
    private embed: IFCLiteEmbed | null = null;
    private selectionManager: ISelectionManager;
    private currentModelUrl: string | null = null;
    private container: HTMLDivElement;

    constructor(options: VisualConstructorOptions) {
        this.target = options.element;
        this.selectionManager = options.host.createSelectionManager();

        // Full-size container for the iframe
        this.container = document.createElement("div");
        this.container.style.cssText = "width:100%;height:100%;position:relative;";
        this.target.appendChild(this.container);
    }

    public async update(options: VisualUpdateOptions): Promise<void> {
        const dataView = options.dataViews?.[0];
        if (!dataView?.table?.rows?.length) {
            this.destroyEmbed();
            return;
        }

        // Extract model URL from the first bound row
        const urlIndex = 0;
        const modelUrl = dataView.table.rows[0][urlIndex] as string;

        if (!modelUrl || typeof modelUrl !== "string") {
            this.destroyEmbed();
            return;
        }

        // Only reinitialise if the URL changed
        if (modelUrl === this.currentModelUrl && this.embed) return;

        this.destroyEmbed();
        this.currentModelUrl = modelUrl;

        try {
            const embedOptions: EmbedOptions = {
                container: this.container,
                modelUrl,
                theme: "dark",
                controls: "all",
                hideAxis: false,
                hideScale: false,
            };

            this.embed = await IFCLiteEmbed.create(embedOptions);

            // Build selection IDs from the data view rows to enable cross-filtering
            const selectionIds: ISelectionId[] = dataView.table.rows.map(
                (_, i) =>
                    options.host
                        .createSelectionIdBuilder()
                        .withTable(dataView.table, i)
                        .createSelectionId()
            );

            this.embed.on("entity-selected", async () => {
                if (selectionIds.length > 0) {
                    await this.selectionManager.select(selectionIds[0]);
                }
            });

            this.embed.on("entity-deselected", async () => {
                await this.selectionManager.clear();
            });
        } catch (err) {
            console.error("[ifcLiteViewer] Embed init failed:", err);
            this.showError(String(err));
        }
    }

    private destroyEmbed(): void {
        if (this.embed) {
            this.embed.destroy();
            this.embed = null;
        }
        this.currentModelUrl = null;
        // Clear any error overlays
        this.container.querySelectorAll(".ifc-error").forEach(el => el.remove());
    }

    private showError(msg: string): void {
        const el = document.createElement("div");
        el.className = "ifc-error";
        el.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#1a1a1a;color:#ff6b6b;font-family:sans-serif;font-size:13px;padding:16px;text-align:center;`;
        el.textContent = `IFC Viewer error: ${msg}`;
        this.container.appendChild(el);
    }
}
