import { describe, it, expect } from "vitest";
import * as TJA from "../src/formats/tja";
import { ChartProject, CreateChartProjectFromTJA, ConvertChartProjectToTJA, DebugCompareCharts, NoteType } from "../src/editor/chart";
import { SortedTempoMap, TempoChange, Tempo } from "../src/core/beat";

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
		expect(notes[1]).toMatchObject({ BeatTime: 96, Type: NoteType.Don });
		expect(notes[2]).toMatchObject({ BeatTime: 144, Type: NoteType.Don });
		expect(notes[3]).toMatchObject({ BeatTime: 192, Type: NoteType.Ka });
		const drumroll = notes.find((n) => n.Type === NoteType.Drumroll)!;
		expect(drumroll.BeatTime).toBe(384 + 96);
		expect(drumroll.BeatDuration).toBe(192 - 96 - 12);
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
		map.Tempo.Sorted = [TempoChange(0, Tempo(120)), TempoChange(192, Tempo(240))];
		map.RebuildAccelerationStructure();
		expect(map.BeatToTime(48)).toBeCloseTo(0.5);
		expect(map.BeatToTime(192)).toBeCloseTo(2.0);
		expect(map.BeatToTime(192 + 48)).toBeCloseTo(2.25);
		expect(map.TimeToBeat(2.25)).toBe(240);
		expect(map.TimeToBeat(-0.5)).toBe(-48);
	});
});
