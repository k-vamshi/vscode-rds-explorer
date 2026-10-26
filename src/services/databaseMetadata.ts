import { RDSDataAPIClient } from './rdsDataApi';
import {
  DBConnection,
  TableInfo,
  FunctionInfo,
  ViewInfo,
  TriggerInfo,
  SequenceInfo,
  TypeInfo,
  IndexInfo,
  ConstraintInfo,
  ForeignKeyInfo,
} from '../types';

export class DatabaseMetadata {
  private client: RDSDataAPIClient;

  constructor(connection: DBConnection) {
    this.client = new RDSDataAPIClient(connection);
  }

  async getSchemas(): Promise<string[]> {
    const result = await this.client.executeQuery(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'pg_temp_1')
       ORDER BY schema_name`
    );

    return result.rows.map((row) => (row.schema_name as string) || '');
  }

  async getTables(schema: string): Promise<TableInfo[]> {
    const result = await this.client.executeQuery(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = :schema AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
      { schema }
    );

    return result.rows.map((row) => ({
      name: (row.table_name as string) || '',
      schema,
      columns: [],
    }));
  }

  async getTableColumns(schema: string, table: string): Promise<TableInfo> {
    const result = await this.client.executeQuery(
      `SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = :schema AND table_name = :table
        ORDER BY ordinal_position`,
      { schema, table }
    );

    const columns = await Promise.all(
      result.rows.map(async (row) => {
        const columnName = (row.column_name as string) || '';
        const constraints = await this.getColumnConstraints(schema, table, columnName);

        return {
          name: columnName,
          type: (row.data_type as string) || 'unknown',
          isNullable: (row.is_nullable as string) === 'YES',
          default: row.column_default as string | undefined,
          constraints,
        };
      })
    );

    return {
      name: table,
      schema,
      columns,
    };
  }

  async getColumnConstraints(
    schema: string,
    table: string,
    column: string
  ): Promise<ConstraintInfo[]> {
    const result = await this.client.executeQuery(
      `SELECT tc.constraint_name, tc.constraint_type
       FROM information_schema.constraint_column_usage ccu
       JOIN information_schema.table_constraints tc
         ON ccu.constraint_catalog = tc.constraint_catalog
         AND ccu.constraint_schema = tc.constraint_schema
         AND ccu.constraint_name = tc.constraint_name
         AND ccu.table_catalog = tc.table_catalog
         AND ccu.table_schema = tc.table_schema
         AND ccu.table_name = tc.table_name
      WHERE ccu.table_schema = :schema AND ccu.table_name = :table AND ccu.column_name = :column`,
      { schema, table, column }
    );

    return result.rows.map((row) => ({
      name: (row.constraint_name as string) || '',
      type:
        (row.constraint_type as 'PRIMARY KEY' | 'UNIQUE' | 'CHECK' | 'NOT NULL' | 'FOREIGN KEY') ||
        'UNIQUE',
    }));
  }

  async getForeignKeys(schema: string, table: string): Promise<ForeignKeyInfo[]> {
    const result = await this.client.executeQuery(
      `SELECT
        rc.constraint_name,
        kcu.column_name,
        ccu.table_name as referenced_table,
        ccu.table_schema as referenced_schema,
        ccu.column_name as referenced_column,
        rc.update_rule,
        rc.delete_rule
       FROM information_schema.referential_constraints rc
       JOIN information_schema.key_column_usage kcu
         ON rc.constraint_name = kcu.constraint_name AND rc.constraint_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON rc.unique_constraint_name = ccu.constraint_name AND rc.unique_constraint_schema = ccu.table_schema
      WHERE kcu.table_schema = :schema AND kcu.table_name = :table
      ORDER BY rc.constraint_name`,
      { schema, table }
    );

    return result.rows.map((row) => ({
      constraintName: (row.constraint_name as string) || '',
      columnName: (row.column_name as string) || '',
      referencedTable: (row.referenced_table as string) || '',
      referencedSchema: (row.referenced_schema as string) || '',
      referencedColumn: (row.referenced_column as string) || '',
      updateRule: (row.update_rule as string) || 'NO ACTION',
      deleteRule: (row.delete_rule as string) || 'NO ACTION',
    }));
  }

  async getViews(schema: string): Promise<ViewInfo[]> {
    const result = await this.client.executeQuery(
      `SELECT table_name, view_definition FROM information_schema.views
        WHERE table_schema = :schema
        ORDER BY table_name`,
      { schema }
    );

    return result.rows.map((row) => ({
      name: (row.table_name as string) || '',
      schema,
      definition: row.view_definition as string | undefined,
    }));
  }

  async getFunctions(schema: string): Promise<FunctionInfo[]> {
    const result = await this.client.executeQuery(
      `SELECT routine_name, routine_type, type_udt_name
       FROM information_schema.routines
        WHERE routine_schema = :schema AND routine_type = 'FUNCTION'
        ORDER BY routine_name`,
      { schema }
    );

    return result.rows.map((row) => ({
      name: (row.routine_name as string) || '',
      schema,
      returnType: (row.type_udt_name as string) || 'void',
    }));
  }

  async getProcedures(schema: string): Promise<FunctionInfo[]> {
    const result = await this.client.executeQuery(
      `SELECT routine_name, routine_type, type_udt_name
       FROM information_schema.routines
        WHERE routine_schema = :schema AND routine_type = 'PROCEDURE'
        ORDER BY routine_name`,
      { schema }
    );

    return result.rows.map((row) => ({
      name: (row.routine_name as string) || '',
      schema,
      returnType: (row.type_udt_name as string) || 'void',
    }));
  }

  async getTriggers(schema: string): Promise<TriggerInfo[]> {
    const result = await this.client.executeQuery(
      `SELECT trigger_name, event_object_table, event_manipulation, action_orientation
       FROM information_schema.triggers
        WHERE trigger_schema = :schema
        ORDER BY trigger_name`,
      { schema }
    );

    return result.rows.map((row) => ({
      name: (row.trigger_name as string) || '',
      schema,
      tableName: (row.event_object_table as string) || '',
      eventManipulation: (row.event_manipulation as string) || '',
      eventOrientation: (row.action_orientation as string) || 'ROW',
    }));
  }

  async getSequences(schema: string): Promise<SequenceInfo[]> {
    const result = await this.client.executeQuery(
      `SELECT s.sequence_name, s.data_type, s.start_value, s.minimum_value,
              s.maximum_value, s.increment, s.cycle_option, ps.seqcache::text AS cache_size
              , pgs.last_value::text AS last_value
       FROM information_schema.sequences s
       JOIN pg_namespace n ON n.nspname = s.sequence_schema
       JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = s.sequence_name
       JOIN pg_sequence ps ON ps.seqrelid = c.oid
             LEFT JOIN pg_sequences pgs
         ON pgs.schemaname = s.sequence_schema AND pgs.sequencename = s.sequence_name
       WHERE s.sequence_schema = :schema
       ORDER BY s.sequence_name`,
      { schema }
    );

    return result.rows.map((row) => ({
      name: (row.sequence_name as string) || '',
      schema,
      dataType: (row.data_type as string) || 'bigint',
      lastValue:
        row.last_value === null || row.last_value === undefined ? null : String(row.last_value),
      startValue: String(row.start_value ?? ''),
      minimumValue: String(row.minimum_value ?? ''),
      maximumValue: String(row.maximum_value ?? ''),
      increment: String(row.increment ?? ''),
      cacheSize: String(row.cache_size ?? ''),
      cycles: (row.cycle_option as string) === 'YES',
    }));
  }

  async getSequenceDefinition(schema: string, sequenceName: string): Promise<string> {
    const sequence = (await this.getSequences(schema)).find((item) => item.name === sequenceName);
    if (!sequence) {
      return 'Sequence definition not found';
    }

    const quoteIdentifier = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    return [
      `CREATE SEQUENCE ${quoteIdentifier(schema)}.${quoteIdentifier(sequence.name)}`,
      `  AS ${sequence.dataType}`,
      `  INCREMENT BY ${sequence.increment}`,
      `  MINVALUE ${sequence.minimumValue}`,
      `  MAXVALUE ${sequence.maximumValue}`,
      `  START WITH ${sequence.startValue}`,
      `  CACHE ${sequence.cacheSize}`,
      `  ${sequence.cycles ? 'CYCLE' : 'NO CYCLE'};`,
    ].join('\n');
  }

  async getTypes(schema: string): Promise<TypeInfo[]> {
    const result = await this.client.executeQuery(
      `SELECT t.typname, n.nspname,
              CASE 
                WHEN t.typtype = 'e' THEN 'ENUM'
                WHEN t.typtype = 'c' THEN 'COMPOSITE'
                WHEN t.typtype = 'r' THEN 'RANGE'
                WHEN t.typtype = 'd' THEN 'DOMAIN'
                ELSE 'BASE'
              END as kind
       FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = :schema AND t.typname NOT LIKE 'pg_%'
      ORDER BY t.typname`,
      { schema }
    );

    return result.rows.map((row) => ({
      name: (row.typname as string) || '',
      schema,
      kind: (row.kind as 'ENUM' | 'COMPOSITE' | 'RANGE' | 'DOMAIN' | 'BASE') || 'BASE',
    }));
  }

  async getTypeDefinition(schema: string, typeName: string): Promise<string> {
    const result = await this.client.executeQuery(
      `SELECT CASE
         WHEN t.typtype = 'e' THEN
           'CREATE TYPE ' || quote_ident(n.nspname) || '.' || quote_ident(t.typname) ||
           ' AS ENUM (' || string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) || ');'
         WHEN t.typtype = 'c' THEN
           'CREATE TYPE ' || quote_ident(n.nspname) || '.' || quote_ident(t.typname) ||
           ' AS (' || string_agg(
             CASE WHEN a.attname IS NOT NULL
               THEN format('%I %s', a.attname, format_type(a.atttypid, a.atttypmod))
             END,
             ', ' ORDER BY a.attnum
           ) || ');'
         WHEN t.typtype = 'd' THEN
           'CREATE DOMAIN ' || quote_ident(n.nspname) || '.' || quote_ident(t.typname) ||
           ' AS ' || format_type(t.typbasetype, t.typtypmod) ||
           CASE WHEN t.typdefault IS NOT NULL THEN ' DEFAULT ' || t.typdefault ELSE '' END ||
           CASE WHEN t.typnotnull THEN ' NOT NULL' ELSE '' END ||
           COALESCE((
             SELECT string_agg(' CONSTRAINT ' || quote_ident(pc.conname) || ' ' || pg_get_constraintdef(pc.oid), '')
             FROM pg_constraint pc
             WHERE pc.contypid = t.oid
           ), '') || ';'
         WHEN t.typtype = 'r' THEN
           'CREATE TYPE ' || quote_ident(n.nspname) || '.' || quote_ident(t.typname) ||
           ' AS RANGE (subtype = ' || format_type(r.rngsubtype, NULL) || ');'
         ELSE '-- CREATE TYPE source is unavailable for this base type.'
       END AS definition
       FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       LEFT JOIN pg_enum e ON e.enumtypid = t.oid
       LEFT JOIN pg_class c ON c.oid = t.typrelid
       LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
       LEFT JOIN pg_range r ON r.rngtypid = t.oid
       WHERE n.nspname = :schema AND t.typname = :typeName
       GROUP BY t.typtype, n.nspname, t.typname, t.typbasetype, t.typtypmod,
                t.typdefault, t.typnotnull, t.oid, r.rngsubtype`,
      { schema, typeName }
    );

    if (result.rows.length === 0) {
      return 'Type definition not found';
    }

    return (result.rows[0].definition as string) || 'Type definition not available';
  }

  async getTableIndexes(schema: string, table: string): Promise<IndexInfo[]> {
    const result = await this.client.executeQuery(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = :schema AND tablename = :table
        ORDER BY indexname`,
      { schema, table }
    );

    return result.rows.map((row) => ({
      name: (row.indexname as string) || '',
      tableName: table,
      indexDef: (row.indexdef as string) || '',
      isUnique: ((row.indexdef as string) || '').includes('UNIQUE'),
    }));
  }

  async getViewDefinition(schema: string, viewName: string): Promise<string> {
    const result = await this.client.executeQuery(
      `SELECT view_definition FROM information_schema.views
       WHERE table_schema = :schema AND table_name = :viewName`,
      { schema, viewName }
    );

    if (result.rows.length === 0) {
      return 'View definition not found';
    }

    return (result.rows[0].view_definition as string) || '';
  }

  async getFunctionDefinition(schema: string, functionName: string): Promise<string> {
    const result = await this.client.executeQuery(
      `SELECT pg_get_functiondef(p.oid) as func_def
       FROM pg_proc p
       JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = :schema AND p.proname = :functionName
      LIMIT 1`,
      { schema, functionName }
    );

    if (result.rows.length === 0) {
      return 'Function definition not found';
    }

    return (result.rows[0].func_def as string) || '';
  }

  async getProcedureDefinition(schema: string, procedureName: string): Promise<string> {
    const result = await this.client.executeQuery(
      `SELECT pg_get_functiondef(p.oid) as func_def
       FROM pg_proc p
       JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = :schema AND p.proname = :procedureName
      LIMIT 1`,
      { schema, procedureName }
    );

    if (result.rows.length === 0) {
      return 'Procedure definition not found';
    }

    return (result.rows[0].func_def as string) || '';
  }

  async getTriggerDefinition(schema: string, triggerName: string): Promise<string> {
    const result = await this.client.executeQuery(
      `SELECT pg_get_triggerdef(t.oid) as trig_def
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = :schema AND t.tgname = :triggerName AND t.tgisinternal = false`,
      { schema, triggerName }
    );

    if (result.rows.length === 0) {
      return 'Trigger definition not found';
    }

    return (result.rows[0].trig_def as string) || '';
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
