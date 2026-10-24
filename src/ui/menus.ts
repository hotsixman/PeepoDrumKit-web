// NOTE: Port of "ChartEditor::DrawFullscreenMenuBar()" (peepo_drum_kit/chart_editor.cpp) as a data driven menu model,
//		 shared by the desktop menu bar and the mobile menu sheet
import { editor, Invalidate, ui } from "./state.svelte";
import { UI_Str, SetGuiLanguage, GuiLanguage, LanguageState } from "../editor/i18n";
import { Settings, PersistentApp, SavePersistentApp, SaveUserSettings, ToShortcutString, type MultiInputBinding } from "../editor/settings";
import { ClipboardAction, SelectionAction, TransformAction } from "../editor/timeline";
import { ToggleFullscreen, DownloadTextFile, UntitledChartFileName } from "../editor/editor";
import { BuildDate } from "../editor/chart";
import { DateToString } from "../core/types";

export interface MenuItem
{
	Label: string;
	Shortcut?: string;
	Enabled?: boolean;
	Checked?: boolean;
	Action?: () => void;
	Submenu?: MenuItem[];
	Separator?: boolean;
}

export interface Menu { Label: string; Items: MenuItem[]; }

const Sep: MenuItem = { Label: "", Separator: true };
const Key = (binding: MultiInputBinding) => ToShortcutString(binding);

export function BuildMenus(): Menu[]
{
	const context = editor.context;
	const timeline = editor.timeline;
	const input = Settings.Input;
	const isAnyItemSelected = editor.IsAnyItemSelected();
	const isAnyNoteSelected = editor.IsAnyNoteSelected();
	const run = (fn: () => void) => () => { fn(); Invalidate(); };

	const setRangeSelectionStartNext = (!timeline.RangeSelection.IsActive || timeline.RangeSelection.HasEnd);
	const customPatterns = Settings.General.CustomSelectionPatterns.V;
	const customBindings = [input.Timeline_SelectItemPattern_CustomA, input.Timeline_SelectItemPattern_CustomB, input.Timeline_SelectItemPattern_CustomC, input.Timeline_SelectItemPattern_CustomD, input.Timeline_SelectItemPattern_CustomE, input.Timeline_SelectItemPattern_CustomF];

	const layoutItem = (label: string, value: "auto" | "desktop" | "mobile"): MenuItem => ({
		Label: UI_Str(label), Checked: ui.layout === value,
		Action: () => { ui.layout = value; PersistentApp.LastSession.UseMobileLayout = value; SavePersistentApp(); },
	});

	const languageItem = (name: string, localName: string, code: string, language: GuiLanguage): MenuItem => ({
		Label: (UI_Str(name) === name) ? `${name} (${localName})` : `${UI_Str(name)} (${name})`, Shortcut: code, Checked: LanguageState.Selected === language,
		Action: () => { SetGuiLanguage(language); PersistentApp.LastSession.GuiLanguage = code; SavePersistentApp(); Invalidate(); },
	});

	return [
		{
			Label: UI_Str("File"), Items: [
				{ Label: UI_Str("New Chart"), Shortcut: Key(input.Editor_ChartNew), Action: () => editor.CheckOpenSaveConfirmationPopupThenCall(() => { editor.CreateNewChart(); Invalidate(); }) },
				{ Label: UI_Str("Open..."), Shortcut: Key(input.Editor_ChartOpen), Action: () => editor.CheckOpenSaveConfirmationPopupThenCall(() => { void editor.OpenLoadChartFileDialog(); }) },
				{ Label: UI_Str("Open Folder..."), Shortcut: Key(input.Editor_ChartOpenDirectory), Action: () => editor.CheckOpenSaveConfirmationPopupThenCall(() => { void editor.OpenChartFolderDialog(); }) },
				{ Label: UI_Str("Open Song..."), Action: () => { void editor.OpenLoadAudioFileDialog(); } },
				{
					Label: UI_Str("Open Recent"), Enabled: PersistentApp.RecentFiles.SortedPaths.length > 0, Submenu: [
						...PersistentApp.RecentFiles.SortedPaths.map((path, i): MenuItem => ({ Label: path, Shortcut: (i < 9) ? String(i + 1) : "", Enabled: false })),
						{ Label: UI_Str("Recent files are not available in the browser"), Enabled: false },
						Sep,
						{ Label: UI_Str("Clear Items"), Action: run(() => { PersistentApp.RecentFiles.SortedPaths = []; SavePersistentApp(); }) },
					],
				},
				Sep,
				{ Label: UI_Str("Save"), Shortcut: Key(input.Editor_ChartSave), Action: () => { void editor.TrySaveChartOrOpenSaveAsDialog().then(Invalidate); } },
				{ Label: UI_Str("Save As..."), Shortcut: Key(input.Editor_ChartSaveAs), Action: () => { void editor.OpenChartSaveAsDialog().then(Invalidate); } },
				{ Label: UI_Str("Download TJA"), Action: () => DownloadTextFile(context.ChartFilePath || UntitledChartFileName, editor.ConvertChartToTJAText(true)) },
			],
		},
		{
			Label: UI_Str("Edit"), Items: [
				{ Label: UI_Str("Undo"), Shortcut: Key(input.Editor_Undo), Enabled: context.Undo.CanUndo(), Action: run(() => context.Undo.Undo()) },
				{ Label: UI_Str("Redo"), Shortcut: Key(input.Editor_Redo), Enabled: context.Undo.CanRedo(), Action: run(() => context.Undo.Redo()) },
				Sep,
				{ Label: UI_Str("Cut"), Shortcut: Key(input.Timeline_Cut), Enabled: isAnyItemSelected, Action: () => { void timeline.ExecuteClipboardAction(context, ClipboardAction.Cut).then(Invalidate); } },
				{ Label: UI_Str("Copy"), Shortcut: Key(input.Timeline_Copy), Enabled: isAnyItemSelected, Action: () => { void timeline.ExecuteClipboardAction(context, ClipboardAction.Copy); } },
				{ Label: UI_Str("Paste"), Shortcut: Key(input.Timeline_Paste), Action: () => { void timeline.ExecuteClipboardAction(context, ClipboardAction.Paste).then(Invalidate); } },
				{ Label: UI_Str("Delete"), Shortcut: Key(input.Timeline_DeleteSelection), Enabled: isAnyItemSelected, Action: () => { void timeline.ExecuteClipboardAction(context, ClipboardAction.Delete).then(Invalidate); } },
				Sep,
				{ Label: UI_Str("Settings"), Shortcut: Key(input.Editor_OpenSettings), Action: run(() => { editor.ShowSettings = true; editor.OnRequestFocusSettings?.(); }) },
			],
		},
		{
			Label: UI_Str("Selection"), Items: [
				{ Label: setRangeSelectionStartNext ? UI_Str("Start Range Selection") : UI_Str("End Range Selection"), Shortcut: Key(input.Timeline_StartEndRangeSelection), Action: run(() => timeline.StartEndRangeSelectionAtCursor(context)) },
				Sep,
				{ Label: UI_Str("Select All"), Shortcut: Key(input.Timeline_SelectAll), Action: run(() => timeline.ExecuteSelectionAction(context, SelectionAction.SelectAll, {})) },
				{ Label: UI_Str("Clear Selection"), Shortcut: Key(input.Timeline_ClearSelection), Enabled: isAnyItemSelected, Action: run(() => timeline.ExecuteSelectionAction(context, SelectionAction.UnselectAll, {})) },
				{ Label: UI_Str("Invert Selection"), Shortcut: Key(input.Timeline_InvertSelection), Action: run(() => timeline.ExecuteSelectionAction(context, SelectionAction.InvertAll, {})) },
				{ Label: UI_Str("From Range Selection"), Shortcut: Key(input.Timeline_SelectAllWithinRangeSelection), Enabled: timeline.RangeSelectionIsActiveAndHasEnd(), Action: run(() => timeline.ExecuteSelectionAction(context, SelectionAction.SelectAllWithinRangeSelection, {})) },
				Sep,
				{
					Label: UI_Str("Refine Selection"), Submenu: [
						{ Label: UI_Str("Shift selection Left"), Shortcut: Key(input.Timeline_ShiftSelectionLeft), Enabled: isAnyItemSelected, Action: run(() => timeline.ExecuteSelectionAction(context, SelectionAction.PerRowShiftSelected, { ShiftDelta: -1 })) },
						{ Label: UI_Str("Shift selection Right"), Shortcut: Key(input.Timeline_ShiftSelectionRight), Enabled: isAnyItemSelected, Action: run(() => timeline.ExecuteSelectionAction(context, SelectionAction.PerRowShiftSelected, { ShiftDelta: +1 })) },
						Sep,
						...(["xo", "xoo", "xooo", "xxoo"] as const).map((pattern): MenuItem => ({
							Label: UI_Str(`Select Item Pattern ${pattern}`), Shortcut: Key(input[`Timeline_SelectItemPattern_${pattern}`]), Enabled: isAnyItemSelected,
							Action: run(() => timeline.ExecuteSelectionAction(context, SelectionAction.PerRowSelectPattern, { Pattern: pattern })),
						})),
						Sep,
						{ Label: UI_Str("Add New Pattern..."), Enabled: customPatterns.length < 6, Action: run(() => { const defaultPattern = "xoooooo"; customPatterns.push(defaultPattern.substring(0, Math.min(customPatterns.length + 2, defaultPattern.length))); SaveUserSettings(); }) },
						...customPatterns.map((pattern, i): MenuItem => ({
							Label: `${UI_Str("Select Custom Pattern")} ${String.fromCharCode(65 + i)} (${pattern})`, Shortcut: (i < customBindings.length) ? Key(customBindings[i]) : "",
							Enabled: isAnyItemSelected && pattern.length > 0, Action: run(() => timeline.ExecuteSelectionAction(context, SelectionAction.PerRowSelectPattern, { Pattern: pattern })),
						})),
					],
				},
			],
		},
		{
			Label: UI_Str("Transform"), Items: [
				{ Label: UI_Str("Flip Note Types"), Shortcut: Key(input.Timeline_FlipNoteType), Enabled: isAnyNoteSelected, Action: run(() => timeline.ExecuteTransformAction(context, TransformAction.FlipNoteType, {})) },
				{ Label: UI_Str("Toggle Note Sizes"), Shortcut: Key(input.Timeline_ToggleNoteSize), Enabled: isAnyNoteSelected, Action: run(() => timeline.ExecuteTransformAction(context, TransformAction.ToggleNoteSize, {})) },
				{
					Label: UI_Str("Expand Items"), Submenu: [
						{ Label: UI_Str("2:1 (8th to 4th)"), Shortcut: Key(input.Timeline_ExpandItemTime_2To1), Enabled: isAnyItemSelected, Action: run(() => timeline.ExecuteTransformAction(context, TransformAction.ScaleItemTime, { TimeRatio: [2, 1] })) },
						{ Label: UI_Str("3:2 (12th to 8th)"), Shortcut: Key(input.Timeline_ExpandItemTime_3To2), Enabled: isAnyItemSelected, Action: run(() => timeline.ExecuteTransformAction(context, TransformAction.ScaleItemTime, { TimeRatio: [3, 2] })) },
						{ Label: UI_Str("4:3 (16th to 12th)"), Shortcut: Key(input.Timeline_ExpandItemTime_4To3), Enabled: isAnyItemSelected, Action: run(() => timeline.ExecuteTransformAction(context, TransformAction.ScaleItemTime, { TimeRatio: [4, 3] })) },
					],
				},
				{
					Label: UI_Str("Compress Items"), Submenu: [
						{ Label: UI_Str("1:2 (4th to 8th)"), Shortcut: Key(input.Timeline_CompressItemTime_1To2), Enabled: isAnyItemSelected, Action: run(() => timeline.ExecuteTransformAction(context, TransformAction.ScaleItemTime, { TimeRatio: [1, 2] })) },
						{ Label: UI_Str("2:3 (8th to 12th)"), Shortcut: Key(input.Timeline_CompressItemTime_2To3), Enabled: isAnyItemSelected, Action: run(() => timeline.ExecuteTransformAction(context, TransformAction.ScaleItemTime, { TimeRatio: [2, 3] })) },
						{ Label: UI_Str("3:4 (12th to 16th)"), Shortcut: Key(input.Timeline_CompressItemTime_3To4), Enabled: isAnyItemSelected, Action: run(() => timeline.ExecuteTransformAction(context, TransformAction.ScaleItemTime, { TimeRatio: [3, 4] })) },
					],
				},
			],
		},
		{
			Label: UI_Str("Window"), Items: [
				{ Label: UI_Str("Toggle Fullscreen"), Shortcut: Key(input.Editor_ToggleFullscreen), Checked: document.fullscreenElement !== null, Action: ToggleFullscreen },
				{
					Label: UI_Str("DPI Scale"), Submenu: [
						{ Label: UI_Str("Zoom In"), Shortcut: Key(input.Editor_IncreaseGuiScale), Enabled: editor.CanZoomInGuiScale(), Action: run(() => editor.ZoomInGuiScale()) },
						{ Label: UI_Str("Zoom Out"), Shortcut: Key(input.Editor_DecreaseGuiScale), Enabled: editor.CanZoomOutGuiScale(), Action: run(() => editor.ZoomOutGuiScale()) },
						{ Label: UI_Str("Reset Zoom"), Shortcut: Key(input.Editor_ResetGuiScale), Enabled: editor.CanZoomResetGuiScale(), Action: run(() => editor.ZoomResetGuiScale()) },
					],
				},
				{ Label: UI_Str("Layout"), Submenu: [layoutItem("Automatic Layout", "auto"), layoutItem("Desktop Layout", "desktop"), layoutItem("Mobile Layout", "mobile")] },
				Sep,
				{ Label: UI_Str("Usage Guide"), Shortcut: Key(input.Editor_OpenHelp), Checked: editor.ShowHelp, Action: run(() => { editor.ShowHelp = !editor.ShowHelp; PersistentApp.LastSession.ShowWindow_Help = editor.ShowHelp; SavePersistentApp(); }) },
				{ Label: UI_Str("Settings"), Checked: editor.ShowSettings, Action: run(() => { editor.ShowSettings = !editor.ShowSettings; PersistentApp.LastSession.ShowWindow_Settings = editor.ShowSettings; SavePersistentApp(); }) },
				{
					Label: UI_Str("Test Menu"), Submenu: [
						{ Label: UI_Str("Show TJA Import Test"), Checked: editor.ShowTJAImportTest, Action: run(() => { editor.ShowTJAImportTest = !editor.ShowTJAImportTest; PersistentApp.LastSession.ShowWindow_TJAImportTest = editor.ShowTJAImportTest; SavePersistentApp(); }) },
						{ Label: UI_Str("Show TJA Export View"), Checked: editor.ShowTJAExportView, Action: run(() => { editor.ShowTJAExportView = !editor.ShowTJAExportView; PersistentApp.LastSession.ShowWindow_TJAExportTest = editor.ShowTJAExportView; SavePersistentApp(); }) },
					],
				},
			],
		},
		{
			Label: UI_Str("Language"), Items: [
				languageItem("English", "English", "en", GuiLanguage.EN),
				languageItem("Japanese", "日本語", "ja", GuiLanguage.JA),
				languageItem("Korean", "한국어", "ko", GuiLanguage.KO),
			],
		},
		{
			Label: UI_Str("Help"), Items: [
				{ Label: UI_Str("Copyright (c) 2022"), Shortcut: "Samyuu", Enabled: false },
				{ Label: UI_Str("Ported from PeepoDrumKit"), Shortcut: "github.com/samyuu/PeepoDrumKit", Action: () => window.open("https://github.com/samyuu/PeepoDrumKit", "_blank", "noopener") },
				{ Label: UI_Str("Build Date:"), Shortcut: DateToString(BuildDate), Enabled: false },
				Sep,
				{ Label: UI_Str("Usage Guide"), Shortcut: Key(input.Editor_OpenHelp), Action: run(() => { editor.ShowHelp = true; editor.OnRequestFocusHelp?.(); }) },
			],
		},
	];
}
