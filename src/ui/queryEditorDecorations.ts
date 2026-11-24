import * as vscode from 'vscode';
import { QueryEditorBindings } from '../services/queryEditorBindings';
import { DBConnection } from '../types';

export const CONNECTION_COLORS: { label: string; id: string | undefined }[] = [
  { label: 'None', id: undefined },
  { label: 'Red', id: 'charts.red' },
  { label: 'Orange', id: 'charts.orange' },
  { label: 'Yellow', id: 'charts.yellow' },
  { label: 'Green', id: 'charts.green' },
  { label: 'Blue', id: 'charts.blue' },
  { label: 'Purple', id: 'charts.purple' },
];

export function connectionThemeColor(connection: DBConnection): vscode.ThemeColor | undefined {
  return connection.color ? new vscode.ThemeColor(connection.color) : undefined;
}

function connectionBadge(name: string): string {
  const parts = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const badge = parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] ?? name).slice(0, 2);
  return badge.toUpperCase();
}

/**
 * Shows a connection badge/color on editor tabs and explorer entries for bound SQL files
 */
export class QueryEditorDecorationProvider implements vscode.FileDecorationProvider {
  readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[] | undefined>;

  constructor(private readonly bindings: QueryEditorBindings) {
    this.onDidChangeFileDecorations = bindings.onDidChange;
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const connection = this.bindings.getConnection(uri);
    if (!connection) {
      return undefined;
    }
    return new vscode.FileDecoration(
      connectionBadge(connection.name),
      `RDS connection: ${connection.name}`,
      connectionThemeColor(connection)
    );
  }
}

/**
 * Adds "connection | run" actions at the top of every SQL editor
 */
export class QueryEditorCodeLensProvider implements vscode.CodeLensProvider {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changeEmitter.event;

  constructor(private readonly bindings: QueryEditorBindings) {
    bindings.onDidChange(() => this.changeEmitter.fire());
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const range = new vscode.Range(0, 0, 0, 0);
    const connection = this.bindings.getConnection(document.uri);

    return [
      new vscode.CodeLens(range, {
        title: connection
          ? `$(database) ${connection.name} (${connection.databaseName})`
          : '$(database) Select connection',
        tooltip: 'Change the connection used by this editor',
        command: 'rds-explorer.selectQueryConnection',
        arguments: [document.uri],
      }),
      new vscode.CodeLens(range, {
        title: '$(play) Run',
        tooltip: 'Execute the selection, or the whole editor',
        command: 'rds-explorer.executeQuery',
      }),
    ];
  }
}
