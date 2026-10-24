<script lang="ts">
	// NOTE: Port of the "TJA Export Debug View" window (peepo_drum_kit/chart_editor.cpp)
	import { editor, TrackChart } from "../state.svelte";
	import { UI_Str } from "../../editor/i18n";
	import * as TJA from "../../formats/tja";
	import { ChartProject, CreateChartProjectFromTJA, DebugCompareCharts } from "../../editor/chart";
	import { DownloadTextFile, UntitledChartFileName } from "../../editor/editor";

	let roundTripCheck = $state(false);
	let forceUpdate = $state(0);

	const result = $derived.by(() =>
	{
		TrackChart(); forceUpdate;
		const text = editor.ConvertChartToTJAText(false);
		let debugLog = "";
		if (roundTripCheck)
		{
			const tempErrors = new TJA.ErrorList();
			const tempTJA = TJA.ParseTokens(TJA.TokenizeLines(TJA.SplitLines(text)), tempErrors);
			const debugChart = new ChartProject();
			CreateChartProjectFromTJA(tempTJA, debugChart);
			DebugCompareCharts(editor.context.Chart, debugChart, (message) => { debugLog += message + "\n"; });
		}
		return { text, debugLog };
	});
</script>

<div class="export">
	<div class="toolbar">
		<label><input type="checkbox" bind:checked={roundTripCheck} /> Round-trip Conversion Check</label>
		<button onclick={() => forceUpdate++}>Force Update</button>
		<button onclick={() => DownloadTextFile(editor.context.ChartFilePath || UntitledChartFileName, editor.ConvertChartToTJAText(true))}>{UI_Str("Download TJA")}</button>
	</div>
	{#if roundTripCheck}
		<textarea class="log" readonly placeholder="No errors detected :)" value={result.debugLog}></textarea>
	{/if}
	<textarea class="code" readonly spellcheck="false" value={result.text}></textarea>
</div>

<style>
	.export { display: flex; flex-direction: column; height: 100%; gap: 4px; padding: 4px; }
	.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
	textarea { width: 100%; resize: none; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 0.9em; }
	.log { height: 5em; color: #f7ae42; }
	.code { flex: 1; min-height: 120px; white-space: pre; }
</style>
