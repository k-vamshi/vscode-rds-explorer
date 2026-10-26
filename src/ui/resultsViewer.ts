import * as vscode from 'vscode';
import { QueryResult } from '../types';

export class ResultsViewProvider {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private context: vscode.ExtensionContext) {}

  async showResults(
    result: QueryResult,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    query: string,
    connectionName: string
  ): Promise<void> {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'rdsResults',
        'Query Results',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      this.panel.onDidDispose(
        () => {
          this.panel = undefined;
        },
        undefined,
        this.context.subscriptions
      );
    } else {
      this.panel.reveal(vscode.ViewColumn.Beside);
    }

    this.panel.webview.html = this.getHtml(result, query, connectionName);
  }

  private getHtml(result: QueryResult, query: string, connectionName: string): string {
    const tableRows = result.rows
      .map(
        (row) => `
      <tr>
        ${result.columns
          .map((col) => {
            const value = row[col];
            if (value === null || value === undefined) {
              return '<td class="null-value">NULL</td>';
            }

            const text = String(value);
            const escapedText = this.escapeHtml(text);
            return `<td title="${escapedText}">${escapedText}</td>`;
          })
          .join('')}
      </tr>
    `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: var(--vscode-font-family);
              font-size: var(--vscode-font-size);
              color: var(--vscode-foreground);
              background-color: var(--vscode-editor-background);
              margin: 0;
              padding: 14px 16px 20px;
            }
            .container {
              max-width: 100%;
            }
            .summary {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 16px;
              padding: 2px 0 12px;
              border-bottom: 1px solid var(--vscode-panel-border);
            }
            .connection-label,
            .query-label {
              color: var(--vscode-descriptionForeground);
              font-size: 11px;
              margin-bottom: 4px;
            }
            .connection-name {
              font-size: 14px;
              font-weight: 600;
              overflow-wrap: anywhere;
            }
            .stats {
              display: flex;
              flex-wrap: wrap;
              justify-content: flex-end;
              gap: 6px 14px;
              color: var(--vscode-descriptionForeground);
              text-align: right;
              white-space: nowrap;
            }
            .stats strong {
              color: var(--vscode-foreground);
              font-weight: 600;
            }
            .query-block {
              margin-top: 12px;
              padding: 10px 12px;
              border-left: 2px solid var(--vscode-focusBorder);
              background: var(--vscode-textCodeBlock-background);
            }
            .query-block pre {
              margin: 0;
              color: var(--vscode-editor-foreground);
              font-family: var(--vscode-editor-font-family);
              font-size: var(--vscode-editor-font-size);
              line-height: 1.45;
              white-space: pre-wrap;
              overflow-wrap: anywhere;
            }
            .results-toolbar {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              margin: 16px 0 8px;
            }
            .results-title {
              font-size: 13px;
              font-weight: 600;
            }
            .table-wrap {
              max-width: 100%;
              overflow: auto;
              border: 1px solid var(--vscode-panel-border);
            }
            table {
              width: 100%;
              border-collapse: collapse;
              text-align: left;
            }
            th {
              position: sticky;
              top: 0;
              z-index: 1;
              background-color: var(--vscode-editorWidget-background);
              padding: 8px 10px;
              text-align: left;
              font-weight: 600;
              border-bottom: 1px solid var(--vscode-focusBorder);
              color: var(--vscode-foreground);
              white-space: nowrap;
            }
            td {
              padding: 8px 10px;
              border-bottom: 1px solid var(--vscode-panel-border);
              line-height: 1.4;
              overflow: hidden;
              text-overflow: ellipsis;
              max-width: 360px;
              white-space: nowrap;
            }
            tbody tr:hover {
              background-color: var(--vscode-list-hoverBackground);
            }
            .null-value {
              color: var(--vscode-descriptionForeground);
              font-style: italic;
            }
            .export-button {
              background-color: var(--vscode-button-background);
              color: var(--vscode-button-foreground);
              border: none;
              padding: 5px 10px;
              border-radius: 2px;
              cursor: pointer;
              font: inherit;
            }
            .export-button:hover {
              background-color: var(--vscode-button-hoverBackground);
            }
            @media (max-width: 480px) {
              .summary {
                flex-direction: column;
                gap: 8px;
              }
              .stats {
                justify-content: flex-start;
                text-align: left;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="summary">
              <div>
                <div class="connection-label">Connection</div>
                <div class="connection-name">${this.escapeHtml(connectionName)}</div>
              </div>
              <div class="stats">
                <span><strong>${result.rowCount}</strong> rows</span>
                <span><strong>${result.executionTime} ms</strong></span>
              </div>
            </div>

            <div class="query-block">
              <div class="query-label">SQL</div>
              <pre>${this.escapeHtml(query)}</pre>
            </div>

            <div class="results-toolbar">
              <div class="results-title">Results</div>
              <button class="export-button" onclick="exportCSV()">Export as CSV</button>
            </div>

            <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  ${result.columns.map((col) => `<th>${this.escapeHtml(col)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
            </div>
          </div>

          <script>
            function exportCSV() {
              const headers = ${JSON.stringify(result.columns)};
              const rows = ${JSON.stringify(result.rows)};

              let csv = headers.join(',') + '\\n';
              rows.forEach(row => {
                const values = headers.map(h => {
                  const value = row[h];
                  if (value === null || value === undefined) return '';
                  const stringValue = String(value);
                  if (stringValue.includes(',') || stringValue.includes('"')) {
                    return '"' + stringValue.replace(/"/g, '""') + '"';
                  }
                  return stringValue;
                });
                csv += values.join(',') + '\\n';
              });

              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'results.csv';
              a.click();
              URL.revokeObjectURL(url);
            }
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
