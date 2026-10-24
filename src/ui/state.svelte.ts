// NOTE: Bridge between the frame based editor logic and the Svelte UI.
//		 The editor state itself is not reactive (to keep the per-frame update fast), instead a cheap signature is compared
//		 every frame and "ui.version" is only bumped if something the panels display has actually changed.
import { ChartEditor } from "../editor/editor";
import { PersistentApp } from "../editor/settings";

export const editor = new ChartEditor();

// NOTE: Exposed for debugging / automation from the browser console
(globalThis as unknown as { PeepoDrumKit: ChartEditor }).PeepoDrumKit = editor;

export const ui = $state({
	version: 0,
	// NOTE: Only bumped when the chart itself has changed (undo history version), for expensive derived data
	chartVersion: 0,
	fps: 0,
	isMobile: false,
	layout: PersistentApp.LastSession.UseMobileLayout as "auto" | "desktop" | "mobile",
});

/** NOTE: Notify the UI that something changed outside of the regular frame signature check (e.g. after a UI action) */
export function Invalidate(): void { ui.version++; }

/** NOTE: Read inside a $derived / template to subscribe to editor changes */
export function Track(): number { return ui.version; }

export function TrackChart(): number { return ui.chartVersion; }
