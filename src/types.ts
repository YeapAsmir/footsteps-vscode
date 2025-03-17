import { Range } from "vscode";
import { ChangeType } from "./ChangeTypeDetector";

export type HistoryItem = [string, number[], number[]];
export type History = HistoryItem[];

/**
 * Interface pour stocker les informations sur une modification avec son type
 */
export interface TypedChange {
    fileName: string;
    lineNumber: number;
    type: ChangeType;
    content?: string;
    previousContent?: string;
    timestamp: number;
}

/**
 * Type pour l'historique des modifications typées
 */
export type TypedChangeHistory = TypedChange[];
