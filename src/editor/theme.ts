// Port of PeepoDrumKit "peepo_drum_kit/chart_editor_theme.h"
// https://github.com/samyuu/PeepoDrumKit
//
// NOTE: Colors are kept in the original Dear ImGui packed 0xAABBGGRR format and converted to CSS strings on demand (cached)
import { NoteType } from "./chart";

export const TimelineRowHeight = 32.0;
export const TimelineRowHeightNotes = 48.0;
export const TimelineAutoScrollLockContentWidthFactor = 0.35;
export const TimelineCursorHeadHeight = 10.0;
export const TimelineCursorHeadWidth = 11.0;
export const TimelineBoxSelectionRadius = 9.0;
export const TimelineBoxSelectionLineThickness = 2.0;
export const TimelineBoxSelectionLinePadding = 4.0;
export const TimelineBoxSelectionXorDotRadius = 3.0;
export const TimelineSongDemoStartMarkerWidth = 9.0;
export const TimelineSongDemoStartMarkerHeight = 9.0;
export const TimelineSelectedNoteHitBoxSizeSmall = (16.0 * 2.0) + 2.0;
export const TimelineSelectedNoteHitBoxSizeBig = (22.0 * 2.0) + 2.0;

// NOTE: All game coordinates are defined in world space
export const GameWorldSpaceDistancePerLaneBeat = 356.0;
export const GameLaneStandardWidth = 1422.0;
export const GameLaneBarLineThickness = 3.0;
export const GameLaneSlice =
{
	TopBorder: 12.0,
	Content: 195.0,
	MidBorder: 6.0,
	Footer: 39.0,
	BotBorder: 12.0,
	ContentCenterY() { return this.TopBorder + (this.Content / 2.0); },
	FooterCenterY() { return this.TopBorder + this.Content + this.MidBorder + (this.Footer / 2.0); },
	TotalHeight() { return this.TopBorder + this.Content + this.MidBorder + this.Footer + this.BotBorder; },
};
export const GameLanePaddingL = 6.0;
export const GameLanePaddingR = 6.0;
export const GameLanePaddingTop = 64.0;
export const GameLanePaddingBot = 32.0;
export const GameHitCircle =
{
	Center: { x: 120.0, y: GameLaneSlice.ContentCenterY() },
	InnerFillRadius: (78.0 / 2.0),
	InnerOutlineRadius: (100.0 / 2.0),
	InnerOutlineThickness: 5.0,
	OuterOutlineRadius: (154.0 / 2.0),
	OuterOutlineThickness: 5.0,
};

export const Colors =
{
	DragTextHoveredColor: 0xFFBCDDDB,
	DragTextActiveColor: 0xFFC3F5F2,
	InputTextWarningTextColor: 0xFF4C4CFF,

	TimelineBackgroundColor: 0xFF282828,
	TimelineOutOfBoundsDimColor: 0x731F1F1F,
	TimelineWaveformBaseColor: 0x807D7D7D,

	TimelineCursorColor: 0xB375AD85,
	TimelineItemTextColor: 0xFFF0F0F0,
	TimelineItemTextColorShadow: 0xFF000000,
	TimelineItemTextColorWarning: 0xFF4C4CFF,
	TimelineItemTextUnderlineColor: 0xFFF0F0F0,
	TimelineItemTextUnderlineColorShadow: 0xFF000000,

	TimelineGoGoBackgroundColorBorder: 0xFF1E1E1E,
	TimelineGoGoBackgroundColorBorderSelected: 0xFF979797,
	TimelineGoGoBackgroundColorOuter: 0xFF46494D,
	TimelineGoGoBackgroundColorInner: 0xFF2D2D33,

	TimelineLyricsTextColor: 0xFFDEE5F0,
	TimelineLyricsTextColorShadow: 0xFF131415,
	TimelineLyricsBackgroundColorBorder: 0xFF1E1E1E,
	TimelineLyricsBackgroundColorBorderSelected: 0xFF979797,
	TimelineLyricsBackgroundColorOuter: 0xFF46494D,
	TimelineLyricsBackgroundColorInner: 0xFF323438,

	TimelineHorizontalRowLineColor: 0x2D7D7D7D,
	TimelineGridBarLineColor: 0x807D7D7D,
	TimelineGridBeatLineColor: 0x2D7D7D7D,
	TimelineGridSnapLineColor: 0x1A7D7D7D,
	TimelineGridSnapTupletLineColor: 0x1A22BBBC,

	TimelineBoxSelectionBackgroundColor: 0x262E8F5E,
	TimelineBoxSelectionBorderColor: 0xFF2E8F5E,
	TimelineBoxSelectionFillColor: 0xFF293730,
	TimelineBoxSelectionInnerColor: 0xFFF0F0F0,
	TimelineRangeSelectionBackgroundColor: 0x0AD0D0D0,
	TimelineRangeSelectionBorderColor: 0x60E0E0E0,
	TimelineRangeSelectionHeaderHighlightColor: 0x6075AD85,
	TimelineSelectedNoteBoxBackgroundColor: 0x0AD0D0D0,
	TimelineSelectedNoteBoxBorderColor: 0x60E0E0E0,

	TimelineTempoChangeLineColor: 0xDC314CD8,
	TimelineSignatureChangeLineColor: 0xDC22BEE2,
	TimelineScrollChangeLineColor: 0xDC6CA71E,
	TimelineBarLineChangeLineColor: 0xDCBE9E2C,
	TimelineSelectedItemLineColor: 0xDCFFFFFF,

	TimelineSongDemoStartMarkerColorFill: 0x3B75AD85,
	TimelineSongDemoStartMarkerColorBorder: 0xB375AD85,

	GameLaneBorderColor: 0xFF000000,
	GameLaneBarLineColor: 0xBFDADADA,
	GameLaneContentBackgroundColor: 0xFF282828,
	GameLaneFooterBackgroundColor: 0xFF848484,
	GameLaneHitCircleInnerFillColor: 0xFF525252,
	GameLaneHitCircleInnerOutlineColor: 0xFF888888,
	GameLaneHitCircleOuterOutlineColor: 0xFF646464,

	NoteColorRed: 0xFF2B41F3,
	NoteColorBlue: 0xFFC2C351,
	NoteColorOrange: 0xFF0078FD,
	NoteColorYellow: 0xFF13B7F4,
	NoteColorWhite: 0xFFDEEDF5,
	NoteColorBlack: 0xFF1E1E1E,
	NoteColorDrumrollHit: 0xFF0000F6,
	NoteBalloonTextColor: 0xFF000000,
	NoteBalloonTextColorShadow: 0xFFFFFFFF,

	// NOTE: Subset of the GuiStyleColorPeepoDrumKit() ImGui style colors used by the timeline drawing code
	Gui_Text: 0xFFF0F0F0,
	Gui_TextDisabled: 0xFF808080,
	Gui_Separator: 0x807D7D7D,
};

export type ColorName = keyof typeof Colors;

export function NoteTypeToColor(noteType: NoteType): number
{
	switch (noteType)
	{
		case NoteType.Don: case NoteType.DonBig: return Colors.NoteColorRed;
		case NoteType.Ka: case NoteType.KaBig: return Colors.NoteColorBlue;
		case NoteType.Drumroll: case NoteType.DrumrollBig: return Colors.NoteColorYellow;
		case NoteType.Balloon: case NoteType.BalloonSpecial: return Colors.NoteColorOrange;
		default: return Colors.NoteColorWhite;
	}
}

const CSSCache = new Map<number, string>();

/** NOTE: Convert a packed 0xAABBGGRR color into a CSS color string */
export function U32ToCSS(abgr: number): string
{
	abgr = abgr >>> 0;
	let out = CSSCache.get(abgr);
	if (out === undefined)
	{
		const r = abgr & 0xFF, g = (abgr >>> 8) & 0xFF, b = (abgr >>> 16) & 0xFF, a = (abgr >>> 24) & 0xFF;
		out = `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
		CSSCache.set(abgr, out);
	}
	return out;
}

/** NOTE: Equivalent of Gui::ColorU32WithAlpha() (multiplies the existing alpha) */
export function ColorU32WithAlpha(abgr: number, alphaFactor: number): number
{
	const a = Math.round(((abgr >>> 24) & 0xFF) * Math.min(Math.max(alphaFactor, 0.0), 1.0));
	return ((abgr & 0x00FFFFFF) | (a << 24)) >>> 0;
}

export const ColorWithAlphaCSS = (abgr: number, alphaFactor: number): string => U32ToCSS(ColorU32WithAlpha(abgr, alphaFactor));

export function LerpColorU32(a: number, b: number, t: number): number
{
	const ch = (v: number, s: number) => (v >>> s) & 0xFF;
	const l = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) & 0xFF;
	return ((l(24) << 24) | (l(16) << 16) | (l(8) << 8) | l(0)) >>> 0;
}
