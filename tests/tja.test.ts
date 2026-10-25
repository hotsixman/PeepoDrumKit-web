import { describe, it, expect } from "vitest";
import * as TJA from "../src/formats/tja";
import { ChartProject, CreateChartProjectFromTJA, ConvertChartProjectToTJA, DebugCompareCharts, NoteType } from "../src/editor/chart";
import { SortedTempoMap, TempoChange, Tempo, TicksPerBeat, OriginalTicksPerBeat, BeatFromBars, SafetyCheckTempo } from "../src/core/beat";

// NOTE: Values below are written in the original resolution (48 ticks per beat) and scaled to the current one
const K = TicksPerBeat / OriginalTicksPerBeat;

const SampleTJA = `TITLE:Test Song
SUBTITLE:--Sub
BPM:150
WAVE:song.ogg
OFFSET:-1.5
DEMOSTART:12.5

COURSE:Oni
LEVEL:8
BALLOON:5,10

#START
1011,
2022,
#BPMCHANGE 200
#SCROLL 1.5
3000400050000008,
#GOGOSTART
7000000000000080,
#MEASURE 3/4
#GOGOEND
#BARLINEOFF
900000000800,
#BARLINEON
#LYRIC hello
#DELAY 0.01
1111,
,
#END
`;

function Parse(text: string)
{
	const errors = new TJA.ErrorList();
	const parsed = TJA.ParseTokens(TJA.TokenizeLines(TJA.SplitLines(text)), errors);
	const chart = new ChartProject();
	CreateChartProjectFromTJA(parsed, chart);
	return { parsed, chart, errors };
}

describe("TJA", () =>
{
	it("parses metadata and notes", () =>
	{
		const { chart, errors } = Parse(SampleTJA);
		expect(errors.Errors).toEqual([]);
		expect(chart.ChartTitle[0]).toBe("Test Song");
		expect(chart.SongOffset).toBeCloseTo(-1.5);
		const course = chart.Courses[0];
		expect(course.Level).toBe(8);
		const notes = course.Notes_Normal.Sorted;
		expect(notes[0]).toMatchObject({ BeatTime: 0, Type: NoteType.Don });
		expect(notes[1]).toMatchObject({ BeatTime: 96 * K, Type: NoteType.Don });
		expect(notes[2]).toMatchObject({ BeatTime: 144 * K, Type: NoteType.Don });
		expect(notes[3]).toMatchObject({ BeatTime: 192 * K, Type: NoteType.Ka });
		const drumroll = notes.find((n) => n.Type === NoteType.Drumroll)!;
		expect(drumroll.BeatTime).toBe((384 + 96) * K);
		expect(drumroll.BeatDuration).toBe((192 - 96 - 12) * K);
		const balloon = notes.find((n) => n.Type === NoteType.Balloon)!;
		expect(balloon.BalloonPopCount).toBe(5);
		expect(course.TempoMap.Tempo.Sorted.map((t) => t.Tempo.BPM)).toEqual([150, 200]);
		expect(course.TempoMap.Signature.Sorted.length).toBe(2);
		expect(course.GoGoRanges.Sorted.length).toBe(1);
		expect(course.Lyrics.Sorted[0].Lyric).toBe("hello");
		const delayed = notes.filter((n) => n.TimeOffset !== 0);
		expect(delayed.length).toBe(4);
	});

	it("round trips through the converter without data loss", () =>
	{
		const { chart } = Parse(SampleTJA);
		const out = TJA.MakeParsedTJA();
		ConvertChartProjectToTJA(chart, out);
		const text = TJA.ConvertParsedToText(out, TJA.Encoding.Unknown);
		expect(text).toContain("// PeepoDrumKit");
		const { chart: chart2, errors } = Parse(text);
		expect(errors.Errors).toEqual([]);
		const messages: string[] = [];
		DebugCompareCharts(chart, chart2, (m) => messages.push(m));
		expect(messages).toEqual([]);
		// NOTE: Ordinary measures must still be written with the same characters as before the resolution change
		expect(text).toContain("3000400050000008,");
		expect(text).toContain("900000000800,");
	});

	it("supports bar divisions that don't fit the original 192 resolution (1/5, 1/7, mixed)", () =>
	{
		const text = SampleTJA.replace("1011,\n2022,", "1212121,\n10201,\n10002100,");
		const { chart } = Parse(text);
		const bar = BeatFromBars(1);
		const notes = chart.Courses[0].Notes_Normal.Sorted;
		expect(notes.slice(0, 7).map((n) => n.BeatTime)).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => i * bar / 7));
		expect(notes.slice(7, 10).map((n) => n.BeatTime)).toEqual([0, 2, 4].map((i) => bar + i * bar / 5));

		const out = TJA.MakeParsedTJA();
		ConvertChartProjectToTJA(chart, out);
		const exported = TJA.ConvertParsedToText(out, TJA.Encoding.Unknown);
		expect(exported).toContain("1212121,");
		expect(exported).toContain("10201,");
		expect(exported).toContain("10002100,");

		const { chart: chart2 } = Parse(exported);
		const messages: string[] = [];
		DebugCompareCharts(chart, chart2, (m) => messages.push(m));
		expect(messages).toEqual([]);
	});

	it("uses the smallest exact measure length when mixing divisions and quantizes off grid positions", () =>
	{
		const { chart } = Parse(SampleTJA);
		const bar = BeatFromBars(1);
		const notes = chart.Courses[0].Notes_Normal;
		// NOTE: Replace the first measure with notes on a 1/4 and a 1/5 grid -> 20 characters
		notes.Sorted = notes.Sorted.filter((n) => n.BeatTime >= bar);
		notes.Sorted.unshift({ ...notes.Sorted[0], BeatTime: 0, BeatDuration: 0, Type: NoteType.Don }, { ...notes.Sorted[0], BeatTime: bar / 4, BeatDuration: 0, Type: NoteType.Ka }, { ...notes.Sorted[0], BeatTime: bar / 5, BeatDuration: 0, Type: NoteType.Don });
		notes.Sorted.sort((a, b) => a.BeatTime - b.BeatTime);
		let out = TJA.MakeParsedTJA();
		ConvertChartProjectToTJA(chart, out);
		let exported = TJA.ConvertParsedToText(out, TJA.Encoding.Unknown);
		expect(exported).toContain("10001200000000000000,");

		// NOTE: A position that doesn't lie on any musical grid must not explode into millions of characters
		notes.Sorted = notes.Sorted.filter((n) => n.BeatTime >= bar);
		notes.Sorted.unshift({ ...notes.Sorted[0], BeatTime: 12345, BeatDuration: 0, Type: NoteType.Don });
		out = TJA.MakeParsedTJA();
		ConvertChartProjectToTJA(chart, out);
		exported = TJA.ConvertParsedToText(out, TJA.Encoding.Unknown);
		const firstMeasure = exported.split("#START")[1].split("\n").find((line) => line.endsWith(",") && /^[0-9]/.test(line))!;
		expect(firstMeasure.length).toBeLessThanOrEqual(192 + 1);
	});

	it("decodes shift-jis without BOM", () =>
	{
		const bytes = new Uint8Array([0x83, 0x65, 0x83, 0x58, 0x83, 0x67]);
		expect(TJA.DecodeFileBytes(bytes)).toBe("テスト");
	});
});

describe("TempoMap", () =>
{
	it("converts beats and times", () =>
	{
		const map = new SortedTempoMap();
		map.Tempo.Sorted = [TempoChange(0, Tempo(120)), TempoChange(192 * K, Tempo(240))];
		map.RebuildAccelerationStructure();
		expect(map.BeatToTime(48 * K)).toBeCloseTo(0.5);
		expect(map.BeatToTime(192 * K)).toBeCloseTo(2.0);
		expect(map.BeatToTime((192 + 48) * K)).toBeCloseTo(2.25);
		expect(map.TimeToBeat(2.25)).toBe(240 * K);
		expect(map.TimeToBeat(-0.5)).toBe(-48 * K);
	});

	it("matches the original per tick lookup table implementation", () =>
	{
		// NOTE: Reference implementation of the original TempoMapAccelerationStructure (one pre calculated time per tick)
		const changes = [TempoChange(0, Tempo(150)), TempoChange(Math.round(TicksPerBeat * 0.75), Tempo(97.5)), TempoChange(TicksPerBeat * 2, Tempo(310)), TempoChange(TicksPerBeat * 3 + 7, Tempo(60))];
		const timesLength = changes[changes.length - 1].BeatTime + 1;
		const times = new Float64Array(timesLength);
		let lastEndTime = 0.0;
		for (let c = 0; c < changes.length; c++)
		{
			const tickDuration = (60.0 / SafetyCheckTempo(changes[c].Tempo).BPM) / TicksPerBeat;
			const end = (c === changes.length - 1) ? timesLength : changes[c + 1].BeatTime;
			for (let i = 0, t = changes[c].BeatTime; t < end; t++) times[t] = (tickDuration * i++) + lastEndTime;
			lastEndTime = times[end - 1] + tickDuration;
		}
		const firstTick = (60.0 / 150) / TicksPerBeat, lastTick = (60.0 / 60) / TicksPerBeat;
		const refBeatToTime = (beat: number) => (beat < 0) ? firstTick * beat : (beat >= timesLength) ? times[timesLength - 1] + lastTick * (beat - timesLength + 1) : times[beat];
		const refTimeToBeat = (time: number) =>
		{
			const lastTime = times[timesLength - 1];
			if (time < 0) return Math.trunc(time / firstTick);
			if (time >= lastTime) return Math.trunc(timesLength + (time - lastTime) / lastTick - 1);
			let left = 0, right = timesLength - 1;
			while (left <= right) { const mid = (left + right) >> 1; if (time < times[mid]) right = mid - 1; else if (time > times[mid]) left = mid + 1; else return mid; }
			return ((times[left] - time) < (time - times[right])) ? left : right;
		};

		const map = new SortedTempoMap();
		map.Tempo.Sorted = changes;
		map.RebuildAccelerationStructure();
		let seed = 1;
		const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
		for (let i = 0; i < 20000; i++)
		{
			const beat = Math.floor((random() * 5.5 - 0.5) * TicksPerBeat);
			expect(Math.abs(map.BeatToTime(beat) - refBeatToTime(beat))).toBeLessThan(1e-9);
			const time = (random() * 4.0) - 0.2;
			expect(Math.abs(map.TimeToBeat(time) - refTimeToBeat(time))).toBeLessThanOrEqual(1);
		}
		for (const c of changes)
		{
			expect(map.TimeToBeat(map.BeatToTime(c.BeatTime))).toBe(c.BeatTime);
			expect(map.TimeToBeat(map.BeatToTime(c.BeatTime + 12345))).toBe(c.BeatTime + 12345);
		}
	});
});
