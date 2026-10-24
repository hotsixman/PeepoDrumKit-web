<script lang="ts">
	// NOTE: Port of "ChartHelpWindow::DrawGui()" (peepo_drum_kit/chart_editor_widgets.cpp)
	import { Track } from "../state.svelte";
	import { UI_Str } from "../../editor/i18n";
	import { Settings, ToShortcutString } from "../../editor/settings";

	const rows = $derived.by(() =>
	{
		Track();
		const input = Settings.Input;
		const s = (b: typeof input.Timeline_Cut, i: number = 0) => ToShortcutString(b[i]);
		return [
			["Move cursor", "Mouse Left / Tap"], ["Select items", "Mouse Right / Long Press"], ["Scroll", "Mouse Wheel / Drag"], ["Scroll panning", "Mouse Middle"],
			["Zoom", "Alt + Mouse Wheel / Pinch"], ["Fast (Action)", "Shift + { Action }"], ["Slow (Action)", "Alt + { Action }"], null,
			["Play / pause", s(input.Timeline_TogglePlayback)],
			["Add / remove note", `${s(input.Timeline_PlaceNoteKa, 0)} / ${s(input.Timeline_PlaceNoteDon, 0)} / ${s(input.Timeline_PlaceNoteDon, 1)} / ${s(input.Timeline_PlaceNoteKa, 1)}`],
			["Add long note", `${s(input.Timeline_PlaceNoteBalloon, 0)} / ${s(input.Timeline_PlaceNoteDrumroll, 0)} / ${s(input.Timeline_PlaceNoteDrumroll, 1)} / ${s(input.Timeline_PlaceNoteBalloon, 1)}`],
			["Add big note", "Alt + { Note }"], ["Fill range-selection with notes", "Shift + { Note }"], ["Start / end range-selection", s(input.Timeline_StartEndRangeSelection)],
			["Grid division", `Mouse [X1/X2] / [${s(input.Timeline_IncreaseGridDivision)}/${s(input.Timeline_DecreaseGridDivision)}]`],
			["Step cursor", `${s(input.Timeline_StepCursorLeft)} / ${s(input.Timeline_StepCursorRight)}`], null,
			["Move selected items", "Mouse Left (Hover)"], ["Cut selected items", s(input.Timeline_Cut)], ["Copy selected items", s(input.Timeline_Copy)],
			["Paste selected items", s(input.Timeline_Paste)], ["Delete selected items", s(input.Timeline_DeleteSelection)], null,
			["Playback speed", `${s(input.Timeline_DecreasePlaybackSpeed)} / ${s(input.Timeline_IncreasePlaybackSpeed)}`], ["Toggle metronome", s(input.Timeline_ToggleMetronome)],
		] as ([string, string] | null)[];
	});
</script>

<div class="panel-scroll help">
	<h2 class="green-dark">Welcome to Peepo Drum Kit (Beta) — Web</h2>
	<p class="green-bright">Things are still very much WIP and subject to change with some features still missing.</p>
	<p class="green-bright">This is a web port of <a href="https://github.com/samyuu/PeepoDrumKit" target="_blank" rel="noreferrer">PeepoDrumKit</a> by Samyuu, rebuilt with TypeScript and Svelte and extended with a touch friendly mobile layout.</p>
	<hr />

	<h3 class="red-dark">Basic Controls:</h3>
	<table class="red-bright">
		<tbody>
			{#each rows as row}
				{#if row === null}
					<tr><td colspan="2">&nbsp;</td></tr>
				{:else}
					<tr><td>{row[0]}</td><td>{row[1]}</td></tr>
				{/if}
			{/each}
		</tbody>
	</table>

	<h3 class="white-dark">About reading and writing TJAs:</h3>
	<hr />
	<p class="white-bright">
		Peepo Drum Kit is not really a TJA editor in the same sense that a text editor is one.<br />
		It's a Taiko chart editor that transparently converts to and from the TJA format, however its internal data representation of a chart differs significantly.<br /><br />
		As such, potential data-loss is the convertion process (to some extend) is to be expected.<br />
		This may either take the form of general formatting differences (removing comments, white space, etc.),
		issues with (yet) unimplemented features (such as branches and other commands)
		or general "rounding errors" due to notes and other commands being quantized onto a fixed 1/192nd grid (as is a common rhythm game convention).<br /><br />
		To prevent the user from accidentally overwriting existing TJAs, that have not originally been created via this program (as marked by a "PeepoDrumKit" comment),
		edited TJAs will have a ".bak" backup file created in-place before being overwritten (when the chart folder has been opened with write access).<br /><br />
		With that said, none of this should be a problem when creating new charts from inside the program itself
		as the goal is for the user to not have to interact with the ".tja" in text form at all.
	</p>
	<h3 class="white-dark">{UI_Str("About")}</h3>
	<hr />
	<p class="white-bright">
		Original program: <a href="https://github.com/samyuu/PeepoDrumKit" target="_blank" rel="noreferrer">github.com/samyuu/PeepoDrumKit</a> — Copyright (c) 2022 Samyuu.<br />
		Web port: TypeScript + Svelte. In the browser, songs referenced by a chart are found by opening the chart's whole folder (or by selecting the .tja and audio file together).
	</p>
</div>

<style>
	.help { padding: 8px 12px; font-size: 1.05em; }
	h2 { font-size: 1.35em; margin: 4px 0; }
	h3 { font-size: 1.1em; margin: 12px 0 4px 0; }
	p { margin: 4px 0; line-height: 1.45; }
	hr { border: none; border-top: 1px solid var(--border-light); }
	table { border-collapse: collapse; }
	td { padding: 2px 12px 2px 0; border-bottom: 1px solid var(--border-light); }
	a { color: inherit; }
	.green-dark { color: #dcf7ac; } .green-bright { color: #b8cc95; }
	.red-dark { color: #efba9b; } .red-bright { color: #e7b293; }
	.white-dark { color: #dcdc95; } .white-bright { color: #d3d3bb; }
</style>
