# GForm Filler

A Chrome extension (Manifest V3) for filling in and submitting **your own Google Form** repeatedly. Each question can be set to one of these fill modes: uniform random, random by percentage weights, a fixed value, or values taken from a list/CSV.

> The extension's UI is in Vietnamese. Button and field names below are given in Vietnamese with an English translation.

## Installation

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Pin the GForm Filler icon to the toolbar.

After editing the code, click the extension's reload button in `chrome://extensions` **and reload (F5) the form tab**.

## Usage

1. Open the form's fill-in link (`…/viewform`), not the editor page (`…/edit`).
2. Click the extension icon to open the side panel.
3. **Questions:** choose a fill mode for each question.

| Question type | Fill modes |
|---|---|
| Multiple choice, Dropdown, Linear scale, Rating | Uniform random · Percentage weights · Fixed · List · Leave blank |
| Checkboxes | Random k options (k within a range) · Per-option percentage · Fixed · List (multiple options separated by `;`) |
| Grid | Same as above, applied to all rows or configured per row |
| Short answer, Paragraph | Generated (random words, full name, email, phone number, integer) · Fixed · List |
| Date, Time | Random within a range · Fixed · List (`YYYY-MM-DD` or `DD/MM/YYYY`, `HH:MM`) |

   - Questions with an **"Other"** option: list values that don't match any option are written into the "Other" field.
   - **Sequential** lists: submission *i* uses row *i* (wrapping around to the start when the list runs out). The **"Bắt đầu từ dòng"** (*Start from row*) field lets you resume from the middle of a list.
4. **CSV data** (optional): one file for the whole form. The first row is the header; columns whose names match a question title are matched automatically (case- and accent-insensitive). All questions using the CSV in sequential mode take the same row for each submission. Files exported from Excel with `;` as the delimiter are also supported.
5. **Run:** enter the number of submissions and a random delay range (in seconds). Click **"Xem thử 1 lần"** (*Preview once*) to preview the generated data, then **"Bắt đầu chạy"** (*Start*). Pause and Stop buttons are available. The extension stops automatically after 3 consecutive errors.
   - The submission loop runs inside the form tab, so it keeps going even if you close the side panel. Just **keep the form tab open**.
6. **Schedule:** pick a time. When it arrives, the extension opens the form in a new tab, runs with the configuration captured when the schedule was created, and reports back via a notification. Chrome must be running.
7. **Configuration:** saved automatically per form, and can be exported/imported as a JSON file.

## How it works

- Reads the form structure from the `FB_PUBLIC_LOAD_DATA_` variable embedded in the page.
- Submits via `POST …/formResponse` directly from the form page (same origin, with cookies) instead of simulating mouse clicks.
- Multi-section forms: sends a `pageHistory` that goes through every section.

## Limitations

- File upload questions are not supported.
- Forms with **answer-based branching** ("go to section X"): answers in sections that would have been skipped may not be recorded.
- Forms limited to **1 response per person**, or that collect verified emails: only one submission per account is possible.
- Questions with **response validation**: pick a generator or list that satisfies the rule, otherwise Google will reject that submission.

## Tests

```
npm test
```

The `lib/` folder contains the pure logic (parser, data generators, CSV, payload builder). It is shared by the content script, the side panel and the Node tests.
