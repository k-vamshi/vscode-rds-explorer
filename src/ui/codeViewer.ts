import * as vscode from 'vscode';
import { DBConnection } from '../types';

export const DEFINITION_SCHEME = 'rds-definition';

export type DefinitionKind = 'view' | 'function' | 'procedure' | 'trigger' | 'type' | 'sequence';

/**
 * Shows object definitions in read-only native SQL editors (theme-aware syntax
 * highlighting, folding, find, minimap) instead of a custom webview.
 */
export class CodeViewerProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private readonly bodies = new Map<string, string>();
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changeEmitter.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return (
      this.contents.get(uri.toString()) ??
      '-- This definition is no longer loaded. Reopen it from the RDS Explorer.'
    );
  }

  async showDefinition(
    connection: DBConnection,
    kind: DefinitionKind,
    schema: string,
    name: string,
    definition: string
  ): Promise<void> {
    const folder = connection.name.replace(/[\\/:*?"<>|]+/g, '-');
    const uri = vscode.Uri.from({
      scheme: DEFINITION_SCHEME,
      path: `/${folder}/${schema}.${name} (${kind}).sql`,
      query: new URLSearchParams({ connectionId: connection.id }).toString(),
    });

    const body = definition.trim();
    const statement = body.endsWith(';') || body.startsWith('--') ? body : `${body};`;
    const content = [
      `-- ${kind[0].toUpperCase()}${kind.slice(1)}: ${schema}.${name}`,
      `-- Connection: ${connection.name} (${connection.databaseName})`,
      '',
      statement,
      '',
    ].join('\n');

    this.contents.set(uri.toString(), content);
    this.bodies.set(uri.toString(), `${statement}\n`);
    this.changeEmitter.fire(uri);

    let document = await vscode.workspace.openTextDocument(uri);
    if (document.languageId !== 'sql') {
      document = await vscode.languages.setTextDocumentLanguage(document, 'sql');
    }
    await vscode.window.showTextDocument(document, { preview: true });
  }

  /** The definition statement without the header comment */
  getBody(uri: vscode.Uri): string | undefined {
    return this.bodies.get(uri.toString());
  }

  provideCodeLenses(): vscode.CodeLens[] {
    return [
      new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
        title: '$(edit) Open in Query Editor',
        tooltip: 'Copy this definition into an editable query editor for the same connection',
        command: 'rds-explorer.openDefinitionAsQuery',
      }),
    ];
  }

  static connectionIdFor(uri: vscode.Uri): string | undefined {
    return uri.scheme === DEFINITION_SCHEME
      ? (new URLSearchParams(uri.query).get('connectionId') ?? undefined)
      : undefined;
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}
