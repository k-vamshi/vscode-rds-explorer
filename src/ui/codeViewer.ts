import * as vscode from 'vscode';
import { DatabaseMetadata } from '../services/databaseMetadata';

export class CodeViewerProvider {
  async showViewDefinition(
    context: vscode.ExtensionContext,
    metadata: DatabaseMetadata,
    schema: string,
    viewName: string
  ): Promise<void> {
    const definition = await metadata.getViewDefinition(schema, viewName);
    this.showCodePanel(context, `${viewName} (View)`, definition, 'sql');
  }

  async showFunctionDefinition(
    context: vscode.ExtensionContext,
    metadata: DatabaseMetadata,
    schema: string,
    functionName: string
  ): Promise<void> {
    const definition = await metadata.getFunctionDefinition(schema, functionName);
    this.showCodePanel(context, `${functionName} (Function)`, definition, 'sql');
  }

  async showProcedureDefinition(
    context: vscode.ExtensionContext,
    metadata: DatabaseMetadata,
    schema: string,
    procedureName: string
  ): Promise<void> {
    const definition = await metadata.getProcedureDefinition(schema, procedureName);
    this.showCodePanel(context, `${procedureName} (Procedure)`, definition, 'sql');
  }

  async showTriggerDefinition(
    context: vscode.ExtensionContext,
    metadata: DatabaseMetadata,
    schema: string,
    triggerName: string
  ): Promise<void> {
    const definition = await metadata.getTriggerDefinition(schema, triggerName);
    this.showCodePanel(context, `${triggerName} (Trigger)`, definition, 'sql');
  }

  async showTypeDefinition(
    context: vscode.ExtensionContext,
    metadata: DatabaseMetadata,
    schema: string,
    typeName: string
  ): Promise<void> {
    const definition = await metadata.getTypeDefinition(schema, typeName);
    this.showCodePanel(context, `${typeName} (Type)`, definition, 'sql');
  }

  async showSequenceDefinition(
    context: vscode.ExtensionContext,
    metadata: DatabaseMetadata,
    schema: string,
    sequenceName: string
  ): Promise<void> {
    const definition = await metadata.getSequenceDefinition(schema, sequenceName);
    this.showCodePanel(context, `${sequenceName} (Sequence)`, definition, 'sql');
  }

  private showCodePanel(
    context: vscode.ExtensionContext,
    title: string,
    code: string,
    language: string
  ): void {
    const panel = vscode.window.createWebviewPanel('rdsCodeView', title, vscode.ViewColumn.Two, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });

    const html = this.getHtmlContent(title, code, language);
    panel.webview.html = html;

    // Add copy button functionality
    panel.webview.onDidReceiveMessage(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (message: unknown) => {
        vscode.env.clipboard.writeText(code);
        vscode.window.showInformationMessage('SQL code copied to clipboard!');
      }
    );
  }

  private getHtmlContent(title: string, code: string, language: string): string {
    const escapedCode = this.escapeHtml(code);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body {
              font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
              color: #e0e0e0;
              background-color: #1e1e1e;
              margin: 0;
              padding: 0;
            }
            .header {
              background-color: #252526;
              padding: 16px;
              border-bottom: 1px solid #3e3e42;
              display: flex;
              justify-content: space-between;
              align-items: center;
              position: sticky;
              top: 0;
              z-index: 100;
            }
            .title {
              font-size: 14px;
              font-weight: 600;
              color: #cccccc;
              margin: 0;
            }
            .badge {
              display: inline-block;
              background-color: #007acc;
              color: white;
              padding: 2px 8px;
              border-radius: 3px;
              font-size: 11px;
              margin-left: 8px;
            }
            .copy-btn {
              background-color: #007acc;
              color: white;
              border: none;
              padding: 6px 12px;
              border-radius: 3px;
              cursor: pointer;
              font-size: 12px;
              transition: background-color 0.2s;
            }
            .copy-btn:hover {
              background-color: #005a9e;
            }
            .code-container {
              padding: 16px;
              overflow-x: auto;
            }
            pre {
              margin: 0;
              padding: 12px;
              background-color: #1e1e1e;
              border: 1px solid #3e3e42;
              border-radius: 4px;
              line-height: 1.6;
              font-size: 13px;
              color: #d4d4d4;
              white-space: pre-wrap;
              word-wrap: break-word;
            }
            /* SQL syntax highlighting */
            .keyword { color: #569cd6; font-weight: bold; }
            .string { color: #ce9178; }
            .comment { color: #6a9955; font-style: italic; }
            .function { color: #dcdcaa; }
            .number { color: #b5cea8; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <span class="title">${this.escapeHtml(title)}</span>
              <span class="badge">${language.toUpperCase()}</span>
            </div>
            <button class="copy-btn" onclick="copyCode()">Copy Code</button>
          </div>
          <div class="code-container">
            <pre>${escapedCode}</pre>
          </div>
          <script>
            function copyCode() {
              vscode.postMessage({ command: 'copyCode' });
            }
            const vscode = acquireVsCodeApi();
          </script>
        </body>
      </html>
    `;
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      '&': '&amp;',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      '<': '&lt;',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      '>': '&gt;',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      '"': '&quot;',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }
}
