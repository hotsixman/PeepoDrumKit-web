<script lang="ts">
	// NOTE: Reconstructed version of "ChartEditor::RestoreDefaultDockSpaceLayout()" (fixed panel layout instead of ImGui docking)
	import { editor, Track, Invalidate } from "../state.svelte";
	import { UI_Str } from "../../editor/i18n";
	import { PersistentApp, SavePersistentApp } from "../../editor/settings";
	import MenuBar from "./MenuBar.svelte";
	import TabPanel, { type Tab } from "./TabPanel.svelte";
	import Splitter from "./Splitter.svelte";
	import StatusBar from "./StatusBar.svelte";
	import TimelineView from "../views/TimelineView.svelte";
	import GamePreviewView from "../views/GamePreviewView.svelte";
	import PropertiesPanel from "../panels/PropertiesPanel.svelte";
	import TempoPanel from "../panels/TempoPanel.svelte";
	import InspectorPanel from "../panels/InspectorPanel.svelte";
	import LyricsPanel from "../panels/LyricsPanel.svelte";
	import UndoHistoryPanel from "../panels/UndoHistoryPanel.svelte";
	import TempoCalculatorPanel from "../panels/TempoCalculatorPanel.svelte";
	import SettingsPanel from "../panels/SettingsPanel.svelte";
	import HelpPanel from "../panels/HelpPanel.svelte";
	import TJAExportPanel from "../panels/TJAExportPanel.svelte";
	import TJAImportTestPanel from "../panels/TJAImportTestPanel.svelte";

	let topFraction = $state(0.45);
	let leftFraction = $state(0.24);
	let rightFraction = $state(0.26);
	let rightTopFraction = $state(0.58);

	let leftActive = $state("tempo");
	let centerActive = $state("game");
	let rightTopActive = $state("properties");

	const close = (fn: () => void) => () => { fn(); SavePersistentApp(); Invalidate(); };

	const tabs = $derived.by(() =>
	{
		Track();
		const left: Tab[] = [
			{ ID: "tempo", Label: UI_Str("Chart Tempo"), Component: TempoPanel },
			{ ID: "lyrics", Label: UI_Str("Chart Lyrics"), Component: LyricsPanel },
			{ ID: "calculator", Label: UI_Str("Tempo Calculator"), Component: TempoCalculatorPanel, FocusOwner: "tempoCalculator" },
		];
		if (editor.ShowTJAExportView)
			left.push({ ID: "export", Label: UI_Str("TJA Export Debug View"), Component: TJAExportPanel, Closable: close(() => { editor.ShowTJAExportView = PersistentApp.LastSession.ShowWindow_TJAExportTest = false; }) });

		const center: Tab[] = [{ ID: "game", Label: UI_Str("Game Preview"), Component: GamePreviewView }];
		if (editor.ShowHelp) center.push({ ID: "help", Label: UI_Str("Usage Guide"), Component: HelpPanel, Closable: close(() => { editor.ShowHelp = PersistentApp.LastSession.ShowWindow_Help = false; }) });
		if (editor.ShowSettings) center.push({ ID: "settings", Label: UI_Str("Settings"), Component: SettingsPanel, Closable: close(() => { editor.ShowSettings = PersistentApp.LastSession.ShowWindow_Settings = false; }) });
		if (editor.ShowTJAImportTest) center.push({ ID: "import", Label: UI_Str("TJA Import Test"), Component: TJAImportTestPanel, Closable: close(() => { editor.ShowTJAImportTest = PersistentApp.LastSession.ShowWindow_TJAImportTest = false; }) });

		const rightTop: Tab[] = [
			{ ID: "properties", Label: UI_Str("Chart Properties"), Component: PropertiesPanel },
			{ ID: "history", Label: UI_Str("Undo History"), Component: UndoHistoryPanel },
		];
		const rightBottom: Tab[] = [{ ID: "inspector", Label: UI_Str("Chart Inspector"), Component: InspectorPanel }];
		return { left, center, rightTop, rightBottom };
	});

	$effect(() =>
	{
		editor.OnRequestFocusSettings = () => { editor.ShowSettings = true; centerActive = "settings"; Invalidate(); };
		editor.OnRequestFocusHelp = () => { editor.ShowHelp = true; centerActive = "help"; Invalidate(); };
		return () => { editor.OnRequestFocusSettings = null; editor.OnRequestFocusHelp = null; };
	});
</script>

<div class="desktop">
	<MenuBar />
	<div class="main" style={`--top: ${topFraction}`}>
		<div class="top" style={`--left: ${leftFraction}; --right: ${rightFraction}`}>
			<div class="column left"><TabPanel tabs={tabs.left} bind:active={leftActive} /></div>
			<Splitter axis="x" bind:value={leftFraction} min={0.12} max={0.45} />
			<div class="column center"><TabPanel tabs={tabs.center} bind:active={centerActive} /></div>
			<Splitter axis="x" bind:value={rightFraction} min={0.12} max={0.45} invert />
			<div class="column right" style={`--right-top: ${rightTopFraction}`}>
				<div class="right-top"><TabPanel tabs={tabs.rightTop} bind:active={rightTopActive} /></div>
				<Splitter axis="y" bind:value={rightTopFraction} min={0.2} max={0.85} />
				<div class="right-bottom"><TabPanel tabs={tabs.rightBottom} /></div>
			</div>
		</div>
		<Splitter axis="y" bind:value={topFraction} min={0.15} max={0.8} />
		<div class="bottom">
			<div class="timeline-title">{UI_Str("Chart Timeline")}</div>
			<div class="timeline-host"><TimelineView /></div>
		</div>
	</div>
	<StatusBar />
</div>

<style>
	.desktop { display: flex; flex-direction: column; height: 100%; }
	.main { flex: 1; display: flex; flex-direction: column; min-height: 0; }
	.top { height: calc(var(--top) * 100%); display: flex; min-height: 0; }
	.column { min-width: 0; min-height: 0; }
	.left { width: calc(var(--left) * 100%); }
	.center { flex: 1; }
	.right { width: calc(var(--right) * 100%); display: flex; flex-direction: column; }
	.right-top { height: calc(var(--right-top) * 100%); min-height: 0; }
	.right-bottom { flex: 1; min-height: 0; }
	.bottom { flex: 1; display: flex; flex-direction: column; min-height: 0; border: 1px solid var(--border); }
	.timeline-title { flex: none; background: var(--tab-active); padding: 3px 10px; align-self: flex-start; }
	.timeline-host { flex: 1; min-height: 0; }
</style>
