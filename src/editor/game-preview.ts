// Port of PeepoDrumKit "peepo_drum_kit/chart_editor_widgets_game.cpp" (+ GameCamera from "chart_editor_widgets.h")
// https://github.com/samyuu/PeepoDrumKit
import { type vec2, type Time, Rect, vec2 as V2, ControlFlow, ClampBot, ConvertRangeClampOutput, FitInsideFixedAspectRatio, GetAspectRatio, GetAspectRatioRect, BezierKeyFrame2DLinear, SampleBezierFCurve2D, type BezierKeyFrame2D } from "../core/types";
import { type Beat, type TempoChange, BeatSortedForwardIterator, GetGridBeatSnap, BeatFromBars, BeatDiv, type Tempo } from "../core/beat";
import { type Note, type ScrollChange, type BarLineChange, type ChartCourse, type SortedNotesList, NoteType, NoteSEType, BranchType, IsBigNote, IsBalloonNote, ToBigNoteIf, VisibleOrDefault, TempoOrDefault, ScrollOrDefault } from "./chart";
import { type ChartContext } from "./context";
import { Settings } from "./settings";
import { DrawList } from "./draw";
import { SprID, SprGroup, SprTransformFromCenter, SprTransformFromTL, type SprTransform } from "./graphics";
import
{
	Colors, LerpColorU32, GameWorldSpaceDistancePerLaneBeat, GameLaneStandardWidth, GameLaneBarLineThickness, GameLaneSlice,
	GameLanePaddingL, GameLanePaddingR, GameLanePaddingTop, GameLanePaddingBot, GameHitCircle,
} from "./theme";

const FrameToTime = (frame: number, fps: number = 60.0): number => (frame / fps);

const GameNoteHitPath: readonly BezierKeyFrame2D[] =
[
	BezierKeyFrame2DLinear(FrameToTime(0), V2(615, 386)),
	BezierKeyFrame2DLinear(FrameToTime(1), V2(639, 342)),
	BezierKeyFrame2DLinear(FrameToTime(2), V2(664, 300)),
	BezierKeyFrame2DLinear(FrameToTime(3), V2(693, 260)),
	BezierKeyFrame2DLinear(FrameToTime(4), V2(725, 222)),
	BezierKeyFrame2DLinear(FrameToTime(5), V2(758, 186)),
	BezierKeyFrame2DLinear(FrameToTime(6), V2(793, 153)),
	BezierKeyFrame2DLinear(FrameToTime(7), V2(830, 122)),
	BezierKeyFrame2DLinear(FrameToTime(8), V2(870, 93)),
	BezierKeyFrame2DLinear(FrameToTime(9), V2(912, 66)),
	BezierKeyFrame2DLinear(FrameToTime(10), V2(954, 43)),
	BezierKeyFrame2DLinear(FrameToTime(11), V2(1001, 27)),
	BezierKeyFrame2DLinear(FrameToTime(12), V2(1046, 11)),
	BezierKeyFrame2DLinear(FrameToTime(13), V2(1094, -2)),
	BezierKeyFrame2DLinear(FrameToTime(14), V2(1142, -14)),
	BezierKeyFrame2DLinear(FrameToTime(15), V2(1192, -18)),
	BezierKeyFrame2DLinear(FrameToTime(16), V2(1240, -22)),
	BezierKeyFrame2DLinear(FrameToTime(17), V2(1292, -23)),
	BezierKeyFrame2DLinear(FrameToTime(18), V2(1336, -22)),
	BezierKeyFrame2DLinear(FrameToTime(19), V2(1385, -16)),
	BezierKeyFrame2DLinear(FrameToTime(20), V2(1435, -8)),
	BezierKeyFrame2DLinear(FrameToTime(21), V2(1479, 3)),
	BezierKeyFrame2DLinear(FrameToTime(22), V2(1526, 16)),
	BezierKeyFrame2DLinear(FrameToTime(23), V2(1570, 36)),
	BezierKeyFrame2DLinear(FrameToTime(24), V2(1612, 56)),
	BezierKeyFrame2DLinear(FrameToTime(25), V2(1658, 83)),
	BezierKeyFrame2DLinear(FrameToTime(26), V2(1696, 115)),
	BezierKeyFrame2DLinear(FrameToTime(27), V2(1734, 144)),
	BezierKeyFrame2DLinear(FrameToTime(28), V2(1770, 176)),
	BezierKeyFrame2DLinear(FrameToTime(29), V2(1803, 210)),
	BezierKeyFrame2DLinear(FrameToTime(30), V2(1836, 247)),
];

const GameNoteHitAnimationDuration: Time = GameNoteHitPath[GameNoteHitPath.length - 1].Time;

interface NoteHitPathAnimationData { PositionOffset: vec2; WhiteFadeIn: number; AlphaFadeOut: number; }

function GetNoteHitPathAnimation(timeSinceHit: Time, extendedLaneWidthFactor: number): NoteHitPathAnimationData
{
	const out: NoteHitPathAnimationData = { PositionOffset: V2(0.0), WhiteFadeIn: 0.0, AlphaFadeOut: 1.0 };
	if (timeSinceHit >= 0.0)
	{
		const sample = SampleBezierFCurve2D(GameNoteHitPath, timeSinceHit);
		out.PositionOffset = V2((sample.x - GameNoteHitPath[0].Value.x) * extendedLaneWidthFactor, sample.y - GameNoteHitPath[0].Value.y);
		// TODO: Just doesn't really look that great... maybe also needs the other hit effects too
	}
	return out;
}

const TimeSinceNoteHit = (noteTime: Time, cursorTime: Time): Time => (cursorTime - noteTime);

function InterpolateDrumrollHitColor(hitPercentage: number): number
{
	let hitNoteColor = 0xFFFFFFFF;
	if (hitPercentage > 0.0)
	{
		// NOTE: Quantized to limit the number of tinted sprite variations that have to be cached
		const t = Math.round(hitPercentage * 32.0) / 32.0;
		hitNoteColor = LerpColorU32(hitNoteColor, Colors.NoteColorDrumrollHit, t);
	}
	return hitNoteColor;
}

export class GameCamera
{
	ScreenSpaceViewportRect = new Rect();
	WorldToScreenScaleFactor = 1.0;
	WorldSpaceSize: vec2 = V2(0.0);
	LaneRect = new Rect();

	LaneWidth(): number { return this.LaneRect.GetWidth(); }
	ExtendedLaneWidthFactor(): number { return this.LaneRect.GetWidth() / GameLaneStandardWidth; }

	WorldToScreenScale(worldScale: number): number { return worldScale * this.WorldToScreenScaleFactor; }
	WorldToScreenSpace(w: vec2): vec2 { return V2(this.ScreenSpaceViewportRect.TL.x + (w.x * this.WorldToScreenScaleFactor), this.ScreenSpaceViewportRect.TL.y + (w.y * this.WorldToScreenScaleFactor)); }

	// NOTE: Same scale as world space but with (0,0) starting at the hit-circle center point
	TimeToLaneSpaceX(cursorTime: Time, noteTime: Time, tempo: Tempo, scrollSpeed: number): number { return ((tempo.BPM * scrollSpeed) / 60.0) * (noteTime - cursorTime) * GameWorldSpaceDistancePerLaneBeat; }
	LaneXToWorldSpace(laneX: number): vec2 { return V2(this.LaneRect.TL.x + GameHitCircle.Center.x + laneX, this.LaneRect.TL.y + GameHitCircle.Center.y); }

	IsPointVisibleOnLane(laneX: number, threshold: number = 280.0): boolean { return (laneX >= -threshold) && (laneX <= (this.LaneWidth() + threshold)); }
	IsRangeVisibleOnLane(laneHeadX: number, laneTailX: number, threshold: number = 280.0): boolean { return (laneTailX >= -threshold) && (laneHeadX <= (this.LaneWidth() + threshold)); }
}

interface ForEachBarLaneData { Time: Time; Tempo: Tempo; ScrollSpeed: number; BarIndex: number; }
interface ForEachNoteLaneData { OriginalNote: Note; TimeHead: Time; TimeTail: Time; Tempo: Tempo; ScrollSpeed: number; }
interface DeferredNoteDrawData { LaneHeadX: number; LaneTailX: number; OriginalNote: Note; NoteStartTime: Time; NoteEndTime: Time; }

function ForEachBarOnNoteLane(course: ChartCourse, maxBeatDuration: Beat, perBarFunc: (it: ForEachBarLaneData) => void): void
{
	const tempoChangeIt = new BeatSortedForwardIterator<TempoChange>();
	const scrollChangeIt = new BeatSortedForwardIterator<ScrollChange>();
	const barLineChangeIt = new BeatSortedForwardIterator<BarLineChange>();

	course.TempoMap.ForEachBeatBar((it) =>
	{
		if (it.Beat > maxBeatDuration)
			return ControlFlow.Break;

		if (!it.IsBar)
			return ControlFlow.Continue;

		if (!VisibleOrDefault(barLineChangeIt.Next(course.BarLineChanges.Sorted, it.Beat)))
			return ControlFlow.Continue;

		const time = course.TempoMap.BeatToTime(it.Beat);
		perBarFunc({
			Time: time,
			Tempo: TempoOrDefault(tempoChangeIt.Next(course.TempoMap.Tempo.Sorted, it.Beat)),
			ScrollSpeed: ScrollOrDefault(scrollChangeIt.Next(course.ScrollChanges.Sorted, it.Beat)),
			BarIndex: it.BarIndex,
		});

		return ControlFlow.Continue;
	});
}

function ForEachNoteOnNoteLane(course: ChartCourse, branch: BranchType, perNoteFunc: (it: ForEachNoteLaneData) => void): void
{
	const tempoChangeIt = new BeatSortedForwardIterator<TempoChange>();
	const scrollChangeIt = new BeatSortedForwardIterator<ScrollChange>();

	for (const note of course.GetNotes(branch).Sorted)
	{
		const beat = note.BeatTime;
		const head = (course.TempoMap.BeatToTime(beat) + note.TimeOffset);
		const tail = (note.BeatDuration > 0) ? (course.TempoMap.BeatToTime(beat + note.BeatDuration) + note.TimeOffset) : head;
		perNoteFunc({
			OriginalNote: note, TimeHead: head, TimeTail: tail,
			Tempo: TempoOrDefault(tempoChangeIt.Next(course.TempoMap.Tempo.Sorted, beat)),
			ScrollSpeed: ScrollOrDefault(scrollChangeIt.Next(course.ScrollChanges.Sorted, beat)),
		});
	}
}

const GameNoteSpr = (noteType: NoteType): SprID =>
{
	switch (noteType)
	{
		case NoteType.Don: return SprID.Game_Note_Don;
		case NoteType.DonBig: return SprID.Game_Note_DonBig;
		case NoteType.Ka: return SprID.Game_Note_Ka;
		case NoteType.KaBig: return SprID.Game_Note_KaBig;
		case NoteType.Drumroll: return SprID.Game_Note_Drumroll;
		case NoteType.DrumrollBig: return SprID.Game_Note_DrumrollBig;
		case NoteType.Balloon: return SprID.Game_Note_Balloon;
		case NoteType.BalloonSpecial: return SprID.Game_Note_BalloonSpecial;
		default: return SprID.Count;
	}
};

const GameNoteSETextSpr = (seType: NoteSEType): SprID =>
{
	switch (seType)
	{
		case NoteSEType.Do: return SprID.Game_NoteTxt_Do;
		case NoteSEType.Don: return SprID.Game_NoteTxt_Don;
		case NoteSEType.DonBig: return SprID.Game_NoteTxt_DonBig;
		case NoteSEType.Ka: return SprID.Game_NoteTxt_Ka;
		case NoteSEType.Katsu: return SprID.Game_NoteTxt_Katsu;
		case NoteSEType.KatsuBig: return SprID.Game_NoteTxt_KatsuBig;
		case NoteSEType.Drumroll: return SprID.Game_NoteTxt_Drumroll;
		case NoteSEType.DrumrollBig: return SprID.Game_NoteTxt_DrumrollBig;
		case NoteSEType.Balloon: return SprID.Game_NoteTxt_Balloon;
		case NoteSEType.BalloonSpecial: return SprID.Game_NoteTxt_BalloonSpecial;
		default: return SprID.Count;
	}
};

export class ChartGamePreview
{
	Camera = new GameCamera();
	ReverseNoteDrawBuffer: DeferredNoteDrawData[] = [];

	// NOTE: Web specific canvas state
	private Canvas: HTMLCanvasElement | null = null;
	private Ctx: CanvasRenderingContext2D | null = null;
	private Draw = new DrawList();
	private CSSWidth = 0;
	private CSSHeight = 0;
	private DevicePixelRatio = 1;

	AttachCanvas(canvas: HTMLCanvasElement | null): void
	{
		this.Canvas = canvas;
		this.Ctx = (canvas !== null) ? canvas.getContext("2d", { alpha: false, desynchronized: true }) : null;
		// NOTE: A newly mounted canvas starts with the default backing size so it always has to be resized
		this.CSSWidth = this.CSSHeight = 0;
	}

	private DrawGamePreviewNote(context: ChartContext, center: vec2, noteType: NoteType): void
	{
		// TODO: Right part stretch animation
		context.Gfx.DrawSprite(this.Draw.Ctx, GameNoteSpr(noteType), SprTransformFromCenter(this.Camera.WorldToScreenSpace(center), V2(this.Camera.WorldToScreenScale(1.0))));
	}

	private DrawGamePreviewNoteDuration(context: ChartContext, centerHead: vec2, centerTail: vec2, noteType: NoteType, colorTint: number = 0xFFFFFFFF): void
	{
		const spr = IsBigNote(noteType) ? SprID.Game_Note_DrumrollLongBig : SprID.Game_Note_DrumrollLong;
		const sprInfo = context.Gfx.GetInfo(spr);
		if (sprInfo.SourceSize.x <= 0) return;

		const centerL = Math.min(centerHead.x, centerTail.x);
		const centerR = Math.max(centerHead.x, centerTail.x);
		const midScaleX = ((centerR - centerL) / (sprInfo.SourceSize.x)) * 3.0;

		context.Gfx.DrawSpriteStretched3(this.Draw.Ctx, spr,
			SprTransformFromCenter(this.Camera.WorldToScreenSpace(V2((centerHead.x + centerTail.x) / 2.0, (centerHead.y + centerTail.y) / 2.0)), V2(this.Camera.WorldToScreenScale(1.0))), colorTint,
			[1.0, midScaleX, 1.0]);
	}

	private DrawGamePreviewNoteSEText(context: ChartContext, centerHead: vec2, centerTail: vec2, seType: NoteSEType): void
	{
		const contentToFooterOffsetY = (GameLaneSlice.FooterCenterY() - GameLaneSlice.ContentCenterY());
		centerHead = V2(centerHead.x, centerHead.y + contentToFooterOffsetY);
		centerTail = V2(centerTail.x, centerTail.y + contentToFooterOffsetY);

		const spr = GameNoteSETextSpr(seType);
		if (spr === SprID.Count)
			return;

		if (seType === NoteSEType.Drumroll || seType === NoteSEType.DrumrollBig)
		{
			const sprInfo = context.Gfx.GetInfo(spr);
			if (sprInfo.SourceSize.x <= 0) return;

			// BUG: Incorrect middle part scaling if the drumroll is too short
			const midAlignmentOffset = (seType === NoteSEType.DrumrollBig) ? 136.0 : 68.0;
			const centerL = Math.min(centerHead.x, centerTail.x);
			const centerR = Math.max(centerHead.x, centerTail.x);
			const midScaleX = ((centerR - centerL - midAlignmentOffset) / (sprInfo.SourceSize.x)) * 3.0;

			context.Gfx.DrawSpriteStretched3(this.Draw.Ctx, spr,
				SprTransformFromCenter(this.Camera.WorldToScreenSpace(V2((centerHead.x + centerTail.x) / 2.0, (centerHead.y + centerTail.y) / 2.0)), V2(this.Camera.WorldToScreenScale(1.0))), 0xFFFFFFFF,
				[1.0, midScaleX, 1.0]);
		}
		else
		{
			context.Gfx.DrawSprite(this.Draw.Ctx, spr, SprTransformFromCenter(this.Camera.WorldToScreenSpace(centerHead), V2(this.Camera.WorldToScreenScale(1.0))));
		}
	}

	private DrawGamePreviewNumericText(context: ChartContext, baseTransform: SprTransform, text: string, color: number = 0xFFFFFFFF): void
	{
		// TODO: Make more generic by taking in an array of glyph rects as lookup table (?)
		const sprFontNumericalCharSet = "0123456789+-./%";
		const advanceX = 11.0;
		const sprInfo = context.Gfx.GetInfo(SprID.Game_Font_Numerical);
		if (sprInfo.SourceSize.x <= 0) return;
		const perCharSprSizeY = sprInfo.SourceSize.y / sprFontNumericalCharSet.length;

		let pivotOffset = V2(0.0);
		if (baseTransform.Pivot.x !== 0.0 || baseTransform.Pivot.y !== 0.0)
		{
			let totalSizeX = 0.0;
			for (const c of text) if (sprFontNumericalCharSet.includes(c)) totalSizeX += advanceX;
			pivotOffset = V2(totalSizeX * baseTransform.Pivot.x, sprInfo.SourceSize.y * baseTransform.Pivot.y);
		}

		let writeHeadX = 0.0;
		for (const c of text)
		{
			const charIndex = sprFontNumericalCharSet.indexOf(c);
			if (charIndex < 0)
				continue;

			const charTransform = SprTransformFromTL(this.Camera.WorldToScreenSpace(baseTransform.Position), V2(this.Camera.WorldToScreenScale(1.0)), baseTransform.Rotation);
			const charUV = { TL: V2(0.0, (charIndex + 0) * perCharSprSizeY / sprInfo.SourceSize.y), BR: V2(1.0, (charIndex + 1) * perCharSprSizeY / sprInfo.SourceSize.y) };

			charTransform.Pivot = V2(((-writeHeadX) / sprInfo.SourceSize.x) + (pivotOffset.x / sprInfo.SourceSize.x), pivotOffset.y / sprInfo.SourceSize.y);
			charTransform.Scale = V2(charTransform.Scale.x * baseTransform.Scale.x, (charTransform.Scale.y * baseTransform.Scale.y) / sprFontNumericalCharSet.length);

			context.Gfx.DrawSprite(this.Draw.Ctx, SprID.Game_Font_Numerical, charTransform, color, charUV);
			writeHeadX += advanceX;
		}
	}

	DrawGui(context: ChartContext, animatedCursorTime: Time): void
	{
		// HACK: Note text detection
		{
			// TODO: Implement properly
			const isLastNoteInGroup = (notes: SortedNotesList, index: number): boolean =>
			{
				const thisNote = notes.Sorted[index];
				const nextNote = (index + 1 < notes.Sorted.length) ? notes.Sorted[index + 1] : null;
				if (nextNote === null)
					return true;

				const beatDistanceToNext = (nextNote.BeatTime - thisNote.BeatTime);
				return (beatDistanceToNext >= BeatDiv(BeatFromBars(1), 4));
			};

			const notes = context.ChartSelectedCourse.GetNotes(context.ChartSelectedBranch);
			for (let i = 0; i < notes.Sorted.length; i++)
			{
				const it = notes.Sorted[i];
				switch (it.Type)
				{
					case NoteType.Don: { it.TempSEType = isLastNoteInGroup(notes, i) ? NoteSEType.Don : NoteSEType.Do; } break;
					case NoteType.DonBig: { it.TempSEType = NoteSEType.DonBig; } break;
					case NoteType.Ka: { it.TempSEType = isLastNoteInGroup(notes, i) ? NoteSEType.Katsu : NoteSEType.Ka; } break;
					case NoteType.KaBig: { it.TempSEType = NoteSEType.KatsuBig; } break;
					case NoteType.Drumroll: { it.TempSEType = NoteSEType.Drumroll; } break;
					case NoteType.DrumrollBig: { it.TempSEType = NoteSEType.DrumrollBig; } break;
					case NoteType.Balloon: { it.TempSEType = NoteSEType.Balloon; } break;
					case NoteType.BalloonSpecial: { it.TempSEType = NoteSEType.BalloonSpecial; } break;
					default: { it.TempSEType = NoteSEType.Count; } break;
				}
			}
		}

		const canvas = this.Canvas, ctx = this.Ctx;
		if (canvas === null || ctx === null)
			return;

		const cssWidth = canvas.clientWidth, cssHeight = canvas.clientHeight;
		const dpr = window.devicePixelRatio || 1;
		if (cssWidth <= 0 || cssHeight <= 0)
			return;
		if (cssWidth !== this.CSSWidth || cssHeight !== this.CSSHeight || dpr !== this.DevicePixelRatio)
		{
			this.CSSWidth = cssWidth; this.CSSHeight = cssHeight; this.DevicePixelRatio = dpr;
			canvas.width = Math.max(1, Math.round(cssWidth * dpr));
			canvas.height = Math.max(1, Math.round(cssHeight * dpr));
		}

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const d = this.Draw;
		d.Begin(ctx);
		ctx.fillStyle = "#1f1f1f";
		ctx.fillRect(0, 0, cssWidth, cssHeight);

		const buttonMargin = 8.0;
		const minContentRectSize = V2(128.0, 72.0);
		const itemRect = Rect.FromTLSize(V2(0, 0), V2(Math.max(cssWidth, minContentRectSize.x), Math.max(cssHeight, minContentRectSize.y)));
		d.AddRectFilled(itemRect.TL, itemRect.BR, 0x1A737373);

		const camera = this.Camera;
		camera.ScreenSpaceViewportRect = new Rect(V2(itemRect.TL.x + buttonMargin, itemRect.TL.y + buttonMargin), V2(itemRect.BR.x - buttonMargin, itemRect.BR.y - buttonMargin));
		camera.ScreenSpaceViewportRect.BR = V2(
			Math.max(camera.ScreenSpaceViewportRect.BR.x, camera.ScreenSpaceViewportRect.TL.x + (minContentRectSize.x - buttonMargin)),
			Math.max(camera.ScreenSpaceViewportRect.BR.y, camera.ScreenSpaceViewportRect.TL.y + minContentRectSize.y));
		{
			let newAspectRatio = GetAspectRatioRect(camera.ScreenSpaceViewportRect);
			const minAR = GetAspectRatio(Settings.General.GameViewportAspectRatioMin.x, Settings.General.GameViewportAspectRatioMin.y);
			const maxAR = GetAspectRatio(Settings.General.GameViewportAspectRatioMax.x, Settings.General.GameViewportAspectRatioMax.y);
			if (minAR !== 0.0) newAspectRatio = ClampBot(newAspectRatio, minAR);
			if (maxAR !== 0.0) newAspectRatio = Math.min(newAspectRatio, maxAR);

			if (newAspectRatio !== 0.0 && newAspectRatio !== GetAspectRatioRect(camera.ScreenSpaceViewportRect))
				camera.ScreenSpaceViewportRect = FitInsideFixedAspectRatio(camera.ScreenSpaceViewportRect, newAspectRatio);
		}

		const standardSize = V2(GameLaneStandardWidth + GameLanePaddingL + GameLanePaddingR, GameLaneSlice.TotalHeight() + GameLanePaddingTop + GameLanePaddingBot);
		const standardAspectRatio = GetAspectRatio(standardSize.x, standardSize.y);
		const viewportAspectRatio = GetAspectRatioRect(camera.ScreenSpaceViewportRect);
		if (viewportAspectRatio <= standardAspectRatio) // NOTE: Standard case of (<= 16:9) with a fixed sized lane being centered
		{
			camera.WorldSpaceSize = V2(standardSize.x, standardSize.x / viewportAspectRatio);
			camera.WorldToScreenScaleFactor = camera.ScreenSpaceViewportRect.GetWidth() / standardSize.x;
			camera.LaneRect = Rect.FromTLSize(V2(GameLanePaddingL, GameLanePaddingTop + (camera.WorldSpaceSize.y * 0.5) - (standardSize.y * 0.5)), V2(GameLaneStandardWidth, GameLaneSlice.TotalHeight()));
		}
		else // NOTE: Ultra wide case of (> 16:9) with the lane being extended further to the right
		{
			const extendedLaneWidth = (standardSize.x * (viewportAspectRatio / standardAspectRatio)) - GameLanePaddingL - GameLanePaddingR;
			camera.WorldSpaceSize = V2(extendedLaneWidth, standardSize.y);
			camera.WorldToScreenScaleFactor = camera.ScreenSpaceViewportRect.GetHeight() / camera.WorldSpaceSize.y;
			camera.LaneRect = Rect.FromTLSize(V2(GameLanePaddingL, GameLanePaddingTop), V2(extendedLaneWidth, GameLaneSlice.TotalHeight()));
		}

		if (!context.Gfx.IsAsyncLoading())
			context.Gfx.Rasterize(SprGroup.Game, camera.WorldToScreenScaleFactor * dpr);

		d.PushClipRect(camera.ScreenSpaceViewportRect.TL, camera.ScreenSpaceViewportRect.BR);
		{
			const isPlayback = context.GetIsPlayback();
			const exactCursorBeatAndTime = context.GetCursorBeatAndTime();
			const cursorTimeOrAnimated = isPlayback ? exactCursorBeatAndTime.Time : animatedCursorTime;
			const chartBeatDuration = context.TimeToBeat(context.Chart.GetDurationOrDefault());
			const lane = camera.LaneRect;

			// NOTE: Lane background and borders
			d.AddRectFilled(camera.WorldToScreenSpace(lane.TL), camera.WorldToScreenSpace(lane.BR), Colors.GameLaneBorderColor);
			d.AddRectFilled(
				camera.WorldToScreenSpace(V2(lane.TL.x, lane.TL.y + GameLaneSlice.TopBorder)),
				camera.WorldToScreenSpace(V2(lane.TL.x + camera.LaneWidth(), lane.TL.y + GameLaneSlice.TopBorder + GameLaneSlice.Content)),
				Colors.GameLaneContentBackgroundColor);
			d.AddRectFilled(
				camera.WorldToScreenSpace(V2(lane.TL.x, lane.TL.y + GameLaneSlice.TopBorder + GameLaneSlice.Content + GameLaneSlice.MidBorder)),
				camera.WorldToScreenSpace(V2(lane.TL.x + camera.LaneWidth(), lane.TL.y + GameLaneSlice.TopBorder + GameLaneSlice.Content + GameLaneSlice.MidBorder + GameLaneSlice.Footer)),
				Colors.GameLaneFooterBackgroundColor);

			// NOTE: Hit indicator circle
			const hitCenter = camera.WorldToScreenSpace(camera.LaneXToWorldSpace(0.0));
			d.AddCircleFilled(hitCenter, camera.WorldToScreenScale(GameHitCircle.InnerFillRadius), Colors.GameLaneHitCircleInnerFillColor);
			d.AddCircle(hitCenter, camera.WorldToScreenScale(GameHitCircle.InnerOutlineRadius), Colors.GameLaneHitCircleInnerOutlineColor, camera.WorldToScreenScale(GameHitCircle.InnerOutlineThickness));
			d.AddCircle(hitCenter, camera.WorldToScreenScale(GameHitCircle.OuterOutlineRadius), Colors.GameLaneHitCircleOuterOutlineColor, camera.WorldToScreenScale(GameHitCircle.OuterOutlineThickness));

			ForEachBarOnNoteLane(context.ChartSelectedCourse, chartBeatDuration, (it) =>
			{
				const laneX = camera.TimeToLaneSpaceX(cursorTimeOrAnimated, it.Time, it.Tempo, it.ScrollSpeed);
				if (camera.IsPointVisibleOnLane(laneX))
				{
					const world = camera.LaneXToWorldSpace(laneX);
					const tl = camera.WorldToScreenSpace(V2(world.x, world.y - GameLaneSlice.Content * 0.5));
					const br = camera.WorldToScreenSpace(V2(world.x, world.y + GameLaneSlice.Content * 0.5));
					d.AddLine(tl, br, Colors.GameLaneBarLineColor, camera.WorldToScreenScale(GameLaneBarLineThickness));

					this.DrawGamePreviewNumericText(context, SprTransformFromTL(V2(world.x + 5.0, world.y - GameLaneSlice.Content * 0.5 + 1.0), V2(1.0)), String(it.BarIndex));
				}
			});

			ForEachNoteOnNoteLane(context.ChartSelectedCourse, context.ChartSelectedBranch, (it) =>
			{
				const laneHeadX = camera.TimeToLaneSpaceX(cursorTimeOrAnimated, it.TimeHead, it.Tempo, it.ScrollSpeed);
				const laneTailX = camera.TimeToLaneSpaceX(cursorTimeOrAnimated, it.TimeTail, it.Tempo, it.ScrollSpeed);
				const timeSinceHeadHit = TimeSinceNoteHit(it.TimeHead, cursorTimeOrAnimated);
				const timeSinceTailHit = TimeSinceNoteHit(it.TimeTail, cursorTimeOrAnimated);
				if (it.OriginalNote.BeatDuration <= 0 && timeSinceHeadHit >= 0.0)
				{
					if (timeSinceHeadHit <= GameNoteHitAnimationDuration)
						this.ReverseNoteDrawBuffer.push({ LaneHeadX: ClampBot(laneHeadX, 0.0), LaneTailX: ClampBot(laneTailX, 0.0), OriginalNote: it.OriginalNote, NoteStartTime: it.TimeHead, NoteEndTime: it.TimeTail });
				}
				else
				{
					if (camera.IsRangeVisibleOnLane(Math.min(laneHeadX, laneTailX), Math.max(laneHeadX, laneTailX)) || (timeSinceHeadHit >= 0.0 && timeSinceTailHit <= GameNoteHitAnimationDuration))
						this.ReverseNoteDrawBuffer.push({ LaneHeadX: laneHeadX, LaneTailX: laneTailX, OriginalNote: it.OriginalNote, NoteStartTime: it.TimeHead, NoteEndTime: it.TimeTail });
				}
			});

			const drummrollHitInterval = GetGridBeatSnap(Settings.General.DrumrollAutoHitBarDivision);
			for (let i = this.ReverseNoteDrawBuffer.length - 1; i >= 0; i--)
			{
				const it = this.ReverseNoteDrawBuffer[i];
				const timeSinceHit = TimeSinceNoteHit(it.NoteStartTime, cursorTimeOrAnimated);
				const note = it.OriginalNote;

				if (note.BeatDuration > 0)
				{
					if (IsBalloonNote(note.Type))
					{
						// BUG: Negative scroll speed balloons not drawn correctly
						if (cursorTimeOrAnimated <= it.NoteEndTime)
						{
							this.DrawGamePreviewNote(context, camera.LaneXToWorldSpace(ClampBot(it.LaneHeadX, 0.0)), note.Type);
							this.DrawGamePreviewNoteSEText(context, camera.LaneXToWorldSpace(ClampBot(it.LaneHeadX, 0.0)), V2(0.0), note.TempSEType);
						}
					}
					else
					{
						const maxHitCount = BeatDiv(note.BeatDuration, drummrollHitInterval);
						const hitIntervalRoundedDuration = (drummrollHitInterval * maxHitCount);

						let drumrollHitsSoFar = 0;
						if (timeSinceHit >= 0.0)
						{
							for (let subBeat = hitIntervalRoundedDuration; subBeat >= 0; subBeat -= drummrollHitInterval)
							{
								const subHitTime = context.BeatToTime(note.BeatTime + subBeat) + note.TimeOffset;
								if (subHitTime <= cursorTimeOrAnimated)
									drumrollHitsSoFar++;
							}
						}

						const hitPercentage = ConvertRangeClampOutput(0.0, ClampBot(maxHitCount, 4), 0.0, 1.0, drumrollHitsSoFar);
						const hitNoteColor = InterpolateDrumrollHitColor(hitPercentage);
						this.DrawGamePreviewNoteDuration(context, camera.LaneXToWorldSpace(it.LaneHeadX), camera.LaneXToWorldSpace(it.LaneTailX), note.Type, hitNoteColor);
						this.DrawGamePreviewNote(context, camera.LaneXToWorldSpace(it.LaneHeadX), note.Type);
						this.DrawGamePreviewNoteSEText(context, camera.LaneXToWorldSpace(it.LaneHeadX), camera.LaneXToWorldSpace(it.LaneTailX), note.TempSEType);

						if (timeSinceHit >= 0.0)
						{
							for (let subBeat = hitIntervalRoundedDuration; subBeat >= 0; subBeat -= drummrollHitInterval)
							{
								const subHitTime = context.BeatToTime(note.BeatTime + subBeat) + note.TimeOffset;
								const timeSinceSubHit = TimeSinceNoteHit(subHitTime, cursorTimeOrAnimated);
								if (timeSinceSubHit > 0.0 && timeSinceSubHit <= GameNoteHitAnimationDuration)
								{
									// TODO: Scale duration, animation speed and path by extended lane width
									const hitAnimation = GetNoteHitPathAnimation(timeSinceSubHit, camera.ExtendedLaneWidthFactor());
									const base = camera.LaneXToWorldSpace(ClampBot(it.LaneHeadX, 0.0));
									const noteCenter = V2(base.x + hitAnimation.PositionOffset.x, base.y + hitAnimation.PositionOffset.y);

									if (hitAnimation.AlphaFadeOut >= 1.0)
										this.DrawGamePreviewNote(context, noteCenter, ToBigNoteIf(NoteType.Don, IsBigNote(note.Type)));
								}
							}
						}
					}
				}
				else
				{
					// TODO: Instead of offseting the lane x position just draw as HitCenter + PositionOffset directly (?)
					const hitAnimation = GetNoteHitPathAnimation(timeSinceHit, camera.ExtendedLaneWidthFactor());
					const base = camera.LaneXToWorldSpace(it.LaneHeadX);
					const noteCenter = V2(base.x + hitAnimation.PositionOffset.x, base.y + hitAnimation.PositionOffset.y);

					if (hitAnimation.AlphaFadeOut >= 1.0)
						this.DrawGamePreviewNote(context, noteCenter, note.Type);

					if (timeSinceHit <= 0.0)
						this.DrawGamePreviewNoteSEText(context, noteCenter, V2(0.0), note.TempSEType);
				}
			}
			this.ReverseNoteDrawBuffer = [];

			// NOTE: Lane left / right foreground borders
			d.AddRectFilled(camera.WorldToScreenSpace(lane.GetTL()), camera.WorldToScreenSpace(V2(lane.GetBL().x - GameLanePaddingL, lane.GetBL().y)), Colors.GameLaneBorderColor);
			d.AddRectFilled(camera.WorldToScreenSpace(lane.GetTR()), camera.WorldToScreenSpace(V2(lane.GetBR().x + GameLanePaddingR, lane.GetBR().y)), Colors.GameLaneBorderColor);
		}
		d.PopClipRect();
	}
}

export type { DeferredNoteDrawData };
