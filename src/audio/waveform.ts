// Port of PeepoDrumKit "audio/audio_waveform.h"
// https://github.com/samyuu/PeepoDrumKit
import { type Time } from "../core/types";

const I16Max = 32767;

const AverageTwoI16SamplesTogether = (a: number, b: number): number => Math.trunc((a + b) / 2);

export interface WaveformMip
{
	PowerOfTwoSampleCount: number;
	TimePerSample: Time;
	SamplesPerSecond: number;
	AbsoluteSamples: Int16Array;
}

const MakeEmptyMip = (): WaveformMip => ({ PowerOfTwoSampleCount: 0, TimePerSample: 0.0, SamplesPerSecond: 0.0, AbsoluteSamples: new Int16Array(0) });

function SampleAtIndexOrZero(mip: WaveformMip, sampleIndex: number): number
{
	return (sampleIndex < mip.AbsoluteSamples.length) ? mip.AbsoluteSamples[sampleIndex] : 0;
}

function LinearSampleAtTimeOrZero(mip: WaveformMip, time: Time): number
{
	const sampleIndexF32 = time * mip.SamplesPerSecond;
	const sampleIndexFraction = sampleIndexF32 - Math.trunc(sampleIndexF32);

	const sampleIndexLo = (sampleIndexF32 <= 0.0) ? 0 : Math.trunc(sampleIndexF32);
	const sampleIndexHi = (sampleIndexLo + 1);

	const normalizedSampleLo = SampleAtIndexOrZero(mip, sampleIndexLo) / I16Max;
	const normalizedSampleHi = SampleAtIndexOrZero(mip, sampleIndexHi) / I16Max;
	const normalizedSample = normalizedSampleLo * (1.0 - sampleIndexFraction) + normalizedSampleHi * sampleIndexFraction;

	return Math.trunc(normalizedSample * I16Max);
}

function AverageNormalizedSampleInTimeRange(mip: WaveformMip, startTime: Time, endTime: Time): number
{
	if (mip.TimePerSample <= 0.0) return 0.0;

	let sampleSum = 0, sampleCount = 0;
	for (let timeIt = startTime; timeIt < endTime; timeIt += mip.TimePerSample) { sampleSum += LinearSampleAtTimeOrZero(mip, timeIt); sampleCount++; }

	const sampleAverage = Math.trunc(sampleSum / Math.max(sampleCount, 1));
	return sampleAverage / I16Max;
}

export class WaveformMipChain
{
	static readonly MaxMipLevels = 24;
	static readonly MinMipSampleCount = 256;

	AllMips: WaveformMip[] = Array.from({ length: WaveformMipChain.MaxMipLevels }, MakeEmptyMip);
	Duration: Time = 0.0;

	IsEmpty(): boolean { return this.AllMips[0].PowerOfTwoSampleCount === 0; }

	FindClosestMip(timePerPixel: Time): WaveformMip
	{
		// NOTE: Uses the actual absolute distance (the original compares a signed difference due to a misplaced parenthesis)
		let closestMip = this.AllMips[0];
		for (let i = 1; i < WaveformMipChain.MaxMipLevels; i++)
		{
			const mip = this.AllMips[i];
			if (mip.PowerOfTwoSampleCount === 0)
				break;
			if (Math.abs(mip.TimePerSample - timePerPixel) < Math.abs(closestMip.TimePerSample - timePerPixel))
				closestMip = mip;
		}
		return closestMip;
	}

	GetAmplitudeAt(mip: WaveformMip, time: Time, timePerPixel: Time): number
	{
		return AverageNormalizedSampleInTimeRange(mip, time, time + timePerPixel);
	}

	static FromTransferable(data: TransferableMipChain): WaveformMipChain
	{
		const out = new WaveformMipChain();
		out.Duration = data.Duration;
		for (let i = 0; i < data.Mips.length && i < WaveformMipChain.MaxMipLevels; i++)
			out.AllMips[i] = data.Mips[i];
		return out;
	}
}

export interface TransferableMipChain { Duration: Time; Mips: WaveformMip[]; }

const RoundUpToPowerOfTwo = (v: number): number => { v = (v - 1) >>> 0; v |= v >> 1; v |= v >> 2; v |= v >> 4; v |= v >> 8; v |= v >> 16; return (v + 1) >>> 0; };

/** NOTE: Equivalent of WaveformMipChain::GenerateEntireMipChainFromSampleBuffer() for a single (non-interleaved) channel */
export function GenerateEntireMipChainFromChannel(channelSamples: Float32Array, sampleRate: number): TransferableMipChain
{
	const frameCount = channelSamples.length;
	const mips: WaveformMip[] = [];
	const toI16 = (v: number) => Math.min(I16Max, Math.abs(Math.trunc(v * I16Max)));

	// NOTE: No need to waste memory storing the full size mip if it won't even get sampled AND is already duplicated inside the source buffer
	const baseMip = MakeEmptyMip();
	baseMip.PowerOfTwoSampleCount = RoundUpToPowerOfTwo(frameCount) / 2;
	baseMip.TimePerSample = (1.0 / sampleRate) * 2.0;
	baseMip.SamplesPerSecond = sampleRate / 2.0;
	baseMip.AbsoluteSamples = new Int16Array(baseMip.PowerOfTwoSampleCount);
	{
		const samplesToFill = Math.min(baseMip.AbsoluteSamples.length, Math.trunc(frameCount / 2));
		const out = baseMip.AbsoluteSamples;
		for (let frameIndex = 0; frameIndex < samplesToFill; frameIndex++)
			out[frameIndex] = AverageTwoI16SamplesTogether(toI16(channelSamples[frameIndex * 2 + 0]), toI16(channelSamples[frameIndex * 2 + 1]));
	}
	mips.push(baseMip);

	for (let i = 1; i < WaveformMipChain.MaxMipLevels; i++)
	{
		const parentMip = mips[i - 1];
		if (parentMip.PowerOfTwoSampleCount <= WaveformMipChain.MinMipSampleCount)
			break;

		const newMip = MakeEmptyMip();
		newMip.PowerOfTwoSampleCount = (parentMip.PowerOfTwoSampleCount / 2);
		newMip.TimePerSample = (parentMip.TimePerSample * 2.0);
		newMip.SamplesPerSecond = (parentMip.SamplesPerSecond / 2.0);
		newMip.AbsoluteSamples = new Int16Array(newMip.PowerOfTwoSampleCount);

		const parentSamples = parentMip.AbsoluteSamples;
		const samplesToFill = Math.min(newMip.AbsoluteSamples.length, Math.trunc(parentSamples.length / 2));
		const out = newMip.AbsoluteSamples;
		for (let sampleIndex = 0, p = 0; sampleIndex < samplesToFill; sampleIndex++, p += 2)
			out[sampleIndex] = AverageTwoI16SamplesTogether(parentSamples[p], parentSamples[p + 1]);

		mips.push(newMip);
	}

	return { Duration: frameCount / sampleRate, Mips: mips };
}
