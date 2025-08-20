# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a Go-based story development and content management system called "Thoughtorio" with the following key components:

### Core Modules (in `legos/internal/`)

- **Database** (`database/`): SQLite-based data layer with support for:
  - Codex entries (characters, locations, objects)
  - Timeline/Arc structure (timelines → arcs → events → participants)
  - Foreign key relationships and cascading deletes
  - Uses `modernc.org/sqlite` driver

- **Embeddings** (`embeddings/`): Vector embedding system supporting multiple providers:
  - Provider interface pattern for OpenAI, Gemini, and local embeddings
  - Cosine similarity search for content discovery
  - Binary serialization of float32 vectors
  - Database storage with provider versioning

- **Arc Parsing** (`arcs/`): Markdown-based story structure parser:
  - Parses structured markdown files into timeline/arc/event hierarchies
  - Supports metadata extraction with participant linking
  - Bidirectional conversion between database and markdown formats
  - Regex-based parsing for headers, metadata, and participant references

- **LLM Integration** (`llm/`): Multi-provider LLM support:
  - OpenRouter API integration for chat completions
  - Configuration management in `~/.llore/config.json`
  - Support for different model modes (local, openrouter, openai, gemini)

### Key Data Structures

- **Timeline Hierarchy**: Timeline → Arc → Event → Participants
- **Codex System**: Entries with types, embeddings, and searchable content
- **Participant Linking**: Events can reference codex entries as participants

## Common Development Tasks

### Database Operations
- Initialize database with `database.DBInitialize(dbPath)`
- All database operations use prepared statements and proper error handling
- Foreign key constraints are enabled with cascading deletes

### Embedding Workflow
- Create embeddings: `embeddingService.CreateEmbedding(text)`
- Search similar content: `embeddingService.FindSimilarEntries(query, limit)`
- Provider-specific model identifiers track embedding versions

### Arc Parsing
- Parse markdown: `arcs.ParseArcMarkdown(content)`
- Save to database: `arcs.SaveParsedArcToDatabase(dbConn, parsed)`
- Convert back to markdown: `arcs.ConvertToMarkdown(parsed)`

### Configuration
- LLM config stored in `~/.llore/config.json`
- Use `llm.LoadOpenRouterConfig()` and `llm.SaveOpenRouterConfig()`

## Development Patterns

- Consistent error handling with wrapped errors using `fmt.Errorf`
- Structured logging with context information
- Interface-based provider patterns for extensibility
- Transaction-based database operations for data consistency
- Mutex protection for shared configuration state

## Dependencies

Based on imports, the project uses:
- `modernc.org/sqlite` for SQLite database
- Standard library packages for HTTP, JSON, regex
- No main.go found - this appears to be a library/module collection