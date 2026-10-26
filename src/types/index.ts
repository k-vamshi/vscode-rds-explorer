export interface DBConnection {
  id: string;
  name: string;
  dbClusterArn: string;
  secretArn: string;
  databaseName: string;
  region: string;
  awsProfile: string;
}

export interface SchemaInfo {
  name: string;
  tables: TableInfo[];
  functions: FunctionInfo[];
  views: ViewInfo[];
}

export interface TableInfo {
  name: string;
  schema: string;
  columns: ColumnInfo[];
  rowCount?: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  isNullable: boolean;
  default?: string;
  isPrimaryKey?: boolean;
  constraints?: ConstraintInfo[];
}

export interface ConstraintInfo {
  name: string;
  type: 'PRIMARY KEY' | 'UNIQUE' | 'CHECK' | 'NOT NULL' | 'FOREIGN KEY';
  definition?: string;
}

export interface ForeignKeyInfo {
  constraintName: string;
  columnName: string;
  referencedTable: string;
  referencedSchema: string;
  referencedColumn: string;
  updateRule: string;
  deleteRule: string;
}

export interface FunctionInfo {
  name: string;
  schema: string;
  returnType: string;
  arguments?: string[];
}

export interface ViewInfo {
  name: string;
  schema: string;
  definition?: string;
}

export interface TriggerInfo {
  name: string;
  schema: string;
  tableName: string;
  eventManipulation: string;
  eventOrientation: string;
}

export interface SequenceInfo {
  name: string;
  schema: string;
  dataType: string;
  lastValue: string | null;
  startValue: string;
  minimumValue: string;
  maximumValue: string;
  increment: string;
  cacheSize: string;
  cycles: boolean;
}

export interface TypeInfo {
  name: string;
  schema: string;
  kind: 'ENUM' | 'COMPOSITE' | 'RANGE' | 'DOMAIN' | 'BASE';
}

export interface IndexInfo {
  name: string;
  tableName: string;
  indexDef: string;
  isUnique: boolean;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  executionTime: number;
}

export interface QueryHistoryItem {
  id: string;
  query: string;
  timestamp: Date;
  connectionId: string;
  connectionName: string;
}
