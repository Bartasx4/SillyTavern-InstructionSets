# SillyTavern-InstructionSets

Instruction Sets is a SillyTavern extension that lets you define reusable prompt sections with switchable subsections.

## What it does

- Creates named sections such as `Main Instructions`, `World Description`, or `Currency`
- Lets each section contain multiple subsections
- Stores section definitions per character or group
- Stores enabled states and selected subsections per chat branch through `chat_metadata`
- Composes all active selected subsection texts into one extension prompt
- Injects the composed prompt before the main prompt, after the main prompt, or in-chat at a chosen depth and role

## Install

1. Copy the `SillyTavern-InstructionSets` folder into:
   `SillyTavern/data/default-user/extensions/`
2. Reload SillyTavern.
3. Open a character or group chat.
4. Click the `Instruction Sets` toolbar button.

## Notes

- Section and subsection names are organizational labels and are **not** automatically added to the final prompt.
- If you want the model to see section titles, include them directly in subsection content.
- The extension tries several toolbar locations and falls back gracefully if a preferred anchor is not found in your current SillyTavern build or theme.
