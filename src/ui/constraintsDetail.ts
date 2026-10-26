import * as vscode from 'vscode';
import { DatabaseMetadata } from '../services/databaseMetadata';
import { ConstraintInfo, ForeignKeyInfo } from '../types';

export class ConstraintsDetailProvider {
  async showColumnConstraints(
    context: vscode.ExtensionContext,
    metadata: DatabaseMetadata,
    schema: string,
    table: string,
    column: string
  ): Promise<void> {
    const constraints = await metadata.getColumnConstraints(schema, table, column);

    if (constraints.length === 0) {
      vscode.window.showInformationMessage(`No constraints found for column "${column}"`);
      return;
    }

    const selectedConstraint = await vscode.window.showQuickPick(
      constraints.map((c) => ({
        label: `${c.name} [${c.type}]`,
        detail: c.definition || 'No definition available',
        constraint: c,
      })),
      {
        placeHolder: 'Select a constraint to view details',
      }
    );

    if (selectedConstraint) {
      this.showConstraintDetails(context, selectedConstraint.constraint);
    }
  }

  async showForeignKeyRelationships(
    context: vscode.ExtensionContext,
    metadata: DatabaseMetadata,
    schema: string,
    table: string
  ): Promise<void> {
    const foreignKeys = await metadata.getForeignKeys(schema, table);

    if (foreignKeys.length === 0) {
      vscode.window.showInformationMessage(
        `No foreign key relationships found for table "${table}"`
      );
      return;
    }

    this.showForeignKeysPanel(context, foreignKeys, table);
  }

  private showConstraintDetails(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: vscode.ExtensionContext,
    constraint: ConstraintInfo
  ): void {
    const panel = vscode.window.createWebviewPanel(
      'constraintDetails',
      `Constraint: ${constraint.name}`,
      vscode.ViewColumn.Two,
      { enableScripts: true }
    );

    panel.webview.html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              color: #e0e0e0;
              background-color: #1e1e1e;
              margin: 0;
              padding: 16px;
            }
            .detail-row {
              display: flex;
              margin-bottom: 12px;
              border-bottom: 1px solid #3e3e42;
              padding-bottom: 12px;
            }
            .label {
              font-weight: 600;
              width: 120px;
              color: #007acc;
            }
            .value {
              flex: 1;
              color: #cccccc;
              word-break: break-all;
            }
            .badge {
              display: inline-block;
              background-color: #007acc;
              color: white;
              padding: 2px 8px;
              border-radius: 3px;
              font-size: 12px;
              margin-bottom: 16px;
            }
          </style>
        </head>
        <body>
          <div class="badge">${this.escapeHtml(constraint.type)}</div>
          <div class="detail-row">
            <div class="label">Name:</div>
            <div class="value">${this.escapeHtml(constraint.name)}</div>
          </div>
          <div class="detail-row">
            <div class="label">Type:</div>
            <div class="value">${this.escapeHtml(constraint.type)}</div>
          </div>
          ${
            constraint.definition
              ? `<div class="detail-row">
              <div class="label">Definition:</div>
              <div class="value"><code>${this.escapeHtml(constraint.definition)}</code></div>
            </div>`
              : ''
          }
        </body>
      </html>
    `;
  }

  private showForeignKeysPanel(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: vscode.ExtensionContext,
    foreignKeys: ForeignKeyInfo[],
    tableName: string
  ): void {
    const panel = vscode.window.createWebviewPanel(
      'foreignKeyRelationships',
      `Foreign Keys: ${tableName}`,
      vscode.ViewColumn.Two,
      { enableScripts: true }
    );

    const tableRows = foreignKeys
      .map(
        (fk) => `
      <tr>
        <td>${this.escapeHtml(fk.constraintName)}</td>
        <td>${this.escapeHtml(fk.columnName)}</td>
        <td>${this.escapeHtml(fk.referencedSchema)}.${this.escapeHtml(fk.referencedTable)}</td>
        <td>${this.escapeHtml(fk.referencedColumn)}</td>
        <td>${this.escapeHtml(fk.updateRule)}</td>
        <td>${this.escapeHtml(fk.deleteRule)}</td>
      </tr>
    `
      )
      .join('');

    panel.webview.html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              color: #e0e0e0;
              background-color: #1e1e1e;
              margin: 0;
              padding: 16px;
            }
            .container {
              max-width: 100%;
              overflow-x: auto;
            }
            .info {
              background-color: #252526;
              padding: 12px;
              border-left: 3px solid #007acc;
              margin-bottom: 16px;
              border-radius: 4px;
              font-size: 12px;
              color: #cccccc;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              background-color: #1e1e1e;
              border: 1px solid #3e3e42;
            }
            th {
              background-color: #252526;
              padding: 8px 12px;
              text-align: left;
              font-weight: 600;
              border-bottom: 2px solid #007acc;
              font-size: 12px;
              color: #cccccc;
            }
            td {
              padding: 8px 12px;
              border-bottom: 1px solid #3e3e42;
              font-size: 12px;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            tr:hover {
              background-color: #252526;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="info">
              <strong>Foreign Key Relationships</strong>
              <div style="margin-top: 6px; color: #858585;">
                Total: ${foreignKeys.length} relationship${foreignKeys.length !== 1 ? 's' : ''}
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Constraint Name</th>
                  <th>Column</th>
                  <th>Referenced Table</th>
                  <th>Referenced Column</th>
                  <th>Update Rule</th>
                  <th>Delete Rule</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>
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
