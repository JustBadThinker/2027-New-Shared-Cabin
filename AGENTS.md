# Project Rules & Checkpoints

Last checkpoint: 2026-05-19

## Template Generation Rules

- **Bottom Alignment**: "Fuel Surcharge" and "Limited Service Note" MUST always appear at the very bottom of the generated itinerary text, regardless of how many cabins are selected.
- **De-duplication**: If multiple cabins are selected, only output a single instance of the Fuel Surcharge and Service Note at the bottom.
- **Auto-Detection**: The visibility/enabling of the "Note: Service / Surcharge" option is dependent on auto-detecting keywords like `⛽`, `Surcharge Carburant`, `Fuel Surcharge`, and `Limited client service` in the boat or cabin data.
- **Clean Links**: When generating cabin detail links, ensure that any embedded fuel surcharges or service notes are stripped out of the link text if they are being handled at the bottom of the template.
- **Clear All UI**: "Clear All" functionality (for cabins or notepad) should be immediate and not require confirmation dialogs.
