import {
    Position,
    Range,
    Selection,
    TextDocument,
    TextDocumentContentChangeEvent,
    TextEditor,
    TextEditorDecorationType,
    Uri,
    window,
    workspace
} from "vscode";

import { onHighlightLine } from "./decorator";
import { History, HistoryItem } from "./types";

export class FootstepsProvider {
    private history: History = [];
    private currentHistoryIndex: number = 0;
    private decorationTypes: TextEditorDecorationType[][] = [];
    private focusedDecorationTypes: Map<string, TextEditorDecorationType> = new Map();
    private editorFileNames: string[] = [];
    private maxNumberOfChangesToRemember: number = 10;
    private clearChangesOnFileSave: boolean = false;
    private maxNumberOfChangesToHighlight: number = 6;
    private minDistanceFromCursorToHighlight: number = 3;
    private highlightColor: string = "rgb(126, 107, 205)";
    private doHighlightChanges: boolean = true;
    private doHighlightOnClick: boolean = true;
    private doHighlightChangesPerLanguage: Record<string, boolean> = {};
    private doHighlightEmptyLines: boolean = true;
    private doHighlightInactiveEditors: boolean = true;
    private highlightColorMaxOpacity: number = 0.4;
    private highlightColorFocusedOpacity: number = 0.15;
    private doHighlightCurrentlyFocusedChunk: boolean = true;

    constructor() {
        this.onSyncWithSettings();
        this.createDecorationTypes();

        window.onDidChangeActiveTextEditor(() => {
            this.onHighlightChanges();
        });

        window.onDidChangeTextEditorSelection(({ kind }) => {
            const didClick = kind === 2;
            const doIncludeCurrentRange = this.doHighlightOnClick && didClick;
            if (doIncludeCurrentRange) {
                const editor = window.activeTextEditor;
                if (!editor) return;
                const fileName = editor.document.fileName || "";
                const line = editor.selection.active.line;
                const lineLength = editor.document.lineAt(line).text.length;
                this.addChangeToHistory(fileName, [line], lineLength);
            }
            this.onHighlightChanges();
        });

        workspace.onDidChangeConfiguration((event) => {
            if (!event.affectsConfiguration("footsteps")) {
                return;
            }
            this.onSyncWithSettings();
            this.createDecorationTypes();
        });

        workspace.onDidSaveTextDocument((document) => {
            const editor = window.activeTextEditor;
            if (this.clearChangesOnFileSave && editor) {
                this.onClearChangesWithinFile(document, editor);
            }
        });
    }

    private onSyncWithSettings(): void {
        const userSetting = workspace.getConfiguration("footsteps");

        if (this.doHighlightChanges && !userSetting.doHighlightChanges) {
            this.clearChanges();
        }

        this.maxNumberOfChangesToRemember = userSetting.maxNumberOfChangesToRemember;
        this.clearChangesOnFileSave = userSetting.clearChangesOnFileSave;
        this.maxNumberOfChangesToHighlight = userSetting.maxNumberOfChangesToHighlight;
        this.minDistanceFromCursorToHighlight = userSetting.minDistanceFromCursorToHighlight;
        this.highlightColor = userSetting.highlightColor;
        this.doHighlightChanges = userSetting.doHighlightChanges;
        this.doHighlightOnClick = userSetting.doHighlightOnClick;
        this.doHighlightEmptyLines = userSetting.doHighlightEmptyLines;
        this.doHighlightInactiveEditors = userSetting.doHighlightInactiveEditors;
        this.highlightColorMaxOpacity = userSetting.highlightColorMaxOpacity;
        this.highlightColorFocusedOpacity = userSetting.highlightColorFocusedOpacity;
        this.doHighlightCurrentlyFocusedChunk = userSetting.doHighlightCurrentlyFocusedChunk;
        this.doHighlightChangesPerLanguage = {};
    }

    private createDecorationTypes(): void {
        const maxFilesToHighlight = 10;
        this.decorationTypes = new Array(maxFilesToHighlight).fill(0).map(() => (
            this.getDecorationTypes()
        ));
    }

    private getDecorationTypes(): TextEditorDecorationType[] {
        const getOpacity = (index: number) => {
            const percentAlong = index / this.maxNumberOfChangesToHighlight;
            return this.highlightColorMaxOpacity * (1 - percentAlong);
        };

        return new Array(this.maxNumberOfChangesToHighlight).fill(0).map((_, i) =>
            window.createTextEditorDecorationType({
                backgroundColor: [
                    this.highlightColor.replace("rgb", "rgba").replace(/\)/g, ""),
                    ", ",
                    getOpacity(i),
                    ")",
                ].join(""),
                isWholeLine: true,
            })
        );
    }

    private getFocusedDecorationTypes(): TextEditorDecorationType {
        return window.createTextEditorDecorationType({
            backgroundColor: [
                this.highlightColor.replace("rgb", "rgba").replace(/\)/g, ""),
                ", ",
                this.highlightColorFocusedOpacity,
                ")",
            ].join(""),
            isWholeLine: true,
        });
    }

    private isCodeEditor(document: TextDocument): boolean {
        return document.uri.scheme === "file";
    }

    private addChangeToHistory(
        fileName: string,
        lines: number[],
        character: number
    ): void {
        this.currentHistoryIndex = 0;

        const overlappingChangeIndex = this.history
            .slice(0, this.maxNumberOfChangesToHighlight)
            .findIndex(
                ([changeFileName, changeLines]: HistoryItem) =>
                    changeFileName === fileName &&
                    changeLines.find(
                        (line) =>
                            lines.includes(line) ||
                            lines.includes(line - 1) ||
                            lines.includes(line + 1)
                    )
            );

        const lastPosition = [lines.slice(-1)[0], character];

        if (overlappingChangeIndex !== -1) {
            const oldLines = this.history[overlappingChangeIndex][1];
            const newLines = [...new Set([...lines, ...oldLines])];
            this.history = [
                [fileName, newLines, lastPosition],
                ...this.history.slice(0, overlappingChangeIndex),
                ...this.history.slice(overlappingChangeIndex + 1),
            ];
        } else {
            this.history = [[fileName, lines, lastPosition], ...this.history];
        }
        this.history = this.history.slice(0, this.maxNumberOfChangesToRemember);
    }

    private getChangesInFile(fileName: string): History {
        return this.history.filter(
            ([changeFileName]: HistoryItem) => changeFileName === fileName
        );
    }

    private getChangesInOtherFiles(fileName: string): History {
        return this.history.filter(
            ([changeFileName]: HistoryItem) => changeFileName !== fileName
        );
    }

    public onTimeTravel(
        diff: number = 0,
        restriction: "any" | "within-file" | "across-files" = "any"
    ): void {
        const editor = window.activeTextEditor;
        const fileName = editor?.document.fileName || "";

        const changes =
            restriction === "any"
                ? this.history
                : restriction === "within-file"
                    ? this.getChangesInFile(fileName)
                    : restriction === "across-files"
                        ? this.getChangesInOtherFiles(fileName)
                        : [];

        let newHistoryIndex = this.currentHistoryIndex - diff;
        newHistoryIndex = Math.max(0, newHistoryIndex);
        newHistoryIndex = Math.min(newHistoryIndex, changes.length - 1);
        const [newFileName, newLines, newPosition] = changes[newHistoryIndex];

        if (!newLines) {
            return;
        }

        this.currentHistoryIndex = newHistoryIndex;

        const newSelectionLine = newPosition[0];
        const newSelectionChar = newPosition[1] + 1;

        this.onUpdateSelection(newFileName, newSelectionLine, newSelectionChar);
    }

    private onUpdateSelection(
        fileName: string,
        line: number,
        character: number
    ): void {
        const newPosition = new Position(line, character);
        const newSelection = new Selection(newPosition, newPosition);

        const newVisibleRange = new Range(
            new Position(line, character),
            new Position(line, character)
        );

        workspace.openTextDocument(Uri.file(fileName)).then((doc) => {
            window.showTextDocument(doc).then((editor) => {
                if (!editor) {
                    return;
                }
                editor.selection = newSelection;
                editor.revealRange(newVisibleRange, 2);
            });
        });
    }

    public onTextChange(
        contentChanges: TextDocumentContentChangeEvent[],
        document: TextDocument
    ) {
        if (!contentChanges.length) {
            return;
        }

        this.history = this.history.map((step) =>
            this.updateStepWithContentChanges(step, contentChanges)
        );

        const newText = contentChanges[0].text;

        if (!newText || !newText.replace(/[\n| ]/g, "").length) {
            return;
        }

        let linesSet = new Set();

        contentChanges.forEach(({ range, rangeLength, text }) => {
            const linesStart: number = range.start.line;
            const linesEnd = range.end.line;
            const linesText = text.split("\n");
            const numberOfLines = linesEnd - linesStart + 1;
            const numberOfNewLines = linesText.length - 1;
            const numberOfLinesDeleted = rangeLength
                ? range.end.line - range.start.line
                : 0;

            new Array(numberOfLines + numberOfNewLines - numberOfLinesDeleted)
                .fill(0)
                .forEach((_, i: number) => {
                    if (linesText[i]?.trim() !== "" || this.doHighlightEmptyLines) {
                        linesSet.add(linesStart + i);
                    }
                });
        });

        const lines = [...linesSet] as number[];
        const char = contentChanges.slice(-1)[0].range.end.character + 1;

        this.addChangeToHistory(document.fileName, lines, char);
        this.onHighlightChanges();
    }

    private clearDecoration = window.createTextEditorDecorationType({
        backgroundColor: "rgba(0,0,0,0.001)",
        isWholeLine: true,
    });

    public async onClearChangesWithinFile(document: TextDocument, editor: TextEditor) {
        this.history = this.history.filter(
            ([changeFileName]: HistoryItem) => changeFileName !== document.fileName
        );
        const visibleEditorIndex = window.visibleTextEditors.findIndex(
            (visibleEditor) => visibleEditor.document.fileName === document.fileName
        );
        this.clearChanges(visibleEditorIndex);
        this.onHighlightChanges();
        this.currentHistoryIndex = 0;
    }

    public async onClearProjectChanges() {
        this.history = [];
        this.clearChanges();
        this.onHighlightChanges();
        this.currentHistoryIndex = 0;
    }
    
    private clearChanges(visibleEditorIndex?: number) {
        let index = 0;
        for (const fileDecorations of this.decorationTypes) {
            if (!Number.isInteger(visibleEditorIndex) || index === visibleEditorIndex) {
                for (const decoration of fileDecorations) {
                    decoration.dispose();
                }
                this.decorationTypes[index] = this.getDecorationTypes();
            }
            index++;
        }
        
        this.focusedDecorationTypes.forEach(decoration => {
            decoration.dispose();
        });
        this.focusedDecorationTypes.clear();
    }
    
    private updateStepWithContentChanges(
        [stepFileName, lines, lastPosition]: HistoryItem,
        contentChanges: TextDocumentContentChangeEvent[]
    ): HistoryItem {
        const editor = window.activeTextEditor;
        const fileName = editor?.document.fileName;
    
        if (stepFileName !== fileName) {
            return [stepFileName, lines, lastPosition];
        }
    
        let newLines = [...lines];
        let newLastLine = lastPosition[0];
        let newLastChar = lastPosition[1];
    
        contentChanges.forEach(({ range, text }) => {
            const linesAdded = text.split("\n").length - 1;
            const linesRemoved = range.end.line - range.start.line;
            const lineDelta = linesAdded - linesRemoved;
    
            newLines = newLines.map(line => {
                if (line < range.start.line) {
                    return line;
                } else if (line === range.start.line) {
                    return line;
                } else if (line <= range.end.line) {
                    return -1;
                } else {
                    return line + lineDelta;
                }
            }).filter(line => line >= 0);
    
            if (newLastLine > range.end.line) {
                newLastLine += lineDelta;
            } else if (newLastLine === range.end.line) {
                newLastChar = Math.max(0, newLastChar + text.length - (range.end.character - range.start.character));
            }
        });
    
        return [fileName, Array.from(new Set(newLines)), [newLastLine, newLastChar]];
    }
    
    public async onHighlightChanges(): Promise<void> {
        if (!this.doHighlightChanges) return;
    
        const highlightChangesInEditor = (editor: TextEditor, editorIndex: number) => {
            const uri = editor.document.uri.fsPath;
            if (this.editorFileNames[editorIndex] !== uri) {
                const existingIndex = this.editorFileNames.indexOf(uri);
                if (existingIndex !== -1) {
                    this.clearChanges(existingIndex);
                }
                this.editorFileNames[editorIndex] = uri;
            }
    
            const isCodeEditor = this.isCodeEditor(editor.document);
            if (!isCodeEditor) return;
    
            const language = editor.document.languageId;
            const doHighlightChangesForLanguage = this.doHighlightChangesPerLanguage[language]
                || workspace.getConfiguration("footsteps", {
                    languageId: language,
                }).doHighlightChanges;
            if (!doHighlightChangesForLanguage) return;
    
            const fileName = editor.document.fileName || "";
            
            const currentRange = editor.selection ? 
                [editor.selection.start.line, editor.selection.end.line] : [0, 0];
    
            const fileChanges = this.getChangesInFile(fileName);
            
            const newDecorations: Map<string, { range: Range[], decoration: TextEditorDecorationType }> = new Map();
            
            const decorationsToKeep: Set<string> = new Set();
    
            fileChanges.forEach(([_, lines], index: number) => {
                let filteredLines = lines;
                let focusedLines: number[] = [];
                
                if (editor.selection && this.minDistanceFromCursorToHighlight) {
                    const farLines: number[] = [];
                    const nearLines: number[] = [];
                    
                    lines.forEach(line => {
                        const isLineAboveCursor = line < currentRange[0] - this.minDistanceFromCursorToHighlight;
                        const isLineBelowCursor = line > currentRange[1] + this.minDistanceFromCursorToHighlight;
                        
                        if (isLineAboveCursor || isLineBelowCursor) {
                            farLines.push(line);
                        } else {
                            nearLines.push(line);
                        }
                    });
                    
                    filteredLines = farLines;
                    
                    if (nearLines.length > 0) {
                        focusedLines = nearLines;
                    }
                }
                
                if (editor.selection) {
                    const linesRange = [Math.min(...lines), Math.max(...lines)];
                    const isCurrentChunk =
                        linesRange[0] <= currentRange[0] && linesRange[1] >= currentRange[1];
                    
                    if (isCurrentChunk) {
                        if (this.doHighlightCurrentlyFocusedChunk) {
                            focusedLines = [...new Set([...focusedLines, ...lines])];
                            filteredLines = filteredLines.filter(line => !focusedLines.includes(line));
                        } else {
                            filteredLines = [];
                            focusedLines = [];
                        }
                    }
                }
                
                if (filteredLines.length > 0 && this.decorationTypes?.[editorIndex]?.[index]) {
                    const ranges = filteredLines.map(line => 
                        new Range(new Position(line, 0), new Position(line, Number.MAX_SAFE_INTEGER))
                    );
                    const decorationKey = `standard-${fileName}-${index}`;
                    newDecorations.set(decorationKey, {
                        range: ranges,
                        decoration: this.decorationTypes[editorIndex][index]
                    });
                    decorationsToKeep.add(decorationKey);
                }
                
                if (focusedLines.length > 0) {
                    const decorationKey = `focused-${fileName}-${index}`;
                    decorationsToKeep.add(decorationKey);
                    
                    let focusedDecoration: TextEditorDecorationType;
                    if (this.focusedDecorationTypes.has(decorationKey)) {
                        focusedDecoration = this.focusedDecorationTypes.get(decorationKey)!;
                    } else {
                        focusedDecoration = this.getFocusedDecorationTypes();
                        this.focusedDecorationTypes.set(decorationKey, focusedDecoration);
                    }
                    
                    const ranges = focusedLines.map(line => 
                        new Range(new Position(line, 0), new Position(line, Number.MAX_SAFE_INTEGER))
                    );
                    
                    newDecorations.set(decorationKey, {
                        range: ranges,
                        decoration: focusedDecoration
                    });
                }
            });
            
            newDecorations.forEach(({ range, decoration }) => {
                editor.setDecorations(decoration, range);
            });
            
            this.focusedDecorationTypes.forEach((decoration, key) => {
                if (!decorationsToKeep.has(key)) {
                    editor.setDecorations(decoration, []);
                    decoration.dispose();
                    this.focusedDecorationTypes.delete(key);
                }
            });
        };
    
        const editors = this.doHighlightInactiveEditors ? window.visibleTextEditors : [window.activeTextEditor];
        editors.forEach((editor, i) => {
            if (!editor) return;
            highlightChangesInEditor(editor, i);
        });
    }
}
