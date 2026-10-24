// Port of the PeepoDrumKit "TempoTapCalculator" (peepo_drum_kit/chart_editor_widgets.h)
// https://github.com/samyuu/PeepoDrumKit
import { CPUStopwatch, type Time } from "../core/types";
import { type Tempo, Tempo as MakeTempo } from "../core/beat";

export class TempoTapCalculator
{
	TapCount = 0;
	LastTempo: Tempo = MakeTempo(0.0);
	LastTempoMin: Tempo = MakeTempo(0.0);
	LastTempoMax: Tempo = MakeTempo(0.0);
	FirstTap = CPUStopwatch.StartNew();
	LastTap = CPUStopwatch.StartNew();
	ResetThreshold: Time = 2.0;

	HasTimedOut(): boolean { return this.ResetThreshold > 0.0 && this.LastTap.GetElapsed() >= this.ResetThreshold; }
	Reset(): void { this.FirstTap.Stop(); this.TapCount = 0; this.LastTempo = MakeTempo(0.0); this.LastTempoMin = MakeTempo(0.0); this.LastTempoMax = MakeTempo(0.0); }

	Tap(): void
	{
		if (this.ResetThreshold > 0.0 && this.LastTap.Restart() >= this.ResetThreshold)
			this.Reset();
		this.FirstTap.Start();
		this.LastTempo = TempoTapCalculator.CalculateTempo(this.TapCount++, this.FirstTap.GetElapsed());
		this.LastTempoMin = MakeTempo((this.TapCount <= 2) ? this.LastTempo.BPM : Math.min(this.LastTempo.BPM, this.LastTempoMin.BPM));
		this.LastTempoMax = MakeTempo((this.TapCount <= 2) ? this.LastTempo.BPM : Math.max(this.LastTempo.BPM, this.LastTempoMax.BPM));
	}

	static CalculateTempo(tapCount: number, elapsed: Time): Tempo { return MakeTempo((tapCount <= 0) ? 0.0 : (60.0 * tapCount / elapsed)); }
}
