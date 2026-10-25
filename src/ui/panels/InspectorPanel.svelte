<script lang="ts">
	// NOTE: Port of "ChartInspectorWindow::DrawGui()" (peepo_drum_kit/chart_editor_widgets.cpp)
	import { editor, Track, Invalidate } from "../state.svelte";
	import { UI_Str } from "../../editor/i18n";
	import { Settings } from "../../editor/settings";
	import
	{
		type GenericMemberFlags, type AllGenericMembersArray, type Tempo, type TimeSignature, GenericList, GenericMember, NoteType,
		GenericMemberFlags_None, GenericMemberFlags_All, EnumToFlag, ForEachSelectedChartItem, GetAvailableMemberFlags, TryGetGeneric, TrySetGeneric,
		MakeAllGenericMembersArray, GenericMemberValuesEqual, CloneGenericMemberValue, TempoOrDefault, ScrollSpeedToTempo, ScrollTempoToSpeed,
		IsBalloonNote, IsRegularNote, IsDrumrollNote, IsLongNote, IsSmallNote, IsBigNote, ToBigNote, ToSmallNote, TimeSpace, ConvertTimeSpace,
	} from "../../editor/chart";
	import { BeatSortedForwardIterator, type TempoChange, IsTimeSignatureSupported, Tempo as MakeTempo, OriginalTicksPerBeat } from "../../core/beat";
	import { Clamp, TimeToString, TimeToMS, TimeFromMS, FormatG, ApproxmiatelySame, ConvertRange, type Time } from "../../core/types";
	import * as Commands from "../../editor/undo-commands";
	import Section from "../widgets/Section.svelte";
	import PropertyTable from "../widgets/PropertyTable.svelte";
	import DragNumber from "../widgets/DragNumber.svelte";

	const MinTimeSignatureValue = 1, MaxTimeSignatureValue = OriginalTicksPerBeat * 4;
	const MinBalloonCount = 0, MaxBalloonCount = 999;
	const MinBPM = 30.0, MaxBPM = 960.0;
	const MinScrollSpeed = -100.0, MaxScrollSpeed = +100.0;
	const MinNoteTimeOffset = TimeFromMS(-35.0), MaxNoteTimeOffset = TimeFromMS(+35.0);

	interface TempChartItem { List: GenericList; Index: number; AvailableMembers: GenericMemberFlags; MemberValues: AllGenericMembersArray; BaseScrollTempo: Tempo; }

	const context = editor.context;
	const has = (flags: number, member: GenericMember) => (flags & EnumToFlag(member)) !== 0;

	function GatherSelectedItems(): TempChartItem[]
	{
		const course = context.ChartSelectedCourse;
		const out: TempChartItem[] = [];
		const scrollTempoChangeIt = new BeatSortedForwardIterator<TempoChange>();
		ForEachSelectedChartItem(course, (it) =>
		{
			const item: TempChartItem = { List: it.List, Index: it.Index, AvailableMembers: GetAvailableMemberFlags(it.List), MemberValues: MakeAllGenericMembersArray(), BaseScrollTempo: MakeTempo(0.0) };
			for (let member = 0; member < GenericMember.Count; member++)
			{
				if (has(item.AvailableMembers, member))
					item.MemberValues[member] = TryGetGeneric(course, it.List, it.Index, member)!;
			}
			if (it.List === GenericList.ScrollChanges)
				item.BaseScrollTempo = TempoOrDefault(scrollTempoChangeIt.Next(course.TempoMap.Tempo.Sorted, item.MemberValues[GenericMember.Beat_Start] as number));
			out.push(item);
		});
		return out;
	}

	const data = $derived.by(() =>
	{
		Track();
		const selectedItems = GatherSelectedItems();

		let commonAvailableMemberFlags = (selectedItems.length === 0) ? GenericMemberFlags_None : GenericMemberFlags_All;
		let commonListType = (selectedItems.length === 0) ? GenericList.Count : selectedItems[0].List;
		const perListSelectionCounts = new Array(GenericList.Count).fill(0);
		for (const item of selectedItems)
		{
			commonAvailableMemberFlags &= item.AvailableMembers;
			perListSelectionCounts[item.List]++;
			if (item.List !== commonListType)
				commonListType = GenericList.Count;
		}

		let commonEqualMemberFlags = commonAvailableMemberFlags;
		const sharedValues = MakeAllGenericMembersArray(), mixedValuesMin = MakeAllGenericMembersArray(), mixedValuesMax = MakeAllGenericMembersArray();
		if (selectedItems.length > 0)
		{
			for (let member = 0; member < GenericMember.Count; member++)
			{
				sharedValues[member] = CloneGenericMemberValue(member, selectedItems[0].MemberValues[member]);
				mixedValuesMin[member] = CloneGenericMemberValue(member, sharedValues[member]);
				mixedValuesMax[member] = CloneGenericMemberValue(member, sharedValues[member]);
			}

			for (const item of selectedItems)
			{
				for (let member = 0; member < GenericMember.Count; member++)
				{
					if (has(commonAvailableMemberFlags, member) && !GenericMemberValuesEqual(member, item.MemberValues[member], sharedValues[member]))
						commonEqualMemberFlags &= ~EnumToFlag(member);

					const v = item.MemberValues[member];
					switch (member)
					{
						case GenericMember.I16_BalloonPopCount:
						case GenericMember.F32_ScrollSpeed:
						case GenericMember.Beat_Start:
						case GenericMember.Beat_Duration:
						case GenericMember.Time_Offset:
						case GenericMember.NoteType_V:
							mixedValuesMin[member] = Math.min(mixedValuesMin[member] as number, v as number);
							mixedValuesMax[member] = Math.max(mixedValuesMax[member] as number, v as number);
							break;
						case GenericMember.Tempo_V:
							mixedValuesMin[member] = { BPM: Math.min((mixedValuesMin[member] as Tempo).BPM, (v as Tempo).BPM) };
							mixedValuesMax[member] = { BPM: Math.max((mixedValuesMax[member] as Tempo).BPM, (v as Tempo).BPM) };
							break;
						case GenericMember.TimeSignature_V:
						{
							const mn = mixedValuesMin[member] as TimeSignature, mx = mixedValuesMax[member] as TimeSignature, s = v as TimeSignature;
							mixedValuesMin[member] = { Numerator: Math.min(mn.Numerator, s.Numerator), Denominator: Math.min(mn.Denominator, s.Denominator) };
							mixedValuesMax[member] = { Numerator: Math.max(mx.Numerator, s.Numerator), Denominator: Math.max(mx.Denominator, s.Denominator) };
						} break;
					}
				}
			}
		}

		return { selectedItems, commonAvailableMemberFlags, commonListType, perListSelectionCounts, commonEqualMemberFlags, sharedValues, mixedValuesMin, mixedValuesMax };
	});

	const listTypeNames = $derived.by(() => { Track(); return [UI_Str("Tempos"), UI_Str("Time Signatures"), UI_Str("Notes"), UI_Str("Notes"), UI_Str("Notes"), UI_Str("Scroll Speeds"), UI_Str("Bar Lines"), UI_Str("Go-Go Ranges"), UI_Str("Lyrics")]; });
	const noteTypeNames = $derived.by(() => { Track(); return [UI_Str("Don"), UI_Str("DON"), UI_Str("Ka"), UI_Str("KA"), UI_Str("Drumroll"), UI_Str("DRUMROLL"), UI_Str("Balloon"), UI_Str("BALLOON")]; });

	const isEqual = (member: GenericMember) => has(data.commonEqualMemberFlags, member);
	const isAvailable = (member: GenericMember) => has(data.commonAvailableMemberFlags, member);

	/** NOTE: Equivalent of the "outModifiedMembers" handling at the end of the original function */
	function ApplyChange(modifiedMember: GenericMember, mutate: (item: TempChartItem) => void, disableMerge: boolean = false): void
	{
		const selectedItems = GatherSelectedItems();
		for (const item of selectedItems) mutate(item);

		const propertiesToChange: Commands.ChangeMultipleGenericPropertiesData[] = selectedItems.map((item) => ({ Index: item.Index, List: item.List, Member: modifiedMember, NewValue: item.MemberValues[modifiedMember] }));
		if (propertiesToChange.length === 0)
			return;

		if (disableMerge)
			context.Undo.DisallowMergeForLastCommand();
		context.Undo.Execute(new Commands.ChangeMultipleGenericProperties(context.ChartSelectedCourse, propertiesToChange));
		Invalidate();
	}

	function RefineSelection(list: GenericList): void
	{
		const course = context.ChartSelectedCourse;
		for (const item of data.selectedItems)
			if (item.List !== list)
				TrySetGeneric(course, item.List, item.Index, GenericMember.B8_IsSelected, false);
		Invalidate();
	}

	const timeRangeText = $derived.by(() =>
	{
		const displaySpace = Settings.General.DisplayTimeInSongSpace ? TimeSpace.Song : TimeSpace.Chart;
		const toDisplay = (v: Time) => ConvertTimeSpace(v, TimeSpace.Chart, displaySpace, context.Chart.SongOffset);
		const minTime = toDisplay(context.BeatToTime(data.mixedValuesMin[GenericMember.Beat_Start] as number));
		const maxTime = toDisplay(context.BeatToTime(data.mixedValuesMax[GenericMember.Beat_Start] as number));
		return (data.selectedItems.length === 1) ? TimeToString(minTime) : `(${TimeToString(minTime)} ... ${TimeToString(maxTime)})`;
	});

	const selectedListLabel = $derived.by(() =>
	{
		let name = (data.commonListType < GenericList.Count) ? listTypeNames[data.commonListType] : UI_Str("Items");
		if (data.selectedItems.length === 1 && name.endsWith("s"))
			name = name.substring(0, name.length - 1);
		return `${UI_Str("Selected ")}${name}: ${data.selectedItems.length}`;
	});

	// NOTE: Scroll speed related values
	const scroll = $derived.by(() =>
	{
		const items = data.selectedItems;
		let areAllScrollTemposTheSame = true;
		let commonScrollTempo = 0.0, minScrollTempo = 0.0, maxScrollTempo = 0.0;
		items.forEach((item, i) =>
		{
			const scrollTempo = ScrollSpeedToTempo(item.MemberValues[GenericMember.F32_ScrollSpeed] as number, item.BaseScrollTempo).BPM;
			if (i === 0) { commonScrollTempo = minScrollTempo = maxScrollTempo = scrollTempo; }
			else
			{
				minScrollTempo = Math.min(minScrollTempo, scrollTempo);
				maxScrollTempo = Math.max(maxScrollTempo, scrollTempo);
				areAllScrollTemposTheSame = areAllScrollTemposTheSame && ApproxmiatelySame(scrollTempo, commonScrollTempo, 0.001);
			}
		});
		return { areAllScrollSpeedsTheSame: isEqual(GenericMember.F32_ScrollSpeed), areAllScrollTemposTheSame, commonScrollTempo, minScrollTempo, maxScrollTempo };
	});

	// TODO: Maybe option to switch between Beat/Time interpolation modes (?)
	const getT = (item: TempChartItem) => item.MemberValues[GenericMember.Beat_Start] as number;
	const getInterpolated = (startItem: TempChartItem, endItem: TempChartItem, thisItem: TempChartItem, startValue: number, endValue: number) =>
		(getT(startItem) === getT(endItem)) ? startValue : ConvertRange(getT(startItem), getT(endItem), startValue, endValue, getT(thisItem));

	function interpolationState(isTempo: boolean)
	{
		const items = data.selectedItems;
		const startItem = items[0], endItem = items[items.length - 1];
		const startEnd = [
			isTempo ? ScrollSpeedToTempo(startItem.MemberValues[GenericMember.F32_ScrollSpeed] as number, startItem.BaseScrollTempo).BPM : startItem.MemberValues[GenericMember.F32_ScrollSpeed] as number,
			isTempo ? ScrollSpeedToTempo(endItem.MemberValues[GenericMember.F32_ScrollSpeed] as number, endItem.BaseScrollTempo).BPM : endItem.MemberValues[GenericMember.F32_ScrollSpeed] as number,
		];
		const isSelectionTooSmall = (items.length < 2);
		let isSelectionAlreadyInterpolated = true;
		if (!isSelectionTooSmall)
		{
			for (const thisItem of items)
			{
				const thisValue = getInterpolated(startItem, endItem, thisItem, startEnd[0], startEnd[1]);
				if (!ApproxmiatelySame(thisItem.MemberValues[GenericMember.F32_ScrollSpeed] as number, isTempo ? ScrollTempoToSpeed(MakeTempo(thisValue), thisItem.BaseScrollTempo) : thisValue))
					isSelectionAlreadyInterpolated = false;
			}
		}

		// NOTE: Invalid selection		-> "..." dummied out
		//		 All the same			-> "=" marker
		//		 Mixed values			-> "()" values
		//		 Already interpolated	-> regular values
		const fmt = (v: number) => isTempo ? `${FormatG(v)} BPM` : `${FormatG(v)}x`;
		let previews: [string | null, string | null] = [null, null];
		if (isSelectionTooSmall) previews = ["...", "..."];
		else if (isTempo ? scroll.areAllScrollTemposTheSame : scroll.areAllScrollSpeedsTheSame) previews = [null, "="];
		else if (!isSelectionAlreadyInterpolated) previews = [`(${fmt(startEnd[0])})`, `(${fmt(startEnd[1])})`];
		return { startEnd, isSelectionTooSmall, previews, fmt };
	}

	function applyInterpolation(isTempo: boolean, component: number, value: number)
	{
		const state = interpolationState(isTempo);
		const startEnd = [...state.startEnd];
		startEnd[component] = isTempo ? Clamp(value, MinBPM, MaxBPM) : Clamp(value, MinScrollSpeed, MaxScrollSpeed);
		const items = GatherSelectedItems();
		const startItem = items[0], endItem = items[items.length - 1];
		ApplyChange(GenericMember.F32_ScrollSpeed, (thisItem) =>
		{
			const thisValue = getInterpolated(startItem, endItem, thisItem, startEnd[0], startEnd[1]);
			thisItem.MemberValues[GenericMember.F32_ScrollSpeed] = isTempo ? ScrollTempoToSpeed(MakeTempo(thisValue), thisItem.BaseScrollTempo) : thisValue;
		});
	}

	// NOTE: Note type related values
	const notes = $derived.by(() =>
	{
		let isAnyRegularNoteSelected = false, isAnyDrumrollNoteSelected = false, isAnyBalloonNoteSelected = false;
		let areAllSelectedNotesSmall = true, areAllSelectedNotesBig = true;
		const perNoteTypeHasAtLeastOneSelected = new Array(NoteType.Count).fill(false);
		for (const item of data.selectedItems)
		{
			const noteType = item.MemberValues[GenericMember.NoteType_V] as NoteType;
			isAnyRegularNoteSelected ||= IsRegularNote(noteType);
			isAnyDrumrollNoteSelected ||= IsDrumrollNote(noteType);
			isAnyBalloonNoteSelected ||= IsBalloonNote(noteType);
			areAllSelectedNotesSmall &&= IsSmallNote(noteType);
			areAllSelectedNotesBig &&= IsBigNote(noteType);
			perNoteTypeHasAtLeastOneSelected[noteType] = true;
		}
		const isSingleNoteType = isEqual(GenericMember.NoteType_V);
		const names = noteTypeNames.filter((_, i) => perNoteTypeHasAtLeastOneSelected[i]).join(", ");
		return { isAnyRegularNoteSelected, isAnyDrumrollNoteSelected, isAnyBalloonNoteSelected, areAllSelectedNotesSmall, areAllSelectedNotesBig, perNoteTypeHasAtLeastOneSelected, preview: isSingleNoteType ? names : `(${names})`, isSingleNoteType };
	});

	let noteTypeComboOpen = $state(false);
	const isAnyTimeSignatureInvalid = $derived(data.selectedItems.some((item) => item.List === GenericList.SignatureChanges && !IsTimeSignatureSupported(item.MemberValues[GenericMember.TimeSignature_V] as TimeSignature)));
</script>

<div class="panel-scroll">
	<Section title={UI_Str("Selected Items")}>
		{#if data.selectedItems.length === 0}
			<div class="nothing-selected">{UI_Str("( Nothing Selected )")}</div>
		{:else}
			<PropertyTable>
				<div class="prop-label">{selectedListLabel}</div>
				<div class="prop-value"><span class="dim">{timeRangeText}</span></div>

				{#if data.commonListType >= GenericList.Count}
					<div class="prop-label">{UI_Str("Refine Selection")}</div>
					<div class="prop-value">
						{#each data.perListSelectionCounts as count, list}
							{#if count > 0}
								<button class="refine" onclick={() => RefineSelection(list)}>
									[ {listTypeNames[list]} ]  x{count}{list === GenericList.Notes_Master ? " (Master)" : list === GenericList.Notes_Expert ? " (Expert)" : ""}
								</button>
							{/if}
						{/each}
					</div>
				{/if}

				{#if isAvailable(GenericMember.NoteType_V)}
					<div class="prop-label">{UI_Str("Note Type")}</div>
					<div class="prop-value">
						<div class="combo">
							<button class="combo-button" class:dim={!notes.isSingleNoteType} onclick={() => (noteTypeComboOpen = !noteTypeComboOpen)}>{notes.preview}<span>▾</span></button>
							{#if noteTypeComboOpen}
								<div class="combo-list">
									{#each noteTypeNames as name, i}
										{@const isEnabled = (IsRegularNote(i) && notes.isAnyRegularNoteSelected) || (IsDrumrollNote(i) && notes.isAnyDrumrollNoteSelected) || (IsBalloonNote(i) && notes.isAnyBalloonNoteSelected)}
										<button class="combo-item" class:selected={notes.perNoteTypeHasAtLeastOneSelected[i]} disabled={!isEnabled}
											onclick={() =>
											{
												noteTypeComboOpen = false;
												// NOTE: Don't allow changing long notes and balloons for now at that would also require updating BeatDuration / BalloonPopCount
												ApplyChange(GenericMember.NoteType_V, (item) =>
												{
													const t = item.MemberValues[GenericMember.NoteType_V] as NoteType;
													if (IsLongNote(i) === IsLongNote(t) && IsBalloonNote(i) === IsBalloonNote(t))
														item.MemberValues[GenericMember.NoteType_V] = i;
												}, true);
											}}>{name}</button>
									{/each}
								</div>
							{/if}
						</div>
					</div>

					<div class="prop-label">{UI_Str("Note Type Size")}</div>
					<div class="prop-value">
						<select value={(!notes.areAllSelectedNotesSmall && !notes.areAllSelectedNotesBig) ? "" : notes.areAllSelectedNotesBig ? "big" : "small"}
							onchange={(e) =>
							{
								const v = e.currentTarget.value;
								ApplyChange(GenericMember.NoteType_V, (item) =>
								{
									const t = item.MemberValues[GenericMember.NoteType_V] as NoteType;
									item.MemberValues[GenericMember.NoteType_V] = (v === "big") ? ToBigNote(t) : (v === "small") ? ToSmallNote(t) : t;
								}, true);
							}}>
							<option value="" disabled hidden></option>
							<option value="small">{UI_Str("Small")}</option>
							<option value="big">{UI_Str("Big")}</option>
						</select>
					</div>
				{/if}

				{#if isAvailable(GenericMember.I16_BalloonPopCount)}
					<div class="prop-label">
						<DragNumber labelOnly label={UI_Str("Balloon Pop Count")} value={data.sharedValues[GenericMember.I16_BalloonPopCount] as number} integer dragSpeed={0.05} disabled={!notes.isAnyBalloonNoteSelected}
							onincrement={(d) => ApplyChange(GenericMember.I16_BalloonPopCount, (item) => { if (IsBalloonNote(item.MemberValues[GenericMember.NoteType_V] as NoteType)) item.MemberValues[GenericMember.I16_BalloonPopCount] = Clamp(Math.trunc((item.MemberValues[GenericMember.I16_BalloonPopCount] as number) + d), MinBalloonCount, MaxBalloonCount); })} />
					</div>
					<div class="prop-value">
						<DragNumber value={data.sharedValues[GenericMember.I16_BalloonPopCount] as number} integer step={1} stepFast={4} disabled={!notes.isAnyBalloonNoteSelected}
							mixedPreview={isEqual(GenericMember.I16_BalloonPopCount) ? null : `(${data.mixedValuesMin[GenericMember.I16_BalloonPopCount]} ... ${data.mixedValuesMax[GenericMember.I16_BalloonPopCount]})`}
							onexact={(v) => ApplyChange(GenericMember.I16_BalloonPopCount, (item) => { if (IsBalloonNote(item.MemberValues[GenericMember.NoteType_V] as NoteType)) item.MemberValues[GenericMember.I16_BalloonPopCount] = Clamp(Math.trunc(v), MinBalloonCount, MaxBalloonCount); })}
							onincrement={(d) => ApplyChange(GenericMember.I16_BalloonPopCount, (item) => { if (IsBalloonNote(item.MemberValues[GenericMember.NoteType_V] as NoteType)) item.MemberValues[GenericMember.I16_BalloonPopCount] = Clamp(Math.trunc((item.MemberValues[GenericMember.I16_BalloonPopCount] as number) + d), MinBalloonCount, MaxBalloonCount); })} />
					</div>
				{/if}

				{#if isAvailable(GenericMember.Time_Offset)}
					{@const applyOffset = (mutate: (v: number) => number) => ApplyChange(GenericMember.Time_Offset, (item) => { let v = Clamp(mutate(item.MemberValues[GenericMember.Time_Offset] as number), MinNoteTimeOffset, MaxNoteTimeOffset); if (ApproxmiatelySame(v, 0.0)) v = 0.0; item.MemberValues[GenericMember.Time_Offset] = v; })}
					<div class="prop-label">
						<DragNumber labelOnly label={UI_Str("Time Offset")} value={TimeToMS(data.sharedValues[GenericMember.Time_Offset] as number)} dragSpeed={1.0}
							onincrement={(d) => applyOffset((v) => v + TimeFromMS(d))} />
					</div>
					<div class="prop-value">
						<DragNumber value={TimeToMS(data.sharedValues[GenericMember.Time_Offset] as number)} step={1.0} stepFast={5.0} format={(v) => `${FormatG(v)} ms`}
							mixedPreview={isEqual(GenericMember.Time_Offset) ? null : `(${FormatG(TimeToMS(data.mixedValuesMin[GenericMember.Time_Offset] as number))} ms ... ${FormatG(TimeToMS(data.mixedValuesMax[GenericMember.Time_Offset] as number))} ms)`}
							onexact={(v) => applyOffset(() => TimeFromMS(v))} onincrement={(d) => applyOffset((v) => v + TimeFromMS(d))} />
					</div>
				{/if}

				{#if isAvailable(GenericMember.Tempo_V)}
					{@const applyTempo = (mutate: (bpm: number) => number) => ApplyChange(GenericMember.Tempo_V, (item) => { item.MemberValues[GenericMember.Tempo_V] = { BPM: mutate((item.MemberValues[GenericMember.Tempo_V] as Tempo).BPM) }; })}
					<div class="prop-label">
						<DragNumber labelOnly label={UI_Str("Tempo")} value={(data.sharedValues[GenericMember.Tempo_V] as Tempo).BPM} dragSpeed={1.0} onincrement={(d) => applyTempo((bpm) => Clamp(bpm + d, MinBPM, MaxBPM))} />
					</div>
					<div class="prop-value">
						<DragNumber value={(data.sharedValues[GenericMember.Tempo_V] as Tempo).BPM} step={1.0} stepFast={10.0} format={(v) => `${FormatG(v)} BPM`} clamp min={MinBPM} max={MaxBPM}
							mixedPreview={isEqual(GenericMember.Tempo_V) ? null : `(${FormatG((data.mixedValuesMin[GenericMember.Tempo_V] as Tempo).BPM)} BPM ... ${FormatG((data.mixedValuesMax[GenericMember.Tempo_V] as Tempo).BPM)} BPM)`}
							onexact={(v) => applyTempo(() => v)} onincrement={(d) => applyTempo((bpm) => Clamp(bpm + d, MinBPM, MaxBPM))} />
					</div>
				{/if}

				{#if isAvailable(GenericMember.TimeSignature_V)}
					{@const sig = data.sharedValues[GenericMember.TimeSignature_V] as TimeSignature}
					{@const mn = data.mixedValuesMin[GenericMember.TimeSignature_V] as TimeSignature}
					{@const mx = data.mixedValuesMax[GenericMember.TimeSignature_V] as TimeSignature}
					{@const applySig = (component: 0 | 1, mutate: (v: number) => number) => ApplyChange(GenericMember.TimeSignature_V, (item) => { const s = { ...(item.MemberValues[GenericMember.TimeSignature_V] as TimeSignature) }; if (component === 0) s.Numerator = mutate(s.Numerator); else s.Denominator = mutate(s.Denominator); item.MemberValues[GenericMember.TimeSignature_V] = s; })}
					<div class="prop-label">{UI_Str("Time Signature")}</div>
					<div class="prop-value">
						<div class="fraction">
							<DragNumber value={sig.Numerator} integer step={1} stepFast={4} warning={isAnyTimeSignatureInvalid} mixedPreview={(mn.Numerator !== mx.Numerator) ? `(${mn.Numerator} ... ${mx.Numerator})` : null}
								onexact={(v) => applySig(0, () => Clamp(v, MinTimeSignatureValue, MaxTimeSignatureValue))} onincrement={(d) => applySig(0, (v) => Clamp(v + d, MinTimeSignatureValue, MaxTimeSignatureValue))} />
							<span>/</span>
							<DragNumber value={sig.Denominator} integer step={1} stepFast={4} warning={isAnyTimeSignatureInvalid} mixedPreview={(mn.Denominator !== mx.Denominator) ? `(${mn.Denominator} ... ${mx.Denominator})` : null}
								onexact={(v) => applySig(1, () => Clamp(v, MinTimeSignatureValue, MaxTimeSignatureValue))} onincrement={(d) => applySig(1, (v) => Clamp(v + d, MinTimeSignatureValue, MaxTimeSignatureValue))} />
						</div>
					</div>
				{/if}

				{#if isAvailable(GenericMember.F32_ScrollSpeed)}
					{@const applySpeed = (mutate: (item: TempChartItem, speed: number) => number) => ApplyChange(GenericMember.F32_ScrollSpeed, (item) => { item.MemberValues[GenericMember.F32_ScrollSpeed] = mutate(item, item.MemberValues[GenericMember.F32_ScrollSpeed] as number); })}
					<div class="prop-label">
						<DragNumber labelOnly label={UI_Str("Scroll Speed")} value={data.sharedValues[GenericMember.F32_ScrollSpeed] as number} dragSpeed={0.005}
							onincrement={(d) => applySpeed((_, s) => Clamp(s + d, MinScrollSpeed, MaxScrollSpeed))} />
					</div>
					<div class="prop-value">
						<DragNumber value={data.sharedValues[GenericMember.F32_ScrollSpeed] as number} step={0.1} stepFast={0.5} format={(v) => `${FormatG(v)}x`} clamp min={MinScrollSpeed} max={MaxScrollSpeed}
							mixedPreview={scroll.areAllScrollSpeedsTheSame ? null : `(${FormatG(data.mixedValuesMin[GenericMember.F32_ScrollSpeed] as number)}x ... ${FormatG(data.mixedValuesMax[GenericMember.F32_ScrollSpeed] as number)}x)`}
							onexact={(v) => applySpeed(() => v)} onincrement={(d) => applySpeed((_, s) => Clamp(s + d, MinScrollSpeed, MaxScrollSpeed))} />
					</div>

					<div class="prop-label">
						<DragNumber labelOnly label={UI_Str("Scroll Speed Tempo")} value={scroll.commonScrollTempo} dragSpeed={1.0}
							onincrement={(d) => applySpeed((item, s) => (item.BaseScrollTempo.BPM !== 0.0) ? ScrollTempoToSpeed(MakeTempo(Clamp(ScrollSpeedToTempo(s, item.BaseScrollTempo).BPM + d, MinBPM, MaxBPM)), item.BaseScrollTempo) : s)} />
					</div>
					<div class="prop-value">
						<DragNumber value={scroll.commonScrollTempo} step={1.0} stepFast={10.0} format={(v) => `${FormatG(v)} BPM`} clamp min={MinBPM} max={MaxBPM}
							mixedPreview={scroll.areAllScrollTemposTheSame ? null : `(${FormatG(scroll.minScrollTempo)} BPM ... ${FormatG(scroll.maxScrollTempo)} BPM)`}
							onexact={(v) => applySpeed((item) => ScrollTempoToSpeed(MakeTempo(v), item.BaseScrollTempo))}
							onincrement={(d) => applySpeed((item, s) => (item.BaseScrollTempo.BPM !== 0.0) ? ScrollTempoToSpeed(MakeTempo(Clamp(ScrollSpeedToTempo(s, item.BaseScrollTempo).BPM + d, MinBPM, MaxBPM)), item.BaseScrollTempo) : s)} />
					</div>

					{#each [false, true] as isTempo}
						{@const state = interpolationState(isTempo)}
						<div class="prop-label">{UI_Str(isTempo ? "Interpolate: Scroll Speed Tempo" : "Interpolate: Scroll Speed")}</div>
						<div class="prop-value">
							<div class="fraction" class:disabled-block={state.isSelectionTooSmall}>
								<DragNumber value={state.startEnd[0]} step={isTempo ? 1.0 : 0.1} stepFast={isTempo ? 10.0 : 0.5} format={state.fmt} mixedPreview={state.previews[0]} onexact={(v) => applyInterpolation(isTempo, 0, v)} />
								<span>→</span>
								<DragNumber value={state.startEnd[1]} step={isTempo ? 1.0 : 0.1} stepFast={isTempo ? 10.0 : 0.5} format={state.fmt} mixedPreview={state.previews[1]} onexact={(v) => applyInterpolation(isTempo, 1, v)} />
							</div>
						</div>
					{/each}
				{/if}

				{#if isAvailable(GenericMember.B8_BarLineVisible)}
					<div class="prop-label">{UI_Str("Bar Line Visible")}</div>
					<div class="prop-value">
						<select value={!isEqual(GenericMember.B8_BarLineVisible) ? "" : (data.sharedValues[GenericMember.B8_BarLineVisible] ? "visible" : "hidden")}
							onchange={(e) => { const v = e.currentTarget.value; ApplyChange(GenericMember.B8_BarLineVisible, (item) => { item.MemberValues[GenericMember.B8_BarLineVisible] = (v === "visible"); }, true); }}>
							<option value="" disabled hidden></option>
							<option value="visible">{UI_Str("Visible")}</option>
							<option value="hidden">{UI_Str("Hidden")}</option>
						</select>
					</div>
				{/if}
			</PropertyTable>
		{/if}
	</Section>
</div>

<style>
	.nothing-selected { text-align: center; color: var(--text-dim); font-size: 1.2em; padding: 16px 0; }
	.dim { color: var(--text-dim); }
	.refine { text-align: left; background: var(--frame); }
	.fraction { display: grid; grid-template-columns: 1fr auto 1fr; gap: 4px; align-items: center; }
	.disabled-block { opacity: 0.5; pointer-events: none; }
	.combo { position: relative; }
	.combo-button { width: 100%; display: flex; justify-content: space-between; text-align: left; background: var(--frame); }
	.combo-list { position: absolute; z-index: 20; left: 0; right: 0; top: 100%; background: var(--popup); border: 1px solid var(--border); display: flex; flex-direction: column; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5); }
	.combo-item { text-align: left; border: none; border-radius: 0; background: transparent; }
	.combo-item.selected { background: var(--header); }
	.combo-item:hover:not(:disabled) { background: var(--header-hover); }
</style>
