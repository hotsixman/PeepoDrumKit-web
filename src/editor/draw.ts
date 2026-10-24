// NOTE: Thin Canvas2D wrapper mimicking the subset of the Dear ImGui ImDrawList API used by PeepoDrumKit (https://github.com/samyuu/PeepoDrumKit)
import { type vec2 } from "../core/types";
import { U32ToCSS } from "./theme";

export const FontFamily = `"Noto Sans JP", "Noto Sans KR", "Noto Sans", "Segoe UI", system-ui, sans-serif`;

// NOTE: Base font sizes of the original (FontMain_JP, FontMedium_EN, FontLarge_EN)
export const FontBaseSizeMain = 16, FontBaseSizeMedium = 18, FontBaseSizeLarge = 22;

export class DrawList
{
	Ctx!: CanvasRenderingContext2D;
	private fontSize = 16;
	private font = "";
	private textWidthCache = new Map<string, number>();
	private clipDepth = 0;

	Begin(ctx: CanvasRenderingContext2D): void
	{
		this.Ctx = ctx;
		this.font = "";
		this.SetFont(this.fontSize);
		ctx.textBaseline = "top";
		ctx.textAlign = "left";
		this.clipDepth = 0;
	}

	SetFont(size: number, weight: string = "400"): void
	{
		const font = `${weight} ${size.toFixed(2)}px ${FontFamily}`;
		this.fontSize = size;
		if (font !== this.font)
		{
			this.font = font;
			this.Ctx.font = font;
		}
	}

	GetFontSize(): number { return this.fontSize; }

	CalcTextWidth(text: string): number
	{
		const key = this.font + "\u0000" + text;
		let width = this.textWidthCache.get(key);
		if (width === undefined)
		{
			width = this.Ctx.measureText(text).width;
			if (this.textWidthCache.size > 4096) this.textWidthCache.clear();
			this.textWidthCache.set(key, width);
		}
		return width;
	}

	PushClipRect(tl: vec2, br: vec2): void
	{
		const ctx = this.Ctx;
		ctx.save();
		ctx.beginPath();
		ctx.rect(tl.x, tl.y, Math.max(0, br.x - tl.x), Math.max(0, br.y - tl.y));
		ctx.clip();
		this.clipDepth++;
	}

	PopClipRect(): void
	{
		if (this.clipDepth <= 0) return;
		this.Ctx.restore();
		this.clipDepth--;
		// NOTE: Restore() also resets the font
		this.Ctx.font = this.font;
	}

	AddLine(p1: vec2, p2: vec2, color: number, thickness: number = 1.0): void
	{
		if ((color >>> 24) === 0) return;
		const ctx = this.Ctx;
		ctx.fillStyle = U32ToCSS(color);
		if (p1.x === p2.x)
		{
			const x = Math.floor(p1.x - thickness * 0.5 + 0.5);
			ctx.fillRect(x, Math.min(p1.y, p2.y), thickness, Math.abs(p2.y - p1.y));
		}
		else if (p1.y === p2.y)
		{
			const y = Math.floor(p1.y - thickness * 0.5 + 0.5);
			ctx.fillRect(Math.min(p1.x, p2.x), y, Math.abs(p2.x - p1.x), thickness);
		}
		else
		{
			ctx.strokeStyle = U32ToCSS(color);
			ctx.lineWidth = thickness;
			ctx.beginPath();
			ctx.moveTo(p1.x + 0.5, p1.y + 0.5);
			ctx.lineTo(p2.x + 0.5, p2.y + 0.5);
			ctx.stroke();
		}
	}

	AddRectFilled(tl: vec2, br: vec2, color: number): void
	{
		if ((color >>> 24) === 0) return;
		this.Ctx.fillStyle = U32ToCSS(color);
		this.Ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
	}

	AddRect(tl: vec2, br: vec2, color: number, thickness: number = 1.0): void
	{
		if ((color >>> 24) === 0) return;
		const ctx = this.Ctx;
		ctx.strokeStyle = U32ToCSS(color);
		ctx.lineWidth = thickness;
		const x0 = Math.min(tl.x, br.x), y0 = Math.min(tl.y, br.y), x1 = Math.max(tl.x, br.x), y1 = Math.max(tl.y, br.y);
		ctx.strokeRect(x0 + 0.5, y0 + 0.5, Math.max(0, x1 - x0 - 1), Math.max(0, y1 - y0 - 1));
	}

	AddTriangleFilled(a: vec2, b: vec2, c: vec2, color: number): void
	{
		if ((color >>> 24) === 0) return;
		const ctx = this.Ctx;
		ctx.fillStyle = U32ToCSS(color);
		ctx.beginPath();
		ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
		ctx.closePath();
		ctx.fill();
	}

	AddTriangle(a: vec2, b: vec2, c: vec2, color: number, thickness: number = 1.0): void
	{
		if ((color >>> 24) === 0) return;
		const ctx = this.Ctx;
		ctx.strokeStyle = U32ToCSS(color);
		ctx.lineWidth = thickness;
		ctx.beginPath();
		ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
		ctx.closePath();
		ctx.stroke();
	}

	AddCircleFilled(center: vec2, radius: number, color: number): void
	{
		if ((color >>> 24) === 0 || radius <= 0) return;
		const ctx = this.Ctx;
		ctx.fillStyle = U32ToCSS(color);
		ctx.beginPath();
		ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
		ctx.fill();
	}

	AddCircle(center: vec2, radius: number, color: number, thickness: number = 1.0): void
	{
		if ((color >>> 24) === 0 || radius <= 0) return;
		const ctx = this.Ctx;
		ctx.strokeStyle = U32ToCSS(color);
		ctx.lineWidth = thickness;
		ctx.beginPath();
		ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
		ctx.stroke();
	}

	AddText(pos: vec2, color: number, text: string): void
	{
		if ((color >>> 24) === 0 || text.length === 0) return;
		this.Ctx.fillStyle = U32ToCSS(color);
		this.Ctx.fillText(text, pos.x, pos.y);
	}

	AddTextWithDropShadow(pos: vec2, color: number, text: string, shadowColor: number = 0xFF000000, shadowOffset: vec2 = { x: 1, y: 1 }): void
	{
		if (text.length === 0) return;
		this.AddText({ x: pos.x + shadowOffset.x, y: pos.y + shadowOffset.y }, shadowColor, text);
		this.AddText(pos, color, text);
	}
}
