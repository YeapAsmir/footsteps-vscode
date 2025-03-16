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
import { ReTraceProvider } from "./ReTraceProvider";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	const retraceProvider = new ReTraceProvider();

	// languages.registerDocumentHighlightProvider("*", retraceProvider);

	commands.registerCommand("retrace.skipBack", () => {
		retraceProvider.onTimeTravel(-1);
	});

	commands.registerCommand("retrace.skipForwards", () => {
		retraceProvider.onTimeTravel(1);
	});

	commands.registerCommand("retrace.skipBackSameFile", () => {
		retraceProvider.onTimeTravel(-1, "within-file");
	});

	commands.registerCommand("retrace.skipForwardsSameFile", () => {
		retraceProvider.onTimeTravel(1, "within-file");
	});

	commands.registerCommand("retrace.skipBackDifferentFile", () => {
		retraceProvider.onTimeTravel(-1, "across-files");
	});

	commands.registerCommand("retrace.skipForwardsDifferentFile", () => {
		retraceProvider.onTimeTravel(1, "across-files");
	});

	commands.registerCommand("retrace.toggleHighlightingLines", async () => {
		const userSetting = workspace.getConfiguration("retrace");
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

	commands.registerCommand("retrace.clearChangesWithinFile", () => {
		const document = window?.activeTextEditor?.document;
		if (!document) return;
		if (!window?.activeTextEditor) return;
		retraceProvider.onClearChangesWithinFile(document, window?.activeTextEditor);
	});

	commands.registerCommand("retrace.clearProjectChanges", () => {
		retraceProvider.onClearProjectChanges();
	});

	workspace.onDidChangeTextDocument((event) => {
		retraceProvider.onTextChange([...event.contentChanges], event.document);
	});
}

// this method is called when your extension is deactivated
export function deactivate() { }
