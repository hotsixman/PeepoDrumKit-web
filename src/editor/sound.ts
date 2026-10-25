// Port of PeepoDrumKit "peepo_drum_kit/chart_editor_sound.h" / "chart_editor_sound.cpp"
// https://github.com/samyuu/PeepoDrumKit
//
// NOTE: The original loads "assets/audio/*.wav" files which are not part of the public repository.
//		 The don / ka hit sounds are loaded from "public/assets/audio/{don,ka}.wav" instead (taken from https://github.com/hotsixman/tja-tools,
//		 previewer/src/assets, level matched to the same perceived loudness), the metronome is synthesized procedurally.
//		 Until the files are decoded (or should loading fail) synthesized fallback sounds are used. Everything can optionally be replaced by user provided files
import { CPUStopwatch, type Time, TimeFromFrames } from "../core/types";
import { Engine } from "../audio/engine";

export enum SoundEffectType { TaikoDon, TaikoKa, MetronomeBar, MetronomeBeat, Count }

function SynthesizeSoundEffect(ctx: BaseAudioContext, type: SoundEffectType): AudioBuffer
{
	const sampleRate = ctx.sampleRate;
	const duration = (type === SoundEffectType.TaikoDon) ? 0.35 : (type === SoundEffectType.TaikoKa) ? 0.22 : 0.06;
	const frameCount = Math.ceil(duration * sampleRate);
	const buffer = ctx.createBuffer(1, frameCount, sampleRate);
	const out = buffer.getChannelData(0);

	// NOTE: Simple deterministic noise source
	let seed = 0x12345678;
	const noise = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 0xFFFFFFFF) * 2.0 - 1.0; };

	if (type === SoundEffectType.TaikoDon)
	{
		// NOTE: Low drum membrane with a quick downward pitch bend and a short attack transient
		let phase = 0.0, lowpass = 0.0;
		for (let i = 0; i < frameCount; i++)
		{
			const t = i / sampleRate;
			const freq = 92.0 + 120.0 * Math.exp(-t * 38.0);
			phase += (2.0 * Math.PI * freq) / sampleRate;
			const body = Math.sin(phase) * Math.exp(-t * 11.0);
			const overtone = Math.sin(phase * 2.03) * 0.25 * Math.exp(-t * 26.0);
			lowpass += (noise() - lowpass) * 0.18;
			const attack = lowpass * 1.6 * Math.exp(-t * 90.0);
			out[i] = (body + overtone + attack) * 0.9;
		}
	}
	else if (type === SoundEffectType.TaikoKa)
	{
		// NOTE: High pitched drum (small tight membrane) with a slight downward pitch bend, an inharmonic membrane mode and a short stick attack
		let phase = 0.0, hp = 0.0, last = 0.0;
		for (let i = 0; i < frameCount; i++)
		{
			const t = i / sampleRate;
			const freq = 440.0 + 260.0 * Math.exp(-t * 45.0);
			phase += (2.0 * Math.PI * freq) / sampleRate;
			const body = Math.sin(phase) * Math.exp(-t * 18.0);
			const overtone = Math.sin(phase * 1.59) * 0.35 * Math.exp(-t * 32.0);
			const n = noise();
			hp = 0.8 * (hp + n - last); last = n;
			const attack = hp * 0.9 * Math.exp(-t * 160.0);
			out[i] = (body + overtone + attack) * 0.8;
		}
	}
	else
	{
		const freq = (type === SoundEffectType.MetronomeBar) ? 1760.0 : 1320.0;
		for (let i = 0; i < frameCount; i++)
		{
			const t = i / sampleRate;
			const envelope = Math.min(1.0, t * 2000.0) * Math.exp(-t * 60.0);
			out[i] = Math.sin(2.0 * Math.PI * freq * t) * envelope * 0.6;
		}
	}

	// NOTE: The default don / ka sounds are amplified and soft saturated instead of hard clipped to avoid harsh distortion on the loudest peaks,
	//		 then scaled back down to the final output level
	if (type === SoundEffectType.TaikoDon || type === SoundEffectType.TaikoKa)
	{
		const HitSoundGain = 2.0, HitSoundOutputLevel = 0.7;
		for (let i = 0; i < frameCount; i++)
			out[i] = Math.tanh(out[i] * HitSoundGain) * HitSoundOutputLevel;
	}
	return buffer;
}

interface ActiveVoice { Source: AudioBufferSourceNode; Gain: GainNode; StartContextTime: Time; }

export class SoundEffectsVoicePool
{
	BaseVolumeMaster = 1.0;
	BaseVolumeSfx = 1.0;
	BaseVolumeMetronome = 1.0;
	// NOTE: Web port addition, editor only volume for the don / ka preview sounds (independent from the chart SEVOL stored in the TJA)
	BaseVolumeHitPreview = 1.0;
	static readonly VoicePoolSize = 32;
	VoicePoolRingIndex = 0;
	VoicePool: (ActiveVoice | null)[] = new Array(SoundEffectsVoicePool.VoicePoolSize).fill(null);
	LastPlayedVoiceStopwatch = new CPUStopwatch();

	LoadedSources: (AudioBuffer | null)[] = new Array(SoundEffectType.Count).fill(null);
	private customSources: (AudioBuffer | null)[] = new Array(SoundEffectType.Count).fill(null);

	// NOTE: Encoded hit sound files, fetched right away and decoded once the audio context exists (which requires a user gesture)
	private static readonly SoundEffectFilePaths: Partial<Record<SoundEffectType, string>> = {
		[SoundEffectType.TaikoDon]: `${import.meta.env.BASE_URL}assets/audio/don.wav`,
		[SoundEffectType.TaikoKa]: `${import.meta.env.BASE_URL}assets/audio/ka.wav`,
	};
	private fileBytes: (Promise<ArrayBuffer | null> | null)[] = new Array(SoundEffectType.Count).fill(null);
	private startedDecoding = false;

	StartAsyncLoadingAndAddVoices(): void
	{
		for (const [type, path] of Object.entries(SoundEffectsVoicePool.SoundEffectFilePaths))
		{
			this.fileBytes[Number(type)] = fetch(path)
				.then((response) => response.ok ? response.arrayBuffer() : null)
				.catch((e) => { console.warn(`Failed to load sound effect '${path}'`, e); return null; });
		}
	}

	UpdateAsyncLoading(): void
	{
		const ctx = Engine.Context;
		if (ctx === null)
			return;

		// NOTE: Synthesized sources are available immediately and act as a fallback until (or if) the files are decoded
		if (this.LoadedSources[0] === null)
			for (let i = 0; i < SoundEffectType.Count; i++)
				this.LoadedSources[i] = SynthesizeSoundEffect(ctx, i);

		if (!this.startedDecoding)
		{
			this.startedDecoding = true;
			this.fileBytes.forEach((bytesPromise, type) =>
			{
				if (bytesPromise === null) return;
				void bytesPromise.then(async (bytes) =>
				{
					if (bytes === null) return;
					try { this.LoadedSources[type] = await ctx.decodeAudioData(bytes.slice(0)); }
					catch (e) { console.warn(`Failed to decode sound effect ${SoundEffectType[type]}`, e); }
				});
			});
		}
	}

	SetCustomSource(type: SoundEffectType, buffer: AudioBuffer | null): void { this.customSources[type] = buffer; }

	TryGetSourceForType(type: SoundEffectType): AudioBuffer | null
	{
		return this.customSources[type] ?? this.LoadedSources[type];
	}

	/** NOTE: "startTime" follows the original semantics: A negative value means the sound will start playing that many seconds in the future */
	PlaySound(type: SoundEffectType, startTime: Time = 0.0): void
	{
		Engine.EnsureStreamRunning();
		this.UpdateAsyncLoading();
		const ctx = Engine.Context;
		if (ctx === null)
			return;

		// TODO: Maybe handle metronome in a different way entirely (separate voice pool?)
		const isMetronome = (type === SoundEffectType.MetronomeBar || type === SoundEffectType.MetronomeBeat);

		// TODO: Handle external clock differently so that there isn't any problem with preview sounds / the metronome clashing with manual inputs
		let voiceVolume = 1.0;

		const timeSinceLastVoice = this.LastPlayedVoiceStopwatch.GetElapsed();
		if (!isMetronome && this.LastPlayedVoiceStopwatch.IsRunning)
		{
			const silenceThreshold = TimeFromFrames(2.0, 60.0);
			const fadeOutThreshold = TimeFromFrames(3.0, 60.0);

			// NOTE: The original first maps to a fade-out range and then divides by itself, effectively resulting in a hard cut-off
			if (timeSinceLastVoice < silenceThreshold)
				voiceVolume = 0.0;
			else if (timeSinceLastVoice <= fadeOutThreshold)
				voiceVolume = 1.0;
		}

		voiceVolume = isMetronome ? (voiceVolume * this.BaseVolumeMetronome) : (voiceVolume * this.BaseVolumeSfx * this.BaseVolumeHitPreview);
		voiceVolume *= this.BaseVolumeMaster;

		const sourceBuffer = this.TryGetSourceForType(type);
		if (voiceVolume > 0.0 && sourceBuffer !== null)
		{
			if (!isMetronome)
				this.LastPlayedVoiceStopwatch.Restart();

			const existing = this.VoicePool[this.VoicePoolRingIndex];
			if (existing !== null) { try { existing.Source.stop(); } catch { /* ... */ } existing.Source.disconnect(); existing.Gain.disconnect(); }

			const gain = ctx.createGain();
			gain.gain.value = voiceVolume;
			gain.connect(Engine.MasterGain!);
			const source = ctx.createBufferSource();
			source.buffer = sourceBuffer;
			source.connect(gain);

			const startContextTime = ctx.currentTime + Math.max(0.0, -startTime);
			const offset = Math.max(0.0, startTime);
			if (offset < sourceBuffer.duration)
				source.start(startContextTime, offset);

			const voice: ActiveVoice = { Source: source, Gain: gain, StartContextTime: startContextTime };
			source.onended = () => { source.disconnect(); gain.disconnect(); };
			this.VoicePool[this.VoicePoolRingIndex] = voice;

			this.VoicePoolRingIndex++;
			if (this.VoicePoolRingIndex >= SoundEffectsVoicePool.VoicePoolSize)
				this.VoicePoolRingIndex = 0;
		}
	}

	PauseAllFutureVoices(): void
	{
		const now = Engine.GetContextTime();
		for (let i = 0; i < this.VoicePool.length; i++)
		{
			const voice = this.VoicePool[i];
			if (voice !== null && voice.StartContextTime > now)
			{
				try { voice.Source.stop(); } catch { /* ... */ }
				this.VoicePool[i] = null;
			}
		}
	}
}
