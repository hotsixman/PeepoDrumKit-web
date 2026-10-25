// Port of PeepoDrumKit "peepo_drum_kit/chart_editor_settings.h"
// https://github.com/samyuu/PeepoDrumKit
//
// NOTE: Settings are persisted to localStorage (instead of the "settings_user.ini" file used by the original)

export const PeepoDrumKitApplicationTitle = "Peepo Drum Kit";

// NOTE: Equivalent of ImGuiModFlags
export const ModFlags_None = 0, ModFlags_Ctrl = 1 << 0, ModFlags_Shift = 1 << 1, ModFlags_Alt = 1 << 2;
export const ModFlags_CtrlShift = ModFlags_Ctrl | ModFlags_Shift;

// NOTE: "Key" is a KeyboardEvent.code value such as "KeyF", "Space", "ArrowLeft", etc.
export interface KeyBinding { Key: string; Mods: number; }
export const KeyBinding = (key: string, mods: number = ModFlags_None): KeyBinding => ({ Key: key, Mods: mods });
export type MultiInputBinding = KeyBinding[];

export enum InputModifierBehavior { Strict, Relaxed }

export interface CustomSelectionPatternList { V: string[]; }

// NOTE: Expected to be stored in sorted decending order: "{ 1.0f, 0.75f, 0.5f, 0.25f }" etc.
export interface PlaybackSpeedStepList { V: number[]; }

function MakeDefaultUserSettings()
{
	return {
		General:
		{
			DefaultCreatorName: "",
			DrumrollAutoHitBarDivision: 16,
			DisplayTimeInSongSpace: false,
			TimelineScrollInvertMouseWheel: false,
			// NOTE: Web port addition, minutes between automatic backups of unsaved changes into the browser storage (0 = disabled)
			AutoSaveIntervalMinutes: 1,
			// NOTE: Web port addition, step the cursor to the next grid line after placing a don / ka note (while paused)
			TimelineAdvanceCursorAfterPlacingNote: true,
			TimelineScrollDistancePerMouseWheelTick: 100.0,
			TimelineScrollDistancePerMouseWheelTickFast: 250.0,
			TimelineZoomFactorPerMouseWheelTick: 1.2,
			TimelineScrubAutoScrollEnableClamp: true,
			TimelineScrubAutoScrollPixelThreshold: 36.0,
			TimelineScrubAutoScrollSpeedMin: 2500.0,
			TimelineScrubAutoScrollSpeedMax: 3500.0,
			PlaybackSpeedSteps: { V: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2] } as PlaybackSpeedStepList,
			PlaybackSpeedStepsRough: { V: [1.0, 0.75, 0.5, 0.25] } as PlaybackSpeedStepList,
			PlaybackSpeedStepsPrecise: { V: [1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2] } as PlaybackSpeedStepList,
			DisableTempoWindowWidgetsIfHasSelection: true,
			ConvertSelectionToScrollChanges_UnselectOld: false,
			ConvertSelectionToScrollChanges_SelectNew: true,
			CustomSelectionPatterns: { V: [] } as CustomSelectionPatternList,
			GameViewportAspectRatioMin: { x: 0.0, y: 0.0 },
			GameViewportAspectRatioMax: { x: 0.0, y: 0.0 },
		},
		Audio:
		{
			// NOTE: Web Audio specific replacements for the WASAPI device settings
			OpenDeviceOnStartup: true,
			CloseDeviceOnIdleFocusLoss: false,
			RequestLowLatency: true,
			// NOTE: Web port addition, editor only don / ka preview volume multiplier (doesn't change the chart SEVOL)
			PreviewHitSoundVolume: 1.0,
		},
		Animation:
		{
			EnableGuiScaleAnimation: true,
			TimelineSmoothScrollSpeed: 20.0,
			TimelineWaveformFadeSpeed: 20.0,
			TimelineRangeSelectionExpansionSpeed: 20.0,
			TimelineWorldSpaceCursorXSpeed: 35.0,
			TimelineGridSnapLineSpeed: 10.0,
			TimelineGoGoRangeExpansionSpeed: 20.0,
		},
		Input:
		{
			Dialog_YesOrOk: [KeyBinding("Enter"), KeyBinding("NumpadEnter")],
			Dialog_No: [KeyBinding("Backspace")],
			Dialog_Cancel: [KeyBinding("Escape")],
			Dialog_SelectNextTab: [KeyBinding("Tab", ModFlags_Ctrl)],
			Dialog_SelectPreviousTab: [KeyBinding("Tab", ModFlags_CtrlShift)],

			Editor_ToggleFullscreen: [KeyBinding("F11"), KeyBinding("Enter", ModFlags_Alt), KeyBinding("NumpadEnter", ModFlags_Alt)],
			Editor_ToggleVSync: [] as MultiInputBinding,
			Editor_IncreaseGuiScale: [KeyBinding("Equal", ModFlags_Ctrl), KeyBinding("NumpadAdd", ModFlags_Ctrl)],
			Editor_DecreaseGuiScale: [KeyBinding("Minus", ModFlags_Ctrl), KeyBinding("NumpadSubtract", ModFlags_Ctrl)],
			Editor_ResetGuiScale: [KeyBinding("Digit0", ModFlags_Ctrl)],
			Editor_Undo: [KeyBinding("KeyZ", ModFlags_Ctrl)],
			Editor_Redo: [KeyBinding("KeyY", ModFlags_Ctrl)],
			Editor_OpenHelp: [KeyBinding("F1")],
			Editor_OpenSettings: [KeyBinding("Comma", ModFlags_Ctrl)],
			Editor_ChartNew: [KeyBinding("KeyN", ModFlags_Ctrl)],
			Editor_ChartOpen: [KeyBinding("KeyO", ModFlags_Ctrl)],
			Editor_ChartOpenDirectory: [KeyBinding("KeyO", ModFlags_CtrlShift)],
			Editor_ChartSave: [KeyBinding("KeyS", ModFlags_Ctrl)],
			Editor_ChartSaveAs: [KeyBinding("KeyS", ModFlags_CtrlShift)],

			Timeline_PlaceNoteDon: [KeyBinding("KeyF"), KeyBinding("KeyJ")],
			Timeline_PlaceNoteKa: [KeyBinding("KeyD"), KeyBinding("KeyK")],
			Timeline_PlaceNoteBalloon: [KeyBinding("KeyE"), KeyBinding("KeyI")],
			Timeline_PlaceNoteDrumroll: [KeyBinding("KeyR"), KeyBinding("KeyU")],
			Timeline_Cut: [KeyBinding("KeyX", ModFlags_Ctrl)],
			Timeline_Copy: [KeyBinding("KeyC", ModFlags_Ctrl)],
			Timeline_Paste: [KeyBinding("KeyV", ModFlags_Ctrl)],
			Timeline_DeleteSelection: [KeyBinding("Delete")],
			Timeline_StartEndRangeSelection: [KeyBinding("Tab")],
			Timeline_SelectAll: [] as MultiInputBinding,
			Timeline_ClearSelection: [] as MultiInputBinding,
			Timeline_InvertSelection: [] as MultiInputBinding,
			Timeline_SelectAllWithinRangeSelection: [] as MultiInputBinding,
			Timeline_ShiftSelectionLeft: [KeyBinding("ArrowLeft", ModFlags_Ctrl)],
			Timeline_ShiftSelectionRight: [KeyBinding("ArrowRight", ModFlags_Ctrl)],
			Timeline_SelectItemPattern_xo: [KeyBinding("Digit2", ModFlags_Shift)],
			Timeline_SelectItemPattern_xoo: [KeyBinding("Digit3", ModFlags_Shift)],
			Timeline_SelectItemPattern_xooo: [KeyBinding("Digit4", ModFlags_Shift)],
			Timeline_SelectItemPattern_xxoo: [KeyBinding("Digit5", ModFlags_Shift)],
			Timeline_SelectItemPattern_CustomA: [KeyBinding("Digit1", ModFlags_CtrlShift)],
			Timeline_SelectItemPattern_CustomB: [KeyBinding("Digit2", ModFlags_CtrlShift)],
			Timeline_SelectItemPattern_CustomC: [KeyBinding("Digit3", ModFlags_CtrlShift)],
			Timeline_SelectItemPattern_CustomD: [KeyBinding("Digit4", ModFlags_CtrlShift)],
			Timeline_SelectItemPattern_CustomE: [KeyBinding("Digit5", ModFlags_CtrlShift)],
			Timeline_SelectItemPattern_CustomF: [KeyBinding("Digit6", ModFlags_CtrlShift)],
			Timeline_ConvertSelectionToScrollChanges: [KeyBinding("Backquote", ModFlags_Shift)],
			Timeline_FlipNoteType: [KeyBinding("KeyW")],
			Timeline_ToggleNoteSize: [KeyBinding("KeyQ")],
			Timeline_ExpandItemTime_2To1: [] as MultiInputBinding,
			Timeline_ExpandItemTime_3To2: [] as MultiInputBinding,
			Timeline_ExpandItemTime_4To3: [] as MultiInputBinding,
			Timeline_CompressItemTime_1To2: [] as MultiInputBinding,
			Timeline_CompressItemTime_2To3: [] as MultiInputBinding,
			Timeline_CompressItemTime_3To4: [] as MultiInputBinding,
			Timeline_StepCursorLeft: [KeyBinding("ArrowLeft")],
			Timeline_StepCursorRight: [KeyBinding("ArrowRight")],
			Timeline_JumpToTimelineStart: [KeyBinding("Home")],
			Timeline_JumpToTimelineEnd: [KeyBinding("End")],
			Timeline_IncreaseGridDivision: [KeyBinding("ArrowUp")],
			Timeline_DecreaseGridDivision: [KeyBinding("ArrowDown")],
			Timeline_SetGridDivision_1_4: [] as MultiInputBinding,
			Timeline_SetGridDivision_1_8: [] as MultiInputBinding,
			Timeline_SetGridDivision_1_12: [] as MultiInputBinding,
			Timeline_SetGridDivision_1_16: [] as MultiInputBinding,
			Timeline_SetGridDivision_1_24: [] as MultiInputBinding,
			Timeline_SetGridDivision_1_32: [] as MultiInputBinding,
			Timeline_SetGridDivision_1_48: [] as MultiInputBinding,
			Timeline_SetGridDivision_1_64: [] as MultiInputBinding,
			Timeline_SetGridDivision_1_96: [] as MultiInputBinding,
			Timeline_SetGridDivision_1_192: [] as MultiInputBinding,
			Timeline_IncreasePlaybackSpeed: [KeyBinding("KeyC")],
			Timeline_DecreasePlaybackSpeed: [KeyBinding("KeyZ")],
			Timeline_SetPlaybackSpeed_100: [] as MultiInputBinding,
			Timeline_SetPlaybackSpeed_75: [] as MultiInputBinding,
			Timeline_SetPlaybackSpeed_50: [] as MultiInputBinding,
			Timeline_SetPlaybackSpeed_25: [] as MultiInputBinding,
			Timeline_TogglePlayback: [KeyBinding("Space")],
			Timeline_ToggleMetronome: [KeyBinding("KeyM")],

			TempoCalculator_Tap: [KeyBinding("Space")],
			TempoCalculator_Reset: [KeyBinding("Escape")],
		},
	};
}

export type UserSettingsData = ReturnType<typeof MakeDefaultUserSettings>;
export type InputSettingsKey = keyof UserSettingsData["Input"];

export const DefaultSettings: Readonly<UserSettingsData> = MakeDefaultUserSettings();

const SettingsStorageKey = "peepodrumkit-web.settings_user";
const AppStorageKey = "peepodrumkit-web.settings_app";

function DeepMerge(target: any, source: any): any
{
	if (source === null || typeof source !== "object" || Array.isArray(source))
		return target;
	for (const key of Object.keys(target))
	{
		if (!(key in source))
			continue;
		const t = target[key], s = source[key];
		if (Array.isArray(t)) { if (Array.isArray(s)) target[key] = s; }
		else if (t !== null && typeof t === "object") DeepMerge(t, s);
		else if (typeof t === typeof s) target[key] = s;
	}
	return target;
}

function LoadUserSettings(): UserSettingsData
{
	const out = MakeDefaultUserSettings();
	try
	{
		const stored = localStorage.getItem(SettingsStorageKey);
		if (stored !== null)
			DeepMerge(out, JSON.parse(stored));
	}
	catch { /* NOTE: Missing or corrupt settings are simply ignored */ }
	return out;
}

// NOTE: Mutable global settings (Settings_Mutable in the original), the IsDirty flag is replaced by an explicit save call
export const Settings: UserSettingsData = LoadUserSettings();
export let SettingsVersion = 0;

export function SaveUserSettings(): void
{
	SettingsVersion++;
	try { localStorage.setItem(SettingsStorageKey, JSON.stringify(Settings)); } catch { /* ... */ }
}

export function ResetUserSettingsToDefault(): void
{
	const defaults = MakeDefaultUserSettings();
	for (const section of Object.keys(defaults) as (keyof UserSettingsData)[])
		(Settings as any)[section] = (defaults as any)[section];
	SaveUserSettings();
}

export interface RecentFilesList { MaxCount: number; SortedPaths: string[]; }

export interface PersistentAppData
{
	LastSession:
	{
		GuiScale: number;
		GuiLanguage: string;
		ShowWindow_Help: boolean;
		ShowWindow_Settings: boolean;
		ShowWindow_TJAExportTest: boolean;
		ShowWindow_TJAImportTest: boolean;
		UseMobileLayout: "auto" | "desktop" | "mobile";
	};
	RecentFiles: RecentFilesList;
}

function MakeDefaultPersistentApp(): PersistentAppData
{
	return {
		LastSession: { GuiScale: 1.0, GuiLanguage: "", ShowWindow_Help: true, ShowWindow_Settings: false, ShowWindow_TJAExportTest: false, ShowWindow_TJAImportTest: false, UseMobileLayout: "auto" },
		RecentFiles: { MaxCount: 9, SortedPaths: [] },
	};
}

function LoadPersistentApp(): PersistentAppData
{
	const out = MakeDefaultPersistentApp();
	try
	{
		const stored = localStorage.getItem(AppStorageKey);
		if (stored !== null)
			DeepMerge(out, JSON.parse(stored));
	}
	catch { /* ... */ }
	return out;
}

export const PersistentApp: PersistentAppData = LoadPersistentApp();
export function SavePersistentApp(): void { try { localStorage.setItem(AppStorageKey, JSON.stringify(PersistentApp)); } catch { /* ... */ } }

const KeyDisplayNames: Record<string, string> =
{
	Space: "Space", Enter: "Enter", NumpadEnter: "Keypad Enter", Escape: "Escape", Backspace: "Backspace", Tab: "Tab", Delete: "Delete",
	ArrowLeft: "Left", ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down", Home: "Home", End: "End",
	Equal: "=", Minus: "-", Comma: ",", Period: ".", Backquote: "`", NumpadAdd: "Keypad +", NumpadSubtract: "Keypad -",
};

export function KeyCodeToDisplayName(code: string): string
{
	if (code in KeyDisplayNames) return KeyDisplayNames[code];
	if (code.startsWith("Key")) return code.substring(3);
	if (code.startsWith("Digit")) return code.substring(5);
	return code;
}

export function ToShortcutString(binding: KeyBinding | MultiInputBinding | undefined): string
{
	if (binding === undefined) return "";
	if (Array.isArray(binding)) return (binding.length > 0) ? ToShortcutString(binding[0]) : "";
	let out = "";
	if (binding.Mods & ModFlags_Ctrl) out += "Ctrl + ";
	if (binding.Mods & ModFlags_Shift) out += "Shift + ";
	if (binding.Mods & ModFlags_Alt) out += "Alt + ";
	return out + KeyCodeToDisplayName(binding.Key);
}
