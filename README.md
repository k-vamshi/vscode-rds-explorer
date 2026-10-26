# RDS Explorer

A VS Code extension for exploring and querying AWS RDS databases using the RDS Data API. Perfect for teams working inside VPCs without direct database access.

## Features

- 🔍 **Database Explorer**: Browse schemas, tables, functions, and views
- 🏗️ **Schema Navigation**: Explore tables, columns with types
- ⚡ **Query Editor**: Execute SQL queries with syntax highlighting
- 🔐 **VPC-Safe**: Uses RDS Data API instead of direct connections
- 🔑 **IAM Authentication**: Works with AWS profiles and credentials
- 📊 **Query History**: Keep track of recent queries
- 💾 **Result Export**: Export results as CSV or JSON

## Quick Start

### Prerequisites
- AWS account with RDS PostgreSQL cluster
- AWS credentials configured locally (AWS CLI or `~/.aws/credentials`)
- VS Code 1.75.0 or higher

### Installation

1. Install the extension from VS Code Marketplace (coming soon)
2. Open VS Code Command Palette (`Cmd+Shift+P`)
3. Run `RDS Explorer: Open Connection`

To edit or delete a saved connection, right-click it in the Database Connections view and select the action.

### Configuration

Create a connection with:
- **DB Cluster ARN**: `arn:aws:rds:region:account:cluster:cluster-name`
- **Secrets Manager secret ARN**: ARN of the secret containing database credentials
- **Database Name**: PostgreSQL database name
- **AWS Profile**: AWS profile to use (defaults to `default`)
- **Region**: AWS region (e.g., `us-east-1`)

### Usage

#### Explore Database
1. Right-click connection in sidebar
2. Select "Expand" to view schemas
3. Navigate tables → columns → view column types
4. Hover a sequence for its start, bounds, increment, cache, and cycle settings; right-click it to view its `CREATE SEQUENCE` definition

#### Write & Execute Queries
1. Click "New Query" button
2. Write SQL in editor
3. Select a SQL statement to run only that text, or leave text unselected to run the whole editor
4. Press `Cmd+Enter` to execute
5. Choose a saved connection if prompted
6. View results beside the SQL editor

Use the query icon beside a connection name to open a blank SQL editor associated with that connection. The active editor's connection appears in the status bar; click it to choose or change the connection. An unbound editor is assigned the connection selected when it first runs. Right-click a table and choose **Select Top 10 Rows** to open and run a preview query. Use the run icon beside a Query History entry to execute it again on its saved connection.

## Architecture

### Components
- **Connection Manager**: Manages RDS Data API connections
- **Database Explorer**: Tree view for schemas, tables, functions
- **Query Editor**: SQL editor with syntax highlighting
- **Results Viewer**: Display query results in table format

### Data Flow
```
VS Code UI → Extension API → AWS SDK → RDS Data API → PostgreSQL
```