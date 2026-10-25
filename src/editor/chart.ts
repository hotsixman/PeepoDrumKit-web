// Port of PeepoDrumKit "peepo_drum_kit/chart.h" / "chart.cpp"
// https://github.com/samyuu/PeepoDrumKit
import { type Time, ApproxmiatelySame, Clamp, DateGetToday, type DateYMD } from "../core/types";
import
{
	type Beat, type Tempo, type TimeSignature, type BeatItem, type TempoChange, type TimeSignatureChange,
	BeatSortedList, BeatSortedForwardIterator, SortedTempoMap, TempoChange as MakeTempoChange, TimeSignatureChange as MakeTimeSignatureChange,
	TimeSignature as MakeTimeSignature, FallbackTempo, GetDurationPerBar, TimeSignatureEquals, CloneTempoChange, CloneTimeSignatureChange, BeatFromBars,
} from "../core/beat";
import { ControlFlow } from "../core/types";
import * as TJA from "../formats/tja";

export enum NoteType
{
	// NOTE: Regular notes
	Don,
	DonBig,
	Ka,
	KaBig,
	// NOTE: Long notes
	Drumroll,
	DrumrollBig,
	Balloon,
	BalloonSpecial,
	// ...
	Count
}

export enum NoteSEType
{
	Do, Don, DonBig,
	// TODO: Ko,
	Ka, Katsu, KatsuBig,
	Drumroll, DrumrollBig,
	Balloon, BalloonSpecial,
	Count
}

export const IsDonNote = (v: NoteType) => (v === NoteType.Don) || (v === NoteType.DonBig);
export const IsKaNote = (v: NoteType) => (v === NoteType.Ka) || (v === NoteType.KaBig);
export const IsSmallNote = (v: NoteType) => (v === NoteType.Don) || (v === NoteType.Ka) || (v === NoteType.Drumroll) || (v === NoteType.Balloon);
export const IsBigNote = (v: NoteType) => !IsSmallNote(v);
export const IsDrumrollNote = (v: NoteType) => (v === NoteType.Drumroll) || (v === NoteType.DrumrollBig);
export const IsBalloonNote = (v: NoteType) => (v === NoteType.Balloon) || (v === NoteType.BalloonSpecial);
export const IsLongNote = (v: NoteType) => IsDrumrollNote(v) || IsBalloonNote(v);
export const IsRegularNote = (v: NoteType) => !IsLongNote(v);

export function ToSmallNote(v: NoteType): NoteType
{
	switch (v)
	{
		case NoteType.Don: case NoteType.DonBig: return NoteType.Don;
		case NoteType.Ka: case NoteType.KaBig: return NoteType.Ka;
		case NoteType.Drumroll: case NoteType.DrumrollBig: return NoteType.Drumroll;
		case NoteType.Balloon: case NoteType.BalloonSpecial: return NoteType.Balloon;
		default: return v;
	}
}
export function ToBigNote(v: NoteType): NoteType
{
	switch (v)
	{
		case NoteType.Don: case NoteType.DonBig: return NoteType.DonBig;
		case NoteType.Ka: case NoteType.KaBig: return NoteType.KaBig;
		case NoteType.Drumroll: case NoteType.DrumrollBig: return NoteType.DrumrollBig;
		case NoteType.Balloon: case NoteType.BalloonSpecial: return NoteType.BalloonSpecial;
		default: return v;
	}
}
export const ToggleNoteSize = (v: NoteType) => IsSmallNote(v) ? ToBigNote(v) : ToSmallNote(v);
export const ToSmallNoteIf = (v: NoteType, condition: boolean) => condition ? ToSmallNote(v) : v;
export const ToBigNoteIf = (v: NoteType, condition: boolean) => condition ? ToBigNote(v) : v;
export function FlipNote(v: NoteType): NoteType
{
	switch (v)
	{
		case NoteType.Don: return NoteType.Ka;
		case NoteType.DonBig: return NoteType.KaBig;
		case NoteType.Ka: return NoteType.Don;
		case NoteType.KaBig: return NoteType.DonBig;
		default: return v;
	}
}
export const IsNoteFlippable = (v: NoteType) => FlipNote(v) !== v;

// NOTE: Web port change ("more-grid"), originally BeatDiv(beatDuration, GetGridBeatSnap(gridBarDivision)). Works for any bar division
//		 by allowing a 1 tick tolerance for grid lines that had to be rounded to the closest tick
export const DefaultBalloonPopCount = (beatDuration: Beat, gridBarDivision: number): number => Math.trunc(((beatDuration + Math.sign(beatDuration)) * gridBarDivision) / BeatFromBars(1));

export enum DifficultyType { Easy, Normal, Hard, Oni, OniUra, Count }
export const DifficultyTypeNames: readonly string[] = ["Easy", "Normal", "Hard", "Oni", "Oni-Ura"];
export const DifficultyLevelMin = 1, DifficultyLevelMax = 10;

export enum BranchType { Normal, Expert, Master, Count }

// TODO: Animations for create / delete AND for moving left / right (?)
export interface Note extends BeatItem
{
	BeatTime: Beat;
	BeatDuration: Beat;
	TimeOffset: Time;
	Type: NoteType;
	IsSelected: boolean;
	BalloonPopCount: number;
	ClickAnimationTimeRemaining: number;
	ClickAnimationTimeDuration: number;
	// NOTE: Temp inline storage for rendering
	TempSEType: NoteSEType;
}
export const MakeNote = (init: Partial<Note> = {}): Note => ({
	BeatTime: 0, BeatDuration: 0, TimeOffset: 0.0, Type: NoteType.Don, IsSelected: false, BalloonPopCount: 0,
	ClickAnimationTimeRemaining: 0.0, ClickAnimationTimeDuration: 0.0, TempSEType: NoteSEType.Count, ...init,
});
export const CloneNote = (v: Note): Note => ({ ...v });
export const NoteGetStart = (v: Note): Beat => v.BeatTime;
export const NoteGetEnd = (v: Note): Beat => v.BeatTime + v.BeatDuration;

export interface ScrollChange extends BeatItem { BeatTime: Beat; ScrollSpeed: number; IsSelected: boolean; }
export const MakeScrollChange = (beat: Beat, scrollSpeed: number, isSelected = false): ScrollChange => ({ BeatTime: beat, ScrollSpeed: scrollSpeed, IsSelected: isSelected });
export const CloneScrollChange = (v: ScrollChange): ScrollChange => ({ ...v });

export interface BarLineChange extends BeatItem { BeatTime: Beat; IsVisible: boolean; IsSelected: boolean; }
export const MakeBarLineChange = (beat: Beat, isVisible: boolean, isSelected = false): BarLineChange => ({ BeatTime: beat, IsVisible: isVisible, IsSelected: isSelected });
export const CloneBarLineChange = (v: BarLineChange): BarLineChange => ({ ...v });

export interface GoGoRange extends BeatItem
{
	BeatTime: Beat;
	BeatDuration: Beat;
	IsSelected: boolean;
	ExpansionAnimationCurrent: number;
	ExpansionAnimationTarget: number;
}
export const MakeGoGoRange = (beat: Beat, duration: Beat, isSelected = false): GoGoRange => ({ BeatTime: beat, BeatDuration: duration, IsSelected: isSelected, ExpansionAnimationCurrent: 0.0, ExpansionAnimationTarget: 1.0 });
export const CloneGoGoRange = (v: GoGoRange): GoGoRange => ({ ...v });
export const GoGoGetStart = (v: GoGoRange): Beat => v.BeatTime;
export const GoGoGetEnd = (v: GoGoRange): Beat => v.BeatTime + v.BeatDuration;

export interface LyricChange extends BeatItem { BeatTime: Beat; Lyric: string; IsSelected: boolean; }
export const MakeLyricChange = (beat: Beat, lyric: string, isSelected = false): LyricChange => ({ BeatTime: beat, Lyric: lyric, IsSelected: isSelected });
export const CloneLyricChange = (v: LyricChange): LyricChange => ({ ...v });

export type SortedNotesList = BeatSortedList<Note>;
export type SortedScrollChangesList = BeatSortedList<ScrollChange>;
export type SortedBarLineChangesList = BeatSortedList<BarLineChange>;
export type SortedGoGoRangesList = BeatSortedList<GoGoRange>;
export type SortedLyricsList = BeatSortedList<LyricChange>;

export const NewSortedNotesList = (v: Note[] = []) => new BeatSortedList<Note>(CloneNote, v);
export const NewSortedScrollChangesList = (v: ScrollChange[] = []) => new BeatSortedList<ScrollChange>(CloneScrollChange, v);
export const NewSortedBarLineChangesList = (v: BarLineChange[] = []) => new BeatSortedList<BarLineChange>(CloneBarLineChange, v);
export const NewSortedGoGoRangesList = (v: GoGoRange[] = []) => new BeatSortedList<GoGoRange>(CloneGoGoRange, v);
export const NewSortedLyricsList = (v: LyricChange[] = []) => new BeatSortedList<LyricChange>(CloneLyricChange, v);

export const ScrollSpeedToTempo = (scrollSpeed: number, baseTempo: Tempo): Tempo => ({ BPM: scrollSpeed * baseTempo.BPM });
export const ScrollTempoToSpeed = (scrollTempo: Tempo, baseTempo: Tempo): number => (baseTempo.BPM === 0.0) ? 0.0 : (scrollTempo.BPM / baseTempo.BPM);

export const VisibleOrDefault = (v: BarLineChange | null): boolean => (v === null) ? true : v.IsVisible;
export const ScrollOrDefault = (v: ScrollChange | null): number => (v === null) ? 1.0 : v.ScrollSpeed;
export const TempoOrDefault = (v: TempoChange | null): Tempo => (v === null) ? FallbackTempo : v.Tempo;

export enum Language { Base, JA, EN, CN, TW, KO, Count }
export type PerLanguageString = string[];
export const MakePerLanguageString = (): PerLanguageString => ["", "", "", "", "", ""];

let NextCourseID = 1;

export class ChartCourse
{
	// NOTE: Unique identifier to replace pointer identity comparisons
	readonly ID = NextCourseID++;

	Type: DifficultyType = DifficultyType.Oni;
	Level = 1;
	CourseCreator = "";

	TempoMap = new SortedTempoMap();

	// TODO: Have per-branch scroll speed changes (?)
	Notes_Normal: SortedNotesList = NewSortedNotesList();
	Notes_Expert: SortedNotesList = NewSortedNotesList();
	Notes_Master: SortedNotesList = NewSortedNotesList();

	ScrollChanges: SortedScrollChangesList = NewSortedScrollChangesList();
	BarLineChanges: SortedBarLineChangesList = NewSortedBarLineChangesList();
	GoGoRanges: SortedGoGoRangesList = NewSortedGoGoRangesList();
	Lyrics: SortedLyricsList = NewSortedLyricsList();

	ScoreInit = 0;
	ScoreDiff = 0;

	GetNotes(branch: BranchType): SortedNotesList
	{
		return (branch === BranchType.Normal) ? this.Notes_Normal : (branch === BranchType.Expert) ? this.Notes_Expert : this.Notes_Master;
	}
}

// NOTE: Internal representation of a chart. Can then be imported / exported as .tja (and maybe as the native fumen binary format too eventually?)
export class ChartProject
{
	Courses: ChartCourse[] = [];

	ChartDuration: Time = 0.0;
	ChartTitle: PerLanguageString = MakePerLanguageString();
	ChartSubtitle: PerLanguageString = MakePerLanguageString();
	ChartCreator = "";
	ChartGenre = "";
	ChartLyricsFileName = "";

	SongOffset: Time = 0.0;
	SongDemoStartTime: Time = 0.0;
	SongFileName = "";

	SongVolume = 1.0;
	SoundEffectVolume = 1.0;

	BackgroundImageFileName = "";
	BackgroundMovieFileName = "";
	MovieOffset: Time = 0.0;

	// TODO: Maybe change to GetDurationOr(Time defaultDuration) and always pass in context.SongDuration (?)
	GetDurationOrDefault(): Time { return (this.ChartDuration <= 0.0) ? 60.0 : this.ChartDuration; }
}

// NOTE: Chart Space -> Starting at 00:00.000 (as most internal calculations are done in)
//		  Song Space -> Starting relative to Song Offset (sometimes useful for displaying to the user)
export enum TimeSpace { Chart, Song }
export const ChartToSongTimeSpace = (inTime: Time, songOffset: Time): Time => (inTime - songOffset);
export const SongToChartTimeSpace = (inTime: Time, songOffset: Time): Time => (inTime + songOffset);
export function ConvertTimeSpace(v: Time, inSpace: TimeSpace, outSpace: TimeSpace, songOffset: Time): Time
{
	v = (inSpace === outSpace) ? v : (inSpace === TimeSpace.Chart) ? (v - songOffset) : (v + songOffset);
	return (Object.is(v, -0)) ? 0.0 : v;
}

interface TempTimedDelayCommand extends BeatItem { BeatTime: Beat; Delay: Time; IsSelected: boolean; }

function ConvertTJANoteTypeFromTJA(tjaNoteType: TJA.NoteType): NoteType
{
	switch (tjaNoteType)
	{
		case TJA.NoteType.Don: return NoteType.Don;
		case TJA.NoteType.Ka: return NoteType.Ka;
		case TJA.NoteType.DonBig: return NoteType.DonBig;
		case TJA.NoteType.KaBig: return NoteType.KaBig;
		case TJA.NoteType.Start_Drumroll: return NoteType.Drumroll;
		case TJA.NoteType.Start_DrumrollBig: return NoteType.DrumrollBig;
		case TJA.NoteType.Start_Balloon: return NoteType.Balloon;
		case TJA.NoteType.Start_BaloonSpecial: return NoteType.BalloonSpecial;
		default: return NoteType.Count;
	}
}

function ConvertTJANoteTypeToTJA(noteType: NoteType): TJA.NoteType
{
	switch (noteType)
	{
		case NoteType.Don: return TJA.NoteType.Don;
		case NoteType.DonBig: return TJA.NoteType.DonBig;
		case NoteType.Ka: return TJA.NoteType.Ka;
		case NoteType.KaBig: return TJA.NoteType.KaBig;
		case NoteType.Drumroll: return TJA.NoteType.Start_Drumroll;
		case NoteType.DrumrollBig: return TJA.NoteType.Start_DrumrollBig;
		case NoteType.Balloon: return TJA.NoteType.Start_Balloon;
		case NoteType.BalloonSpecial: return TJA.NoteType.Start_BaloonSpecial;
		default: return TJA.NoteType.None;
	}
}

export function FindCourseMaxUsedBeat(course: ChartCourse): Beat
{
	// NOTE: Technically only need to look at the last item of each sorted list **but just to be sure**, in case there is something wonky going on with out-of-order durations or something
	let maxBeat = 0;
	for (const v of course.TempoMap.Tempo.Sorted) maxBeat = Math.max(maxBeat, v.BeatTime);
	for (const v of course.TempoMap.Signature.Sorted) maxBeat = Math.max(maxBeat, v.BeatTime);
	for (let i = 0; i < BranchType.Count; i++)
		for (const v of course.GetNotes(i).Sorted) maxBeat = Math.max(maxBeat, v.BeatTime + Math.max(0, v.BeatDuration));
	for (const v of course.GoGoRanges.Sorted) maxBeat = Math.max(maxBeat, v.BeatTime + Math.max(0, v.BeatDuration));
	for (const v of course.ScrollChanges.Sorted) maxBeat = Math.max(maxBeat, v.BeatTime);
	for (const v of course.BarLineChanges.Sorted) maxBeat = Math.max(maxBeat, v.BeatTime);
	for (const v of course.Lyrics.Sorted) maxBeat = Math.max(maxBeat, v.BeatTime);
	return maxBeat;
}

export function CreateChartProjectFromTJA(inTJA: TJA.ParsedTJA, out: ChartProject): boolean
{
	const m = inTJA.Metadata;
	out.ChartDuration = 0.0;
	out.ChartTitle[Language.Base] = m.TITLE;
	out.ChartTitle[Language.JA] = m.TITLE_JA;
	out.ChartTitle[Language.EN] = m.TITLE_EN;
	out.ChartTitle[Language.CN] = m.TITLE_CN;
	out.ChartTitle[Language.TW] = m.TITLE_TW;
	out.ChartTitle[Language.KO] = m.TITLE_KO;
	out.ChartSubtitle[Language.Base] = m.SUBTITLE;
	out.ChartSubtitle[Language.JA] = m.SUBTITLE_JA;
	out.ChartSubtitle[Language.EN] = m.SUBTITLE_EN;
	out.ChartSubtitle[Language.CN] = m.SUBTITLE_CN;
	out.ChartSubtitle[Language.TW] = m.SUBTITLE_TW;
	out.ChartSubtitle[Language.KO] = m.SUBTITLE_KO;
	out.ChartCreator = m.MAKER;
	out.ChartGenre = m.GENRE;
	out.ChartLyricsFileName = m.LYRICS;
	out.SongOffset = m.OFFSET;
	out.SongDemoStartTime = m.DEMOSTART;
	out.SongFileName = m.WAVE;
	out.SongVolume = m.SONGVOL;
	out.SoundEffectVolume = m.SEVOL;
	out.BackgroundImageFileName = m.BGIMAGE;
	out.BackgroundMovieFileName = m.BGMOVIE;
	out.MovieOffset = m.MOVIEOFFSET;

	for (const parsedCourse of inTJA.Courses)
	{
		const inCourse = TJA.ConvertParsedToConvertedCourse(inTJA, parsedCourse);
		const outCourse = new ChartCourse();
		out.Courses.push(outCourse);

		// HACK: Write proper enum conversion functions
		outCourse.Type = Clamp(inCourse.CourseMetadata.COURSE, 0, DifficultyType.Count) as DifficultyType;
		if (outCourse.Type >= DifficultyType.Count) outCourse.Type = DifficultyType.OniUra;
		outCourse.Level = Clamp(inCourse.CourseMetadata.LEVEL, DifficultyLevelMin, DifficultyLevelMax);
		outCourse.CourseCreator = inCourse.CourseMetadata.NOTESDESIGNER;

		outCourse.TempoMap.Tempo.Sorted = [MakeTempoChange(0, m.BPM)];
		outCourse.TempoMap.Signature.Sorted = [MakeTimeSignatureChange(0, MakeTimeSignature(4, 4))];
		let lastSignature = MakeTimeSignature(4, 4);

		let currentBalloonIndex = 0;

		const tempSortedDelayCommands = new BeatSortedList<TempTimedDelayCommand>((v) => ({ ...v }));
		const tempDelayCommandsIt = new BeatSortedForwardIterator<TempTimedDelayCommand>();
		for (const inMeasure of inCourse.Measures)
		{
			for (const inDelayChange of inMeasure.DelayChanges)
				tempSortedDelayCommands.InsertOrUpdate({ BeatTime: inMeasure.StartTime + inDelayChange.TimeWithinMeasure, Delay: inDelayChange.Delay, IsSelected: false });
		}

		const outNotes = outCourse.Notes_Normal.Sorted;
		for (const inMeasure of inCourse.Measures)
		{
			for (const inNote of inMeasure.Notes)
			{
				if (inNote.Type === TJA.NoteType.End_BalloonOrDrumroll)
				{
					// TODO: Proper handling
					if (outNotes.length > 0)
						outNotes[outNotes.length - 1].BeatDuration = (inMeasure.StartTime + inNote.TimeWithinMeasure) - outNotes[outNotes.length - 1].BeatTime;
					continue;
				}

				const outNoteType = ConvertTJANoteTypeFromTJA(inNote.Type);
				if (outNoteType === NoteType.Count)
					continue;

				const outNote = MakeNote();
				outNote.BeatTime = (inMeasure.StartTime + inNote.TimeWithinMeasure);
				outNote.Type = outNoteType;

				const delayCommandForThisNote = tempDelayCommandsIt.Next(tempSortedDelayCommands.Sorted, outNote.BeatTime);
				outNote.TimeOffset = (delayCommandForThisNote !== null) ? delayCommandForThisNote.Delay : 0.0;

				if (inNote.Type === TJA.NoteType.Start_Balloon || inNote.Type === TJA.NoteType.Start_BaloonSpecial)
				{
					// TODO: Implement properly with correct branch handling
					if (currentBalloonIndex >= 0 && currentBalloonIndex < inCourse.CourseMetadata.BALLOON.length)
						outNote.BalloonPopCount = inCourse.CourseMetadata.BALLOON[currentBalloonIndex];
					currentBalloonIndex++;
				}
				outNotes.push(outNote);
			}

			if (!TimeSignatureEquals(inMeasure.TimeSignature, lastSignature))
			{
				outCourse.TempoMap.Signature.InsertOrUpdate(MakeTimeSignatureChange(inMeasure.StartTime, inMeasure.TimeSignature));
				lastSignature = { ...inMeasure.TimeSignature };
			}

			for (const inTempoChange of inMeasure.TempoChanges)
				outCourse.TempoMap.Tempo.InsertOrUpdate(MakeTempoChange(inMeasure.StartTime + inTempoChange.TimeWithinMeasure, inTempoChange.Tempo));

			for (const inScrollChange of inMeasure.ScrollChanges)
				outCourse.ScrollChanges.Sorted.push(MakeScrollChange(inMeasure.StartTime + inScrollChange.TimeWithinMeasure, inScrollChange.ScrollSpeed));

			for (const barLineChange of inMeasure.BarLineChanges)
				outCourse.BarLineChanges.Sorted.push(MakeBarLineChange(inMeasure.StartTime + barLineChange.TimeWithinMeasure, barLineChange.Visibile));

			for (const lyricChange of inMeasure.LyricChanges)
				outCourse.Lyrics.Sorted.push(MakeLyricChange(inMeasure.StartTime + lyricChange.TimeWithinMeasure, lyricChange.Lyric));
		}

		for (const inGoGoRange of inCourse.GoGoRanges)
			outCourse.GoGoRanges.Sorted.push(MakeGoGoRange(inGoGoRange.StartTime, (inGoGoRange.EndTime - inGoGoRange.StartTime)));

		outCourse.ScoreInit = inCourse.CourseMetadata.SCOREINIT;
		outCourse.ScoreDiff = inCourse.CourseMetadata.SCOREDIFF;

		outCourse.TempoMap.RebuildAccelerationStructure();

		if (inCourse.Measures.length > 0)
			out.ChartDuration = Math.max(out.ChartDuration, outCourse.TempoMap.BeatToTime(inCourse.Measures[inCourse.Measures.length - 1].StartTime));
	}

	return true;
}

// NOTE: Equivalent of BuildInfo::CompilationDateParsed (injected by vite at build time)
declare const __BUILD_DATE__: string | undefined;
export const BuildDate: DateYMD = (() =>
{
	const iso = (typeof __BUILD_DATE__ !== "undefined") ? __BUILD_DATE__ : undefined;
	if (iso === undefined) return DateGetToday();
	const d = new Date(iso);
	return { Year: d.getFullYear(), Month: d.getMonth() + 1, Day: d.getDate() };
})();

export function ConvertChartProjectToTJA(inChart: ChartProject, out: TJA.ParsedTJA, includePeepoDrumKitComment: boolean = true): boolean
{
	const FallbackTJAChartTitle = "Untitled Chart";
	const m = out.Metadata;
	m.TITLE = (inChart.ChartTitle[Language.Base].length > 0) ? inChart.ChartTitle[Language.Base] : FallbackTJAChartTitle;
	m.TITLE_JA = inChart.ChartTitle[Language.JA];
	m.TITLE_EN = inChart.ChartTitle[Language.EN];
	m.TITLE_CN = inChart.ChartTitle[Language.CN];
	m.TITLE_TW = inChart.ChartTitle[Language.TW];
	m.TITLE_KO = inChart.ChartTitle[Language.KO];
	m.SUBTITLE = inChart.ChartSubtitle[Language.Base];
	m.SUBTITLE_JA = inChart.ChartSubtitle[Language.JA];
	m.SUBTITLE_EN = inChart.ChartSubtitle[Language.EN];
	m.SUBTITLE_CN = inChart.ChartSubtitle[Language.CN];
	m.SUBTITLE_TW = inChart.ChartSubtitle[Language.TW];
	m.SUBTITLE_KO = inChart.ChartSubtitle[Language.KO];
	m.MAKER = inChart.ChartCreator;
	m.GENRE = inChart.ChartGenre;
	m.LYRICS = inChart.ChartLyricsFileName;
	m.OFFSET = inChart.SongOffset;
	m.DEMOSTART = inChart.SongDemoStartTime;
	m.WAVE = inChart.SongFileName;
	m.SONGVOL = inChart.SongVolume;
	m.SEVOL = inChart.SoundEffectVolume;
	m.BGIMAGE = inChart.BackgroundImageFileName;
	m.BGMOVIE = inChart.BackgroundMovieFileName;
	m.MOVIEOFFSET = inChart.MovieOffset;

	if (includePeepoDrumKitComment)
	{
		out.HasPeepoDrumKitComment = true;
		out.PeepoDrumKitCommentDate = { ...BuildDate };
	}

	if (inChart.Courses.length > 0)
	{
		if (!inChart.Courses[0].TempoMap.Tempo.empty())
		{
			const initialTempo = inChart.Courses[0].TempoMap.Tempo.TryFindLastAtBeat(0);
			m.BPM = { ...((initialTempo !== null) ? initialTempo.Tempo : FallbackTempo) };
		}
	}

	for (const inCourse of inChart.Courses)
	{
		const outCourse = TJA.MakeParsedCourse();
		out.Courses.push(outCourse);

		// HACK: Write proper enum conversion functions
		outCourse.Metadata.COURSE = inCourse.Type as number as TJA.DifficultyType;
		outCourse.Metadata.LEVEL = inCourse.Level;
		outCourse.Metadata.NOTESDESIGNER = inCourse.CourseCreator;
		for (const inNote of inCourse.Notes_Normal.Sorted) if (IsBalloonNote(inNote.Type)) { outCourse.Metadata.BALLOON.push(inNote.BalloonPopCount); }
		outCourse.Metadata.SCOREINIT = inCourse.ScoreInit;
		outCourse.Metadata.SCOREDIFF = inCourse.ScoreDiff;

		// TODO: Is this implemented correctly..? Need to have enough measures to cover every note/command and pad with empty measures up to the chart duration
		const inChartMaxUsedBeat = FindCourseMaxUsedBeat(inCourse);
		const inChartBeatDuration = inCourse.TempoMap.TimeToBeat(inChart.GetDurationOrDefault());
		const outConvertedMeasures: TJA.ConvertedMeasure[] = [];

		inCourse.TempoMap.ForEachBeatBar((it) =>
		{
			if (inChartBeatDuration > inChartMaxUsedBeat && (it.Beat >= inChartBeatDuration))
				return ControlFlow.Break;
			if (it.IsBar)
				outConvertedMeasures.push(TJA.MakeConvertedMeasure(it.Beat, it.Signature));
			return (it.Beat >= Math.max(inChartBeatDuration, inChartMaxUsedBeat)) ? ControlFlow.Break : ControlFlow.Continue;
		});

		if (outConvertedMeasures.length === 0)
			outConvertedMeasures.push(TJA.MakeConvertedMeasure(0, MakeTimeSignature(4, 4)));

		const tryFindMeasureForBeat = (measures: TJA.ConvertedMeasure[], beatToFind: Beat): TJA.ConvertedMeasure | null =>
		{
			// NOTE: Binary search (measures are always sorted by their start time)
			let lo = 0, hi = measures.length - 1;
			while (lo <= hi)
			{
				const mid = (lo + hi) >> 1, measure = measures[mid];
				if (beatToFind < measure.StartTime) hi = mid - 1;
				else if (beatToFind >= (measure.StartTime + GetDurationPerBar(measure.TimeSignature))) lo = mid + 1;
				else return measure;
			}
			return null;
		};

		const tempoSorted = inCourse.TempoMap.Tempo.Sorted;
		for (let i = 0; i < tempoSorted.length; i++)
		{
			const inTempoChange = tempoSorted[i];
			if (!(i === 0 && inTempoChange.Tempo.BPM === m.BPM.BPM))
			{
				const outConvertedMeasure = tryFindMeasureForBeat(outConvertedMeasures, inTempoChange.BeatTime);
				if (outConvertedMeasure !== null)
					outConvertedMeasure.TempoChanges.push({ TimeWithinMeasure: (inTempoChange.BeatTime - outConvertedMeasure.StartTime), Tempo: { ...inTempoChange.Tempo } });
			}
		}

		let lastNoteTimeOffset = 0.0;
		for (const inNote of inCourse.Notes_Normal.Sorted)
		{
			const outConvertedMeasure = tryFindMeasureForBeat(outConvertedMeasures, inNote.BeatTime);
			if (outConvertedMeasure !== null)
				outConvertedMeasure.Notes.push({ TimeWithinMeasure: (inNote.BeatTime - outConvertedMeasure.StartTime), Type: ConvertTJANoteTypeToTJA(inNote.Type) });

			if (inNote.BeatDuration > 0)
			{
				const outConvertedMeasureEnd = tryFindMeasureForBeat(outConvertedMeasures, inNote.BeatTime + inNote.BeatDuration);
				if (outConvertedMeasureEnd !== null)
					outConvertedMeasureEnd.Notes.push({ TimeWithinMeasure: ((inNote.BeatTime + inNote.BeatDuration) - outConvertedMeasureEnd.StartTime), Type: TJA.NoteType.End_BalloonOrDrumroll });
			}

			const thisNoteTimeOffset = ApproxmiatelySame(inNote.TimeOffset, 0.0) ? 0.0 : inNote.TimeOffset;
			if (thisNoteTimeOffset !== lastNoteTimeOffset && outConvertedMeasure !== null)
			{
				outConvertedMeasure.DelayChanges.push({ TimeWithinMeasure: (inNote.BeatTime - outConvertedMeasure.StartTime), Delay: thisNoteTimeOffset });
				lastNoteTimeOffset = thisNoteTimeOffset;
			}
		}

		for (const inScroll of inCourse.ScrollChanges.Sorted)
		{
			const outConvertedMeasure = tryFindMeasureForBeat(outConvertedMeasures, inScroll.BeatTime);
			if (outConvertedMeasure !== null)
				outConvertedMeasure.ScrollChanges.push({ TimeWithinMeasure: (inScroll.BeatTime - outConvertedMeasure.StartTime), ScrollSpeed: inScroll.ScrollSpeed });
		}

		for (const barLineChange of inCourse.BarLineChanges.Sorted)
		{
			const outConvertedMeasure = tryFindMeasureForBeat(outConvertedMeasures, barLineChange.BeatTime);
			if (outConvertedMeasure !== null)
				outConvertedMeasure.BarLineChanges.push({ TimeWithinMeasure: (barLineChange.BeatTime - outConvertedMeasure.StartTime), Visibile: barLineChange.IsVisible });
		}

		for (const inLyric of inCourse.Lyrics.Sorted)
		{
			const outConvertedMeasure = tryFindMeasureForBeat(outConvertedMeasures, inLyric.BeatTime);
			if (outConvertedMeasure !== null)
				outConvertedMeasure.LyricChanges.push({ TimeWithinMeasure: (inLyric.BeatTime - outConvertedMeasure.StartTime), Lyric: inLyric.Lyric });
		}

		const outConvertedGoGoRanges: TJA.ConvertedGoGoRange[] = [];
		for (const gogo of inCourse.GoGoRanges.Sorted)
			outConvertedGoGoRanges.push({ StartTime: gogo.BeatTime, EndTime: (gogo.BeatTime + Math.max(0, gogo.BeatDuration)) });

		TJA.ConvertConvertedMeasuresToParsedCommands(outConvertedMeasures, outConvertedGoGoRanges, outCourse.ChartCommands);
	}

	return true;
}

export enum GenericList
{
	TempoChanges,
	SignatureChanges,
	Notes_Normal,
	Notes_Expert,
	Notes_Master,
	ScrollChanges,
	BarLineChanges,
	GoGoRanges,
	Lyrics,
	Count
}

export enum GenericMember
{
	B8_IsSelected,
	B8_BarLineVisible,
	I16_BalloonPopCount,
	F32_ScrollSpeed,
	Beat_Start,
	Beat_Duration,
	Time_Offset,
	NoteType_V,
	Tempo_V,
	TimeSignature_V,
	CStr_Lyric,
	Count
}

export type GenericMemberFlags = number;
export const EnumToFlag = (type: GenericMember): GenericMemberFlags => (1 << type);
export const GenericMemberFlags_None = 0;
export const GenericMemberFlags_IsSelected = EnumToFlag(GenericMember.B8_IsSelected);
export const GenericMemberFlags_BarLineVisible = EnumToFlag(GenericMember.B8_BarLineVisible);
export const GenericMemberFlags_BalloonPopCount = EnumToFlag(GenericMember.I16_BalloonPopCount);
export const GenericMemberFlags_ScrollSpeed = EnumToFlag(GenericMember.F32_ScrollSpeed);
export const GenericMemberFlags_Start = EnumToFlag(GenericMember.Beat_Start);
export const GenericMemberFlags_Duration = EnumToFlag(GenericMember.Beat_Duration);
export const GenericMemberFlags_Offset = EnumToFlag(GenericMember.Time_Offset);
export const GenericMemberFlags_NoteType = EnumToFlag(GenericMember.NoteType_V);
export const GenericMemberFlags_Tempo = EnumToFlag(GenericMember.Tempo_V);
export const GenericMemberFlags_TimeSignature = EnumToFlag(GenericMember.TimeSignature_V);
export const GenericMemberFlags_Lyric = EnumToFlag(GenericMember.CStr_Lyric);
export const GenericMemberFlags_All = 0b11111111111;

export const GenericListNames = ["TempoChanges", "SignatureChanges", "Notes_Normal", "Notes_Expert", "Notes_Master", "ScrollChanges", "BarLineChanges", "GoGoRanges", "Lyrics"];
export const GenericMemberNames = ["IsSelected", "BarLineVisible", "BalloonPopCount", "ScrollSpeed", "Start", "Duration", "Offset", "NoteType", "Tempo", "TimeSignature", "Lyric"];

// NOTE: Replacement for the C++ union, the active member is implied by the GenericMember it is used with
export type GenericMemberValue = boolean | number | NoteType | Tempo | TimeSignature | string;

export function GenericMemberValuesEqual(member: GenericMember, a: GenericMemberValue, b: GenericMemberValue): boolean
{
	if (member === GenericMember.Tempo_V) return (a as Tempo).BPM === (b as Tempo).BPM;
	if (member === GenericMember.TimeSignature_V) return TimeSignatureEquals(a as TimeSignature, b as TimeSignature);
	return a === b;
}

export function CloneGenericMemberValue(member: GenericMember, v: GenericMemberValue): GenericMemberValue
{
	if (member === GenericMember.Tempo_V) return { BPM: (v as Tempo).BPM };
	if (member === GenericMember.TimeSignature_V) return { ...(v as TimeSignature) };
	return v;
}

// NOTE: Default value for each member (equivalent of a zero initialized GenericMemberUnion)
export function DefaultGenericMemberValue(member: GenericMember): GenericMemberValue
{
	switch (member)
	{
		case GenericMember.B8_IsSelected: case GenericMember.B8_BarLineVisible: return false;
		case GenericMember.Tempo_V: return { BPM: 0.0 };
		case GenericMember.TimeSignature_V: return { Numerator: 0, Denominator: 0 };
		case GenericMember.CStr_Lyric: return "";
		default: return 0;
	}
}

export type AllGenericMembersArray = GenericMemberValue[];
export const MakeAllGenericMembersArray = (): AllGenericMembersArray => { const out: GenericMemberValue[] = []; for (let i = 0; i < GenericMember.Count; i++) out.push(DefaultGenericMemberValue(i)); return out; };

// NOTE: Generic list item value (the C++ GenericListStruct union of all types)
export type GenericListItem = TempoChange | TimeSignatureChange | Note | ScrollChange | BarLineChange | GoGoRange | LyricChange;

export interface GenericListStructWithType { List: GenericList; Value: GenericListItem; }

export const IsNotesList = (list: GenericList): boolean => (list === GenericList.Notes_Normal) || (list === GenericList.Notes_Expert) || (list === GenericList.Notes_Master);
export const ListHasDurations = (list: GenericList): boolean => IsNotesList(list) || (list === GenericList.GoGoRanges);
export const ListUsesInclusiveBeatCheck = (list: GenericList): boolean => IsNotesList(list) || (list !== GenericList.GoGoRanges && list !== GenericList.Lyrics);

export function GetGenericListStructBeat(item: GenericListStructWithType): Beat { return item.Value.BeatTime; }
export function GetGenericListStructBeatDuration(item: GenericListStructWithType): Beat { return ListHasDurations(item.List) ? (item.Value.BeatDuration ?? 0) : 0; }
export function SetGenericListStructBeat(item: GenericListStructWithType, newValue: Beat): void { item.Value.BeatTime = newValue; }

export function GetGenericList(course: ChartCourse, list: GenericList): BeatSortedList<GenericListItem>
{
	switch (list)
	{
		case GenericList.TempoChanges: return course.TempoMap.Tempo as BeatSortedList<GenericListItem>;
		case GenericList.SignatureChanges: return course.TempoMap.Signature as BeatSortedList<GenericListItem>;
		case GenericList.Notes_Normal: return course.Notes_Normal as BeatSortedList<GenericListItem>;
		case GenericList.Notes_Expert: return course.Notes_Expert as BeatSortedList<GenericListItem>;
		case GenericList.Notes_Master: return course.Notes_Master as BeatSortedList<GenericListItem>;
		case GenericList.ScrollChanges: return course.ScrollChanges as BeatSortedList<GenericListItem>;
		case GenericList.BarLineChanges: return course.BarLineChanges as BeatSortedList<GenericListItem>;
		case GenericList.GoGoRanges: return course.GoGoRanges as BeatSortedList<GenericListItem>;
		case GenericList.Lyrics: return course.Lyrics as BeatSortedList<GenericListItem>;
		default: throw new Error("Invalid GenericList");
	}
}

export function CloneGenericListItem(list: GenericList, v: GenericListItem): GenericListItem
{
	switch (list)
	{
		case GenericList.TempoChanges: return CloneTempoChange(v as TempoChange);
		case GenericList.SignatureChanges: return CloneTimeSignatureChange(v as TimeSignatureChange);
		case GenericList.Notes_Normal: case GenericList.Notes_Expert: case GenericList.Notes_Master: return CloneNote(v as Note);
		case GenericList.ScrollChanges: return CloneScrollChange(v as ScrollChange);
		case GenericList.BarLineChanges: return CloneBarLineChange(v as BarLineChange);
		case GenericList.GoGoRanges: return CloneGoGoRange(v as GoGoRange);
		case GenericList.Lyrics: return CloneLyricChange(v as LyricChange);
		default: throw new Error("Invalid GenericList");
	}
}

export const CloneGenericListStructWithType = (v: GenericListStructWithType): GenericListStructWithType => ({ List: v.List, Value: CloneGenericListItem(v.List, v.Value) });

export function GetGenericListCount(course: ChartCourse, list: GenericList): number { return GetGenericList(course, list).Sorted.length; }

export function GetAvailableMemberFlags(list: GenericList): GenericMemberFlags
{
	switch (list)
	{
		case GenericList.TempoChanges:
			return GenericMemberFlags_IsSelected | GenericMemberFlags_Start | GenericMemberFlags_Tempo;
		case GenericList.SignatureChanges:
			return GenericMemberFlags_IsSelected | GenericMemberFlags_Start | GenericMemberFlags_TimeSignature;
		case GenericList.Notes_Normal:
		case GenericList.Notes_Expert:
		case GenericList.Notes_Master:
			return GenericMemberFlags_IsSelected | GenericMemberFlags_BalloonPopCount | GenericMemberFlags_Start | GenericMemberFlags_Duration | GenericMemberFlags_Offset | GenericMemberFlags_NoteType;
		case GenericList.ScrollChanges:
			return GenericMemberFlags_IsSelected | GenericMemberFlags_ScrollSpeed | GenericMemberFlags_Start;
		case GenericList.BarLineChanges:
			return GenericMemberFlags_IsSelected | GenericMemberFlags_BarLineVisible | GenericMemberFlags_Start;
		case GenericList.GoGoRanges:
			return GenericMemberFlags_IsSelected | GenericMemberFlags_Start | GenericMemberFlags_Duration;
		case GenericList.Lyrics:
			return GenericMemberFlags_IsSelected | GenericMemberFlags_Start | GenericMemberFlags_Lyric;
		default:
			return GenericMemberFlags_None;
	}
}

const MemberFieldNames: readonly string[] = ["IsSelected", "IsVisible", "BalloonPopCount", "ScrollSpeed", "BeatTime", "BeatDuration", "TimeOffset", "Type", "Tempo", "Signature", "Lyric"];

export function TryGetGeneric(course: ChartCourse, list: GenericList, index: number, member: GenericMember): GenericMemberValue | undefined
{
	if (!(GetAvailableMemberFlags(list) & EnumToFlag(member)))
		return undefined;
	const sorted = GetGenericList(course, list).Sorted;
	if (index < 0 || index >= sorted.length)
		return undefined;
	const value = (sorted[index] as unknown as Record<string, GenericMemberValue>)[MemberFieldNames[member]];
	return CloneGenericMemberValue(member, value);
}

export function TrySetGeneric(course: ChartCourse, list: GenericList, index: number, member: GenericMember, inValue: GenericMemberValue): boolean
{
	if (!(GetAvailableMemberFlags(list) & EnumToFlag(member)))
		return false;
	const sorted = GetGenericList(course, list).Sorted;
	if (index < 0 || index >= sorted.length)
		return false;
	(sorted[index] as unknown as Record<string, GenericMemberValue>)[MemberFieldNames[member]] = CloneGenericMemberValue(member, inValue);
	return true;
}

export function TryGetGenericStruct(course: ChartCourse, list: GenericList, index: number): GenericListItem | null
{
	const sorted = GetGenericList(course, list).Sorted;
	return (index >= 0 && index < sorted.length) ? CloneGenericListItem(list, sorted[index]) : null;
}

export function TrySetGenericStruct(course: ChartCourse, list: GenericList, index: number, inValue: GenericListItem): boolean
{
	const sorted = GetGenericList(course, list).Sorted;
	if (index < 0 || index >= sorted.length)
		return false;
	sorted[index] = CloneGenericListItem(list, inValue);
	return true;
}

export function TryAddGenericStruct(course: ChartCourse, list: GenericList, inValue: GenericListItem): boolean
{
	GetGenericList(course, list).InsertOrUpdate(inValue);
	return true;
}

export function TryRemoveGenericStruct(course: ChartCourse, list: GenericList, beatToRemove: Beat): boolean
{
	GetGenericList(course, list).RemoveAtBeat(beatToRemove);
	return true;
}

export interface ForEachChartItemData { List: GenericList; Index: number; }

export const ChartItemGetIsSelected = (c: ChartCourse, it: ForEachChartItemData): boolean => GetGenericList(c, it.List).Sorted[it.Index].IsSelected;
export const ChartItemSetIsSelected = (c: ChartCourse, it: ForEachChartItemData, isSelected: boolean): void => { GetGenericList(c, it.List).Sorted[it.Index].IsSelected = isSelected; };
export const ChartItemGetBeat = (c: ChartCourse, it: ForEachChartItemData): Beat => GetGenericList(c, it.List).Sorted[it.Index].BeatTime;
export const ChartItemGetBeatDuration = (c: ChartCourse, it: ForEachChartItemData): Beat => ListHasDurations(it.List) ? (GetGenericList(c, it.List).Sorted[it.Index].BeatDuration ?? 0) : 0;
export const ChartItemSetBeat = (c: ChartCourse, it: ForEachChartItemData, beat: Beat): void => { GetGenericList(c, it.List).Sorted[it.Index].BeatTime = beat; };

export function ForEachChartItem(course: ChartCourse, perItemFunc: (it: ForEachChartItemData) => void): void
{
	for (let list = 0; list < GenericList.Count; list++)
	{
		const count = GetGenericListCount(course, list);
		for (let i = 0; i < count; i++)
			perItemFunc({ List: list, Index: i });
	}
}

export function ForEachSelectedChartItem(course: ChartCourse, perSelectedItemFunc: (it: ForEachChartItemData) => void): void
{
	for (let list = 0; list < GenericList.Count; list++)
	{
		const sorted = GetGenericList(course, list).Sorted;
		for (let i = 0; i < sorted.length; i++)
			if (sorted[i].IsSelected)
				perSelectedItemFunc({ List: list, Index: i });
	}
}

export function DebugCompareCharts(chartA: ChartProject, chartB: ChartProject, onMessageFunc: (message: string) => void): void
{
	if (chartA.Courses.length !== chartB.Courses.length) { onMessageFunc(`Course count mismatch (${chartA.Courses.length} != ${chartB.Courses.length})`); return; }

	for (let i = 0; i < chartA.Courses.length; i++)
	{
		const courseA = chartA.Courses[i], courseB = chartB.Courses[i];
		for (let list = 0; list < GenericList.Count; list++)
		{
			const countA = GetGenericListCount(courseA, list), countB = GetGenericListCount(courseB, list);
			if (countA !== countB) { onMessageFunc(`${GenericListNames[list]} count mismatch (${countA} != ${countB})`); continue; }

			for (let itemIndex = 0; itemIndex < countA; itemIndex++)
			{
				for (let member = 0; member < GenericMember.Count; member++)
				{
					if (member === GenericMember.B8_IsSelected)
						continue;
					const valueA = TryGetGeneric(courseA, list, itemIndex, member), valueB = TryGetGeneric(courseB, list, itemIndex, member);
					if (valueA === undefined || valueB === undefined)
						continue;
					const isSame = (member === GenericMember.Time_Offset) ? ApproxmiatelySame(valueA as number, valueB as number) : GenericMemberValuesEqual(member, valueA, valueB);
					if (!isSame)
						onMessageFunc(`${GenericListNames[list]}[${itemIndex}].${GenericMemberNames[member]} value mismatch`);
				}
			}
		}
	}
}

export function MakeTempoChangeCopy(v: TempoChange): TempoChange { return CloneTempoChange(v); }
export function MakeSignatureChangeCopy(v: TimeSignatureChange): TimeSignatureChange { return CloneTimeSignatureChange(v); }
export type { TimeSignature, Tempo };
