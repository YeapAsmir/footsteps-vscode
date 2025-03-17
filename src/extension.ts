// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
	ExtensionContext,
	languages,
	commands,
	workspace,
	window,
	WorkspaceEdit,
	ConfigurationTarget,
} from "vscode";
import { TracesProvider } from "./TracesProvider";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	const tracesProvider = new TracesProvider();

	// languages.registerDocumentHighlightProvider("*", tracesProvider);

	commands.registerCommand("traces.skipBack", () => {
		tracesProvider.onTimeTravel(-1);
	});

	commands.registerCommand("traces.skipForwards", () => {
		tracesProvider.onTimeTravel(1);
	});

	commands.registerCommand("traces.skipBackSameFile", () => {
		tracesProvider.onTimeTravel(-1, "within-file");
	});

	commands.registerCommand("traces.skipForwardsSameFile", () => {
		tracesProvider.onTimeTravel(1, "within-file");
	});

	commands.registerCommand("traces.skipBackDifferentFile", () => {
		tracesProvider.onTimeTravel(-1, "across-files");
	});

	commands.registerCommand("traces.skipForwardsDifferentFile", () => {
		tracesProvider.onTimeTravel(1, "across-files");
	});

	commands.registerCommand("traces.toggleHighlightingLines", async () => {
		const userSetting = workspace.getConfiguration("traces");
		const doHighlightChanges = userSetting.get("doHighlightChanges");
		const specificSetting = userSetting.inspect("doHighlightChanges");
		const doSetAsGlobal =
			specificSetting && specificSetting.workspaceValue === undefined;
		await userSetting.update(
			"doHighlightChanges",
			!doHighlightChanges,
			doSetAsGlobal
		);
	});

	commands.registerCommand("traces.clearChangesWithinFile", () => {
		const document = window?.activeTextEditor?.document;
		if (!document) return;
		if (!window?.activeTextEditor) return;
		tracesProvider.onClearChangesWithinFile(document, window?.activeTextEditor);
	});

	commands.registerCommand("traces.clearProjectChanges", () => {
		tracesProvider.onClearProjectChanges();
	});

	workspace.onDidChangeTextDocument((event) => {
		tracesProvider.onTextChange([...event.contentChanges], event.document);
	});
}

// this method is called when your extension is deactivated
export function deactivate() { }
