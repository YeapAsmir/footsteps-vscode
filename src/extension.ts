import * as vscode from 'vscode';
import { TracesProvider } from './TracesProvider';
import { ChangeTypeDetector, ChangeType, DocumentChange } from './ChangeTypeDetector';

// Instance du détecteur de modifications
let changeDetector: ChangeTypeDetector;

// Instance du fournisseur de traces
let tracesProvider: TracesProvider;

// Fonction d'activation de l'extension
export function activate(context: vscode.ExtensionContext) {
    // Initialiser le détecteur de modifications
    changeDetector = new ChangeTypeDetector();
    
    // Initialiser le fournisseur de traces
    tracesProvider = new TracesProvider();
    
    // Enregistrer les commandes de l'extension
    context.subscriptions.push(
        vscode.commands.registerCommand('traces.skipBack', () => {
            tracesProvider.onTimeTravel(1);
        }),
        vscode.commands.registerCommand('traces.skipForwards', () => {
            tracesProvider.onTimeTravel(-1);
        }),
        vscode.commands.registerCommand('traces.skipBackSameFile', () => {
            tracesProvider.onTimeTravel(1, 'within-file');
        }),
        vscode.commands.registerCommand('traces.skipForwardsSameFile', () => {
            tracesProvider.onTimeTravel(-1, 'within-file');
        }),
        vscode.commands.registerCommand('traces.skipBackDifferentFile', () => {
            tracesProvider.onTimeTravel(1, 'across-files');
        }),
        vscode.commands.registerCommand('traces.skipForwardsDifferentFile', () => {
            tracesProvider.onTimeTravel(-1, 'across-files');
        }),
        vscode.commands.registerCommand('traces.clearChangesWithinFile', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                tracesProvider.onClearChangesWithinFile(editor.document, editor);
                // Effacer également l'historique des modifications dans le détecteur
                changeDetector.clearHistory(editor.document.uri.toString());
            }
        }),
        vscode.commands.registerCommand('traces.clearProjectChanges', () => {
            tracesProvider.onClearProjectChanges();
            // Effacer également tout l'historique des modifications dans le détecteur
            changeDetector.clearAllHistory();
        }),
        vscode.commands.registerCommand('traces.toggleHighlightingLines', () => {
            const config = vscode.workspace.getConfiguration('traces');
            const currentValue = config.get('doHighlightChanges');
            config.update('doHighlightChanges', !currentValue, true);
        })
    );
    
    // Écouter les événements d'ouverture de document
    vscode.workspace.onDidOpenTextDocument(document => {
        // Initialiser le cache du document dans le détecteur
        changeDetector.cacheDocument(document);
    });
    
    // Écouter les modifications du document
    vscode.workspace.onDidChangeTextDocument(event => {
        // Détecter les types de modifications
        const changes = changeDetector.detectChanges(event);
        
        // Afficher les types de modifications dans la console
        logChanges(changes);
        
        // Transmettre les modifications au fournisseur de traces
        tracesProvider.onTextChange(Array.from(event.contentChanges), event.document);
    });
    
    // Initialiser le cache pour tous les documents déjà ouverts
    vscode.workspace.textDocuments.forEach(document => {
        changeDetector.cacheDocument(document);
    });
}

/**
 * Affiche les modifications détectées dans la console
 */
function logChanges(changes: DocumentChange[]): void {
    for (const change of changes) {
        switch (change.type) {
            case ChangeType.CREATE_LINE:
                console.log(`➕ Create line: ${change.lineNumber} - "${change.content}"`);
                break;
            case ChangeType.DELETE_LINE:
                console.log(`❌ Delete line: ${change.lineNumber} - "${change.previousContent}"`);
                break;
            case ChangeType.EDIT:
                console.log(`✏️ Edit line: ${change.lineNumber}`);
                console.log(`   Avant: "${change.previousContent}"`);
                console.log(`   Après: "${change.content}"`);
                break;
            case ChangeType.REVERT:
                console.log(`🔄 Revert detected on line: ${change.lineNumber}`);
                if (change.previousContent && change.content) {
                    console.log(`   De: "${change.previousContent}"`);
                    console.log(`   À: "${change.content}"`);
                }
                break;
        }
    }
}

// Fonction de désactivation de l'extension
export function deactivate() {
    // Rien à faire ici pour l'instant
}
