// Port of PeepoDrumKit "peepo_drum_kit/chart_editor_timeline.h" / "chart_editor_timeline.cpp"
// https://github.com/samyuu/PeepoDrumKit
//
// NOTE: The Dear ImGui child windows / draw lists of the original are replaced by a single canvas,
//		 with each "region" being clipped and hit tested manually.
import
{
	type vec2, type Time, Rect, vec2 as V2, ControlFlow, Clamp, ClampBot, ClampTop, Lerp, LerpClamped, ConvertRange, ApproxmiatelySame, Round,
	AnimateExponentialF32, TimeToString, TimeToMS, TimeFromMS, ToPercent, FromPercent, FormatG, I32Max, F64Min,
} from "../core/types";
import
{
	type Beat, type TempoChange, type TimeSignatureChange, BeatSortedList, GetGridBeatSnap, FloorBeatToGrid, RoundBeatToGrid, CeilBeatToGrid,
	IsTupletBarDivision, BeatFromBars, BeatFromBeats, BeatDiv, IsTimeSignatureSupported, type ForEachBeatBarData, TicksPerBeat, OriginalTicksPerBeat,
} from "../core/beat";
import
{
	type Note, type GoGoRange, type LyricChange, type ScrollChange, type BarLineChange, type GenericListStructWithType, type GenericListItem, type ForEachChartItemData,
	NoteType, BranchType, GenericList, GenericMember, IsNotesList, IsBigNote, IsKaNote, IsBalloonNote, IsNoteFlippable, FlipNote, ToggleNoteSize, ToSmallNote, ToBigNoteIf,
	DefaultBalloonPopCount, MakeNote, MakeScrollChange, NoteGetStart, NoteGetEnd, GoGoGetStart, GoGoGetEnd,
	ForEachChartItem, ForEachSelectedChartItem, ChartItemGetIsSelected, ChartItemSetIsSelected, ChartItemGetBeat, ChartItemGetBeatDuration,
	GetGenericList, TryGetGenericStruct, GetGenericListStructBeat, SetGenericListStructBeat, GetGenericListStructBeatDuration, ListUsesInclusiveBeatCheck,
	CloneNote,
} from "./chart";
import * as Commands from "./undo-commands";
import { type ChartContext } from "./context";
import { SoundEffectType } from "./sound";
import { Settings, InputModifierBehavior, type MultiInputBinding } from "./settings";
import { Input, MouseButton } from "./input";
import { DrawList, FontBaseSizeMain, FontBaseSizeMedium } from "./draw";
import { SprID, SprGroup, SprTransformFromCenter } from "./graphics";
import
{
	Colors, U32ToCSS, ColorU32WithAlpha, NoteTypeToColor,
	TimelineRowHeight, TimelineRowHeightNotes, TimelineAutoScrollLockContentWidthFactor, TimelineCursorHeadHeight, TimelineCursorHeadWidth,
	TimelineBoxSelectionRadius, TimelineBoxSelectionLineThickness, TimelineBoxSelectionLinePadding, TimelineBoxSelectionXorDotRadius,
	TimelineSongDemoStartMarkerWidth, TimelineSongDemoStartMarkerHeight, TimelineSelectedNoteHitBoxSizeSmall, TimelineSelectedNoteHitBoxSizeBig,
} from "./theme";
import { UI_Str } from "./i18n";
import { Engine } from "../audio/engine";
import { type WaveformMipChain } from "../audio/waveform";

// NOTE: Equivalent of the GuiScaleFactor globals
export const GuiScaleState = { Current: 1.0, Target: 1.0 };
export const GuiScale = (v: number): number => v * GuiScaleState.Current;

// NOTE: Coordinate Systems:
//		 Screen Space	-> Absolute position starting at the top left of the canvas
//		 Local Space	-> Relative position to the top left of the timeline content region
//		 World Space	-> Virtual position within the timeline
export class TimelineCamera
{
	PositionCurrent: vec2 = V2(0.0);
	PositionTarget: vec2 = V2(0.0);
	ZoomCurrent: vec2 = V2(1.0);
	ZoomTarget: vec2 = V2(1.0);

	static readonly WorldSpaceXUnitsPerSecond = 300.0;

	UpdateAnimations(dt: number): void
	{
		// NOTE: Smooth zooming only looks correct when the smooth scroll and zoom speeds are the same
		const speed = Settings.Animation.TimelineSmoothScrollSpeed;
		this.PositionCurrent.x = AnimateExponentialF32(this.PositionCurrent.x, this.PositionTarget.x, speed, dt);
		this.PositionCurrent.y = AnimateExponentialF32(this.PositionCurrent.y, this.PositionTarget.y, speed, dt);
		this.ZoomCurrent.x = AnimateExponentialF32(this.ZoomCurrent.x, this.ZoomTarget.x, speed, dt);
		this.ZoomCurrent.y = AnimateExponentialF32(this.ZoomCurrent.y, this.ZoomTarget.y, speed, dt);
	}

	SetZoomTargetAroundWorldPivot(newZoom: vec2, worldSpacePivot: vec2): void
	{
		const localSpacePrev = this.WorldToLocalSpace_AtTarget(worldSpacePivot);
		this.ZoomTarget = V2(Clamp(newZoom.x, 0.001, 100.0), Clamp(newZoom.y, 0.001, 100.0));
		const localSpaceNow = this.WorldToLocalSpace_AtTarget(worldSpacePivot);
		this.PositionTarget.x += (localSpaceNow.x - localSpacePrev.x);
		this.PositionTarget.y += (localSpaceNow.y - localSpacePrev.y);
	}

	SetZoomTargetAroundLocalPivot(newZoom: vec2, localSpacePivot: vec2): void { this.SetZoomTargetAroundWorldPivot(newZoom, this.LocalToWorldSpace_AtTarget(localSpacePivot)); }

	LocalToWorldSpace(l: vec2): vec2 { return V2((l.x + this.PositionCurrent.x) / this.ZoomCurrent.x, (l.y + this.PositionCurrent.y) / this.ZoomCurrent.y); }
	LocalToWorldSpace_AtTarget(l: vec2): vec2 { return V2((l.x + this.PositionTarget.x) / this.ZoomTarget.x, (l.y + this.PositionTarget.y) / this.ZoomTarget.y); }
	WorldToLocalSpace(w: vec2): vec2 { return V2((w.x * this.ZoomCurrent.x) - this.PositionCurrent.x, (w.y * this.ZoomCurrent.y) - this.PositionCurrent.y); }
	WorldToLocalSpace_AtTarget(w: vec2): vec2 { return V2((w.x * this.ZoomTarget.x) - this.PositionTarget.x, (w.y * this.ZoomTarget.y) - this.PositionTarget.y); }
	WorldToLocalSpaceScaleX(x: number): number { return x * this.ZoomCurrent.x; }

	TimeToWorldSpaceX(time: Time): number { return time * TimelineCamera.WorldSpaceXUnitsPerSecond; }
	TimeToLocalSpaceX(time: Time): number { return (this.TimeToWorldSpaceX(time) * this.ZoomCurrent.x) - this.PositionCurrent.x; }
	TimeToLocalSpaceX_AtTarget(time: Time): number { return (this.TimeToWorldSpaceX(time) * this.ZoomTarget.x) - this.PositionTarget.x; }
	WorldSpaceXToTime(worldSpaceX: number): Time { return worldSpaceX / TimelineCamera.WorldSpaceXUnitsPerSecond; }
	LocalSpaceXToTime(localSpaceX: number): Time { return this.WorldSpaceXToTime((localSpaceX + this.PositionCurrent.x) / this.ZoomCurrent.x); }
	LocalSpaceXToTime_AtTarget(localSpaceX: number): Time { return this.WorldSpaceXToTime((localSpaceX + this.PositionTarget.x) / this.ZoomTarget.x); }

	TimePerScreenPixel(): Time { return this.WorldSpaceXToTime(1.0 / this.ZoomCurrent.x); }
}

// NOTE: Making it so the drag widget screen space mouse movement matches the equivalent distance on the timeline
export const TimelineDragScalarSpeedAtZoomSec = (camera: TimelineCamera): number => camera.TimePerScreenPixel();
export const TimelineDragScalarSpeedAtZoomMS = (camera: TimelineCamera): number => TimeToMS(camera.TimePerScreenPixel());

export enum TimelineRowType
{
	Tempo,
	TimeSignature,
	Notes_Normal,
	Notes_Expert,
	Notes_Master,
	ScrollSpeed,
	BarLineVisibility,
	GoGoTime,
	Lyrics,
	Count,
}

const NoteBranches_First = TimelineRowType.Notes_Normal, NoteBranches_Last = TimelineRowType.Notes_Master;

export const TimelineRowTypeNames: readonly string[] = ["Tempo", "Time Signature", "Notes", "Notes (Expert)", "Notes (Master)", "Scroll Speed", "Bar Line Visibility", "Go-Go Time", "Lyrics"];

export function TimelineRowToGenericList(row: TimelineRowType): GenericList
{
	switch (row)
	{
		case TimelineRowType.Tempo: return GenericList.TempoChanges;
		case TimelineRowType.TimeSignature: return GenericList.SignatureChanges;
		case TimelineRowType.Notes_Normal: return GenericList.Notes_Normal;
		case TimelineRowType.Notes_Expert: return GenericList.Notes_Expert;
		// NOTE: Mirrors the original (which maps the master row onto the expert list)
		case TimelineRowType.Notes_Master: return GenericList.Notes_Expert;
		case TimelineRowType.ScrollSpeed: return GenericList.ScrollChanges;
		case TimelineRowType.BarLineVisibility: return GenericList.BarLineChanges;
		case TimelineRowType.GoGoTime: return GenericList.GoGoRanges;
		case TimelineRowType.Lyrics: return GenericList.Lyrics;
		default: return GenericList.Count;
	}
}

export function TimelineRowToBranchType(rowType: TimelineRowType): BranchType
{
	return (rowType === TimelineRowType.Notes_Normal) ? BranchType.Normal :
		(rowType === TimelineRowType.Notes_Expert) ? BranchType.Expert :
			(rowType === TimelineRowType.Notes_Master) ? BranchType.Master : BranchType.Count;
}

export class TimelineRegions
{
	// NOTE: Includes the entire window
	Window = new Rect();
	// NOTE: Left side
	SidebarHeader = new Rect();
	Sidebar = new Rect();
	// NOTE: Right side
	ContentHeader = new Rect();
	Content = new Rect();
	ContentScrollbarX = new Rect();
}

export const AllowedGridBarDivisions: readonly number[] = [4, 8, 12, 16, 24, 32, 48, 64, 96, 192];
// NOTE: Web port addition, every grid division (up to 1/192) that lands exactly on the internal beat tick resolution
//		 (1 to 16, 18, 20, 21, 22, 24, 26, 28 ... 192 per bar). Used for freely setting the grid instead of only the presets above
export const MaxGridBarDivision = 192;
export const ValidGridBarDivisions: readonly number[] = Array.from({ length: MaxGridBarDivision }, (_, i) => i + 1).filter((it) => (BeatFromBars(1) % it) === 0);
// NOTE: Subset shown as quick select buttons
export const QuickGridBarDivisions: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 24, 28, 32, 48, 64, 96, 192];
export function ClosestValidGridBarDivision(barDivision: number): number
{
	let closest = ValidGridBarDivisions[0];
	for (const it of ValidGridBarDivisions)
		if (Math.abs(Math.log(it / barDivision)) < Math.abs(Math.log(closest / barDivision))) closest = it;
	return closest;
}

// NOTE: Nudge the startup camera position and min scrollbar.x slightly to the left
//		 so that a line drawn at worldspace position { x = 0.0f } is fully visible
export const TimelineCameraBaseScrollX = -32.0;

export enum ClipboardAction { Cut, Copy, Paste, Delete }
export enum SelectionAction { SelectAll, UnselectAll, InvertAll, SelectAllWithinRangeSelection, PerRowShiftSelected, PerRowSelectPattern }
export interface SelectionActionParam { ShiftDelta?: number; Pattern?: string; }
export enum TransformAction { FlipNoteType, ToggleNoteSize, ScaleItemTime }
export interface TransformActionParam { TimeRatio?: [number, number]; }

enum BoxSelectionAction { Clear, Add, Sub, XOR }

interface ForEachRowData { RowType: TimelineRowType; LocalY: number; LocalHeight: number; Label: string; }
interface ForEachGridLineData { Time: Time; BarIndex: number; IsBar: boolean; }
interface MinMaxTime { Min: Time; Max: Time; }
interface DeletedNoteAnimation { OriginalNote: Note; Branch: BranchType; ElapsedTimeSec: number; }
interface TempDrawSelectionBox { ScreenSpaceRect: Rect; FillColor: number; BorderColor: number; }

// NOTE: Drawing the waveform on top was originally intended to ensure it is always visible, though it can admittedly looks a bit weird at times...
enum WaveformDrawOrder { Background, Foreground }
const TimelineWaveformDrawOrder = WaveformDrawOrder.Background as WaveformDrawOrder;

const NoteHitAnimationDuration = 0.06;
const NoteHitAnimationScaleStart = 1.35, NoteHitAnimationScaleEnd = 1.0;
const NoteDeleteAnimationDuration = 0.04;

const SoundEffectTypeForNoteType = (noteType: NoteType): SoundEffectType => IsKaNote(noteType) ? SoundEffectType.TaikoKa : SoundEffectType.TaikoDon;

function GetNotesWaveAnimationTimeAtIndex(noteIndex: number, notesCount: number, direction: number): number
{
	// TODO: Proper "wave" placement animation (also maybe scale by beat instead of index?)
	const animationIndex = (direction > 0) ? noteIndex : (notesCount - noteIndex);
	const noteCountAnimationFactor = (1.0 / notesCount) * 2.0;
	return NoteHitAnimationDuration + (animationIndex * (NoteHitAnimationDuration * noteCountAnimationFactor));
}

function SetNotesWaveAnimationTimes(notesToAnimate: Note[], direction: number = +1): void
{
	const notesCount = notesToAnimate.length;
	for (let noteIndex = 0; noteIndex < notesCount; noteIndex++)
		notesToAnimate[noteIndex].ClickAnimationTimeDuration = notesToAnimate[noteIndex].ClickAnimationTimeRemaining = GetNotesWaveAnimationTimeAtIndex(noteIndex, notesCount, direction);
}

function SetNotesWaveAnimationTimesItems(noteItemsToAnimate: GenericListStructWithType[], direction: number = +1): void
{
	let notesCount = 0, noteIndex = 0;
	for (const item of noteItemsToAnimate) { if (IsNotesList(item.List)) notesCount++; }
	for (const item of noteItemsToAnimate)
	{
		if (IsNotesList(item.List))
		{
			const note = item.Value as Note;
			note.ClickAnimationTimeDuration = note.ClickAnimationTimeRemaining = GetNotesWaveAnimationTimeAtIndex(noteIndex++, notesCount, direction);
		}
	}
}

function GetTimelineNoteScaleFactor(isPlayback: boolean, cursorTime: Time, cursorBeatOnPlaybackStart: Beat, note: Note, noteTime: Time): number
{
	// TODO: Handle AnimationTime > AnimationDuration differently so that range selected multi note placement can have a nice "wave propagation" effect
	if (note.ClickAnimationTimeRemaining > 0.0)
		return ConvertRange(note.ClickAnimationTimeDuration, 0.0, NoteHitAnimationScaleStart, NoteHitAnimationScaleEnd, note.ClickAnimationTimeRemaining);

	if (isPlayback && note.BeatTime >= cursorBeatOnPlaybackStart)
	{
		const timeUntilNote = (noteTime - cursorTime);
		if (timeUntilNote <= 0.0 && timeUntilNote >= -NoteHitAnimationDuration)
		{
			const delta = (timeUntilNote / -NoteHitAnimationDuration);
			return Lerp(NoteHitAnimationScaleStart, NoteHitAnimationScaleEnd, delta);
		}
	}

	return 1.0;
}

const TimelineNoteSpr = (noteType: NoteType): SprID =>
{
	switch (noteType)
	{
		case NoteType.Don: return SprID.Timeline_Note_Don;
		case NoteType.DonBig: return SprID.Timeline_Note_DonBig;
		case NoteType.Ka: return SprID.Timeline_Note_Ka;
		case NoteType.KaBig: return SprID.Timeline_Note_KaBig;
		case NoteType.Drumroll: return SprID.Timeline_Note_Drumroll;
		case NoteType.DrumrollBig: return SprID.Timeline_Note_DrumrollBig;
		case NoteType.Balloon: return SprID.Timeline_Note_Balloon;
		case NoteType.BalloonSpecial: return SprID.Timeline_Note_BalloonSpecial;
		default: return SprID.Count;
	}
};

const TimelineNoteDurationSpr = (noteType: NoteType): SprID =>
{
	switch (noteType)
	{
		case NoteType.Don: return SprID.Timeline_Note_DrumrollLong;
		case NoteType.DonBig: return SprID.Timeline_Note_DrumrollLongBig;
		case NoteType.Ka: return SprID.Timeline_Note_DrumrollLong;
		case NoteType.KaBig: return SprID.Timeline_Note_DrumrollLongBig;
		case NoteType.Drumroll: return SprID.Timeline_Note_DrumrollLong;
		case NoteType.DrumrollBig: return SprID.Timeline_Note_DrumrollLongBig;
		case NoteType.Balloon: return SprID.Timeline_Note_BalloonLong;
		case NoteType.BalloonSpecial: return SprID.Timeline_Note_BalloonLongSpecial;
		default: return SprID.Count;
	}
};

const AlphaToU32 = (alpha: number): number => ((Math.round(Clamp(alpha, 0.0, 1.0) * 255) << 24) | 0x00FFFFFF) >>> 0;

// NOTE: Web specific, input flags set by the on-screen (mobile) controls to emulate held keys / modifiers
export interface TimelineExternalInput
{
	ForceBigNote: boolean;
	ForceRangeFill: boolean;
	PlaceBalloonDown: boolean;
	PlaceDrumrollDown: boolean;
}

export class ChartTimeline
{
	Camera = (() => { const out = new TimelineCamera(); out.PositionCurrent.x = out.PositionTarget.x = TimelineCameraBaseScrollX; return out; })();

	// NOTE: All in screen space
	Regions = new TimelineRegions();

	// TODO: Add splitter behavior to allow resizing (?)
	CurrentSidebarWidth = 240.0;

	// NOTE: Defined as a fraction of a 4/4 bar
	CurrentGridBarDivision = 16;

	IsAnyChildWindowFocused = false;
	IsContentHeaderWindowHovered = false;
	IsContentWindowHovered = false;
	IsContentWindowFocused = false;
	IsSidebarWindowHovered = false;
	IsScrollbarHovered = false;

	MousePosThisFrame: vec2 = V2(0.0);
	MousePosLastFrame: vec2 = V2(0.0);

	IsCameraMouseGrabActive = false;
	IsCursorMouseScrubActive = false;

	SelectedItemDrag = { IsActive: false, IsHovering: false, MouseBeatThisFrame: 0, MouseBeatLastFrame: 0, BeatOnMouseDown: 0, BeatDistanceMovedSoFar: 0 };

	LongNotePlacement = { IsActive: false, CursorBeatHead: 0, CursorBeatTail: 0, NoteType: NoteType.Drumroll };
	PlaceBalloonBindingDownThisFrame = false; PlaceBalloonBindingDownLastFrame = false;
	PlaceDrumrollBindingDownThisFrame = false; PlaceDrumrollBindingDownLastFrame = false;

	BoxSelection = { IsActive: false, Action: BoxSelectionAction.Clear, WorldSpaceRect: new Rect() };

	RangeSelection = { Start: 0, End: 0, HasEnd: false, IsActive: false };
	RangeSelectionExpansionAnimationCurrent = 0.0;
	RangeSelectionExpansionAnimationTarget = 0.0;

	WorldSpaceCursorXAnimationCurrent = 0.0;
	GridSnapLineAnimationCurrent = 1.0;

	PlaybackSoundsEnabled = true;
	Metronome = { IsEnabled: false, HasOnPlaybackStartTimeBeenPlayed: false, LastProvidedNonSmoothCursorTime: 0.0, LastPlayedBeatTime: 0.0 };

	// TODO: Implement properly and make it so the draw order stays correct by binary searching through sorted list (?)
	TempDeletedNoteAnimationsBuffer: DeletedNoteAnimation[] = [];
	TempSelectionBoxesDrawBuffer: TempDrawSelectionBox[] = [];

	// NOTE: Web specific state
	Canvas: HTMLCanvasElement | null = null;
	private Ctx: CanvasRenderingContext2D | null = null;
	private Draw = new DrawList();
	private CanvasCSSWidth = 0;
	private CanvasCSSHeight = 0;
	private DevicePixelRatio = 1;
	private ScrollbarDrag = { IsActive: false, GrabOffset: 0.0 };
	private LastMouseCursor = "";
	private ExternalLongNoteDownLastFrame = false;
	External: TimelineExternalInput = { ForceBigNote: false, ForceRangeFill: false, PlaceBalloonDown: false, PlaceDrumrollDown: false };
	CompactLayout = false;

	HasKeyboardFocus(): boolean { return this.IsAnyChildWindowFocused; }

	FloorBeatToCurrentGrid(beat: Beat): Beat { return FloorBeatToGrid(beat, GetGridBeatSnap(this.CurrentGridBarDivision)); }
	RoundBeatToCurrentGrid(beat: Beat): Beat { return RoundBeatToGrid(beat, GetGridBeatSnap(this.CurrentGridBarDivision)); }
	CeilBeatToCurrentGrid(beat: Beat): Beat { return CeilBeatToGrid(beat, GetGridBeatSnap(this.CurrentGridBarDivision)); }

	ScreenToLocalSpace(s: vec2): vec2 { return V2(s.x - this.Regions.Content.TL.x, s.y - this.Regions.Content.TL.y); }
	LocalToScreenSpace(l: vec2): vec2 { return V2(l.x + this.Regions.Content.TL.x, l.y + this.Regions.Content.TL.y); }
	ScreenToLocalSpace_ContentHeader(s: vec2): vec2 { return V2(s.x - this.Regions.ContentHeader.TL.x, s.y - this.Regions.ContentHeader.TL.y); }
	LocalToScreenSpace_ContentHeader(l: vec2): vec2 { return V2(l.x + this.Regions.ContentHeader.TL.x, l.y + this.Regions.ContentHeader.TL.y); }
	ScreenToLocalSpace_Sidebar(s: vec2): vec2 { return V2(s.x - this.Regions.Sidebar.TL.x, s.y - this.Regions.Sidebar.TL.y); }
	LocalToScreenSpace_Sidebar(l: vec2): vec2 { return V2(l.x + this.Regions.Sidebar.TL.x, l.y + this.Regions.Sidebar.TL.y); }
	ScreenToLocalSpace_ScrollbarX(s: vec2): vec2 { return V2(s.x - this.Regions.ContentScrollbarX.TL.x, s.y - this.Regions.ContentScrollbarX.TL.y); }
	LocalToScreenSpace_ScrollbarX(l: vec2): vec2 { return V2(l.x + this.Regions.ContentScrollbarX.TL.x, l.y + this.Regions.ContentScrollbarX.TL.y); }

	GetMinMaxVisibleTime(overdraw: Time = 0.0): MinMaxTime
	{
		const minVisibleTime = this.Camera.LocalSpaceXToTime(0.0) - overdraw;
		const maxVisibleTime = this.Camera.LocalSpaceXToTime(this.Regions.Content.GetWidth()) + overdraw;
		return { Min: minVisibleTime, Max: maxVisibleTime };
	}

	RangeSelectionIsActiveAndHasEnd(): boolean { return this.RangeSelection.IsActive && this.RangeSelection.HasEnd; }
	RangeSelectionGetMin(): Beat { return ClampBot(Math.min(this.RangeSelection.Start, this.RangeSelection.End), 0); }
	RangeSelectionGetMax(): Beat { return ClampBot(Math.max(this.RangeSelection.Start, this.RangeSelection.End), 0); }
	LongNotePlacementGetMin(): Beat { return ClampBot(Math.min(this.LongNotePlacement.CursorBeatHead, this.LongNotePlacement.CursorBeatTail), 0); }
	LongNotePlacementGetMax(): Beat { return ClampBot(Math.max(this.LongNotePlacement.CursorBeatHead, this.LongNotePlacement.CursorBeatTail), 0); }

	AttachCanvas(canvas: HTMLCanvasElement | null): void
	{
		this.Canvas = canvas;
		this.Ctx = (canvas !== null) ? canvas.getContext("2d", { alpha: false, desynchronized: true }) : null;
		// NOTE: A newly mounted canvas starts with the default backing size so it always has to be resized
		this.CanvasCSSWidth = this.CanvasCSSHeight = 0;
	}

	private ForEachTimelineRow(perRowFunc: (it: ForEachRowData) => void): void
	{
		// NOTE: Rows are offset by the vertical camera position so that they can be scrolled when they don't fit inside the content region
		let localY = -Math.round(this.Camera.PositionCurrent.y);
		for (let rowType = 0; rowType < TimelineRowType.Count; rowType++)
		{
			// HACK: Draw the non default branches smaller for now to waste less space (might wanna rethink all of this...)
			const isNotesRow = (rowType >= NoteBranches_First && rowType <= NoteBranches_Last) && (TimelineRowToBranchType(rowType) === BranchType.Normal);
			const localHeight = GuiScale(isNotesRow ? TimelineRowHeightNotes : TimelineRowHeight);
			perRowFunc({ RowType: rowType, LocalY: localY, LocalHeight: localHeight, Label: UI_Str(TimelineRowTypeNames[rowType]) });
			localY += localHeight;
		}
	}

	private GetTotalTimelineRowsHeight(): number
	{
		let totalHeight = 0.0;
		this.ForEachTimelineRow((it) => { totalHeight += it.LocalHeight; });
		return totalHeight;
	}

	private ClampCameraScrollY(): void
	{
		const maxScrollY = Math.max(0.0, this.GetTotalTimelineRowsHeight() - this.Regions.Content.GetHeight());
		const camera = this.Camera;
		camera.PositionTarget.y = Clamp(camera.PositionTarget.y, 0.0, maxScrollY);
		camera.PositionCurrent.y = Clamp(camera.PositionCurrent.y, 0.0, maxScrollY);
	}

	private ForEachTimelineVisibleGridLine(context: ChartContext, visibleTimeOverdraw: Time, perGridFunc: (it: ForEachGridLineData) => void): void
	{
		// TODO: Rewrite all of this to correctly handle tempo map changes and take GuiScaleFactor text size into account
		/* // TEMP: */ const GridTimeStep = 1.0;

		// TODO: Not too sure about the exact values here, these just came from randomly trying out numbers until it looked about right
		const minAllowedSpacing = GuiScale(128.0);
		const maxSubDivisions = 6;

		// TODO: Go the extra step and add a fade animation for these too
		let gridLineSubDivisions = 0;
		for (gridLineSubDivisions = 0; gridLineSubDivisions < maxSubDivisions; gridLineSubDivisions++)
		{
			const localSpaceXPerGridLine = this.Camera.WorldToLocalSpaceScaleX(this.Camera.TimeToWorldSpaceX(GridTimeStep));
			const localSpaceXPerGridLineSubDivided = localSpaceXPerGridLine * (gridLineSubDivisions + 1);
			if (localSpaceXPerGridLineSubDivided >= (minAllowedSpacing / (gridLineSubDivisions + 1)))
				break;
		}

		const minMaxVisibleTime = this.GetMinMaxVisibleTime(visibleTimeOverdraw);
		const gridLineModToSkip = (1 << gridLineSubDivisions);
		let gridLineIndex = 0;

		const chartDuration = context.Chart.GetDurationOrDefault();
		const tempoMap = context.ChartSelectedCourse.TempoMap;
		tempoMap.ForEachBeatBar((it) =>
		{
			const timeIt = tempoMap.BeatToTime(it.Beat);

			if ((gridLineIndex++ % gridLineModToSkip) === 0)
			{
				if (timeIt >= minMaxVisibleTime.Min && timeIt <= minMaxVisibleTime.Max)
					perGridFunc({ Time: timeIt, BarIndex: it.BarIndex, IsBar: it.IsBar });
			}

			if (timeIt >= minMaxVisibleTime.Max || (it.IsBar && timeIt >= chartDuration))
				return ControlFlow.Break;
			return ControlFlow.Continue;
		});
	}

	private IsTimelineCursorVisibleOnScreen(cursorTime: Time, edgePixelThreshold: number = 0.0): boolean
	{
		const cursorLocalSpaceX = this.Camera.TimeToLocalSpaceX(cursorTime);
		return (cursorLocalSpaceX >= edgePixelThreshold && cursorLocalSpaceX <= ClampBot(this.Regions.Content.GetWidth() - edgePixelThreshold, edgePixelThreshold));
	}

	ScrollToTimelinePosition(context: ChartContext, normalizedTargetPosition: number): void
	{
		const visibleWidth = this.Regions.Content.GetWidth();
		const totalTimelineWidth = this.Camera.WorldToLocalSpaceScaleX(this.Camera.TimeToWorldSpaceX(context.Chart.GetDurationOrDefault())) + 2.0;
		const cameraTargetPosition = TimelineCameraBaseScrollX + (totalTimelineWidth - visibleWidth - TimelineCameraBaseScrollX) * normalizedTargetPosition;
		this.Camera.PositionTarget.x = ClampBot(cameraTargetPosition, TimelineCameraBaseScrollX);
	}

	// NOTE: ----------------------------------------------------------------------------------------------------------------
	//		 Drawing helpers
	// NOTE: ----------------------------------------------------------------------------------------------------------------

	private DrawTimelineNote(context: ChartContext, center: vec2, scale: number, noteType: NoteType, alpha: number = 1.0): void
	{
		context.Gfx.DrawSprite(this.Draw.Ctx, TimelineNoteSpr(noteType), SprTransformFromCenter(center, V2(scale * GuiScaleState.Current)), AlphaToU32(alpha));
	}

	private DrawTimelineNoteDuration(context: ChartContext, centerHead: vec2, centerTail: vec2, noteType: NoteType, alpha: number = 1.0): void
	{
		const spr = TimelineNoteDurationSpr(noteType);
		const sprInfo = context.Gfx.GetInfo(spr);
		if (sprInfo.SourceSize.x <= 0) return;

		const longL = Math.min(centerHead.x, centerTail.x);
		const longR = Math.max(centerHead.x, centerTail.x);
		const midScaleX = ((longR - longL) / (sprInfo.SourceSize.x)) * 3.0;

		context.Gfx.DrawSpriteStretched3(this.Draw.Ctx, spr,
			SprTransformFromCenter(V2((centerHead.x + centerTail.x) / 2.0, (centerHead.y + centerTail.y) / 2.0), V2(GuiScaleState.Current)), AlphaToU32(alpha),
			[1.0, midScaleX / GuiScaleState.Current, 1.0]);
	}

	private DrawTimelineNoteBalloonPopCount(center: vec2, scale: number, popCount: number): void
	{
		const text = String(Math.trunc(popCount));
		const fontSize = (GuiScale(22) * scale);
		this.Draw.SetFont(fontSize);
		const textWidth = this.Draw.CalcTextWidth(text);
		const textPosition = V2(center.x - textWidth * 0.5, center.y - fontSize * 0.5 - 1.0);
		this.Draw.AddTextWithDropShadow(textPosition, Colors.NoteBalloonTextColor, text, Colors.NoteBalloonTextColorShadow);
	}

	private DrawTimelineRectBaseWithStartEndTriangles(tl: vec2, br: vec2, triScaleL: number, triScaleR: number, colorBorder: number, colorOuter: number, colorInner: number): void
	{
		const d = this.Draw;
		const outerOffset = ClampBot(GuiScale(2.0), 1.0);
		const innerOffset = ClampBot(GuiScale(5.0), 1.0);
		const outerRect = new Rect(V2(tl.x + outerOffset, tl.y + outerOffset), V2(br.x - outerOffset, br.y - outerOffset)); if (outerRect.GetWidth() < outerOffset) outerRect.BR.x = outerRect.TL.x + outerOffset;
		const innerRect = new Rect(V2(tl.x + innerOffset, tl.y + innerOffset), V2(br.x - innerOffset, br.y - innerOffset)); if (innerRect.GetWidth() < outerOffset) innerRect.BR.x = innerRect.TL.x + outerOffset;

		d.AddRectFilled(tl, br, colorBorder);
		d.AddRectFilled(outerRect.TL, outerRect.BR, colorOuter);
		d.AddRectFilled(innerRect.TL, innerRect.BR, colorInner);

		if (outerRect.GetWidth() > outerOffset)
		{
			const triH = (br.y - tl.y) - innerOffset;
			const triW = ClampTop(triH, (br.x - tl.x) - innerOffset);
			const oTL = outerRect.TL, oBR = outerRect.BR;
			if (triScaleL > 0.0)
				d.AddTriangleFilled(oTL, V2(oTL.x + triW, oTL.y + triH), V2(oTL.x, oTL.y + triH), colorOuter);
			else if (triScaleL < 0.0)
				d.AddTriangleFilled(oTL, V2(oTL.x + triW, oTL.y), V2(oTL.x, oTL.y + triH), colorOuter);

			if (triScaleR > 0.0)
				d.AddTriangleFilled(oBR, V2(oBR.x - triW, oBR.y), V2(oBR.x, oBR.y - triH), colorOuter);
			else if (triScaleR < 0.0)
				d.AddTriangleFilled(oBR, V2(oBR.x - triW, oBR.y - triH), V2(oBR.x, oBR.y - triH), colorOuter);
		}
	}

	private DrawTimelineGoGoTimeBackground(tl: vec2, br: vec2, animationScale: number, selected: boolean): void
	{
		const centerX = (br.x + tl.x) * 0.5;
		const l = Lerp(centerX, tl.x, animationScale), r = Lerp(centerX, br.x, animationScale);
		this.DrawTimelineRectBaseWithStartEndTriangles(V2(l, tl.y), V2(r, br.y), 1.0, 1.0, selected ? Colors.TimelineGoGoBackgroundColorBorderSelected : Colors.TimelineGoGoBackgroundColorBorder, Colors.TimelineGoGoBackgroundColorOuter, Colors.TimelineGoGoBackgroundColorInner);
	}

	private DrawTimelineLyricsBackground(tl: vec2, br: vec2, selected: boolean): void
	{
		this.DrawTimelineRectBaseWithStartEndTriangles(tl, br, 1.0, 0.0, selected ? Colors.TimelineLyricsBackgroundColorBorderSelected : Colors.TimelineLyricsBackgroundColorBorder, Colors.TimelineLyricsBackgroundColorOuter, Colors.TimelineLyricsBackgroundColorInner);
	}

	// NOTE: Equivalent of the "shader_imgui_waveform_ps" pixel shader, the amplitude columns are combined into a single path which is then filled
	//		 using a vertical gradient to fade out towards the edge
	private DrawWaveformColumns(chunkTop: number, height: number, startX: number, amplitudes: Float32Array, count: number, color: number, ctx: CanvasRenderingContext2D = this.Draw.Ctx): void
	{
		const centerY = chunkTop + height * 0.5;
		const gradient = ctx.createLinearGradient(0, chunkTop, 0, chunkTop + height);
		const opaque = U32ToCSS(color), transparent = U32ToCSS(color & 0x00FFFFFF);
		gradient.addColorStop(0.0, transparent);
		gradient.addColorStop(0.5, opaque);
		gradient.addColorStop(1.0, transparent);
		ctx.fillStyle = gradient;
		ctx.beginPath();
		for (let i = 0; i < count; i++)
		{
			const amplitude = amplitudes[i];
			if (amplitude <= 0.0) continue;
			const halfH = Math.min(amplitude, 1.0) * height * 0.5;
			ctx.rect(startX + i, centerY - halfH, 1, halfH * 2.0);
		}
		ctx.fill();
	}

	private waveformAmplitudeBuffer = new Float32Array(4096);

	// NOTE: Waveform tiles are cached in "zoomed world space" (worldX * zoom) so that scrolling only has to blit already rendered tiles.
	//		 While the zoom level or the fade animation is changing the waveform is drawn directly instead (same as the original)
	private static readonly WaveformTileWidth = 256;
	private WaveformTileCache = { Key: "", Tiles: new Map<number, HTMLCanvasElement>() };

	private ComputeWaveformAmplitudes(out: Float32Array, count: number, waveform: WaveformMipChain, timeAtPixel: (pixel: number) => Time, timePerPixel: Time, amplitudeScale: number, minAmplitude: number): void
	{
		const waveformMip = waveform.FindClosestMip(timePerPixel);
		const waveformDuration = waveform.Duration;
		for (let pixel = 0; pixel < count; pixel++)
		{
			const time = timeAtPixel(pixel);
			const outOfBounds = (time < 0.0 || (time > waveformDuration));
			out[pixel] = outOfBounds ? 0.0 : (amplitudeScale * ClampBot(waveform.GetAmplitudeAt(waveformMip, time, timePerPixel), minAmplitude));
		}
	}

	private DrawTimelineContentWaveform(chartSongOffset: Time, waveformL: WaveformMipChain, waveformR: WaveformMipChain, waveformAnimation: number): void
	{
		const camera = this.Camera;
		const waveformAnimationScale = Clamp(waveformAnimation, 0.0, 1.0);
		const waveformAnimationAlpha = (waveformAnimationScale * waveformAnimationScale);
		const waveformColorBase = ColorU32WithAlpha(Colors.TimelineWaveformBaseColor, 0.215 * (waveformR.IsEmpty() ? 2.0 : 1.0));

		const waveformTimePerPixel = camera.LocalSpaceXToTime(1.0) - camera.LocalSpaceXToTime(0.0);
		const contentRect = this.Regions.Content;
		const rowsHeight = this.GetTotalTimelineRowsHeight();
		const minAmplitude = (2.0 / rowsHeight);
		const amplitudes = this.waveformAmplitudeBuffer;
		const screenTL = this.LocalToScreenSpace(V2(0.0, 0.5 - Math.round(camera.PositionCurrent.y)));

		const isAnimating = (camera.ZoomCurrent.x !== camera.ZoomTarget.x) || (waveformAnimationScale < 0.999);
		if (isAnimating)
		{
			const pixelCount = Math.min(Math.ceil(contentRect.GetWidth()), amplitudes.length);
			const color = ColorU32WithAlpha(waveformColorBase, waveformAnimationAlpha);
			for (const waveform of [waveformL, waveformR])
			{
				if (waveform.IsEmpty()) continue;
				this.ComputeWaveformAmplitudes(amplitudes, pixelCount, waveform, (pixel) => camera.LocalSpaceXToTime(pixel) - chartSongOffset, waveformTimePerPixel, waveformAnimationScale, minAmplitude);
				this.DrawWaveformColumns(screenTL.y, rowsHeight, screenTL.x, amplitudes, pixelCount, color);
			}
			return;
		}

		const dpr = this.DevicePixelRatio;
		const zoom = camera.ZoomCurrent.x;
		const tileWidth = ChartTimeline.WaveformTileWidth;
		const cache = this.WaveformTileCache;
		const key = `${zoom}|${rowsHeight}|${dpr}|${chartSongOffset}|${waveformL.Duration}|${waveformR.IsEmpty()}`;
		if (cache.Key !== key || cache.Tiles.size > 96)
		{
			cache.Key = key;
			cache.Tiles.clear();
		}

		// NOTE: Zoomed pixel position of a local x position
		const firstTile = Math.floor((0.0 + camera.PositionCurrent.x) / tileWidth);
		const lastTile = Math.floor((contentRect.GetWidth() + camera.PositionCurrent.x) / tileWidth);
		const ctx = this.Draw.Ctx;
		const prevAlpha = ctx.globalAlpha;
		ctx.globalAlpha = prevAlpha * (waveformAnimationScale >= 0.999 ? 1.0 : waveformAnimationAlpha);
		for (let tileIndex = firstTile; tileIndex <= lastTile; tileIndex++)
		{
			let tile = cache.Tiles.get(tileIndex);
			if (tile === undefined)
			{
				tile = document.createElement("canvas");
				tile.width = Math.ceil(tileWidth * dpr);
				tile.height = Math.max(1, Math.ceil(rowsHeight * dpr));
				const tileCtx = tile.getContext("2d")!;
				tileCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
				for (const waveform of [waveformL, waveformR])
				{
					if (waveform.IsEmpty()) continue;
					const tileStartPixel = tileIndex * tileWidth;
					this.ComputeWaveformAmplitudes(amplitudes, tileWidth, waveform, (pixel) => camera.WorldSpaceXToTime((tileStartPixel + pixel) / zoom) - chartSongOffset, waveformTimePerPixel, 1.0, minAmplitude);
					this.DrawWaveformColumns(0.0, rowsHeight, 0.0, amplitudes, tileWidth, waveformColorBase, tileCtx);
				}
				cache.Tiles.set(tileIndex, tile);
			}
			ctx.drawImage(tile, screenTL.x + (tileIndex * tileWidth) - camera.PositionCurrent.x, screenTL.y, tileWidth, rowsHeight);
		}
		ctx.globalAlpha = prevAlpha;
	}

	private TimeToScrollbarLocalSpaceX(time: Time, chartDuration: Time): number
	{
		return ConvertRange(0.0, chartDuration, 0.0, this.Regions.ContentScrollbarX.GetWidth(), time);
	}

	private TimeToScrollbarLocalSpaceXClamped(time: Time, chartDuration: Time): number
	{
		return Clamp(this.TimeToScrollbarLocalSpaceX(time, chartDuration), 1.0, this.Regions.ContentScrollbarX.GetWidth() - 2.0);
	}

	private ScrollbarWaveformCache = { Key: "", Canvas: null as HTMLCanvasElement | null };

	private DrawTimelineScrollbarXWaveform(chartSongOffset: Time, chartDuration: Time, waveformL: WaveformMipChain, waveformR: WaveformMipChain, waveformAnimation: number): void
	{
		const waveformAnimationScale = Clamp(waveformAnimation, 0.0, 1.0);
		const waveformAnimationAlpha = (waveformAnimationScale * waveformAnimationScale);
		const waveformColor = ColorU32WithAlpha(Colors.TimelineWaveformBaseColor, 0.5 * (waveformR.IsEmpty() ? 2.0 : 1.0));

		const scrollbarRect = this.Regions.ContentScrollbarX;
		const waveformTimePerPixel = chartDuration / ClampBot(scrollbarRect.GetWidth(), 1.0);
		const scrollbarHeight = scrollbarRect.GetHeight();
		const minAmplitude = (2.0 / scrollbarHeight);
		const pixelCount = Math.min(Math.ceil(scrollbarRect.GetWidth()), this.waveformAmplitudeBuffer.length);
		const dpr = this.DevicePixelRatio;

		// NOTE: The scrollbar waveform doesn't depend on the camera at all so it only has to be redrawn on resize / chart changes
		const cache = this.ScrollbarWaveformCache;
		const key = `${chartSongOffset}|${chartDuration}|${pixelCount}|${scrollbarHeight}|${dpr}|${waveformL.Duration}|${waveformR.IsEmpty()}|${waveformAnimationScale < 0.999 ? waveformAnimationScale : 1}`;
		if (cache.Key !== key || cache.Canvas === null)
		{
			cache.Key = key;
			if (cache.Canvas === null) cache.Canvas = document.createElement("canvas");
			cache.Canvas.width = Math.max(1, Math.ceil(pixelCount * dpr));
			cache.Canvas.height = Math.max(1, Math.ceil(scrollbarHeight * dpr));
			const ctx = cache.Canvas.getContext("2d")!;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			for (const waveform of [waveformL, waveformR])
			{
				if (waveform.IsEmpty()) continue;
				this.ComputeWaveformAmplitudes(this.waveformAmplitudeBuffer, pixelCount, waveform, (pixel) => (waveformTimePerPixel * pixel) - chartSongOffset, waveformTimePerPixel, waveformAnimationScale, minAmplitude);
				this.DrawWaveformColumns(0.0, scrollbarHeight, 0.0, this.waveformAmplitudeBuffer, pixelCount, waveformColor, ctx);
			}
		}

		const ctx = this.Draw.Ctx;
		const prevAlpha = ctx.globalAlpha;
		ctx.globalAlpha = prevAlpha * (waveformAnimationScale >= 0.999 ? 1.0 : waveformAnimationAlpha);
		const tl = this.LocalToScreenSpace_ScrollbarX(V2(0.0, 0.5));
		ctx.drawImage(cache.Canvas, tl.x, tl.y, pixelCount, scrollbarHeight);
		ctx.globalAlpha = prevAlpha;
	}

	// NOTE: The minimap is cached into an offscreen canvas which is only redrawn if any of the displayed data has changed,
	//		 as drawing thousands of individual rects every frame would otherwise be the most expensive part of the timeline
	private MinimapCache = { Canvas: null as HTMLCanvasElement | null, Key: "" };

	private DrawTimelineScrollbarXMinimap(context: ChartContext, chartDuration: Time): void
	{
		const course = context.ChartSelectedCourse;
		const notes = course.GetNotes(context.ChartSelectedBranch).Sorted;
		const scrollbar = this.Regions.ContentScrollbarX;
		const dpr = this.DevicePixelRatio;

		let hash = notes.length;
		for (let i = 0; i < notes.length; i++)
		{
			const n = notes[i];
			hash = (Math.imul(hash, 31) + n.BeatTime * 7 + n.BeatDuration * 13 + n.Type * 3 + (n.IsSelected ? 1 : 0) + Math.round(n.TimeOffset * 1000.0)) | 0;
		}
		const key = `${hash}|${course.ID}|${context.ChartSelectedBranch}|${chartDuration}|${course.TempoMap.AccelerationStructure.GetLastCalculatedTime()}|${course.TempoMap.Tempo.Sorted.length}|${scrollbar.GetWidth()}|${scrollbar.GetHeight()}|${dpr}|${GuiScaleState.Current}`;

		const cache = this.MinimapCache;
		if (cache.Key !== key || cache.Canvas === null)
		{
			cache.Key = key;
			const width = Math.max(1, Math.ceil(scrollbar.GetWidth() * dpr)), height = Math.max(1, Math.ceil(scrollbar.GetHeight() * dpr));
			if (cache.Canvas === null) cache.Canvas = document.createElement("canvas");
			if (cache.Canvas.width !== width || cache.Canvas.height !== height) { cache.Canvas.width = width; cache.Canvas.height = height; }
			const ctx = cache.Canvas.getContext("2d")!;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, width, height);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			const localNoteRectSize = V2(GuiScale(2.0), GuiScale(4.0));
			const localNoteCenterY = scrollbar.GetHeight() * 0.25;

			// NOTE: Batch all rects of the same color into a single path
			const paths = new Map<number, Path2D>();
			// TODO: Also draw other timeline items... tempo / signature changes, gogo-time etc. (?)
			for (const note of notes)
			{
				const localHeadX = this.TimeToScrollbarLocalSpaceX(course.TempoMap.BeatToTime(NoteGetStart(note)) + note.TimeOffset, chartDuration);
				let width = localNoteRectSize.x;
				if (note.BeatDuration > 0)
				{
					const localTailX = this.TimeToScrollbarLocalSpaceX(course.TempoMap.BeatToTime(NoteGetEnd(note)) + note.TimeOffset, chartDuration);
					width += (localTailX - localHeadX);
				}

				const color = note.IsSelected ? Colors.NoteColorWhite : NoteTypeToColor(note.Type);
				let path = paths.get(color);
				if (path === undefined) { path = new Path2D(); paths.set(color, path); }
				path.rect(localHeadX - localNoteRectSize.x * 0.5, localNoteCenterY - localNoteRectSize.y * 0.5, width, localNoteRectSize.y);
			}
			for (const [color, path] of paths) { ctx.fillStyle = U32ToCSS(color); ctx.fill(path); }
		}

		this.Draw.Ctx.drawImage(cache.Canvas, scrollbar.TL.x, scrollbar.TL.y, scrollbar.GetWidth(), scrollbar.GetHeight());
	}

	private DrawTimelineContentItemRow(context: ChartContext, rowIt: ForEachRowData, visibleTime: MinMaxTime, isPlayback: boolean, cursorTime: Time, cursorBeatOnPlaybackStart: Beat): void
	{
		const camera = this.Camera;
		const d = this.Draw;
		const course = context.ChartSelectedCourse;
		const rowType = rowIt.RowType;

		if (rowType >= NoteBranches_First && rowType <= NoteBranches_Last)
		{
			const branchForThisRow = TimelineRowToBranchType(rowType);
			const list = course.GetNotes(branchForThisRow).Sorted;

			// TODO: Draw unselected branch notes grayed and at a slightly smaller scale (also nicely animate between selecting different branched!)
			for (const it of list)
			{
				const startTime = context.BeatToTime(NoteGetStart(it)) + it.TimeOffset;
				const endTime = (it.BeatDuration > 0) ? context.BeatToTime(NoteGetEnd(it)) + it.TimeOffset : startTime;
				if (endTime < visibleTime.Min || startTime > visibleTime.Max)
					continue;

				const localCenter = V2(camera.TimeToLocalSpaceX(startTime), rowIt.LocalY + rowIt.LocalHeight * 0.5);
				if (it.BeatDuration > 0)
				{
					const localCenterEnd = V2(camera.TimeToLocalSpaceX(endTime), rowIt.LocalY + rowIt.LocalHeight * 0.5);
					this.DrawTimelineNoteDuration(context, this.LocalToScreenSpace(localCenter), this.LocalToScreenSpace(localCenterEnd), it.Type);
				}

				const noteScaleFactor = GetTimelineNoteScaleFactor(isPlayback, cursorTime, cursorBeatOnPlaybackStart, it, startTime);
				this.DrawTimelineNote(context, this.LocalToScreenSpace(localCenter), noteScaleFactor, it.Type);

				if (IsBalloonNote(it.Type) || it.BalloonPopCount > 0)
					this.DrawTimelineNoteBalloonPopCount(this.LocalToScreenSpace(localCenter), noteScaleFactor, it.BalloonPopCount);

				if (it.IsSelected)
				{
					// NOTE: Draw the note itself with the time offset applied but draw the hitbox at the original beat center
					const localSpaceTimeOffsetX = camera.WorldToLocalSpaceScaleX(camera.TimeToWorldSpaceX(it.TimeOffset));
					const hitBoxSize = GuiScale(IsBigNote(it.Type) ? TimelineSelectedNoteHitBoxSizeBig : TimelineSelectedNoteHitBoxSizeSmall);
					this.TempSelectionBoxesDrawBuffer.push({ ScreenSpaceRect: Rect.FromCenterSize(this.LocalToScreenSpace(V2(localCenter.x - localSpaceTimeOffsetX, localCenter.y)), V2(hitBoxSize)), FillColor: Colors.TimelineSelectedNoteBoxBackgroundColor, BorderColor: Colors.TimelineSelectedNoteBoxBorderColor });
				}
			}

			if (this.TempDeletedNoteAnimationsBuffer.length > 0)
			{
				for (const data of this.TempDeletedNoteAnimationsBuffer)
				{
					if (data.Branch !== branchForThisRow)
						continue;

					const startTime = context.BeatToTime(data.OriginalNote.BeatTime) + data.OriginalNote.TimeOffset;
					if (startTime < visibleTime.Min || startTime > visibleTime.Max)
						continue;

					const localCenter = V2(camera.TimeToLocalSpaceX(startTime), rowIt.LocalY + rowIt.LocalHeight * 0.5);
					const noteScaleFactor = ConvertRange(0.0, NoteDeleteAnimationDuration, 1.0, 0.0, ClampBot(data.ElapsedTimeSec, 0.0));
					this.DrawTimelineNote(context, this.LocalToScreenSpace(localCenter), noteScaleFactor, data.OriginalNote.Type);
					// TODO: Also animate duration fading out or "collapsing" some other way (?)
				}
			}

			if (this.TempSelectionBoxesDrawBuffer.length > 0)
			{
				for (const box of this.TempSelectionBoxesDrawBuffer)
				{
					d.AddRectFilled(box.ScreenSpaceRect.TL, box.ScreenSpaceRect.BR, box.FillColor);
					d.AddRect(box.ScreenSpaceRect.TL, box.ScreenSpaceRect.BR, box.BorderColor);
				}
				this.TempSelectionBoxesDrawBuffer = [];
			}

			// NOTE: Long note placement preview
			if (this.LongNotePlacement.IsActive && context.ChartSelectedBranch === branchForThisRow)
			{
				const minBeat = this.LongNotePlacementGetMin(), maxBeat = this.LongNotePlacementGetMax();
				const localCenter = V2(camera.TimeToLocalSpaceX(context.BeatToTime(minBeat)), rowIt.LocalY + rowIt.LocalHeight * 0.5);
				const localCenterEnd = V2(camera.TimeToLocalSpaceX(context.BeatToTime(maxBeat)), rowIt.LocalY + rowIt.LocalHeight * 0.5);
				this.DrawTimelineNoteDuration(context, this.LocalToScreenSpace(localCenter), this.LocalToScreenSpace(localCenterEnd), this.LongNotePlacement.NoteType, 0.7);
				this.DrawTimelineNote(context, this.LocalToScreenSpace(localCenter), 1.0, this.LongNotePlacement.NoteType, 0.7);

				if (IsBalloonNote(this.LongNotePlacement.NoteType))
					this.DrawTimelineNoteBalloonPopCount(this.LocalToScreenSpace(localCenter), 1.0, DefaultBalloonPopCount(maxBeat - minBeat, this.CurrentGridBarDivision));
			}
		}
		else if (rowType === TimelineRowType.GoGoTime)
		{
			for (const it of course.GoGoRanges.Sorted)
			{
				const startTime = context.BeatToTime(GoGoGetStart(it));
				const endTime = context.BeatToTime(GoGoGetEnd(it));
				if (endTime < visibleTime.Min || startTime > visibleTime.Max)
					continue;

				const margin = 1.0;
				const localTL = V2(camera.TimeToLocalSpaceX(startTime), rowIt.LocalY + margin);
				const localBR = V2(camera.TimeToLocalSpaceX(endTime), rowIt.LocalY + rowIt.LocalHeight - (margin * 2.0));
				const screenTL = this.LocalToScreenSpace(localTL);
				this.DrawTimelineGoGoTimeBackground(V2(screenTL.x, screenTL.y + 2.0), this.LocalToScreenSpace(localBR), it.ExpansionAnimationCurrent, it.IsSelected);
			}
		}
		else if (rowType === TimelineRowType.Lyrics)
		{
			const list = course.Lyrics.Sorted;
			const chartBeatDuration = context.TimeToBeat(context.Chart.GetDurationOrDefault());

			d.SetFont(GuiScale(FontBaseSizeMain));
			for (let i = 0; i < list.length; i++)
			{
				const prevLyric = (i - 1 >= 0) ? list[i - 1] : null;
				const thisLyric = list[i];
				const nextLyric = (i + 1 < list.length) ? list[i + 1] : null;
				if (thisLyric.Lyric.length === 0 && prevLyric !== null && prevLyric.Lyric.length > 0)
					continue;

				const lastBeat = (thisLyric.BeatTime <= chartBeatDuration) ? chartBeatDuration : I32Max;
				const startTime = context.BeatToTime(thisLyric.BeatTime);
				const endTime = context.BeatToTime((thisLyric.Lyric.length === 0) ? thisLyric.BeatTime : (nextLyric !== null) ? nextLyric.BeatTime : lastBeat);
				if (endTime < visibleTime.Min || startTime > visibleTime.Max)
					continue;

				const localSpaceTL = V2(camera.TimeToLocalSpaceX(startTime), rowIt.LocalY);
				const localSpaceBR = V2(camera.TimeToLocalSpaceX(endTime), rowIt.LocalY + rowIt.LocalHeight);
				const textHeight = d.GetFontSize();
				const textPosition = this.LocalToScreenSpace(V2(localSpaceTL.x + 4.0, localSpaceTL.y + rowIt.LocalHeight * 0.5 + textHeight * -0.5));

				const lyricsBarRect = new Rect(this.LocalToScreenSpace(V2(localSpaceTL.x, localSpaceTL.y + 1.0)), this.LocalToScreenSpace(localSpaceBR));
				// NOTE: Clamp to a reasonable range to avoid huge rects for the "infinite" last lyric
				lyricsBarRect.BR.x = Math.min(lyricsBarRect.BR.x, this.Regions.Content.BR.x + 64.0);
				lyricsBarRect.TL.x = Math.max(lyricsBarRect.TL.x, this.Regions.Content.TL.x - 64.0);

				this.DrawTimelineLyricsBackground(lyricsBarRect.TL, lyricsBarRect.BR, thisLyric.IsSelected);

				// HACK: Try to at least somewhat visalize the tail being selected, for now
				if (thisLyric.IsSelected || (nextLyric !== null && nextLyric.IsSelected))
				{
					const width = GuiScale(1.0);
					d.AddRectFilled(V2(lyricsBarRect.BR.x - width, lyricsBarRect.TL.y), V2(lyricsBarRect.BR.x + width, lyricsBarRect.BR.y), (nextLyric !== null && nextLyric.IsSelected) ? Colors.TimelineLyricsBackgroundColorBorderSelected : Colors.TimelineLyricsBackgroundColorBorder);
				}

				const borderLeft = 2.0, borderRight = 5.0;
				const clipL = lyricsBarRect.TL.x + borderLeft, clipR = lyricsBarRect.BR.x - borderRight;
				if (Math.abs(clipR - clipL) > (borderLeft + borderRight))
				{
					d.PushClipRect(V2(clipL, lyricsBarRect.TL.y), V2(clipR, lyricsBarRect.BR.y));
					d.AddTextWithDropShadow(textPosition, Colors.TimelineLyricsTextColor, thisLyric.Lyric.replace(/\\n/g, " "), Colors.TimelineLyricsTextColorShadow);
					d.PopClipRect();
				}
			}
			d.SetFont(GuiScale(FontBaseSizeMedium));
		}
		else
		{
			const compactFormatStringZoomLevelThreshold = 0.25;
			const useCompactFormat = (camera.ZoomTarget.x < compactFormatStringZoomLevelThreshold);
			const textHeight = d.GetFontSize();

			const list: (TempoChange | TimeSignatureChange | ScrollChange | BarLineChange)[] =
				(rowType === TimelineRowType.Tempo) ? course.TempoMap.Tempo.Sorted :
					(rowType === TimelineRowType.TimeSignature) ? course.TempoMap.Signature.Sorted :
						(rowType === TimelineRowType.ScrollSpeed) ? course.ScrollChanges.Sorted : course.BarLineChanges.Sorted;

			for (const it of list)
			{
				const startTime = context.BeatToTime(it.BeatTime);
				if (startTime < visibleTime.Min || startTime > visibleTime.Max)
					continue;

				const localSpaceTL = V2(camera.TimeToLocalSpaceX(startTime), rowIt.LocalY);
				const localSpaceBL = V2(localSpaceTL.x, localSpaceTL.y + rowIt.LocalHeight);
				const textPosition = this.LocalToScreenSpace(V2(localSpaceTL.x + 3.0, localSpaceTL.y + rowIt.LocalHeight * 0.5 + textHeight * -0.5));

				let text = "", lineColor = 0, textColor = Colors.TimelineItemTextColor;
				if (rowType === TimelineRowType.Tempo) { const bpm = (it as TempoChange).Tempo.BPM; text = useCompactFormat ? `${bpm.toFixed(0)} BPM` : `${FormatG(bpm)} BPM`; lineColor = Colors.TimelineTempoChangeLineColor; }
				if (rowType === TimelineRowType.TimeSignature) { const sig = (it as TimeSignatureChange).Signature; text = `${sig.Numerator}/${sig.Denominator}`; lineColor = Colors.TimelineSignatureChangeLineColor; textColor = IsTimeSignatureSupported(sig) ? Colors.TimelineItemTextColor : Colors.TimelineItemTextColorWarning; }
				if (rowType === TimelineRowType.ScrollSpeed) { text = `${FormatG((it as ScrollChange).ScrollSpeed)}x`; lineColor = Colors.TimelineScrollChangeLineColor; }
				if (rowType === TimelineRowType.BarLineVisibility) { text = (it as BarLineChange).IsVisible ? "On" : "Off"; lineColor = Colors.TimelineBarLineChangeLineColor; }

				const textWidth = d.CalcTextWidth(text);
				d.AddRectFilled(V2(this.LocalToScreenSpace(localSpaceTL).x, textPosition.y), V2(textPosition.x + textWidth, textPosition.y + textHeight), Colors.TimelineBackgroundColor);
				d.AddLine(this.LocalToScreenSpace(V2(localSpaceTL.x, localSpaceTL.y + 1.0)), this.LocalToScreenSpace(localSpaceBL), it.IsSelected ? Colors.TimelineSelectedItemLineColor : lineColor);
				d.AddTextWithDropShadow(textPosition, textColor, text, Colors.TimelineItemTextColorShadow);

				if (it.IsSelected)
				{
					const lineStart = V2(textPosition.x, textPosition.y + textHeight), lineEnd = V2(textPosition.x + textWidth, textPosition.y + textHeight);
					d.AddLine(V2(lineStart.x + 1.0, lineStart.y + 1.0), V2(lineEnd.x + 1.0, lineEnd.y + 1.0), Colors.TimelineItemTextUnderlineColorShadow);
					d.AddLine(lineStart, lineEnd, Colors.TimelineItemTextUnderlineColor);
				}
			}
		}
	}

	private PlaySoundAtSongPosition(context: ChartContext, type: SoundEffectType, noteTime: Time, nonSmoothCursorThisFrame: Time): void
	{
		// NOTE: Instead of the original (unscaled) "Min(cursorThisFrame - noteTime, 0)" start time, the exact future audio clock time of the note is used
		//		 which also correctly accounts for the playback speed
		const noteContextTime = context.SongVoice.PositionToContextTime(noteTime - context.Chart.SongOffset);
		const delay = (noteTime > nonSmoothCursorThisFrame) ? (noteContextTime - Engine.GetContextTime()) : 0.0;
		context.SfxVoicePool.PlaySound(type, -Math.max(0.0, delay));
	}

	private UpdateTimelinePlaybackAndMetronomneSounds(context: ChartContext, playbackSoundsEnabled: boolean): void
	{
		const frameTimeThresholdAtWhichPlayingSoundsMakesNoSense = TimeFromMS(250.0);
		const playbackSoundFutureOffset = (1.0 / 25.0);
		const metronome = this.Metronome;

		context.CursorNonSmoothTimeLastFrame = context.CursorNonSmoothTimeThisFrame;
		context.CursorNonSmoothTimeThisFrame = (context.SongVoice.GetPosition() + context.Chart.SongOffset);
		const nonSmoothCursorThisFrame = context.CursorNonSmoothTimeThisFrame;
		const nonSmoothCursorLastFrame = context.CursorNonSmoothTimeLastFrame;

		const elapsedCursorTimeSinceLastUpdate = (nonSmoothCursorLastFrame - nonSmoothCursorThisFrame);
		if (elapsedCursorTimeSinceLastUpdate >= frameTimeThresholdAtWhichPlayingSoundsMakesNoSense)
			return;

		const futureOffset = (playbackSoundFutureOffset * Math.min(context.SongVoice.GetPlaybackSpeed(), 1.0));

		if (playbackSoundsEnabled)
		{
			const checkAndPlayNoteSound = (noteTime: Time, noteType: NoteType) =>
			{
				const offsetNoteTime = noteTime - futureOffset;
				if (offsetNoteTime >= nonSmoothCursorLastFrame && offsetNoteTime < nonSmoothCursorThisFrame)
				{
					// NOTE: Don't wanna cause any audio cutoffs. If this happens the future threshold is either set too low for the current frame time
					//		 or playback was started on top of an existing note
					this.PlaySoundAtSongPosition(context, SoundEffectTypeForNoteType(noteType), noteTime, nonSmoothCursorThisFrame);
				}
			};

			// NOTE: Skip over notes that are entirely before the last frame cursor (only an optimization, the result is the same)
			const notes = context.ChartSelectedCourse.GetNotes(context.ChartSelectedBranch).Sorted;
			const minBeat = context.TimeToBeat(nonSmoothCursorLastFrame - 1.0);
			for (const note of notes)
			{
				if ((note.BeatTime + note.BeatDuration) < minBeat)
					continue;

				if (note.BeatDuration > 0)
				{
					if (IsBalloonNote(note.Type))
					{
						checkAndPlayNoteSound(context.BeatToTime(note.BeatTime) + note.TimeOffset, note.Type);

						const balloonBeatInterval = (note.BalloonPopCount > 0) ? BeatDiv(note.BeatDuration, note.BalloonPopCount) : 0;
						if (balloonBeatInterval > 0)
						{
							let remainingPops = note.BalloonPopCount;
							for (let subBeat = balloonBeatInterval; (subBeat < note.BeatDuration) && (--remainingPops > 0); subBeat += balloonBeatInterval)
								checkAndPlayNoteSound(context.BeatToTime(note.BeatTime + subBeat) + note.TimeOffset, note.Type);
						}
					}
					else
					{
						const drummrollBeatInterval = GetGridBeatSnap(Settings.General.DrumrollAutoHitBarDivision);
						for (let subBeat = 0; subBeat <= note.BeatDuration; subBeat += drummrollBeatInterval)
							checkAndPlayNoteSound(context.BeatToTime(note.BeatTime + subBeat) + note.TimeOffset, note.Type);
					}
				}
				else
				{
					checkAndPlayNoteSound(context.BeatToTime(note.BeatTime) + note.TimeOffset, note.Type);
				}
			}
		}

		if (metronome.IsEnabled)
		{
			if (nonSmoothCursorLastFrame !== metronome.LastProvidedNonSmoothCursorTime)
			{
				metronome.LastPlayedBeatTime = F64Min;
				metronome.HasOnPlaybackStartTimeBeenPlayed = false;
			}
			metronome.LastProvidedNonSmoothCursorTime = nonSmoothCursorThisFrame;

			const cursorBeatStart = context.TimeToBeat(nonSmoothCursorThisFrame);
			const cursorBeatEnd = cursorBeatStart + BeatFromBars(1);
			const cursorTimeOnPlaybackStart = context.CursorTimeOnPlaybackStart;

			context.ChartSelectedCourse.TempoMap.ForEachBeatBar((it: ForEachBeatBarData) =>
			{
				if (it.Beat >= cursorBeatEnd)
					return ControlFlow.Break;

				const beatTime = context.BeatToTime(it.Beat);
				const offsetBeatTime = (beatTime - futureOffset);

				// BUG: This is definitely too lenient and easily falsely triggers 1/16th after a bar start
				// HACK: Imperfect solution for making up for the future offset skipping past the first beat(s) if they are too close to the playback start time
				if (!metronome.HasOnPlaybackStartTimeBeenPlayed && ApproxmiatelySame(beatTime, cursorTimeOnPlaybackStart, 0.01))
				{
					metronome.HasOnPlaybackStartTimeBeenPlayed = true;
					metronome.LastPlayedBeatTime = beatTime;
					context.SfxVoicePool.PlaySound(it.IsBar ? SoundEffectType.MetronomeBar : SoundEffectType.MetronomeBeat);
					return ControlFlow.Break;
				}

				if (offsetBeatTime >= nonSmoothCursorLastFrame && offsetBeatTime < nonSmoothCursorThisFrame)
				{
					if (metronome.LastPlayedBeatTime !== beatTime)
					{
						metronome.LastPlayedBeatTime = beatTime;
						this.PlaySoundAtSongPosition(context, it.IsBar ? SoundEffectType.MetronomeBar : SoundEffectType.MetronomeBeat, beatTime, nonSmoothCursorThisFrame);
					}
					return ControlFlow.Break;
				}

				return ControlFlow.Continue;
			});
		}
	}

	// NOTE: ----------------------------------------------------------------------------------------------------------------
	//		 Main update / draw
	// NOTE: ----------------------------------------------------------------------------------------------------------------

	private UpdateRegions(): void
	{
		const isCompact = this.CompactLayout;
		// NOTE: Big enough to fit both the bar-index, bar-time and some padding
		const contentAndSidebarHeaderHeight = 34.0;
		const sidebarWidth = GuiScale(isCompact ? Math.min(this.CurrentSidebarWidth, 112.0) : this.CurrentSidebarWidth);
		const sidebarHeight = GuiScale(contentAndSidebarHeaderHeight);
		const scrollbarHeight = GuiScale(14.0) * (isCompact ? 2.5 : 3.0);

		const R = this.Regions;
		R.Window = Rect.FromTLSize(V2(0, 0), V2(this.CanvasCSSWidth, this.CanvasCSSHeight));
		R.SidebarHeader = Rect.FromTLSize(R.Window.TL, V2(sidebarWidth, sidebarHeight));
		R.Sidebar = Rect.FromTLSize(R.SidebarHeader.GetBL(), V2(sidebarWidth, R.Window.GetHeight() - sidebarHeight));
		R.ContentHeader = new Rect(R.SidebarHeader.GetTR(), V2(R.Window.BR.x, R.SidebarHeader.BR.y));
		R.Content = Rect.FromTLSize(R.ContentHeader.GetBL(), V2(Math.max(0.0, R.Window.GetWidth() - sidebarWidth), Math.max(0.0, R.Window.GetHeight() - sidebarHeight - scrollbarHeight)));
		R.ContentScrollbarX = Rect.FromTLSize(R.Content.GetBL(), V2(R.Content.GetWidth(), scrollbarHeight));
	}

	private ResizeCanvasIfNeeded(): boolean
	{
		const canvas = this.Canvas;
		if (canvas === null || this.Ctx === null)
			return false;

		const cssWidth = canvas.clientWidth, cssHeight = canvas.clientHeight;
		const dpr = window.devicePixelRatio || 1;
		if (cssWidth !== this.CanvasCSSWidth || cssHeight !== this.CanvasCSSHeight || dpr !== this.DevicePixelRatio)
		{
			this.CanvasCSSWidth = cssWidth;
			this.CanvasCSSHeight = cssHeight;
			this.DevicePixelRatio = dpr;
			canvas.width = Math.max(1, Math.round(cssWidth * dpr));
			canvas.height = Math.max(1, Math.round(cssHeight * dpr));
		}
		return (cssWidth > 0 && cssHeight > 0);
	}

	DrawGui(context: ChartContext): void
	{
		this.UpdateInputAtStartOfFrame(context);
		this.UpdateAllAnimationsAfterUserInput(context);

		if (!this.ResizeCanvasIfNeeded())
			return;

		this.UpdateRegions();

		// NOTE: Hover / focus states are stored across frame boundaries (just like the original)
		const mouse = Input.MousePos;
		const mouseInside = Input.MouseInsideTarget;
		const blockedByOtherActiveItem = this.ScrollbarDrag.IsActive;
		this.IsAnyChildWindowFocused = (Input.FocusOwner === "timeline") && !Input.IsTextInputActive();
		this.IsSidebarWindowHovered = mouseInside && this.Regions.Sidebar.Contains(mouse);
		this.IsContentHeaderWindowHovered = mouseInside && !blockedByOtherActiveItem && this.Regions.ContentHeader.Contains(mouse);
		this.IsContentWindowHovered = mouseInside && !blockedByOtherActiveItem && this.Regions.Content.Contains(mouse);
		this.IsContentWindowFocused = this.IsAnyChildWindowFocused;
		this.IsScrollbarHovered = mouseInside && this.Regions.ContentScrollbarX.Contains(mouse);

		this.UpdateScrollbarInput(context);
		this.DrawAllAtEndOfFrame(context);
	}

	StartEndRangeSelectionAtCursor(context: ChartContext): void
	{
		if (!this.RangeSelection.IsActive || this.RangeSelection.HasEnd)
		{
			this.RangeSelection.Start = this.RangeSelection.End = this.RoundBeatToCurrentGrid(context.GetCursorBeat());
			this.RangeSelection.HasEnd = false;
			this.RangeSelection.IsActive = true;
			this.RangeSelectionExpansionAnimationTarget = 0.0;
		}
		else
		{
			this.RangeSelection.End = this.RoundBeatToCurrentGrid(context.GetCursorBeat());
			this.RangeSelection.HasEnd = true;
			this.RangeSelectionExpansionAnimationTarget = 1.0;
			if (this.RangeSelection.End === this.RangeSelection.Start)
				this.RangeSelection = { Start: 0, End: 0, HasEnd: false, IsActive: false };
		}
	}

	PlayNoteSoundAndHitAnimationsAtBeat(context: ChartContext, cursorBeat: Beat): void
	{
		let soundHasBeenPlayed = false;
		for (const note of context.ChartSelectedCourse.GetNotes(context.ChartSelectedBranch).Sorted)
		{
			if (note.BeatTime === cursorBeat)
			{
				note.ClickAnimationTimeRemaining = note.ClickAnimationTimeDuration = NoteHitAnimationDuration;
				if (!soundHasBeenPlayed) { context.SfxVoicePool.PlaySound(SoundEffectTypeForNoteType(note.Type)); soundHasBeenPlayed = true; }
			}
		}
	}

	async ExecuteClipboardAction(context: ChartContext, action: ClipboardAction): Promise<void>
	{
		const clipboardTextHeader = "// PeepoDrumKit Clipboard";
		// NOTE: Web port addition ("more-grid"), the tick resolution is stored so that items copied from the original resolution (48 ticks per beat) are scaled correctly
		const clipboardTicksPerBeatPrefix = "// TicksPerBeat: ";
		const itemsToClipboardText = (inItems: GenericListStructWithType[], baseBeat: Beat): string =>
		{
			let out = clipboardTextHeader + "\n" + clipboardTicksPerBeatPrefix + TicksPerBeat + "\n";
			for (const item of inItems)
			{
				switch (item.List)
				{
					case GenericList.TempoChanges: { const v = item.Value as TempoChange; out += `Tempo { ${v.BeatTime - baseBeat}, ${FormatG(v.Tempo.BPM)} };\n`; } break;
					case GenericList.SignatureChanges: { const v = item.Value as TimeSignatureChange; out += `TimeSignature { ${v.BeatTime - baseBeat}, ${v.Signature.Numerator}, ${v.Signature.Denominator} };\n`; } break;
					case GenericList.Notes_Normal:
					case GenericList.Notes_Expert:
					case GenericList.Notes_Master: { const v = item.Value as Note; out += `Note { ${v.BeatTime - baseBeat}, ${v.BeatDuration}, ${v.Type}, ${v.BalloonPopCount}, ${FormatG(TimeToMS(v.TimeOffset))} };\n`; } break;
					case GenericList.ScrollChanges: { const v = item.Value as ScrollChange; out += `ScrollSpeed { ${v.BeatTime - baseBeat}, ${FormatG(v.ScrollSpeed)} };\n`; } break;
					case GenericList.BarLineChanges: { const v = item.Value as BarLineChange; out += `BarLine { ${v.BeatTime - baseBeat}, ${v.IsVisible ? 1 : 0} };\n`; } break;
					case GenericList.GoGoRanges: { const v = item.Value as GoGoRange; out += `GoGo { ${v.BeatTime - baseBeat}, ${v.BeatDuration} };\n`; } break;
					// TODO: Properly handle escape characters (?)
					case GenericList.Lyrics: { const v = item.Value as LyricChange; out += `Lyric { ${v.BeatTime - baseBeat}, ${v.Lyric} };\n`; } break;
				}
			}
			if (out.endsWith("\n"))
				out = out.substring(0, out.length - 1);
			return out;
		};
		const itemsFromClipboatdText = (clipboardText: string): GenericListStructWithType[] =>
		{
			const out: GenericListStructWithType[] = [];
			if (!clipboardText.startsWith(clipboardTextHeader))
				return out;

			// NOTE: Clipboard text without a resolution line comes from the original (or a previous web port version) using 48 ticks per beat
			let sourceTicksPerBeat = OriginalTicksPerBeat;

			// TODO: Split and parse by ';' instead of '\n' (?)
			for (let line of clipboardText.split("\n"))
			{
				line = line.replace(/\r$/, "");
				if (line.startsWith(clipboardTicksPerBeatPrefix))
				{
					const v = parseInt(line.substring(clipboardTicksPerBeatPrefix.length), 10);
					if (Number.isFinite(v) && v > 0) sourceTicksPerBeat = v;
					continue;
				}
				if (line.length === 0 || line.startsWith("//"))
					continue;

				const openIndex = line.indexOf('{');
				const closeIndex = line.lastIndexOf('}');
				if (openIndex < 0 || closeIndex < 0 || closeIndex <= openIndex)
					continue;

				const itemType = line.substring(0, openIndex).trim();
				const itemParam = line.substring(openIndex + 1, closeIndex).trim();

				if (itemType === "Lyric")
				{
					const commaIndex = itemParam.indexOf(',');
					const value: LyricChange = { BeatTime: 0, Lyric: "", IsSelected: false };
					if (commaIndex >= 0)
					{
						value.BeatTime = parseInt(itemParam.substring(0, commaIndex).trim(), 10) || 0;
						value.Lyric = itemParam.substring(commaIndex + 1).trim();
					}
					out.push({ List: GenericList.Lyrics, Value: value });
				}
				else
				{
					const p = itemParam.split(",").map((v) => v.trim());
					const i32 = (i: number) => { const v = parseInt(p[i] ?? "", 10); return Number.isFinite(v) ? v : 0; };
					const f32 = (i: number) => { const v = parseFloat(p[i] ?? ""); return Number.isFinite(v) ? v : 0.0; };

					if (itemType === "Tempo") out.push({ List: GenericList.TempoChanges, Value: { BeatTime: i32(0), Tempo: { BPM: f32(1) }, IsSelected: false } as TempoChange });
					else if (itemType === "TimeSignature") out.push({ List: GenericList.SignatureChanges, Value: { BeatTime: i32(0), Signature: { Numerator: i32(1), Denominator: i32(2) }, IsSelected: false } as TimeSignatureChange });
					else if (itemType === "Note") out.push({ List: GenericList.Notes_Normal, Value: MakeNote({ BeatTime: i32(0), BeatDuration: i32(1), Type: Clamp(i32(2), 0, NoteType.Count - 1), BalloonPopCount: i32(3), TimeOffset: TimeFromMS(f32(4)) }) });
					else if (itemType === "ScrollSpeed") out.push({ List: GenericList.ScrollChanges, Value: MakeScrollChange(i32(0), f32(1)) });
					else if (itemType === "BarLine") out.push({ List: GenericList.BarLineChanges, Value: { BeatTime: i32(0), IsVisible: i32(1) !== 0, IsSelected: false } as BarLineChange });
					else if (itemType === "GoGo") out.push({ List: GenericList.GoGoRanges, Value: { BeatTime: i32(0), BeatDuration: i32(1), IsSelected: false, ExpansionAnimationCurrent: 0.0, ExpansionAnimationTarget: 1.0 } as GoGoRange });
				}
			}

			if (sourceTicksPerBeat !== TicksPerBeat)
			{
				const scaleBeat = (beat: Beat): Beat => Math.round(beat * TicksPerBeat / sourceTicksPerBeat);
				for (const it of out)
				{
					const v = it.Value as { BeatTime: Beat; BeatDuration?: Beat };
					v.BeatTime = scaleBeat(v.BeatTime);
					if (v.BeatDuration !== undefined) v.BeatDuration = scaleBeat(v.BeatDuration);
				}
			}
			return out;
		};
		const copyAllSelectedItems = (course: typeof context.ChartSelectedCourse): GenericListStructWithType[] =>
		{
			const out: GenericListStructWithType[] = [];
			ForEachSelectedChartItem(course, (it) => { out.push({ List: it.List, Value: TryGetGenericStruct(course, it.List, it.Index)! }); });
			return out;
		};
		const findBaseBeat = (items: GenericListStructWithType[]): Beat =>
		{
			let minBase = I32Max;
			for (const item of items)
				minBase = Math.min(GetGenericListStructBeat(item), minBase);
			return (minBase !== I32Max) ? minBase : 0;
		};

		const course = context.ChartSelectedCourse;
		switch (action)
		{
			case ClipboardAction.Cut:
			{
				const selectedItems = copyAllSelectedItems(course);
				if (selectedItems.length > 0)
				{
					let selectedNoteIndex = 0;
					for (const item of selectedItems)
					{
						if (IsNotesList(item.List))
						{
							this.TempDeletedNoteAnimationsBuffer.push({ OriginalNote: CloneNote(item.Value as Note), Branch: context.ChartSelectedBranch, ElapsedTimeSec: ConvertRange(0.0, selectedItems.length, 0.0, -0.08, selectedNoteIndex) });
							selectedNoteIndex++;
						}
					}

					await ClipboardWriteText(itemsToClipboardText(selectedItems, findBaseBeat(selectedItems)));
					context.Undo.Execute(new Commands.RemoveMultipleGenericItems_Cut(course, selectedItems));
				}
			} break;
			case ClipboardAction.Copy:
			{
				const selectedItems = copyAllSelectedItems(course);
				// TODO: Maybe also animate original notes being copied (?)
				if (selectedItems.length > 0)
					await ClipboardWriteText(itemsToClipboardText(selectedItems, findBaseBeat(selectedItems)));
			} break;
			case ClipboardAction.Paste:
			{
				let clipboardItems = itemsFromClipboatdText(await ClipboardReadText());
				if (clipboardItems.length > 0)
				{
					const baseBeat = this.FloorBeatToCurrentGrid(context.GetCursorBeat()) - findBaseBeat(clipboardItems);
					for (const item of clipboardItems) SetGenericListStructBeat(item, GetGenericListStructBeat(item) + baseBeat);

					const itemAlreadyExistsOrIsBad = (item: GenericListStructWithType): boolean =>
					{
						const inclusiveBeatCheck = ListUsesInclusiveBeatCheck(item.List);
						const beat = GetGenericListStructBeat(item), duration = GetGenericListStructBeatDuration(item);
						const list = GetGenericList(course, item.List) as BeatSortedList<GenericListItem>;
						return (beat < 0) || (list.TryFindOverlappingBeatIndex(beat, beat + duration, inclusiveBeatCheck) >= 0);
					};
					clipboardItems = clipboardItems.filter((item) => !itemAlreadyExistsOrIsBad(item));

					if (clipboardItems.length > 0)
					{
						SetNotesWaveAnimationTimesItems(clipboardItems, +1);

						let isFirstNote = true;
						for (const item of clipboardItems)
							if (isFirstNote && IsNotesList(item.List)) { context.SfxVoicePool.PlaySound(SoundEffectTypeForNoteType((item.Value as Note).Type)); isFirstNote = false; }

						context.Undo.Execute(new Commands.AddMultipleGenericItems_Paste(course, clipboardItems));
					}
				}
			} break;
			case ClipboardAction.Delete:
			{
				const selectedItems = copyAllSelectedItems(course);
				if (selectedItems.length > 0)
				{
					for (const item of selectedItems)
						if (IsNotesList(item.List))
							this.TempDeletedNoteAnimationsBuffer.push({ OriginalNote: CloneNote(item.Value as Note), Branch: context.ChartSelectedBranch, ElapsedTimeSec: 0.0 });

					context.Undo.Execute(new Commands.RemoveMultipleGenericItems(course, selectedItems));
				}
			} break;
		}
	}

	ExecuteSelectionAction(context: ChartContext, action: SelectionAction, param: SelectionActionParam): void
	{
		const course = context.ChartSelectedCourse;
		switch (action)
		{
			case SelectionAction.SelectAll: { ForEachChartItem(course, (it) => ChartItemSetIsSelected(course, it, true)); } break;
			case SelectionAction.UnselectAll: { ForEachChartItem(course, (it) => ChartItemSetIsSelected(course, it, false)); } break;
			case SelectionAction.InvertAll: { ForEachChartItem(course, (it) => ChartItemSetIsSelected(course, it, !ChartItemGetIsSelected(course, it))); } break;
			case SelectionAction.SelectAllWithinRangeSelection:
			{
				if (this.RangeSelectionIsActiveAndHasEnd())
				{
					const rangeSelectionMin = this.RoundBeatToCurrentGrid(this.RangeSelectionGetMin());
					const rangeSelectionMax = this.RoundBeatToCurrentGrid(this.RangeSelectionGetMax());
					ForEachChartItem(course, (it) =>
					{
						const itStart = ChartItemGetBeat(course, it);
						const itEnd = itStart + ChartItemGetBeatDuration(course, it);
						if ((itStart <= rangeSelectionMax) && (itEnd >= rangeSelectionMin))
							ChartItemSetIsSelected(course, it, true);
					});
				}
			} break;
			case SelectionAction.PerRowShiftSelected:
			{
				const shiftDelta = param.ShiftDelta ?? 0;
				for (let list = 0; list < GenericList.Count; list++)
				{
					const sorted = GetGenericList(course, list).Sorted;
					const listCount = sorted.length;
					if (shiftDelta > 0)
					{
						for (let i = listCount - 1; i >= 0; i--)
						{
							if ((i + 1) < listCount && sorted[i].IsSelected)
								sorted[i + 1].IsSelected = true;
							sorted[i].IsSelected = false;
						}
					}
					else if (shiftDelta < 0)
					{
						for (let i = 0; i < listCount; i++)
						{
							if ((i - 1) >= 0 && sorted[i].IsSelected)
								sorted[i - 1].IsSelected = true;
							sorted[i].IsSelected = false;
						}
					}
				}
			} break;
			case SelectionAction.PerRowSelectPattern:
			{
				const pattern = param.Pattern ?? "";
				if (pattern.length === 0)
					break;

				for (let list = 0; list < GenericList.Count; list++)
				{
					const sorted = GetGenericList(course, list).Sorted;
					for (let i = 0, patternIndex = 0; i < sorted.length; i++)
					{
						if (sorted[i].IsSelected)
						{
							if (pattern[patternIndex] !== 'x')
								sorted[i].IsSelected = false;
							if (++patternIndex >= pattern.length)
								patternIndex = 0;
						}
					}
				}
			} break;
		}
	}

	ExecuteTransformAction(context: ChartContext, action: TransformAction, param: TransformActionParam): void
	{
		const course = context.ChartSelectedCourse;
		switch (action)
		{
			case TransformAction.FlipNoteType:
			case TransformAction.ToggleNoteSize:
			{
				const isFlip = (action === TransformAction.FlipNoteType);
				for (let branch = 0; branch < BranchType.Count; branch++)
				{
					const notes = course.GetNotes(branch);
					const noteTypesToChange: Commands.ChangeMultipleNoteTypesData[] = [];
					notes.Sorted.forEach((note, index) =>
					{
						if (note.IsSelected && (!isFlip || IsNoteFlippable(note.Type)))
						{
							noteTypesToChange.push({ Index: index, NewType: isFlip ? FlipNote(note.Type) : ToggleNoteSize(note.Type) });
							note.ClickAnimationTimeRemaining = note.ClickAnimationTimeDuration = NoteHitAnimationDuration;
						}
					});
					if (noteTypesToChange.length <= 0)
						continue;

					context.SfxVoicePool.PlaySound(SoundEffectTypeForNoteType(noteTypesToChange[0].NewType));
					context.Undo.Execute(isFlip ? new Commands.ChangeMultipleNoteTypes_FlipTypes(notes, noteTypesToChange) : new Commands.ChangeMultipleNoteTypes_ToggleSizes(notes, noteTypesToChange));
					context.Undo.DisallowMergeForLastCommand();
				}
			} break;
			case TransformAction.ScaleItemTime:
			{
				const [ratioNum, ratioDen] = param.TimeRatio ?? [1, 1];
				let selectedItemCount = 0; ForEachSelectedChartItem(course, () => { selectedItemCount++; });
				if (selectedItemCount <= 0 || ratioNum <= 0 || ratioDen <= 0 || ratioNum === ratioDen)
					return;

				let isFirst = true, firstBeat = 0;
				const itemsToRemove: GenericListStructWithType[] = [];
				const itemsToAdd: GenericListStructWithType[] = [];
				ForEachSelectedChartItem(course, (it) =>
				{
					if (isFirst) { firstBeat = ChartItemGetBeat(course, it); isFirst = false; }

					const itemToRemove: GenericListStructWithType = { List: it.List, Value: TryGetGenericStruct(course, it.List, it.Index)! };
					itemsToRemove.push(itemToRemove);

					const itemToAdd: GenericListStructWithType = { List: it.List, Value: TryGetGenericStruct(course, it.List, it.Index)! };
					SetGenericListStructBeat(itemToAdd, (BeatDiv(GetGenericListStructBeat(itemToAdd) - firstBeat, ratioDen) * ratioNum) + firstBeat);
					if (IsNotesList(itemToAdd.List))
					{
						const note = itemToAdd.Value as Note;
						note.ClickAnimationTimeRemaining = note.ClickAnimationTimeDuration = NoteHitAnimationDuration;
					}
					itemsToAdd.push(itemToAdd);
				});

				// BUG: Resolve item duration intersections (only *add* notes if they don't interect another non-selected long item (?))
				// BUG: Overwritten items not correctly restored on undo (?)
				if (itemsToRemove.length > 0 || itemsToAdd.length > 0)
				{
					for (const it of itemsToAdd) if (IsNotesList(it.List)) { context.SfxVoicePool.PlaySound(SoundEffectTypeForNoteType((it.Value as Note).Type)); break; }

					if (ratioNum < ratioDen)
						context.Undo.Execute(new Commands.RemoveThenAddMultipleGenericItems_CompressItems(course, itemsToRemove, itemsToAdd));
					else
						context.Undo.Execute(new Commands.RemoveThenAddMultipleGenericItems_ExpandItems(course, itemsToRemove, itemsToAdd));
					context.Undo.DisallowMergeForLastCommand();
				}
			} break;
		}
	}

	ExecuteConvertSelectionToScrollChanges(context: ChartContext): void
	{
		const course = context.ChartSelectedCourse;

		let nonScrollChangeSelectedItemCount = 0;
		ForEachSelectedChartItem(course, (it) => { nonScrollChangeSelectedItemCount += (it.List !== GenericList.ScrollChanges) ? 1 : 0; });
		if (nonScrollChangeSelectedItemCount <= 0)
			return;

		const scrollChangesThatAlreadyExist: ScrollChange[] = [];
		const scrollChangesToAdd: ScrollChange[] = [];
		ForEachSelectedChartItem(course, (it) =>
		{
			if (it.List !== GenericList.ScrollChanges)
			{
				const itBeat = ChartItemGetBeat(course, it);
				const lastScrollChange = course.ScrollChanges.TryFindLastAtBeat(itBeat);
				if (lastScrollChange !== null && lastScrollChange.BeatTime === itBeat)
					scrollChangesThatAlreadyExist.push(lastScrollChange);
				else
					scrollChangesToAdd.push(MakeScrollChange(itBeat, (lastScrollChange !== null) ? lastScrollChange.ScrollSpeed : 1.0));
			}
		});

		if (scrollChangesThatAlreadyExist.length > 0 || scrollChangesToAdd.length > 0)
		{
			if (Settings.General.ConvertSelectionToScrollChanges_UnselectOld)
				ForEachSelectedChartItem(course, (it) => ChartItemSetIsSelected(course, it, false));

			if (Settings.General.ConvertSelectionToScrollChanges_SelectNew)
			{
				for (const it of scrollChangesThatAlreadyExist) it.IsSelected = true;
				for (const it of scrollChangesToAdd) it.IsSelected = true;
			}

			if (scrollChangesToAdd.length > 0)
				context.Undo.Execute(new Commands.AddMultipleScrollChanges(course.ScrollChanges, scrollChangesToAdd));
		}
	}

	private IsActiveID(): boolean
	{
		// NOTE: Equivalent of "Gui::GetActiveID() != 0"
		return Input.IsTextInputActive() || this.IsCameraMouseGrabActive || this.BoxSelection.IsActive || this.ScrollbarDrag.IsActive;
	}

	SetMouseCursor(cursor: string): void { this.pendingMouseCursor = cursor; }
	private pendingMouseCursor = "";

	TogglePlayback(context: ChartContext): void
	{
		if (context.GetIsPlayback())
		{
			context.SetIsPlayback(false);
			this.WorldSpaceCursorXAnimationCurrent = this.Camera.TimeToWorldSpaceX(context.GetCursorTime());
		}
		else
		{
			Engine.EnsureStreamRunning();
			const cursorBeat = context.GetCursorBeat();
			this.PlayNoteSoundAndHitAnimationsAtBeat(context, cursorBeat);
			context.SetIsPlayback(true);
		}
	}

	StepCursorByBeat(context: ChartContext, beatIncrement: Beat): void
	{
		const oldCursorBeatAndTime = context.GetCursorBeatAndTime();
		const oldCursorBeat = this.RoundBeatToCurrentGrid(oldCursorBeatAndTime.Beat);
		const newCursorBeat = oldCursorBeat + beatIncrement;

		context.SetCursorBeat(newCursorBeat);
		this.PlayNoteSoundAndHitAnimationsAtBeat(context, newCursorBeat);

		// BUG: It's still possible to move the cursor off screen without it auto-scrolling if the cursor is on the far right edge of the screen
		const cursorLocalSpaceXOld = this.Camera.TimeToLocalSpaceX_AtTarget(oldCursorBeatAndTime.Time);
		if (cursorLocalSpaceXOld >= 0.0 && cursorLocalSpaceXOld <= this.Regions.Content.GetWidth())
		{
			const cursorLocalSpaceX = this.Camera.TimeToLocalSpaceX(context.BeatToTime(newCursorBeat));
			this.Camera.PositionTarget.x += (cursorLocalSpaceX - this.Camera.TimeToLocalSpaceX(oldCursorBeatAndTime.Time));
			this.WorldSpaceCursorXAnimationCurrent = this.Camera.LocalToWorldSpace(V2(cursorLocalSpaceX, 0.0)).x;
		}
	}

	ChangeGridDivision(direction: number): void
	{
		// NOTE: Step relative to the current value so that freely set (non preset) divisions step to the neighboring preset
		const current = this.CurrentGridBarDivision;
		if (direction > 0)
			this.CurrentGridBarDivision = AllowedGridBarDivisions.find((it) => it > current) ?? current;
		else if (direction < 0)
			this.CurrentGridBarDivision = [...AllowedGridBarDivisions].reverse().find((it) => it < current) ?? current;
	}

	ChangePlaybackSpeedStep(context: ChartContext, direction: number, speeds: readonly number[] = Settings.General.PlaybackSpeedSteps.V): void
	{
		let closetPlaybackSpeedIndex = 0;
		const currentPlaybackSpeed = context.GetPlaybackSpeed();
		speeds.forEach((it, i) => { if (it >= currentPlaybackSpeed) closetPlaybackSpeedIndex = i; });
		if (speeds.length === 0) return;
		context.SetPlaybackSpeed(speeds[Clamp(closetPlaybackSpeedIndex + direction, 0, speeds.length - 1)]);
	}

	/** NOTE: Equivalent of the "updateNotePlacementBinding" lambda body after the binding has been pressed */
	/** NOTE: Returns the beat a note was added (or changed) at, otherwise null */
	PlaceNote(context: ChartContext, noteTypeToInsert: NoteType, fillRangeSelection: boolean): Beat | null
	{
		const notes = context.ChartSelectedCourse.GetNotes(context.ChartSelectedBranch);

		if (fillRangeSelection && this.RangeSelectionIsActiveAndHasEnd())
		{
			const startTick = this.RoundBeatToCurrentGrid(this.RangeSelectionGetMin());
			const endTick = this.RoundBeatToCurrentGrid(this.RangeSelectionGetMax());
			const beatPerNote = GetGridBeatSnap(this.CurrentGridBarDivision);
			const maxExpectedNoteCountToAdd = BeatDiv(endTick - startTick, beatPerNote) + 1;

			const newNotesToAdd: Note[] = [];
			for (let i = 0; i < maxExpectedNoteCountToAdd; i++)
			{
				const beatForThisNote = Math.min(startTick, endTick) + (i * beatPerNote);
				if (notes.TryFindOverlappingBeatIndex(beatForThisNote, beatForThisNote) < 0)
					newNotesToAdd.push(MakeNote({ BeatTime: beatForThisNote, Type: noteTypeToInsert }));
			}

			if (newNotesToAdd.length > 0)
			{
				SetNotesWaveAnimationTimes(newNotesToAdd, (this.RangeSelection.Start < this.RangeSelection.End) ? +1 : -1);
				context.SfxVoicePool.PlaySound(SoundEffectTypeForNoteType(newNotesToAdd[0].Type));
				context.Undo.Execute(new Commands.AddMultipleNotes(notes, newNotesToAdd));
			}
			return null;
		}
		else
		{
			const isPlayback = context.GetIsPlayback();
			const cursorBeat = isPlayback ? this.RoundBeatToCurrentGrid(context.GetCursorBeat()) : this.FloorBeatToCurrentGrid(context.GetCursorBeat());

			const existingNoteIndex = notes.TryFindOverlappingBeatIndex(cursorBeat, cursorBeat);
			if (existingNoteIndex >= 0)
			{
				const existingNoteAtCursor = notes.Sorted[existingNoteIndex];
				if (existingNoteAtCursor.BeatTime === cursorBeat)
				{
					existingNoteAtCursor.ClickAnimationTimeRemaining = existingNoteAtCursor.ClickAnimationTimeDuration = NoteHitAnimationDuration;
					if (!isPlayback)
					{
						if (ToSmallNote(existingNoteAtCursor.Type) === ToSmallNote(noteTypeToInsert) || (existingNoteAtCursor.BeatDuration > 0))
						{
							this.TempDeletedNoteAnimationsBuffer.push({ OriginalNote: CloneNote(existingNoteAtCursor), Branch: context.ChartSelectedBranch, ElapsedTimeSec: 0.0 });
							context.Undo.Execute(new Commands.RemoveSingleNote(notes, existingNoteAtCursor));
						}
						else
						{
							context.Undo.Execute(new Commands.ChangeSingleNoteType(notes, { Index: existingNoteIndex, NewType: noteTypeToInsert }));
							context.Undo.DisallowMergeForLastCommand();
							context.SfxVoicePool.PlaySound(SoundEffectTypeForNoteType(existingNoteAtCursor.Type));
							return cursorBeat;
						}
					}
				}
				context.SfxVoicePool.PlaySound(SoundEffectTypeForNoteType(existingNoteAtCursor.Type));
			}
			else if (cursorBeat >= 0)
			{
				const newNote = MakeNote({ BeatTime: cursorBeat, Type: noteTypeToInsert });
				newNote.ClickAnimationTimeRemaining = newNote.ClickAnimationTimeDuration = NoteHitAnimationDuration;
				context.Undo.Execute(new Commands.AddSingleNote(notes, newNote));
				context.SfxVoicePool.PlaySound(SoundEffectTypeForNoteType(noteTypeToInsert));
				return cursorBeat;
			}
		}
		return null;
	}

	/** NOTE: Web port addition, places a don / ka note and then moves the cursor to the next grid line (only while paused) */
	PlaceNoteAndAdvanceCursor(context: ChartContext, noteTypeToInsert: NoteType, fillRangeSelection: boolean): void
	{
		const placedBeat = this.PlaceNote(context, noteTypeToInsert, fillRangeSelection);
		if (placedBeat === null || context.GetIsPlayback() || !Settings.General.TimelineAdvanceCursorAfterPlacingNote)
			return;

		const oldCursorTime = context.GetCursorTime();
		const newCursorBeat = placedBeat + GetGridBeatSnap(this.CurrentGridBarDivision);
		context.SetCursorBeat(newCursorBeat);

		// NOTE: Keep the cursor at the same screen position (same as StepCursorByBeat) so that consecutive notes can be placed without scrolling
		const cursorLocalSpaceXOld = this.Camera.TimeToLocalSpaceX_AtTarget(oldCursorTime);
		if (cursorLocalSpaceXOld >= 0.0 && cursorLocalSpaceXOld <= this.Regions.Content.GetWidth())
		{
			const cursorLocalSpaceX = this.Camera.TimeToLocalSpaceX(context.BeatToTime(newCursorBeat));
			this.Camera.PositionTarget.x += (cursorLocalSpaceX - this.Camera.TimeToLocalSpaceX(oldCursorTime));
		}
	}

	private PlaceLongNoteOnBindingRelease(context: ChartContext, longNoteType: NoteType): void
	{
		const notes = context.ChartSelectedCourse.GetNotes(context.ChartSelectedBranch);
		const minBeat = this.LongNotePlacementGetMin();
		const maxBeat = this.LongNotePlacementGetMax();

		const notesToRemove: Note[] = [];
		for (const existingNote of notes.Sorted)
		{
			if (NoteGetStart(existingNote) <= maxBeat && minBeat <= NoteGetEnd(existingNote))
				notesToRemove.push(existingNote);
		}

		const newLongNote = MakeNote();
		newLongNote.BeatTime = minBeat;
		newLongNote.BeatDuration = (maxBeat - minBeat);
		newLongNote.BalloonPopCount = IsBalloonNote(longNoteType) ? DefaultBalloonPopCount(newLongNote.BeatDuration, this.CurrentGridBarDivision) : 0;
		newLongNote.Type = longNoteType;
		newLongNote.ClickAnimationTimeRemaining = newLongNote.ClickAnimationTimeDuration = NoteHitAnimationDuration;
		context.Undo.Execute(new Commands.AddSingleLongNote(notes, newLongNote, notesToRemove));

		context.SfxVoicePool.PlaySound(SoundEffectTypeForNoteType(longNoteType));
	}

	private UpdateInputAtStartOfFrame(context: ChartContext): void
	{
		const io = Input;
		const dt = io.DeltaTime;
		const camera = this.Camera;
		this.MousePosLastFrame = this.MousePosThisFrame;
		this.MousePosThisFrame = V2(io.MousePos.x, io.MousePos.y);
		const keyAlt = io.KeyAlt || this.External.ForceBigNote;
		const keyShift = io.KeyShift;

		// NOTE: Mouse scroll / zoom
		if (!ApproxmiatelySame(io.MouseWheel, 0.0))
		{
			const scrollStep = V2(io.KeyShift ? Settings.General.TimelineScrollDistancePerMouseWheelTickFast : Settings.General.TimelineScrollDistancePerMouseWheelTick);
			scrollStep.y *= 0.75;
			if (Settings.General.TimelineScrollInvertMouseWheel)
				scrollStep.x *= -1.0;

			if (this.IsSidebarWindowHovered)
			{
				camera.PositionTarget.y -= (io.MouseWheel * scrollStep.y);
			}
			else if (this.IsContentHeaderWindowHovered || this.IsContentWindowHovered)
			{
				if (io.KeyAlt)
				{
					const zoomFactorX = Settings.General.TimelineZoomFactorPerMouseWheelTick;
					const newZoomX = (io.MouseWheel > 0.0) ? (camera.ZoomTarget.x * zoomFactorX) : (camera.ZoomTarget.x / zoomFactorX);
					camera.SetZoomTargetAroundLocalPivot(V2(newZoomX, camera.ZoomTarget.y), this.ScreenToLocalSpace(io.MousePos));
				}
				else
				{
					if (io.KeyCtrl)
						camera.PositionTarget.y -= (io.MouseWheel * scrollStep.y);
					else
						camera.PositionTarget.x += (io.MouseWheel * scrollStep.x);
				}
			}
		}

		// NOTE: Mouse wheel grab scroll
		{
			if (this.IsContentWindowHovered && io.IsMouseClicked(MouseButton.Middle))
				this.IsCameraMouseGrabActive = true;
			else if (this.IsCameraMouseGrabActive && !io.IsMouseDown(MouseButton.Middle))
				this.IsCameraMouseGrabActive = false;

			if (this.IsCameraMouseGrabActive)
			{
				this.SetMouseCursor("grabbing");

				// BUG: Kinda freaks out when mouse grabbing and smooth zooming at the same time
				camera.PositionTarget.x = camera.PositionCurrent.x += (this.MousePosLastFrame.x - this.MousePosThisFrame.x);
				camera.ZoomTarget.x = camera.ZoomCurrent.x;
			}
		}

		// NOTE: Auto playback scroll (needs to be updated before the toggle playback input check is run for better result (?))
		{
			if (context.GetIsPlayback() && Engine.GetIsStreamOpenRunning())
			{
				const cursorTime = context.GetCursorTime();
				if (this.IsTimelineCursorVisibleOnScreen(cursorTime) && camera.TimeToLocalSpaceX(cursorTime) >= Round(this.Regions.Content.GetWidth() * TimelineAutoScrollLockContentWidthFactor))
				{
					const elapsedCursorTime = dt * context.GetPlaybackSpeed();
					const cameraScrollIncrement = camera.TimeToWorldSpaceX(elapsedCursorTime) * camera.ZoomCurrent.x;
					camera.PositionCurrent.x += cameraScrollIncrement;
					camera.PositionTarget.x += cameraScrollIncrement;
				}
			}
		}

		// NOTE: Cursor controls
		{
			// NOTE: Selected items mouse drag
			{
				const selectedCourse = context.ChartSelectedCourse;

				let selectedItemCount = 0, allSelectedItemsAreNotes = true, atLeastOneSelectedItemIsTempoChange = false;
				ForEachSelectedChartItem(selectedCourse, (it) =>
				{
					selectedItemCount++;
					allSelectedItemsAreNotes = allSelectedItemsAreNotes && IsNotesList(it.List);
					atLeastOneSelectedItemIsTempoChange = atLeastOneSelectedItemIsTempoChange || (it.List === GenericList.TempoChanges);
				});

				const drag = this.SelectedItemDrag;
				if (drag.IsActive && !io.IsMouseDown(MouseButton.Left))
					this.SelectedItemDrag = { IsActive: false, IsHovering: false, MouseBeatThisFrame: 0, MouseBeatLastFrame: 0, BeatOnMouseDown: 0, BeatDistanceMovedSoFar: 0 };

				const d = this.SelectedItemDrag;
				d.IsHovering = false;
				d.MouseBeatLastFrame = d.MouseBeatThisFrame;
				d.MouseBeatThisFrame = this.FloorBeatToCurrentGrid(context.TimeToBeat(camera.LocalSpaceXToTime(this.ScreenToLocalSpace(this.MousePosThisFrame).x)));

				if (selectedItemCount > 0 && this.IsContentWindowHovered && !d.IsActive)
				{
					if (this.IsMouseOverSelectedItemHitbox(context, this.MousePosThisFrame))
					{
						d.IsHovering = true;
						if (io.IsMouseClicked(MouseButton.Left))
						{
							d.IsActive = true;
							d.BeatOnMouseDown = d.MouseBeatThisFrame;
							d.BeatDistanceMovedSoFar = 0;
							context.Undo.DisallowMergeForLastCommand();
						}
					}
				}

				if (d.IsActive || d.IsHovering)
					this.SetMouseCursor("ew-resize");

				if (d.IsActive)
				{
					d.BeatDistanceMovedSoFar += (d.MouseBeatThisFrame - d.MouseBeatLastFrame);
					context.Undo.ResetMergeTimeThresholdStopwatch();
				}

				if (d.IsActive)
				{
					const checkCanSelectedItemsBeMoved = (list: GenericList, beatIncrement: Beat): boolean =>
					{
						const sorted = GetGenericList(selectedCourse, list).Sorted;
						const listCount = sorted.length;
						if (listCount <= 0)
							return true;

						const itemDuration = (i: number) => (list === GenericList.GoGoRanges || IsNotesList(list)) ? (sorted[i].BeatDuration ?? 0) : 0;

						// BUG: It's possible to move two non-empty lyric changes on top of each other, which isn't a critical bug (as it's still handled correctly)
						//		but definitely annoying and a bit confusing
						// TODO: Rework LyricChange to be Beat+Duration based to avoid the problem all together and also simplify the rest of the code
						const inclusiveBeatCheck = ListUsesInclusiveBeatCheck(list);
						if (beatIncrement > 0)
						{
							for (let thisIndex = 0; thisIndex < listCount; thisIndex++)
							{
								const nextIndex = thisIndex + 1;
								const hasNext = (nextIndex < listCount);
								if (sorted[thisIndex].IsSelected && hasNext && !sorted[nextIndex].IsSelected)
								{
									const thisEnd = sorted[thisIndex].BeatTime + itemDuration(thisIndex);
									const nextStart = sorted[nextIndex].BeatTime;
									if (inclusiveBeatCheck) { if (thisEnd + beatIncrement >= nextStart) return false; }
									else { if (thisEnd + beatIncrement > nextStart) return false; }
								}
							}
						}
						else
						{
							for (let thisIndex = (listCount - 1); thisIndex >= 0; thisIndex--)
							{
								const prevIndex = thisIndex - 1;
								const hasPrev = (prevIndex >= 0);
								if (sorted[thisIndex].IsSelected)
								{
									const thisStart = sorted[thisIndex].BeatTime;
									if (thisStart + beatIncrement < 0)
										return false;

									if (hasPrev && !sorted[prevIndex].IsSelected)
									{
										const prevEnd = sorted[prevIndex].BeatTime + itemDuration(prevIndex);
										if (inclusiveBeatCheck) { if (thisStart + beatIncrement <= prevEnd) return false; }
										else { if (thisStart + beatIncrement < prevEnd) return false; }
									}
								}
							}
						}
						return true;
					};

					const cursorBeat = context.GetCursorBeat();
					const dragBeatIncrement = this.FloorBeatToCurrentGrid(d.BeatDistanceMovedSoFar);

					// BUG: Doesn't account for smooth scroll delay and playback auto scrolling
					const wasMouseMovedOrScrolled = (!ApproxmiatelySame(io.MouseDelta.x, 0.0) || !ApproxmiatelySame(io.MouseWheel, 0.0));

					if (dragBeatIncrement !== 0 && wasMouseMovedOrScrolled)
					{
						let allItemsCanBeMoved = true;
						for (let list = 0; list < GenericList.Count; list++)
							allItemsCanBeMoved = checkCanSelectedItemsBeMoved(list, dragBeatIncrement) && allItemsCanBeMoved;

						if (allItemsCanBeMoved)
						{
							d.BeatDistanceMovedSoFar -= dragBeatIncrement;

							const notes = selectedCourse.GetNotes(context.ChartSelectedBranch);
							if (allSelectedItemsAreNotes)
							{
								const noteBeatsToChange: Commands.ChangeMultipleNoteBeatsData[] = [];
								notes.Sorted.forEach((note, index) => { if (note.IsSelected) noteBeatsToChange.push({ Index: index, NewBeat: note.BeatTime + dragBeatIncrement }); });
								context.Undo.Execute(new Commands.ChangeMultipleNoteBeats_MoveNotes(notes, noteBeatsToChange));
							}
							else
							{
								const itemsToChange: Commands.ChangeMultipleGenericPropertiesData[] = [];
								ForEachSelectedChartItem(selectedCourse, (it) =>
								{
									itemsToChange.push({ Index: it.Index, List: it.List, Member: GenericMember.Beat_Start, NewValue: ChartItemGetBeat(selectedCourse, it) + dragBeatIncrement });
								});
								context.Undo.Execute(new Commands.ChangeMultipleGenericProperties_MoveItems(selectedCourse, itemsToChange));
							}

							for (const note of notes.Sorted)
								if (note.IsSelected) { if (note.BeatTime === cursorBeat) this.PlayNoteSoundAndHitAnimationsAtBeat(context, note.BeatTime); }

							// NOTE: Set again to account for a changes in cursor time
							if (atLeastOneSelectedItemIsTempoChange)
								context.SetCursorBeat(cursorBeat);
						}
					}
				}
			}

			if (this.IsContentWindowHovered && !this.SelectedItemDrag.IsHovering && io.IsMouseClicked(MouseButton.Left))
			{
				const timeAtMouseX = camera.LocalSpaceXToTime(this.ScreenToLocalSpace(this.MousePosThisFrame).x);
				const newCursorBeat = this.FloorBeatToCurrentGrid(context.TimeToBeat(timeAtMouseX));

				context.SetCursorBeat(newCursorBeat);
				this.PlayNoteSoundAndHitAnimationsAtBeat(context, newCursorBeat);

				if (context.GetIsPlayback())
				{
					const newCursorTime = context.BeatToTime(newCursorBeat);
					const localCursorX = camera.TimeToLocalSpaceX(newCursorTime);
					const localAutoScrollLockX = Round(this.Regions.Content.GetWidth() * TimelineAutoScrollLockContentWidthFactor);

					const distanceFromAutoScrollPositionX = (localCursorX - localAutoScrollLockX);
					if (distanceFromAutoScrollPositionX > 0.0)
						camera.PositionTarget.x += distanceFromAutoScrollPositionX;
				}
			}

			// NOTE: Header bar cursor scrubbing
			{
				if (this.IsContentHeaderWindowHovered && !this.SelectedItemDrag.IsHovering && io.IsMouseClicked(MouseButton.Left))
					this.IsCursorMouseScrubActive = true;

				if (!io.IsMouseDown(MouseButton.Left) || !io.MousePosValid)
					this.IsCursorMouseScrubActive = false;

				if (this.IsCursorMouseScrubActive)
				{
					const mouseLocalSpaceX = this.ScreenToLocalSpace(this.MousePosThisFrame).x;
					const mouseCursorTime = camera.LocalSpaceXToTime(mouseLocalSpaceX);
					const oldCursorBeat = context.GetCursorBeat();
					const newCursorBeat = context.TimeToBeat(mouseCursorTime);

					const threshold = ClampBot(GuiScale(Settings.General.TimelineScrubAutoScrollPixelThreshold), 1.0);
					const speedMin = Settings.General.TimelineScrubAutoScrollSpeedMin, speedMax = Settings.General.TimelineScrubAutoScrollSpeedMax;

					const modifier = io.KeyAlt ? 0.25 : io.KeyShift ? 2.0 : 1.0;
					if (mouseLocalSpaceX < threshold)
					{
						const scrollIncrementThisFrame = ConvertRange(threshold, 0.0, speedMin, speedMax, mouseLocalSpaceX) * modifier * dt;
						if (Settings.General.TimelineScrubAutoScrollEnableClamp)
						{
							const minScrollX = TimelineCameraBaseScrollX;
							camera.PositionCurrent.x = ClampBot(camera.PositionCurrent.x - scrollIncrementThisFrame, ClampTop(camera.PositionCurrent.x, minScrollX));
							camera.PositionTarget.x = ClampBot(camera.PositionTarget.x - scrollIncrementThisFrame, ClampTop(camera.PositionTarget.x, minScrollX));
						}
						else
						{
							camera.PositionCurrent.x -= scrollIncrementThisFrame;
							camera.PositionTarget.x -= scrollIncrementThisFrame;
						}
					}
					const right = (this.Regions.ContentHeader.GetWidth() - threshold);
					if (mouseLocalSpaceX >= right)
					{
						const scrollIncrementThisFrame = ConvertRange(0.0, threshold, speedMin, speedMax, mouseLocalSpaceX - right) * modifier * dt;
						if (Settings.General.TimelineScrubAutoScrollEnableClamp)
						{
							const maxScrollX = camera.WorldToLocalSpaceScaleX(camera.TimeToWorldSpaceX(context.Chart.GetDurationOrDefault())) - this.Regions.ContentHeader.GetWidth() + 1.0;
							camera.PositionCurrent.x = ClampTop(camera.PositionCurrent.x + scrollIncrementThisFrame, ClampBot(camera.PositionCurrent.x, maxScrollX));
							camera.PositionTarget.x = ClampTop(camera.PositionTarget.x + scrollIncrementThisFrame, ClampBot(camera.PositionTarget.x, maxScrollX));
						}
						else
						{
							camera.PositionCurrent.x += scrollIncrementThisFrame;
							camera.PositionTarget.x += scrollIncrementThisFrame;
						}
					}

					if (newCursorBeat !== oldCursorBeat)
					{
						context.SetCursorBeat(newCursorBeat);
						this.WorldSpaceCursorXAnimationCurrent = camera.LocalToWorldSpace(V2(mouseLocalSpaceX, 0.0)).x;
						if (this.MousePosThisFrame.x !== this.MousePosLastFrame.x) this.PlayNoteSoundAndHitAnimationsAtBeat(context, newCursorBeat);
					}
				}
			}

			if (this.HasKeyboardFocus())
			{
				const input = Settings.Input;
				if (!this.IsActiveID())
				{
					if (io.IsAnyPressed(input.Timeline_Cut, false)) void this.ExecuteClipboardAction(context, ClipboardAction.Cut);
					if (io.IsAnyPressed(input.Timeline_Copy, false)) void this.ExecuteClipboardAction(context, ClipboardAction.Copy);
					if (io.IsAnyPressed(input.Timeline_Paste, false)) void this.ExecuteClipboardAction(context, ClipboardAction.Paste);
					if (io.IsAnyPressed(input.Timeline_DeleteSelection, false)) void this.ExecuteClipboardAction(context, ClipboardAction.Delete);

					if (io.IsAnyPressed(input.Timeline_SelectAll, false)) this.ExecuteSelectionAction(context, SelectionAction.SelectAll, {});
					if (io.IsAnyPressed(input.Timeline_ClearSelection, false)) this.ExecuteSelectionAction(context, SelectionAction.UnselectAll, {});
					if (io.IsAnyPressed(input.Timeline_InvertSelection, false)) this.ExecuteSelectionAction(context, SelectionAction.InvertAll, {});
					if (io.IsAnyPressed(input.Timeline_SelectAllWithinRangeSelection, false)) this.ExecuteSelectionAction(context, SelectionAction.SelectAllWithinRangeSelection, {});
					if (io.IsAnyPressed(input.Timeline_ShiftSelectionLeft, true)) this.ExecuteSelectionAction(context, SelectionAction.PerRowShiftSelected, { ShiftDelta: -1 });
					if (io.IsAnyPressed(input.Timeline_ShiftSelectionRight, true)) this.ExecuteSelectionAction(context, SelectionAction.PerRowShiftSelected, { ShiftDelta: +1 });
					if (io.IsAnyPressed(input.Timeline_SelectItemPattern_xo, false)) this.ExecuteSelectionAction(context, SelectionAction.PerRowSelectPattern, { Pattern: "xo" });
					if (io.IsAnyPressed(input.Timeline_SelectItemPattern_xoo, false)) this.ExecuteSelectionAction(context, SelectionAction.PerRowSelectPattern, { Pattern: "xoo" });
					if (io.IsAnyPressed(input.Timeline_SelectItemPattern_xooo, false)) this.ExecuteSelectionAction(context, SelectionAction.PerRowSelectPattern, { Pattern: "xooo" });
					if (io.IsAnyPressed(input.Timeline_SelectItemPattern_xxoo, false)) this.ExecuteSelectionAction(context, SelectionAction.PerRowSelectPattern, { Pattern: "xxoo" });

					const customBindings: MultiInputBinding[] =
					[
						input.Timeline_SelectItemPattern_CustomA, input.Timeline_SelectItemPattern_CustomB, input.Timeline_SelectItemPattern_CustomC,
						input.Timeline_SelectItemPattern_CustomD, input.Timeline_SelectItemPattern_CustomE, input.Timeline_SelectItemPattern_CustomF,
					];
					for (let i = 0; i < customBindings.length; i++)
					{
						if (i < Settings.General.CustomSelectionPatterns.V.length && io.IsAnyPressed(customBindings[i], false))
							this.ExecuteSelectionAction(context, SelectionAction.PerRowSelectPattern, { Pattern: Settings.General.CustomSelectionPatterns.V[i] });
					}

					if (io.IsAnyPressed(input.Timeline_ConvertSelectionToScrollChanges, false)) this.ExecuteConvertSelectionToScrollChanges(context);
				}

				if (!io.KeyCtrl)
				{
					// TODO: Maybe refine further...
					const cursorStepKeyDistance = context.GetIsPlayback() ?
						(io.KeyAlt ? GetGridBeatSnap(this.CurrentGridBarDivision) : io.KeyShift ? BeatFromBeats(2) : BeatFromBeats(1)) :
						(io.KeyShift ? BeatFromBeats(1) : GetGridBeatSnap(this.CurrentGridBarDivision));

					// NOTE: Separate down checks for right priority, although ideally the *last held* binding should probably be prioritized instead (which would be a bit tricky)
					if (io.IsAnyDown(input.Timeline_StepCursorRight, InputModifierBehavior.Relaxed))
					{
						if (io.IsAnyPressed(input.Timeline_StepCursorRight, true, InputModifierBehavior.Relaxed)) { this.StepCursorByBeat(context, cursorStepKeyDistance * +1); }
					}
					else if (io.IsAnyDown(input.Timeline_StepCursorLeft, InputModifierBehavior.Relaxed))
					{
						if (io.IsAnyPressed(input.Timeline_StepCursorLeft, true, InputModifierBehavior.Relaxed)) { this.StepCursorByBeat(context, cursorStepKeyDistance * -1); }
					}
				}

				if (io.IsAnyPressed(input.Timeline_JumpToTimelineStart, false)) this.ScrollToTimelinePosition(context, 0.0);
				if (io.IsAnyPressed(input.Timeline_JumpToTimelineEnd, false)) this.ScrollToTimelinePosition(context, 1.0);
				if (io.IsAnyPressed(input.Timeline_StartEndRangeSelection, false)) this.StartEndRangeSelectionAtCursor(context);
			}

			// NOTE: Grid snap controls
			if (this.IsContentWindowHovered || this.HasKeyboardFocus())
			{
				const keyboardFocus = this.HasKeyboardFocus() && !io.KeyCtrl;
				const increaseGrid = (this.IsContentWindowHovered && io.IsMouseClicked(MouseButton.X2)) || (keyboardFocus && io.IsAnyPressed(Settings.Input.Timeline_IncreaseGridDivision, true, InputModifierBehavior.Relaxed));
				const decreaseGrid = (this.IsContentWindowHovered && io.IsMouseClicked(MouseButton.X1)) || (keyboardFocus && io.IsAnyPressed(Settings.Input.Timeline_DecreaseGridDivision, true, InputModifierBehavior.Relaxed));
				if (increaseGrid) this.ChangeGridDivision(+1);
				if (decreaseGrid) this.ChangeGridDivision(-1);
			}
			if (this.HasKeyboardFocus())
			{
				const input = Settings.Input;
				const allBindings: [MultiInputBinding, number][] =
				[
					[input.Timeline_SetGridDivision_1_4, 4], [input.Timeline_SetGridDivision_1_8, 8], [input.Timeline_SetGridDivision_1_12, 12],
					[input.Timeline_SetGridDivision_1_16, 16], [input.Timeline_SetGridDivision_1_24, 24], [input.Timeline_SetGridDivision_1_32, 32],
					[input.Timeline_SetGridDivision_1_48, 48], [input.Timeline_SetGridDivision_1_64, 64], [input.Timeline_SetGridDivision_1_96, 96],
					[input.Timeline_SetGridDivision_1_192, 192],
				];
				for (const [binding, barDivision] of allBindings)
					if (io.IsAnyPressed(binding, false))
						this.CurrentGridBarDivision = barDivision;
			}

			// NOTE: Playback speed controls
			if (this.HasKeyboardFocus())
			{
				if (!io.KeyCtrl)
				{
					const speeds = io.KeyAlt ? Settings.General.PlaybackSpeedStepsPrecise.V : io.KeyShift ? Settings.General.PlaybackSpeedStepsRough.V : Settings.General.PlaybackSpeedSteps.V;
					if (io.IsAnyPressed(Settings.Input.Timeline_IncreasePlaybackSpeed, true, InputModifierBehavior.Relaxed)) this.ChangePlaybackSpeedStep(context, -1, speeds);
					if (io.IsAnyPressed(Settings.Input.Timeline_DecreasePlaybackSpeed, true, InputModifierBehavior.Relaxed)) this.ChangePlaybackSpeedStep(context, +1, speeds);
				}

				if (io.IsAnyPressed(Settings.Input.Timeline_SetPlaybackSpeed_100, false)) context.SetPlaybackSpeed(FromPercent(100.0));
				if (io.IsAnyPressed(Settings.Input.Timeline_SetPlaybackSpeed_75, false)) context.SetPlaybackSpeed(FromPercent(75.0));
				if (io.IsAnyPressed(Settings.Input.Timeline_SetPlaybackSpeed_50, false)) context.SetPlaybackSpeed(FromPercent(50.0));
				if (io.IsAnyPressed(Settings.Input.Timeline_SetPlaybackSpeed_25, false)) context.SetPlaybackSpeed(FromPercent(25.0));
			}

			if (this.HasKeyboardFocus() && io.IsAnyPressed(Settings.Input.Timeline_TogglePlayback, false, InputModifierBehavior.Relaxed))
				this.TogglePlayback(context);

			const updateNotePlacementBinding = (inputBinding: MultiInputBinding, noteTypeToInsert: NoteType) =>
			{
				if (io.IsAnyPressed(inputBinding, false, InputModifierBehavior.Relaxed))
					this.PlaceNoteAndAdvanceCursor(context, noteTypeToInsert, keyShift || this.External.ForceRangeFill);
			};

			this.PlaceBalloonBindingDownLastFrame = this.PlaceBalloonBindingDownThisFrame;
			this.PlaceBalloonBindingDownThisFrame = (this.HasKeyboardFocus() && io.IsAnyDown(Settings.Input.Timeline_PlaceNoteBalloon, InputModifierBehavior.Relaxed)) || this.External.PlaceBalloonDown;
			this.PlaceDrumrollBindingDownLastFrame = this.PlaceDrumrollBindingDownThisFrame;
			this.PlaceDrumrollBindingDownThisFrame = (this.HasKeyboardFocus() && io.IsAnyDown(Settings.Input.Timeline_PlaceNoteDrumroll, InputModifierBehavior.Relaxed)) || this.External.PlaceDrumrollDown;
			// NOTE: The external (on-screen) long note toggles are treated as if the timeline had keyboard focus, including the frame they get released
			const externalLongNoteDown = this.External.PlaceBalloonDown || this.External.PlaceDrumrollDown;
			const hasLongNoteFocus = this.HasKeyboardFocus() || externalLongNoteDown || this.ExternalLongNoteDownLastFrame;
			this.ExternalLongNoteDownLastFrame = externalLongNoteDown;
			if (hasLongNoteFocus)
			{
				if (this.HasKeyboardFocus())
				{
					updateNotePlacementBinding(Settings.Input.Timeline_PlaceNoteDon, ToBigNoteIf(NoteType.Don, keyAlt));
					updateNotePlacementBinding(Settings.Input.Timeline_PlaceNoteKa, ToBigNoteIf(NoteType.Ka, keyAlt));
				}

				if (this.PlaceBalloonBindingDownThisFrame || this.PlaceDrumrollBindingDownThisFrame)
				{
					const cursorBeat = context.GetIsPlayback() ? this.RoundBeatToCurrentGrid(context.GetCursorBeat()) : this.FloorBeatToCurrentGrid(context.GetCursorBeat());
					this.LongNotePlacement.NoteType = ToBigNoteIf(this.PlaceBalloonBindingDownThisFrame ? NoteType.Balloon : NoteType.Drumroll, keyAlt);
					if (!this.LongNotePlacement.IsActive)
					{
						this.LongNotePlacement.IsActive = true;
						this.LongNotePlacement.CursorBeatHead = cursorBeat;
						context.SfxVoicePool.PlaySound(SoundEffectTypeForNoteType(this.LongNotePlacement.NoteType));
					}
					this.LongNotePlacement.CursorBeatTail = cursorBeat;
				}
			}
			else
			{
				this.LongNotePlacement = { IsActive: false, CursorBeatHead: 0, CursorBeatTail: 0, NoteType: NoteType.Drumroll };
			}

			const activeFocusedAndHasLength = hasLongNoteFocus && this.LongNotePlacement.IsActive && (this.LongNotePlacement.CursorBeatHead !== this.LongNotePlacement.CursorBeatTail);
			const resetLongNotePlacement = () => { this.LongNotePlacement = { IsActive: false, CursorBeatHead: 0, CursorBeatTail: 0, NoteType: NoteType.Drumroll }; };
			if (this.PlaceBalloonBindingDownLastFrame && !this.PlaceBalloonBindingDownThisFrame) { if (activeFocusedAndHasLength) this.PlaceLongNoteOnBindingRelease(context, this.LongNotePlacement.NoteType); resetLongNotePlacement(); }
			if (this.PlaceDrumrollBindingDownLastFrame && !this.PlaceDrumrollBindingDownThisFrame) { if (activeFocusedAndHasLength) this.PlaceLongNoteOnBindingRelease(context, this.LongNotePlacement.NoteType); resetLongNotePlacement(); }

			if (this.HasKeyboardFocus())
			{
				const input = Settings.Input;
				if (io.IsAnyPressed(input.Timeline_FlipNoteType, false)) this.ExecuteTransformAction(context, TransformAction.FlipNoteType, {});
				if (io.IsAnyPressed(input.Timeline_ToggleNoteSize, false)) this.ExecuteTransformAction(context, TransformAction.ToggleNoteSize, {});
				if (io.IsAnyPressed(input.Timeline_ExpandItemTime_2To1, false)) this.ExecuteTransformAction(context, TransformAction.ScaleItemTime, { TimeRatio: [2, 1] });
				if (io.IsAnyPressed(input.Timeline_ExpandItemTime_3To2, false)) this.ExecuteTransformAction(context, TransformAction.ScaleItemTime, { TimeRatio: [3, 2] });
				if (io.IsAnyPressed(input.Timeline_ExpandItemTime_4To3, false)) this.ExecuteTransformAction(context, TransformAction.ScaleItemTime, { TimeRatio: [4, 3] });
				if (io.IsAnyPressed(input.Timeline_CompressItemTime_1To2, false)) this.ExecuteTransformAction(context, TransformAction.ScaleItemTime, { TimeRatio: [1, 2] });
				if (io.IsAnyPressed(input.Timeline_CompressItemTime_2To3, false)) this.ExecuteTransformAction(context, TransformAction.ScaleItemTime, { TimeRatio: [2, 3] });
				if (io.IsAnyPressed(input.Timeline_CompressItemTime_3To4, false)) this.ExecuteTransformAction(context, TransformAction.ScaleItemTime, { TimeRatio: [3, 4] });
			}
		}

		if (this.HasKeyboardFocus() && io.IsAnyPressed(Settings.Input.Timeline_ToggleMetronome, true))
			this.ToggleMetronome(context);

		// NOTE: Playback preview sounds / metronome
		if (context.GetIsPlayback() && (this.PlaybackSoundsEnabled || this.Metronome.IsEnabled))
			this.UpdateTimelinePlaybackAndMetronomneSounds(context, this.PlaybackSoundsEnabled);

		// NOTE: Mouse selection box
		{
			const getBoxSelectionAction = (): BoxSelectionAction =>
			{
				const shift = io.KeyShift, alt = io.KeyAlt;
				return (shift && alt) ? BoxSelectionAction.XOR : shift ? BoxSelectionAction.Add : alt ? BoxSelectionAction.Sub : BoxSelectionAction.Clear;
			};

			const box = this.BoxSelection;
			if (this.IsContentWindowHovered && io.IsMouseClicked(MouseButton.Right))
			{
				box.IsActive = true;
				box.Action = getBoxSelectionAction();
				const world = camera.LocalToWorldSpace(this.ScreenToLocalSpace(io.MousePos));
				box.WorldSpaceRect = new Rect(V2(world.x, world.y), V2(world.x, world.y));
			}
			else if (box.IsActive && io.IsMouseDown(MouseButton.Right))
			{
				box.WorldSpaceRect.BR = camera.LocalToWorldSpace(this.ScreenToLocalSpace(io.MousePos));
				box.Action = getBoxSelectionAction();
				this.RangeSelection = { Start: 0, End: 0, HasEnd: false, IsActive: false };
			}
			else
			{
				if (box.IsActive)
					box.Action = getBoxSelectionAction();

				if (box.IsActive && io.IsMouseReleased(MouseButton.Right))
				{
					const minBoxSizeThreshold = 4.0;
					const screenSpaceRect = new Rect(camera.WorldToLocalSpace(box.WorldSpaceRect.TL), camera.WorldToLocalSpace(box.WorldSpaceRect.BR));
					if (Math.abs(screenSpaceRect.GetWidth()) >= minBoxSizeThreshold && Math.abs(screenSpaceRect.GetHeight()) >= minBoxSizeThreshold)
					{
						const screenSelectionMin = this.LocalToScreenSpace(camera.WorldToLocalSpace(box.WorldSpaceRect.GetMin()));
						const screenSelectionMax = this.LocalToScreenSpace(camera.WorldToLocalSpace(box.WorldSpaceRect.GetMax()));
						const selectionBeatMin = context.TimeToBeat(camera.WorldSpaceXToTime(box.WorldSpaceRect.GetMin().x));
						const selectionBeatMax = context.TimeToBeat(camera.WorldSpaceXToTime(box.WorldSpaceRect.GetMax().x));
						const course = context.ChartSelectedCourse;

						this.ForEachTimelineRow((rowIt) =>
						{
							const list = TimelineRowToGenericList(rowIt.RowType);
							const isNotesRow = IsNotesList(list);

							const isFullRowTest = (list === GenericList.GoGoRanges || list === GenericList.Lyrics);
							const screenRowRect = new Rect(this.LocalToScreenSpace(V2(0.0, rowIt.LocalY)), this.LocalToScreenSpace(V2(this.Regions.Content.GetWidth(), rowIt.LocalY + rowIt.LocalHeight)));
							const screenMinY = !isFullRowTest ? screenRowRect.GetCenter().y : screenRowRect.TL.y;
							const screenMaxY = !isFullRowTest ? screenRowRect.GetCenter().y : screenRowRect.BR.y;

							const sorted = GetGenericList(course, list).Sorted;
							for (let i = 0; i < sorted.length; i++)
							{
								const item = sorted[i];
								const beatMin = item.BeatTime;
								const hasBeatDuration = (list === GenericList.GoGoRanges || isNotesRow);
								const beatMax = (hasBeatDuration && !isNotesRow) ? (item.BeatTime + (item.BeatDuration ?? 0)) : item.BeatTime;
								const isInsideSelectionBox = (beatMin <= selectionBeatMax) && (beatMax >= selectionBeatMin) && (screenMinY <= screenSelectionMax.y) && (screenMaxY >= screenSelectionMin.y);

								switch (box.Action)
								{
									case BoxSelectionAction.Clear: { item.IsSelected = isInsideSelectionBox; } break;
									case BoxSelectionAction.Add: { if (isInsideSelectionBox) item.IsSelected = true; } break;
									case BoxSelectionAction.Sub: { if (isInsideSelectionBox) item.IsSelected = false; } break;
									case BoxSelectionAction.XOR: { item.IsSelected = (item.IsSelected !== isInsideSelectionBox); } break;
								}
							}
						});
					}
				}

				box.IsActive = false;
				box.WorldSpaceRect = new Rect();
			}

			// TODO: Animate notes when including them in selection box (?)
			if (box.IsActive)
			{
				// NOTE: Auto scroll timeline if selection offscreen and mouse moved (similar to how it works in reaper)
				if ((this.MousePosThisFrame.x < this.Regions.Content.TL.x) || (this.MousePosThisFrame.x > this.Regions.Content.BR.x))
				{
					const mouseDelta = V2(this.MousePosLastFrame.x - this.MousePosThisFrame.x, this.MousePosLastFrame.y - this.MousePosThisFrame.y);
					if (!ApproxmiatelySame(mouseDelta.x, 0.0) || !ApproxmiatelySame(mouseDelta.y, 0.0))
					{
						// TODO: Make global setting and adjust default value
						const scrollSpeed = 3.0;

						// NOTE: Using the max axis feels more natural than the vector length
						const mouseDistanceMoved = Math.max(Math.abs(mouseDelta.x), Math.abs(mouseDelta.y));
						const scrollDirection = (this.MousePosThisFrame.x < this.Regions.Content.TL.x) ? -1.0 : +1.0;
						camera.PositionTarget.x = ClampBot(Math.min(TimelineCameraBaseScrollX, camera.PositionTarget.x), camera.PositionTarget.x + (scrollDirection * mouseDistanceMoved * scrollSpeed));
					}
				}
			}
		}
	}

	ToggleMetronome(context: ChartContext): void
	{
		this.Metronome.IsEnabled = !this.Metronome.IsEnabled;
		if (!context.GetIsPlayback())
			context.SfxVoicePool.PlaySound(SoundEffectType.MetronomeBeat);
	}

	/** NOTE: Extracted from the "Selected items mouse drag" hover test, also used by the touch controls */
	IsMouseOverSelectedItemHitbox(context: ChartContext, screenPos: vec2): boolean
	{
		const selectedCourse = context.ChartSelectedCourse;
		let isOver = false;
		this.ForEachTimelineRow((rowIt) =>
		{
			if (isOver) return;
			const list = TimelineRowToGenericList(rowIt.RowType);
			const isNotesRow = IsNotesList(list);
			const screenRowRect = new Rect(this.LocalToScreenSpace(V2(0.0, rowIt.LocalY)), this.LocalToScreenSpace(V2(this.Regions.Content.GetWidth(), rowIt.LocalY + rowIt.LocalHeight)));
			const screenRectCenterY = screenRowRect.GetCenter().y;
			const sorted = GetGenericList(selectedCourse, list).Sorted;
			const visible = this.GetMinMaxVisibleTime(this.Camera.TimePerScreenPixel() * GuiScale(TimelineSelectedNoteHitBoxSizeBig));
			for (const item of sorted)
			{
				if (!item.IsSelected)
					continue;
				const itemTime = context.BeatToTime(item.BeatTime);
				if (itemTime < visible.Min || itemTime > visible.Max)
					continue;
				const centerX = this.LocalToScreenSpace(V2(this.Camera.TimeToLocalSpaceX(itemTime), 0.0)).x;
				// TODO: Proper hitboxses (at least for gogo range and lyrics?)
				const hitBoxSize = (isNotesRow && IsBigNote((item as Note).Type)) ? TimelineSelectedNoteHitBoxSizeBig : TimelineSelectedNoteHitBoxSizeSmall;
				const screenHitbox = Rect.FromCenterSize(V2(centerX, screenRectCenterY), V2(GuiScale(hitBoxSize)));
				if (screenHitbox.Contains(screenPos)) { isOver = true; return; }
			}
		});
		return isOver;
	}

	private UpdateAllAnimationsAfterUserInput(context: ChartContext): void
	{
		const dt = Input.DeltaTime;

		// BUG: Freaks out when zoomed in too far / the timeline is too long (16min song for example) float precision issue (?)
		this.ClampCameraScrollY();
		this.Camera.UpdateAnimations(dt);
		context.SongWaveformFadeAnimationCurrent = AnimateExponentialF32(context.SongWaveformFadeAnimationCurrent, context.SongWaveformFadeAnimationTarget, Settings.Animation.TimelineWaveformFadeSpeed, dt);
		this.RangeSelectionExpansionAnimationCurrent = AnimateExponentialF32(this.RangeSelectionExpansionAnimationCurrent, this.RangeSelectionExpansionAnimationTarget, Settings.Animation.TimelineRangeSelectionExpansionSpeed, dt);

		const worldSpaceCursorXAnimationTarget = this.Camera.TimeToWorldSpaceX(context.GetCursorTime());
		this.WorldSpaceCursorXAnimationCurrent = AnimateExponentialF32(this.WorldSpaceCursorXAnimationCurrent, worldSpaceCursorXAnimationTarget, Settings.Animation.TimelineWorldSpaceCursorXSpeed, dt);

		for (const course of context.Chart.Courses)
		{
			for (let branch = 0; branch < BranchType.Count; branch++)
			{
				for (const note of course.GetNotes(branch).Sorted)
					if (note.ClickAnimationTimeRemaining > 0.0)
						note.ClickAnimationTimeRemaining = ClampBot(note.ClickAnimationTimeRemaining - dt, 0.0);
			}

			for (const gogo of course.GoGoRanges.Sorted)
				gogo.ExpansionAnimationCurrent = AnimateExponentialF32(gogo.ExpansionAnimationCurrent, gogo.ExpansionAnimationTarget, Settings.Animation.TimelineGoGoRangeExpansionSpeed, dt);
		}

		if (this.TempDeletedNoteAnimationsBuffer.length > 0)
		{
			for (const data of this.TempDeletedNoteAnimationsBuffer)
				data.ElapsedTimeSec += dt;
			this.TempDeletedNoteAnimationsBuffer = this.TempDeletedNoteAnimationsBuffer.filter((v) => (v.ElapsedTimeSec < NoteDeleteAnimationDuration));
		}

		const maxZoomLevelAtWhichToFadeOutGridBeatSnapLines = 0.5;
		const gridBeatSnapLineAnimationTarget = (this.Camera.ZoomCurrent.x <= maxZoomLevelAtWhichToFadeOutGridBeatSnapLines) ? 0.0 : 1.0;
		this.GridSnapLineAnimationCurrent = Clamp(AnimateExponentialF32(this.GridSnapLineAnimationCurrent, gridBeatSnapLineAnimationTarget, Settings.Animation.TimelineGridSnapLineSpeed, dt), 0.0, 1.0);
	}

	// NOTE: Equivalent of the Gui::ScrollbarEx() call
	private GetScrollbarMetrics(context: ChartContext): { GrabMinX: number; GrabWidth: number; TrackWidth: number; ScrollMax: number; Scroll: number }
	{
		const localSpaceVisibleWidth = this.Regions.Content.GetWidth();
		const localSpaceTimelineWidth = this.Camera.WorldToLocalSpaceScaleX(this.Camera.TimeToWorldSpaceX(context.Chart.GetDurationOrDefault())) + 2.0;
		const sizeAvail = Math.trunc(localSpaceVisibleWidth + TimelineCameraBaseScrollX);
		const contentSize = Math.max(Math.trunc(localSpaceTimelineWidth), sizeAvail, 1);
		const trackWidth = this.Regions.ContentScrollbarX.GetWidth();
		const scrollMax = Math.max(1, contentSize - sizeAvail);
		const grabWidth = Clamp(trackWidth * (sizeAvail / contentSize), GuiScale(14.0), trackWidth);
		const scroll = Clamp(this.Camera.PositionCurrent.x - TimelineCameraBaseScrollX, 0, scrollMax);
		const grabMinX = this.Regions.ContentScrollbarX.TL.x + (trackWidth - grabWidth) * (scroll / scrollMax);
		return { GrabMinX: grabMinX, GrabWidth: grabWidth, TrackWidth: trackWidth, ScrollMax: scrollMax, Scroll: scroll };
	}

	private UpdateScrollbarInput(context: ChartContext): void
	{
		const io = Input;
		const metrics = this.GetScrollbarMetrics(context);
		const setScrollFromGrabX = (grabMinX: number) =>
		{
			const t = Clamp((grabMinX - this.Regions.ContentScrollbarX.TL.x) / Math.max(1.0, metrics.TrackWidth - metrics.GrabWidth), 0.0, 1.0);
			const scroll = Math.trunc(t * metrics.ScrollMax);
			// BUG: Only setting PositionTarget results in glitchy behavior when clicking somewhere on the scrollbar for shorter than the animation duration
			//		however setting both PositionCurrent and PositionTarget means no smooth scrolling while dragging around
			this.Camera.PositionCurrent.x = this.Camera.PositionTarget.x = scroll + TimelineCameraBaseScrollX;
		};

		// BUG: Scrollbar should still be interactable while box selecting
		if (this.IsScrollbarHovered && io.IsMouseClicked(MouseButton.Left) && !this.BoxSelection.IsActive)
		{
			const mouseX = io.MousePos.x;
			this.ScrollbarDrag.IsActive = true;
			if (mouseX >= metrics.GrabMinX && mouseX <= metrics.GrabMinX + metrics.GrabWidth)
				this.ScrollbarDrag.GrabOffset = mouseX - metrics.GrabMinX;
			else
			{
				this.ScrollbarDrag.GrabOffset = metrics.GrabWidth * 0.5;
				setScrollFromGrabX(mouseX - this.ScrollbarDrag.GrabOffset);
			}
		}

		if (this.ScrollbarDrag.IsActive)
		{
			if (!io.IsMouseDown(MouseButton.Left))
				this.ScrollbarDrag.IsActive = false;
			else if (!ApproxmiatelySame(io.MouseDelta.x, 0.0))
				setScrollFromGrabX(io.MousePos.x - this.ScrollbarDrag.GrabOffset);
		}
	}

	private DrawAllAtEndOfFrame(context: ChartContext): void
	{
		const ctx = this.Ctx!;
		const d = this.Draw;
		const R = this.Regions;
		const camera = this.Camera;

		ctx.setTransform(this.DevicePixelRatio, 0, 0, this.DevicePixelRatio, 0, 0);
		d.Begin(ctx);

		if (!context.Gfx.IsAsyncLoading())
			context.Gfx.Rasterize(SprGroup.Timeline, GuiScaleState.Target * this.DevicePixelRatio);

		const isPlayback = context.GetIsPlayback();
		const cursorBeatAndTime = context.GetCursorBeatAndTime();
		const cursorTime = cursorBeatAndTime.Time;
		const cursorBeatOnPlaybackStart = context.TimeToBeat(context.CursorTimeOnPlaybackStart);
		const dt = Input.DeltaTime;

		// NOTE: Window background and region borders (the original child window borders)
		ctx.fillStyle = "#1f1f1f";
		ctx.fillRect(0, 0, this.CanvasCSSWidth, this.CanvasCSSHeight);
		const borderColor = 0xFF171717;
		for (const region of [R.SidebarHeader, R.Sidebar, R.ContentHeader, R.Content, R.ContentScrollbarX])
			d.AddRect(region.TL, region.BR, borderColor);

		context.ElapsedProgramTimeSincePlaybackStarted = isPlayback ? context.ElapsedProgramTimeSincePlaybackStarted + dt : 0.0;
		context.ElapsedProgramTimeSincePlaybackStopped = !isPlayback ? context.ElapsedProgramTimeSincePlaybackStopped + dt : 0.0;
		const animatedCursorLocalSpaceX = camera.WorldToLocalSpace(V2(this.WorldSpaceCursorXAnimationCurrent, 0.0)).x;
		const currentCursorLocalSpaceX = camera.TimeToLocalSpaceX(cursorTime);

		const cursorLocalSpaceX = isPlayback ? currentCursorLocalSpaceX : animatedCursorLocalSpaceX;
		const cursorHeaderTriangleLocalSpaceX = cursorLocalSpaceX + 0.5;

		// NOTE: Sidebar header (time / playback speed / grid division display)
		{
			d.PushClipRect(R.SidebarHeader.TL, R.SidebarHeader.BR);
			d.SetFont(GuiScale(FontBaseSizeMedium));
			const pad = 1.0;
			let displayTime: Time;
			if (Settings.General.DisplayTimeInSongSpace)
				displayTime = ClampBot(context.GetCursorTime() - context.Chart.SongOffset, Math.min(-context.Chart.SongOffset, 0.0));
			else
				displayTime = ClampBot(context.GetCursorTime(), 0.0);

			const labels = [TimeToString(displayTime), `${FormatG(ToPercent(context.GetPlaybackSpeed()))}%`, `1 / ${this.CurrentGridBarDivision}`];
			// NOTE: The compact (mobile) layout only has enough space for the grid division (time and speed are shown by the mobile toolbar instead)
			const visibleLabels = this.CompactLayout ? [labels[2]] : labels;
			const buttonWidth = (R.SidebarHeader.GetWidth() - pad * 2) / visibleLabels.length;
			d.SetFont(GuiScale(15.0));
			for (let i = 0; i < visibleLabels.length; i++)
			{
				const tl = V2(R.SidebarHeader.TL.x + pad + buttonWidth * i, R.SidebarHeader.TL.y + pad);
				const br = V2(tl.x + buttonWidth - 1.0, R.SidebarHeader.BR.y - pad);
				d.AddRectFilled(tl, br, 0x2E737373);
				const w = d.CalcTextWidth(visibleLabels[i]);
				d.AddText(V2(tl.x + (buttonWidth - w) * 0.5, tl.y + (br.y - tl.y - d.GetFontSize()) * 0.5), 0x80F0F0F0, visibleLabels[i]);
			}
			d.PopClipRect();
		}

		// NOTE: Content base background
		{
			const borders = 1.0;
			d.AddRectFilled(V2(R.Content.TL.x + borders, R.Content.TL.y + borders), V2(R.Content.BR.x - borders, R.Content.BR.y - borders), Colors.TimelineBackgroundColor);
		}

		// NOTE: Demo start time marker
		if (context.Chart.SongDemoStartTime > 0.0)
		{
			const songDemoStartTimeChartSpace = context.Chart.SongDemoStartTime + context.Chart.SongOffset;
			const songDemoStartTimeLocalSpaceX = camera.TimeToLocalSpaceX(songDemoStartTimeChartSpace);

			const headerScreenSpaceTL = this.LocalToScreenSpace_ContentHeader(V2(songDemoStartTimeLocalSpaceX, 0.0));
			const h = R.ContentHeader.GetHeight();
			const a = V2(headerScreenSpaceTL.x, headerScreenSpaceTL.y + h - GuiScale(TimelineSongDemoStartMarkerHeight));
			const b = V2(headerScreenSpaceTL.x + GuiScale(TimelineSongDemoStartMarkerWidth), headerScreenSpaceTL.y + h);
			const c = V2(headerScreenSpaceTL.x, headerScreenSpaceTL.y + h);

			d.PushClipRect(R.ContentHeader.TL, R.ContentHeader.BR);
			d.AddTriangleFilled(a, b, c, Colors.TimelineSongDemoStartMarkerColorFill);
			d.AddTriangle(a, b, c, Colors.TimelineSongDemoStartMarkerColorBorder);
			d.PopClipRect();
		}

		// NOTE: Tempo map bar/beat lines and bar-index/time text
		{
			d.SetFont(GuiScale(FontBaseSizeMedium));
			const screenSpaceTextOffsetBarIndex = V2(GuiScale(4.0), GuiScale(1.0));
			const screenSpaceTextOffsetBarTime = V2(GuiScale(4.0), GuiScale(13.0));

			const displayTimeInSongSpace = (Settings.General.DisplayTimeInSongSpace && Math.abs(TimeToMS(context.Chart.SongOffset)) > 0.5);
			const timeLabelDisplayOffset = displayTimeInSongSpace ? -context.Chart.SongOffset : 0.0;

			const visibleTimeOverdraw = camera.TimePerScreenPixel() * (d.CalcTextWidth("00:00.000") + GuiScale(22.0));
			const gridLines: ForEachGridLineData[] = [];
			this.ForEachTimelineVisibleGridLine(context, visibleTimeOverdraw, (gridIt) => { gridLines.push(gridIt); });

			d.PushClipRect(R.Content.TL, R.Content.BR);
			for (const gridIt of gridLines)
			{
				const lineColor = gridIt.IsBar ? Colors.TimelineGridBarLineColor : Colors.TimelineGridBeatLineColor;
				const screenSpaceTL = this.LocalToScreenSpace(V2(camera.TimeToLocalSpaceX(gridIt.Time), 0.0));
				d.AddLine(screenSpaceTL, V2(screenSpaceTL.x, screenSpaceTL.y + R.Content.GetHeight()), lineColor);
			}
			d.PopClipRect();

			d.PushClipRect(R.ContentHeader.TL, R.ContentHeader.BR);
			for (const gridIt of gridLines)
			{
				const lineColor = gridIt.IsBar ? Colors.TimelineGridBarLineColor : Colors.TimelineGridBeatLineColor;
				const headerScreenSpaceTL = this.LocalToScreenSpace_ContentHeader(V2(camera.TimeToLocalSpaceX(gridIt.Time), 0.0));
				d.AddLine(headerScreenSpaceTL, V2(headerScreenSpaceTL.x, headerScreenSpaceTL.y + R.ContentHeader.GetHeight()), lineColor);

				// TODO: Fix overlapping text when zoomed out really far (while still keeping the grid lines)
				if (gridIt.IsBar)
				{
					d.SetFont(GuiScale(FontBaseSizeMedium) * 0.72);
					d.AddTextWithDropShadow(V2(headerScreenSpaceTL.x + screenSpaceTextOffsetBarIndex.x, headerScreenSpaceTL.y + screenSpaceTextOffsetBarIndex.y), Colors.Gui_Text, String(gridIt.BarIndex));
					d.AddTextWithDropShadow(V2(headerScreenSpaceTL.x + screenSpaceTextOffsetBarTime.x, headerScreenSpaceTL.y + screenSpaceTextOffsetBarTime.y), ColorU32WithAlpha(Colors.Gui_Text, 0.5), TimeToString(gridIt.Time + timeLabelDisplayOffset));
				}
			}
			d.PopClipRect();
		}

		d.PushClipRect(R.Content.TL, R.Content.BR);

		// NOTE: Grid snap beat lines
		if (this.GridSnapLineAnimationCurrent > 0.0)
		{
			const minMaxVisibleTime = this.GetMinMaxVisibleTime();
			const gridBeatSnap = GetGridBeatSnap(this.CurrentGridBarDivision);
			const minVisibleBeat = FloorBeatToGrid(context.TimeToBeat(minMaxVisibleTime.Min), gridBeatSnap) - gridBeatSnap;
			const maxVisibleBeat = CeilBeatToGrid(context.TimeToBeat(minMaxVisibleTime.Max), gridBeatSnap) + gridBeatSnap;

			const gridSnapLineColor = ColorU32WithAlpha(IsTupletBarDivision(this.CurrentGridBarDivision) ? Colors.TimelineGridSnapTupletLineColor : Colors.TimelineGridSnapLineColor, this.GridSnapLineAnimationCurrent);
			const lastBeat = ClampTop(maxVisibleBeat, context.TimeToBeat(context.Chart.GetDurationOrDefault()));
			for (let beatIt = ClampBot(minVisibleBeat, 0); beatIt <= lastBeat; beatIt += gridBeatSnap)
			{
				const screenSpaceTL = this.LocalToScreenSpace(V2(camera.TimeToLocalSpaceX(context.BeatToTime(beatIt)), 0.0));
				d.AddLine(screenSpaceTL, V2(screenSpaceTL.x, screenSpaceTL.y + R.Content.GetHeight()), gridSnapLineColor);
			}
		}

		// NOTE: Out of bounds darkening
		{
			const gridTimeMin = ClampTop(context.Chart.SongOffset, 0.0), gridTimeMax = context.Chart.GetDurationOrDefault();
			const localSpaceMinL = Clamp(camera.WorldToLocalSpace(V2(camera.TimeToWorldSpaceX(gridTimeMin), 0.0)).x, 0.0, R.Content.GetWidth());
			const localSpaceMaxR = Clamp(camera.WorldToLocalSpace(V2(camera.TimeToWorldSpaceX(gridTimeMax), 0.0)).x, 0.0, R.Content.GetWidth());

			const screenSpaceRectL = new Rect(R.Content.TL, V2(this.LocalToScreenSpace(V2(localSpaceMinL, 0.0)).x, R.Content.BR.y));
			const screenSpaceRectR = new Rect(V2(this.LocalToScreenSpace(V2(localSpaceMaxR, 0.0)).x, R.Content.TL.y), R.Content.BR);

			if (screenSpaceRectL.GetWidth() > 0.0) d.AddRectFilled(screenSpaceRectL.TL, screenSpaceRectL.BR, Colors.TimelineOutOfBoundsDimColor);
			if (screenSpaceRectR.GetWidth() > 0.0) d.AddRectFilled(screenSpaceRectR.TL, screenSpaceRectR.BR, Colors.TimelineOutOfBoundsDimColor);
		}

		// NOTE: Range selection rect
		if (this.RangeSelection.IsActive)
		{
			const localTL = V2(camera.TimeToLocalSpaceX(context.BeatToTime(this.RangeSelection.Start)), 1.0);
			const localBR = V2(camera.TimeToLocalSpaceX(context.BeatToTime(this.RangeSelection.End)), R.Content.GetHeight() - 1.0);
			localBR.x = LerpClamped(localTL.x, localBR.x, this.RangeSelectionExpansionAnimationCurrent);
			const tlS = this.LocalToScreenSpace(localTL), brS = this.LocalToScreenSpace(localBR);
			const screenSpaceTL = V2(tlS.x + (!this.RangeSelection.HasEnd ? -1.0 : 0.0), tlS.y);
			const screenSpaceBR = V2(brS.x + (!this.RangeSelection.HasEnd ? +1.0 : 0.0), brS.y);

			if ((Colors.TimelineRangeSelectionHeaderHighlightColor >>> 24) > 0)
			{
				const headerHighlightRectHeight = GuiScale(3.0);
				const headerTL = this.LocalToScreenSpace_ContentHeader(V2(localTL.x, R.ContentHeader.GetHeight() - headerHighlightRectHeight));
				const headerBR = this.LocalToScreenSpace_ContentHeader(V2(localBR.x, R.ContentHeader.GetHeight() + 2.0));
				d.PopClipRect();
				d.PushClipRect(R.ContentHeader.TL, R.ContentHeader.BR);
				d.AddRectFilled(V2(Math.min(headerTL.x, headerBR.x), headerTL.y), V2(Math.max(headerTL.x, headerBR.x), headerBR.y), Colors.TimelineRangeSelectionHeaderHighlightColor);
				d.AddRect(V2(Math.min(headerTL.x, headerBR.x), headerTL.y), V2(Math.max(headerTL.x, headerBR.x), headerBR.y), Colors.TimelineRangeSelectionBorderColor);
				d.PopClipRect();
				d.PushClipRect(R.Content.TL, R.Content.BR);
			}

			const rtl = V2(Math.min(screenSpaceTL.x, screenSpaceBR.x), screenSpaceTL.y), rbr = V2(Math.max(screenSpaceTL.x, screenSpaceBR.x), screenSpaceBR.y);
			d.AddRectFilled(rtl, rbr, Colors.TimelineRangeSelectionBackgroundColor);
			d.AddRect(rtl, rbr, Colors.TimelineRangeSelectionBorderColor);
		}

		// NOTE: Background waveform
		if (TimelineWaveformDrawOrder === WaveformDrawOrder.Background && !context.SongWaveformL.IsEmpty())
			this.DrawTimelineContentWaveform(context.Chart.SongOffset, context.SongWaveformL, context.SongWaveformR, context.SongWaveformFadeAnimationCurrent);

		d.PopClipRect();

		// NOTE: Row labels, lines and items
		{
			const visibleTimeOverdraw = camera.TimePerScreenPixel() * (GuiScale(22.0) * 4.0);
			const visibleTime = this.GetMinMaxVisibleTime(visibleTimeOverdraw);
			d.SetFont(GuiScale(FontBaseSizeMedium));

			// NOTE: Row label text (clipped to the content height so that vertically scrolled rows don't overlap the scrollbar area)
			d.PushClipRect(R.Sidebar.TL, V2(R.Sidebar.BR.x, R.Content.BR.y));
			this.ForEachTimelineRow((rowIt) =>
			{
				const sidebarScreenSpaceTL = this.LocalToScreenSpace_Sidebar(V2(0.0, rowIt.LocalY));
				const sidebarScreenSpaceBL = this.LocalToScreenSpace_Sidebar(V2(0.0, rowIt.LocalY + rowIt.LocalHeight));
				d.AddLine(sidebarScreenSpaceBL, V2(sidebarScreenSpaceBL.x + R.Sidebar.GetWidth(), sidebarScreenSpaceBL.y), ColorU32WithAlpha(Colors.Gui_Separator, 0.35 * 2.0));

				const labelFontSize = GuiScale(this.CompactLayout ? 13 : FontBaseSizeMedium);
				d.SetFont(labelFontSize);
				const screenSpaceTextPosition = V2(sidebarScreenSpaceTL.x + GuiScale(4.0) * 2.0, sidebarScreenSpaceTL.y + Math.floor((rowIt.LocalHeight * 0.5) - (labelFontSize * 0.5)));

				// HACK: Use TextDisable for now to make it clear that these aren't really implemented yet
				const isThisRowImplemented = !(rowIt.RowType === TimelineRowType.Notes_Expert || rowIt.RowType === TimelineRowType.Notes_Master);
				d.AddText(screenSpaceTextPosition, isThisRowImplemented ? Colors.Gui_Text : Colors.Gui_TextDisabled, rowIt.Label);
			});
			d.PopClipRect();
			d.SetFont(GuiScale(FontBaseSizeMedium));

			d.PushClipRect(R.Content.TL, R.Content.BR);
			this.ForEachTimelineRow((rowIt) =>
			{
				// NOTE: Row separator line
				const screenSpaceBL = this.LocalToScreenSpace(V2(0.0, rowIt.LocalY + rowIt.LocalHeight));
				d.AddLine(screenSpaceBL, V2(screenSpaceBL.x + R.Content.GetWidth(), screenSpaceBL.y), Colors.TimelineHorizontalRowLineColor);

				// NOTE: Row items
				this.DrawTimelineContentItemRow(context, rowIt, visibleTime, isPlayback, cursorTime, cursorBeatOnPlaybackStart);
			});

			// NOTE: Background waveform overlay
			if (TimelineWaveformDrawOrder === WaveformDrawOrder.Foreground && !context.SongWaveformL.IsEmpty())
				this.DrawTimelineContentWaveform(context.Chart.SongOffset, context.SongWaveformL, context.SongWaveformR, context.SongWaveformFadeAnimationCurrent);
			d.PopClipRect();
		}

		// NOTE: Cursor foreground
		{
			const cursorWidth = GuiScale(TimelineCursorHeadWidth);
			const cursorHeight = GuiScale(TimelineCursorHeadHeight);

			d.PushClipRect(R.ContentHeader.TL, R.ContentHeader.BR);
			// TODO: Maybe animate between triangle and something else depending on isPlayback (?)
			d.AddTriangleFilled(
				this.LocalToScreenSpace_ContentHeader(V2(cursorHeaderTriangleLocalSpaceX - cursorWidth, 0.0)),
				this.LocalToScreenSpace_ContentHeader(V2(cursorHeaderTriangleLocalSpaceX + cursorWidth, 0.0)),
				this.LocalToScreenSpace_ContentHeader(V2(cursorHeaderTriangleLocalSpaceX, cursorHeight)), Colors.TimelineCursorColor);
			d.AddLine(
				this.LocalToScreenSpace_ContentHeader(V2(cursorLocalSpaceX, cursorHeight)),
				this.LocalToScreenSpace_ContentHeader(V2(cursorLocalSpaceX, R.ContentHeader.GetHeight())), Colors.TimelineCursorColor);
			d.PopClipRect();

			d.PushClipRect(R.Content.TL, R.Content.BR);
			// TODO: Maybe draw different cursor color or "type" depending on grid snap (?) (see "ArrowVortex/assets/icons snap.png")
			d.AddLine(this.LocalToScreenSpace(V2(cursorLocalSpaceX, 0.0)), this.LocalToScreenSpace(V2(cursorLocalSpaceX, R.Content.GetHeight())), Colors.TimelineCursorColor);

			// NOTE: Immediately draw destination cursor line for better responsiveness
			if (!isPlayback && !ApproxmiatelySame(animatedCursorLocalSpaceX, currentCursorLocalSpaceX, 0.5))
				d.AddLine(this.LocalToScreenSpace(V2(currentCursorLocalSpaceX, 0.0)), this.LocalToScreenSpace(V2(currentCursorLocalSpaceX, R.Content.GetHeight())), ColorU32WithAlpha(Colors.TimelineCursorColor, 0.25));

			// NOTE: Mouse selection box
			const box = this.BoxSelection;
			if (box.IsActive)
			{
				const clampVisibleScreenSpace = (s: vec2) => V2(s.x, Clamp(s.y, R.Content.TL.y + 2.0, R.Content.BR.y - 2.0));
				const a = clampVisibleScreenSpace(this.LocalToScreenSpace(camera.WorldToLocalSpace(box.WorldSpaceRect.TL)));
				const b = clampVisibleScreenSpace(this.LocalToScreenSpace(camera.WorldToLocalSpace(box.WorldSpaceRect.BR)));
				const tl = V2(Math.min(a.x, b.x), Math.min(a.y, b.y)), br = V2(Math.max(a.x, b.x), Math.max(a.y, b.y));
				d.AddRectFilled(tl, br, Colors.TimelineBoxSelectionBackgroundColor);
				d.AddRect(tl, br, Colors.TimelineBoxSelectionBorderColor);

				if (box.Action !== BoxSelectionAction.Clear)
				{
					const radius = GuiScale(TimelineBoxSelectionRadius);
					const linePadding = GuiScale(TimelineBoxSelectionLinePadding);
					const lineThickness = ClampBot(Round(TimelineBoxSelectionLineThickness * GuiScaleState.Current / 2.0) * 2.0, TimelineBoxSelectionLineThickness);

					const center = this.LocalToScreenSpace(camera.WorldToLocalSpace(box.WorldSpaceRect.TL));
					d.AddCircleFilled(center, radius, Colors.TimelineBoxSelectionFillColor);
					d.AddCircle(center, radius, Colors.TimelineBoxSelectionBorderColor);

					const horizontal = Rect.FromCenterSize(center, V2((radius - linePadding) * 2.0, lineThickness));
					const vertical = Rect.FromCenterSize(center, V2(lineThickness, (radius - linePadding) * 2.0));
					if (box.Action === BoxSelectionAction.Add)
					{
						d.AddRectFilled(horizontal.TL, horizontal.BR, Colors.TimelineBoxSelectionInnerColor);
						d.AddRectFilled(vertical.TL, vertical.BR, Colors.TimelineBoxSelectionInnerColor);
					}
					else if (box.Action === BoxSelectionAction.Sub)
					{
						d.AddRectFilled(horizontal.TL, horizontal.BR, Colors.TimelineBoxSelectionInnerColor);
					}
					else if (box.Action === BoxSelectionAction.XOR)
					{
						d.AddCircleFilled(center, GuiScale(TimelineBoxSelectionXorDotRadius), Colors.TimelineBoxSelectionInnerColor);
					}
				}
			}
			d.PopClipRect();
		}

		// NOTE: Waveform and cursor on top of scrollbar!
		{
			d.PushClipRect(R.ContentScrollbarX.TL, R.ContentScrollbarX.BR);
			d.AddRectFilled(R.ContentScrollbarX.TL, R.ContentScrollbarX.BR, 0x871F1F1F);
			const chartDuration = context.Chart.GetDurationOrDefault();

			if (!context.SongWaveformL.IsEmpty())
				this.DrawTimelineScrollbarXWaveform(context.Chart.SongOffset, chartDuration, context.SongWaveformL, context.SongWaveformR, context.SongWaveformFadeAnimationCurrent);

			this.DrawTimelineScrollbarXMinimap(context, chartDuration);

			const animatedScrollbarCursorX = this.TimeToScrollbarLocalSpaceXClamped(camera.WorldSpaceXToTime(this.WorldSpaceCursorXAnimationCurrent), chartDuration);
			const currentScrollbarCursorX = this.TimeToScrollbarLocalSpaceXClamped(cursorTime, chartDuration);
			const scrollbarCursorX = isPlayback ? currentScrollbarCursorX : animatedScrollbarCursorX;

			// BUG: Drawn cursor doesn't perfectly line up on the left side with the scroll grab hand (?)
			d.AddLine(this.LocalToScreenSpace_ScrollbarX(V2(scrollbarCursorX, 2.0)), this.LocalToScreenSpace_ScrollbarX(V2(scrollbarCursorX, R.ContentScrollbarX.GetHeight() - 2.0)), Colors.TimelineCursorColor);

			// NOTE: Scrollbar grab hand (drawn with 0.2 alpha just like the original pushes for ImGuiCol_ScrollbarGrab)
			const metrics = this.GetScrollbarMetrics(context);
			const grabHovered = this.IsScrollbarHovered && Input.MousePos.x >= metrics.GrabMinX && Input.MousePos.x <= metrics.GrabMinX + metrics.GrabWidth;
			const grabColor = (this.ScrollbarDrag.IsActive) ? 0x33828282 : (grabHovered || this.IsCameraMouseGrabActive) ? 0x33696969 : 0x334F4F4F;
			const grabPad = GuiScale(2.0);
			d.AddRectFilled(V2(metrics.GrabMinX, R.ContentScrollbarX.TL.y + grabPad), V2(metrics.GrabMinX + metrics.GrabWidth, R.ContentScrollbarX.BR.y - grabPad), grabColor);
			d.PopClipRect();
		}

		// NOTE: Mouse cursor
		const cursor = this.pendingMouseCursor;
		this.pendingMouseCursor = "";
		if (this.Canvas !== null && cursor !== this.LastMouseCursor)
		{
			this.Canvas.style.cursor = cursor;
			this.LastMouseCursor = cursor;
		}
	}
}

async function ClipboardWriteText(text: string): Promise<void>
{
	try { await navigator.clipboard.writeText(text); }
	catch { FallbackClipboard = text; }
	FallbackClipboard = text;
}

async function ClipboardReadText(): Promise<string>
{
	try
	{
		const text = await navigator.clipboard.readText();
		if (text.length > 0) return text;
	}
	catch { /* NOTE: Clipboard read permission denied, fall back to the internal clipboard */ }
	return FallbackClipboard;
}

let FallbackClipboard = "";

export type { ForEachChartItemData };
