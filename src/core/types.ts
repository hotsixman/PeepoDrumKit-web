// Port of PeepoDrumKit "core_types.h" / "core_types.cpp"
// https://github.com/samyuu/PeepoDrumKit
//
// NOTE: Primitive types are mapped as follows:
//		 i32 / i16 -> number (always truncated using Math.trunc where integer semantics matter)
//		 f32 / f64 -> number
//		 Time      -> number (seconds, same as Time::Seconds)
//		 Beat      -> number (ticks, same as Beat::Ticks)

export type Time = number;

export const I32Max = 2147483647;
export const I32Min = -2147483648;
export const F32Max = 3.402823466e38;
export const F64Min = 2.2250738585072014e-308;

export enum ControlFlow { Break, Continue }

export interface vec2 { x: number; y: number; }
export const vec2 = (x: number, y: number = x): vec2 => ({ x, y });

export class Rect
{
	constructor(public TL: vec2 = vec2(0), public BR: vec2 = vec2(0)) {}

	static FromTLSize(tl: vec2, size: vec2): Rect { return new Rect(vec2(tl.x, tl.y), vec2(tl.x + size.x, tl.y + size.y)); }
	static FromCenterSize(center: vec2, size: vec2): Rect { const hx = size.x * 0.5, hy = size.y * 0.5; return new Rect(vec2(center.x - hx, center.y - hy), vec2(center.x + hx, center.y + hy)); }

	GetCenter(): vec2 { return vec2((this.TL.x + this.BR.x) * 0.5, (this.TL.y + this.BR.y) * 0.5); }
	GetSize(): vec2 { return vec2(this.BR.x - this.TL.x, this.BR.y - this.TL.y); }
	GetWidth(): number { return this.BR.x - this.TL.x; }
	GetHeight(): number { return this.BR.y - this.TL.y; }
	GetTL(): vec2 { return vec2(this.TL.x, this.TL.y); }
	GetTR(): vec2 { return vec2(this.BR.x, this.TL.y); }
	GetBL(): vec2 { return vec2(this.TL.x, this.BR.y); }
	GetBR(): vec2 { return vec2(this.BR.x, this.BR.y); }
	GetMin(): vec2 { return vec2(Math.min(this.TL.x, this.BR.x), Math.min(this.TL.y, this.BR.y)); }
	GetMax(): vec2 { return vec2(Math.max(this.TL.x, this.BR.x), Math.max(this.TL.y, this.BR.y)); }
	Contains(p: vec2): boolean { return (p.x >= this.TL.x) && (p.y >= this.TL.y) && (p.x < this.BR.x) && (p.y < this.BR.y); }
}

export function GetAspectRatio(width: number, height: number): number { return (height !== 0.0) ? (width / height) : 0.0; }
export function GetAspectRatioRect(r: Rect): number { return GetAspectRatio(r.GetWidth(), r.GetHeight()); }

export function FitInsideFixedAspectRatio(rectToFitInside: Rect, targetAspectRatio: number): Rect
{
	const out = new Rect(vec2(rectToFitInside.TL.x, rectToFitInside.TL.y), vec2(rectToFitInside.BR.x, rectToFitInside.BR.y));
	const rectSize = out.GetSize();
	const rectAspectRatio = (rectSize.x / rectSize.y);

	// NOTE: Taller than wide -> bars on top / bottom
	if (rectAspectRatio <= targetAspectRatio)
	{
		const presentHeight = Math.round(rectSize.x / targetAspectRatio);
		const barHeight = Math.round((rectSize.y - presentHeight) / 2.0);
		out.TL.y += barHeight;
		out.BR.y = out.TL.y + presentHeight;
	}
	else // NOTE: Wider than tall -> bars on left / right
	{
		const presentWidth = Math.floor(rectSize.y * targetAspectRatio);
		const barWidth = Math.floor((rectSize.x - presentWidth) / 2.0);
		out.TL.x += barWidth;
		out.BR.x = out.TL.x + presentWidth;
	}
	return out;
}

export const Clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);
export const ClampBot = (v: number, min: number): number => Math.max(v, min);
export const ClampTop = (v: number, max: number): number => Math.min(v, max);
export const Lerp = (start: number, end: number, t: number): number => start * (1.0 - t) + (end * t);
export const LerpClamped = (start: number, end: number, t: number): number => Lerp(start, end, Clamp(t, 0.0, 1.0));
export const ConvertRange = (oldStart: number, oldEnd: number, newStart: number, newEnd: number, value: number): number => (newStart + ((value - oldStart) * (newEnd - newStart) / (oldEnd - oldStart)));
export const ConvertRangeClampInput = (oldStart: number, oldEnd: number, newStart: number, newEnd: number, value: number): number => ConvertRange(oldStart, oldEnd, newStart, newEnd, Clamp(value, oldStart, oldEnd));
export const ConvertRangeClampOutput = (oldStart: number, oldEnd: number, newStart: number, newEnd: number, value: number): number => Clamp(ConvertRange(oldStart, oldEnd, newStart, newEnd, value), newStart, newEnd);
export const ApproxmiatelySame = (a: number, b: number, threshold: number = 0.0001): boolean => Math.abs(a - b) < threshold;
export const ToPercent = (value: number): number => (value * 100.0);
export const FromPercent = (percent: number): number => (percent * 0.01);
/** NOTE: C/C++ style rounding (half away from zero) as opposed to Math.round() which rounds half towards +Infinity */
export const Round = (v: number): number => (v < 0) ? -Math.round(-v) : Math.round(v);
/** NOTE: C/C++ style integer division (truncation towards zero) */
export const IDiv = (a: number, b: number): number => Math.trunc(a / b);

export function AnimateExponentialF32(current: number, target: number, animationSpeed: number, deltaTime: number): number
{
	// NOTE: If no time elapsed then no animation should take place
	if (deltaTime <= 0.0) return current;
	// NOTE: If the animation speed is "disabled" however it should always snap to its target immediately
	if (animationSpeed <= 0.0) return target;

	const targetIsLess = (target <= current);
	current += (target - current) * animationSpeed * deltaTime;

	// NOTE Prevent overshooting the target resulting in unstable 'jittering' for high speed values
	return targetIsLess ? ClampBot(current, target) : ClampTop(current, target);
}

// NOTE: Time helpers (Time::FromMS(), Time::ToString(), etc.)
export const TimeFromMS = (ms: number): Time => ms / 1000.0;
export const TimeToMS = (t: Time): number => t * 1000.0;
export const TimeFromFrames = (frames: number, fps: number = 60.0): Time => frames / fps;

export function TimeToString(seconds: Time): string
{
	const maxDisplayableTime = 3599.999999;
	const msRoundSeconds = (Math.abs(seconds) * 1000.0 + 0.5) * 0.001;
	if (!Number.isFinite(msRoundSeconds))
		return "--:--.---";

	const msRoundSecondsAbs = Math.min(msRoundSeconds, maxDisplayableTime);
	const min = Math.floor((msRoundSecondsAbs % 3600.0) / 60.0);
	const sec = msRoundSecondsAbs % 60.0;
	const ms = (sec - Math.floor(sec)) * 1000.0;

	const pad = (v: number, n: number) => String(Math.trunc(v)).padStart(n, "0");
	return `${(seconds < 0.0) ? "-" : ""}${pad(min, 2)}:${pad(sec, 2)}.${pad(ms, 3)}`;
}

export function TimeFromString(inBuffer: string): Time
{
	if (inBuffer.length === 0)
		return 0.0;

	let isNegative = false;
	if (inBuffer[0] === '-') { isNegative = true; inBuffer = inBuffer.substring(1); }
	else if (inBuffer[0] === '+') { inBuffer = inBuffer.substring(1); }

	const match = /^(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?/.exec(inBuffer);
	let min = 0, sec = 0, ms = 0;
	if (match)
	{
		min = parseInt(match[1] ?? "0", 10) || 0;
		sec = parseInt(match[2] ?? "0", 10) || 0;
		ms = parseInt(match[3] ?? "0", 10) || 0;
	}
	min = Clamp(min, 0, 59); sec = Clamp(sec, 0, 59); ms = Clamp(ms, 0, 999);

	const outSeconds = (min * 60.0) + sec + (ms * 0.001);
	return isNegative ? -outSeconds : outSeconds;
}

export interface DateYMD { Year: number; Month: number; Day: number; }
export const DateZero = (): DateYMD => ({ Year: 0, Month: 0, Day: 0 });
export function DateToString(d: DateYMD, separator: string = '/'): string
{
	const p = (v: number, n: number) => String(v).padStart(n, "0");
	return `${p(Clamp(d.Year, 0, 9999), 4)}${separator}${p(Clamp(d.Month, 0, 12), 2)}${separator}${p(Clamp(d.Day, 0, 31), 2)}`;
}
export function DateFromString(s: string, separator: string = '/'): DateYMD
{
	const parts = s.split(separator);
	const n = (i: number) => parseInt(parts[i] ?? "0", 10) || 0;
	return { Year: Clamp(n(0), 0, 9999), Month: Clamp(n(1), 0, 12), Day: Clamp(n(2), 0, 31) };
}
export function DateGetToday(): DateYMD { const d = new Date(); return { Year: d.getFullYear(), Month: d.getMonth() + 1, Day: d.getDate() }; }
export const DateEquals = (a: DateYMD, b: DateYMD) => a.Year === b.Year && a.Month === b.Month && a.Day === b.Day;

// NOTE: Equivalent of CPUStopwatch using the high resolution performance timer
export class CPUStopwatch
{
	IsRunning = false;
	StartTime = 0.0;

	static StartNew(): CPUStopwatch { const out = new CPUStopwatch(); out.Start(); return out; }
	Start(): void { if (!this.IsRunning) { this.StartTime = performance.now(); this.IsRunning = true; } }
	Restart(): Time { const elapsed = this.Stop(); this.Start(); return elapsed; }
	Stop(): Time { const elapsed = this.GetElapsed(); this.IsRunning = false; this.StartTime = 0.0; return elapsed; }
	GetElapsed(): Time { return this.IsRunning ? (performance.now() - this.StartTime) / 1000.0 : 0.0; }
}

export const CPUTimeNow = (): Time => performance.now() / 1000.0;

export interface BezierKeyFrame2D { Time: number; Value: vec2; HandleL: vec2; HandleR: vec2; }
export const BezierKeyFrame2DLinear = (time: number, value: vec2): BezierKeyFrame2D => ({ Time: time, Value: value, HandleL: value, HandleR: value });

export function SampleBezierFCurve2D(keys: readonly BezierKeyFrame2D[], time: number): vec2
{
	if (keys.length === 0) return vec2(0.0);
	if (keys.length === 1) return keys[0].Value;

	const first = keys[0], last = keys[keys.length - 1];
	if (time <= first.Time) return first.Value;
	if (time >= last.Time) return last.Value;

	let keyL = keys[0], keyR = keys[0];
	for (let i = 1; i < keys.length; i++)
	{
		keyR = keys[i];
		if (keyR.Time >= time)
			break;
		keyL = keyR;
	}

	const t = (time - keyL.Time) / ClampBot((keyR.Time - keyL.Time), 0.00001);
	const invT = (1.0 - t);
	const a = keyL.Value, b = keyL.HandleR, c = keyR.HandleL, d = keyR.Value;
	const w0 = invT * invT * invT, w1 = 3.0 * invT * invT * t, w2 = 3.0 * invT * t * t, w3 = t * t * t;
	return vec2(a.x * w0 + b.x * w1 + c.x * w2 + d.x * w3, a.y * w0 + b.y * w1 + c.y * w2 + d.y * w3);
}

/** NOTE: Minimal printf("%g") equivalent (6 significant digits, trailing zeros removed) */
export function FormatG(v: number): string
{
	if (!Number.isFinite(v)) return String(v);
	if (v === 0) return "0";
	const exponent = Math.floor(Math.log10(Math.abs(v)));
	if (exponent < -4 || exponent >= 6)
	{
		let [mantissa, exp] = v.toExponential(5).split("e");
		if (mantissa.includes(".")) mantissa = mantissa.replace(/0+$/, "").replace(/\.$/, "");
		const expNum = parseInt(exp, 10);
		return `${mantissa}e${expNum < 0 ? "-" : "+"}${String(Math.abs(expNum)).padStart(2, "0")}`;
	}
	let s = v.toFixed(Math.max(0, 5 - exponent));
	if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
	return (s === "-0") ? "0" : s;
}

/** NOTE: printf("%.Nf") equivalent */
export const FormatF = (v: number, decimals: number): string => v.toFixed(decimals);
