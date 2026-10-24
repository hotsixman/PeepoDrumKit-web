// Port of PeepoDrumKit "peepo_drum_kit/chart_editor_context.h"
// https://github.com/samyuu/PeepoDrumKit
import { type Time, ApproxmiatelySame } from "../core/types";
import { type Beat } from "../core/beat";
import { UndoHistory } from "../core/undo";
import { ChartProject, ChartCourse, BranchType } from "./chart";
import { SoundEffectsVoicePool } from "./sound";
import { ChartGraphicsResources } from "./graphics";
import { SongVoice } from "../audio/engine";
import { WaveformMipChain } from "../audio/waveform";

export interface BeatAndTime { Beat: Beat; Time: Time; }

// NOTE: Essentially the shared data between all the chart editor components, split into a separate file away from the chart editor to avoid circular #includes
export class ChartContext
{
	Chart = new ChartProject();
	ChartFilePath = "";

	// NOTE: Must **ALWAYS** point to a valid course. If "Chart.Courses.empty()" then a new one should automatically be added at the start of the frame before anything else is updated
	ChartSelectedCourse: ChartCourse = new ChartCourse();
	ChartSelectedBranch: BranchType = BranchType.Normal;

	// NOTE: Specifically for accurate playback preview sound future-offset calculations
	CursorNonSmoothTimeThisFrame: Time = 0.0;
	CursorNonSmoothTimeLastFrame: Time = 0.0;
	// NOTE: Store cursor time as Beat while paused to avoid any floating point precision issues and make sure "SetCursorBeat(x); assert(GetCursorBeat() == x)"
	CursorBeatWhilePaused: Beat = 0;
	// NOTE: Specifically to skip hit animations for notes before this time point
	CursorTimeOnPlaybackStart: Time = 0.0;

	// NOTE: Specifically for animations, accumulated program delta time, unrelated to GetCursorTime() etc.
	ElapsedProgramTimeSincePlaybackStarted: Time = 0.0;
	ElapsedProgramTimeSincePlaybackStopped: Time = 0.0;

	SongVoice = new SongVoice();
	SongSource: AudioBuffer | null = null;
	SfxVoicePool = new SoundEffectsVoicePool();
	Gfx = new ChartGraphicsResources();

	SongSourceFilePath = "";
	SongWaveformL = new WaveformMipChain();
	SongWaveformR = new WaveformMipChain();
	SongWaveformFadeAnimationCurrent = 0.0;
	SongWaveformFadeAnimationTarget = 0.0;

	Undo = new UndoHistory();

	// NOTE: Web specific, files the chart was loaded alongside of (to resolve relative song paths)
	ChartFileHandle: FileSystemFileHandle | null = null;
	ChartDirectoryFiles = new Map<string, File>();

	BeatToTime(beat: Beat): Time { return this.ChartSelectedCourse.TempoMap.BeatToTime(beat); }
	TimeToBeat(time: Time): Beat { return this.ChartSelectedCourse.TempoMap.TimeToBeat(time); }

	GetPlaybackSpeed(): number { return this.SongVoice.GetPlaybackSpeed(); }
	SetPlaybackSpeed(newSpeed: number): void { if (!ApproxmiatelySame(this.SongVoice.GetPlaybackSpeed(), newSpeed)) this.SongVoice.SetPlaybackSpeed(newSpeed); }

	GetIsPlayback(): boolean { return this.SongVoice.GetIsPlaying(); }

	SetIsPlayback(newIsPlaying: boolean): void
	{
		if (this.SongVoice.GetIsPlaying() === newIsPlaying)
			return;

		if (newIsPlaying)
		{
			this.CursorTimeOnPlaybackStart = (this.SongVoice.GetPosition() + this.Chart.SongOffset);
			this.SongVoice.SetIsPlaying(true);
		}
		else
		{
			this.SongVoice.SetIsPlaying(false);
			this.CursorBeatWhilePaused = this.ChartSelectedCourse.TempoMap.TimeToBeat((this.SongVoice.GetPosition() + this.Chart.SongOffset));
			this.SfxVoicePool.PauseAllFutureVoices();
		}
	}

	GetCursorTime(): Time
	{
		if (this.SongVoice.GetIsPlaying())
			return (this.SongVoice.GetPositionSmooth() + this.Chart.SongOffset);
		else
			return this.ChartSelectedCourse.TempoMap.BeatToTime(this.CursorBeatWhilePaused);
	}

	GetCursorBeat(): Beat
	{
		if (this.SongVoice.GetIsPlaying())
			return this.ChartSelectedCourse.TempoMap.TimeToBeat((this.SongVoice.GetPositionSmooth() + this.Chart.SongOffset));
		else
			return this.CursorBeatWhilePaused;
	}

	// NOTE: Specifically to make sure the cursor time and beat are both in sync (as the song voice position is updated asynchronously)
	GetCursorBeatAndTime(): BeatAndTime
	{
		if (this.SongVoice.GetIsPlaying()) { const t = (this.SongVoice.GetPositionSmooth() + this.Chart.SongOffset); return { Beat: this.ChartSelectedCourse.TempoMap.TimeToBeat(t), Time: t }; }
		else { const b = this.CursorBeatWhilePaused; return { Beat: b, Time: this.ChartSelectedCourse.TempoMap.BeatToTime(b) }; }
	}

	SetCursorTime(newTime: Time): void
	{
		this.SongVoice.SetPosition(newTime - this.Chart.SongOffset);
		this.CursorNonSmoothTimeThisFrame = this.CursorNonSmoothTimeLastFrame = newTime;
		this.CursorBeatWhilePaused = this.ChartSelectedCourse.TempoMap.TimeToBeat(newTime);
		this.CursorTimeOnPlaybackStart = newTime;
	}

	SetCursorBeat(newBeat: Beat): void
	{
		const newTime = this.ChartSelectedCourse.TempoMap.BeatToTime(newBeat);
		this.SongVoice.SetPosition(newTime - this.Chart.SongOffset);
		this.CursorNonSmoothTimeThisFrame = this.CursorNonSmoothTimeLastFrame = newTime;
		this.CursorBeatWhilePaused = newBeat;
		this.CursorTimeOnPlaybackStart = newTime;
	}
}
