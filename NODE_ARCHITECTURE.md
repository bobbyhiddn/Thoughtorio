# Node Architecture Specification

## Overview
Each node maintains a standardized YAML backend that defines its data structure, transformation behavior, and context preservation. This enables proper data flow through workflows and easy export/import of complete workflow stacks.

## Node Types & Behaviors

### 1. Static Nodes
**Purpose**: Immutable data sources
**Rules**: 
- Cannot receive inputs (no input connections allowed)
- Contain fixed content that doesn't change during execution
- Output their content as-is to connected nodes

```yaml
node_type: static
id: static_001
content: "The story takes place in medieval times"
metadata:
  title: "Setting"
  created_at: "2024-01-01T12:00:00Z"
  version: 1
output:
  type: text
  value: "The story takes place in medieval times"
```

### 2. Input Nodes  
**Purpose**: User input with envelope/wrapper capabilities
**Rules**:
- Can receive multiple inputs from other nodes
- Can envelope/wrap their inputs before passing along
- Transform input data through user-defined processing
- Maintain references to all input sources

```yaml
node_type: input
id: input_001
content: "Generate a color"
metadata:
  title: "Color Generator"
  created_at: "2024-01-01T12:00:00Z"
  version: 1
inputs:
  - source_id: static_001
    data: "The story takes place in medieval times"
    received_at: "2024-01-01T12:01:00Z"
processing:
  envelope_style: "prompt_wrapper"
  wrapper_template: "Based on this context: {inputs}\nNow: {content}"
output:
  type: text
  value: "Based on this context: The story takes place in medieval times\nNow: Generate a color"
  sources: ["static_001", "input_001"]
```

### 3. AI Nodes (Dynamic)
**Purpose**: AI-powered content transformation
**Rules**:
- Can receive multiple inputs from other nodes
- Transform inputs through AI processing
- Maintain complete context chain of all contributing nodes
- Output contains both result and provenance

```yaml
node_type: dynamic
id: ai_001
content: "A deep crimson red, like dried blood on ancient stone"
metadata:
  title: "AI Color Description"
  created_at: "2024-01-01T12:00:00Z"
  version: 1
  ai_model: "gpt-4"
  processing_time: 2.3
inputs:
  - source_id: input_001
    data: "Based on this context: The story takes place in medieval times\nNow: Generate a color"
    received_at: "2024-01-01T12:02:00Z"
processing:
  type: "ai_completion"
  model: "gpt-4"
  prompt: "Based on this context: The story takes place in medieval times\nNow: Generate a color"
  parameters:
    temperature: 0.7
    max_tokens: 150
output:
  type: text
  value: "A deep crimson red, like dried blood on ancient stone"
  sources: ["static_001", "input_001", "ai_001"]
  context_chain:
    - static_001: "The story takes place in medieval times"
    - input_001: "Generate a color"
    - ai_001: "A deep crimson red, like dried blood on ancient stone"
```

## Data Flow Architecture

### Context Preservation
Each node maintains a `sources` array and `context_chain` that tracks the complete lineage of data transformations:

```yaml
context_chain:
  - node_id: static_001
    type: static
    contribution: "The story takes place in medieval times"
  - node_id: input_001  
    type: input
    contribution: "Generate a color"
    processing: "envelope_wrapper"
  - node_id: ai_001
    type: dynamic
    contribution: "A deep crimson red, like dried blood on ancient stone"
    processing: "ai_completion"
```

### Multi-Input Handling
When a node receives multiple inputs, they are stacked in the YAML:

```yaml
inputs:
  - source_id: node_a
    data: "First input content"
    weight: 1.0
    received_at: "2024-01-01T12:01:00Z"
  - source_id: node_b
    data: "Second input content" 
    weight: 1.0
    received_at: "2024-01-01T12:01:05Z"
  - source_id: node_c
    data: "Third input content"
    weight: 0.5
    received_at: "2024-01-01T12:01:10Z"
```

## Node State Management

### Execution States
```yaml
execution:
  state: "completed"  # idle, executing, completed, error
  started_at: "2024-01-01T12:02:00Z"
  completed_at: "2024-01-01T12:02:03Z"
  error: null
```

### Versioning & History
```yaml
history:
  - version: 1
    content: "Original content"
    timestamp: "2024-01-01T12:00:00Z"
  - version: 2  
    content: "Updated content"
    timestamp: "2024-01-01T12:05:00Z"
```

## Workflow Export Format

A complete workflow can be exported as a single YAML document:

```yaml
workflow:
  id: workflow_001
  name: "Color Description Generator"
  created_at: "2024-01-01T12:00:00Z"
  version: 1
  
nodes:
  - node_type: static
    id: static_001
    # ... full node definition
  
  - node_type: input
    id: input_001  
    # ... full node definition
    
  - node_type: dynamic
    id: ai_001
    # ... full node definition

connections:
  - from: static_001
    to: input_001
    port_from: output
    port_to: input
  - from: input_001
    to: ai_001
    port_from: output
    port_to: input

metadata:
  total_nodes: 3
  execution_order: ["static_001", "input_001", "ai_001"]
  dependencies:
    ai_001: ["static_001", "input_001"]
    input_001: ["static_001"]
    static_001: []
```

## Implementation Strategy

1. **Node Data Model**: Create a `NodeData` class that handles YAML serialization/deserialization
2. **Transformation Engine**: Build processors for each node type's transformation rules
3. **Context Manager**: System to maintain and propagate context chains
4. **Validation System**: Ensure node type rules are enforced
5. **Export/Import**: YAML-based workflow serialization

This architecture provides:
- ✅ Standardized data format
- ✅ Clear transformation rules
- ✅ Complete context preservation  
- ✅ Easy workflow export/import
- ✅ Support for complex multi-input scenarios
- ✅ Extensible for new node types