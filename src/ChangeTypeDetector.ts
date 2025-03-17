import * as vscode from 'vscode';

/**
 * Types de modifications possibles sur un document
 */
export enum ChangeType {
    CREATE_LINE = 'create_line',
    DELETE_LINE = 'delete_line',
    EDIT = 'edit',
    REVERT = 'revert'
}

/**
 * Interface représentant une modification détectée
 */
export interface DocumentChange {
    type: ChangeType;
    lineNumber: number;
    content?: string;
    previousContent?: string;
    timestamp: number;
}

/**
 * Classe responsable de la détection précise des types de modifications
 */
export class ChangeTypeDetector {
    // Cache des documents pour chaque URI (clé: URI, valeur: tableau de lignes)
    private documentCache: Map<string, string[]> = new Map();
    
    // Historique des modifications pour détecter les annulations (clé: URI, valeur: tableau de modifications)
    private changeHistory: Map<string, DocumentChange[]> = new Map();
    
    // Taille maximale de l'historique par document
    private readonly MAX_HISTORY_SIZE = 50;
    
    /**
     * Initialise le cache pour un document
     */
    public cacheDocument(document: vscode.TextDocument): void {
        const uri = document.uri.toString();
        const lines: string[] = [];
        
        for (let i = 0; i < document.lineCount; i++) {
            lines.push(document.lineAt(i).text);
        }
        
        this.documentCache.set(uri, lines);
        
        // Initialiser l'historique des modifications si nécessaire
        if (!this.changeHistory.has(uri)) {
            this.changeHistory.set(uri, []);
        }
    }
    
    /**
     * Détecte les types de modifications à partir d'un événement de changement de document
     */
    public detectChanges(event: vscode.TextDocumentChangeEvent): DocumentChange[] {
        const document = event.document;
        const uri = document.uri.toString();
        
        // Si le document n'est pas dans le cache, l'initialiser
        if (!this.documentCache.has(uri)) {
            this.cacheDocument(document);
            return []; // Pas de modifications à détecter lors de l'initialisation
        }
        
        const oldLines = this.documentCache.get(uri) || [];
        const newLines: string[] = [];
        
        // Construire le nouvel état du document
        for (let i = 0; i < document.lineCount; i++) {
            newLines.push(document.lineAt(i).text);
        }
        
        const changes: DocumentChange[] = [];
        
        // Analyser chaque modification signalée par VSCode
        for (const change of event.contentChanges) {
            const detectedChanges = this.analyzeChange(change, oldLines, newLines, uri);
            changes.push(...detectedChanges);
        }
        
        // Détecter les annulations en comparant avec l'historique
        const revertChanges = this.detectReverts(changes, uri);
        
        // Mettre à jour l'historique des modifications
        this.updateChangeHistory(uri, revertChanges.length > 0 ? revertChanges : changes);
        
        // Mettre à jour le cache du document
        this.documentCache.set(uri, newLines);
        
        return revertChanges.length > 0 ? revertChanges : changes;
    }
    
    /**
     * Analyse une modification spécifique pour déterminer son type
     */
    private analyzeChange(
        change: vscode.TextDocumentContentChangeEvent,
        oldLines: string[],
        newLines: string[],
        uri: string
    ): DocumentChange[] {
        const result: DocumentChange[] = [];
        const startLine = change.range.start.line;
        const endLine = change.range.end.line;
        const text = change.text;
        
        // Cas 1: Suppression de ligne(s)
        if (text === '' && startLine !== endLine) {
            // Une ou plusieurs lignes ont été supprimées
            for (let i = startLine; i <= endLine; i++) {
                if (i < oldLines.length) {
                    result.push({
                        type: ChangeType.DELETE_LINE,
                        lineNumber: i,
                        previousContent: oldLines[i],
                        timestamp: Date.now()
                    });
                }
            }
            return result;
        }
        
        // Cas 2: Ajout de nouvelle(s) ligne(s)
        const newLineCount = text.split('\n').length - 1;
        if (newLineCount > 0) {
            // Vérifier si c'est une création de ligne ou une édition avec ajout de lignes
            if (startLine === endLine && change.range.start.character === 0 && 
                change.range.end.character === 0) {
                // Création pure de nouvelles lignes
                for (let i = 0; i < newLineCount; i++) {
                    const lineNumber = startLine + i;
                    result.push({
                        type: ChangeType.CREATE_LINE,
                        lineNumber,
                        content: newLines[lineNumber],
                        timestamp: Date.now()
                    });
                }
            } else {
                // Édition qui a créé de nouvelles lignes
                // La première ligne est une édition
                result.push({
                    type: ChangeType.EDIT,
                    lineNumber: startLine,
                    content: newLines[startLine],
                    previousContent: oldLines[startLine],
                    timestamp: Date.now()
                });
                
                // Les lignes suivantes sont des créations
                for (let i = 1; i <= newLineCount; i++) {
                    const lineNumber = startLine + i;
                    result.push({
                        type: ChangeType.CREATE_LINE,
                        lineNumber,
                        content: newLines[lineNumber],
                        timestamp: Date.now()
                    });
                }
            }
            return result;
        }
        
        // Cas 3: Édition simple d'une ligne
        if (startLine === endLine && startLine < oldLines.length && startLine < newLines.length) {
            const oldContent = oldLines[startLine];
            const newContent = newLines[startLine];
            
            if (oldContent !== newContent) {
                result.push({
                    type: ChangeType.EDIT,
                    lineNumber: startLine,
                    content: newContent,
                    previousContent: oldContent,
                    timestamp: Date.now()
                });
            }
        }
        
        return result;
    }
    
    /**
     * Détecte si les modifications actuelles sont des annulations
     */
    private detectReverts(changes: DocumentChange[], uri: string): DocumentChange[] {
        if (changes.length === 0) return [];
        
        const history = this.changeHistory.get(uri) || [];
        if (history.length === 0) return [];
        
        const result: DocumentChange[] = [];
        
        // Parcourir les modifications actuelles
        for (const change of changes) {
            // Chercher dans l'historique récent une modification qui serait annulée
            for (let i = 0; i < history.length; i++) {
                const historicChange = history[i];
                
                // Vérifier si c'est une annulation potentielle
                if (this.isRevertOf(change, historicChange)) {
                    result.push({
                        type: ChangeType.REVERT,
                        lineNumber: change.lineNumber,
                        content: change.content,
                        previousContent: change.previousContent,
                        timestamp: Date.now()
                    });
                    break;
                }
            }
            
            // Si aucune annulation n'a été détectée pour ce changement, le conserver tel quel
            if (!result.some(r => r.lineNumber === change.lineNumber)) {
                result.push(change);
            }
        }
        
        return result;
    }
    
    /**
     * Vérifie si un changement est l'annulation d'un changement historique
     */
    private isRevertOf(current: DocumentChange, historic: DocumentChange): boolean {
        // Si les numéros de ligne ne correspondent pas, ce n'est pas une annulation
        if (current.lineNumber !== historic.lineNumber) return false;
        
        // Cas 1: Annulation d'une suppression = création avec le même contenu
        if (current.type === ChangeType.CREATE_LINE && 
            historic.type === ChangeType.DELETE_LINE &&
            current.content === historic.previousContent) {
            return true;
        }
        
        // Cas 2: Annulation d'une création = suppression
        if (current.type === ChangeType.DELETE_LINE && 
            historic.type === ChangeType.CREATE_LINE &&
            current.previousContent === historic.content) {
            return true;
        }
        
        // Cas 3: Annulation d'une édition = édition qui restaure le contenu précédent
        if (current.type === ChangeType.EDIT && 
            historic.type === ChangeType.EDIT &&
            current.content === historic.previousContent) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Met à jour l'historique des modifications pour un document
     */
    private updateChangeHistory(uri: string, changes: DocumentChange[]): void {
        if (changes.length === 0) return;
        
        let history = this.changeHistory.get(uri) || [];
        
        // Ajouter les nouvelles modifications au début de l'historique
        history = [...changes, ...history];
        
        // Limiter la taille de l'historique
        if (history.length > this.MAX_HISTORY_SIZE) {
            history = history.slice(0, this.MAX_HISTORY_SIZE);
        }
        
        this.changeHistory.set(uri, history);
    }
    
    /**
     * Efface l'historique des modifications pour un document
     */
    public clearHistory(uri: string): void {
        this.changeHistory.set(uri, []);
    }
    
    /**
     * Efface l'historique de tous les documents
     */
    public clearAllHistory(): void {
        this.changeHistory.clear();
    }
}
