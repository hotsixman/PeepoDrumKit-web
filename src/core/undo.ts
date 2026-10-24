// Port of PeepoDrumKit "core_undo.h" / "core_undo.cpp"
// https://github.com/samyuu/PeepoDrumKit
import { CPUStopwatch, CPUTimeNow, type Time } from "./types";

export enum MergeResult { Failed, ValueUpdated }

export interface CommandInfo { Description: string; }

export abstract class Command
{
	// NOTE: Restore stored old value to the reference
	abstract Undo(): void;
	// NOTE: Apply stored new value to the reference
	abstract Redo(): void;

	// NOTE: The command parameter is garanteed to be of the same type (class) as the derived class.
	abstract TryMerge(commandToMerge: Command): MergeResult;

	// NOTE: To be displayed to the user
	abstract GetInfo(): CommandInfo;

	// NOTE: Automatically set by the parent UndoHistory, only meant to potentially be displayed to the user
	CreationTime: Time = 0.0;
	LastMergeTime: Time = 0.0;
}

// NOTE: Replacement for the virtual function table pointer comparison, the exact (most derived) class has to match
const CommandsHaveSameType = (a: Command, b: Command): boolean => (Object.getPrototypeOf(a) === Object.getPrototypeOf(b));

export class UndoHistory
{
	UndoStack: Command[] = [];
	RedoStack: Command[] = [];
	CommandsToExecutedAtEndOfFrame: Command[] = [];
	HasPendingChanges = false;
	NumberOfChangesMade = 0;

	NumberOfCommandsToDisallowMergesFor = 0;
	CommandMergeTimeThreshold: Time = 2.0;
	LastExecutedCommandStopwatch = CPUStopwatch.StartNew();

	// NOTE: Incremented on every undo/redo/execute so that UI can cheaply detect changes
	Version = 0;

	Execute(commandToExecute: Command): void { this.TryMergeOrExecute(commandToExecute); }
	ExecuteEndOfFrame(command: Command): void { this.CommandsToExecutedAtEndOfFrame.push(command); }

	FlushAndExecuteEndOfFrameCommands(): void
	{
		if (this.CommandsToExecutedAtEndOfFrame.length > 0)
		{
			for (const commandToExecute of this.CommandsToExecutedAtEndOfFrame)
				this.TryMergeOrExecute(commandToExecute);
			this.CommandsToExecutedAtEndOfFrame = [];
		}
	}

	TryMergeOrExecute(commandToExecute: Command): void
	{
		commandToExecute.CreationTime = CPUTimeNow();
		commandToExecute.LastMergeTime = 0.0;

		this.HasPendingChanges = true;
		this.NumberOfChangesMade++;
		this.Version++;

		if (this.RedoStack.length > 0)
			this.RedoStack = [];

		// HACK: This is definitely a bit hacky because it introduces a somewhat unpredictable outside variable of time
		//		 but if so required by the host application it can be disabled by setting the threshold to zero
		//		 and it automatically takes care of merging possibly unrelated commands easily without adding additional code to all call sites
		const timeSinceLastCommand = this.LastExecutedCommandStopwatch.Restart();
		const lastCommand = (this.UndoStack.length > 0) ? this.UndoStack[this.UndoStack.length - 1] : null;

		const mergeDisallowedByTypeMismatch = (lastCommand === null || !CommandsHaveSameType(commandToExecute, lastCommand));
		const mergeDisallowedByTimeOut = (this.CommandMergeTimeThreshold > 0.0) && (timeSinceLastCommand > this.CommandMergeTimeThreshold);
		const mergeDisallowedByCounter = (this.NumberOfCommandsToDisallowMergesFor > 0);
		if (this.NumberOfCommandsToDisallowMergesFor > 0) this.NumberOfCommandsToDisallowMergesFor--;

		if (!mergeDisallowedByTypeMismatch && !mergeDisallowedByTimeOut && !mergeDisallowedByCounter && lastCommand !== null)
		{
			const result = lastCommand.TryMerge(commandToExecute);
			if (result === MergeResult.Failed)
			{
				this.UndoStack.push(commandToExecute);
				commandToExecute.Redo();
			}
			else
			{
				lastCommand.Redo();
				lastCommand.LastMergeTime = CPUTimeNow();
			}
		}
		else
		{
			this.UndoStack.push(commandToExecute);
			commandToExecute.Redo();
		}
	}

	Undo(count: number = 1): void
	{
		for (let i = 0; i < count; i++)
		{
			const command = this.UndoStack.pop();
			if (command === undefined)
				break;

			this.HasPendingChanges = true;
			this.Version++;
			this.RedoStack.push(command);
			command.Undo();
		}
	}

	Redo(count: number = 1): void
	{
		for (let i = 0; i < count; i++)
		{
			const command = this.RedoStack.pop();
			if (command === undefined)
				break;

			this.HasPendingChanges = true;
			this.Version++;
			this.UndoStack.push(command);
			command.Redo();
		}
	}

	ClearAll(): void
	{
		this.ClearChangesWereMade();
		this.CommandsToExecutedAtEndOfFrame = [];
		this.UndoStack = [];
		this.RedoStack = [];
		this.Version++;
	}

	CanUndo(): boolean { return this.UndoStack.length > 0; }
	CanRedo(): boolean { return this.RedoStack.length > 0; }
	NotifyChangesWereMade(): void { this.HasPendingChanges = true; this.NumberOfChangesMade++; this.Version++; }
	ClearChangesWereMade(): void { this.HasPendingChanges = false; this.NumberOfChangesMade = 0; this.Version++; }

	DisallowMergeForLastCommand(): void { this.NumberOfCommandsToDisallowMergesFor = 1; }
	ResetMergeTimeThresholdStopwatch(): void { this.LastExecutedCommandStopwatch.Restart(); }
}
