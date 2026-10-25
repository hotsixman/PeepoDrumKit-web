// Port of PeepoDrumKit "file_format_tja.h" / "file_format_tja.cpp"
// https://github.com/samyuu/PeepoDrumKit
//
// NOTE: "Token" -> smallest atomic piece of data.
//		 A list of tokens basically losslessly represents a TJA file and exists to make parsing easier.
//
//		 "Parsing" a list of tokens results in plain metadata structs with all of the property keys resolved
//		 as well as a list of chart commands per difficulty course. (comments however are not stored)
//		 Parsed data can represent any well formatted TJA (given that it doesn't contain unknown commands, metadata or ill formatted parameters)
//		 even if it contains bad chart commands such as improper branches.
//
//		 "Converting" a parsed TJA then results in an easy to access / modify chart data representation
//		 which has beat timings converted to fixed point units, empty notes removed and tempo changes etc. are no longer interleaved.
import * as ASCII from "../core/string";
import { type Time, FromPercent, ToPercent, ApproxmiatelySame, FormatG, IDiv, type DateYMD, DateZero, DateFromString, DateToString, DateEquals } from "../core/types";
import { type Beat, type Tempo, type TimeSignature, Tempo as MakeTempo, TimeSignature as MakeTimeSignature, BeatFromBars, GetDurationPerBar, TimeSignatureEquals, IsTimeSignatureSupported } from "../core/beat";

export const Extension = ".tja";
export const FilterName = "TJA Taiko Chart";

export enum Encoding { Unknown, UTF8, ShiftJIS }

export enum TokenType
{
	Unknown,
	// NOTE: ...
	EmptyLine,
	// NOTE: // comment
	Comment,
	// NOTE: KEY:VALUE
	KeyColonValue,
	// NOTE: #COMMAND
	HashChartCommand,
	// NOTE: 10101010,
	ChartData,
	Count
}

export enum Key
{
	Unknown,

	// NOTE: Once per file
	Main_TITLE, Main_TITLEJA, Main_TITLEEN, Main_TITLECN, Main_TITLETW, Main_TITLEKO,
	Main_SUBTITLE, Main_SUBTITLEJA, Main_SUBTITLEEN, Main_SUBTITLECN, Main_SUBTITLETW, Main_SUBTITLEKO,
	Main_BPM, Main_WAVE, Main_OFFSET, Main_DEMOSTART, Main_GENRE, Main_SCOREMODE, Main_MAKER, Main_LYRICS,
	Main_SONGVOL, Main_SEVOL, Main_SIDE, Main_LIFE, Main_GAME, Main_HEADSCROLL, Main_BGIMAGE, Main_BGMOVIE,
	Main_MOVIEOFFSET, Main_TAIKOWEBSKIN,

	// NOTE: Once per difficulty course
	Course_COURSE, Course_LEVEL, Course_BALLOON, Course_SCOREINIT, Course_SCOREDIFF,
	Course_BALLOONNOR, Course_BALLOONEXP, Course_BALLOONMAS, Course_STYLE,
	Course_NOTESDESIGNER0, Course_NOTESDESIGNER1, Course_NOTESDESIGNER2, Course_NOTESDESIGNER3, Course_NOTESDESIGNER4,
	Course_EXAM1, Course_EXAM2, Course_EXAM3, Course_GAUGEINCR, Course_TOTAL, Course_HIDDENBRANCH,

	// NOTE: Chart song notation
	Chart_START, Chart_END, Chart_MEASURE, Chart_BPMCHANGE, Chart_DELAY, Chart_SCROLL, Chart_GOGOSTART, Chart_GOGOEND,
	Chart_BARLINEOFF, Chart_BARLINEON, Chart_BRANCHSTART, Chart_N, Chart_E, Chart_M, Chart_BRANCHEND, Chart_SECTION,
	Chart_LYRIC, Chart_LEVELHOLD, Chart_BMSCROLL, Chart_HBSCROLL, Chart_SENOTECHANGE, Chart_NEXTSONG, Chart_DIRECTION,
	Chart_SUDDEN, Chart_JPOSSCROLL,
	Count,
}

const Main_First = Key.Main_TITLE, Main_Last = Key.Main_TAIKOWEBSKIN;
const Course_First = Key.Course_COURSE, Course_Last = Key.Course_HIDDENBRANCH;
const Chart_First = Key.Chart_START, Chart_Last = Key.Chart_JPOSSCROLL;
const KeyColonValue_First = Main_First, KeyColonValue_Last = Course_Last;
const HashCommand_First = Chart_First, HashCommand_Last = Chart_Last;

// NOTE: Comment marker stored in the format: "// PeepoDrumKit yyyy/MM/dd"
const PeepoDrumKitCommentMarkerPrefix = "PeepoDrumKit";

const KeyStrings: readonly string[] =
[
	"",
	// NOTE: Main_
	"TITLE", "TITLEJA", "TITLEEN", "TITLECN", "TITLETW", "TITLEKO",
	"SUBTITLE", "SUBTITLEJA", "SUBTITLEEN", "SUBTITLECN", "SUBTITLETW", "SUBTITLEKO",
	"BPM", "WAVE", "OFFSET", "DEMOSTART", "GENRE", "SCOREMODE", "MAKER", "LYRICS",
	"SONGVOL", "SEVOL", "SIDE", "LIFE", "GAME", "HEADSCROLL", "BGIMAGE", "BGMOVIE",
	"MOVIEOFFSET", "TAIKOWEBSKIN",
	// NOTE: Course_
	"COURSE", "LEVEL", "BALLOON", "SCOREINIT", "SCOREDIFF",
	"BALLOONNOR", "BALLOONEXP", "BALLOONMAS", "STYLE",
	"NOTESDESIGNER0", "NOTESDESIGNER1", "NOTESDESIGNER2", "NOTESDESIGNER3", "NOTESDESIGNER4",
	"EXAM1", "EXAM2", "EXAM3", "GAUGEINCR", "TOTAL", "HIDDENBRANCH",
	// NOTE: Chart_
	"START", "END", "MEASURE", "BPMCHANGE", "DELAY", "SCROLL", "GOGOSTART", "GOGOEND",
	"BARLINEOFF", "BARLINEON", "BRANCHSTART", "N", "E", "M", "BRANCHEND", "SECTION",
	"LYRIC", "LEVELHOLD", "BMSCROLL", "HBSCROLL", "SENOTECHANGE", "NEXTSONG", "DIRECTION",
	"SUDDEN", "JPOSSCROLL",
];

if (KeyStrings.length !== Key.Count)
	throw new Error("TJA KeyStrings / Key enum mismatch");

export interface Token
{
	Type: TokenType;
	Key: Key;
	LineIndex: number;
	Line: string;
	KeyString: string;
	ValueString: string;
}

export const DefaultTempo: Tempo = MakeTempo(120.0);
export const DefaultTimeSignature: TimeSignature = MakeTimeSignature(4, 4);

export enum DifficultyType { Easy, Normal, Hard, Oni, OniUra, Tower, Dan, Count }

export enum NoteType
{
	// NOTE: "x"
	None,
	// NOTE: "ドン"
	Don,
	// NOTE: "カッ"
	Ka,
	// NOTE: "ドン（大）"
	DonBig,
	// NOTE: "カッ（大）"
	KaBig,
	// NOTE: "連打開始"
	Start_Drumroll,
	// NOTE: "連打（大）開始"
	Start_DrumrollBig,
	// NOTE: "ゴーゴー連打開始"
	Start_Balloon,
	// NOTE: "連打終了"
	End_BalloonOrDrumroll,
	// NOTE: "イモ連打開始"
	Start_BaloonSpecial,
	// NOTE: Multiplayer
	DonBigBoth,
	KaBigBoth,
	Hidden,
	Count
}

export enum ScrollDirection { FromRight, FromAbove, FromBelow, FromTopRight, FromBottomRight, FromLeft, FromTopLeft, FromBottomLeft, Count }
export enum BranchCondition { Roll, Precise, Score, Count }
export enum StyleMode { Single, Double, Count }
export enum GaugeIncrementMethod { Normal, Floor, Round, NotFix, Ceiling, Count }
export enum ScoreMode { AC1_To_AC7, AC8_To_AC14, AC0, Count }
export enum SongSelectSide { Normal, Ex, Both, Count }
export enum GameType { Taiko, Jubeat, Count }

export interface ParsedMainMetadata
{
	TITLE: string; TITLE_JA: string; TITLE_EN: string; TITLE_CN: string; TITLE_TW: string; TITLE_KO: string;
	SUBTITLE: string; SUBTITLE_JA: string; SUBTITLE_EN: string; SUBTITLE_CN: string; SUBTITLE_TW: string; SUBTITLE_KO: string;
	WAVE: string; BGIMAGE: string; BGMOVIE: string; LYRICS: string; MAKER: string;
	BPM: Tempo;
	HEADSCROLL: number;
	OFFSET: Time; MOVIEOFFSET: Time; DEMOSTART: Time;
	SONGVOL: number; SEVOL: number;
	SCOREMODE: ScoreMode;
	SIDE: SongSelectSide;
	LIFE: number;
	GENRE: string;
	GAME: GameType;
	TAIKOWEBSKIN: string;
}

export const ParsedMainMetadataDefault = (): ParsedMainMetadata => ({
	TITLE: "", TITLE_JA: "", TITLE_EN: "", TITLE_CN: "", TITLE_TW: "", TITLE_KO: "",
	SUBTITLE: "", SUBTITLE_JA: "", SUBTITLE_EN: "", SUBTITLE_CN: "", SUBTITLE_TW: "", SUBTITLE_KO: "",
	WAVE: "", BGIMAGE: "", BGMOVIE: "", LYRICS: "", MAKER: "",
	BPM: { ...DefaultTempo }, HEADSCROLL: 1.0, OFFSET: 0.0, MOVIEOFFSET: 0.0, DEMOSTART: 0.0,
	SONGVOL: 1.0, SEVOL: 1.0, SCOREMODE: ScoreMode.AC1_To_AC7, SIDE: SongSelectSide.Both, LIFE: 0,
	GENRE: "", GAME: GameType.Taiko, TAIKOWEBSKIN: "",
});

export interface ParsedCourseMetadata
{
	COURSE: DifficultyType;
	LEVEL: number;
	BALLOON: number[]; BALLOON_Normal: number[]; BALLOON_Expert: number[]; BALLOON_Master: number[];
	SCOREINIT: number; SCOREDIFF: number;
	STYLE: StyleMode;
	NOTESDESIGNER: string;
	EXAM1: string; EXAM2: string; EXAM3: string;
	GAUGEINCR: GaugeIncrementMethod;
	TOTAL: number;
	HIDDENBRANCH: number;
}

export const ParsedCourseMetadataDefault = (): ParsedCourseMetadata => ({
	COURSE: DifficultyType.Oni, LEVEL: 1,
	BALLOON: [], BALLOON_Normal: [], BALLOON_Expert: [], BALLOON_Master: [],
	SCOREINIT: 0, SCOREDIFF: 0, STYLE: StyleMode.Single, NOTESDESIGNER: "",
	EXAM1: "", EXAM2: "", EXAM3: "", GAUGEINCR: GaugeIncrementMethod.Normal, TOTAL: 0, HIDDENBRANCH: 0,
});

export enum ParsedChartCommandType
{
	Unknown,
	MeasureNotes, MeasureEnd,
	ChangeTimeSignature, ChangeTempo, ChangeDelay, ChangeScrollSpeed, ChangeBarLine,
	GoGoStart, GoGoEnd,
	BranchStart, BranchNormal, BranchExpert, BranchMaster, BranchEnd, BranchLevelHold,
	ResetAccuracyValues, SetLyricLine,
	BMScroll, HBScroll, SENoteChange, SetNextSong, ChangeDirection,
	SetSudden, SetScrollTransition,
	Count
}

export interface ParsedChartCommandParam
{
	MeasureNotes: { Notes: NoteType[] };
	ChangeTimeSignature: { Value: TimeSignature };
	ChangeTempo: { Value: Tempo };
	ChangeDelay: { Value: Time };
	ChangeScrollSpeed: { Value: number };
	ChangeBarLine: { Visible: boolean };
	BranchStart: { Condition: BranchCondition; RequirementExpert: number; RequirementMaster: number };
	SetLyricLine: { Value: string };
	SENoteChange: { Type: number };
	SetNextSong: { CommaSeparatedList: string };
	ChangeDirection: { Direction: ScrollDirection };
	SetSudden: { AppearanceOffset: Time; MovementWaitDelay: Time };
	SetScrollTransition: { Duration: Time; MovementDistance: number; Direction: ScrollDirection };
}

const ParsedChartCommandParamDefault = (): ParsedChartCommandParam => ({
	MeasureNotes: { Notes: [] },
	ChangeTimeSignature: { Value: MakeTimeSignature(0, 0) },
	ChangeTempo: { Value: MakeTempo(0.0) },
	ChangeDelay: { Value: 0.0 },
	ChangeScrollSpeed: { Value: 0.0 },
	ChangeBarLine: { Visible: false },
	BranchStart: { Condition: BranchCondition.Roll, RequirementExpert: 0, RequirementMaster: 0 },
	SetLyricLine: { Value: "" },
	SENoteChange: { Type: 0 },
	SetNextSong: { CommaSeparatedList: "" },
	ChangeDirection: { Direction: ScrollDirection.FromRight },
	SetSudden: { AppearanceOffset: 0.0, MovementWaitDelay: 0.0 },
	SetScrollTransition: { Duration: 0.0, MovementDistance: 0.0, Direction: ScrollDirection.FromRight },
});

export interface ParsedChartCommand { Type: ParsedChartCommandType; Param: ParsedChartCommandParam; }
export const MakeParsedChartCommand = (type: ParsedChartCommandType): ParsedChartCommand => ({ Type: type, Param: ParsedChartCommandParamDefault() });

export interface ParsedCourse { Metadata: ParsedCourseMetadata; ChartCommands: ParsedChartCommand[]; }
export const MakeParsedCourse = (): ParsedCourse => ({ Metadata: ParsedCourseMetadataDefault(), ChartCommands: [] });

export interface ParsedTJA
{
	Metadata: ParsedMainMetadata;
	Courses: ParsedCourse[];

	// NOTE: Only for internal use within PeepoDrumKit. TJAs that have been exported with this special comment marker
	//		 are assumed to only make use of known and supported features that can be safely converted without having to worry about potential data loss
	HasPeepoDrumKitComment: boolean;
	PeepoDrumKitCommentDate: DateYMD;
}
export const MakeParsedTJA = (): ParsedTJA => ({ Metadata: ParsedMainMetadataDefault(), Courses: [], HasPeepoDrumKitComment: false, PeepoDrumKitCommentDate: DateZero() });

export interface ErrorLine { LineIndex: number; Description: string; }
export class ErrorList
{
	Errors: ErrorLine[] = [];
	Push(lineIndex: number, description: string): void { this.Errors.push({ LineIndex: lineIndex, Description: description }); }
	Clear(): void { this.Errors = []; }
}

interface LinePrefixCommentSuffixSplit { LinePrefix: string; CommentSuffix: string; }

function SplitLineIntoPrefixAndCommentSuffix(line: string): LinePrefixCommentSuffixSplit
{
	const index = line.indexOf("//");
	if (index >= 0)
		return { LinePrefix: line.substring(0, index), CommentSuffix: line.substring(index) };
	return { LinePrefix: line, CommentSuffix: "" };
}

export function SplitLines(fileContent: string): string[]
{
	const outLines: string[] = [];
	ASCII.ForEachLineInMultiLineString(fileContent, false, (line) => { outLines.push(line); });
	return outLines;
}

// NOTE: Designed to never fail, invalid input data just means a different arrangements of (unknown / bad) tokens
export function TokenizeLines(lines: readonly string[]): Token[]
{
	const outTokens: Token[] = [];
	let currentlyBetweenChartStartAndEnd = false;

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++)
	{
		const lineFull = lines[lineIndex];
		let lineTrimmed = ASCII.Trim(lineFull);

		if (lineTrimmed.length === 0 || ASCII.IsAllWhitespace(lineTrimmed))
		{
			outTokens.push({ Type: TokenType.EmptyLine, Key: Key.Unknown, LineIndex: lineIndex, Line: lineTrimmed, KeyString: "", ValueString: "" });
		}
		else
		{
			const lineCommentSplit = SplitLineIntoPrefixAndCommentSuffix(lineTrimmed);
			if (lineCommentSplit.CommentSuffix.length > 0)
				lineTrimmed = ASCII.Trim(lineCommentSplit.LinePrefix);

			if (lineTrimmed.length > 0)
			{
				const newToken: Token = { Type: TokenType.Unknown, Key: Key.Unknown, LineIndex: lineIndex, Line: lineTrimmed, KeyString: "", ValueString: "" };
				outTokens.push(newToken);

				const colonSeparator = lineTrimmed.indexOf(':');
				if (lineTrimmed[0] === '#')
				{
					newToken.Type = TokenType.HashChartCommand;
					const spaceSeparator = lineTrimmed.indexOf(' ');
					if (spaceSeparator >= 0)
					{
						newToken.KeyString = lineTrimmed.substring(1, spaceSeparator);
						newToken.ValueString = lineTrimmed.substring(spaceSeparator + 1);
					}
					else
					{
						newToken.KeyString = lineTrimmed.substring(1);
						newToken.ValueString = "";
					}

					for (let i = HashCommand_First; i <= HashCommand_Last; i++)
						if (newToken.KeyString === KeyStrings[i]) { newToken.Key = i as Key; break; }

					if (newToken.Key === Key.Chart_START)
						currentlyBetweenChartStartAndEnd = true;
					else if (newToken.Key === Key.Chart_END)
						currentlyBetweenChartStartAndEnd = false;
				}
				else if (colonSeparator >= 0)
				{
					newToken.Type = TokenType.KeyColonValue;
					newToken.KeyString = lineTrimmed.substring(0, colonSeparator);
					newToken.ValueString = lineTrimmed.substring(colonSeparator + 1);

					for (let i = KeyColonValue_First; i <= KeyColonValue_Last; i++)
						if (newToken.KeyString === KeyStrings[i]) { newToken.Key = i as Key; break; }
				}
				else
				{
					newToken.Type = currentlyBetweenChartStartAndEnd ? TokenType.ChartData : TokenType.Unknown;
					newToken.KeyString = "";
					newToken.ValueString = lineTrimmed;
				}
			}

			if (lineCommentSplit.CommentSuffix.length > 0)
			{
				outTokens.push({
					Type: TokenType.Comment, Key: Key.Unknown, LineIndex: lineIndex, Line: lineTrimmed, KeyString: "",
					ValueString: ASCII.Trim(lineCommentSplit.CommentSuffix.substring(2)),
				});
			}
		}
	}

	return outTokens;
}

const tryParseI32 = (inStr: string): number | null => (inStr.length === 0) ? 0 : ASCII.TryParseI32(inStr);
const tryParseF32 = (inStr: string): number | null => (inStr.length === 0) ? 0.0 : ASCII.TryParseF32(inStr);
function tryParseCommaSeapratedI32s(inStr: string, out: number[]): boolean
{
	let allSuccessful = true;
	ASCII.ForEachInCommaSeparatedList(inStr, (i32String) =>
	{
		const v = ASCII.TryParseI32(ASCII.Trim(i32String));
		allSuccessful = allSuccessful && (v !== null);
		out.push(v ?? 0);
	});
	return allSuccessful;
}
function tryParseDifficultyType(inStr: string): DifficultyType | null
{
	const v = ASCII.TryParseI32(inStr);
	if (v !== null) return v as DifficultyType;
	if (ASCII.MatchesInsensitive(inStr, "easy")) return DifficultyType.Easy;
	if (ASCII.MatchesInsensitive(inStr, "normal")) return DifficultyType.Normal;
	if (ASCII.MatchesInsensitive(inStr, "hard")) return DifficultyType.Hard;
	if (ASCII.MatchesInsensitive(inStr, "oni")) return DifficultyType.Oni;
	if (ASCII.MatchesInsensitive(inStr, "edit")) return DifficultyType.OniUra;
	if (ASCII.MatchesInsensitive(inStr, "tower")) return DifficultyType.Tower;
	if (ASCII.MatchesInsensitive(inStr, "dan")) return DifficultyType.Dan;
	if (ASCII.MatchesInsensitive(inStr, "ura")) return DifficultyType.OniUra;
	return null;
}
const tryParseTime = (inStr: string): Time | null => (inStr.length === 0) ? 0.0 : ASCII.TryParseF32(inStr);
const tryParseTempo = (inStr: string): Tempo | null => { if (inStr.length === 0) return MakeTempo(0.0); const v = ASCII.TryParseF32(inStr); return (v !== null) ? MakeTempo(v) : null; };
const tryParsePercent = (inStr: string): number | null => { if (inStr.length === 0) return 0.0; const v = ASCII.TryParseF32(inStr); return (v !== null) ? FromPercent(v) : null; };
function tryParseTimeSignature(inStr: string): TimeSignature | null
{
	const splitIndex = inStr.indexOf("/");
	if (splitIndex < 0)
		return null;

	const outNum = ASCII.TryParseI32(ASCII.Trim(inStr.substring(0, splitIndex)));
	const outDen = ASCII.TryParseI32(ASCII.Trim(inStr.substring(splitIndex + 1)));
	if (outNum !== null && outDen !== null)
		return MakeTimeSignature(Math.max(1, outNum), Math.max(1, outDen));
	return null;
}
function tryParseNoteTypeChar(c: string): NoteType | null
{
	switch (c)
	{
		case '0': return NoteType.None;
		case '1': return NoteType.Don;
		case '2': return NoteType.Ka;
		case '3': return NoteType.DonBig;
		case '4': return NoteType.KaBig;
		case '5': return NoteType.Start_Drumroll;
		case '6': return NoteType.Start_DrumrollBig;
		case '7': return NoteType.Start_Balloon;
		case '8': return NoteType.End_BalloonOrDrumroll;
		case '9': return NoteType.Start_BaloonSpecial;
		case 'A': return NoteType.DonBigBoth;
		case 'B': return NoteType.KaBigBoth;
		case 'F': return NoteType.Hidden;
		default: return null;
	}
}
function tryParseScoreMode(inStr: string): ScoreMode | null
{
	if (inStr === "0") return ScoreMode.AC1_To_AC7;
	if (inStr === "1") return ScoreMode.AC8_To_AC14;
	if (inStr === "2") return ScoreMode.AC0;
	return null;
}
function tryParseSongSelectSide(inStr: string): SongSelectSide | null
{
	// NOTE: Matches the original which (likely unintentionally) always outputs SongSelectSide::Normal
	if (ASCII.MatchesInsensitive(inStr, "Normal") || inStr === "1") return SongSelectSide.Normal;
	if (ASCII.MatchesInsensitive(inStr, "Ex") || inStr === "2") return SongSelectSide.Normal;
	if (ASCII.MatchesInsensitive(inStr, "Both") || inStr === "3") return SongSelectSide.Normal;
	return null;
}
function tryParseGameType(inStr: string): GameType | null
{
	if (ASCII.MatchesInsensitive(inStr, "Taiko")) return GameType.Taiko;
	if (ASCII.MatchesInsensitive(inStr, "Jube")) return GameType.Jubeat;
	return null;
}
const tryParseScrollDirection = (inStr: string): ScrollDirection => { const v = ASCII.TryParseI32(inStr); return (v !== null) ? v as ScrollDirection : ScrollDirection.FromRight; };
function tryParseBranchCondition(inStr: string): BranchCondition
{
	if (ASCII.MatchesInsensitive(inStr, "r")) return BranchCondition.Roll;
	if (ASCII.MatchesInsensitive(inStr, "p")) return BranchCondition.Precise;
	if (ASCII.MatchesInsensitive(inStr, "s")) return BranchCondition.Score;
	return BranchCondition.Precise;
}
function tryParseStyleMode(inStr: string): StyleMode | null
{
	if (ASCII.MatchesInsensitive(inStr, "Single") || inStr === "1") return StyleMode.Single;
	if (ASCII.MatchesInsensitive(inStr, "Double") || ASCII.MatchesInsensitive(inStr, "Couple") || inStr === "2") return StyleMode.Double;
	return null;
}
function tryParseGaugeIncrementMethod(inStr: string): GaugeIncrementMethod
{
	if (ASCII.MatchesInsensitive(inStr, "NORMAL")) return GaugeIncrementMethod.Normal;
	if (ASCII.MatchesInsensitive(inStr, "FLOOR")) return GaugeIncrementMethod.Floor;
	if (ASCII.MatchesInsensitive(inStr, "ROUND")) return GaugeIncrementMethod.Round;
	if (ASCII.MatchesInsensitive(inStr, "NOTFIX")) return GaugeIncrementMethod.NotFix;
	if (ASCII.MatchesInsensitive(inStr, "CEILING")) return GaugeIncrementMethod.Ceiling;
	return GaugeIncrementMethod.Normal;
}

export function ParseTokens(tokens: readonly Token[], outErrors: ErrorList): ParsedTJA
{
	const outTJA = MakeParsedTJA();
	let currentCourse: ParsedCourse | null = null;

	let currentlyBetweenChartStartAndEnd = false;
	let currentlyBetweenGoGoStartAndEnd = false;
	let currentlyInBetweenMeasure = false;

	const pushChartCommand = (type: ParsedChartCommandType): ParsedChartCommand =>
	{
		if (currentCourse === null)
		{
			currentCourse = MakeParsedCourse();
			outTJA.Courses.push(currentCourse);
		}
		const newCommand = MakeParsedChartCommand(type);
		currentCourse.ChartCommands.push(newCommand);
		return newCommand;
	};

	for (const token of tokens)
	{
		const lineIndex = token.LineIndex;
		switch (token.Type)
		{
			case TokenType.Unknown:
			{
				outErrors.Push(lineIndex, `Unknown data '${token.Line}'`);
			} break;

			case TokenType.EmptyLine:
			{
				// ...
			} break;

			case TokenType.Comment:
			{
				if (!outTJA.HasPeepoDrumKitComment && ASCII.StartsWith(token.ValueString, PeepoDrumKitCommentMarkerPrefix))
				{
					outTJA.HasPeepoDrumKitComment = true;
					outTJA.PeepoDrumKitCommentDate = DateZero();

					let comment = token.ValueString.substring(PeepoDrumKitCommentMarkerPrefix.length);
					comment = ASCII.Trim(comment);
					comment = ASCII.TrimSuffix(ASCII.TrimPrefix(comment, "("), ")");
					if (comment.length > 0)
						outTJA.PeepoDrumKitCommentDate = DateFromString(comment.substring(0, 11), '/');
				}
			} break;

			case TokenType.KeyColonValue:
			{
				if (token.Key >= Main_First && token.Key <= Main_Last)
				{
					const inStr = ASCII.Trim(token.ValueString);
					const out = outTJA.Metadata;
					switch (token.Key)
					{
						case Key.Main_TITLE: { out.TITLE = inStr; } break;
						case Key.Main_TITLEJA: { out.TITLE_JA = inStr; } break;
						case Key.Main_TITLEEN: { out.TITLE_EN = inStr; } break;
						case Key.Main_TITLECN: { out.TITLE_CN = inStr; } break;
						case Key.Main_TITLETW: { out.TITLE_TW = inStr; } break;
						case Key.Main_TITLEKO: { out.TITLE_KO = inStr; } break;
						case Key.Main_SUBTITLE: { out.SUBTITLE = inStr; } break;
						case Key.Main_SUBTITLEJA: { out.SUBTITLE_JA = inStr; } break;
						case Key.Main_SUBTITLEEN: { out.SUBTITLE_EN = inStr; } break;
						case Key.Main_SUBTITLECN: { out.SUBTITLE_CN = inStr; } break;
						case Key.Main_SUBTITLETW: { out.SUBTITLE_TW = inStr; } break;
						case Key.Main_SUBTITLEKO: { out.SUBTITLE_KO = inStr; } break;
						case Key.Main_BPM: { const v = tryParseTempo(inStr); if (v === null) { outErrors.Push(lineIndex, `Invalid tempo '${inStr}'`); } else { out.BPM = v; } } break;
						case Key.Main_WAVE: { out.WAVE = inStr; } break;
						case Key.Main_OFFSET: { const v = tryParseTime(inStr); if (v === null) { outErrors.Push(lineIndex, `Invalid float '${inStr}'`); } else { out.OFFSET = v; } } break;
						case Key.Main_DEMOSTART: { const v = tryParseTime(inStr); if (v === null) { outErrors.Push(lineIndex, `Invalid float '${inStr}'`); } else { out.DEMOSTART = v; } } break;
						case Key.Main_GENRE: { out.GENRE = inStr; } break;
						case Key.Main_SCOREMODE: { const v = tryParseScoreMode(inStr); if (v === null) { outErrors.Push(lineIndex, `Unknown score mode '${inStr}'`); } else { out.SCOREMODE = v; } } break;
						case Key.Main_MAKER: { out.MAKER = inStr; } break;
						case Key.Main_LYRICS: { out.LYRICS = inStr; } break;
						case Key.Main_SONGVOL: { const v = tryParsePercent(inStr); if (v === null) { outErrors.Push(lineIndex, `Invalid float '${inStr}'`); } else { out.SONGVOL = v; } } break;
						case Key.Main_SEVOL: { const v = tryParsePercent(inStr); if (v === null) { outErrors.Push(lineIndex, `Invalid float '${inStr}'`); } else { out.SEVOL = v; } } break;
						case Key.Main_SIDE: { const v = tryParseSongSelectSide(inStr); if (v === null) { outErrors.Push(lineIndex, `Unknown side '${inStr}'`); } else { out.SIDE = v; } } break;
						case Key.Main_LIFE: { const v = tryParseI32(inStr); if (v === null) { outErrors.Push(lineIndex, `Invalid int '${inStr}'`); } else { out.LIFE = v; } } break;
						case Key.Main_GAME: { const v = tryParseGameType(inStr); if (v === null) { outErrors.Push(lineIndex, `Unknown game type '${inStr}'`); } else { out.GAME = v; } } break;
						case Key.Main_HEADSCROLL: { const v = tryParseF32(inStr); if (v === null) { outErrors.Push(lineIndex, `Invalid float '${inStr}'`); } else { out.HEADSCROLL = v; } } break;
						case Key.Main_BGIMAGE: { out.BGIMAGE = inStr; } break;
						case Key.Main_BGMOVIE: { out.BGMOVIE = inStr; } break;
						case Key.Main_MOVIEOFFSET: { const v = tryParseTime(inStr); if (v === null) { outErrors.Push(lineIndex, `Invalid float '${inStr}'`); } else { out.MOVIEOFFSET = v; } } break;
						case Key.Main_TAIKOWEBSKIN: { out.TAIKOWEBSKIN = inStr; } break;
					}
				}
				else if (token.Key >= Course_First && token.Key <= Course_Last)
				{
					if (currentCourse === null)
					{
						currentCourse = MakeParsedCourse();
						outTJA.Courses.push(currentCourse);
					}

					const inStr = ASCII.Trim(token.ValueString);
					const out = currentCourse.Metadata;
					switch (token.Key)
					{
						case Key.Course_COURSE: { const v = tryParseDifficultyType(inStr); if (v === null) { outErrors.Push(lineIndex, `Invalid difficulty '${inStr}'`); } else { out.COURSE = v; } } break;
						case Key.Course_LEVEL: { const v = tryParseI32(inStr); if (v === null) { outErrors.Push(lineIndex, `Invalid int '${inStr}'`); } else { out.LEVEL = v; } } break;
						case Key.Course_BALLOON: { if (!tryParseCommaSeapratedI32s(inStr, out.BALLOON)) { outErrors.Push(lineIndex, `Invalid int in comma separated list '${inStr}'`); } } break;
						case Key.Course_SCOREINIT: { const v = tryParseI32(inStr); if (v === null) { outErrors.Push(lineIndex, `Invalid int '${inStr}'`); } else { out.SCOREINIT = v; } } break;
						case Key.Course_SCOREDIFF: { const v = tryParseI32(inStr); if (v === null) { outErrors.Push(lineIndex, `Invalid int '${inStr}'`); } else { out.SCOREDIFF = v; } } break;
						case Key.Course_BALLOONNOR: { if (!tryParseCommaSeapratedI32s(inStr, out.BALLOON_Normal)) { outErrors.Push(lineIndex, `Invalid int in comma separated list '${inStr}'`); } } break;
						case Key.Course_BALLOONEXP: { if (!tryParseCommaSeapratedI32s(inStr, out.BALLOON_Expert)) { outErrors.Push(lineIndex, `Invalid int in comma separated list '${inStr}'`); } } break;
						case Key.Course_BALLOONMAS: { if (!tryParseCommaSeapratedI32s(inStr, out.BALLOON_Master)) { outErrors.Push(lineIndex, `Invalid int in comma separated list '${inStr}'`); } } break;
						case Key.Course_STYLE: { const v = tryParseStyleMode(inStr); if (v === null) { out.STYLE = StyleMode.Single; outErrors.Push(lineIndex, `Unknown style mode '${inStr}'`); } else { out.STYLE = v; } } break;
						case Key.Course_NOTESDESIGNER0: { out.NOTESDESIGNER = inStr; } break;
						case Key.Course_NOTESDESIGNER1: { out.NOTESDESIGNER = inStr; } break;
						case Key.Course_NOTESDESIGNER2: { out.NOTESDESIGNER = inStr; } break;
						case Key.Course_NOTESDESIGNER3: { out.NOTESDESIGNER = inStr; } break;
						case Key.Course_NOTESDESIGNER4: { out.NOTESDESIGNER = inStr; } break;
						case Key.Course_EXAM1: { out.EXAM1 = inStr; } break;
						case Key.Course_EXAM2: { out.EXAM2 = inStr; } break;
						case Key.Course_EXAM3: { out.EXAM3 = inStr; } break;
						case Key.Course_GAUGEINCR: { out.GAUGEINCR = tryParseGaugeIncrementMethod(inStr); } break;
						case Key.Course_TOTAL: { /* NOTE: Unused by the original */ } break;
						case Key.Course_HIDDENBRANCH: { const v = tryParseI32(inStr); if (v === null) { outErrors.Push(lineIndex, `Invalid int '${inStr}'`); } else { out.HIDDENBRANCH = v; } } break;
					}
				}
				else
				{
					outErrors.Push(lineIndex, `Unknown property '${token.KeyString}'`);
				}
			} break;

			case TokenType.HashChartCommand:
			{
				if (token.Key >= Chart_First && token.Key <= Chart_Last)
				{
					if (token.Key !== Key.Chart_START && token.Key !== Key.Chart_END && !currentlyBetweenChartStartAndEnd)
						outErrors.Push(lineIndex, "Chart commands must be placed between #START and #END");

					const inStr = ASCII.Trim(token.ValueString);
					switch (token.Key)
					{
						case Key.Chart_START:
						{
							if (currentlyBetweenChartStartAndEnd)
								outErrors.Push(lineIndex, "Missing #END command");
							currentlyBetweenChartStartAndEnd = true;
						} break;
						case Key.Chart_END:
						{
							if (!currentlyBetweenChartStartAndEnd)
								outErrors.Push(lineIndex, "Missing #START command");

							if (currentlyBetweenGoGoStartAndEnd)
							{
								outErrors.Push(lineIndex, "Missing #GOGOEND command");
								pushChartCommand(ParsedChartCommandType.GoGoEnd);
								currentlyBetweenGoGoStartAndEnd = false;
							}

							// NOTE: Ending on an open measure feels like it should be supported..? Otherwise it forces any chart to have at least one full empty measure at the end (?)
							if (currentlyInBetweenMeasure)
								currentlyInBetweenMeasure = false;

							currentlyBetweenChartStartAndEnd = false;
							currentCourse = null;
						} break;
						case Key.Chart_MEASURE:
						{
							if (currentlyInBetweenMeasure)
							{
								outErrors.Push(lineIndex, "Cannot change time signature in the middle of a measure");
							}
							else
							{
								const command = pushChartCommand(ParsedChartCommandType.ChangeTimeSignature);
								const v = tryParseTimeSignature(inStr);
								if (v !== null) command.Param.ChangeTimeSignature.Value = v;
								if (v === null || inStr.length === 0)
									outErrors.Push(lineIndex, `Invalid time signature '${inStr}'`);

								// NOTE: Just a limitation of the fixed point Beat implementation, arguably not a problem with the file itself..?
								if (!IsTimeSignatureSupported(command.Param.ChangeTimeSignature.Value))
									outErrors.Push(lineIndex, `Unsupported time signature denominator '${inStr}'`);
							}
						} break;
						case Key.Chart_BPMCHANGE:
						{
							const command = pushChartCommand(ParsedChartCommandType.ChangeTempo);
							const v = tryParseTempo(inStr);
							if (v !== null) command.Param.ChangeTempo.Value = v;
							if (v === null || inStr.length === 0)
								outErrors.Push(lineIndex, `Invalid tempo '${inStr}'`);
						} break;
						case Key.Chart_DELAY:
						{
							const command = pushChartCommand(ParsedChartCommandType.ChangeDelay);
							const v = tryParseTime(inStr);
							if (v !== null) command.Param.ChangeDelay.Value = v;
							if (v === null || inStr.length === 0)
								outErrors.Push(lineIndex, `Invalid delay '${inStr}'`);
						} break;
						case Key.Chart_SCROLL:
						{
							const command = pushChartCommand(ParsedChartCommandType.ChangeScrollSpeed);
							const v = tryParseF32(inStr);
							if (v !== null) command.Param.ChangeScrollSpeed.Value = v;
							if (v === null || inStr.length === 0)
								outErrors.Push(lineIndex, `Invalid scroll speed '${inStr}'`);
						} break;
						case Key.Chart_GOGOSTART:
						{
							if (currentlyBetweenGoGoStartAndEnd)
								outErrors.Push(lineIndex, "Missing #GOGOEND command");
							pushChartCommand(ParsedChartCommandType.GoGoStart);
							currentlyBetweenGoGoStartAndEnd = true;
						} break;
						case Key.Chart_GOGOEND:
						{
							if (!currentlyBetweenGoGoStartAndEnd)
								outErrors.Push(lineIndex, "Missing #GOGOSTART command");
							pushChartCommand(ParsedChartCommandType.GoGoEnd);
							currentlyBetweenGoGoStartAndEnd = false;
						} break;
						case Key.Chart_BARLINEOFF: { pushChartCommand(ParsedChartCommandType.ChangeBarLine).Param.ChangeBarLine.Visible = false; } break;
						case Key.Chart_BARLINEON: { pushChartCommand(ParsedChartCommandType.ChangeBarLine).Param.ChangeBarLine.Visible = true; } break;
						case Key.Chart_BRANCHSTART:
						{
							const newCommand = pushChartCommand(ParsedChartCommandType.BranchStart);
							let valueIndex = 0;
							ASCII.ForEachInCommaSeparatedList(inStr, (value) =>
							{
								value = ASCII.Trim(value);
								if (valueIndex === 0) newCommand.Param.BranchStart.Condition = tryParseBranchCondition(value);
								if (valueIndex === 1) newCommand.Param.BranchStart.RequirementExpert = tryParseI32(value) ?? 0;
								if (valueIndex === 2) newCommand.Param.BranchStart.RequirementMaster = tryParseI32(value) ?? 0;
								valueIndex++;
							});
						} break;
						// TODO: Bunch of branch validation etc.
						case Key.Chart_N: { pushChartCommand(ParsedChartCommandType.BranchNormal); } break;
						case Key.Chart_E: { pushChartCommand(ParsedChartCommandType.BranchExpert); } break;
						case Key.Chart_M: { pushChartCommand(ParsedChartCommandType.BranchMaster); } break;
						case Key.Chart_BRANCHEND: { pushChartCommand(ParsedChartCommandType.BranchEnd); } break;
						case Key.Chart_SECTION: { pushChartCommand(ParsedChartCommandType.ResetAccuracyValues); } break;
						case Key.Chart_LYRIC: { pushChartCommand(ParsedChartCommandType.SetLyricLine).Param.SetLyricLine.Value = inStr; } break;
						case Key.Chart_LEVELHOLD: { pushChartCommand(ParsedChartCommandType.BranchLevelHold); } break;
						case Key.Chart_BMSCROLL: { pushChartCommand(ParsedChartCommandType.BMScroll); } break;
						case Key.Chart_HBSCROLL: { pushChartCommand(ParsedChartCommandType.HBScroll); } break;
						case Key.Chart_SENOTECHANGE: { pushChartCommand(ParsedChartCommandType.SENoteChange).Param.SENoteChange.Type = tryParseI32(inStr) ?? 0; } break;
						case Key.Chart_NEXTSONG: { pushChartCommand(ParsedChartCommandType.SetNextSong).Param.SetNextSong.CommaSeparatedList = inStr; } break;
						case Key.Chart_DIRECTION: { pushChartCommand(ParsedChartCommandType.ChangeDirection).Param.ChangeDirection.Direction = tryParseScrollDirection(inStr); } break;
						case Key.Chart_SUDDEN:
						{
							const newCommand = pushChartCommand(ParsedChartCommandType.SetSudden);
							let valueIndex = 0;
							ASCII.ForEachInSpaceSeparatedList(inStr, (value) =>
							{
								value = ASCII.Trim(value);
								if (valueIndex === 0) newCommand.Param.SetSudden.AppearanceOffset = tryParseTime(value) ?? 0.0;
								if (valueIndex === 1) newCommand.Param.SetSudden.MovementWaitDelay = tryParseTime(value) ?? 0.0;
								valueIndex++;
							});
						} break;
						case Key.Chart_JPOSSCROLL:
						{
							const newCommand = pushChartCommand(ParsedChartCommandType.SetScrollTransition);
							let valueIndex = 0;
							ASCII.ForEachInCommaSeparatedList(inStr, (value) =>
							{
								value = ASCII.Trim(value);
								if (valueIndex === 0) newCommand.Param.SetScrollTransition.Duration = tryParseTime(value) ?? 0.0;
								if (valueIndex === 1) newCommand.Param.SetScrollTransition.MovementDistance = tryParseF32(value) ?? 0.0;
								if (valueIndex === 2) newCommand.Param.SetScrollTransition.Direction = tryParseScrollDirection(value);
								valueIndex++;
							});
						} break;
					}
				}
				else
				{
					outErrors.Push(lineIndex, `Unknown chart command '${token.KeyString}'`);
				}
			} break;

			case TokenType.ChartData:
			{
				if (currentlyBetweenChartStartAndEnd)
				{
					currentlyInBetweenMeasure = true;

					const newCommand = pushChartCommand(ParsedChartCommandType.MeasureNotes);
					const valueString = token.ValueString;
					for (let charIndex = 0; charIndex < valueString.length; charIndex++)
					{
						const c = valueString[charIndex];
						if (c === ',')
						{
							pushChartCommand(ParsedChartCommandType.MeasureEnd);
							if (charIndex !== valueString.length - 1)
								outErrors.Push(lineIndex, "Unexpected trailing data after end-of-measure comma");

							currentlyInBetweenMeasure = false;
							break;
						}
						else
						{
							// NOTE: Treating unknown note types as empty spaces makes the most sense because that way timing won't be messed up
							//		 in case it's somehow a genuine note that just happens to be unsupported by this parser (?)
							let parsedNoteTypeOrNone = tryParseNoteTypeChar(c);
							if (parsedNoteTypeOrNone === null)
							{
								outErrors.Push(lineIndex, `Unknown note type '${c}'`);
								parsedNoteTypeOrNone = NoteType.None;
							}

							// NOTE: Except for whitespace I guess, those never make sense to be valid notes (?)
							//		 The format just doesn't really describe how to handle this...
							if (!ASCII.IsWhitespace(c))
								newCommand.Param.MeasureNotes.Notes.push(parsedNoteTypeOrNone);
						}
					}
				}
				else
				{
					outErrors.Push(lineIndex, "Chart note data can only be added between #START and #END");
				}
			} break;
		}
	}

	if (currentlyBetweenChartStartAndEnd)
		outErrors.Push((tokens.length === 0) ? 0 : tokens[tokens.length - 1].LineIndex, "Missing #END command");

	// DEBUG: Always add at least one course for now so the debug gui has something to display
	if (outTJA.Courses.length === 0)
		outTJA.Courses.push(MakeParsedCourse());

	return outTJA;
}

const UTF8_BOM = "﻿";

function noteTypeToChar(inNote: NoteType): string
{
	switch (inNote)
	{
		case NoteType.None: return '0';
		case NoteType.Don: return '1';
		case NoteType.Ka: return '2';
		case NoteType.DonBig: return '3';
		case NoteType.KaBig: return '4';
		case NoteType.Start_Drumroll: return '5';
		case NoteType.Start_DrumrollBig: return '6';
		case NoteType.Start_Balloon: return '7';
		case NoteType.End_BalloonOrDrumroll: return '8';
		case NoteType.Start_BaloonSpecial: return '9';
		case NoteType.DonBigBoth: return 'A';
		case NoteType.KaBigBoth: return 'B';
		case NoteType.Hidden: return 'F';
		default: return ' ';
	}
}

function difficultyTypeToString(inType: DifficultyType): string
{
	switch (inType)
	{
		case DifficultyType.Easy: return "Easy";
		case DifficultyType.Normal: return "Normal";
		case DifficultyType.Hard: return "Hard";
		case DifficultyType.Oni: return "Oni";
		case DifficultyType.OniUra: return "Edit";
		case DifficultyType.Tower: return "Tower";
		case DifficultyType.Dan: return "Dan";
		default: return "";
	}
}

export function ConvertParsedToText(inContent: ParsedTJA, encoding: Encoding): string
{
	const out: string[] = [];
	if (encoding === Encoding.UTF8)
		out.push(UTF8_BOM);

	const appendLine = (line: string) => { out.push(line, "\n"); };
	const appendProperyLine = (key: Key, value: string) => { out.push(KeyStrings[key], ":", value, "\n"); };
	const appendProperyLineIfNotEmpty = (key: Key, value: string) => { if (value.length > 0) appendProperyLine(key, value); };
	const appendCommandLine = (key: Key, value: string) => { out.push("#", KeyStrings[key]); if (value.length > 0) out.push(" ", value); out.push("\n"); };
	const appendBalloonProperyLine = (key: Key, popCounts: readonly number[]) => { out.push(KeyStrings[key], ":", popCounts.map((v) => String(Math.trunc(v))).join(","), "\n"); };

	if (inContent.HasPeepoDrumKitComment)
	{
		out.push("// ", PeepoDrumKitCommentMarkerPrefix);
		if (!DateEquals(inContent.PeepoDrumKitCommentDate, DateZero()))
			out.push(" ", DateToString(inContent.PeepoDrumKitCommentDate));
		out.push("\n");
	}

	const m = inContent.Metadata;
	appendProperyLine(Key.Main_TITLE, m.TITLE);
	appendProperyLineIfNotEmpty(Key.Main_TITLEJA, m.TITLE_JA);
	appendProperyLineIfNotEmpty(Key.Main_TITLEEN, m.TITLE_EN);
	appendProperyLineIfNotEmpty(Key.Main_TITLECN, m.TITLE_CN);
	appendProperyLineIfNotEmpty(Key.Main_TITLETW, m.TITLE_TW);
	appendProperyLineIfNotEmpty(Key.Main_TITLEKO, m.TITLE_KO);
	appendProperyLine(Key.Main_SUBTITLE, m.SUBTITLE);
	appendProperyLineIfNotEmpty(Key.Main_SUBTITLEJA, m.SUBTITLE_JA);
	appendProperyLineIfNotEmpty(Key.Main_SUBTITLEEN, m.SUBTITLE_EN);
	appendProperyLineIfNotEmpty(Key.Main_SUBTITLECN, m.SUBTITLE_CN);
	appendProperyLineIfNotEmpty(Key.Main_SUBTITLETW, m.SUBTITLE_TW);
	appendProperyLineIfNotEmpty(Key.Main_SUBTITLEKO, m.SUBTITLE_KO);
	appendProperyLine(Key.Main_BPM, FormatG(m.BPM.BPM));
	appendProperyLine(Key.Main_WAVE, m.WAVE);
	appendProperyLine(Key.Main_OFFSET, FormatG(m.OFFSET));
	appendProperyLine(Key.Main_DEMOSTART, FormatG(m.DEMOSTART));
	appendProperyLineIfNotEmpty(Key.Main_GENRE, m.GENRE);
	if (m.SCOREMODE !== ScoreMode.AC1_To_AC7) appendProperyLine(Key.Main_SCOREMODE, String(m.SCOREMODE));
	appendProperyLineIfNotEmpty(Key.Main_MAKER, m.MAKER);
	appendProperyLineIfNotEmpty(Key.Main_LYRICS, m.LYRICS);
	if (!ApproxmiatelySame(m.SONGVOL, 1.0)) appendProperyLine(Key.Main_SONGVOL, FormatG(ToPercent(m.SONGVOL)));
	if (!ApproxmiatelySame(m.SEVOL, 1.0)) appendProperyLine(Key.Main_SEVOL, FormatG(ToPercent(m.SEVOL)));
	// TODO: Key::Main_SIDE;
	if (m.LIFE !== 0) appendProperyLine(Key.Main_LIFE, String(m.LIFE));
	// TODO: Key::Main_GAME;
	if (m.HEADSCROLL !== 1.0) appendProperyLine(Key.Main_HEADSCROLL, FormatG(m.HEADSCROLL));
	appendProperyLineIfNotEmpty(Key.Main_BGIMAGE, m.BGIMAGE);
	appendProperyLineIfNotEmpty(Key.Main_BGMOVIE, m.BGMOVIE);
	if (m.MOVIEOFFSET !== 0.0) appendProperyLine(Key.Main_MOVIEOFFSET, FormatG(m.MOVIEOFFSET));
	appendProperyLineIfNotEmpty(Key.Main_TAIKOWEBSKIN, m.TAIKOWEBSKIN);
	appendLine("");

	for (let courseIndex = 0; courseIndex < inContent.Courses.length; courseIndex++)
	{
		const course = inContent.Courses[courseIndex];
		if (courseIndex !== 0)
			appendLine("");

		const cm = course.Metadata;
		appendProperyLine(Key.Course_COURSE, difficultyTypeToString(cm.COURSE));
		appendProperyLine(Key.Course_LEVEL, String(cm.LEVEL));
		if (cm.BALLOON.length > 0 || cm.BALLOON_Normal.length > 0 || cm.BALLOON_Expert.length > 0 || cm.BALLOON_Master.length > 0)
			appendBalloonProperyLine(Key.Course_BALLOON, cm.BALLOON);
		if (cm.BALLOON_Normal.length > 0 || cm.BALLOON_Expert.length > 0 || cm.BALLOON_Master.length > 0)
		{
			appendBalloonProperyLine(Key.Course_BALLOONNOR, cm.BALLOON_Normal);
			appendBalloonProperyLine(Key.Course_BALLOONEXP, cm.BALLOON_Expert);
			appendBalloonProperyLine(Key.Course_BALLOONMAS, cm.BALLOON_Master);
		}
		appendProperyLine(Key.Course_SCOREINIT, (cm.SCOREINIT === 0) ? "" : String(cm.SCOREINIT));
		appendProperyLine(Key.Course_SCOREDIFF, (cm.SCOREDIFF === 0) ? "" : String(cm.SCOREDIFF));
		// TODO: Key::Course_STYLE;
		if (cm.NOTESDESIGNER.length > 0)
		{
			switch (cm.COURSE)
			{
				case DifficultyType.Easy: { appendProperyLine(Key.Course_NOTESDESIGNER0, cm.NOTESDESIGNER); } break;
				case DifficultyType.Normal: { appendProperyLine(Key.Course_NOTESDESIGNER1, cm.NOTESDESIGNER); } break;
				case DifficultyType.Hard: { appendProperyLine(Key.Course_NOTESDESIGNER2, cm.NOTESDESIGNER); } break;
				case DifficultyType.Oni: { appendProperyLine(Key.Course_NOTESDESIGNER3, cm.NOTESDESIGNER); } break;
				case DifficultyType.OniUra: { appendProperyLine(Key.Course_NOTESDESIGNER4, cm.NOTESDESIGNER); } break;
			}
		}
		// TODO: Key::Course_EXAM1, EXAM2, EXAM3, GAUGEINCR, TOTAL, HIDDENBRANCH;
		appendLine("");

		appendCommandLine(Key.Chart_START, "");
		const commands = course.ChartCommands;
		for (let commandIndex = 0; commandIndex < commands.length; commandIndex++)
		{
			const command = commands[commandIndex];
			switch (command.Type)
			{
				case ParsedChartCommandType.MeasureNotes:
				{
					for (const note of command.Param.MeasureNotes.Notes)
						out.push(noteTypeToChar(note));

					if (commandIndex + 1 < commands.length)
					{
						if (commands[commandIndex + 1].Type !== ParsedChartCommandType.MeasureEnd)
							appendLine("");
					}
				} break;
				case ParsedChartCommandType.MeasureEnd: { appendLine(","); } break;
				case ParsedChartCommandType.ChangeTimeSignature:
				{
					appendCommandLine(Key.Chart_MEASURE, `${command.Param.ChangeTimeSignature.Value.Numerator}/${command.Param.ChangeTimeSignature.Value.Denominator}`);
				} break;
				case ParsedChartCommandType.ChangeTempo: { appendCommandLine(Key.Chart_BPMCHANGE, FormatG(command.Param.ChangeTempo.Value.BPM)); } break;
				case ParsedChartCommandType.ChangeDelay: { appendCommandLine(Key.Chart_DELAY, FormatG(command.Param.ChangeDelay.Value)); } break;
				case ParsedChartCommandType.ChangeScrollSpeed: { appendCommandLine(Key.Chart_SCROLL, FormatG(command.Param.ChangeScrollSpeed.Value)); } break;
				case ParsedChartCommandType.ChangeBarLine: { appendCommandLine(command.Param.ChangeBarLine.Visible ? Key.Chart_BARLINEON : Key.Chart_BARLINEOFF, ""); } break;
				case ParsedChartCommandType.GoGoStart: { appendCommandLine(Key.Chart_GOGOSTART, ""); } break;
				case ParsedChartCommandType.GoGoEnd: { appendCommandLine(Key.Chart_GOGOEND, ""); } break;
				case ParsedChartCommandType.SetLyricLine:
				{
					// TODO: Handle escape characters, most importantly "\n"
					appendCommandLine(Key.Chart_LYRIC, command.Param.SetLyricLine.Value);
				} break;
				default:
				{
					// TODO: BranchStart, BranchNormal, BranchExpert, BranchMaster, BranchEnd, BranchLevelHold, ResetAccuracyValues,
					//		 BMScroll, HBScroll, SENoteChange, SetNextSong, ChangeDirection, SetSudden, SetScrollTransition
				} break;
			}
		}
		appendCommandLine(Key.Chart_END, "");
	}

	return out.join("");
}

export interface ConvertedNote { TimeWithinMeasure: Beat; Type: NoteType; }
export interface ConvertedTempoChange { TimeWithinMeasure: Beat; Tempo: Tempo; }
export interface ConvertedDelayChange { TimeWithinMeasure: Beat; Delay: Time; }
export interface ConvertedScrollChange { TimeWithinMeasure: Beat; ScrollSpeed: number; }
export interface ConvertedBarLineChange { TimeWithinMeasure: Beat; Visibile: boolean; }
export interface ConvertedLyricChange { TimeWithinMeasure: Beat; Lyric: string; }

export interface ConvertedMeasure
{
	StartTime: Beat;
	TimeSignature: TimeSignature;
	Notes: ConvertedNote[];
	TempoChanges: ConvertedTempoChange[];
	DelayChanges: ConvertedDelayChange[];
	ScrollChanges: ConvertedScrollChange[];
	// BUG: Can't actually change inbetween measures..?
	BarLineChanges: ConvertedBarLineChange[];
	LyricChanges: ConvertedLyricChange[];
}
export const MakeConvertedMeasure = (startTime: Beat = 0, signature: TimeSignature = DefaultTimeSignature): ConvertedMeasure => ({
	StartTime: startTime, TimeSignature: { ...signature }, Notes: [], TempoChanges: [], DelayChanges: [], ScrollChanges: [], BarLineChanges: [], LyricChanges: [],
});

export interface ConvertedGoGoRange { StartTime: Beat; EndTime: Beat; }

// TODO: Handle multi player tracks and branches ?!
export interface ConvertedCourse
{
	// TODO: Restructure this to not duplicate main metadata for each course
	MainMetadata: ParsedMainMetadata;
	CourseMetadata: ParsedCourseMetadata;
	Measures: ConvertedMeasure[];
	GoGoRanges: ConvertedGoGoRange[];
}

export function ConvertConvertedMeasuresToParsedCommands(inMeasures: readonly ConvertedMeasure[], inGoGo: readonly ConvertedGoGoRange[], outCommands: ParsedChartCommand[]): void
{
	interface TempCommand { TimeWithinMeasure: Beat; ParsedCommand: ParsedChartCommand; }
	let tempBuffer: TempCommand[] = [];
	const pushTemp = (time: Beat, type: ParsedChartCommandType): ParsedChartCommand => { const c = MakeParsedChartCommand(type); tempBuffer.push({ TimeWithinMeasure: time, ParsedCommand: c }); return c; };

	let lastSignature: TimeSignature = { ...DefaultTimeSignature };
	for (const inMeasure of inMeasures)
	{
		if (!TimeSignatureEquals(inMeasure.TimeSignature, lastSignature))
		{
			pushTemp(0, ParsedChartCommandType.ChangeTimeSignature).Param.ChangeTimeSignature.Value = { ...inMeasure.TimeSignature };
			lastSignature = { ...inMeasure.TimeSignature };
		}

		if (inGoGo.length > 0)
		{
			// HACK: Could yet again be sped up a lot using a binary search
			const inMeasureStartTime = inMeasure.StartTime;
			const inMeasureEndTime = inMeasure.StartTime + GetDurationPerBar(inMeasure.TimeSignature);
			for (const gogo of inGoGo)
			{
				if (gogo.StartTime >= inMeasureStartTime && gogo.StartTime < inMeasureEndTime)
					pushTemp(gogo.StartTime - inMeasureStartTime, ParsedChartCommandType.GoGoStart);
				if (gogo.EndTime >= inMeasureStartTime && gogo.EndTime < inMeasureEndTime)
					pushTemp(gogo.EndTime - inMeasureStartTime, ParsedChartCommandType.GoGoEnd);
			}
		}

		for (const barLineChange of inMeasure.BarLineChanges)
			pushTemp(barLineChange.TimeWithinMeasure, ParsedChartCommandType.ChangeBarLine).Param.ChangeBarLine.Visible = barLineChange.Visibile;

		for (const tempoChange of inMeasure.TempoChanges)
			pushTemp(tempoChange.TimeWithinMeasure, ParsedChartCommandType.ChangeTempo).Param.ChangeTempo.Value = { ...tempoChange.Tempo };

		for (const scrollChange of inMeasure.ScrollChanges)
			pushTemp(scrollChange.TimeWithinMeasure, ParsedChartCommandType.ChangeScrollSpeed).Param.ChangeScrollSpeed.Value = scrollChange.ScrollSpeed;

		for (const lyricChange of inMeasure.LyricChanges)
			pushTemp(lyricChange.TimeWithinMeasure, ParsedChartCommandType.SetLyricLine).Param.SetLyricLine.Value = lyricChange.Lyric;

		for (const delayChange of inMeasure.DelayChanges)
			pushTemp(delayChange.TimeWithinMeasure, ParsedChartCommandType.ChangeDelay).Param.ChangeDelay.Value = delayChange.Delay;

		for (const note of inMeasure.Notes)
			pushTemp(note.TimeWithinMeasure, ParsedChartCommandType.MeasureNotes).Param.MeasureNotes.Notes.push(note.Type);

		if (tempBuffer.length > 0)
		{
			const measureBarDuration = GetDurationPerBar(lastSignature);

			// NOTE: Find smallest bar division to fit in all the commands then add into temp
			const supportedBarDivisions = [1, 4, 8, 12, 16, 24, 32, 48, 64, 96, 192];
			let smallestBarDivision = 192;
			for (const itDivision of supportedBarDivisions)
			{
				const itBeatDivision = IDiv(BeatFromBars(1), itDivision);
				if ((measureBarDuration % itBeatDivision) !== 0)
					continue;

				if (tempBuffer.every((c) => (c.TimeWithinMeasure % itBeatDivision) === 0))
					smallestBarDivision = Math.min(smallestBarDivision, itDivision);
			}

			let beatPerNoteInThisMeasure = IDiv(BeatFromBars(1), smallestBarDivision);

			// NOTE: Web port addition ("more-grid"), with the higher tick resolution commands don't necessarily fit any of the supported bar divisions anymore
			//		 (1/5, 1/7 etc.), in that case use the smallest number of characters per measure that represents every command exactly.
			//		 Should nothing reasonably small fit (positions that don't lie on any musical grid) fall back to quantizing to 1/192 like the original resolution
			if (!tempBuffer.every((c) => (c.TimeWithinMeasure % beatPerNoteInThisMeasure) === 0))
			{
				const maxNotesPerMeasure = Math.max(1, Math.round((measureBarDuration / BeatFromBars(1)) * 192 * 8));
				let exactNoteCount = 0;
				for (let n = 1; n <= maxNotesPerMeasure && exactNoteCount === 0; n++)
				{
					if ((measureBarDuration % n) !== 0)
						continue;
					const step = measureBarDuration / n;
					if (tempBuffer.every((c) => (c.TimeWithinMeasure % step) === 0))
						exactNoteCount = n;
				}

				// NOTE: Measures written with a length that doesn't divide the tick resolution (17, 19, 23 ... characters) can't be represented exactly,
				//		 so also accept the smallest length that every command lies on within 1 tick (imported positions are rounded to the closest tick) and snap to it
				let nearlyExactNoteCount = 0;
				if (exactNoteCount === 0)
				{
					const tolerance = 1;
					for (let n = 1; n <= maxNotesPerMeasure && nearlyExactNoteCount === 0; n++)
					{
						const step = measureBarDuration / n;
						if (tempBuffer.every((c) => Math.abs(c.TimeWithinMeasure - (Math.round(c.TimeWithinMeasure / step) * step)) <= tolerance))
							nearlyExactNoteCount = n;
					}
				}

				if (exactNoteCount > 0)
				{
					beatPerNoteInThisMeasure = measureBarDuration / exactNoteCount;
				}
				else if (nearlyExactNoteCount > 0)
				{
					beatPerNoteInThisMeasure = measureBarDuration / nearlyExactNoteCount;
					for (const c of tempBuffer)
						c.TimeWithinMeasure = Math.min(Math.round(c.TimeWithinMeasure / beatPerNoteInThisMeasure), nearlyExactNoteCount) * beatPerNoteInThisMeasure;
				}
				else
				{
					beatPerNoteInThisMeasure = IDiv(BeatFromBars(1), 192);
					for (const c of tempBuffer)
						c.TimeWithinMeasure = Math.min(Math.round(c.TimeWithinMeasure / beatPerNoteInThisMeasure) * beatPerNoteInThisMeasure, measureBarDuration);
				}
			}

			// NOTE: Rounded because the (nearly exact) step size above doesn't have to be an integer
			const noteCommandsInThisMeasure = (beatPerNoteInThisMeasure === 0) ? 0 : Math.round(measureBarDuration / beatPerNoteInThisMeasure);

			// NOTE: Insert empty notes based on smallestBarDivision
			if (noteCommandsInThisMeasure > 0)
			{
				const existingNoteBeats = new Set<number>();
				for (const tempCommand of tempBuffer)
					if (tempCommand.ParsedCommand.Type === ParsedChartCommandType.MeasureNotes)
						existingNoteBeats.add(tempCommand.TimeWithinMeasure);

				for (let noteIndex = 0; noteIndex < noteCommandsInThisMeasure; noteIndex++)
				{
					const noteBeat = noteIndex * beatPerNoteInThisMeasure;
					if (!existingNoteBeats.has(noteBeat))
						pushTemp(noteBeat, ParsedChartCommandType.MeasureNotes).Param.MeasureNotes.Notes.push(NoteType.None);
				}
			}

			// NOTE: Array.prototype.sort is guaranteed to be stable (equivalent to std::stable_sort)
			tempBuffer.sort((a, b) => (a.TimeWithinMeasure - b.TimeWithinMeasure));

			// NOTE: Merge adjacent single-note MeasureNotes commands
			const merged: TempCommand[] = [];
			for (const thisCommand of tempBuffer)
			{
				const lastCommand = (merged.length > 0) ? merged[merged.length - 1] : null;
				if (lastCommand !== null && thisCommand.ParsedCommand.Type === ParsedChartCommandType.MeasureNotes && lastCommand.ParsedCommand.Type === ParsedChartCommandType.MeasureNotes)
				{
					for (const note of thisCommand.ParsedCommand.Param.MeasureNotes.Notes)
						lastCommand.ParsedCommand.Param.MeasureNotes.Notes.push(note);
					continue;
				}
				merged.push(thisCommand);
			}

			for (const c of merged)
				outCommands.push(c.ParsedCommand);
			tempBuffer = [];
		}

		outCommands.push(MakeParsedChartCommand(ParsedChartCommandType.MeasureEnd));
	}
}

export function ConvertParsedToConvertedCourse(inContent: ParsedTJA, inCourse: ParsedCourse): ConvertedCourse
{
	const out: ConvertedCourse = { MainMetadata: inContent.Metadata, CourseMetadata: inCourse.Metadata, Measures: [], GoGoRanges: [] };

	// NOTE: Add measures with time signatures and notes (including "empty" ones as needed for time calculations)
	{
		let currentMeasure = MakeConvertedMeasure(0, DefaultTimeSignature);
		out.Measures.push(currentMeasure);

		for (const command of inCourse.ChartCommands)
		{
			if (command.Type === ParsedChartCommandType.MeasureNotes)
			{
				for (const note of command.Param.MeasureNotes.Notes)
					currentMeasure.Notes.push({ TimeWithinMeasure: 0, Type: note });
			}
			else if (command.Type === ParsedChartCommandType.MeasureEnd)
			{
				currentMeasure = MakeConvertedMeasure(0, out.Measures[out.Measures.length - 1].TimeSignature);
				out.Measures.push(currentMeasure);
			}
			else if (command.Type === ParsedChartCommandType.ChangeTimeSignature)
			{
				currentMeasure.TimeSignature = { ...command.Param.ChangeTimeSignature.Value };
			}
		}

		let currentMeasureTime = 0;
		for (const measure of out.Measures)
		{
			measure.StartTime = currentMeasureTime;
			currentMeasureTime += GetDurationPerBar(measure.TimeSignature);

			// NOTE: Web port change ("more-grid"), the original accumulates a truncated step which drifts for measure lengths that don't divide the tick resolution.
			//		 Each position is calculated directly (and rounded) instead, so for example a 17 character measure stays evenly spaced
			const measureDuration = GetDurationPerBar(measure.TimeSignature);
			const noteCount = measure.Notes.length;
			measure.Notes.forEach((note, noteIndex) => { note.TimeWithinMeasure = Math.round((noteIndex * measureDuration) / noteCount); });
		}
	}

	// NOTE: Insert additional commands
	{
		let currentMeasureIndex = 0;
		let currentTimeWithinMeasure = 0;
		let currentNotesInMeasure = 0;

		for (const command of inCourse.ChartCommands)
		{
			const currentMeasure = out.Measures[currentMeasureIndex];
			if (command.Type === ParsedChartCommandType.MeasureNotes)
			{
				currentNotesInMeasure += command.Param.MeasureNotes.Notes.length;

				if (currentMeasure.Notes.length > 0 && currentNotesInMeasure > 0)
					currentTimeWithinMeasure = currentMeasure.Notes[currentNotesInMeasure - 1].TimeWithinMeasure +
						// TODO: WHAT TO DO HERE?
						((currentMeasure.Notes.length > 1) ? currentMeasure.Notes[1].TimeWithinMeasure : 0);
			}
			if (command.Type === ParsedChartCommandType.MeasureEnd)
			{
				currentMeasureIndex++;
				currentTimeWithinMeasure = 0;
				currentNotesInMeasure = 0;
			}
			else if (command.Type === ParsedChartCommandType.ChangeTempo)
			{
				currentMeasure.TempoChanges.push({ TimeWithinMeasure: currentTimeWithinMeasure, Tempo: { ...command.Param.ChangeTempo.Value } });
			}
			else if (command.Type === ParsedChartCommandType.ChangeDelay)
			{
				currentMeasure.DelayChanges.push({ TimeWithinMeasure: currentTimeWithinMeasure, Delay: command.Param.ChangeDelay.Value });
			}
			else if (command.Type === ParsedChartCommandType.ChangeScrollSpeed)
			{
				currentMeasure.ScrollChanges.push({ TimeWithinMeasure: currentTimeWithinMeasure, ScrollSpeed: command.Param.ChangeScrollSpeed.Value });
			}
			else if (command.Type === ParsedChartCommandType.GoGoStart)
			{
				const startTime = currentMeasure.StartTime + currentTimeWithinMeasure;
				out.GoGoRanges.push({ StartTime: startTime, EndTime: startTime });
			}
			else if (command.Type === ParsedChartCommandType.GoGoEnd)
			{
				if (out.GoGoRanges.length > 0)
					out.GoGoRanges[out.GoGoRanges.length - 1].EndTime = currentMeasure.StartTime + currentTimeWithinMeasure;
			}
			else if (command.Type === ParsedChartCommandType.ChangeBarLine)
			{
				currentMeasure.BarLineChanges.push({ TimeWithinMeasure: currentTimeWithinMeasure, Visibile: command.Param.ChangeBarLine.Visible });
			}
			else if (command.Type === ParsedChartCommandType.SetLyricLine)
			{
				currentMeasure.LyricChanges.push({ TimeWithinMeasure: currentTimeWithinMeasure, Lyric: command.Param.SetLyricLine.Value });
			}
		}

		const firstMeasure = out.Measures[0];
		if (firstMeasure.TempoChanges.length === 0)
			firstMeasure.TempoChanges.push({ TimeWithinMeasure: 0, Tempo: { ...inContent.Metadata.BPM } });
	}

	// NOTE: Final cleanup
	for (const measure of out.Measures)
	{
		if (measure.Notes.length > 0)
			measure.Notes = measure.Notes.filter((note) => note.Type !== NoteType.None);
	}

	return out;
}

/** NOTE: Decodes a raw .tja file into text the same way the original does (UTF-8 if it has a BOM, otherwise Shift-JIS) */
export function DecodeFileBytes(bytes: Uint8Array): string
{
	const hasBOM = (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF);
	if (hasBOM)
		return new TextDecoder("utf-8").decode(bytes.subarray(3));

	// NOTE: Small deviation from the original: Files that are valid UTF-8 (but without a BOM) are also accepted as UTF-8,
	//		 as many TJAs found online are saved that way and would otherwise be decoded incorrectly
	try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
	catch { return new TextDecoder("shift_jis").decode(bytes); }
}
