<script lang="ts">
	// NOTE: Port of "ChartLyricsWindow::DrawGui()" (peepo_drum_kit/chart_editor_widgets.cpp)
	import { editor, Track, Invalidate } from "../state.svelte";
	import { UI_Str } from "../../editor/i18n";
	import { Settings } from "../../editor/settings";
	import { TimeSpace, ConvertTimeSpace, MakeLyricChange } from "../../editor/chart";
	import { FloorBeatToGrid, GetGridBeatSnap } from "../../core/beat";
	import { TimeToString } from "../../core/types";
	import * as Commands from "../../editor/undo-commands";
	import Section from "../widgets/Section.svelte";

	// TODO: Populate char[U8Max] lookup table using provided flags and index into instead of using a switch (?)
	function ResolveEscapeSequences(input: string): string
	{
		let out = "";
		for (let i = 0; i < input.length; i++)
		{
			if (input[i] === "\\" && i + 1 < input.length)
			{
				if (input[i + 1] === "\\") { out += "\\"; i++; }
				else if (input[i + 1] === "n") { out += "\n"; i++; }
			}
			else out += input[i];
		}
		return out;
	}

	function ConvertToEscapeSequences(input: string): string
	{
		let out = "";
		for (const c of input) out += (c === "\\") ? "\\\\" : (c === "\n") ? "\\n" : c;
		return out;
	}

	const context = editor.context;
	const timeline = editor.timeline;
	let lyricInputActive = $state(false);
	let lyricInputBuffer = $state("");

	const data = $derived.by(() =>
	{
		Track();
		const course = context.ChartSelectedCourse;
		const timeSpace = Settings.General.DisplayTimeInSongSpace ? TimeSpace.Song : TimeSpace.Chart;
		// TODO: Maybe format as some existing subtitle format and visually show syntax errors somehow (?)
		let allLyrics = "";
		for (const lyricChange of course.Lyrics.Sorted)
			allLyrics += `${TimeToString(ConvertTimeSpace(course.TempoMap.BeatToTime(lyricChange.BeatTime), TimeSpace.Chart, timeSpace, context.Chart.SongOffset))} > ${ConvertToEscapeSequences(lyricChange.Lyric)}\n`;

		const cursorBeat = FloorBeatToGrid(context.GetCursorBeat(), GetGridBeatSnap(timeline.CurrentGridBarDivision));
		const lyricChangeAtCursor = course.Lyrics.TryFindLastAtBeat(cursorBeat);
		return { allLyrics, cursorBeat, lyricAtCursor: (lyricChangeAtCursor !== null) ? ResolveEscapeSequences(lyricChangeAtCursor.Lyric) : "", isExactlyAtCursor: lyricChangeAtCursor !== null && lyricChangeAtCursor.BeatTime === cursorBeat };
	});

	$effect(() => { if (!lyricInputActive) lyricInputBuffer = data.lyricAtCursor; });

	function onLyricInput(value: string): void
	{
		lyricInputBuffer = value;
		const course = context.ChartSelectedCourse;
		const newLyricLine = ConvertToEscapeSequences(value);
		if (!data.isExactlyAtCursor)
			context.Undo.Execute(new Commands.AddLyricChange(course.Lyrics, MakeLyricChange(data.cursorBeat, newLyricLine)));
		else
			context.Undo.Execute(new Commands.UpdateLyricChange(course.Lyrics, MakeLyricChange(data.cursorBeat, newLyricLine)));
		context.Undo.ResetMergeTimeThresholdStopwatch();
		Invalidate();
	}

	function clearOrRemove(clicked: 0 | 1): void
	{
		const course = context.ChartSelectedCourse;
		if (clicked === 0)
		{
			if (!data.isExactlyAtCursor) context.Undo.Execute(new Commands.AddLyricChange(course.Lyrics, MakeLyricChange(data.cursorBeat, "")));
			else context.Undo.Execute(new Commands.UpdateLyricChange(course.Lyrics, MakeLyricChange(data.cursorBeat, "")));
		}
		else if (data.isExactlyAtCursor)
		{
			context.Undo.Execute(new Commands.RemoveLyricChange(course.Lyrics, data.cursorBeat));
		}
		Invalidate();
	}
</script>

<div class="panel-scroll lyrics">
	<Section title={UI_Str("Lyrics Overview")}>
		<!-- BUG: Made read only for now to avoid round-trip time conversion error (same as the original) -->
		<textarea class="all-lyrics" readonly placeholder={UI_Str("(No Lyrics)")} value={data.allLyrics}></textarea>
	</Section>
	<Section title={UI_Str("Edit Line")}>
		<div class:disabled-block={data.cursorBeat < 0}>
			<textarea class="lyric-line" placeholder="n/a" value={lyricInputBuffer}
				onfocus={(e) => { lyricInputActive = true; e.currentTarget.select(); }}
				onblur={() => { lyricInputActive = false; context.Undo.DisallowMergeForLastCommand(); }}
				oninput={(e) => onLyricInput(e.currentTarget.value)}></textarea>
			<div class="two">
				<button onclick={() => clearOrRemove(0)}>{UI_Str("Clear")}</button>
				<button onclick={() => clearOrRemove(1)}>{UI_Str("Remove")}</button>
			</div>
		</div>
	</Section>
</div>

<style>
	textarea { width: 100%; resize: vertical; font-family: inherit; }
	.all-lyrics { min-height: 140px; }
	.lyric-line { min-height: 64px; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; margin-top: 2px; }
	.disabled-block { opacity: 0.5; pointer-events: none; }
</style>
