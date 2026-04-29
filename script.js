//
// ╭──────────────────────────────────────────────────────────────────────────╮
// │                                                                          │
// │                Welcome to the recording-analyzer website!                │
// │                                                                          │
// │      Display the audio file statistics from the recording-analyzer.      │
// │                                                                          │
// │          For more details, please visit the GitHub repository:           │
// │          https://github.com/mcochris/recording-analyzer-webpage          │
// │                                                                          │
// │     Questions, issues, suggestions? Please open a support ticket at:     │
// │      https://github.com/mcochris/recording-analyzer-webpage/issues       │
// │                                                                          │
// ╰──────────────────────────────────────────────────────────────────────────╯
//

//
// Disable playlist and export buttons until data is loaded.
//
document.getElementById("playlist-btn").disabled = true;
document.getElementById("export-btn").disabled = true;
document.getElementById("clear-btn").disabled = true;

//
// Clear any existing data in localStorage to ensure a fresh start each time the page is loaded.
//
localStorage.clear();

//
// Define all possible columns with their titles and field names.
//
const COLUMN_DEFS = [
	{ title: "ID", field: "id", sorter: "number", visible: false },
	{ title: "Path", field: "path", sorter: "string" },
	{ title: "File", field: "file", sorter: "string" },
	{ title: "Genre", field: "genre", sorter: "string", metadata: true },
	{ title: "Artist", field: "artist", sorter: "string", metadata: true },
	{ title: "Album", field: "album", sorter: "string", metadata: true },
	{ title: "Track", field: "track", sorter: "string", metadata: true },
	{ title: "Duration", field: "duration", sorter: "number", metadata: true },
	{ title: "Date", field: "date", sorter: "string", metadata: true },
	{ title: "Sample Rate", field: "sample_rate", sorter: "number", metadata: true },
	{ title: "Avg. Bit Rate", field: "bit_rate", sorter: "number", metadata: true },
	{ title: "Bits Per Sample", field: "bits_per_sample", sorter: "number", metadata: true },
	{ title: "L Peak (dB)", field: "left_peak_dB", sorter: "number" },
	{ title: "L Noise (dB)", field: "left_noise_dB", sorter: "number" },
	{ title: "L Crest", field: "left_crest_dB", sorter: "number" },
	{ title: "R Peak (dB)", field: "right_peak_dB", sorter: "number" },
	{ title: "R Noise (dB)", field: "right_noise_dB", sorter: "number" },
	{ title: "R Crest", field: "right_crest_dB", sorter: "number" },
	{ title: "Phase", field: "average_phase", sorter: "number" },
	{ title: "Loudness (LUFS)", field: "integrated_loudness_LUFS", sorter: "number" },
	{ title: "True Peak (dB)", field: "true_peak_dBTP", sorter: "number" },
	{ title: "LRA (LU)", field: "loudness_range_LU", sorter: "number" }
];

const STATISTICAL_DEFS = COLUMN_DEFS.filter(col => !col.metadata);
var has_metadata = null; // Will hold the metadata row if present

//
// JSON validation helpers for the custom importer.
//

// Stores a parse error between the importer and importDataValidator.
// We cannot throw from the importer because Tabulator calls it inside a setTimeout,
// which makes the exception uncatchable by a promise .catch(). Instead, we store the
// error here, return [], and let importDataValidator surface it via the importError event.
let pendingImportError = null;

// Custom importer used in place of the built-in "json" importer.
function jsonImporterWithValidation(fileContents) {
	pendingImportError = null;
	let parsed;
	try {
		parsed = JSON.parse(fileContents);
	} catch (e) {
		pendingImportError = buildJsonErrorMessage(fileContents, e);
		return [];
	}

	if (!Array.isArray(parsed)) {
		pendingImportError = `JSON root must be an array of row objects, got: ${typeof parsed}`;
		return [];
	}

	return parsed;
}

// Builds a human-readable error message with line/column info.
// Handles both Firefox (native line info) and Chrome/V8 (character position).
function buildJsonErrorMessage(jsonText, syntaxError) {
	const msg = syntaxError.message;

	// Firefox includes line/column natively, e.g.:
	// "JSON.parse: expected ',' or '}' after property value in object at line 5 column 10 of the JSON data"
	const firefoxMatch = msg.match(/at line (\d+) column (\d+)/);
	if (firefoxMatch) {
		const line = parseInt(firefoxMatch[1]);
		const col = parseInt(firefoxMatch[2]);
		return formatJsonErrorWithSnippet(jsonText, line, col, msg);
	}

	// Chrome/V8: "Unexpected non-whitespace character after JSON at position 42"
	const posMatch = msg.match(/position\s+(\d+)/i);
	if (posMatch) {
		const { line, col } = charPosToLineCol(jsonText, parseInt(posMatch[1]));
		return formatJsonErrorWithSnippet(jsonText, line, col, msg);
	}

	// Fallback: scan for common JSON mistakes when the engine gives no position info.
	const hint = findCommonJsonMistakes(jsonText);
	return hint
		? `JSON syntax error: ${msg}\nHint: ${hint}`
		: `JSON syntax error: ${msg}`;
}

function formatJsonErrorWithSnippet(jsonText, line, col, originalMsg) {
	const snippet = getJsonLineSnippet(jsonText, line);
	const pointer = ' '.repeat(Math.max(0, col - 1)) + '^';
	return [
		`JSON syntax error at line ${line}, column ${col}:`,
		`  ${snippet}`,
		`  ${pointer}`,
		originalMsg,
	].join('\n');
}

function charPosToLineCol(text, pos) {
	const before = text.substring(0, pos);
	const lines = before.split('\n');
	return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

function getJsonLineSnippet(text, lineNumber) {
	const line = (text.split('\n')[lineNumber - 1] || '').trimEnd();
	return line.length > 100 ? line.substring(0, 97) + '...' : line;
}

// Scans for common JSON mistakes when the engine gives no position info.
// Catches: unquoted keys, trailing commas, single quotes, -Infinity.
function findCommonJsonMistakes(jsonText) {
	const lines = jsonText.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNum = i + 1;

		// Unquoted property key:  someKey:
		const unquotedKey = line.match(/^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/);
		if (unquotedKey) {
			return `Unquoted property name "${unquotedKey[1]}" on line ${lineNum} — property names must use double quotes`;
		}

		// Trailing comma before } or ]
		if (line.trimEnd().endsWith(',') && i + 1 < lines.length) {
			const next = lines[i + 1].trimStart();
			if (next.startsWith('}') || next.startsWith(']')) {
				return `Trailing comma on line ${lineNum} — trailing commas are not allowed in JSON`;
			}
		}

		// Single-quoted strings
		if (/:\s*'[^']*'/.test(line) || /^\s*'[^']*'\s*:/.test(line)) {
			return `Single-quoted string on line ${lineNum} — JSON requires double quotes`;
		}

		// -Infinity / -inf (common output from audio analysis tools)
		if (/:\s*-[Ii]nf(inity)?/.test(line)) {
			return `-Infinity value on line ${lineNum} — use null or a sentinel value instead (JSON does not support -Infinity)`;
		}

		// undefined / NaN
		const badValue = line.match(/:\s*(undefined|NaN|Infinity)\b/);
		if (badValue) {
			return `Invalid JSON value "${badValue[1]}" on line ${lineNum}`;
		}
	}

	return null;
}

// importDataValidator runs AFTER the importer returns. If the importer stored a parse
// error, surface it here so Tabulator fires the importError event correctly.
function importDataValidator(data) {
	if (pendingImportError) {
		return pendingImportError;
	}

	//	Assume the first row is metadata and remove it from the data array.
	const metadataRecord = data.at(0);
	const hasMetadataRecord = metadataRecord != null && 'metadata' in metadataRecord;
	has_metadata = hasMetadataRecord ? !!metadataRecord.metadata : false;
	hasMetadataRecord && data.splice(0, 1); // Remove metadata row from table data

	if (!Array.isArray(data) || data.length === 0) {
		return "Data must be a non-empty array of row objects";
	}

	for (let i = 0; i < data.length; i++) {
		const row = data[i];
		if (typeof row !== 'object' || row === null || Array.isArray(row)) {
			return `Row ${i + 1} is not a plain object (got ${Array.isArray(row) ? 'array' : typeof row})`;
		}
	}

	return true;
}

//
// Initialize Tabulator with no columns and wait for the JSON file to be loaded before setting them.
//
const table = new Tabulator("#table", {
	columns: [],
	height: "100%",
	layout: "fitData",
	pagination: "local",
	selectableRows: true,
	selectableRowsRangeMode: "click",
	movableRows: true,
	movableColumns: true,
	rowHeader: { headerSort: false, resizable: false, minWidth: 30, width: 30, rowHandle: true, formatter: "handle" },
	persistence: true,
	importDataValidator: importDataValidator
});

//
// Show a detailed error message when an import fails (syntax errors, structural errors, etc.).
// Renders the message in #import-error (a <pre> below the table) rather than a browser alert.
//
table.on("importError", function (err) {
	document.getElementById("table").innerHTML = "";
	document.getElementById("load-btn").disabled = true;
	document.getElementById("playlist-btn").disabled = true;
	document.getElementById("export-btn").disabled = true;
	document.getElementById("clear-btn").disabled = false;
		const box = document.getElementById("import-error");
	if (box) {
		box.textContent = "Import failed:\n\n" + err;
		box.style.display = "block";
	}
});

//
// Load button imports the JSON file and populates the table with the data.
//
document.getElementById("load-btn").addEventListener("click", () => {
	// Clear any previous import error before attempting a new load.
	//const box = document.getElementById("import-error");
	//if (box) { box.textContent = ""; box.style.display = "none"; }

	table.import(jsonImporterWithValidation, ".json").then(() => {
		const data = table.getData();
		table.setColumns(has_metadata ? COLUMN_DEFS : STATISTICAL_DEFS);
		document.getElementById("playlist-btn").disabled = false;
		document.getElementById("export-btn").disabled = false;
		document.getElementById("clear-btn").disabled = false;
	}).catch(() => {
		// importError event handles error display; this suppresses the unhandled rejection warning.
	});
});

//
// Playlist button generates an M3U8 playlist from the selected rows in the table.
//
document.getElementById("playlist-btn").addEventListener("click", () => {
	const selectedRows = table.getSelectedData();

	if (selectedRows.length === 0) {
		alert("No rows selected. Click rows in the table to select them first.");
		return;
	}

	const lines = ["#EXTM3U"];

	for (const row of selectedRows) {
		const duration = Math.round(row.duration ?? -1);
		let artist = row.artist ?? "";
		if (artist == "n/a") artist = "";
		const artist2 = artist ? `${artist} - ` : "";
		const file = row.file ?? "";
		const path = row.path ?? "";
		const fileWithoutExt = file.replace(/\.[^.]+$/, '');
		lines.push(`#EXTINF:${duration},${artist2}${fileWithoutExt}`);
		lines.push(`${path}/${file}`);
	}

	const blob = new Blob([lines.join("\n")], { type: "audio/x-mpegurl" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "playlist.m3u8";
	a.click();
	URL.revokeObjectURL(url);
});

//
// Export button reformats the table data to an ODS file.
//
document.getElementById("export-btn").addEventListener("click", () => {
	const data = table.getData();
	if (!data.length) return;

	// Build a title lookup from COLUMN_DEFS
	const titleMap = Object.fromEntries(
		COLUMN_DEFS.map(col => [col.field, col.title])
	);

	// Only export fields that exist in the data and have a defined column
	const fields = COLUMN_DEFS
		.map(col => col.field)
		.filter(f => f in data[0] && COLUMN_DEFS.find(col => col.field === f).visible !== false);

	// Remap rows to use human-readable headers
	const rows = data.map(row =>
		Object.fromEntries(fields.map(f => [titleMap[f] ?? f, row[f] ?? ""]))
	);

	const ws = XLSX.utils.json_to_sheet(rows);
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, "Recordings");
	XLSX.writeFile(wb, "recordings.ods");
});

//
// Help button simply redirects to the help page.
//
document.getElementById("help-btn").addEventListener("click", () => {
	window.open('https://github.com/mcochris/recording-analyzer-webpage/blob/main/README.md#readme', '_blank');
});

//
// Clear button resets the entire app state, including localStorage and the table, to allow a fresh start without reloading the page.
//
document.getElementById("clear-btn").addEventListener("click", () => {
	document.getElementById("table").innerHTML = "";
	table.clearData();
	table.setColumns([]);
	table.clearHistory();
	table.clearSort();
	table.deselectRow();
	table.redraw();
	localStorage.clear();
	location.reload();
	document.getElementById("playlist-btn").disabled = true;
	document.getElementById("export-btn").disabled = true;
	document.getElementById("clear-btn").disabled = true;
});