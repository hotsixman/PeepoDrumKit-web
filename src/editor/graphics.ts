// Port of PeepoDrumKit "peepo_drum_kit/chart_editor_graphics.h" / "chart_editor_graphics.cpp"
// https://github.com/samyuu/PeepoDrumKit
//
// NOTE: The original rasterizes the SVG sprites using thorvg into GPU textures.
//		 Here the browser rasterizes the SVGs into (padded) offscreen canvases which are then drawn using drawImage()
import { type vec2, ApproxmiatelySame } from "../core/types";

export enum SprGroup { Timeline, Game, Count }

export enum SprID
{
	Timeline_Note_Don,
	Timeline_Note_DonBig,
	Timeline_Note_Ka,
	Timeline_Note_KaBig,
	Timeline_Note_Drumroll,
	Timeline_Note_DrumrollBig,
	Timeline_Note_DrumrollLong,
	Timeline_Note_DrumrollLongBig,
	Timeline_Note_Balloon,
	Timeline_Note_BalloonSpecial,
	Timeline_Note_BalloonLong,
	Timeline_Note_BalloonLongSpecial,

	Game_Note_Don,
	Game_Note_DonBig,
	Game_Note_Ka,
	Game_Note_KaBig,
	Game_Note_Drumroll,
	Game_Note_DrumrollBig,
	Game_Note_DrumrollLong,
	Game_Note_DrumrollLongBig,
	Game_Note_Balloon,
	Game_Note_BalloonSpecial,
	Game_NoteTxt_Do,
	Game_NoteTxt_Don,
	Game_NoteTxt_DonBig,
	Game_NoteTxt_Ka,
	Game_NoteTxt_Katsu,
	Game_NoteTxt_KatsuBig,
	Game_NoteTxt_Drumroll,
	Game_NoteTxt_DrumrollBig,
	Game_NoteTxt_Balloon,
	Game_NoteTxt_BalloonSpecial,
	// TODO: Split into individual sprites to correctly handle padding (?)
	Game_Font_Numerical,

	Count
}

interface SprTypeDesc { Spr: SprID; Group: SprGroup; FilePath: string; BaseScale?: number; }

const Asset = (name: string) => `${import.meta.env.BASE_URL}assets/graphics/${name}`;

const SprDescTable: readonly SprTypeDesc[] =
[
	{ Spr: SprID.Timeline_Note_Don, Group: SprGroup.Timeline, FilePath: Asset("timeline_note_don.svg") },
	{ Spr: SprID.Timeline_Note_DonBig, Group: SprGroup.Timeline, FilePath: Asset("timeline_note_don_big.svg") },
	{ Spr: SprID.Timeline_Note_Ka, Group: SprGroup.Timeline, FilePath: Asset("timeline_note_ka.svg") },
	{ Spr: SprID.Timeline_Note_KaBig, Group: SprGroup.Timeline, FilePath: Asset("timeline_note_ka_big.svg") },
	{ Spr: SprID.Timeline_Note_Drumroll, Group: SprGroup.Timeline, FilePath: Asset("timeline_note_renda.svg") },
	{ Spr: SprID.Timeline_Note_DrumrollBig, Group: SprGroup.Timeline, FilePath: Asset("timeline_note_renda_big.svg") },
	{ Spr: SprID.Timeline_Note_DrumrollLong, Group: SprGroup.Timeline, FilePath: Asset("timeline_note_renda_long.svg") },
	{ Spr: SprID.Timeline_Note_DrumrollLongBig, Group: SprGroup.Timeline, FilePath: Asset("timeline_note_renda_long_big.svg") },
	{ Spr: SprID.Timeline_Note_Balloon, Group: SprGroup.Timeline, FilePath: Asset("timeline_note_fuusen.svg") },
	{ Spr: SprID.Timeline_Note_BalloonSpecial, Group: SprGroup.Timeline, FilePath: Asset("timeline_note_fuusen_big.svg") },
	{ Spr: SprID.Timeline_Note_BalloonLong, Group: SprGroup.Timeline, FilePath: Asset("timeline_note_fuusen_long.svg") },
	{ Spr: SprID.Timeline_Note_BalloonLongSpecial, Group: SprGroup.Timeline, FilePath: Asset("timeline_note_fuusen_long_big.svg") },

	{ Spr: SprID.Game_Note_Don, Group: SprGroup.Game, FilePath: Asset("game_note_don.svg") },
	{ Spr: SprID.Game_Note_DonBig, Group: SprGroup.Game, FilePath: Asset("game_note_don_big.svg") },
	{ Spr: SprID.Game_Note_Ka, Group: SprGroup.Game, FilePath: Asset("game_note_ka.svg") },
	{ Spr: SprID.Game_Note_KaBig, Group: SprGroup.Game, FilePath: Asset("game_note_ka_big.svg") },
	{ Spr: SprID.Game_Note_Drumroll, Group: SprGroup.Game, FilePath: Asset("game_note_renda.svg") },
	{ Spr: SprID.Game_Note_DrumrollBig, Group: SprGroup.Game, FilePath: Asset("game_note_renda_big.svg") },
	{ Spr: SprID.Game_Note_DrumrollLong, Group: SprGroup.Game, FilePath: Asset("game_note_renda_long.svg") },
	{ Spr: SprID.Game_Note_DrumrollLongBig, Group: SprGroup.Game, FilePath: Asset("game_note_renda_long_big.svg") },
	{ Spr: SprID.Game_Note_Balloon, Group: SprGroup.Game, FilePath: Asset("game_note_fuusen.svg") },
	{ Spr: SprID.Game_Note_BalloonSpecial, Group: SprGroup.Game, FilePath: Asset("game_note_fuusen_big.svg") },
	{ Spr: SprID.Game_NoteTxt_Do, Group: SprGroup.Game, FilePath: Asset("game_note_txt_do.svg") },
	{ Spr: SprID.Game_NoteTxt_Don, Group: SprGroup.Game, FilePath: Asset("game_note_txt_don.svg") },
	{ Spr: SprID.Game_NoteTxt_DonBig, Group: SprGroup.Game, FilePath: Asset("game_note_txt_don_big.svg") },
	{ Spr: SprID.Game_NoteTxt_Ka, Group: SprGroup.Game, FilePath: Asset("game_note_txt_ka.svg") },
	{ Spr: SprID.Game_NoteTxt_Katsu, Group: SprGroup.Game, FilePath: Asset("game_note_txt_katsu.svg") },
	{ Spr: SprID.Game_NoteTxt_KatsuBig, Group: SprGroup.Game, FilePath: Asset("game_note_txt_katsu_big.svg") },
	{ Spr: SprID.Game_NoteTxt_Drumroll, Group: SprGroup.Game, FilePath: Asset("game_note_txt_renda.svg") },
	{ Spr: SprID.Game_NoteTxt_DrumrollBig, Group: SprGroup.Game, FilePath: Asset("game_note_txt_renda_big.svg") },
	{ Spr: SprID.Game_NoteTxt_Balloon, Group: SprGroup.Game, FilePath: Asset("game_note_txt_fuusen.svg") },
	{ Spr: SprID.Game_NoteTxt_BalloonSpecial, Group: SprGroup.Game, FilePath: Asset("game_note_txt_fuusen_big.svg") },
	// TODO: ...
	{ Spr: SprID.Game_Font_Numerical, Group: SprGroup.Game, FilePath: Asset("game_font_numerical.svg"), BaseScale: 0.5 },
];

export const GetSprGroup = (spr: SprID): SprGroup => (spr < SprID.Count) ? SprDescTable[spr].Group : SprGroup.Count;

export interface SprInfo { SourceSize: vec2; RasterScale: number; }

export interface SprTransform
{
	Position: vec2;	// NOTE: In absolute screen space
	Pivot: vec2;	// NOTE: In normalized 0 to 1 range
	Scale: vec2;	// NOTE: Around pivot
	Rotation: number; // NOTE: Radians around pivot
}

export const SprTransformFromTL = (tl: vec2, scale: vec2 = { x: 1, y: 1 }, rot = 0.0): SprTransform => ({ Position: tl, Pivot: { x: 0.0, y: 0.0 }, Scale: scale, Rotation: rot });
export const SprTransformFromCenter = (center: vec2, scale: vec2 = { x: 1, y: 1 }, rot = 0.0): SprTransform => ({ Position: center, Pivot: { x: 0.5, y: 0.5 }, Scale: scale, Rotation: rot });

// NOTE: Normalized (0.0f <-> 1.0f) source rect
export interface SprUV { TL: vec2; BR: vec2; }

const PerSideRasterizedTexPadding = 2;
const CombinedRasterizedTexPadding = (PerSideRasterizedTexPadding * 2);

type Canvas2D = HTMLCanvasElement | OffscreenCanvas;
type Context2D = CanvasRenderingContext2D;

function CreateCanvas(width: number, height: number): HTMLCanvasElement
{
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, width);
	canvas.height = Math.max(1, height);
	return canvas;
}

class SvgRasterizer
{
	Image: HTMLImageElement | null = null;
	PictureSize: vec2 = { x: 0, y: 0 };
	BaseScale = 1.0;

	async ParseSVG(svgFileContent: string, baseScale: number): Promise<void>
	{
		// NOTE: Picture size taken from the viewBox (or the width/height attributes)
		const doc = new DOMParser().parseFromString(svgFileContent, "image/svg+xml");
		const svg = doc.documentElement;
		let width = parseFloat(svg.getAttribute("width") ?? "");
		let height = parseFloat(svg.getAttribute("height") ?? "");
		const viewBox = svg.getAttribute("viewBox");
		if ((!Number.isFinite(width) || !Number.isFinite(height)) && viewBox !== null)
		{
			const parts = viewBox.split(/[\s,]+/).map(parseFloat);
			width = parts[2]; height = parts[3];
		}
		// NOTE: Force explicit dimensions so that every browser rasterizes the image at the expected aspect ratio
		svg.setAttribute("width", String(width));
		svg.setAttribute("height", String(height));
		const serialized = new XMLSerializer().serializeToString(svg);

		this.BaseScale = baseScale;
		this.PictureSize = { x: width * baseScale, y: height * baseScale };

		const image = new Image();
		image.decoding = "async";
		image.src = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml" }));
		await image.decode();
		this.Image = image;
	}

	Rasterize(scale: number): HTMLCanvasElement | null
	{
		if (this.Image === null)
			return null;

		const scaledW = this.PictureSize.x * scale, scaledH = this.PictureSize.y * scale;
		const resW = Math.ceil(scaledW), resH = Math.ceil(scaledH);
		if (resW <= 0 || resH <= 0)
			return null;

		const P = PerSideRasterizedTexPadding;
		const canvas = CreateCanvas(resW + CombinedRasterizedTexPadding, resH + CombinedRasterizedTexPadding);
		const ctx = canvas.getContext("2d")!;
		ctx.drawImage(this.Image, P, P, scaledW, scaledH);

		// NOTE: Extend the edge pixels into the padding to avoid sampling artifacts for stretched sprites
		ctx.drawImage(canvas, P, P, resW, 1, P, 0, resW, P);
		ctx.drawImage(canvas, P, P + resH - 1, resW, 1, P, P + resH, resW, P);
		ctx.drawImage(canvas, P, 0, 1, resH + CombinedRasterizedTexPadding, 0, 0, P, resH + CombinedRasterizedTexPadding);
		ctx.drawImage(canvas, P + resW - 1, 0, 1, resH + CombinedRasterizedTexPadding, P + resW, 0, P, resH + CombinedRasterizedTexPadding);
		return canvas;
	}
}

interface TintCacheEntry { Color: number; Canvas: HTMLCanvasElement; }

export class ChartGraphicsResources
{
	private PerGroupRasterScale: number[] = new Array(SprGroup.Count).fill(0.0);
	private PendingRasterScale: number[] = new Array(SprGroup.Count).fill(0.0);
	private PendingRasterScaleSince: number[] = new Array(SprGroup.Count).fill(0.0);
	private FinishedLoading = false;

	private PerSprSvg: SvgRasterizer[] = Array.from({ length: SprID.Count }, () => new SvgRasterizer());
	private PerSprTexture: (HTMLCanvasElement | null)[] = new Array(SprID.Count).fill(null);
	private PerSprTintCache: TintCacheEntry[][] = Array.from({ length: SprID.Count }, () => []);

	StartAsyncLoading(): void
	{
		this.FinishedLoading = false;
		void (async () =>
		{
			await Promise.all(SprDescTable.map(async (it) =>
			{
				try
				{
					const response = await fetch(it.FilePath);
					const fileContent = await response.text();
					await this.PerSprSvg[it.Spr].ParseSVG(fileContent, it.BaseScale ?? 1.0);
				}
				catch (e) { console.error(`Failed to load sprite file '${it.FilePath}'`, e); }
			}));
			this.FinishedLoading = true;
		})();
	}

	UpdateAsyncLoading(): void { /* NOTE: Completion is signaled by the promise directly */ }
	IsAsyncLoading(): boolean { return !this.FinishedLoading; }

	// NOTE: To avoid stuttering while continuously resizing, re-rasterization is slightly delayed until the requested scale stops changing
	Rasterize(group: SprGroup, scale: number): void
	{
		if (!this.FinishedLoading)
			return;

		const currentRasterScale = this.PerGroupRasterScale[group];
		if (ApproxmiatelySame(currentRasterScale, scale))
			return;

		const now = performance.now();
		if (!ApproxmiatelySame(this.PendingRasterScale[group], scale))
		{
			this.PendingRasterScale[group] = scale;
			this.PendingRasterScaleSince[group] = now;
			if (currentRasterScale !== 0.0)
				return;
		}
		else if (currentRasterScale !== 0.0 && (now - this.PendingRasterScaleSince[group]) < 120.0)
		{
			return;
		}

		this.PerGroupRasterScale[group] = scale;
		for (let sprIndex = 0; sprIndex < SprID.Count; sprIndex++)
		{
			if (GetSprGroup(sprIndex) !== group)
				continue;
			this.PerSprTexture[sprIndex] = this.PerSprSvg[sprIndex].Rasterize(scale);
			this.PerSprTintCache[sprIndex] = [];
		}
	}

	GetInfo(spr: SprID): SprInfo
	{
		if (!this.FinishedLoading || spr >= SprID.Count)
			return { SourceSize: { x: 0, y: 0 }, RasterScale: 0.0 };
		return { SourceSize: this.PerSprSvg[spr].PictureSize, RasterScale: this.PerGroupRasterScale[GetSprGroup(spr)] };
	}

	private GetTintedTexture(spr: SprID, tex: HTMLCanvasElement, color: number): HTMLCanvasElement
	{
		const cache = this.PerSprTintCache[spr];
		for (const entry of cache)
			if (entry.Color === color) return entry.Canvas;

		const canvas = CreateCanvas(tex.width, tex.height);
		const ctx = canvas.getContext("2d")!;
		ctx.drawImage(tex, 0, 0);
		ctx.globalCompositeOperation = "multiply";
		ctx.fillStyle = `rgb(${color & 0xFF},${(color >>> 8) & 0xFF},${(color >>> 16) & 0xFF})`;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.globalCompositeOperation = "destination-in";
		ctx.drawImage(tex, 0, 0);

		if (cache.length >= 48) cache.shift();
		cache.push({ Color: color, Canvas: canvas });
		return canvas;
	}

	/** NOTE: Draws a (sub-rect of a) sprite. "colorTint" is a packed 0xAABBGGRR color, where only the alpha channel is applied unless "multiplyTint" is set */
	DrawSprite(ctx: Context2D, spr: SprID, transform: SprTransform, colorTint: number = 0xFFFFFFFF, uv: SprUV | null = null): void
	{
		if (!this.FinishedLoading || spr >= SprID.Count)
			return;
		let tex = this.PerSprTexture[spr];
		if (tex === null)
			return;

		const rasterScale = this.PerGroupRasterScale[GetSprGroup(spr)];
		const pictureSize = this.PerSprSvg[spr].PictureSize;
		const scaledPictureW = pictureSize.x * rasterScale, scaledPictureH = pictureSize.y * rasterScale;

		const uvTLx = (uv !== null) ? uv.TL.x : 0.0, uvTLy = (uv !== null) ? uv.TL.y : 0.0;
		const uvBRx = (uv !== null) ? uv.BR.x : 1.0, uvBRy = (uv !== null) ? uv.BR.y : 1.0;

		// NOTE: Destination size in screen space is independent of the raster scale
		const sizeX = transform.Scale.x * pictureSize.x;
		const sizeY = transform.Scale.y * pictureSize.y;
		const pivotX = -transform.Pivot.x * sizeX, pivotY = -transform.Pivot.y * sizeY;

		const sx = PerSideRasterizedTexPadding + uvTLx * scaledPictureW, sy = PerSideRasterizedTexPadding + uvTLy * scaledPictureH;
		const sw = (uvBRx - uvTLx) * scaledPictureW, sh = (uvBRy - uvTLy) * scaledPictureH;
		if (sw <= 0 || sh <= 0)
			return;

		const rgb = (colorTint & 0x00FFFFFF) >>> 0;
		if (rgb !== 0x00FFFFFF)
			tex = this.GetTintedTexture(spr, tex, rgb);

		const alpha = ((colorTint >>> 24) & 0xFF) / 255.0;
		if (alpha <= 0.0)
			return;
		const prevAlpha = ctx.globalAlpha;
		if (alpha < 1.0) ctx.globalAlpha = prevAlpha * alpha;

		if (transform.Rotation === 0.0)
		{
			ctx.drawImage(tex, sx, sy, sw, sh, transform.Position.x + pivotX, transform.Position.y + pivotY, sizeX, sizeY);
		}
		else
		{
			ctx.save();
			ctx.translate(transform.Position.x, transform.Position.y);
			ctx.rotate(transform.Rotation);
			ctx.drawImage(tex, sx, sy, sw, sh, pivotX, pivotY, sizeX, sizeY);
			ctx.restore();
		}

		if (alpha < 1.0) ctx.globalAlpha = prevAlpha;
	}

	/**
	 * NOTE: Equivalent of StretchMultiPartSpr() + DrawSprite() for 3 parts:
	 *		 Take a sprite of source transform, split it into 3 parts and stretch those parts by varying amounts without gaps as if they were one
	 */
	DrawSpriteStretched3(ctx: Context2D, spr: SprID, transform: SprTransform, colorTint: number, scales: readonly [number, number, number]): void
	{
		if (!this.FinishedLoading || spr >= SprID.Count)
			return;
		let tex = this.PerSprTexture[spr];
		if (tex === null)
			return;

		const rasterScale = this.PerGroupRasterScale[GetSprGroup(spr)];
		const pictureSize = this.PerSprSvg[spr].PictureSize;
		const scaledPictureW = pictureSize.x * rasterScale, scaledPictureH = pictureSize.y * rasterScale;

		const totalScale = scales[0] + scales[1] + scales[2];
		const scaleX = transform.Scale.x * (totalScale / 3.0);
		const sizeX = scaleX * pictureSize.x, sizeY = transform.Scale.y * pictureSize.y;
		const tlX = transform.Position.x - transform.Pivot.x * sizeX, tlY = transform.Position.y - transform.Pivot.y * sizeY;

		const splitLT = scales[0] / totalScale;
		const splitRT = 1.0 - (scales[2] / totalScale);
		const xL = tlX + sizeX * splitLT, xR = tlX + sizeX * splitRT;

		const rgb = (colorTint & 0x00FFFFFF) >>> 0;
		if (rgb !== 0x00FFFFFF)
			tex = this.GetTintedTexture(spr, tex, rgb);

		const alpha = ((colorTint >>> 24) & 0xFF) / 255.0;
		if (alpha <= 0.0)
			return;
		const prevAlpha = ctx.globalAlpha;
		if (alpha < 1.0) ctx.globalAlpha = prevAlpha * alpha;

		const P = PerSideRasterizedTexPadding;
		const partW = scaledPictureW / 3.0;
		const dstW0 = xL - tlX, dstW1 = xR - xL, dstW2 = (tlX + sizeX) - xR;
		if (dstW0 > 0) ctx.drawImage(tex, P, P, partW, scaledPictureH, tlX, tlY, dstW0, sizeY);
		if (dstW1 > 0) ctx.drawImage(tex, P + partW, P, partW, scaledPictureH, xL, tlY, dstW1, sizeY);
		if (dstW2 > 0) ctx.drawImage(tex, P + partW * 2.0, P, partW, scaledPictureH, xR, tlY, dstW2, sizeY);

		if (alpha < 1.0) ctx.globalAlpha = prevAlpha;
	}
}

export type { Canvas2D };
