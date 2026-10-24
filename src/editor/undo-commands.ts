// Port of PeepoDrumKit "peepo_drum_kit/chart_editor_undo.h"
// https://github.com/samyuu/PeepoDrumKit
import { Command, MergeResult, type CommandInfo } from "../core/undo";
import { type Time } from "../core/types";
import { type Beat, type TempoChange, type TimeSignatureChange, SortedTempoMap, CloneTempoChange, CloneTimeSignatureChange } from "../core/beat";
import
{
	type ChartProject, type ChartCourse, type Note, type NoteType, type ScrollChange, type BarLineChange, type GoGoRange, type LyricChange,
	type SortedNotesList, type SortedScrollChangesList, type SortedBarLineChangesList, type SortedGoGoRangesList, type SortedLyricsList,
	type GenericListStructWithType, type GenericMemberValue, GenericList, GenericMember,
	CloneNote, CloneScrollChange, CloneBarLineChange, CloneGoGoRange, CloneLyricChange, CloneGenericListStructWithType, CloneGenericMemberValue,
	TryAddGenericStruct, TryRemoveGenericStruct, TryGetGeneric, TrySetGeneric, GetGenericListStructBeat,
} from "./chart";

// NOTE: General chart commands
export class ChangeSongOffset extends Command
{
	OldValue: Time;
	constructor(public Chart: ChartProject, public NewValue: Time) { super(); this.OldValue = Chart.SongOffset; }
	Undo() { this.Chart.SongOffset = this.OldValue; }
	Redo() { this.Chart.SongOffset = this.NewValue; }
	TryMerge(commandToMerge: Command): MergeResult
	{
		const other = commandToMerge as ChangeSongOffset;
		if (other.Chart !== this.Chart) return MergeResult.Failed;
		this.NewValue = other.NewValue;
		return MergeResult.ValueUpdated;
	}
	GetInfo(): CommandInfo { return { Description: "Change Song Offset" }; }
}

export class ChangeSongDemoStartTime extends Command
{
	OldValue: Time;
	constructor(public Chart: ChartProject, public NewValue: Time) { super(); this.OldValue = Chart.SongDemoStartTime; }
	Undo() { this.Chart.SongDemoStartTime = this.OldValue; }
	Redo() { this.Chart.SongDemoStartTime = this.NewValue; }
	TryMerge(commandToMerge: Command): MergeResult
	{
		const other = commandToMerge as ChangeSongDemoStartTime;
		if (other.Chart !== this.Chart) return MergeResult.Failed;
		this.NewValue = other.NewValue;
		return MergeResult.ValueUpdated;
	}
	GetInfo(): CommandInfo { return { Description: "Change Song Demo Start" }; }
}

export class ChangeChartDuration extends Command
{
	OldValue: Time;
	constructor(public Chart: ChartProject, public NewValue: Time) { super(); this.OldValue = Chart.ChartDuration; }
	Undo() { this.Chart.ChartDuration = this.OldValue; }
	Redo() { this.Chart.ChartDuration = this.NewValue; }
	TryMerge(commandToMerge: Command): MergeResult
	{
		const other = commandToMerge as ChangeChartDuration;
		if (other.Chart !== this.Chart) return MergeResult.Failed;
		this.NewValue = other.NewValue;
		return MergeResult.ValueUpdated;
	}
	GetInfo(): CommandInfo { return { Description: "Change Chart Duration" }; }
}

// NOTE: Tempo map commands
export class AddTempoChange extends Command
{
	NewValue: TempoChange;
	constructor(public TempoMap: SortedTempoMap, newValue: TempoChange) { super(); this.NewValue = CloneTempoChange(newValue); }
	Undo() { this.TempoMap.Tempo.RemoveAtBeat(this.NewValue.BeatTime); this.TempoMap.RebuildAccelerationStructure(); }
	Redo() { this.TempoMap.Tempo.InsertOrUpdate(this.NewValue); this.TempoMap.RebuildAccelerationStructure(); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Add Tempo Change" }; }
}

export class RemoveTempoChange extends Command
{
	OldValue: TempoChange;
	constructor(public TempoMap: SortedTempoMap, beat: Beat) { super(); this.OldValue = CloneTempoChange(TempoMap.Tempo.TryFindLastAtBeat(beat)!); }
	Undo() { this.TempoMap.Tempo.InsertOrUpdate(this.OldValue); this.TempoMap.RebuildAccelerationStructure(); }
	Redo() { this.TempoMap.Tempo.RemoveAtBeat(this.OldValue.BeatTime); this.TempoMap.RebuildAccelerationStructure(); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Remove Tempo Change" }; }
}

export class UpdateTempoChange extends Command
{
	NewValue: TempoChange; OldValue: TempoChange;
	constructor(public TempoMap: SortedTempoMap, newValue: TempoChange) { super(); this.NewValue = CloneTempoChange(newValue); this.OldValue = CloneTempoChange(TempoMap.Tempo.TryFindLastAtBeat(newValue.BeatTime)!); }
	Undo() { this.TempoMap.Tempo.InsertOrUpdate(this.OldValue); this.TempoMap.RebuildAccelerationStructure(); }
	Redo() { this.TempoMap.Tempo.InsertOrUpdate(this.NewValue); this.TempoMap.RebuildAccelerationStructure(); }
	TryMerge(commandToMerge: Command): MergeResult
	{
		const other = commandToMerge as UpdateTempoChange;
		if (other.TempoMap !== this.TempoMap || other.NewValue.BeatTime !== this.NewValue.BeatTime) return MergeResult.Failed;
		this.NewValue = other.NewValue;
		return MergeResult.ValueUpdated;
	}
	GetInfo(): CommandInfo { return { Description: "Update Tempo Change" }; }
}

export class AddTimeSignatureChange extends Command
{
	NewValue: TimeSignatureChange;
	constructor(public TempoMap: SortedTempoMap, newValue: TimeSignatureChange) { super(); this.NewValue = CloneTimeSignatureChange(newValue); }
	Undo() { this.TempoMap.Signature.RemoveAtBeat(this.NewValue.BeatTime); }
	Redo() { this.TempoMap.Signature.InsertOrUpdate(this.NewValue); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Add Time Signature Change" }; }
}

export class RemoveTimeSignatureChange extends Command
{
	OldValue: TimeSignatureChange;
	constructor(public TempoMap: SortedTempoMap, beat: Beat) { super(); this.OldValue = CloneTimeSignatureChange(TempoMap.Signature.TryFindLastAtBeat(beat)!); }
	Undo() { this.TempoMap.Signature.InsertOrUpdate(this.OldValue); }
	Redo() { this.TempoMap.Signature.RemoveAtBeat(this.OldValue.BeatTime); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Remove Time Signature Change" }; }
}

export class UpdateTimeSignatureChange extends Command
{
	NewValue: TimeSignatureChange; OldValue: TimeSignatureChange;
	constructor(public TempoMap: SortedTempoMap, newValue: TimeSignatureChange) { super(); this.NewValue = CloneTimeSignatureChange(newValue); this.OldValue = CloneTimeSignatureChange(TempoMap.Signature.TryFindLastAtBeat(newValue.BeatTime)!); }
	Undo() { this.TempoMap.Signature.InsertOrUpdate(this.OldValue); }
	Redo() { this.TempoMap.Signature.InsertOrUpdate(this.NewValue); }
	TryMerge(commandToMerge: Command): MergeResult
	{
		const other = commandToMerge as UpdateTimeSignatureChange;
		if (other.TempoMap !== this.TempoMap || other.NewValue.BeatTime !== this.NewValue.BeatTime) return MergeResult.Failed;
		this.NewValue = other.NewValue;
		return MergeResult.ValueUpdated;
	}
	GetInfo(): CommandInfo { return { Description: "Update Time Signature Change" }; }
}

// NOTE: Chart change commands
export class AddScrollChange extends Command
{
	NewValue: ScrollChange;
	constructor(public ScrollChanges: SortedScrollChangesList, newValue: ScrollChange) { super(); this.NewValue = CloneScrollChange(newValue); }
	Undo() { this.ScrollChanges.RemoveAtBeat(this.NewValue.BeatTime); }
	Redo() { this.ScrollChanges.InsertOrUpdate(this.NewValue); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Add Scroll Change" }; }
}

export class AddMultipleScrollChanges extends Command
{
	NewScrollChanges: ScrollChange[];
	constructor(public ScrollChanges: SortedScrollChangesList, newValues: ScrollChange[]) { super(); this.NewScrollChanges = newValues.map(CloneScrollChange); }
	Undo() { for (const scroll of this.NewScrollChanges) this.ScrollChanges.RemoveAtBeat(scroll.BeatTime); }
	Redo() { for (const scroll of this.NewScrollChanges) this.ScrollChanges.InsertOrUpdate(scroll); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Add Scroll Changes" }; }
}

export class RemoveScrollChange extends Command
{
	OldValue: ScrollChange;
	constructor(public ScrollChanges: SortedScrollChangesList, beat: Beat) { super(); this.OldValue = CloneScrollChange(ScrollChanges.TryFindExactAtBeat(beat)!); }
	Undo() { this.ScrollChanges.InsertOrUpdate(this.OldValue); }
	Redo() { this.ScrollChanges.RemoveAtBeat(this.OldValue.BeatTime); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Remove Scroll Change" }; }
}

export class UpdateScrollChange extends Command
{
	NewValue: ScrollChange; OldValue: ScrollChange;
	constructor(public ScrollChanges: SortedScrollChangesList, newValue: ScrollChange) { super(); this.NewValue = CloneScrollChange(newValue); this.OldValue = CloneScrollChange(ScrollChanges.TryFindExactAtBeat(newValue.BeatTime)!); }
	Undo() { this.ScrollChanges.InsertOrUpdate(this.OldValue); }
	Redo() { this.ScrollChanges.InsertOrUpdate(this.NewValue); }
	TryMerge(commandToMerge: Command): MergeResult
	{
		const other = commandToMerge as UpdateScrollChange;
		if (other.ScrollChanges !== this.ScrollChanges || other.NewValue.BeatTime !== this.NewValue.BeatTime) return MergeResult.Failed;
		this.NewValue = other.NewValue;
		return MergeResult.ValueUpdated;
	}
	GetInfo(): CommandInfo { return { Description: "Update Scroll Change" }; }
}

export class AddBarLineChange extends Command
{
	NewValue: BarLineChange;
	constructor(public BarLineChanges: SortedBarLineChangesList, newValue: BarLineChange) { super(); this.NewValue = CloneBarLineChange(newValue); }
	Undo() { this.BarLineChanges.RemoveAtBeat(this.NewValue.BeatTime); }
	Redo() { this.BarLineChanges.InsertOrUpdate(this.NewValue); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Add Bar Line Change" }; }
}

export class RemoveBarLineChange extends Command
{
	OldValue: BarLineChange;
	constructor(public BarLineChanges: SortedBarLineChangesList, beat: Beat) { super(); this.OldValue = CloneBarLineChange(BarLineChanges.TryFindExactAtBeat(beat)!); }
	Undo() { this.BarLineChanges.InsertOrUpdate(this.OldValue); }
	Redo() { this.BarLineChanges.RemoveAtBeat(this.OldValue.BeatTime); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Remove Bar Line Change" }; }
}

export class UpdateBarLineChange extends Command
{
	NewValue: BarLineChange; OldValue: BarLineChange;
	constructor(public BarLineChanges: SortedBarLineChangesList, newValue: BarLineChange) { super(); this.NewValue = CloneBarLineChange(newValue); this.OldValue = CloneBarLineChange(BarLineChanges.TryFindExactAtBeat(newValue.BeatTime)!); }
	Undo() { this.BarLineChanges.InsertOrUpdate(this.OldValue); }
	Redo() { this.BarLineChanges.InsertOrUpdate(this.NewValue); }
	// NOTE: Merging here doesn't really make much sense..?
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Update Bar Line Change" }; }
}

export class AddGoGoRange extends Command
{
	// NOTE: Creating a full copy of the new/old state for now because it's easy and there typically are only a very few number of GoGoRanges
	NewValues: GoGoRange[]; OldValues: GoGoRange[];
	constructor(public GoGoRanges: SortedGoGoRangesList, newValues: SortedGoGoRangesList) { super(); this.NewValues = newValues.Sorted.map(CloneGoGoRange); this.OldValues = GoGoRanges.Sorted.map(CloneGoGoRange); }
	Undo() { this.GoGoRanges.Sorted = this.OldValues.map(CloneGoGoRange); }
	Redo() { this.GoGoRanges.Sorted = this.NewValues.map(CloneGoGoRange); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Add Go-Go Range" }; }
}

export class RemoveGoGoRange extends Command
{
	OldValue: GoGoRange;
	constructor(public GoGoRanges: SortedGoGoRangesList, beat: Beat) { super(); this.OldValue = CloneGoGoRange(GoGoRanges.TryFindExactAtBeat(beat)!); }
	Undo() { this.GoGoRanges.InsertOrUpdate(this.OldValue); }
	Redo() { this.GoGoRanges.RemoveAtBeat(this.OldValue.BeatTime); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Remove Go-Go Range" }; }
}

export class AddLyricChange extends Command
{
	NewValue: LyricChange;
	constructor(public Lyrics: SortedLyricsList, newValue: LyricChange) { super(); this.NewValue = CloneLyricChange(newValue); }
	Undo() { this.Lyrics.RemoveAtBeat(this.NewValue.BeatTime); }
	Redo() { this.Lyrics.InsertOrUpdate(this.NewValue); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Add Lyric Change" }; }
}

export class RemoveLyricChange extends Command
{
	OldValue: LyricChange;
	constructor(public Lyrics: SortedLyricsList, beat: Beat) { super(); this.OldValue = CloneLyricChange(Lyrics.TryFindExactAtBeat(beat)!); }
	Undo() { this.Lyrics.InsertOrUpdate(this.OldValue); }
	Redo() { this.Lyrics.RemoveAtBeat(this.OldValue.BeatTime); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Remove Lyric Change" }; }
}

export class UpdateLyricChange extends Command
{
	NewValue: LyricChange; OldValue: LyricChange;
	constructor(public Lyrics: SortedLyricsList, newValue: LyricChange) { super(); this.NewValue = CloneLyricChange(newValue); this.OldValue = CloneLyricChange(Lyrics.TryFindExactAtBeat(newValue.BeatTime)!); }
	Undo() { this.Lyrics.InsertOrUpdate(this.OldValue); }
	Redo() { this.Lyrics.InsertOrUpdate(this.NewValue); }
	TryMerge(commandToMerge: Command): MergeResult
	{
		const other = commandToMerge as UpdateLyricChange;
		if (other.Lyrics !== this.Lyrics || other.NewValue.BeatTime !== this.NewValue.BeatTime) return MergeResult.Failed;
		this.NewValue = other.NewValue;
		return MergeResult.ValueUpdated;
	}
	GetInfo(): CommandInfo { return { Description: "Update Lyric Change" }; }
}

export class ReplaceAllLyricChanges extends Command
{
	NewValue: LyricChange[]; OldValue: LyricChange[];
	constructor(public Lyrics: SortedLyricsList, newValue: SortedLyricsList) { super(); this.NewValue = newValue.Sorted.map(CloneLyricChange); this.OldValue = Lyrics.Sorted.map(CloneLyricChange); }
	Undo() { this.Lyrics.Sorted = this.OldValue.map(CloneLyricChange); }
	Redo() { this.Lyrics.Sorted = this.NewValue.map(CloneLyricChange); }
	TryMerge(commandToMerge: Command): MergeResult
	{
		const other = commandToMerge as ReplaceAllLyricChanges;
		if (other.Lyrics !== this.Lyrics) return MergeResult.Failed;
		this.NewValue = other.NewValue;
		return MergeResult.ValueUpdated;
	}
	GetInfo(): CommandInfo { return { Description: "Update All Lyrics" }; }
}

// NOTE: Note commands
export class AddSingleNote extends Command
{
	NewNote: Note;
	constructor(public Notes: SortedNotesList, newNote: Note) { super(); this.NewNote = CloneNote(newNote); }
	Undo() { this.Notes.RemoveAtBeat(this.NewNote.BeatTime); }
	Redo() { this.Notes.InsertOrUpdate(this.NewNote); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Add Note" }; }
}

export class AddMultipleNotes extends Command
{
	NewNotes: Note[];
	constructor(public Notes: SortedNotesList, newNotes: Note[]) { super(); this.NewNotes = newNotes.map(CloneNote); }
	Undo() { for (const note of this.NewNotes) this.Notes.RemoveAtBeat(note.BeatTime); }
	Redo() { for (const note of this.NewNotes) this.Notes.InsertOrUpdate(note); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Add Notes" }; }
}

export class RemoveSingleNote extends Command
{
	OldNote: Note;
	constructor(public Notes: SortedNotesList, oldNote: Note) { super(); this.OldNote = CloneNote(oldNote); }
	Undo() { this.Notes.InsertOrUpdate(this.OldNote); }
	Redo() { this.Notes.RemoveAtBeat(this.OldNote.BeatTime); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Remove Note" }; }
}

export class RemoveMultipleNotes extends Command
{
	OldNotes: Note[];
	constructor(public Notes: SortedNotesList, oldNotes: Note[]) { super(); this.OldNotes = oldNotes.map(CloneNote); }
	Undo() { for (const note of this.OldNotes) this.Notes.InsertOrUpdate(note); }
	Redo() { for (const note of this.OldNotes) this.Notes.RemoveAtBeat(note.BeatTime); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Remove Notes" }; }
}

export class AddSingleLongNote extends Command
{
	NewNote: Note;
	NotesToRemove: RemoveMultipleNotes;
	constructor(public Notes: SortedNotesList, newNote: Note, notesToRemove: Note[]) { super(); this.NewNote = CloneNote(newNote); this.NotesToRemove = new RemoveMultipleNotes(Notes, notesToRemove); }
	Undo() { this.Notes.RemoveAtBeat(this.NewNote.BeatTime); this.NotesToRemove.Undo(); }
	Redo() { this.NotesToRemove.Redo(); this.Notes.InsertOrUpdate(this.NewNote); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Add Long Note" }; }
}

export class AddMultipleNotes_Paste extends AddMultipleNotes { GetInfo(): CommandInfo { return { Description: "Paste Notes" }; } }
export class RemoveMultipleNotes_Cut extends RemoveMultipleNotes { GetInfo(): CommandInfo { return { Description: "Cut Notes" }; } }

export interface ChangeSingleNoteTypeData { Index: number; NewType: NoteType; OldType?: NoteType; }
export class ChangeSingleNoteType extends Command
{
	NewData: Required<ChangeSingleNoteTypeData>;
	constructor(public Notes: SortedNotesList, newData: ChangeSingleNoteTypeData) { super(); this.NewData = { Index: newData.Index, NewType: newData.NewType, OldType: Notes.Sorted[newData.Index].Type }; }
	Undo() { this.Notes.Sorted[this.NewData.Index].Type = this.NewData.OldType; }
	Redo() { this.Notes.Sorted[this.NewData.Index].Type = this.NewData.NewType; }
	TryMerge(commandToMerge: Command): MergeResult
	{
		const other = commandToMerge as ChangeSingleNoteType;
		if (other.Notes !== this.Notes) return MergeResult.Failed;
		if (this.NewData.Index !== other.NewData.Index) return MergeResult.Failed;
		this.NewData.NewType = other.NewData.NewType;
		return MergeResult.ValueUpdated;
	}
	GetInfo(): CommandInfo { return { Description: "Change Note Type" }; }
}

export interface ChangeMultipleNoteTypesData { Index: number; NewType: NoteType; OldType?: NoteType; }
export class ChangeMultipleNoteTypes extends Command
{
	NewData: Required<ChangeMultipleNoteTypesData>[];
	constructor(public Notes: SortedNotesList, newData: ChangeMultipleNoteTypesData[]) { super(); this.NewData = newData.map((d) => ({ Index: d.Index, NewType: d.NewType, OldType: Notes.Sorted[d.Index].Type })); }
	Undo() { for (const d of this.NewData) this.Notes.Sorted[d.Index].Type = d.OldType; }
	Redo() { for (const d of this.NewData) this.Notes.Sorted[d.Index].Type = d.NewType; }
	TryMerge(commandToMerge: Command): MergeResult
	{
		const other = commandToMerge as ChangeMultipleNoteTypes;
		if (other.Notes !== this.Notes) return MergeResult.Failed;
		if (other.NewData.length !== this.NewData.length) return MergeResult.Failed;
		for (let i = 0; i < this.NewData.length; i++)
			if (this.NewData[i].Index !== other.NewData[i].Index) return MergeResult.Failed;
		for (let i = 0; i < this.NewData.length; i++)
			this.NewData[i].NewType = other.NewData[i].NewType;
		return MergeResult.ValueUpdated;
	}
	GetInfo(): CommandInfo { return { Description: "Change Note Types" }; }
}

export class ChangeMultipleNoteTypes_FlipTypes extends ChangeMultipleNoteTypes { GetInfo(): CommandInfo { return { Description: "Flip Notes" }; } }
export class ChangeMultipleNoteTypes_ToggleSizes extends ChangeMultipleNoteTypes { GetInfo(): CommandInfo { return { Description: "Toggle Note Sizes" }; } }

export interface ChangeMultipleNoteBeatsData { Index: number; NewBeat: Beat; OldBeat?: Beat; }
export class ChangeMultipleNoteBeats extends Command
{
	NewData: Required<ChangeMultipleNoteBeatsData>[];
	constructor(public Notes: SortedNotesList, data: ChangeMultipleNoteBeatsData[]) { super(); this.NewData = data.map((d) => ({ Index: d.Index, NewBeat: d.NewBeat, OldBeat: Notes.Sorted[d.Index].BeatTime })); }
	// TODO: Assert sorted (?)
	Undo() { for (const d of this.NewData) this.Notes.Sorted[d.Index].BeatTime = d.OldBeat; }
	Redo() { for (const d of this.NewData) this.Notes.Sorted[d.Index].BeatTime = d.NewBeat; }
	TryMerge(commandToMerge: Command): MergeResult
	{
		const other = commandToMerge as ChangeMultipleNoteBeats;
		if (other.Notes !== this.Notes) return MergeResult.Failed;
		if (other.NewData.length !== this.NewData.length) return MergeResult.Failed;
		for (let i = 0; i < this.NewData.length; i++)
			if (this.NewData[i].Index !== other.NewData[i].Index) return MergeResult.Failed;
		for (let i = 0; i < this.NewData.length; i++)
			this.NewData[i].NewBeat = other.NewData[i].NewBeat;
		return MergeResult.ValueUpdated;
	}
	GetInfo(): CommandInfo { return { Description: "Change Note Beats" }; }
}

export class ChangeMultipleNoteBeats_MoveNotes extends ChangeMultipleNoteBeats { GetInfo(): CommandInfo { return { Description: "Move Notes" }; } }

// NOTE: Generic chart commands
export class AddMultipleGenericItems extends Command
{
	NewData: GenericListStructWithType[];
	UpdateTempoMap = false;
	constructor(public Course: ChartCourse, newData: GenericListStructWithType[])
	{
		super();
		this.NewData = newData.map(CloneGenericListStructWithType);
		for (const data of this.NewData)
			if (data.List === GenericList.TempoChanges)
				this.UpdateTempoMap = true;
	}
	Undo()
	{
		for (const data of this.NewData)
			TryRemoveGenericStruct(this.Course, data.List, GetGenericListStructBeat(data));
		if (this.UpdateTempoMap)
			this.Course.TempoMap.RebuildAccelerationStructure();
	}
	Redo()
	{
		for (const data of this.NewData)
			TryAddGenericStruct(this.Course, data.List, data.Value);
		if (this.UpdateTempoMap)
			this.Course.TempoMap.RebuildAccelerationStructure();
	}
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Add Items" }; }
}

export class RemoveMultipleGenericItems extends Command
{
	OldData: GenericListStructWithType[];
	UpdateTempoMap = false;
	constructor(public Course: ChartCourse, oldData: GenericListStructWithType[])
	{
		super();
		this.OldData = oldData.map(CloneGenericListStructWithType);
		for (const data of this.OldData)
			if (data.List === GenericList.TempoChanges)
				this.UpdateTempoMap = true;
	}
	Undo()
	{
		for (const data of this.OldData)
			TryAddGenericStruct(this.Course, data.List, data.Value);
		if (this.UpdateTempoMap)
			this.Course.TempoMap.RebuildAccelerationStructure();
	}
	Redo()
	{
		for (const data of this.OldData)
			TryRemoveGenericStruct(this.Course, data.List, GetGenericListStructBeat(data));
		if (this.UpdateTempoMap)
			this.Course.TempoMap.RebuildAccelerationStructure();
	}
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Remove Items" }; }
}

export class AddMultipleGenericItems_Paste extends AddMultipleGenericItems { GetInfo(): CommandInfo { return { Description: "Paste Items" }; } }
export class RemoveMultipleGenericItems_Cut extends RemoveMultipleGenericItems { GetInfo(): CommandInfo { return { Description: "Cut Items" }; } }

export interface ChangeMultipleGenericPropertiesData
{
	Index: number;
	List: GenericList;
	Member: GenericMember;
	NewValue: GenericMemberValue;
	OldValue?: GenericMemberValue;
}

export class ChangeMultipleGenericProperties extends Command
{
	NewData: Required<ChangeMultipleGenericPropertiesData>[];
	UpdateTempoMap = false;
	constructor(public Course: ChartCourse, newData: ChangeMultipleGenericPropertiesData[])
	{
		super();
		this.NewData = newData.map((data) =>
		{
			const oldValue = TryGetGeneric(Course, data.List, data.Index, data.Member);
			if (data.List === GenericList.TempoChanges)
				this.UpdateTempoMap = true;
			return { Index: data.Index, List: data.List, Member: data.Member, NewValue: CloneGenericMemberValue(data.Member, data.NewValue), OldValue: oldValue! };
		});
	}
	Undo()
	{
		for (const d of this.NewData)
			TrySetGeneric(this.Course, d.List, d.Index, d.Member, d.OldValue);
		if (this.UpdateTempoMap)
			this.Course.TempoMap.RebuildAccelerationStructure();
	}
	Redo()
	{
		for (const d of this.NewData)
			TrySetGeneric(this.Course, d.List, d.Index, d.Member, d.NewValue);
		if (this.UpdateTempoMap)
			this.Course.TempoMap.RebuildAccelerationStructure();
	}
	TryMerge(commandToMerge: Command): MergeResult
	{
		const other = commandToMerge as ChangeMultipleGenericProperties;
		if (other.Course !== this.Course) return MergeResult.Failed;
		if (other.NewData.length !== this.NewData.length) return MergeResult.Failed;
		for (let i = 0; i < this.NewData.length; i++)
		{
			const data = this.NewData[i], otherData = other.NewData[i];
			if (data.Index !== otherData.Index || data.List !== otherData.List || data.Member !== otherData.Member)
				return MergeResult.Failed;
		}
		for (let i = 0; i < this.NewData.length; i++)
			this.NewData[i].NewValue = other.NewData[i].NewValue;
		return MergeResult.ValueUpdated;
	}
	GetInfo(): CommandInfo { return { Description: "Change Properties" }; }
}

export class ChangeMultipleGenericProperties_MoveItems extends ChangeMultipleGenericProperties { GetInfo(): CommandInfo { return { Description: "Move Items" }; } }

export class RemoveThenAddMultipleGenericItems extends Command
{
	RemoveCommand: RemoveMultipleGenericItems;
	AddCommand: AddMultipleGenericItems;
	constructor(course: ChartCourse, removeData: GenericListStructWithType[], addData: GenericListStructWithType[])
	{
		super();
		this.RemoveCommand = new RemoveMultipleGenericItems(course, removeData);
		this.AddCommand = new AddMultipleGenericItems(course, addData);
	}
	Undo() { this.AddCommand.Undo(); this.RemoveCommand.Undo(); }
	Redo() { this.RemoveCommand.Redo(); this.AddCommand.Redo(); }
	TryMerge(): MergeResult { return MergeResult.Failed; }
	GetInfo(): CommandInfo { return { Description: "Remove and Add Items" }; }
}

export class RemoveThenAddMultipleGenericItems_ExpandItems extends RemoveThenAddMultipleGenericItems { GetInfo(): CommandInfo { return { Description: "Expand Items" }; } }
export class RemoveThenAddMultipleGenericItems_CompressItems extends RemoveThenAddMultipleGenericItems { GetInfo(): CommandInfo { return { Description: "Compress Items" }; } }
