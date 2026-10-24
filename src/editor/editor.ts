// Port of PeepoDrumKit "peepo_drum_kit/chart_editor.h" / "chart_editor.cpp"
// https://github.com/samyuu/PeepoDrumKit
//
// NOTE: The Dear ImGui menu bar / window drawing parts have been replaced by Svelte components (see "src/ui"),
//		 this class contains the (non-ui) editor logic of the original ChartEditor
import { type Time, CPUStopwatch, Clamp } from "../core/types";
import { TempoChange, TimeSignatureChange, Tempo, TimeSignature } from "../core/beat";
import * as TJA from "../formats/tja";
import { ChartProject, ChartCourse, BranchType, Language, CreateChartProjectFromTJA, ConvertChartProjectToTJA, ForEachSelectedChartItem, IsNotesList } from "./chart";
import { ChartContext } from "./context";
import { ChartTimeline, TimelineCameraBaseScrollX, GuiScaleState } from "./timeline";
import { ChartGamePreview } from "./game-preview";
import { Settings, PersistentApp, SavePersistentApp, PeepoDrumKitApplicationTitle } from "./settings";
import { Input } from "./input";
import { Engine } from "../audio/engine";
import { WaveformMipChain } from "../audio/waveform";
import type { WaveformWorkerRequest, WaveformWorkerResponse } from "../audio/waveform.worker";
import { TempoTapCalculator } from "./tempo-calculator";
import { LanguageState } from "./i18n";
import { SettingsVersion } from "./settings";
import { type BrowserChartEntry, NewBrowserChartID, PutBrowserChart, GetBrowserChart } from "./browser-storage";

export const UntitledChartFileName = "Untitled Chart.tja";
export const SupportedAudioExtensions = [".flac", ".ogg", ".mp3", ".wav", ".m4a", ".aac", ".opus", ".webm"];

const PresetGuiScaleFactors = [0.5, (2.0 / 3.0), 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
const PresetGuiScaleFactorMin = PresetGuiScaleFactors[0];
const PresetGuiScaleFactorMax = PresetGuiScaleFactors[PresetGuiScaleFactors.length - 1];

function NextPresetGuiScaleFactor(current: number, direction: number): number
{
	let closest = 0;
	PresetGuiScaleFactors.forEach((it, i) => { if (it <= current || Math.abs(it - current) < 0.0001) closest = i; });
	return PresetGuiScaleFactors[Clamp(closest + direction, 0, PresetGuiScaleFactors.length - 1)];
}

export interface AsyncImportChartResult
{
	ChartFilePath: string;
	Chart: ChartProject;
	TJA: { FileContentUTF8: string; Lines: string[]; Tokens: TJA.Token[]; Parsed: TJA.ParsedTJA; ParseErrors: TJA.ErrorList; };
}

export interface ConfirmationRequest { OnSuccess: () => void; }

const GetFileName = (path: string, includeExtension: boolean = true): string =>
{
	const name = path.substring(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
	if (includeExtension) return name;
	const dot = name.lastIndexOf(".");
	return (dot > 0) ? name.substring(0, dot) : name;
};
const HasAnyExtension = (path: string, extensions: readonly string[]): boolean => extensions.some((ext) => path.toLowerCase().endsWith(ext));
const NormalizePath = (path: string): string => path.replace(/\\/g, "/").replace(/^\.\//, "");

function SetChartDefaultSettingsAndCourses(outChart: ChartProject): void
{
	outChart.ChartCreator = Settings.General.DefaultCreatorName;
	for (const course of outChart.Courses)
	{
		course.TempoMap.Tempo.Sorted = [TempoChange(0, Tempo(160.0))];
		course.TempoMap.Signature.Sorted = [TimeSignatureChange(0, TimeSignature(4, 4))];
		course.TempoMap.RebuildAccelerationStructure();
	}
}

type FilePickerWindow = Window & {
	showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>;
	showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>;
	showDirectoryPicker?: (options?: unknown) => Promise<FileSystemDirectoryHandle>;
};

export class ChartEditor
{
	context = new ChartContext();
	timeline = new ChartTimeline();
	gamePreview = new ChartGamePreview();
	tempoCalculator = new TempoTapCalculator();

	createBackupOfOriginalTJABeforeOverwriteSave = false;
	wasAudioEngineRunningIdleOnFocusLost = false;
	loadSongStopwatch = new CPUStopwatch();
	isSongAsyncLoading = false;
	private pendingSongLoad: { Path: string; Buffer: AudioBuffer | null; WaveformL: WaveformMipChain; WaveformR: WaveformMipChain } | null = null;
	private songLoadID = 0;
	private waveformWorker: Worker | null = null;
	private waveformRequests = new Map<number, (r: WaveformWorkerResponse) => void>();

	// NOTE: Web specific state shared with the Svelte UI
	LastImportResult: AsyncImportChartResult | null = null;
	StatusMessage = "";
	StatusMessageTime = 0.0;
	PendingConfirmation: ConfirmationRequest | null = null;
	ChartDirectoryHandle: FileSystemDirectoryHandle | null = null;
	// NOTE: Web port addition, ID of the browser storage (IndexedDB) entry the current chart was opened from / saved to
	BrowserChartID: string | null = null;
	ShowHelp = PersistentApp.LastSession.ShowWindow_Help;
	ShowSettings = PersistentApp.LastSession.ShowWindow_Settings;
	ShowTJAExportView = PersistentApp.LastSession.ShowWindow_TJAExportTest;
	ShowTJAImportTest = PersistentApp.LastSession.ShowWindow_TJAImportTest;
	OnRequestOpenChartDialog: (() => void) | null = null;
	OnRequestOpenAudioDialog: (() => void) | null = null;
	OnRequestOpenFolderDialog: (() => void) | null = null;
	OnRequestFocusSettings: (() => void) | null = null;
	OnRequestFocusHelp: (() => void) | null = null;
	OnRequestBrowserStorageDialog: (() => void) | null = null;
	// NOTE: Per frame callbacks for UI components that need to poll the input state (called after the main update)
	FrameHooks = new Set<() => void>();

	constructor()
	{
		this.context.Gfx.StartAsyncLoading();
		this.context.SfxVoicePool.StartAsyncLoadingAndAddVoices();

		this.context.Chart.Courses.push(new ChartCourse());
		this.context.ChartSelectedCourse = this.context.Chart.Courses[0];
		SetChartDefaultSettingsAndCourses(this.context.Chart);

		GuiScaleState.Current = GuiScaleState.Target = PersistentApp.LastSession.GuiScale;
		Engine.SetMasterVolume(0.75);
		if (Settings.Audio.OpenDeviceOnStartup)
			Engine.OpenStartStream();
	}

	Dispose(): void
	{
		this.waveformWorker?.terminate();
		this.waveformWorker = null;
	}

	// NOTE: GUI scale ("DPI Scale" menu)
	CanZoomInGuiScale(): boolean { return GuiScaleState.Target < PresetGuiScaleFactorMax; }
	CanZoomOutGuiScale(): boolean { return GuiScaleState.Target > PresetGuiScaleFactorMin; }
	CanZoomResetGuiScale(): boolean { return GuiScaleState.Target !== 1.0; }
	ZoomInGuiScale(): void { this.SetGuiScale(NextPresetGuiScaleFactor(GuiScaleState.Target, +1)); }
	ZoomOutGuiScale(): void { this.SetGuiScale(NextPresetGuiScaleFactor(GuiScaleState.Target, -1)); }
	ZoomResetGuiScale(): void { this.SetGuiScale(1.0); }
	SetGuiScale(v: number): void { GuiScaleState.Target = v; PersistentApp.LastSession.GuiScale = v; SavePersistentApp(); }

	SetStatus(message: string): void { this.StatusMessage = message; this.StatusMessageTime = performance.now(); }

	GetWindowTitle(): string
	{
		let title = PeepoDrumKitApplicationTitle + " - ";
		title += (this.context.ChartFilePath.length > 0) ? GetFileName(this.context.ChartFilePath) : UntitledChartFileName;
		if (this.context.Undo.HasPendingChanges)
			title += "*";
		return title;
	}

	CheckOpenSaveConfirmationPopupThenCall(onSuccess: () => void): void
	{
		if (this.context.Undo.HasPendingChanges)
			this.PendingConfirmation = { OnSuccess: onSuccess };
		else
			onSuccess();
	}

	/** NOTE: Called by the confirmation popup ("Save Changes" / "Discard Changes" / "Cancel") */
	async ResolveConfirmation(choice: "save" | "discard" | "cancel"): Promise<void>
	{
		const request = this.PendingConfirmation;
		this.PendingConfirmation = null;
		if (request === null || choice === "cancel")
			return;

		const saveDialogCanceled = (choice === "save") ? !(await this.TrySaveChartOrOpenSaveAsDialog()) : false;
		if (!saveDialogCanceled)
			request.OnSuccess();
	}

	CreateNewChart(): void
	{
		const context = this.context;
		this.songLoadID++;
		this.pendingSongLoad = null;
		this.isSongAsyncLoading = false;
		this.UnloadSong();

		this.createBackupOfOriginalTJABeforeOverwriteSave = false;
		context.Chart = new ChartProject();
		context.ChartFilePath = "";
		context.ChartFileHandle = null;
		context.ChartDirectoryFiles.clear();
		this.ChartDirectoryHandle = null;
		this.BrowserChartID = null;
		context.Chart.Courses.push(new ChartCourse());
		context.ChartSelectedCourse = context.Chart.Courses[0];
		context.ChartSelectedBranch = BranchType.Normal;
		SetChartDefaultSettingsAndCourses(context.Chart);

		context.SetIsPlayback(false);
		context.SetCursorBeat(0);
		context.Undo.ClearAll();

		this.timeline.Camera.PositionTarget.x = TimelineCameraBaseScrollX;
		this.timeline.Camera.ZoomTarget = { x: 1.0, y: 1.0 };
	}

	ConvertChartToTJAText(includeBOM: boolean = true): string
	{
		const tja = TJA.MakeParsedTJA();
		ConvertChartProjectToTJA(this.context.Chart, tja);
		return TJA.ConvertParsedToText(tja, includeBOM ? TJA.Encoding.UTF8 : TJA.Encoding.Unknown);
	}

	private GetSaveFileName(): string
	{
		const context = this.context;
		if (context.ChartFilePath.length > 0) return GetFileName(context.ChartFilePath);
		if (context.Chart.ChartTitle[Language.Base].length > 0) return context.Chart.ChartTitle[Language.Base] + TJA.Extension;
		return UntitledChartFileName;
	}

	async SaveChart(handle: FileSystemFileHandle | null): Promise<boolean>
	{
		const context = this.context;
		const tjaText = this.ConvertChartToTJAText(true);

		if (handle !== null)
		{
			try
			{
				// TODO: Proper async file saving by copying in-memory
				if (this.createBackupOfOriginalTJABeforeOverwriteSave && this.ChartDirectoryHandle !== null && handle === context.ChartFileHandle)
				{
					try
					{
						const originalFile = await handle.getFile();
						const backupHandle = await this.ChartDirectoryHandle.getFileHandle(handle.name + ".bak", { create: true });
						const backupFile = await backupHandle.getFile();
						// NOTE: Never overwrite an existing backup (same as the original)
						if (backupFile.size === 0)
						{
							const writable = await backupHandle.createWritable();
							await writable.write(await originalFile.arrayBuffer());
							await writable.close();
						}
					}
					catch (e) { console.warn("Failed to create .bak backup", e); }
				}
				this.createBackupOfOriginalTJABeforeOverwriteSave = false;

				const writable = await handle.createWritable();
				await writable.write(new Blob([tjaText], { type: "text/plain;charset=utf-8" }));
				await writable.close();
				context.ChartFileHandle = handle;
				context.ChartFilePath = handle.name;
				context.Undo.ClearChangesWereMade();
				this.AddRecentFile(handle.name);
				this.SetStatus(`Saved '${handle.name}'`);
				return true;
			}
			catch (e)
			{
				console.error(e);
				this.SetStatus(`Failed to save: ${String(e)}`);
				return false;
			}
		}

		// NOTE: Fallback for browsers without the File System Access API, simply download the file
		const fileName = this.GetSaveFileName();
		DownloadTextFile(fileName, tjaText);
		context.ChartFilePath = fileName;
		context.Undo.ClearChangesWereMade();
		this.SetStatus(`Downloaded '${fileName}'`);
		return true;
	}

	async OpenChartSaveAsDialog(): Promise<boolean>
	{
		const w = window as FilePickerWindow;
		if (typeof w.showSaveFilePicker === "function")
		{
			try
			{
				const handle = await w.showSaveFilePicker({
					suggestedName: this.GetSaveFileName(),
					types: [{ description: TJA.FilterName, accept: { "text/plain": [TJA.Extension] } }],
				});
				return await this.SaveChart(handle);
			}
			catch { return false; }
		}
		return await this.SaveChart(null);
	}

	async TrySaveChartOrOpenSaveAsDialog(): Promise<boolean>
	{
		// NOTE: Charts opened from (or last saved to) the browser storage are saved back there
		if (this.context.ChartFileHandle === null && this.BrowserChartID !== null)
			return await this.SaveChartToBrowser(false);
		if (this.context.ChartFileHandle === null)
			return await this.OpenChartSaveAsDialog();
		return await this.SaveChart(this.context.ChartFileHandle);
	}

	/** NOTE: Web port addition, saves the chart (and the song file if available) into the browser storage */
	async SaveChartToBrowser(saveAsNew: boolean): Promise<boolean>
	{
		const context = this.context;
		const fileName = this.GetSaveFileName();
		try
		{
			const existing = (!saveAsNew && this.BrowserChartID !== null) ? await GetBrowserChart(this.BrowserChartID) : null;
			const songFile = await this.FindSongFile(context.Chart.SongFileName);
			// NOTE: Keep the previously stored song if it can't be found anymore (for example after reopening from the browser storage without a song folder)
			const keepExistingSong = (songFile === null && existing !== null && existing.SongFileName === context.Chart.SongFileName);
			const entry: BrowserChartEntry = {
				ID: existing?.ID ?? NewBrowserChartID(),
				FileName: fileName,
				Title: context.Chart.ChartTitle[Language.Base],
				TJAText: this.ConvertChartToTJAText(false),
				SongFileName: context.Chart.SongFileName,
				Song: (songFile !== null) ? songFile : keepExistingSong ? existing!.Song : null,
				SavedAt: Date.now(),
			};
			await PutBrowserChart(entry);
			this.BrowserChartID = entry.ID;
			context.ChartFilePath = fileName;
			context.Undo.ClearChangesWereMade();
			this.SetStatus(`Saved '${fileName}' to browser storage` + ((entry.Song === null && entry.SongFileName.length > 0) ? " (without song file)" : ""));
			return true;
		}
		catch (e)
		{
			console.error(e);
			this.SetStatus(`Failed to save to browser storage: ${String(e)}`);
			return false;
		}
	}

	/** NOTE: Web port addition, opens a chart previously saved with SaveChartToBrowser() */
	async OpenChartFromBrowser(id: string): Promise<boolean>
	{
		try
		{
			const entry = await GetBrowserChart(id);
			if (entry === null)
			{
				this.SetStatus("Chart not found in browser storage");
				return false;
			}
			const chartFile = new File([entry.TJAText], entry.FileName, { type: "text/plain" });
			const siblingFiles = (entry.Song !== null) ? [new File([entry.Song], GetFileName(entry.SongFileName) || "song", { type: entry.Song.type })] : [];
			await this.ImportChartFile(chartFile, null, siblingFiles);
			this.BrowserChartID = entry.ID;
			// NOTE: Charts saved by this editor never need a .bak backup
			this.createBackupOfOriginalTJABeforeOverwriteSave = false;
			return true;
		}
		catch (e)
		{
			console.error(e);
			this.SetStatus(`Failed to open from browser storage: ${String(e)}`);
			return false;
		}
	}

	private AddRecentFile(path: string): void
	{
		const list = PersistentApp.RecentFiles.SortedPaths.filter((p) => p !== path);
		list.unshift(path);
		PersistentApp.RecentFiles.SortedPaths = list.slice(0, PersistentApp.RecentFiles.MaxCount);
		SavePersistentApp();
	}

	ImportChartFromText(fileContentUTF8: string, chartFilePath: string): AsyncImportChartResult
	{
		const lines = TJA.SplitLines(fileContentUTF8);
		const tokens = TJA.TokenizeLines(lines);
		const parseErrors = new TJA.ErrorList();
		const parsed = TJA.ParseTokens(tokens, parseErrors);
		const chart = new ChartProject();
		if (!CreateChartProjectFromTJA(parsed, chart))
			console.error(`Failed to create chart from TJA file '${chartFilePath}'`);
		return { ChartFilePath: chartFilePath, Chart: chart, TJA: { FileContentUTF8: fileContentUTF8, Lines: lines, Tokens: tokens, Parsed: parsed, ParseErrors: parseErrors } };
	}

	/** NOTE: Equivalent of StartAsyncImportingChartFile() + the import part of InternalUpdateAsyncLoading() */
	async ImportChartFile(file: File, handle: FileSystemFileHandle | null, siblingFiles: File[] = [], directoryHandle: FileSystemDirectoryHandle | null = null): Promise<void>
	{
		const context = this.context;
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (bytes.length === 0)
		{
			this.SetStatus(`Failed to read file '${file.name}'`);
			return;
		}

		const loadResult = this.ImportChartFromText(TJA.DecodeFileBytes(bytes), file.name);
		this.LastImportResult = loadResult;
		this.AddRecentFile(file.name);

		const previousChartSongOffset = context.Chart.SongOffset;

		// TODO: Maybe also do date version check (?)
		this.createBackupOfOriginalTJABeforeOverwriteSave = !loadResult.TJA.Parsed.HasPeepoDrumKitComment;

		context.Chart = loadResult.Chart;
		context.ChartFilePath = loadResult.ChartFilePath;
		context.ChartFileHandle = handle;
		this.ChartDirectoryHandle = directoryHandle;
		this.BrowserChartID = null;
		context.ChartDirectoryFiles.clear();
		for (const sibling of siblingFiles)
			context.ChartDirectoryFiles.set(NormalizePath((sibling as File & { webkitRelativePath?: string }).webkitRelativePath || sibling.name), sibling);
		if (context.Chart.Courses.length === 0)
			context.Chart.Courses.push(new ChartCourse());
		context.ChartSelectedCourse = context.Chart.Courses[0];
		context.ChartSelectedBranch = BranchType.Normal;

		// NOTE: Prevent the cursor from changing screen position. Not needed if paused because a stable beat time is used instead
		if (context.GetIsPlayback())
			context.SetCursorTime(context.GetCursorTime() + (previousChartSongOffset - context.Chart.SongOffset));

		context.Undo.ClearAll();

		const errorCount = loadResult.TJA.ParseErrors.Errors.length;
		this.SetStatus(`Loaded '${file.name}'` + ((errorCount > 0) ? ` (${errorCount} parse warnings)` : ""));

		await this.TryLoadChartSongFromDirectory();
	}

	private async FindSongFile(songFileName: string): Promise<File | null>
	{
		const context = this.context;
		if (songFileName.length === 0)
			return null;

		const normalized = NormalizePath(songFileName);
		const baseName = GetFileName(normalized).toLowerCase();
		for (const [path, file] of context.ChartDirectoryFiles)
		{
			const p = NormalizePath(path).toLowerCase();
			if (p === normalized.toLowerCase() || p.endsWith("/" + normalized.toLowerCase()) || GetFileName(p) === baseName)
				return file;
		}

		if (this.ChartDirectoryHandle !== null)
		{
			try
			{
				let dir: FileSystemDirectoryHandle = this.ChartDirectoryHandle;
				const parts = normalized.split("/");
				for (let i = 0; i < parts.length - 1; i++)
					dir = await dir.getDirectoryHandle(parts[i]);
				const fileHandle = await dir.getFileHandle(parts[parts.length - 1]);
				return await fileHandle.getFile();
			}
			catch { /* NOTE: Not found */ }
		}
		return null;
	}

	async TryLoadChartSongFromDirectory(): Promise<void>
	{
		const songFileName = this.context.Chart.SongFileName;
		const songFile = await this.FindSongFile(songFileName);
		if (songFile !== null)
			await this.StartAsyncLoadingSongAudioFile(songFile);
		else
		{
			this.UnloadSong();
			if (songFileName.length > 0)
				this.SetStatus(`Song file '${songFileName}' not found, please open it manually (or open the whole chart folder)`);
		}
	}

	/** NOTE: Equivalent of SetAndStartLoadingChartSongFileName() */
	async SetAndStartLoadingChartSongFile(file: File): Promise<void>
	{
		this.context.Chart.SongFileName = file.name;
		this.context.ChartDirectoryFiles.set(file.name, file);
		this.context.Undo.NotifyChangesWereMade();
		await this.StartAsyncLoadingSongAudioFile(file);
	}

	UnloadSong(): void
	{
		const context = this.context;
		context.SongWaveformFadeAnimationTarget = 0.0;
		context.SongSourceFilePath = "";
		context.SongSource = null;
		context.SongVoice.SetSource(null);
		context.SongWaveformL = new WaveformMipChain();
		context.SongWaveformR = new WaveformMipChain();
	}

	private GetWaveformWorker(): Worker
	{
		if (this.waveformWorker === null)
		{
			this.waveformWorker = new Worker(new URL("../audio/waveform.worker.ts", import.meta.url), { type: "module" });
			this.waveformWorker.onmessage = (e: MessageEvent<WaveformWorkerResponse>) =>
			{
				const resolve = this.waveformRequests.get(e.data.ID);
				this.waveformRequests.delete(e.data.ID);
				resolve?.(e.data);
			};
		}
		return this.waveformWorker;
	}

	async StartAsyncLoadingSongAudioFile(file: File): Promise<void>
	{
		const loadID = ++this.songLoadID;
		this.context.SongWaveformFadeAnimationTarget = 0.0;
		this.loadSongStopwatch.Restart();
		this.isSongAsyncLoading = true;

		try
		{
			const buffer = await Engine.DecodeAudioFile(await file.arrayBuffer());
			if (loadID !== this.songLoadID) return;

			const channels: Float32Array[] = [];
			for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++)
				channels.push(buffer.getChannelData(c).slice());

			const id = loadID;
			const response = await new Promise<WaveformWorkerResponse>((resolve) =>
			{
				this.waveformRequests.set(id, resolve);
				this.GetWaveformWorker().postMessage({ ID: id, SampleRate: buffer.sampleRate, Channels: channels } satisfies WaveformWorkerRequest, channels.map((c) => c.buffer as ArrayBuffer));
			});
			if (loadID !== this.songLoadID) return;

			this.pendingSongLoad = {
				Path: file.name, Buffer: buffer,
				WaveformL: (response.Chains.length > 0) ? WaveformMipChain.FromTransferable(response.Chains[0]) : new WaveformMipChain(),
				WaveformR: (response.Chains.length > 1) ? WaveformMipChain.FromTransferable(response.Chains[1]) : new WaveformMipChain(),
			};
		}
		catch (e)
		{
			console.error(e);
			if (loadID === this.songLoadID)
			{
				this.isSongAsyncLoading = false;
				this.SetStatus(`Failed to decode audio file '${file.name}'`);
			}
		}
	}

	private InternalUpdateAsyncLoading(): void
	{
		const context = this.context;
		context.SfxVoicePool.UpdateAsyncLoading();

		// NOTE: Just in case there is something wrong with the animation, that could otherwise prevent the song from finishing to load
		const maxWaveformFadeOutDelaySafetyLimit: Time = 0.5;
		const waveformHasFadedOut = (context.SongWaveformFadeAnimationCurrent <= 0.01 || this.loadSongStopwatch.GetElapsed() >= maxWaveformFadeOutDelaySafetyLimit);

		if (this.pendingSongLoad !== null && waveformHasFadedOut)
		{
			const loadResult = this.pendingSongLoad;
			this.pendingSongLoad = null;
			this.isSongAsyncLoading = false;
			this.loadSongStopwatch.Stop();

			context.SongSourceFilePath = loadResult.Path;
			context.SongWaveformL = loadResult.WaveformL;
			context.SongWaveformR = loadResult.WaveformR;
			context.SongWaveformFadeAnimationTarget = context.SongWaveformL.IsEmpty() ? 0.0 : 1.0;

			// TODO: Maybe handle this differently...
			if (context.Chart.ChartTitle[Language.Base].length === 0 && context.SongSourceFilePath.length > 0)
				context.Chart.ChartTitle[Language.Base] = GetFileName(context.SongSourceFilePath, false);

			if (context.Chart.ChartDuration <= 0.0 && loadResult.Buffer !== null)
				context.Chart.ChartDuration = loadResult.Buffer.duration;

			context.SongSource = loadResult.Buffer;
			context.SongVoice.SetSource(loadResult.Buffer);

			Engine.EnsureStreamRunning();
		}
	}

	async OpenFiles(files: File[], handles: FileSystemFileHandle[] = [], directoryHandle: FileSystemDirectoryHandle | null = null): Promise<void>
	{
		// NOTE: Drag and drop handling (or multi file open), a .tja always takes priority over audio files
		const tjaIndex = files.findIndex((f) => HasAnyExtension(f.name, [TJA.Extension]));
		if (tjaIndex >= 0)
		{
			const tjaFile = files[tjaIndex];
			const handle = (handles.length > tjaIndex) ? handles[tjaIndex] : null;
			this.CheckOpenSaveConfirmationPopupThenCall(() => { void this.ImportChartFile(tjaFile, handle, files, directoryHandle); });
			return;
		}

		const audioFile = files.find((f) => HasAnyExtension(f.name, SupportedAudioExtensions) || f.type.startsWith("audio/"));
		if (audioFile !== undefined)
			await this.SetAndStartLoadingChartSongFile(audioFile);
	}

	async OpenLoadChartFileDialog(): Promise<void>
	{
		const w = window as FilePickerWindow;
		if (typeof w.showOpenFilePicker === "function")
		{
			try
			{
				const handles = await w.showOpenFilePicker({
					multiple: true,
					types: [{ description: TJA.FilterName, accept: { "text/plain": [TJA.Extension], "audio/*": SupportedAudioExtensions } }],
				});
				const files = await Promise.all(handles.map((h) => h.getFile()));
				await this.OpenFiles(files, handles);
			}
			catch { /* NOTE: Canceled */ }
			return;
		}
		this.OnRequestOpenChartDialog?.();
	}

	async OpenChartFolderDialog(): Promise<void>
	{
		const w = window as FilePickerWindow;
		if (typeof w.showDirectoryPicker !== "function")
		{
			(this.OnRequestOpenFolderDialog ?? this.OnRequestOpenChartDialog)?.();
			return;
		}
		try
		{
			const directory = await w.showDirectoryPicker({ mode: "readwrite" });
			const files: File[] = [], handles: FileSystemFileHandle[] = [];
			for await (const entry of (directory as unknown as { values(): AsyncIterable<FileSystemHandle> }).values())
			{
				if (entry.kind !== "file") continue;
				const fileHandle = entry as FileSystemFileHandle;
				if (HasAnyExtension(fileHandle.name, [TJA.Extension, ...SupportedAudioExtensions]))
				{
					handles.push(fileHandle);
					files.push(await fileHandle.getFile());
				}
			}
			await this.OpenFiles(files, handles, directory);
		}
		catch { /* NOTE: Canceled */ }
	}

	async OpenLoadAudioFileDialog(): Promise<void>
	{
		const w = window as FilePickerWindow;
		if (typeof w.showOpenFilePicker === "function")
		{
			try
			{
				const [handle] = await w.showOpenFilePicker({ types: [{ description: "Audio Files", accept: { "audio/*": SupportedAudioExtensions } }] });
				await this.SetAndStartLoadingChartSongFile(await handle.getFile());
			}
			catch { /* NOTE: Canceled */ }
			return;
		}
		this.OnRequestOpenAudioDialog?.();
	}

	SelectCourse(course: ChartCourse): void
	{
		// TODO: Selecting a course should also be an undo command so that there isn't ever any confusion (?)
		this.context.ChartSelectedCourse = course;
	}

	/** NOTE: Main per frame update (equivalent of ChartEditor::DrawGui() minus the ImGui windows) */
	Update(): void
	{
		const context = this.context;
		this.InternalUpdateAsyncLoading();

		// NOTE: Animate the gui scale
		GuiScaleState.Current = Settings.Animation.EnableGuiScaleAnimation ?
			GuiScaleState.Current + (GuiScaleState.Target - GuiScaleState.Current) * Math.min(1.0, Input.DeltaTime * 20.0) : GuiScaleState.Target;
		if (Math.abs(GuiScaleState.Current - GuiScaleState.Target) < 0.001) GuiScaleState.Current = GuiScaleState.Target;

		// NOTE: Window focus audio engine response
		{
			if (Input.HasAllFocusBeenLostThisFrame)
			{
				this.wasAudioEngineRunningIdleOnFocusLost = (Engine.GetIsStreamOpenRunning() && !context.GetIsPlayback());
				if (this.wasAudioEngineRunningIdleOnFocusLost && Settings.Audio.CloseDeviceOnIdleFocusLoss)
					Engine.StopCloseStream();
			}
			if (Input.HasAnyFocusBeenGainedThisFrame)
			{
				if (this.wasAudioEngineRunningIdleOnFocusLost && Settings.Audio.CloseDeviceOnIdleFocusLoss)
					Engine.OpenStartStream();
			}
		}

		// NOTE: Apply volume
		context.SongVoice.SetVolume(context.Chart.SongVolume);
		context.SfxVoicePool.BaseVolumeSfx = context.Chart.SoundEffectVolume;
		context.SfxVoicePool.BaseVolumeHitPreview = Settings.Audio.PreviewHitSoundVolume;

		// NOTE: Must always point to a valid course
		if (context.Chart.Courses.length === 0)
			context.Chart.Courses.push(new ChartCourse());
		if (!context.Chart.Courses.includes(context.ChartSelectedCourse))
			context.ChartSelectedCourse = context.Chart.Courses[0];

		// NOTE: Global input bindings
		{
			const noActiveID = !Input.IsTextInputActive();
			const noOpenPopup = (this.PendingConfirmation === null);
			const input = Settings.Input;

			if (noActiveID)
			{
				if (Input.IsAnyPressed(input.Editor_IncreaseGuiScale, true)) this.ZoomInGuiScale();
				if (Input.IsAnyPressed(input.Editor_DecreaseGuiScale, true)) this.ZoomOutGuiScale();
				if (Input.IsAnyPressed(input.Editor_ResetGuiScale, false)) this.ZoomResetGuiScale();

				if (Input.IsAnyPressed(input.Editor_ToggleFullscreen, false))
					ToggleFullscreen();

				if (Input.IsAnyPressed(input.Editor_OpenHelp, true)) { this.ShowHelp = true; this.OnRequestFocusHelp?.(); }
				if (Input.IsAnyPressed(input.Editor_OpenSettings, true)) { this.ShowSettings = true; this.OnRequestFocusSettings?.(); }
			}

			if (noActiveID && noOpenPopup)
			{
				if (Input.IsAnyPressed(input.Editor_Undo, true)) context.Undo.Undo();
				if (Input.IsAnyPressed(input.Editor_Redo, true)) context.Undo.Redo();
				if (Input.IsAnyPressed(input.Editor_ChartNew, false)) this.CheckOpenSaveConfirmationPopupThenCall(() => this.CreateNewChart());
				if (Input.IsAnyPressed(input.Editor_ChartOpen, false)) this.CheckOpenSaveConfirmationPopupThenCall(() => { void this.OpenLoadChartFileDialog(); });
				if (Input.IsAnyPressed(input.Editor_ChartOpenDirectory, false)) this.CheckOpenSaveConfirmationPopupThenCall(() => { void this.OpenChartFolderDialog(); });
				if (Input.IsAnyPressed(input.Editor_ChartSave, false)) void this.TrySaveChartOrOpenSaveAsDialog();
				if (Input.IsAnyPressed(input.Editor_ChartSaveAs, false)) void this.OpenChartSaveAsDialog();
			}
		}

		// NOTE: Always update the timeline even if the window isn't visible so that hit sounds can always be heard
		this.timeline.DrawGui(context);
		this.gamePreview.DrawGui(context, this.timeline.Camera.WorldSpaceXToTime(this.timeline.WorldSpaceCursorXAnimationCurrent));

		for (const hook of this.FrameHooks)
			hook();

		context.Undo.FlushAndExecuteEndOfFrameCommands();
	}

	/** NOTE: Cheap "has anything that the (non canvas) UI displays changed" signature, used to avoid re-rendering the Svelte panels every frame */
	ComputeUISignature(): string
	{
		const context = this.context;
		const course = context.ChartSelectedCourse;
		let selectionHash = 0, selectionCount = 0;
		ForEachSelectedChartItem(course, (it) => { selectionCount++; selectionHash = (selectionHash * 31 + it.List * 7919 + it.Index) | 0; });
		// NOTE: Only coarsely track the cursor during playback to avoid re-rendering the panels too often
		const cursorBeat = context.GetIsPlayback() ? Math.floor(context.GetCursorBeat() / 48) : this.timeline.FloorBeatToCurrentGrid(context.GetCursorBeat());
		const r = this.timeline.RangeSelection;
		return [
			context.Undo.Version, context.Undo.HasPendingChanges ? 1 : 0, selectionCount, selectionHash, course.ID, context.Chart.Courses.length, context.ChartSelectedBranch,
			this.timeline.CurrentGridBarDivision, context.GetIsPlayback() ? 1 : 0, cursorBeat, context.GetPlaybackSpeed(),
			context.Chart.ChartDuration, context.SongSourceFilePath, this.isSongAsyncLoading ? 1 : 0, r.IsActive ? 1 : 0, r.HasEnd ? 1 : 0, r.Start, r.End,
			this.timeline.Metronome.IsEnabled ? 1 : 0, this.timeline.LongNotePlacement.IsActive ? 1 : 0, GuiScaleState.Target,
			LanguageState.Version, SettingsVersion, this.StatusMessageTime, this.PendingConfirmation !== null ? 1 : 0, context.ChartFilePath,
			this.ShowHelp ? 1 : 0, this.ShowSettings ? 1 : 0, this.ShowTJAExportView ? 1 : 0, this.ShowTJAImportTest ? 1 : 0,
			this.tempoCalculator.TapCount, this.tempoCalculator.LastTempo.BPM,
		].join("|");
	}

	IsAnyItemSelected(): boolean { let any = false; ForEachSelectedChartItem(this.context.ChartSelectedCourse, () => { any = true; }); return any; }
	IsAnyNoteSelected(): boolean { let any = false; ForEachSelectedChartItem(this.context.ChartSelectedCourse, (it) => { if (IsNotesList(it.List)) any = true; }); return any; }
}

export function DownloadTextFile(fileName: string, text: string): void
{
	const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ToggleFullscreen(): void
{
	if (document.fullscreenElement === null)
		void document.documentElement.requestFullscreen?.().catch(() => { /* ... */ });
	else
		void document.exitFullscreen?.().catch(() => { /* ... */ });
}
