<script lang="ts">
	// NOTE: Simplified port of "TJATestWindow" (peepo_drum_kit/test_gui_tja.cpp): edit TJA text directly, inspect parse errors and load it into the editor
	import { editor, Track, Invalidate } from "../state.svelte";
	import * as TJA from "../../formats/tja";
	import { ChartCourse } from "../../editor/chart";

	let text = $state("");
	let initialized = false;
	$effect(() => { Track(); if (!initialized && editor.LastImportResult !== null) { text = editor.LastImportResult.TJA.FileContentUTF8; initialized = true; } });

	const errors = $derived.by(() =>
	{
		const list = new TJA.ErrorList();
		TJA.ParseTokens(TJA.TokenizeLines(TJA.SplitLines(text)), list);
		return list.Errors;
	});

	function load(): void
	{
		editor.CheckOpenSaveConfirmationPopupThenCall(() =>
		{
			// HACK: Incredibly inefficient of course but just here for quick testing
			const result = editor.ImportChartFromText(text, editor.context.ChartFilePath || "Untitled Chart.tja");
			const context = editor.context;
			editor.createBackupOfOriginalTJABeforeOverwriteSave = false;
			context.Chart = result.Chart;
			if (context.Chart.Courses.length === 0) context.Chart.Courses.push(new ChartCourse());
			context.ChartSelectedCourse = context.Chart.Courses[0];
			context.Undo.ClearAll();
			Invalidate();
		});
	}
</script>

<div class="import">
	<div class="toolbar">
		<button onclick={() => { text = editor.ConvertChartToTJAText(false); }}>From current chart</button>
		<button onclick={load}>Load into editor</button>
		<span class="dim">{errors.length} error(s)</span>
	</div>
	<textarea class="code" spellcheck="false" bind:value={text}></textarea>
	{#if errors.length > 0}
		<div class="errors">
			{#each errors as error}
				<div><span class="line">{error.LineIndex + 1}</span> {error.Description}</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.import { display: flex; flex-direction: column; height: 100%; gap: 4px; padding: 4px; }
	.toolbar { display: flex; gap: 8px; align-items: center; }
	.dim { color: var(--text-dim); }
	.code { flex: 1; min-height: 120px; width: 100%; resize: none; white-space: pre; font-family: ui-monospace, Consolas, monospace; font-size: 0.9em; }
	.errors { max-height: 30%; overflow: auto; font-family: ui-monospace, Consolas, monospace; font-size: 0.85em; color: #ff8c8c; }
	.line { display: inline-block; min-width: 3em; color: var(--text-dim); }
</style>
