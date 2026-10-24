// NOTE: Generates the waveform mip chains off the main thread to avoid any frame drops while loading songs
import { GenerateEntireMipChainFromChannel, type TransferableMipChain } from "./waveform";

export interface WaveformWorkerRequest { ID: number; SampleRate: number; Channels: Float32Array[]; }
export interface WaveformWorkerResponse { ID: number; Chains: TransferableMipChain[]; }

self.onmessage = (e: MessageEvent<WaveformWorkerRequest>) =>
{
	const { ID, SampleRate, Channels } = e.data;
	const chains = Channels.map((channel) => GenerateEntireMipChainFromChannel(channel, SampleRate));
	const transfer: ArrayBuffer[] = [];
	for (const chain of chains) for (const mip of chain.Mips) transfer.push(mip.AbsoluteSamples.buffer as ArrayBuffer);
	(self as unknown as Worker).postMessage({ ID, Chains: chains } satisfies WaveformWorkerResponse, transfer);
};
