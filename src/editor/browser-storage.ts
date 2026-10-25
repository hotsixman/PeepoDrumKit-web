// NOTE: Web port addition, stores charts (TJA text + optionally the song file) inside the browser using IndexedDB.
//		 This is mostly useful on mobile where there is no real file system access and saving falls back to downloading
export interface BrowserChartEntry
{
	ID: string;
	FileName: string;
	Title: string;
	TJAText: string;
	SongFileName: string;
	Song: Blob | null;
	SavedAt: number;	// NOTE: Date.now()
}

/** NOTE: Lightweight entry without the (potentially large) TJA text and song data, used for listing */
export interface BrowserChartInfo
{
	ID: string;
	FileName: string;
	Title: string;
	SongFileName: string;
	SongSize: number;
	TJASize: number;
	SavedAt: number;
}

const DatabaseName = "PeepoDrumKitWeb";
const DatabaseVersion = 2;
const ChartStoreName = "charts";
// NOTE: Version 2, single slot automatic backup of the current (unsaved) chart. The song is stored separately so it only has to be written when it changes
const AutosaveStoreName = "autosave";
const AutosaveChartKey = "chart", AutosaveSongKey = "song";

let databasePromise: Promise<IDBDatabase> | null = null;

function OpenDatabase(): Promise<IDBDatabase>
{
	if (databasePromise === null)
	{
		databasePromise = new Promise<IDBDatabase>((resolve, reject) =>
		{
			if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB is not supported by this browser")); return; }
			const request = indexedDB.open(DatabaseName, DatabaseVersion);
			request.onupgradeneeded = () =>
			{
				const db = request.result;
				if (!db.objectStoreNames.contains(ChartStoreName))
					db.createObjectStore(ChartStoreName, { keyPath: "ID" });
				if (!db.objectStoreNames.contains(AutosaveStoreName))
					db.createObjectStore(AutosaveStoreName, { keyPath: "ID" });
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		// NOTE: Allow retrying after a failure (private browsing etc.)
		databasePromise.catch(() => { databasePromise = null; });
	}
	return databasePromise;
}

function RequestToPromise<T>(request: IDBRequest<T>): Promise<T>
{
	return new Promise<T>((resolve, reject) =>
	{
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function WithStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>, storeName: string = ChartStoreName): Promise<T>
{
	const db = await OpenDatabase();
	const transaction = db.transaction(storeName, mode);
	const result = await RequestToPromise(fn(transaction.objectStore(storeName)));
	if (mode === "readwrite")
	{
		await new Promise<void>((resolve, reject) =>
		{
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () => reject(transaction.error);
		});
	}
	return result;
}

export function NewBrowserChartID(): string
{
	return (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function PutBrowserChart(entry: BrowserChartEntry): Promise<void>
{
	// NOTE: Ask the browser to not evict the data under storage pressure (best effort, may be ignored)
	try { await navigator.storage?.persist?.(); } catch { /* ... */ }
	await WithStore("readwrite", (store) => store.put(entry));
}

export async function GetBrowserChart(id: string): Promise<BrowserChartEntry | null>
{
	return (await WithStore<BrowserChartEntry | undefined>("readonly", (store) => store.get(id))) ?? null;
}

export async function DeleteBrowserChart(id: string): Promise<void>
{
	await WithStore("readwrite", (store) => store.delete(id));
}

export async function ListBrowserCharts(): Promise<BrowserChartInfo[]>
{
	const entries = await WithStore<BrowserChartEntry[]>("readonly", (store) => store.getAll());
	return entries
		.map((it): BrowserChartInfo => ({ ID: it.ID, FileName: it.FileName, Title: it.Title, SongFileName: it.SongFileName, SongSize: it.Song?.size ?? 0, TJASize: it.TJAText.length, SavedAt: it.SavedAt }))
		.sort((a, b) => b.SavedAt - a.SavedAt);
}

export interface AutosaveEntry
{
	FileName: string;
	Title: string;
	TJAText: string;
	SongFileName: string;
	// NOTE: Path / browser storage entry the chart was opened from, restored together with the chart
	ChartFilePath: string;
	BrowserChartID: string | null;
	SavedAt: number;
}

interface AutosaveSongRecord { ID: string; SongKey: string; Song: Blob | null; }

/** NOTE: "song" is only written when it is not undefined (unchanged since the last autosave) */
export async function PutAutosave(entry: AutosaveEntry, song?: { SongKey: string; Song: Blob | null }): Promise<void>
{
	try { await navigator.storage?.persist?.(); } catch { /* ... */ }
	if (song !== undefined)
		await WithStore("readwrite", (store) => store.put({ ID: AutosaveSongKey, SongKey: song.SongKey, Song: song.Song } satisfies AutosaveSongRecord), AutosaveStoreName);
	await WithStore("readwrite", (store) => store.put({ ID: AutosaveChartKey, ...entry }), AutosaveStoreName);
}

export async function GetAutosave(): Promise<{ Entry: AutosaveEntry; Song: Blob | null } | null>
{
	const entry = await WithStore<(AutosaveEntry & { ID: string }) | undefined>("readonly", (store) => store.get(AutosaveChartKey), AutosaveStoreName);
	if (entry === undefined)
		return null;
	const song = await WithStore<AutosaveSongRecord | undefined>("readonly", (store) => store.get(AutosaveSongKey), AutosaveStoreName);
	return { Entry: entry, Song: song?.Song ?? null };
}

export async function ClearAutosave(): Promise<void>
{
	await WithStore("readwrite", (store) => store.clear(), AutosaveStoreName);
}

export async function GetBrowserStorageEstimate(): Promise<{ Usage: number; Quota: number } | null>
{
	try
	{
		const estimate = await navigator.storage?.estimate?.();
		return (estimate !== undefined) ? { Usage: estimate.usage ?? 0, Quota: estimate.quota ?? 0 } : null;
	}
	catch { return null; }
}

export function FormatByteSize(bytes: number): string
{
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
