import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { DBConnection } from '../types';
import { CodeViewerProvider } from '../ui/codeViewer';

const STORAGE_KEY = 'rds-explorer-query-bindings';

/**
 * Tracks which connection each SQL document runs against.
 * Bindings for saved files persist per workspace; untitled ones are dropped when closed.
 */
export class QueryEditorBindings implements vscode.Disposable {
  private readonly bindings: Map<string, string>;
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri[] | undefined>();
  private readonly disposables: vscode.Disposable[] = [];
  private untitledCounter = 0;

  /** Fires with the affected URIs, or `undefined` when all bindings may have changed */
  readonly onDidChange = this.changeEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly connectionManager: ConnectionManager
  ) {
    const stored = context.workspaceState.get<Record<string, string>>(STORAGE_KEY, {});
    this.bindings = new Map(Object.entries(stored));

    this.disposables.push(
      this.changeEmitter,
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.isUntitled) {
          void this.delete(document.uri);
        }
      })
    );
  }

  getConnection(uri: vscode.Uri): DBConnection | undefined {
    const connectionId =
      CodeViewerProvider.connectionIdFor(uri) ?? this.bindings.get(uri.toString());
    return connectionId ? this.connectionManager.getConnection(connectionId) : undefined;
  }

  async set(uri: vscode.Uri, connectionId: string): Promise<void> {
    if (this.bindings.get(uri.toString()) === connectionId) {
      return;
    }
    this.bindings.set(uri.toString(), connectionId);
    await this.save();
    this.changeEmitter.fire([uri]);
  }

  async delete(uri: vscode.Uri): Promise<void> {
    if (this.bindings.delete(uri.toString())) {
      await this.save();
      this.changeEmitter.fire([uri]);
    }
  }

  /** Call after a connection is edited or deleted so decorations refresh */
  notifyConnectionsChanged(): void {
    this.changeEmitter.fire(undefined);
  }

  /**
   * Opens a new untitled SQL editor named after the connection (e.g. `prod-db-1.sql`)
   * so the editor tab itself shows which database it targets.
   */
  async openQueryEditor(connection: DBConnection | undefined, content = ''): Promise<void> {
    const document = connection
      ? await this.openNamedUntitled(connection)
      : await vscode.workspace.openTextDocument({ language: 'sql', content: '' });

    if (connection) {
      await this.set(document.uri, connection.id);
    }

    const editor = await vscode.window.showTextDocument(document);
    if (content) {
      await editor.edit((builder) => builder.insert(new vscode.Position(0, 0), content));
    }
  }

  private async openNamedUntitled(connection: DBConnection): Promise<vscode.TextDocument> {
    const baseName = connection.name.replace(/[\\/:*?"<>|\s]+/g, '-');
    const openUris = new Set(vscode.workspace.textDocuments.map((doc) => doc.uri.toString()));

    let uri: vscode.Uri;
    do {
      this.untitledCounter += 1;
      uri = vscode.Uri.from({
        scheme: 'untitled',
        path: `${baseName}-${this.untitledCounter}.sql`,
      });
    } while (openUris.has(uri.toString()));

    const document = await vscode.workspace.openTextDocument(uri);
    return document.languageId === 'sql'
      ? document
      : vscode.languages.setTextDocumentLanguage(document, 'sql');
  }

  private async save(): Promise<void> {
    const persisted: Record<string, string> = {};
    for (const [uri, connectionId] of this.bindings) {
      if (!uri.startsWith('untitled:')) {
        persisted[uri] = connectionId;
      }
    }
    await this.context.workspaceState.update(STORAGE_KEY, persisted);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
