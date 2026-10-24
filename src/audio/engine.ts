// NOTE: Web Audio replacement for the WASAPI based "audio/audio_engine.cpp" of PeepoDrumKit (https://github.com/samyuu/PeepoDrumKit).
//		 Provides the same Voice interface (position / playback / speed / volume) used by the chart editor.
import { type Time } from "../core/types";

export class AudioEngine
{
	Context: AudioContext | null = null;
	MasterGain: GainNode | null = null;
	private masterVolume = 0.75;

	GetIsStreamOpenRunning(): boolean { return this.Context !== null && this.Context.state === "running"; }

	OpenStartStream(): void
	{
		if (this.Context === null)
		{
			const Ctor: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			this.Context = new Ctor({ latencyHint: "interactive" });
			this.MasterGain = this.Context.createGain();
			this.MasterGain.gain.value = this.masterVolume;
			this.MasterGain.connect(this.Context.destination);
		}
		if (this.Context.state !== "running")
			void this.Context.resume();
	}

	EnsureStreamRunning(): void { this.OpenStartStream(); }

	StopCloseStream(): void { if (this.Context !== null && this.Context.state === "running") void this.Context.suspend(); }

	SetMasterVolume(v: number): void { this.masterVolume = v; if (this.MasterGain !== null) this.MasterGain.gain.value = v; }

	/** NOTE: Current time of the audio rendering clock (the "non smooth" time which is ahead of what's actually audible) */
	GetContextTime(): Time { return (this.Context !== null) ? this.Context.currentTime : 0.0; }

	/** NOTE: Smooth (and latency compensated) estimate of the context time that is currently audible */
	GetOutputContextTimeSmooth(): Time
	{
		const ctx = this.Context;
		if (ctx === null) return 0.0;
		if (typeof ctx.getOutputTimestamp === "function")
		{
			const ts = ctx.getOutputTimestamp();
			if (ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0)
				return ts.contextTime + (performance.now() - ts.performanceTime) / 1000.0;
		}
		return ctx.currentTime - (ctx.baseLatency ?? 0.0);
	}

	GetOutputLatency(): Time { const ctx = this.Context; return (ctx === null) ? 0.0 : ((ctx.outputLatency ?? 0.0) + (ctx.baseLatency ?? 0.0)); }
	GetSampleRate(): number { return (this.Context !== null) ? this.Context.sampleRate : 44100; }

	async DecodeAudioFile(data: ArrayBuffer): Promise<AudioBuffer>
	{
		this.OpenStartStream();
		return await this.Context!.decodeAudioData(data);
	}
}

export const Engine = new AudioEngine();

// NOTE: Equivalent of the Audio::Voice used for the song (supports variable playback speed, negative positions and smooth position interpolation)
export class SongVoice
{
	private buffer: AudioBuffer | null = null;
	private source: AudioBufferSourceNode | null = null;
	private gain: GainNode | null = null;
	private isPlaying = false;
	private playbackSpeed = 1.0;
	private volume = 1.0;

	// NOTE: Voice position at the time playback was (re)started
	private basePosition: Time = 0.0;
	// NOTE: Audio context time at which basePosition was valid
	private baseContextTime: Time = 0.0;
	private pausedPosition: Time = 0.0;

	SetSource(buffer: AudioBuffer | null): void
	{
		const wasPlaying = this.isPlaying;
		const position = this.GetPosition();
		if (wasPlaying) this.stopSource();
		this.buffer = buffer;
		this.pausedPosition = position;
		if (wasPlaying) this.startSourceAt(position);
	}

	GetDuration(): Time { return (this.buffer !== null) ? this.buffer.duration : 0.0; }

	GetIsPlaying(): boolean { return this.isPlaying; }

	SetIsPlaying(value: boolean): void
	{
		if (value === this.isPlaying) return;
		if (value)
		{
			Engine.EnsureStreamRunning();
			this.isPlaying = true;
			this.startSourceAt(this.pausedPosition);
		}
		else
		{
			this.pausedPosition = this.GetPosition();
			this.stopSource();
			this.isPlaying = false;
		}
	}

	GetPlaybackSpeed(): number { return this.playbackSpeed; }

	SetPlaybackSpeed(value: number): void
	{
		if (value === this.playbackSpeed) return;
		if (this.isPlaying)
		{
			const position = this.GetPosition();
			this.playbackSpeed = value;
			this.stopSource();
			this.startSourceAt(position);
		}
		else
		{
			this.playbackSpeed = value;
		}
	}

	SetVolume(value: number): void
	{
		if (value === this.volume) return;
		this.volume = value;
		if (this.gain !== null) this.gain.gain.value = value;
	}

	/** NOTE: "Non smooth" voice position based on the audio rendering clock */
	GetPosition(): Time
	{
		if (!this.isPlaying) return this.pausedPosition;
		return this.basePosition + (Engine.GetContextTime() - this.baseContextTime) * this.playbackSpeed;
	}

	/** NOTE: Smoothly interpolated (audible) voice position, to be used for anything visual */
	GetPositionSmooth(): Time
	{
		if (!this.isPlaying) return this.pausedPosition;
		return this.basePosition + (Engine.GetOutputContextTimeSmooth() - this.baseContextTime) * this.playbackSpeed;
	}

	SetPosition(value: Time): void
	{
		if (this.isPlaying)
		{
			this.stopSource();
			this.startSourceAt(value);
		}
		else
		{
			this.pausedPosition = value;
		}
	}

	/** NOTE: Converts a voice position into the audio context time at which it will be (or was) rendered */
	PositionToContextTime(position: Time): Time { return this.baseContextTime + (position - this.basePosition) / this.playbackSpeed; }

	private startSourceAt(position: Time): void
	{
		const ctx = Engine.Context;
		if (ctx === null) { this.basePosition = position; this.baseContextTime = 0.0; return; }

		this.basePosition = position;
		this.baseContextTime = ctx.currentTime;

		if (this.buffer === null || position >= this.buffer.duration)
			return;

		if (this.gain === null)
		{
			this.gain = ctx.createGain();
			this.gain.gain.value = this.volume;
			this.gain.connect(Engine.MasterGain!);
		}

		const source = ctx.createBufferSource();
		source.buffer = this.buffer;
		source.playbackRate.value = this.playbackSpeed;
		source.connect(this.gain);

		// NOTE: Negative positions (before the start of the song) are handled by delaying the start
		if (position < 0.0)
			source.start(this.baseContextTime + (-position / this.playbackSpeed), 0.0);
		else
			source.start(this.baseContextTime, position);
		this.source = source;
	}

	private stopSource(): void
	{
		if (this.source !== null)
		{
			try { this.source.stop(); } catch { /* NOTE: Already stopped */ }
			this.source.disconnect();
			this.source = null;
		}
	}
}
