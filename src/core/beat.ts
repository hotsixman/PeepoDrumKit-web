// Port of PeepoDrumKit "core_beat.h" / "core_beat.cpp"
// https://github.com/samyuu/PeepoDrumKit
import { ControlFlow, ClampBot, Round, IDiv, type Time } from "./types";

// NOTE: Beat values are stored directly as integer ticks (Beat::Ticks)
export type Beat = number;

// NOTE: Meaning a 4/4 bar can be meaningfully subdivided into 192 parts, as is a common convention for rhythm games
export const TicksPerBeat = (192 / 4);

export const BeatZero = 0;
export const BeatFromTicks = (ticks: number): Beat => ticks;
export const BeatFromBeats = (beats: number): Beat => TicksPerBeat * beats;
export const BeatFromBars = (bars: number, beatsPerBar: number = 4): Beat => BeatFromBeats(bars * beatsPerBar);
export const BeatFromBeatsFraction = (fraction: number): Beat => Math.trunc(Round(fraction * TicksPerBeat));
export const BeatsFraction = (beat: Beat): number => beat / TicksPerBeat;
/** NOTE: Equivalent of the integer "Beat / i32" operator */
export const BeatDiv = (beat: Beat, divisor: number): Beat => IDiv(beat, divisor);

export const FloorBeatToGrid = (beat: Beat, grid: Beat): Beat => Math.trunc(Math.floor(beat / grid)) * grid;
export const RoundBeatToGrid = (beat: Beat, grid: Beat): Beat => Math.trunc(Round(beat / grid)) * grid;
export const CeilBeatToGrid = (beat: Beat, grid: Beat): Beat => Math.trunc(Math.ceil(beat / grid)) * grid;
export const GetGridBeatSnap = (gridBarDivision: number): Beat => IDiv(BeatFromBars(1), gridBarDivision);
export const IsTupletBarDivision = (gridBarDivision: number): boolean => (gridBarDivision % 3 === 0);

export interface Tempo { BPM: number; }
export const Tempo = (bpm: number = 0.0): Tempo => ({ BPM: bpm });
export const SafetyCheckTempo = (v: Tempo): Tempo => (v.BPM <= -1.0) ? Tempo(-v.BPM) : Tempo(ClampBot(v.BPM, 1.0));

export interface TimeSignature { Numerator: number; Denominator: number; }
export const TimeSignature = (numerator: number = 4, denominator: number = 4): TimeSignature => ({ Numerator: numerator, Denominator: denominator });
export const GetBeatsPerBar = (v: TimeSignature): number => v.Numerator;
export const GetDurationPerBeat = (v: TimeSignature): Beat => IDiv(BeatFromBars(1), v.Denominator);
export const GetDurationPerBar = (v: TimeSignature): Beat => GetDurationPerBeat(v) * GetBeatsPerBar(v);
export const TimeSignatureEquals = (a: TimeSignature, b: TimeSignature): boolean => (a.Numerator === b.Numerator) && (a.Denominator === b.Denominator);
export const IsTimeSignatureSupported = (v: TimeSignature): boolean => (v.Numerator > 0 && v.Denominator > 0) && (BeatFromBars(1) % v.Denominator) === 0;

// NOTE: Every beat sorted item type is required to store its beat as "BeatTime" (and optionally its duration as "BeatDuration")
//		 which is the TypeScript equivalent of the GetBeat() / GetBeatDuration() template accessor functions
export interface BeatItem { BeatTime: Beat; BeatDuration?: Beat; IsSelected: boolean; }
export const GetBeat = (v: BeatItem): Beat => v.BeatTime;
export const GetBeatDuration = (v: BeatItem): Beat => v.BeatDuration ?? 0;

export interface TempoChange extends BeatItem { Tempo: Tempo; }
export const TempoChange = (beat: Beat, tempo: Tempo): TempoChange => ({ BeatTime: beat, Tempo: { BPM: tempo.BPM }, IsSelected: false });
export const CloneTempoChange = (v: TempoChange): TempoChange => ({ BeatTime: v.BeatTime, Tempo: { BPM: v.Tempo.BPM }, IsSelected: v.IsSelected });

export interface TimeSignatureChange extends BeatItem { Signature: TimeSignature; }
export const TimeSignatureChange = (beat: Beat, signature: TimeSignature): TimeSignatureChange => ({ BeatTime: beat, Signature: { ...signature }, IsSelected: false });
export const CloneTimeSignatureChange = (v: TimeSignatureChange): TimeSignatureChange => ({ BeatTime: v.BeatTime, Signature: { ...v.Signature }, IsSelected: v.IsSelected });

export class BeatSortedForwardIterator<T extends BeatItem>
{
	LastIndex = 0;

	Next(sortedList: readonly T[], nextBeat: Beat): T | null
	{
		let nextIndex = -1;
		for (let i = this.LastIndex; i < sortedList.length; i++)
		{
			const beat = sortedList[i].BeatTime;
			if (beat <= nextBeat)
				nextIndex = i;
			else if (beat > nextBeat)
				break;
		}
		if (nextIndex >= 0)
			this.LastIndex = nextIndex;
		return (nextIndex >= 0) ? sortedList[nextIndex] : null;
	}
}

export class BeatSortedList<T extends BeatItem>
{
	Sorted: T[] = [];

	// NOTE: Required to emulate C++ value semantics of inserting copies of structs
	constructor(public readonly CloneFunc: (v: T) => T, initial: T[] = []) { this.Sorted = initial; }

	Clone(): BeatSortedList<T> { return new BeatSortedList<T>(this.CloneFunc, this.Sorted.map(this.CloneFunc)); }

	TryFindLastAtBeatIndex(beat: Beat): number
	{
		// TODO: Optimize using binary search
		const sorted = this.Sorted;
		if (sorted.length === 0)
			return -1;
		if (sorted.length === 1)
			return (sorted[0].BeatTime <= beat) ? 0 : -1;
		if (beat < sorted[0].BeatTime)
			return -1;
		for (let i = 0; i < sorted.length - 1; i++)
		{
			if (sorted[i].BeatTime <= beat && sorted[i + 1].BeatTime > beat)
				return i;
		}
		return sorted.length - 1;
	}

	TryFindExactAtBeatIndex(beat: Beat): number
	{
		const sorted = this.Sorted;
		for (let i = 0; i < sorted.length; i++)
			if (sorted[i].BeatTime === beat)
				return i;
		return -1;
	}

	// NOTE: Inclusive check to be used for long notes (which must have spacing after the tail piece) and single point intersection tests (such as with a cursor)
	TryFindOverlappingBeatIndex(beatStart: Beat, beatEnd: Beat, inclusiveBeatCheck: boolean = true): number
	{
		const sorted = this.Sorted;
		let found = -1;
		if (inclusiveBeatCheck)
		{
			for (let i = 0; i < sorted.length; i++)
			{
				const v = sorted[i], vEnd = v.BeatTime + (v.BeatDuration ?? 0);
				// NOTE: Only break after a large beat has been found to correctly handle long notes with other notes "inside"
				//		 (even if they should't be placable in the first place)
				if (v.BeatTime <= beatEnd && beatStart <= vEnd)
					found = i;
				else if (vEnd > beatEnd)
					break;
			}
		}
		else
		{
			for (let i = 0; i < sorted.length; i++)
			{
				const v = sorted[i], vEnd = v.BeatTime + (v.BeatDuration ?? 0);
				if (v.BeatTime < beatEnd && beatStart < vEnd)
					found = i;
				else if (vEnd > beatEnd)
					break;
			}
		}
		return found;
	}

	TryFindLastAtBeat(beat: Beat): T | null { const i = this.TryFindLastAtBeatIndex(beat); return (i >= 0) ? this.Sorted[i] : null; }
	TryFindExactAtBeat(beat: Beat): T | null { const i = this.TryFindExactAtBeatIndex(beat); return (i >= 0) ? this.Sorted[i] : null; }
	TryFindOverlappingBeat(beatStart: Beat, beatEnd: Beat, inclusiveBeatCheck: boolean = true): T | null { const i = this.TryFindOverlappingBeatIndex(beatStart, beatEnd, inclusiveBeatCheck); return (i >= 0) ? this.Sorted[i] : null; }

	InsertOrUpdate(valueToInsertOrUpdate: T): void
	{
		const value = this.CloneFunc(valueToInsertOrUpdate);
		const insertionIndex = LinearlySearchForInsertionIndex(this, value.BeatTime);
		if (insertionIndex < this.Sorted.length)
		{
			if (this.Sorted[insertionIndex].BeatTime === value.BeatTime)
				this.Sorted[insertionIndex] = value;
			else
				this.Sorted.splice(insertionIndex, 0, value);
		}
		else
		{
			this.Sorted.push(value);
		}
	}

	RemoveAtBeat(beatToFindAndRemove: Beat): void
	{
		const index = this.TryFindExactAtBeatIndex(beatToFindAndRemove);
		if (index >= 0)
			this.RemoveAtIndex(index);
	}

	RemoveAtIndex(indexToRemove: number): void
	{
		if (indexToRemove >= 0 && indexToRemove < this.Sorted.length)
			this.Sorted.splice(indexToRemove, 1);
	}

	get length(): number { return this.Sorted.length; }
	size(): number { return this.Sorted.length; }
	empty(): boolean { return this.Sorted.length === 0; }
	At(index: number): T { return this.Sorted[index]; }
	[Symbol.iterator](): Iterator<T> { return this.Sorted[Symbol.iterator](); }
}

export function LinearlySearchForInsertionIndex<T extends BeatItem>(sortedList: BeatSortedList<T>, beat: Beat): number
{
	// NOTE: Binary search returning the same result as the original linear search (first index with "beat <= item.BeatTime")
	const sorted = sortedList.Sorted;
	let lo = 0, hi = sorted.length;
	while (lo < hi)
	{
		const mid = (lo + hi) >>> 1;
		if (sorted[mid].BeatTime < beat) lo = mid + 1; else hi = mid;
	}
	return lo;
}

export class TempoMapAccelerationStructure
{
	// NOTE: Pre calculated beat times up to the last tempo change
	BeatTickToTimes: Float64Array = new Float64Array(0);
	FirstTempoBPM = 0.0;
	LastTempoBPM = 0.0;

	ConvertBeatToTimeUsingLookupTableIndexing(beat: Beat): Time
	{
		const beatTickToTimesCount = this.BeatTickToTimes.length;
		const totalBeatTicks = beat;

		if (totalBeatTicks < 0) // NOTE: Negative tick (tempo changes are assumed to only be positive)
		{
			// NOTE: Calculate the duration of a Beat at the first tempo
			const firstTickDuration = ((60.0 / this.FirstTempoBPM) / TicksPerBeat);

			// NOTE: Then scale by the negative tick
			return firstTickDuration * totalBeatTicks;
		}
		else if (totalBeatTicks >= beatTickToTimesCount) // NOTE: Tick is outside the defined tempo map
		{
			// NOTE: Take the last calculated time
			const lastTime = this.GetLastCalculatedTime();

			// NOTE: Calculate the duration of a Beat at the last used tempo
			const lastTickDuration = ((60.0 / this.LastTempoBPM) / TicksPerBeat);

			// NOTE: Then scale by the remaining ticks
			const remainingTicks = (totalBeatTicks - beatTickToTimesCount) + 1;
			return lastTime + (lastTickDuration * remainingTicks);
		}
		else // NOTE: Use the pre calculated lookup table directly
		{
			return this.BeatTickToTimes[totalBeatTicks];
		}
	}

	ConvertTimeToBeatUsingLookupTableBinarySearch(time: Time): Beat
	{
		const beatTickToTimesCount = this.BeatTickToTimes.length;
		const lastTime = this.GetLastCalculatedTime();

		if (time < 0.0) // NOTE: Negative time
		{
			// NOTE: Calculate the duration of a Beat at the first tempo
			const firstTickDuration = ((60.0 / this.FirstTempoBPM) / TicksPerBeat);

			// NOTE: Then the time by the negative tick, this is assuming all tempo changes happen on positive ticks
			return Math.trunc(time / firstTickDuration);
		}
		else if (time >= lastTime) // NOTE: Tick is outside the defined tempo map
		{
			const timePastLast = (time - lastTime);

			// NOTE: Each tick past the end has a duration of this value
			const lastTickDuration = ((60.0 / this.LastTempoBPM) / TicksPerBeat);

			// NOTE: So we just have to divide the remaining ticks by the duration
			const ticks = (timePastLast / lastTickDuration);

			// NOTE: And add it to the last tick
			return Math.trunc(beatTickToTimesCount + ticks - 1);
		}
		else // NOTE: Perform a binary search
		{
			const times = this.BeatTickToTimes;
			let left = 0, right = beatTickToTimesCount - 1;

			while (left <= right)
			{
				const mid = (left + right) >> 1;

				if (time < times[mid])
					right = mid - 1;
				else if (time > times[mid])
					left = mid + 1;
				else
					return mid;
			}

			return ((times[left] - time) < (time - times[right])) ? left : right;
		}
	}

	GetLastCalculatedTime(): Time
	{
		return (this.BeatTickToTimes.length === 0) ? 0.0 : this.BeatTickToTimes[this.BeatTickToTimes.length - 1];
	}

	Rebuild(inTempoChanges: readonly TempoChange[]): void
	{
		let tempoChanges: readonly TempoChange[] = inTempoChanges;

		// HACK: Handle this special case here by creating an adjusted copy instead of changing the algorithm itself to not risk accidentally messing anything up
		if (inTempoChanges.length < 1 || inTempoChanges[0].BeatTime > 0)
			tempoChanges = [TempoChange(0, FallbackTempo), ...inTempoChanges];

		const tempoCount = tempoChanges.length;
		const timesLength = (tempoCount > 0) ? tempoChanges[tempoCount - 1].BeatTime + 1 : 0;
		if (this.BeatTickToTimes.length !== timesLength)
			this.BeatTickToTimes = new Float64Array(timesLength);
		const times = this.BeatTickToTimes;

		let lastEndTime = 0.0;
		for (let tempoChangeIndex = 0; tempoChangeIndex < tempoCount; tempoChangeIndex++)
		{
			const tempoChange = tempoChanges[tempoChangeIndex];

			const bpm = SafetyCheckTempo(tempoChange.Tempo).BPM;
			const beatDuration = (60.0 / bpm);
			const tickDuration = (beatDuration / TicksPerBeat);

			const isSingleOrLastTempo = (tempoCount === 1) || (tempoChangeIndex === (tempoCount - 1));
			const timesCount = isSingleOrLastTempo ? times.length : (tempoChanges[tempoChangeIndex + 1].BeatTime);

			for (let i = 0, t = tempoChange.BeatTime; t < timesCount; t++)
				times[t] = (tickDuration * i++) + lastEndTime;

			if (tempoCount > 1)
				lastEndTime = times[timesCount - 1] + tickDuration;

			this.FirstTempoBPM = (tempoChangeIndex === 0) ? bpm : this.FirstTempoBPM;
			this.LastTempoBPM = bpm;
		}
	}
}

// NOTE: Used when no other tempo / time signature change is defined (empty list or pre-first beat)
export const FallbackTempo: Tempo = Object.freeze(Tempo(120.0)) as Tempo;
export const FallbackTimeSignature: TimeSignature = Object.freeze(TimeSignature(4, 4)) as TimeSignature;

export type SortedTempoChangesList = BeatSortedList<TempoChange>;
export type SortedSignatureChangesList = BeatSortedList<TimeSignatureChange>;

export interface ForEachBeatBarData { Signature: TimeSignature; Beat: Beat; BarIndex: number; IsBar: boolean; }

export class SortedTempoMap
{
	// NOTE: These must always remain sorted and only have changes with (Beat.Ticks >= 0)
	Tempo = new BeatSortedList<TempoChange>(CloneTempoChange);
	Signature = new BeatSortedList<TimeSignatureChange>(CloneTimeSignatureChange);
	AccelerationStructure = new TempoMapAccelerationStructure();

	constructor() { this.RebuildAccelerationStructure(); }

	// NOTE: Must manually be called every time a TempoChange has been edited otherwise Beat <-> Time conversions will be incorrect
	RebuildAccelerationStructure(): void { this.AccelerationStructure.Rebuild(this.Tempo.Sorted); }
	BeatToTime(beat: Beat): Time { return this.AccelerationStructure.ConvertBeatToTimeUsingLookupTableIndexing(beat); }
	TimeToBeat(time: Time): Beat { return this.AccelerationStructure.ConvertTimeToBeatUsingLookupTableBinarySearch(time); }

	ForEachBeatBar(perBeatBarFunc: (it: ForEachBeatBarData) => ControlFlow): void
	{
		const signatureChangeIt = new BeatSortedForwardIterator<TimeSignatureChange>();
		let beatIt = 0;

		for (let barIndex = 0; /*barIndex < MAX_BAR_COUNT*/; barIndex++)
		{
			const thisChange = signatureChangeIt.Next(this.Signature.Sorted, beatIt);
			const thisSignature = TimeSignature(
				ClampBot((thisChange === null) ? FallbackTimeSignature.Numerator : thisChange.Signature.Numerator, 1),
				ClampBot((thisChange === null) ? FallbackTimeSignature.Denominator : thisChange.Signature.Denominator, 1));

			const beatsPerBar = GetBeatsPerBar(thisSignature);
			const durationPerBeat = GetDurationPerBeat(thisSignature);

			if (perBeatBarFunc({ Signature: thisSignature, Beat: beatIt, BarIndex: barIndex, IsBar: true }) === ControlFlow.Break)
				return;
			beatIt += durationPerBeat;

			for (let beatIndexWithinBar = 1; beatIndexWithinBar < beatsPerBar; beatIndexWithinBar++)
			{
				if (perBeatBarFunc({ Signature: thisSignature, Beat: beatIt, BarIndex: barIndex, IsBar: false }) === ControlFlow.Break)
					return;
				beatIt += durationPerBeat;
			}

			// NOTE: Safety guard against an infinite loop for zero length bars (which the original would also never break out of)
			if (durationPerBeat <= 0)
				return;
		}
	}

	Clone(): SortedTempoMap
	{
		const out = new SortedTempoMap();
		out.Tempo = this.Tempo.Clone();
		out.Signature = this.Signature.Clone();
		out.RebuildAccelerationStructure();
		return out;
	}
}
