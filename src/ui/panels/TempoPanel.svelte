<script lang="ts">
	// NOTE: Port of "ChartTempoWindow::DrawGui()" (peepo_drum_kit/chart_editor_widgets.cpp)
	import { editor, Track, Invalidate } from "../state.svelte";
	import { UI_Str } from "../../editor/i18n";
	import { Settings } from "../../editor/settings";
	import { TimeSpace, ConvertTimeSpace, ScrollSpeedToTempo, ScrollTempoToSpeed, IsNotesList, GenericList, ForEachSelectedChartItem, MakeScrollChange, MakeBarLineChange, MakeGoGoRange, NewSortedGoGoRangesList, CloneGoGoRange, GoGoGetStart, GoGoGetEnd, type GoGoRange } from "../../editor/chart";
	import { type Time, Clamp, ClampBot, TimeToString, TimeToMS, TimeFromMS, FormatG, F32Max } from "../../core/types";
	import { FloorBeatToGrid, GetGridBeatSnap, FallbackTempo, FallbackTimeSignature, TempoChange, TimeSignatureChange, Tempo, TimeSignature, IsTimeSignatureSupported, TicksPerBeat } from "../../core/beat";
	import { TimelineDragScalarSpeedAtZoomSec, TimelineDragScalarSpeedAtZoomMS } from "../../editor/timeline";
	import * as Commands from "../../editor/undo-commands";
	import Section from "../widgets/Section.svelte";
	import PropertyTable from "../widgets/PropertyTable.svelte";
	import DragNumber from "../widgets/DragNumber.svelte";

	const MinBPM = 30.0, MaxBPM = 960.0;
	const MinScrollSpeed = -100.0, MaxScrollSpeed = +100.0;
	const MinTimeSignatureValue = 1, MaxTimeSignatureValue = TicksPerBeat * 4;

	const context = editor.context;
	const timeline = editor.timeline;
	const undo = context.Undo;

	const data = $derived.by(() =>
	{
		Track();
		const chart = context.Chart, course = context.ChartSelectedCourse;
		let isAnyItemOtherThanNotesSelected = false, isAnyItemOtherThanScrollChangesSelected = false;
		ForEachSelectedChartItem(course, (it) =>
		{
			if (!IsNotesList(it.List)) isAnyItemOtherThanNotesSelected = true;
			if (it.List !== GenericList.ScrollChanges) isAnyItemOtherThanScrollChangesSelected = true;
		});

		const cursorBeat = FloorBeatToGrid(context.GetCursorBeat(), GetGridBeatSnap(timeline.CurrentGridBarDivision));
		const tempoChangeAtCursor = course.TempoMap.Tempo.TryFindLastAtBeat(cursorBeat);
		const signatureChangeAtCursor = course.TempoMap.Signature.TryFindLastAtBeat(cursorBeat);
		const scrollChangeAtCursor = course.ScrollChanges.TryFindLastAtBeat(cursorBeat);
		const barLineChangeAtCursor = course.BarLineChanges.TryFindLastAtBeat(cursorBeat);
		const gogoRangeAtCursor = course.GoGoRanges.TryFindOverlappingBeat(cursorBeat, cursorBeat);
		const tempoAtCursor = (tempoChangeAtCursor !== null) ? tempoChangeAtCursor.Tempo : FallbackTempo;
		const signatureAtCursor = (signatureChangeAtCursor !== null) ? signatureChangeAtCursor.Signature : FallbackTimeSignature;
		const scrollSpeedAtCursor = (scrollChangeAtCursor === null) ? 1.0 : scrollChangeAtCursor.ScrollSpeed;

		return {
			displaySpace: Settings.General.DisplayTimeInSongSpace ? TimeSpace.Song : TimeSpace.Chart,
			chartDuration: chart.ChartDuration, songDemoStartTime: chart.SongDemoStartTime, songOffset: chart.SongOffset,
			// NOTE: This might seem like a strange design decision at first (hence it at least being optional)
			//		 but the widgets here can only be used for inserting / editing (single) changes directly underneath the cursor
			//		 which in case of an active selection (in the properties window) can become confusing.
			disableWidgets: (Settings.General.DisableTempoWindowWidgetsIfHasSelection && isAnyItemOtherThanNotesSelected) || cursorBeat < 0,
			// NOTE: Specifically to prevent ugly "flashing" between add/remove labels during playback
			disallowRemoveButton: (cursorBeat < 0) || context.GetIsPlayback(),
			isAnyItemOtherThanScrollChangesSelected,
			cursorBeat, tempoAtCursor, signatureAtCursor, scrollSpeedAtCursor,
			tempoChangeIsAtCursor: tempoChangeAtCursor !== null && tempoChangeAtCursor.BeatTime === cursorBeat,
			signatureChangeIsAtCursor: signatureChangeAtCursor !== null && signatureChangeAtCursor.BeatTime === cursorBeat,
			scrollChangeIsAtCursor: scrollChangeAtCursor !== null && scrollChangeAtCursor.BeatTime === cursorBeat,
			barLineChangeIsAtCursor: barLineChangeAtCursor !== null && barLineChangeAtCursor.BeatTime === cursorBeat,
			barLineVisibleAtCursor: (barLineChangeAtCursor === null) ? true : barLineChangeAtCursor.IsVisible,
			gogoRangeAtCursorBeat: (gogoRangeAtCursor !== null) ? gogoRangeAtCursor.BeatTime : null,
			hasRangeSelection: timeline.RangeSelectionIsActiveAndHasEnd(),
			signatureSupported: IsTimeSignatureSupported(signatureAtCursor),
		};
	});

	const exec = (command: Parameters<typeof undo.Execute>[0]) => { undo.Execute(command); Invalidate(); };

	// NOTE: guiPropertyDragTimeAndSetCursorTimeButtonWidgets
	function toDisplay(v: Time, storageSpace: TimeSpace): number { return ConvertTimeSpace(v, storageSpace, data.displaySpace, context.Chart.SongOffset); }
	function fromDisplay(v: number, storageSpace: TimeSpace): Time { return ConvertTimeSpace(v, data.displaySpace, storageSpace, context.Chart.SongOffset); }
	function minDisplay(storageSpace: TimeSpace): number { return ConvertTimeSpace(0.0, storageSpace, data.displaySpace, context.Chart.SongOffset); }

	function setChartDuration(v: Time) { exec(new Commands.ChangeChartDuration(context.Chart, v)); }
	function setSongDemoStartTime(v: Time) { exec(new Commands.ChangeSongDemoStartTime(context.Chart, v)); }
	function setCursor(storageSpace: TimeSpace, apply: (v: Time) => void)
	{
		const v = ClampBot(ConvertTimeSpace(context.GetCursorTime(), TimeSpace.Chart, storageSpace, context.Chart.SongOffset), 0.0);
		undo.DisallowMergeForLastCommand();
		apply(v);
	}

	function insertOrUpdateCursorTempoChange(newTempo: number)
	{
		const course = context.ChartSelectedCourse;
		const change = TempoChange(data.cursorBeat, Tempo(newTempo));
		if (!data.tempoChangeIsAtCursor) exec(new Commands.AddTempoChange(course.TempoMap, change));
		else exec(new Commands.UpdateTempoChange(course.TempoMap, change));
	}

	function insertOrUpdateCursorSignatureChange(num: number, den: number)
	{
		// TODO: Also floor cursor beat to next whole bar (?)
		const course = context.ChartSelectedCourse;
		const change = TimeSignatureChange(data.cursorBeat, TimeSignature(Clamp(num, MinTimeSignatureValue, MaxTimeSignatureValue), Clamp(den, MinTimeSignatureValue, MaxTimeSignatureValue)));
		if (!data.signatureChangeIsAtCursor) exec(new Commands.AddTimeSignatureChange(course.TempoMap, change));
		else exec(new Commands.UpdateTimeSignatureChange(course.TempoMap, change));
	}

	function insertOrUpdateCursorScrollSpeedChange(newScrollSpeed: number)
	{
		const course = context.ChartSelectedCourse;
		const change = MakeScrollChange(data.cursorBeat, newScrollSpeed);
		if (!data.scrollChangeIsAtCursor) exec(new Commands.AddScrollChange(course.ScrollChanges, change));
		else exec(new Commands.UpdateScrollChange(course.ScrollChanges, change));
	}

	function insertOrUpdateCursorBarLineChange(newIsVisible: boolean)
	{
		const course = context.ChartSelectedCourse;
		const change = MakeBarLineChange(data.cursorBeat, newIsVisible);
		if (!data.barLineChangeIsAtCursor) exec(new Commands.AddBarLineChange(course.BarLineChanges, change));
		else exec(new Commands.UpdateBarLineChange(course.BarLineChanges, change));
	}

	function setGoGoFromRangeSelection()
	{
		const course = context.ChartSelectedCourse;
		const rangeSelectionMin = timeline.RoundBeatToCurrentGrid(timeline.RangeSelectionGetMin());
		const rangeSelectionMax = timeline.RoundBeatToCurrentGrid(timeline.RangeSelectionGetMax());
		const gogoIntersectsSelection = (gogo: GoGoRange) => (GoGoGetStart(gogo) < rangeSelectionMax) && (GoGoGetEnd(gogo) > rangeSelectionMin);

		// TODO: Try to shorten/move intersecting gogo ranges instead of removing them outright
		const newGoGoRanges = NewSortedGoGoRangesList(course.GoGoRanges.Sorted.filter((g) => !gogoIntersectsSelection(g)).map(CloneGoGoRange));
		newGoGoRanges.InsertOrUpdate(MakeGoGoRange(rangeSelectionMin, (rangeSelectionMax - rangeSelectionMin)));
		exec(new Commands.AddGoGoRange(course.GoGoRanges, newGoGoRanges));
	}
</script>

<div class="panel-scroll">
	<Section title={UI_Str("Sync")}>
		<PropertyTable>
			{#each [{ label: "Chart Duration", value: data.chartDuration, space: TimeSpace.Chart, apply: setChartDuration }, { label: "Song Demo Start", value: data.songDemoStartTime, space: TimeSpace.Song, apply: setSongDemoStartTime }] as it (it.label)}
				<div class="prop-label">
					<DragNumber labelOnly label={UI_Str(it.label)} value={toDisplay(it.value, it.space)} dragSpeed={TimelineDragScalarSpeedAtZoomSec(timeline.Camera)}
						clamp min={minDisplay(it.space)} max={F32Max} onexact={(v) => it.apply(fromDisplay(v, it.space))} />
				</div>
				<div class="prop-value row">
					<span class="time-display">{(it.value <= 0.0) ? "n/a" : TimeToString(toDisplay(it.value, it.space))}</span>
					<button class="half" onclick={() => setCursor(it.space, it.apply)}>{UI_Str("Set Cursor")}</button>
				</div>
			{/each}

			<div class="prop-label">
				<DragNumber labelOnly label={UI_Str("Song Offset")} value={TimeToMS(data.songOffset)} dragSpeed={TimelineDragScalarSpeedAtZoomMS(timeline.Camera)}
					onexact={(v) => exec(new Commands.ChangeSongOffset(context.Chart, TimeFromMS(v)))} />
			</div>
			<div class="prop-value">
				<DragNumber value={TimeToMS(data.songOffset)} step={1.0} stepFast={10.0} format={(v) => `${v.toFixed(2)} ms`}
					onexact={(v) => exec(new Commands.ChangeSongOffset(context.Chart, TimeFromMS(v)))} />
			</div>
		</PropertyTable>
	</Section>

	<Section title={UI_Str("Tempo")}>
		<div class:disabled-block={data.disableWidgets}>
			<PropertyTable>
				<div class="prop-label">
					<DragNumber labelOnly label={UI_Str("Tempo")} value={data.tempoAtCursor.BPM} dragSpeed={1.0} clamp min={MinBPM} max={MaxBPM} onexact={insertOrUpdateCursorTempoChange} />
				</div>
				<div class="prop-value">
					<DragNumber value={data.tempoAtCursor.BPM} step={1.0} stepFast={10.0} clamp min={MinBPM} max={MaxBPM} format={(v) => `${FormatG(v)} BPM`} onexact={insertOrUpdateCursorTempoChange} />
					{#if !data.disallowRemoveButton && data.tempoChangeIsAtCursor}
						<button onclick={() => exec(new Commands.RemoveTempoChange(context.ChartSelectedCourse.TempoMap, data.cursorBeat))}>{UI_Str("Remove")}</button>
					{:else}
						<button onclick={() => insertOrUpdateCursorTempoChange(data.tempoAtCursor.BPM)}>{UI_Str("Add")}</button>
					{/if}
				</div>

				<div class="prop-label">{UI_Str("Time Signature")}</div>
				<div class="prop-value">
					<div class="fraction">
						<DragNumber value={data.signatureAtCursor.Numerator} integer step={1} stepFast={4} clamp min={MinTimeSignatureValue} max={MaxTimeSignatureValue} warning={!data.signatureSupported}
							onexact={(v) => insertOrUpdateCursorSignatureChange(v, data.signatureAtCursor.Denominator)} />
						<span>/</span>
						<DragNumber value={data.signatureAtCursor.Denominator} integer step={1} stepFast={4} clamp min={MinTimeSignatureValue} max={MaxTimeSignatureValue} warning={!data.signatureSupported}
							onexact={(v) => insertOrUpdateCursorSignatureChange(data.signatureAtCursor.Numerator, v)} />
					</div>
					{#if !data.disallowRemoveButton && data.signatureChangeIsAtCursor}
						<button onclick={() => exec(new Commands.RemoveTimeSignatureChange(context.ChartSelectedCourse.TempoMap, data.cursorBeat))}>{UI_Str("Remove")}</button>
					{:else}
						<button onclick={() => insertOrUpdateCursorSignatureChange(data.signatureAtCursor.Numerator, data.signatureAtCursor.Denominator)}>{UI_Str("Add")}</button>
					{/if}
				</div>

				<div class="prop-label">
					<DragNumber labelOnly label={UI_Str("Scroll Speed")} value={data.scrollSpeedAtCursor} dragSpeed={0.005} clamp min={MinScrollSpeed} max={MaxScrollSpeed} onexact={insertOrUpdateCursorScrollSpeedChange} />
				</div>
				<div class="prop-value">
					<div class="two">
						<DragNumber value={data.scrollSpeedAtCursor} step={0.1} stepFast={0.5} format={(v) => `${FormatG(v)}x`} onexact={(v) => insertOrUpdateCursorScrollSpeedChange(Clamp(v, MinScrollSpeed, MaxScrollSpeed))} />
						<DragNumber value={ScrollSpeedToTempo(data.scrollSpeedAtCursor, data.tempoAtCursor).BPM} step={1.0} stepFast={10.0} format={(v) => `${FormatG(v)} BPM`}
							onexact={(v) => insertOrUpdateCursorScrollSpeedChange(ScrollTempoToSpeed(Tempo(Clamp(v, MinBPM, MaxBPM)), data.tempoAtCursor))} />
					</div>
					{#if !data.disallowRemoveButton && data.scrollChangeIsAtCursor}
						<button onclick={() => exec(new Commands.RemoveScrollChange(context.ChartSelectedCourse.ScrollChanges, data.cursorBeat))}>{UI_Str("Remove")}</button>
					{:else}
						<button onclick={() => insertOrUpdateCursorScrollSpeedChange(data.scrollSpeedAtCursor)}>{UI_Str("Add")}</button>
					{/if}
				</div>

				<div class="prop-label">{UI_Str("Bar Line Visibility")}</div>
				<div class="prop-value">
					<div class="two">
						<button class:off={!data.barLineVisibleAtCursor} onclick={() => insertOrUpdateCursorBarLineChange(true)}>{UI_Str("Visible")}</button>
						<button class:off={data.barLineVisibleAtCursor} onclick={() => insertOrUpdateCursorBarLineChange(false)}>{UI_Str("Hidden")}</button>
					</div>
					{#if !data.disallowRemoveButton && data.barLineChangeIsAtCursor}
						<button onclick={() => exec(new Commands.RemoveBarLineChange(context.ChartSelectedCourse.BarLineChanges, data.cursorBeat))}>{UI_Str("Remove")}</button>
					{:else}
						<button onclick={() => insertOrUpdateCursorBarLineChange(data.barLineVisibleAtCursor)}>{UI_Str("Add")}</button>
					{/if}
				</div>

				<div class="prop-label">{UI_Str("Go-Go Time")}</div>
				<div class="prop-value">
					<button disabled={!data.hasRangeSelection} onclick={setGoGoFromRangeSelection}>{UI_Str("Set from Range Selection")}</button>
					<button disabled={data.gogoRangeAtCursorBeat === null} onclick={() => { if (data.gogoRangeAtCursorBeat !== null) exec(new Commands.RemoveGoGoRange(context.ChartSelectedCourse.GoGoRanges, data.gogoRangeAtCursorBeat)); }}>{UI_Str("Remove")}</button>
				</div>
			</PropertyTable>
		</div>

		<button class="full" disabled={!data.isAnyItemOtherThanScrollChangesSelected} onclick={() => { timeline.ExecuteConvertSelectionToScrollChanges(context); Invalidate(); }}>{UI_Str("Selection to Scroll Changes")}</button>
	</Section>
</div>

<style>
	.time-display { flex: 1; min-width: 0; font-variant-numeric: tabular-nums; padding: 0 4px; }
	.half { flex: 1; }
	.fraction { display: grid; grid-template-columns: 1fr auto 1fr; gap: 4px; align-items: center; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; }
	.off { opacity: 0.5; }
	.disabled-block { opacity: 0.5; pointer-events: none; }
	.full { width: 100%; margin-top: 4px; }
</style>
