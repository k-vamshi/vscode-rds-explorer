import * as vscode from 'vscode';
import { QueryHistoryItem } from '../types';

export class QueryHistoryProvider implements vscode.TreeDataProvider<QueryHistoryNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<QueryHistoryNode | undefined | null | void> =
    new vscode.EventEmitter<QueryHistoryNode | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<QueryHistoryNode | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private history: QueryHistoryItem[] = [];

  getTreeItem(element: QueryHistoryNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: QueryHistoryNode): QueryHistoryNode[] {
    if (!element) {
      return this.history.map(
        (item) =>
          new QueryHistoryNode(
            item.query.substring(0, 50) || 'Empty Query',
            item,
            vscode.TreeItemCollapsibleState.None
          )
      );
    }

    return [];
  }

  addQueryToHistory(item: QueryHistoryItem): void {
    this.history.unshift(item);
    // Keep only last 50 queries
    if (this.history.length > 50) {
      this.history = this.history.slice(0, 50);
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  clearHistory(): void {
    this.history = [];
    this._onDidChangeTreeData.fire(undefined);
  }
}

export class QueryHistoryNode extends vscode.TreeItem {
  constructor(
    label: string,
    public item: QueryHistoryItem,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.description = item.connectionName;
    this.tooltip = item.query;
    this.iconPath = new vscode.ThemeIcon('history');
    this.contextValue = 'queryHistoryItem';
  }
}
