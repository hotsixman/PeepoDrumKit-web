<script lang="ts">
	// NOTE: Mobile (touch) layout, not part of the original PeepoDrumKit.
	//		 All actions route into the same ported editor / timeline functions used by the keyboard shortcuts of the desktop version.
	import { editor, ui, Track, Invalidate } from "../state.svelte";
	import { UI_Str } from "../../editor/i18n";
	import { BuildMenus, type MenuItem } from "../menus";
	import { NoteType, ToBigNoteIf, DifficultyTypeNames } from "../../editor/chart";
	import { GetGridBeatSnap, BeatFromBeats } from "../../core/beat";
	import { ClipboardAction, TransformAction } from "../../editor/timeline";
	import { FormatG, ToPercent, TimeToString } from "../../core/types";
	import { Input } from "../../editor/input";
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
	import type { Component } from "svelte";

	const context = editor.context;
	const timeline = editor.timeline;

	let menuOpen = $state(false);
	// NOTE: Index path (menu, item, sub item...) so that open submenus always show the current labels / states
	let menuPath: number[][] = $state([]);
	const currentSubmenu = $derived.by((): MenuItem[] =>
	{
		if (menuPath.length === 0) return [];
		const [menuIndex, ...itemIndices] = menuPath[menuPath.length - 1];
		let items = data.menus[menuIndex]?.Items ?? [];
		for (const index of itemIndices) items = items[index]?.Submenu ?? [];
		return items;
	});
	let sheet: string | null = $state(null);
	let showGame = $state(true);
	let selectMode = $state(false);
	let bigNote = $state(false);
	let longNote: "none" | "drumroll" | "balloon" = $state("none");

	const sheets: { ID: string; Label: string; Icon: string; Component: Component; Focus?: "tempoCalculator" }[] = [
		{ ID: "properties", Label: "Properties", Icon: "⚙", Component: PropertiesPanel },
		{ ID: "tempo", Label: "Chart Tempo", Icon: "♩", Component: TempoPanel },
		{ ID: "inspector", Label: "Inspector", Icon: "☰", Component: InspectorPanel },
		{ ID: "lyrics", Label: "Lyrics", Icon: "✎", Component: LyricsPanel },
		{ ID: "history", Label: "History", Icon: "↺", Component: UndoHistoryPanel },
		{ ID: "calculator", Label: "Tempo Calculator", Icon: "⏱", Component: TempoCalculatorPanel, Focus: "tempoCalculator" },
		{ ID: "settings", Label: "Settings", Icon: "⚒", Component: SettingsPanel },
		{ ID: "help", Label: "Usage Guide", Icon: "?", Component: HelpPanel },
		{ ID: "export", Label: "Export TJA", Icon: "⇩", Component: TJAExportPanel },
	];
	const currentSheet = $derived(sheets.find((s) => s.ID === sheet) ?? null);

	const data = $derived.by(() =>
	{
		Track();
		return {
			title: editor.GetWindowTitle().replace(/^Peepo Drum Kit - /, ""),
			canUndo: context.Undo.CanUndo(), canRedo: context.Undo.CanRedo(),
			isPlayback: context.GetIsPlayback(),
			grid: timeline.CurrentGridBarDivision,
			speed: ToPercent(context.GetPlaybackSpeed()),
			metronome: timeline.Metronome.IsEnabled,
			rangeActive: timeline.RangeSelection.IsActive, rangeHasEnd: timeline.RangeSelection.HasEnd,
			anySelected: editor.IsAnyItemSelected(), anyNoteSelected: editor.IsAnyNoteSelected(),
			courses: context.Chart.Courses.map((course) => ({ course, label: `${UI_Str(DifficultyTypeNames[course.Type] ?? "")} ★${course.Level}`, selected: course === context.ChartSelectedCourse })),
			menus: BuildMenus(),
		};
	});

	// NOTE: On-screen buttons act as if the timeline had keyboard focus
	const act = (fn: () => void) => () => { Input.FocusOwner = "timeline"; fn(); Invalidate(); };

	function placeNote(type: NoteType): void
	{
		timeline.PlaceNoteAndAdvanceCursor(context, ToBigNoteIf(type, bigNote), timeline.RangeSelectionIsActiveAndHasEnd() && timeline.External.ForceRangeFill);
	}

	function toggleLongNote(type: "drumroll" | "balloon"): void
	{
		// NOTE: First tap places the head at the cursor, the second tap places the tail (equivalent of pressing and releasing the key)
		longNote = (longNote === type) ? "none" : type;
		timeline.External.PlaceDrumrollDown = (longNote === "drumroll");
		timeline.External.PlaceBalloonDown = (longNote === "balloon");
	}

	$effect(() => { timeline.External.ForceBigNote = bigNote; });
	$effect(() => { timeline.CompactLayout = true; return () => { timeline.CompactLayout = false; }; });

	function stepCursor(direction: number, big: boolean): void
	{
		const distance = context.GetIsPlayback() ? BeatFromBeats(big ? 2 : 1) : (big ? BeatFromBeats(1) : GetGridBeatSnap(timeline.CurrentGridBarDivision));
		timeline.StepCursorByBeat(context, distance * direction);
	}

	function openMenuItem(item: MenuItem, path: number[]): void
	{
		if (item.Enabled === false) return;
		if (item.Submenu !== undefined) { menuPath = [...menuPath, path]; return; }
		if (item.KeepOpen) { item.Action?.(); Invalidate(); return; }
		menuOpen = false; menuPath = [];
		item.Action?.();
		Invalidate();
	}

	$effect(() =>
	{
		editor.OnRequestFocusSettings = () => { sheet = "settings"; };
		editor.OnRequestFocusHelp = () => { sheet = "help"; };
		return () => { editor.OnRequestFocusSettings = null; editor.OnRequestFocusHelp = null; };
	});

	// NOTE: Live cursor time display (updated outside of the regular ui version to stay smooth)
	let cursorText = $state("00:00.000");
	$effect(() =>
	{
		const hook = () => { const t = TimeToString(Math.max(0, context.GetCursorTime())); if (t !== cursorText) cursorText = t; };
		editor.FrameHooks.add(hook);
		return () => { editor.FrameHooks.delete(hook); };
	});
	void ui;
</script>

<div class="mobile">
	<header class="top-bar">
		<button class="icon" onclick={() => { menuOpen = !menuOpen; menuPath = []; }} aria-label="menu">☰</button>
		<div class="title">
			<span class="name">{data.title}</span>
			<span class="time">{cursorText}</span>
		</div>
		<button class="icon" disabled={!data.canUndo} onclick={act(() => context.Undo.Undo())} aria-label={UI_Str("Undo")}>↶</button>
		<button class="icon" disabled={!data.canRedo} onclick={act(() => context.Undo.Redo())} aria-label={UI_Str("Redo")}>↷</button>
		<button class="icon" class:on={!showGame} onclick={() => (showGame = !showGame)} aria-label={UI_Str("Game Preview")}>▭</button>
	</header>

	{#if data.courses.length > 1}
		<div class="courses">
			{#each data.courses as it}
				<button class:selected={it.selected} onclick={() => { editor.SelectCourse(it.course); Invalidate(); }}>{it.label}</button>
			{/each}
		</div>
	{/if}

	{#if showGame}
		<div class="game"><GamePreviewView /></div>
	{/if}

	<div class="timeline"><TimelineView {selectMode} /></div>

	{#if longNote !== "none"}
		<div class="hint">{UI_Str("Long note mode: move the cursor, then tap again to place")}</div>
	{/if}

	<div class="toolbar">
		<div class="row">
			<button class="tool" onclick={act(() => stepCursor(-1, false))} aria-label="step left">◀</button>
			<button class="tool play" class:on={data.isPlayback} onclick={act(() => timeline.TogglePlayback(context))}>{data.isPlayback ? "❚❚" : "▶"}</button>
			<button class="tool" onclick={act(() => stepCursor(+1, false))} aria-label="step right">▶|</button>
			<button class="tool small" onclick={act(() => timeline.ChangeGridDivision(-1))}>−</button>
			<span class="value">1/{data.grid}</span>
			<button class="tool small" onclick={act(() => timeline.ChangeGridDivision(+1))}>+</button>
			<button class="tool small" onclick={act(() => timeline.ChangePlaybackSpeedStep(context, +1))}>−</button>
			<span class="value">{FormatG(data.speed)}%</span>
			<button class="tool small" onclick={act(() => timeline.ChangePlaybackSpeedStep(context, -1))}>+</button>
			<button class="tool small" class:on={data.metronome} onclick={act(() => timeline.ToggleMetronome(context))} aria-label={UI_Str("Metronome")}>𝅘𝅥</button>
		</div>
		<div class="row notes">
			<button class="note don" onclick={act(() => placeNote(NoteType.Don))}>{UI_Str("Don")}</button>
			<button class="note ka" onclick={act(() => placeNote(NoteType.Ka))}>{UI_Str("Ka")}</button>
			<button class="note roll" class:on={longNote === "drumroll"} onclick={act(() => toggleLongNote("drumroll"))}>{UI_Str("Drumroll")}</button>
			<button class="note balloon" class:on={longNote === "balloon"} onclick={act(() => toggleLongNote("balloon"))}>{UI_Str("Balloon")}</button>
			<button class="tool toggle" class:on={bigNote} onclick={() => (bigNote = !bigNote)}>{UI_Str("Big")}</button>
		</div>
		<div class="row">
			<button class="tool toggle" class:on={selectMode} onclick={() => (selectMode = !selectMode)}>{UI_Str("Select Mode")}</button>
			<button class="tool toggle" class:on={data.rangeActive} onclick={act(() => timeline.StartEndRangeSelectionAtCursor(context))}>
				{(!data.rangeActive || data.rangeHasEnd) ? "[ " + UI_Str("Range") : UI_Str("Range") + " ]"}
			</button>
			<button class="tool toggle" class:on={timeline.External.ForceRangeFill} disabled={!(data.rangeActive && data.rangeHasEnd)} onclick={() => { timeline.External.ForceRangeFill = !timeline.External.ForceRangeFill; Invalidate(); }}>{UI_Str("Fill Range")}</button>
			<button class="tool" disabled={!data.anyNoteSelected} onclick={act(() => timeline.ExecuteTransformAction(context, TransformAction.FlipNoteType, {}))}>⇄</button>
			<button class="tool" disabled={!data.anySelected} onclick={act(() => { void timeline.ExecuteClipboardAction(context, ClipboardAction.Copy); })}>⧉</button>
			<button class="tool" onclick={act(() => { void timeline.ExecuteClipboardAction(context, ClipboardAction.Paste).then(Invalidate); })}>📋</button>
			<button class="tool" disabled={!data.anySelected} onclick={act(() => { void timeline.ExecuteClipboardAction(context, ClipboardAction.Delete).then(Invalidate); })}>🗑</button>
		</div>
	</div>

	<nav class="sheet-tabs">
		{#each sheets as s}
			<button class:active={sheet === s.ID} onclick={() => { sheet = (sheet === s.ID) ? null : s.ID; if (s.Focus) Input.FocusOwner = s.Focus; }}>
				<span class="tab-icon">{s.Icon}</span><span class="tab-label">{UI_Str(s.Label)}</span>
			</button>
		{/each}
	</nav>

	{#if currentSheet !== null}
		<div class="sheet-backdrop" role="presentation" onclick={() => (sheet = null)}></div>
		<section class="sheet">
			<div class="sheet-header">
				<span>{UI_Str(currentSheet.Label)}</span>
				<button class="icon" onclick={() => (sheet = null)} aria-label={UI_Str("Close")}>✕</button>
			</div>
			<div class="sheet-content" role="presentation" onpointerdown={() => { Input.FocusOwner = currentSheet?.Focus ?? "other"; }}>
				<currentSheet.Component />
			</div>
		</section>
	{/if}

	{#if menuOpen}
		<div class="sheet-backdrop" role="presentation" onclick={() => { menuOpen = false; menuPath = []; }}></div>
		<section class="menu-sheet">
			{#if menuPath.length === 0}
				{#each data.menus as menu, menuIndex}
					<div class="menu-group">
						<div class="menu-group-title">{menu.Label}</div>
						{#each menu.Items as item, itemIndex}
							{#if !item.Separator}
								<button class="menu-entry" disabled={item.Enabled === false} onclick={() => openMenuItem(item, [menuIndex, itemIndex])}>
									<span>{item.Checked ? "✓ " : ""}{item.Label}</span><span class="dim">{item.Submenu ? "›" : ""}</span>
								</button>
							{/if}
						{/each}
					</div>
				{/each}
			{:else}
				<button class="menu-entry back" onclick={() => (menuPath = menuPath.slice(0, -1))}>‹ Back</button>
				{#each currentSubmenu as item, itemIndex}
					{#if !item.Separator}
						<button class="menu-entry" disabled={item.Enabled === false} onclick={() => openMenuItem(item, [...menuPath[menuPath.length - 1], itemIndex])}>
							<span>{item.Checked ? "✓ " : ""}{item.Label}</span><span class="dim">{item.Submenu ? "›" : ""}</span>
						</button>
					{/if}
				{/each}
			{/if}
		</section>
	{/if}
</div>

<style>
	.mobile { display: flex; flex-direction: column; height: 100%; position: relative; overflow: hidden; padding-bottom: env(safe-area-inset-bottom); }
	.top-bar { flex: none; display: flex; align-items: center; gap: 4px; padding: 4px 6px; padding-top: max(4px, env(safe-area-inset-top)); background: var(--menubar); }
	.icon { width: 40px; height: 36px; padding: 0; font-size: 1.05em; background: transparent; border: none; }
	.icon.on { color: var(--accent); }
	.title { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.15; }
	.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
	.time { font-variant-numeric: tabular-nums; color: var(--text-dim); font-size: 0.85em; }
	.courses { flex: none; display: flex; overflow-x: auto; gap: 2px; padding: 2px 4px; background: var(--title); }
	.courses button { white-space: nowrap; padding: 4px 10px; }
	.courses button.selected { background: var(--tab-active); }
	.game { flex: none; height: min(26vw, 150px); }
	.timeline { flex: 1; min-height: 180px; }
	.hint { flex: none; background: var(--header-active); padding: 4px 8px; font-size: 0.85em; text-align: center; }
	.toolbar { flex: none; display: flex; flex-direction: column; gap: 4px; padding: 6px; background: var(--window); border-top: 1px solid var(--border); }
	.row { display: flex; gap: 4px; align-items: center; }
	.tool { flex: 1; height: 38px; padding: 0 4px; min-width: 0; font-size: 0.85em; line-height: 1.1; overflow: hidden; }
	.tool.small { flex: 0.6; }
	.tool.toggle { font-size: 0.72em; }
	.tool.on, .note.on { background: var(--header-active); border-color: var(--accent); }
	.tool.play { flex: 1.3; }
	.value { flex: none; min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; font-size: 0.8em; }
	.notes .note { flex: 1; height: 48px; font-weight: 700; font-size: 0.9em; color: #fff; border: 2px solid #1e1e1e; border-radius: 24px; }
	.note.don { background: #f3412b; }
	.note.ka { background: #51c3c2; }
	.note.roll { background: #f4b713; color: #1e1e1e; }
	.note.balloon { background: #fd7800; }
	.notes .toggle { flex: 0.8; height: 48px; }
	.sheet-tabs { flex: none; display: flex; overflow-x: auto; background: var(--menubar); scrollbar-width: none; }
	.sheet-tabs button { flex: 1 0 auto; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 4px 8px; background: transparent; border: none; border-radius: 0; min-width: 64px; }
	.sheet-tabs button.active { background: var(--tab-active); }
	.tab-icon { font-size: 1.1em; }
	.tab-label { font-size: 0.7em; white-space: nowrap; color: var(--text-dim); }
	.sheet-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.35); z-index: 40; }
	.sheet { position: absolute; left: 0; right: 0; bottom: 0; height: 62%; z-index: 41; background: var(--window); border-top: 1px solid var(--border-light); border-radius: 12px 12px 0 0; display: flex; flex-direction: column; box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.5); padding-bottom: env(safe-area-inset-bottom); }
	.sheet-header { flex: none; display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 4px 12px; font-weight: 600; border-bottom: 1px solid var(--border-light); }
	.sheet-content { flex: 1; min-height: 0; overflow: auto; }
	.sheet-content > :global(*) { height: 100%; }
	.menu-sheet { position: absolute; left: 0; top: 0; bottom: 0; width: min(86vw, 360px); z-index: 41; background: var(--popup); overflow-y: auto; padding: 8px 0; padding-top: max(8px, env(safe-area-inset-top)); box-shadow: 8px 0 24px rgba(0, 0, 0, 0.5); }
	.menu-group-title { padding: 8px 14px 2px 14px; color: var(--text-dim); font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; }
	.menu-entry { display: flex; justify-content: space-between; width: 100%; text-align: left; background: transparent; border: none; border-radius: 0; padding: 10px 16px; }
	.menu-entry:active { background: var(--header-hover); }
	.menu-entry.back { color: var(--accent); }
	.dim { color: var(--text-dim); }
</style>
