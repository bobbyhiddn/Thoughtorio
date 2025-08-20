# Thoughtorio: AI-Powered Infinite Canvas Architecture

## Overview

Thoughtorio is an AI-powered infinite canvas tool for building "thought factories" - visual workflows where users can drag and drop nodes to create computational thought processes. The system uses existing Go "legos" (modules) from a story writing tool, repurposed for general knowledge work and ideation.

## Core Concept

Users create visual workflows by:
1. **Dragging nodes** onto an infinite canvas
2. **Connecting nodes** to form logical chains
3. **Pressing play** to execute the workflow and generate AI-powered results

Example workflow: `[Me] → [Work] → [Effort] → [Dynamic Output]`

## Architecture Overview

```
┌─────────────────┐    HTTP API    ┌─────────────────┐
│   Web Frontend  │ ←─────────────→ │   Go Backend    │
│   (Canvas UI)   │                │   (Core Logic)  │
└─────────────────┘                └─────────────────┘
                                           │
                                           ▼
                                   ┌─────────────────┐
                                   │ Canvas Database │
                                   │    (SQLite)     │
                                   └─────────────────┘
                                           │
                                           ▼
                                   ┌─────────────────┐
                                   │   RAG System    │
                                   │ (Embeddings +   │
                                   │      LLM)       │
                                   └─────────────────┘
```

## Component Architecture

### 1. Frontend (Web Canvas)
- **Technology**: HTML5 Canvas or SVG with JavaScript
- **Features**:
  - Infinite scrollable/zoomable canvas
  - Drag & drop node creation and positioning
  - Visual connection drawing between nodes
  - Real-time collaboration support (future)
- **Libraries**: Fabric.js, Konva.js, or custom Canvas API

### 2. Backend (Go HTTP Server)
- **Built on existing legos**:
  - Database module for persistence
  - Embeddings module for RAG
  - LLM module for AI generation
- **New components**:
  - Canvas manager
  - Node execution engine
  - Workflow orchestrator
- **API Endpoints**:
  - `/canvas/{id}` - CRUD operations for canvases
  - `/nodes` - Node management
  - `/connections` - Connection management
  - `/execute` - Workflow execution
  - `/embeddings/search` - RAG queries

### 3. Database Layer (Per-Canvas SQLite)
Each canvas gets its own SQLite database file for isolation and portability.

#### Schema Design
```sql
-- Core canvas metadata
CREATE TABLE canvas_meta (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT,
    updated_at TEXT
);

-- Nodes on the canvas
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- 'input', 'dynamic', 'static', 'connector'
    content TEXT,
    x REAL NOT NULL,    -- Canvas position
    y REAL NOT NULL,
    width REAL DEFAULT 200,
    height REAL DEFAULT 100,
    style JSON,         -- Node styling (color, etc.)
    metadata JSON,      -- Type-specific configuration
    created_at TEXT,
    updated_at TEXT
);

-- Connections between nodes
CREATE TABLE connections (
    id TEXT PRIMARY KEY,
    from_node_id TEXT NOT NULL,
    to_node_id TEXT NOT NULL,
    from_port TEXT DEFAULT 'output',  -- Output port name
    to_port TEXT DEFAULT 'input',     -- Input port name
    style JSON,                       -- Connection styling
    created_at TEXT,
    FOREIGN KEY (from_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (to_node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Execution history for dynamic nodes
CREATE TABLE executions (
    id TEXT PRIMARY KEY,
    workflow_hash TEXT,  -- Hash of the workflow state
    node_id TEXT,
    result TEXT,
    context_used TEXT,   -- RAG context that influenced the result
    execution_time REAL,
    created_at TEXT,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Node embeddings for RAG
CREATE TABLE node_embeddings (
    node_id TEXT PRIMARY KEY,
    embedding BLOB,
    vector_version TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
```

### 4. RAG System
- **Purpose**: Provide context-aware AI generation by finding relevant nodes/content
- **Implementation**: 
  - Reuse existing embeddings module
  - Index all node content for semantic search
  - Provide context to LLM for dynamic node generation

## Node Types

### 1. Input Nodes
- **Purpose**: User-editable content that never changes automatically
- **Features**:
  - Rich text editing
  - Markdown support
  - File attachments (future)
- **Persistence**: Content stored in `nodes.content`

### 2. Dynamic Nodes
- **Purpose**: AI-generated outputs that recalculate on workflow execution
- **Features**:
  - Shows loading state during generation
  - Maintains execution history
  - Can be regenerated with different results
- **Generation**: Uses connected inputs + RAG context

### 3. Static Nodes
- **Purpose**: Fixed reference content that doesn't change
- **Use cases**: Constants, templates, reference materials
- **Features**: Read-only display, rich formatting

### 4. Connector Nodes
- **Purpose**: Logic operations and data transformation
- **Types**:
  - **Combine**: Merge multiple inputs
  - **Filter**: Extract specific information
  - **Transform**: Apply functions to inputs
  - **Branch**: Conditional logic

## Workflow Execution Engine

### Execution Flow
1. **Dependency Resolution**: Build execution graph from connections
2. **Topological Sort**: Determine execution order
3. **Context Gathering**: Use RAG to find relevant canvas content
4. **Node Processing**: Execute each node type appropriately
5. **Result Propagation**: Pass outputs to connected nodes

### Execution Rules
- **Input/Static Nodes**: Pass content unchanged
- **Dynamic Nodes**: Generate new content using LLM + context
- **Connector Nodes**: Apply transformation logic
- **Cycles**: Detected and prevented
- **Error Handling**: Graceful degradation with error nodes

## Data Flow

```
User Input → Node Creation → Connection Drawing → Play Button
     ↓
Workflow Analysis → Dependency Graph → RAG Context Gathering
     ↓
LLM Generation → Result Display → Database Persistence
```

## Security & Performance

### Security
- Canvas databases are file-based and isolated
- No direct SQL injection vectors (prepared statements)
- API authentication for multi-user deployments (future)

### Performance
- **Frontend**: Canvas virtualization for large workflows
- **Backend**: Concurrent node execution where possible
- **Database**: Indexed queries, connection pooling
- **RAG**: Embedding caching, similarity thresholds

## Extensibility

### Plugin Architecture (Future)
- Custom node types via Go plugins
- JavaScript-based frontend node renderers
- External API integrations

### Export/Import
- Canvas workflows as JSON
- Integration with existing story writing tools
- Version control for workflows

## Development Phases

This architecture supports incremental development:

1. **Phase 1**: Basic canvas with input/dynamic nodes
2. **Phase 2**: RAG integration and context awareness
3. **Phase 3**: Advanced node types and connectors
4. **Phase 4**: Collaboration and sharing features
5. **Phase 5**: Plugin ecosystem and integrations