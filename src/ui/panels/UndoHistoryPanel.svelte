<script lang="ts">
	// NOTE: Port of "ChartUndoHistoryWindow::DrawGui()" (peepo_drum_kit/chart_editor_widgets.cpp)
	import { editor, Track, Invalidate } from "../state.svelte";
	import { UI_Str } from "../../editor/i18n";
	import { TimeToString } from "../../core/types";

	const undo = editor.context.Undo;
	const programStartTime = performance.now() / 1000.0;
	let scroller: HTMLDivElement | undefined = $state();

	const rows = $derived.by(() =>
	{
		Track();
		return {
			undo: undo.UndoStack.map((c) => ({ description: UI_Str(c.GetInfo().Description), time: TimeToString(c.CreationTime - programStartTime) })),
			redo: undo.RedoStack.map((c) => ({ description: UI_Str(c.GetInfo().Description), time: TimeToString(c.CreationTime - programStartTime) })).reverse(),
		};
	});

	// NOTE: Auto scroll if not already at bottom
	$effect(() =>
	{
		rows;
		if (scroller !== undefined)
			requestAnimationFrame(() => { if (scroller !== undefined) scroller.scrollTop = scroller.scrollHeight; });
	});

	function clickUndo(i: number): void { undo.Undo(undo.UndoStack.length - i - 1); Invalidate(); }
	function clickRedo(redoDisplayIndex: number): void { const redoIndex = (undo.RedoStack.length - 1) - redoDisplayIndex; undo.Redo(undo.RedoStack.length - redoIndex); Invalidate(); }
</script>

<div class="history" bind:this={scroller}>
	<table>
		<thead><tr><th>{UI_Str("Description")}</th><th>{UI_Str("Time")}</th></tr></thead>
		<tbody>
			<tr class:selected={rows.undo.length === 0} onclick={() => { undo.Undo(undo.UndoStack.length); Invalidate(); }}>
				<td>{UI_Str("Initial State")}</td><td class="dim">{TimeToString(0)}</td>
			</tr>
			{#each rows.undo as row, i}
				<tr class:selected={(i + 1) === rows.undo.length} onclick={() => clickUndo(i)}><td>{row.description}</td><td class="dim">{row.time}</td></tr>
			{/each}
			{#each rows.redo as row, i}
				<tr class="redo" onclick={() => clickRedo(i)}><td>{row.description}</td><td class="dim">{row.time}</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.history { height: 100%; overflow: auto; }
	table { width: 100%; border-collapse: collapse; }
	th { position: sticky; top: 0; background: var(--header); text-align: left; padding: 4px 6px; font-weight: 600; }
	td { padding: 4px 6px; border-bottom: 1px solid var(--border-light); cursor: pointer; }
	tr:hover td { background: var(--header-hover); }
	tr.selected td { background: var(--header); }
	tr.redo td { color: var(--text-dim); }
	.dim { color: var(--text-dim); font-variant-numeric: tabular-nums; width: 1%; white-space: nowrap; }
</style>
