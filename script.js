//====================================
// Recording Analyzer Web App
//====================================

//
// Disable playlist and export buttons until data is loaded.
//
document.getElementById("playlist-btn").disabled = true;
document.getElementById("export-btn").disabled = true;
document.getElementById("clear-btn").disabled = true;

//
// Define all possible columns with their titles and field names.
//
const COLUMN_DEFS = [
	{ title: "ID", field: "id", sorter: "number", visible: false },
	{ title: "Path", field: "path", sorter: "string" },
	{ title: "File", field: "file", sorter: "string" },
	{ title: "Genre", field: "genre", sorter: "string" },
	{ title: "Artist", field: "artist", sorter: "string" },
	{ title: "Album", field: "album", sorter: "string" },
	{ title: "Track", field: "track", sorter: "number" },
	{ title: "Duration", field: "duration", sorter: "number" },
	{ title: "Year", field: "year", sorter: "number" },
	{ title: "Sample Rate", field: "sample_rate", sorter: "number" },
	{ title: "Avg. Bit Rate", field: "bit_rate", sorter: "number" },
	{ title: "Bits Per Sample", field: "bits_per_sample", sorter: "number" },
	{ title: "L Peak (dB)", field: "left_peak_level_db", sorter: "number" },
	{ title: "L Noise (dB)", field: "left_noise_floor_db", sorter: "number" },
	{ title: "L Crest", field: "left_crest_factor", sorter: "number" },
	{ title: "R Peak (dB)", field: "right_peak_level_db", sorter: "number" },
	{ title: "R Noise (dB)", field: "right_noise_floor_db", sorter: "number" },
	{ title: "R Crest", field: "right_crest_factor", sorter: "number" },
	{ title: "Phase (°)", field: "average_phase_degrees", sorter: "number" },
	{ title: "Loudness (LUFS)", field: "integrated_loudness_lufs", sorter: "number" },
	{ title: "True Peak (dB)", field: "true_peak_db", sorter: "number" },
	{ title: "LRA (LU)", field: "loudness_range_lu", sorter: "number" }
];

//
// Determine which columns to show based on the fields present in the data.
//
function columnsFromData(data) {
	if (!data.length) return [];
	const presentFields = new Set(Object.keys(data[0]));
	return COLUMN_DEFS.filter(col => presentFields.has(col.field));
}

//
// Initialize Tabulator with no columns and wait for the JSON file to be loaded before setting them.
//
const table = new Tabulator("#table", {
	columns: [],
	height: "80vh",
	layout: "fitData",
	pagination: "local",
	selectableRows: true,
	selectableRowsRangeMode: "click",
	movableRows: true,
	movableColumns: true,
	rowHeader: { headerSort: false, resizable: false, minWidth: 30, width: 30, rowHandle: true, formatter: "handle" },
	persistence: true,
});

//
// Load button imports the JSON file and populates the table with the data.
//
document.getElementById("load-btn").addEventListener("click", () => {
	table.import("json", ".json").then(() => {
		const data = table.getData();
		const columns = columnsFromData(data);
		table.setColumns(columns);
		document.getElementById("playlist-btn").disabled = false;
		document.getElementById("export-btn").disabled = false;
		document.getElementById("clear-btn").disabled = false;
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

		lines.push(`#EXTINF:${duration},${artist2}${file}`);
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
	window.open('https://github.com/mcochris/recording-analyzer-webpage/blob/main/README.md', '_blank');
});

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