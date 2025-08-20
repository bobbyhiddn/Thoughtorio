// Package database provides functions for managing codex entries in SQLite.
package database

import (
	"database/sql"
	"fmt"
	"log"

	_ "modernc.org/sqlite"
)

// CodexEntry represents an entry in the codex database.
// Timestamps are stored as strings for easier frontend handling.
type CodexEntry struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// Timeline represents a top-level story timeline
type Timeline struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Duration    string `json:"duration"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// Arc represents a story arc or subplot within a timeline
type Arc struct {
	ID           int64  `json:"id"`
	TimelineID   int64  `json:"timelineId"`
	ParentArcID  *int64 `json:"parentArcId"` // Nullable for nested arcs
	Name         string `json:"name"`
	Description  string `json:"description"`
	Duration     string `json:"duration"`
	SortOrder    int    `json:"sortOrder"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

// ArcEvent represents a scene, chapter, or plot point within an arc
type ArcEvent struct {
	ID               int64  `json:"id"`
	ArcID            int64  `json:"arcId"`
	Title            string `json:"title"`
	Type             string `json:"type"` // "chapter", "scene", "plot_point", etc.
	Description      string `json:"description"`
	TimePosition     string `json:"timePosition"` // "Day 1, Morning", "Chapter 5", etc.
	Duration         string `json:"duration"`
	SortOrder        int    `json:"sortOrder"`
	LibraryFilePath  string `json:"libraryFilePath"` // Optional link to Library file
	CreatedAt        string `json:"createdAt"`
	UpdatedAt        string `json:"updatedAt"`
}

// ArcEventParticipant links arc events to codex entries (characters, locations, objects)
type ArcEventParticipant struct {
	ID            int64  `json:"id"`
	EventID       int64  `json:"eventId"`
	CodexEntryID  int64  `json:"codexEntryId"`
	RoleInEvent   string `json:"roleInEvent"` // "protagonist", "location", "artifact", etc.
}

// DBInitialize sets up the database connection and ensures the table exists.
// Returns the connection handle or an error.
func DBInitialize(dbPath string) (*sql.DB, error) {
	log.Printf("Initializing database connection for: %s\n", dbPath)
	
	// Use better connection parameters for SQLite
	connString := dbPath + "?_foreign_keys=on&_busy_timeout=5000&_journal_mode=WAL"
	
	dbConn, err := sql.Open("sqlite", connString)
	if err != nil {
		return nil, fmt.Errorf("failed to open database %s: %w", dbPath, err)
	}
	
	// Set connection pool parameters
	dbConn.SetMaxOpenConns(3) // Allow limited concurrent connections for embeddings
	
	// Check connection
	err = dbConn.Ping()
	if err != nil {
		dbConn.Close() // Close the connection if ping fails
		return nil, fmt.Errorf("failed to ping database %s: %w", dbPath, err)
	}

	// Create tables if they don't exist
	createTablesSQL := []string{
		// Existing codex table
		`CREATE TABLE IF NOT EXISTS codex_entries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			type TEXT,
			content TEXT,
			created_at TEXT,
			updated_at TEXT
		);`,
		
		// Arc Weaver tables
		`CREATE TABLE IF NOT EXISTS timelines (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			description TEXT,
			duration TEXT,
			created_at TEXT,
			updated_at TEXT
		);`,
		
		`CREATE TABLE IF NOT EXISTS arcs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timeline_id INTEGER NOT NULL,
			parent_arc_id INTEGER,
			name TEXT NOT NULL,
			description TEXT,
			duration TEXT,
			sort_order INTEGER DEFAULT 0,
			created_at TEXT,
			updated_at TEXT,
			FOREIGN KEY (timeline_id) REFERENCES timelines(id) ON DELETE CASCADE,
			FOREIGN KEY (parent_arc_id) REFERENCES arcs(id) ON DELETE CASCADE
		);`,
		
		`CREATE TABLE IF NOT EXISTS arc_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			arc_id INTEGER NOT NULL,
			title TEXT NOT NULL,
			type TEXT,
			description TEXT,
			time_position TEXT,
			duration TEXT,
			sort_order INTEGER DEFAULT 0,
			library_file_path TEXT,
			created_at TEXT,
			updated_at TEXT,
			FOREIGN KEY (arc_id) REFERENCES arcs(id) ON DELETE CASCADE
		);`,
		
		`CREATE TABLE IF NOT EXISTS arc_event_participants (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			event_id INTEGER NOT NULL,
			codex_entry_id INTEGER NOT NULL,
			role_in_event TEXT,
			FOREIGN KEY (event_id) REFERENCES arc_events(id) ON DELETE CASCADE,
			FOREIGN KEY (codex_entry_id) REFERENCES codex_entries(id) ON DELETE CASCADE,
			UNIQUE(event_id, codex_entry_id)
		);`,
	}

	// Execute each table creation statement
	for i, sql := range createTablesSQL {
		_, err = dbConn.Exec(sql)
		if err != nil {
			dbConn.Close() // Close the connection if table creation fails
			return nil, fmt.Errorf("failed to create table %d in %s: %w", i+1, dbPath, err)
		}
	}

	log.Printf("Database connection for %s initialized successfully.", dbPath)
	return dbConn, nil // Return the connection handle
}

// DBClose closes the provided database connection.
func DBClose(dbConn *sql.DB) {
	if dbConn != nil {
		err := dbConn.Close()
		if err != nil {
			log.Printf("Error closing a database connection: %v\n", err)
		} else {
			log.Println("Database connection closed successfully.")
		}
	}
}

// DBUpdateEntry updates an existing entry in the database.
func DBUpdateEntry(dbConn *sql.DB, entry CodexEntry) error {
	if dbConn == nil {
		return fmt.Errorf("database connection is nil")
	}
	if entry.ID == 0 {
		return fmt.Errorf("cannot update entry with ID 0")
	}

	log.Printf("Updating entry with ID: %d\n", entry.ID)

	updateSQL := `UPDATE codex_entries SET name = ?, type = ?, content = ?, updated_at = datetime('now') WHERE id = ?;`
	stmt, err := dbConn.Prepare(updateSQL)
	if err != nil {
		return fmt.Errorf("failed to prepare update statement: %w", err)
	}
	defer stmt.Close()

	result, err := stmt.Exec(entry.Name, entry.Type, entry.Content, entry.ID)
	if err != nil {
		return fmt.Errorf("failed to execute update statement for ID %d: %w", entry.ID, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		// Log the error but don't necessarily fail the operation if rowsAffected fails
		log.Printf("Warning: could not determine rows affected after update for ID %d: %v", entry.ID, err)
	} else if rowsAffected == 0 {
		return fmt.Errorf("no entry found with ID %d to update", entry.ID)
	} else {
		log.Printf("Successfully updated entry ID %d (%d row affected).", entry.ID, rowsAffected)
	}

	return nil
}

// DBInsertEntry adds a new entry to the database and returns its ID
func DBInsertEntry(dbConn *sql.DB, name, entryType, content string) (int64, error) {
	insertSQL := `INSERT INTO codex_entries(name, type, content, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'));`
	stmt, err := dbConn.Prepare(insertSQL)
	if err != nil {
		return 0, fmt.Errorf("failed to prepare insert statement: %w", err)
	}
	defer stmt.Close()

	result, err := stmt.Exec(name, entryType, content)
	if err != nil {
		return 0, fmt.Errorf("failed to execute insert statement: %w", err)
	}

	newID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("failed to retrieve last insert ID: %w", err)
	}

	log.Printf("Inserted new entry with ID: %d", newID)
	return newID, nil
}

// DBDeleteEntry removes an entry from the database by its ID
func DBDeleteEntry(dbConn *sql.DB, id int64) error {
	deleteSQL := `DELETE FROM codex_entries WHERE id = ?;`
	stmt, err := dbConn.Prepare(deleteSQL)
	if err != nil {
		return fmt.Errorf("failed to prepare delete statement: %w", err)
	}
	defer stmt.Close()

	_, err = stmt.Exec(id)
	if err != nil {
		return fmt.Errorf("failed to execute delete statement: %w", err)
	}

	log.Printf("Deleted entry with ID: %d", id)
	return nil
}
