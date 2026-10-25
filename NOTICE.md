# NOTICE

This project is a web port of **PeepoDrumKit**.

- Original project: https://github.com/samyuu/PeepoDrumKit
- Copyright (c) 2022 Samyuu

The following parts are ported from, or based on, the original source code:

| This project | Original (PeepoDrumKit) |
|---|---|
| `src/core/*` | `src/core_types.h`, `core_beat.h`, `core_string.h`, `core_undo.h` (+ `.cpp`) |
| `src/formats/tja.ts` | `src/file_format_tja.h/.cpp` |
| `src/editor/chart.ts` | `src/peepo_drum_kit/chart.h/.cpp` |
| `src/editor/undo-commands.ts` | `src/peepo_drum_kit/chart_editor_undo.h` |
| `src/editor/context.ts` | `src/peepo_drum_kit/chart_editor_context.h/.cpp` |
| `src/editor/timeline.ts` | `src/peepo_drum_kit/chart_editor_timeline.h/.cpp` |
| `src/editor/game-preview.ts` | `src/peepo_drum_kit/chart_editor_widgets_game.cpp` |
| `src/editor/editor.ts` | `src/peepo_drum_kit/chart_editor.h/.cpp` |
| `src/editor/tempo-calculator.ts` | `src/peepo_drum_kit/chart_editor_widgets.h/.cpp` (tempo calculator) |
| `src/editor/settings.ts`, `theme.ts`, `graphics.ts`, `i18n.ts`, `sound.ts` | `src/peepo_drum_kit/chart_editor_settings*`, `chart_editor_theme.h`, `chart_editor_graphics.*`, `chart_editor_i18n.*`, `chart_editor_sound.*` |
| `src/audio/waveform.ts`, `engine.ts` | `src/audio/audio_waveform.h/.cpp`, `audio_engine.h/.cpp` |
| `public/assets/graphics/*.svg` | `assets/graphics/*.svg` (copied unchanged) |

The user interface (Svelte components, mobile layout, touch gestures) is newly written and only uses the original UI as a reference.

## Other assets

- `public/assets/audio/don.wav`, `public/assets/audio/ka.wav`: hit sounds from [hotsixman/tja-tools](https://github.com/hotsixman/tja-tools) (`previewer/src/assets`), converted to WAV and level adjusted (ka peak limited to avoid clipping).
