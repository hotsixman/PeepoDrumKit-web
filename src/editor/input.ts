// NOTE: Replacement for the Dear ImGui IO input state + "imgui_input_binding.cpp" of PeepoDrumKit
//		 (https://github.com/samyuu/PeepoDrumKit), collecting browser events and exposing them as per-frame state
import { type KeyBinding, type MultiInputBinding, InputModifierBehavior, ModFlags_Ctrl, ModFlags_Shift, ModFlags_Alt } from "./settings";
import { type vec2 } from "../core/types";

export enum MouseButton { Left = 0, Middle = 1, Right = 2, X1 = 3, X2 = 4 }

// NOTE: Logical owner of keyboard focus (replacement for ImGui window focus)
export type FocusOwner = "timeline" | "tempoCalculator" | "other";

const IsEditableElement = (el: Element | null): boolean =>
{
	if (el === null) return false;
	const tag = el.tagName;
	if (tag === "TEXTAREA") return true;
	if (tag === "SELECT") return true;
	if (tag === "INPUT")
	{
		const type = (el as HTMLInputElement).type;
		return !(type === "button" || type === "checkbox" || type === "radio" || type === "range" || type === "submit" || type === "color" || type === "file");
	}
	return (el as HTMLElement).isContentEditable === true;
};

export class InputState
{
	// NOTE: Per frame state
	KeysDown = new Set<string>();
	KeysPressedThisFrame = new Set<string>();
	KeysRepeatedThisFrame = new Set<string>();
	KeyCtrl = false;
	KeyShift = false;
	KeyAlt = false;

	MousePos: vec2 = { x: -1e9, y: -1e9 };
	MousePosLastFrame: vec2 = { x: -1e9, y: -1e9 };
	MouseDelta: vec2 = { x: 0, y: 0 };
	MouseDown = [false, false, false, false, false];
	MouseClicked = [false, false, false, false, false];
	MouseReleased = [false, false, false, false, false];
	MouseWheel = 0.0;
	MousePosValid = false;
	MouseInsideTarget = false;
	DeltaTime = 1.0 / 60.0;

	FocusOwner: FocusOwner = "timeline";
	HasAllFocusBeenLostThisFrame = false;
	HasAnyFocusBeenGainedThisFrame = false;

	// NOTE: Pending events collected between frames
	private pendingPressed = new Set<string>();
	private pendingRepeated = new Set<string>();
	private pendingClicked = [false, false, false, false, false];
	private pendingReleased = [false, false, false, false, false];
	private pendingWheel = 0.0;
	private pendingFocusLost = false;
	private pendingFocusGained = false;
	private target: HTMLElement | null = null;

	// NOTE: Bindings for which the default browser action should be prevented (populated by the editor)
	PreventDefaultFilter: (e: KeyboardEvent) => boolean = () => false;

	IsTextInputActive(): boolean { return IsEditableElement(document.activeElement); }

	Attach(): void
	{
		window.addEventListener("keydown", this.onKeyDown, { capture: true });
		window.addEventListener("keyup", this.onKeyUp, { capture: true });
		window.addEventListener("blur", this.onBlur);
		window.addEventListener("focus", this.onFocus);
		window.addEventListener("pointerup", this.onWindowPointerUp, { capture: true });
		window.addEventListener("pointermove", this.onWindowPointerMove, { capture: true, passive: true });
	}

	Detach(): void
	{
		window.removeEventListener("keydown", this.onKeyDown, { capture: true });
		window.removeEventListener("keyup", this.onKeyUp, { capture: true });
		window.removeEventListener("blur", this.onBlur);
		window.removeEventListener("focus", this.onFocus);
		window.removeEventListener("pointerup", this.onWindowPointerUp, { capture: true });
		window.removeEventListener("pointermove", this.onWindowPointerMove, { capture: true });
	}

	/** NOTE: Mouse positions are reported relative to this element (the timeline canvas) */
	SetMouseTarget(el: HTMLElement | null): void { this.target = el; }

	private updateMods(e: KeyboardEvent | MouseEvent | PointerEvent | WheelEvent): void
	{
		this.KeyCtrl = e.ctrlKey || e.metaKey;
		this.KeyShift = e.shiftKey;
		this.KeyAlt = e.altKey;
	}

	private onKeyDown = (e: KeyboardEvent): void =>
	{
		this.updateMods(e);
		if (IsEditableElement(e.target as Element))
			return;

		if (!e.repeat)
		{
			this.KeysDown.add(e.code);
			this.pendingPressed.add(e.code);
		}
		else
		{
			this.KeysDown.add(e.code);
			this.pendingRepeated.add(e.code);
		}

		if (this.PreventDefaultFilter(e) || e.code === "Tab" || e.code === "Space" || (e.altKey && !e.ctrlKey))
			e.preventDefault();
	};

	private onKeyUp = (e: KeyboardEvent): void =>
	{
		this.updateMods(e);
		this.KeysDown.delete(e.code);
	};

	private onBlur = (): void =>
	{
		this.KeysDown.clear();
		this.KeyCtrl = this.KeyShift = this.KeyAlt = false;
		for (let i = 0; i < this.MouseDown.length; i++) this.MouseDown[i] = false;
		this.pendingFocusLost = true;
	};

	private onFocus = (): void => { this.pendingFocusGained = true; };

	private toLocal(e: MouseEvent): vec2
	{
		if (this.target === null) return { x: e.clientX, y: e.clientY };
		const r = this.target.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}

	// NOTE: To be called by the timeline element pointer handlers
	OnPointerDown(e: PointerEvent): void
	{
		this.updateMods(e);
		this.MousePos = this.toLocal(e);
		this.MousePosValid = true;
		this.MouseInsideTarget = true;
		const button = (e.button >= 0 && e.button < 5) ? e.button : 0;
		this.MouseDown[button] = true;
		this.pendingClicked[button] = true;
	}

	OnPointerMove(e: PointerEvent): void
	{
		this.updateMods(e);
		this.MousePos = this.toLocal(e);
		this.MousePosValid = true;
	}

	// NOTE: Keep the last position on leave so that drags continue to work
	OnPointerEnter(): void { this.MouseInsideTarget = true; }
	OnPointerLeave(): void { this.MouseInsideTarget = false; }

	OnWheel(e: WheelEvent): void
	{
		this.updateMods(e);
		// NOTE: Normalize to "ticks" similar to the Win32 WM_MOUSEWHEEL (120 units per tick), sign matches ImGui (positive = up)
		let delta = e.deltaY;
		if (e.deltaMode === 1) delta *= 40; else if (e.deltaMode === 2) delta *= 800;
		if (delta === 0 && e.deltaX !== 0) delta = e.deltaX;
		this.pendingWheel += Math.max(-4, Math.min(4, -delta / 100.0));
	}

	private onWindowPointerUp = (e: PointerEvent): void =>
	{
		this.updateMods(e);
		const button = (e.button >= 0 && e.button < 5) ? e.button : 0;
		if (this.MouseDown[button])
		{
			this.MouseDown[button] = false;
			this.pendingReleased[button] = true;
		}
		if (this.target !== null) this.MousePos = this.toLocal(e);
	};

	private onWindowPointerMove = (e: PointerEvent): void =>
	{
		// NOTE: Track the mouse outside of the target while a button is held (for drags / box selections)
		if (this.MouseDown.some((v) => v) && this.target !== null)
			this.MousePos = this.toLocal(e);
	};

	BeginFrame(deltaTime: number): void
	{
		this.DeltaTime = deltaTime;

		// NOTE: Synthetic button changes queued before the previous frame are applied now, so that button state and click / release events become visible together
		for (const action of this.readyMouseActions) action();
		this.readyMouseActions = this.deferredMouseActions;
		this.deferredMouseActions = [];

		this.KeysPressedThisFrame = this.pendingPressed; this.pendingPressed = new Set();
		this.KeysRepeatedThisFrame = this.pendingRepeated; this.pendingRepeated = new Set();
		for (let i = 0; i < 5; i++)
		{
			this.MouseClicked[i] = this.pendingClicked[i]; this.pendingClicked[i] = false;
			this.MouseReleased[i] = this.pendingReleased[i]; this.pendingReleased[i] = false;
		}
		this.MouseWheel = this.pendingWheel; this.pendingWheel = 0.0;
		this.MouseDelta = { x: this.MousePos.x - this.MousePosLastFrame.x, y: this.MousePos.y - this.MousePosLastFrame.y };
		this.MousePosLastFrame = { ...this.MousePos };
		this.HasAllFocusBeenLostThisFrame = this.pendingFocusLost; this.pendingFocusLost = false;
		this.HasAnyFocusBeenGainedThisFrame = this.pendingFocusGained; this.pendingFocusGained = false;
	}

	/** NOTE: Synthetic mouse events used by the touch gesture controller.
	 *		 Hover states are computed from the previous frame (just like ImGui) but a touch moves and presses at the same time,
	 *		 so the position is updated immediately while the button state changes are deferred by one frame */
	private deferredMouseActions: (() => void)[] = [];
	private readyMouseActions: (() => void)[] = [];
	SimulateMouseDown(button: MouseButton, pos: vec2): void
	{
		this.SimulateMouseMove(pos);
		this.MouseInsideTarget = true;
		this.deferredMouseActions.push(() => { this.MouseDown[button] = true; this.pendingClicked[button] = true; });
	}
	SimulateMouseMove(pos: vec2): void { this.MousePos = { ...pos }; this.MousePosValid = true; }
	SimulateMouseUp(button: MouseButton): void
	{
		this.deferredMouseActions.push(() =>
		{
			if (!this.MouseDown[button] && !this.pendingClicked[button]) return;
			this.MouseDown[button] = false;
			this.pendingReleased[button] = true;
		});
	}
	/** NOTE: A complete click within a single frame (press + release) */
	SimulateMouseClick(button: MouseButton, pos: vec2): void
	{
		this.SimulateMouseMove(pos);
		this.MouseInsideTarget = true;
		this.deferredMouseActions.push(() => { this.pendingClicked[button] = true; this.pendingReleased[button] = true; });
	}

	/** NOTE: Simulate a key press for the current frame (used by the on-screen mobile controls) */
	InjectKeyPress(code: string): void { this.pendingPressed.add(code); }

	IsKeyDown(code: string): boolean { return this.KeysDown.has(code); }
	IsKeyPressed(code: string, repeat: boolean): boolean { return this.KeysPressedThisFrame.has(code) || (repeat && this.KeysRepeatedThisFrame.has(code)); }

	ModsDown(): number { return (this.KeyCtrl ? ModFlags_Ctrl : 0) | (this.KeyShift ? ModFlags_Shift : 0) | (this.KeyAlt ? ModFlags_Alt : 0); }

	private modsMatch(binding: KeyBinding, behavior: InputModifierBehavior): boolean
	{
		const mods = this.ModsDown();
		return (behavior === InputModifierBehavior.Strict) ? (mods === binding.Mods) : ((mods & binding.Mods) === binding.Mods);
	}

	IsDown(binding: KeyBinding, behavior: InputModifierBehavior = InputModifierBehavior.Strict): boolean
	{
		return this.IsKeyDown(binding.Key) && this.modsMatch(binding, behavior);
	}

	IsPressed(binding: KeyBinding, repeat: boolean = true, behavior: InputModifierBehavior = InputModifierBehavior.Strict): boolean
	{
		return this.IsKeyPressed(binding.Key, repeat) && this.modsMatch(binding, behavior);
	}

	IsAnyDown(binding: MultiInputBinding, behavior: InputModifierBehavior = InputModifierBehavior.Strict): boolean
	{
		for (const slot of binding) if (this.IsDown(slot, behavior)) return true;
		return false;
	}

	IsAnyPressed(binding: MultiInputBinding, repeat: boolean = true, behavior: InputModifierBehavior = InputModifierBehavior.Strict): boolean
	{
		for (const slot of binding) if (this.IsPressed(slot, repeat, behavior)) return true;
		return false;
	}

	IsMouseClicked(button: MouseButton): boolean { return this.MouseClicked[button]; }
	IsMouseDown(button: MouseButton): boolean { return this.MouseDown[button]; }
	IsMouseReleased(button: MouseButton): boolean { return this.MouseReleased[button]; }
}

export const Input = new InputState();
