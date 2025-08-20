// Package arcs provides functionality for parsing and managing story arc markdown files
package arcs

import (
	"bufio"
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"Llore/internal/database"
)

// ParsedArc represents a complete parsed arc structure
type ParsedArc struct {
	Timeline Timeline `json:"timeline"`
	Arcs     []Arc    `json:"arcs"`
	Events   []Event  `json:"events"`
}

// Timeline represents a parsed timeline from markdown
type Timeline struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Duration    string `json:"duration"`
}

// Arc represents a parsed arc from markdown  
type Arc struct {
	Name         string  `json:"name"`
	Description  string  `json:"description"`
	Duration     string  `json:"duration"`
	ParentArc    *string `json:"parentArc"`
	TimelineID   int64   `json:"timelineId"`
	ParentArcID  *int64  `json:"parentArcId"`
	SortOrder    int     `json:"sortOrder"`
}

// Event represents a parsed event (chapter/scene) from markdown
type Event struct {
	Title            string   `json:"title"`
	Type             string   `json:"type"`
	Description      string   `json:"description"`
	TimePosition     string   `json:"timePosition"`
	Duration         string   `json:"duration"`
	Participants     []string `json:"participants"`
	LibraryFilePath  string   `json:"libraryFilePath"`
	ArcName          string   `json:"arcName"`
	SortOrder        int      `json:"sortOrder"`
}

// Metadata represents parsed metadata from markdown
type Metadata struct {
	Duration     string   `json:"duration"`
	Time         string   `json:"time"`
	Participants []string `json:"participants"`
	Type         string   `json:"type"`
	Parent       string   `json:"parent"`
}

// Regular expressions for parsing markdown
var (
	timelineRegex    = regexp.MustCompile(`^# Timeline: (.+)$`)
	arcRegex         = regexp.MustCompile(`^## Arc: (.+)$`)
	chapterRegex     = regexp.MustCompile(`^### Chapter \d+: (.+)$`)
	sceneRegex       = regexp.MustCompile(`^#### Scene: (.+)$`)
	beatRegex        = regexp.MustCompile(`^##### Beat: (.+)$`)
	metadataRegex    = regexp.MustCompile(`^\*([^:]+): (.+)\*$`)
	participantRegex = regexp.MustCompile(`\[\[([^\]]+)\]\]`)
)

// ParseArcMarkdown parses arc markdown content and returns structured data
func ParseArcMarkdown(content string) (*ParsedArc, error) {
	scanner := bufio.NewScanner(strings.NewReader(content))
	
	var result ParsedArc
	var currentArc *Arc
	var currentEvent *Event
	var currentDescription strings.Builder
	
	arcCounter := 0
	eventCounter := 0
	
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		
		// Skip empty lines
		if line == "" {
			if currentDescription.Len() > 0 {
				currentDescription.WriteString("\n")
			}
			continue
		}
		
		// Parse Timeline
		if matches := timelineRegex.FindStringSubmatch(line); matches != nil {
			result.Timeline.Name = strings.TrimSpace(matches[1])
			currentDescription.Reset()
			continue
		}
		
		// Parse Arc
		if matches := arcRegex.FindStringSubmatch(line); matches != nil {
			// Save previous event if exists
			if currentEvent != nil {
				if currentDescription.Len() > 0 {
					currentEvent.Description = strings.TrimSpace(currentDescription.String())
				}
				// CRITICAL FIX: Append the event to results before creating new arc
				result.Events = append(result.Events, *currentEvent)
			}
			
			// Create new arc
			currentArc = &Arc{
				Name:      strings.TrimSpace(matches[1]),
				SortOrder: arcCounter,
			}
			arcCounter++
			currentEvent = nil
			currentDescription.Reset()
			continue
		}
		
		// Parse Chapter or Scene  
		var matches []string
		if matches = chapterRegex.FindStringSubmatch(line); matches != nil {
			// Continue with chapter processing
		} else if matches = sceneRegex.FindStringSubmatch(line); matches != nil {
			// Continue with scene processing  
		} else if matches = beatRegex.FindStringSubmatch(line); matches != nil {
			// Continue with beat processing
		} else {
			matches = nil
		}
		
		if matches != nil {
			
			// Save previous event description if exists
			if currentEvent != nil && currentDescription.Len() > 0 {
				currentEvent.Description = strings.TrimSpace(currentDescription.String())
				result.Events = append(result.Events, *currentEvent)
			}
			
			// Determine event type
			eventType := "scene"
			if chapterRegex.MatchString(line) {
				eventType = "chapter"
			} else if beatRegex.MatchString(line) {
				eventType = "beat"
			}
			
			// Create new event
			currentEvent = &Event{
				Title:     strings.TrimSpace(matches[1]),
				Type:      eventType,
				SortOrder: eventCounter,
			}
			
			if currentArc != nil {
				currentEvent.ArcName = currentArc.Name
			}
			
			eventCounter++
			currentDescription.Reset()
			continue
		}
		
		// Parse metadata
		if matches := metadataRegex.FindStringSubmatch(line); matches != nil {
			metadata := parseMetadata(matches[1], matches[2])
			
			// Apply metadata to current context
			if currentEvent != nil {
				applyMetadataToEvent(currentEvent, metadata)
			} else if currentArc != nil {
				applyMetadataToArc(currentArc, metadata)
			} else {
				applyMetadataToTimeline(&result.Timeline, metadata)
			}
			continue
		}
		
		// Regular content (description)
		if currentDescription.Len() > 0 {
			currentDescription.WriteString("\n")
		}
		currentDescription.WriteString(line)
	}
	
	// Save final event description if exists
	if currentEvent != nil {
		if currentDescription.Len() > 0 {
			currentEvent.Description = strings.TrimSpace(currentDescription.String())
		}
		result.Events = append(result.Events, *currentEvent)
	}
	
	// Save final arc if exists
	if currentArc != nil {
		if currentDescription.Len() > 0 {
			currentArc.Description = strings.TrimSpace(currentDescription.String())
		}
		result.Arcs = append(result.Arcs, *currentArc)
	}
	
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading markdown: %w", err)
	}
	
	return &result, nil
}

// parseMetadata extracts metadata from a metadata line
func parseMetadata(key, value string) Metadata {
	var metadata Metadata
	
	switch strings.ToLower(strings.TrimSpace(key)) {
	case "duration":
		metadata.Duration = strings.TrimSpace(value)
	case "time":
		metadata.Time = strings.TrimSpace(value)
	case "participants":
		metadata.Participants = extractParticipants(value)
	case "type":
		metadata.Type = strings.TrimSpace(value)
	case "parent":
		metadata.Parent = strings.TrimSpace(value)
	}
	
	return metadata
}

// extractParticipants finds all [[Name]] patterns in text
func extractParticipants(text string) []string {
	matches := participantRegex.FindAllStringSubmatch(text, -1)
	var participants []string
	
	for _, match := range matches {
		if len(match) > 1 {
			participants = append(participants, strings.TrimSpace(match[1]))
		}
	}
	
	return participants
}

// applyMetadataToTimeline applies parsed metadata to timeline
func applyMetadataToTimeline(timeline *Timeline, metadata Metadata) {
	if metadata.Duration != "" {
		timeline.Duration = metadata.Duration
	}
}

// applyMetadataToArc applies parsed metadata to arc
func applyMetadataToArc(arc *Arc, metadata Metadata) {
	if metadata.Duration != "" {
		arc.Duration = metadata.Duration
	}
	if metadata.Parent != "" {
		arc.ParentArc = &metadata.Parent
	}
}

// applyMetadataToEvent applies parsed metadata to event
func applyMetadataToEvent(event *Event, metadata Metadata) {
	if metadata.Duration != "" {
		event.Duration = metadata.Duration
	}
	if metadata.Time != "" {
		event.TimePosition = metadata.Time
	}
	if len(metadata.Participants) > 0 {
		event.Participants = append(event.Participants, metadata.Participants...)
	}
	if metadata.Type != "" {
		event.Type = metadata.Type
	}
}

// clearTimelineData efficiently clears all data for a timeline using optimized queries
func clearTimelineData(tx *sql.Tx, timelineID int64) error {
	// Get all arc IDs for this timeline first
	arcIDs := []int64{}
	arcSQL := `SELECT id FROM arcs WHERE timeline_id = ?`
	rows, err := tx.Query(arcSQL, timelineID)
	if err != nil {
		return fmt.Errorf("failed to get arc IDs: %w", err)
	}
	defer rows.Close()
	
	for rows.Next() {
		var arcID int64
		if err := rows.Scan(&arcID); err != nil {
			return fmt.Errorf("failed to scan arc ID: %w", err)
		}
		arcIDs = append(arcIDs, arcID)
	}
	
	if len(arcIDs) > 0 {
		// Get all event IDs for these arcs
		eventIDs := []int64{}
		placeholders := make([]string, len(arcIDs))
		args := make([]interface{}, len(arcIDs))
		for i, id := range arcIDs {
			placeholders[i] = "?"
			args[i] = id
		}
		
		eventSQL := fmt.Sprintf(`SELECT id FROM arc_events WHERE arc_id IN (%s)`, strings.Join(placeholders, ","))
		rows, err = tx.Query(eventSQL, args...)
		if err != nil {
			return fmt.Errorf("failed to get event IDs: %w", err)
		}
		defer rows.Close()
		
		for rows.Next() {
			var eventID int64
			if err := rows.Scan(&eventID); err != nil {
				return fmt.Errorf("failed to scan event ID: %w", err)
			}
			eventIDs = append(eventIDs, eventID)
		}
		
		// Delete participants for these events
		if len(eventIDs) > 0 {
			participantPlaceholders := make([]string, len(eventIDs))
			participantArgs := make([]interface{}, len(eventIDs))
			for i, id := range eventIDs {
				participantPlaceholders[i] = "?"
				participantArgs[i] = id
			}
			
			participantSQL := fmt.Sprintf(`DELETE FROM arc_event_participants WHERE event_id IN (%s)`, strings.Join(participantPlaceholders, ","))
			_, err = tx.Exec(participantSQL, participantArgs...)
			if err != nil {
				return fmt.Errorf("failed to delete participants: %w", err)
			}
		}
		
		// Delete events for these arcs
		eventDeleteSQL := fmt.Sprintf(`DELETE FROM arc_events WHERE arc_id IN (%s)`, strings.Join(placeholders, ","))
		_, err = tx.Exec(eventDeleteSQL, args...)
		if err != nil {
			return fmt.Errorf("failed to delete events: %w", err)
		}
	}
	
	// Finally delete the arcs
	_, err = tx.Exec(`DELETE FROM arcs WHERE timeline_id = ?`, timelineID)
	if err != nil {
		return fmt.Errorf("failed to delete arcs: %w", err)
	}
	
	return nil
}

// SaveParsedArcToDatabaseWithID saves a parsed arc structure to the database with optional timeline ID for updates
func SaveParsedArcToDatabaseWithID(dbConn *sql.DB, parsed *ParsedArc, timelineID *int64) error {
	log.Printf("Starting SaveParsedArcToDatabaseWithID for timeline ID: %v, timeline name: %s", timelineID, parsed.Timeline.Name)
	tx, err := dbConn.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback() // Will be ignored if tx.Commit() succeeds
	
	now := time.Now().Format(time.RFC3339)
	var currentTimelineID int64
	
	if timelineID != nil {
		// Update mode - use provided timeline ID
		currentTimelineID = *timelineID
		
		// Verify timeline exists
		checkSQL := `SELECT id FROM timelines WHERE id = ?`
		err = tx.QueryRow(checkSQL, currentTimelineID).Scan(&currentTimelineID)
		if err != nil {
			return fmt.Errorf("timeline with ID %d not found: %w", *timelineID, err)
		}
		
		// Update timeline with new data from markdown
		updateSQL := `UPDATE timelines SET name = ?, description = ?, duration = ?, updated_at = ? WHERE id = ?`
		_, err = tx.Exec(updateSQL, parsed.Timeline.Name, parsed.Timeline.Description, parsed.Timeline.Duration, now, currentTimelineID)
		if err != nil {
			return fmt.Errorf("failed to update timeline: %w", err)
		}
		
		// Clear existing data for this timeline using optimized queries
		log.Printf("Clearing existing data for timeline ID: %d", currentTimelineID)
		err = clearTimelineData(tx, currentTimelineID)
		if err != nil {
			return fmt.Errorf("failed to clear existing timeline data: %w", err)
		}
		log.Printf("Successfully cleared data for timeline ID: %d", currentTimelineID)
	} else {
		// Create mode - check if timeline exists by name
		checkSQL := `SELECT id FROM timelines WHERE name = ?`
		err = tx.QueryRow(checkSQL, parsed.Timeline.Name).Scan(&currentTimelineID)
		
		if err == sql.ErrNoRows {
			// Timeline doesn't exist, create new one
			timelineSQL := `INSERT INTO timelines (name, description, duration, created_at, updated_at) 
			                VALUES (?, ?, ?, ?, ?) RETURNING id`
			
			err = tx.QueryRow(timelineSQL, 
				parsed.Timeline.Name, 
				parsed.Timeline.Description, 
				parsed.Timeline.Duration,
				now, now).Scan(&currentTimelineID)
			if err != nil {
				return fmt.Errorf("failed to insert timeline: %w", err)
			}
		} else if err != nil {
			return fmt.Errorf("failed to check existing timeline: %w", err)
		} else {
			// Timeline exists, update it
			updateSQL := `UPDATE timelines SET description = ?, duration = ?, updated_at = ? WHERE id = ?`
			_, err = tx.Exec(updateSQL, parsed.Timeline.Description, parsed.Timeline.Duration, now, currentTimelineID)
			if err != nil {
				return fmt.Errorf("failed to update timeline: %w", err)
			}
			
			// Clear existing data for this timeline using optimized queries
			log.Printf("Clearing existing data for timeline ID: %d", currentTimelineID)
			err = clearTimelineData(tx, currentTimelineID)
			if err != nil {
				return fmt.Errorf("failed to clear existing timeline data: %w", err)
			}
			log.Printf("Successfully cleared data for timeline ID: %d", currentTimelineID)
		}
	}
	
	// Map arc names to IDs
	arcNameToID := make(map[string]int64)
	
	log.Printf("Preparing to insert %d arcs and %d events for timeline ID: %d", len(parsed.Arcs), len(parsed.Events), currentTimelineID)
	// Insert arcs
	for _, arc := range parsed.Arcs {
		arcSQL := `INSERT INTO arcs (timeline_id, parent_arc_id, name, description, duration, sort_order, created_at, updated_at) 
		           VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
		
		var parentArcID *int64
		if arc.ParentArc != nil {
			if id, exists := arcNameToID[*arc.ParentArc]; exists {
				parentArcID = &id
			}
		}
		
		var arcID int64
		err = tx.QueryRow(arcSQL,
			currentTimelineID,
			parentArcID,
			arc.Name,
			arc.Description,
			arc.Duration,
			arc.SortOrder,
			now, now).Scan(&arcID)
		if err != nil {
			return fmt.Errorf("failed to insert arc %s: %w", arc.Name, err)
		}
		
		arcNameToID[arc.Name] = arcID
	}
	
	// Insert events
	for _, event := range parsed.Events {
		arcID, exists := arcNameToID[event.ArcName]
		if !exists {
			log.Printf("Warning: Arc %s not found for event %s", event.ArcName, event.Title)
			continue
		}
		
		eventSQL := `INSERT INTO arc_events (arc_id, title, type, description, time_position, duration, sort_order, library_file_path, created_at, updated_at) 
		             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
		
		var eventID int64
		err = tx.QueryRow(eventSQL,
			arcID,
			event.Title,
			event.Type,
			event.Description,
			event.TimePosition,
			event.Duration,
			event.SortOrder,
			event.LibraryFilePath,
			now, now).Scan(&eventID)
		if err != nil {
			return fmt.Errorf("failed to insert event %s: %w", event.Title, err)
		}
		
		// Insert participants (this would require looking up codex entries)
		// We'll implement this later when we have the full codex integration
		for _, participantName := range event.Participants {
			// TODO: Look up codex entry by name and create arc_event_participants record
			log.Printf("TODO: Link participant %s to event %s", participantName, event.Title)
		}
	}
	
	if err := tx.Commit(); err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		return fmt.Errorf("failed to commit transaction: %w", err)
	}
	
	log.Printf("Successfully committed transaction for timeline ID: %d", currentTimelineID)
	return nil
}

// SaveParsedArcToDatabase saves a parsed arc structure to the database (compatibility wrapper)
func SaveParsedArcToDatabase(dbConn *sql.DB, parsed *ParsedArc) error {
	return SaveParsedArcToDatabaseWithID(dbConn, parsed, nil)
}

// GetTimelineByID retrieves a timeline and its associated arcs/events from the database
func GetTimelineByID(dbConn *sql.DB, timelineID int64) (*ParsedArc, error) {
	var result ParsedArc
	
	// Get timeline
	timelineSQL := `SELECT name, description, duration FROM timelines WHERE id = ?`
	err := dbConn.QueryRow(timelineSQL, timelineID).Scan(
		&result.Timeline.Name, 
		&result.Timeline.Description, 
		&result.Timeline.Duration,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get timeline: %w", err)
	}
	
	// Get arcs
	arcsSQL := `SELECT name, description, duration, sort_order FROM arcs WHERE timeline_id = ? ORDER BY sort_order`
	rows, err := dbConn.Query(arcsSQL, timelineID)
	if err != nil {
		return nil, fmt.Errorf("failed to query arcs: %w", err)
	}
	defer rows.Close()
	
	for rows.Next() {
		var arc Arc
		err := rows.Scan(&arc.Name, &arc.Description, &arc.Duration, &arc.SortOrder)
		if err != nil {
			return nil, fmt.Errorf("failed to scan arc: %w", err)
		}
		result.Arcs = append(result.Arcs, arc)
	}
	
	// Get events with their IDs for efficient participant lookup
	eventsSQL := `
		SELECT e.id, e.title, e.type, e.description, e.time_position, e.duration, e.sort_order, e.library_file_path, a.name as arc_name
		FROM arc_events e
		JOIN arcs a ON e.arc_id = a.id
		WHERE a.timeline_id = ?
		ORDER BY e.sort_order
	`
	rows, err = dbConn.Query(eventsSQL, timelineID)
	if err != nil {
		return nil, fmt.Errorf("failed to query events: %w", err)
	}
	defer rows.Close()
	
	// Map to store events by ID for efficient participant assignment
	eventMap := make(map[int64]*Event)
	var eventIDs []int64
	
	for rows.Next() {
		var event Event
		var eventID int64
		err := rows.Scan(
			&eventID,
			&event.Title, 
			&event.Type, 
			&event.Description, 
			&event.TimePosition, 
			&event.Duration, 
			&event.SortOrder, 
			&event.LibraryFilePath,
			&event.ArcName,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event: %w", err)
		}
		
		// Initialize empty participants slice
		event.Participants = []string{}
		
		eventMap[eventID] = &event
		eventIDs = append(eventIDs, eventID)
		result.Events = append(result.Events, event)
	}
	
	// Batch load all participants for all events in a single query
	if len(eventIDs) > 0 {
		// Create placeholders for IN clause
		placeholders := make([]string, len(eventIDs))
		args := make([]interface{}, len(eventIDs))
		for i, id := range eventIDs {
			placeholders[i] = "?"
			args[i] = id
		}
		
		participantsSQL := fmt.Sprintf(`
			SELECT ep.event_id, ce.name
			FROM arc_event_participants ep
			JOIN codex_entries ce ON ep.codex_entry_id = ce.id
			WHERE ep.event_id IN (%s)
			ORDER BY ep.event_id
		`, strings.Join(placeholders, ","))
		
		participantRows, err := dbConn.Query(participantsSQL, args...)
		if err != nil {
			return nil, fmt.Errorf("failed to query participants: %w", err)
		}
		defer participantRows.Close()
		
		// Assign participants to their respective events
		for participantRows.Next() {
			var eventID int64
			var participant string
			if err := participantRows.Scan(&eventID, &participant); err != nil {
				return nil, fmt.Errorf("failed to scan participant: %w", err)
			}
			
			if event, exists := eventMap[eventID]; exists {
				event.Participants = append(event.Participants, participant)
			}
		}
		
		// Update the result events with the populated participants
		for i := range result.Events {
			if event, exists := eventMap[eventIDs[i]]; exists {
				result.Events[i].Participants = event.Participants
			}
		}
	}
	
	return &result, nil
}

// ConvertToMarkdown converts a ParsedArc back to markdown format
func ConvertToMarkdown(parsed *ParsedArc) string {
	var md strings.Builder
	
	// Timeline header
	md.WriteString("# Timeline: ")
	md.WriteString(parsed.Timeline.Name)
	md.WriteString("\n\n")
	
	// Timeline metadata
	if parsed.Timeline.Duration != "" {
		md.WriteString("*Duration: ")
		md.WriteString(parsed.Timeline.Duration)
		md.WriteString("*\n\n")
	}
	
	// Timeline description
	if parsed.Timeline.Description != "" {
		md.WriteString(parsed.Timeline.Description)
		md.WriteString("\n\n")
	}
	
	// Process each arc
	for _, arc := range parsed.Arcs {
		md.WriteString("## Arc: ")
		md.WriteString(arc.Name)
		md.WriteString("\n\n")
		
		// Arc metadata
		if arc.Duration != "" {
			md.WriteString("*Duration: ")
			md.WriteString(arc.Duration)
			md.WriteString("*\n\n")
		}
		
		// Arc description
		if arc.Description != "" {
			md.WriteString(arc.Description)
			md.WriteString("\n\n")
		}
		
		// Get events for this arc
		arcEvents := getEventsForArc(parsed.Events, arc.Name)
		
		for _, event := range arcEvents {
			// Determine the heading level based on event type
			heading := "### "
			if event.Type == "chapter" {
				heading = "### Chapter: "
			} else if event.Type == "scene" {
				heading = "#### Scene: "
			} else if event.Type == "beat" {
				heading = "##### Beat: "
			}
			
			md.WriteString(heading)
			md.WriteString(event.Title)
			md.WriteString("\n\n")
			
			// Event metadata
			if event.TimePosition != "" {
				md.WriteString("*Time: ")
				md.WriteString(event.TimePosition)
				md.WriteString("*\n")
			}
			
			if event.Duration != "" {
				md.WriteString("*Duration: ")
				md.WriteString(event.Duration)
				md.WriteString("*\n")
			}
			
			if len(event.Participants) > 0 {
				md.WriteString("*Participants: ")
				for i, participant := range event.Participants {
					md.WriteString("[[")
					md.WriteString(participant)
					md.WriteString("]]")
					if i < len(event.Participants)-1 {
						md.WriteString(", ")
					}
				}
				md.WriteString("*\n")
			}
			
			if event.TimePosition != "" || event.Duration != "" || len(event.Participants) > 0 {
				md.WriteString("\n")
			}
			
			// Event description
			if event.Description != "" {
				md.WriteString(event.Description)
				md.WriteString("\n\n")
			}
		}
	}
	
	return md.String()
}

// getEventsForArc filters events that belong to a specific arc
func getEventsForArc(events []Event, arcName string) []Event {
	var arcEvents []Event
	for _, event := range events {
		if event.ArcName == arcName {
			arcEvents = append(arcEvents, event)
		}
	}
	return arcEvents
}

// GetAllTimelines retrieves all timelines from the database
func GetAllTimelines(dbConn *sql.DB) ([]database.Timeline, error) {
	timelineSQL := `SELECT id, name, description, duration, created_at, updated_at FROM timelines ORDER BY created_at DESC`
	
	rows, err := dbConn.Query(timelineSQL)
	if err != nil {
		return nil, fmt.Errorf("failed to query timelines: %w", err)
	}
	defer rows.Close()
	
	var timelines []database.Timeline
	for rows.Next() {
		var timeline database.Timeline
		err := rows.Scan(&timeline.ID, &timeline.Name, &timeline.Description, &timeline.Duration, &timeline.CreatedAt, &timeline.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan timeline: %w", err)
		}
		timelines = append(timelines, timeline)
	}
	
	return timelines, nil
}

// SearchResult represents a search result from Arc Weaver
type SearchResult struct {
	ID          int64  `json:"id"`
	Type        string `json:"type"`        // "timeline", "arc", "chapter", "scene", "beat"
	Title       string `json:"title"`       // Name/title of the element
	Description string `json:"description"` // Content/description
	TimelineID  int64  `json:"timelineId"`  // Parent timeline ID
	ParentName  string `json:"parentName"`  // Name of parent element
	TimePos     string `json:"timePos"`     // Time position if applicable
}

// SearchArcContent searches across all timeline structure elements
func SearchArcContent(dbConn *sql.DB, query string) ([]SearchResult, error) {
	var results []SearchResult
	query = strings.ToLower(query)
	
	// Search timelines
	timelineSQL := `SELECT id, name, description FROM timelines 
	                WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ?`
	rows, err := dbConn.Query(timelineSQL, "%"+query+"%", "%"+query+"%")
	if err != nil {
		return nil, fmt.Errorf("failed to search timelines: %w", err)
	}
	defer rows.Close()
	
	for rows.Next() {
		var result SearchResult
		err := rows.Scan(&result.ID, &result.Title, &result.Description)
		if err != nil {
			continue
		}
		result.Type = "timeline"
		result.TimelineID = result.ID
		results = append(results, result)
	}
	
	// Search arcs
	arcSQL := `SELECT a.id, a.name, a.description, a.timeline_id, t.name as timeline_name
	           FROM arcs a
	           JOIN timelines t ON a.timeline_id = t.id
	           WHERE LOWER(a.name) LIKE ? OR LOWER(a.description) LIKE ?`
	rows, err = dbConn.Query(arcSQL, "%"+query+"%", "%"+query+"%")
	if err != nil {
		return nil, fmt.Errorf("failed to search arcs: %w", err)
	}
	defer rows.Close()
	
	for rows.Next() {
		var result SearchResult
		err := rows.Scan(&result.ID, &result.Title, &result.Description, &result.TimelineID, &result.ParentName)
		if err != nil {
			continue
		}
		result.Type = "arc"
		results = append(results, result)
	}
	
	// Search events (chapters, scenes, beats)
	eventSQL := `SELECT e.id, e.title, e.description, e.type, e.time_position, a.timeline_id, a.name as arc_name
	             FROM arc_events e
	             JOIN arcs a ON e.arc_id = a.id
	             WHERE LOWER(e.title) LIKE ? OR LOWER(e.description) LIKE ?`
	rows, err = dbConn.Query(eventSQL, "%"+query+"%", "%"+query+"%")
	if err != nil {
		return nil, fmt.Errorf("failed to search events: %w", err)
	}
	defer rows.Close()
	
	for rows.Next() {
		var result SearchResult
		err := rows.Scan(&result.ID, &result.Title, &result.Description, &result.Type, &result.TimePos, &result.TimelineID, &result.ParentName)
		if err != nil {
			continue
		}
		results = append(results, result)
	}
	
	return results, nil
}

// SaveMarkdownToArcsFolder saves a timeline markdown to the Arcs/ folder
func SaveMarkdownToArcsFolder(vaultPath, timelineName, markdown string) (string, error) {
	// Create Arcs folder if it doesn't exist
	arcsDir := filepath.Join(vaultPath, "Arcs")
	if err := os.MkdirAll(arcsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create Arcs directory: %w", err)
	}
	
	// Generate safe filename
	filename := generateSafeFilename(timelineName) + ".md"
	filePath := filepath.Join(arcsDir, filename)
	
	// Write markdown to file
	if err := os.WriteFile(filePath, []byte(markdown), 0644); err != nil {
		return "", fmt.Errorf("failed to write markdown file: %w", err)
	}
	
	return filePath, nil
}

// ReadMarkdownFromArcsFolder reads a timeline markdown from the Arcs/ folder
func ReadMarkdownFromArcsFolder(vaultPath, timelineName string) (string, error) {
	filename := generateSafeFilename(timelineName) + ".md"
	filePath := filepath.Join(vaultPath, "Arcs", filename)
	
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to read markdown file: %w", err)
	}
	
	return string(data), nil
}

// generateSafeFilename converts a timeline name to a safe filename
func generateSafeFilename(name string) string {
	// Replace spaces and special characters with underscores
	safe := regexp.MustCompile(`[^a-zA-Z0-9\-_]`).ReplaceAllString(name, "_")
	// Remove multiple consecutive underscores
	safe = regexp.MustCompile(`_+`).ReplaceAllString(safe, "_")
	// Trim underscores from start and end
	safe = strings.Trim(safe, "_")
	
	if safe == "" {
		safe = "untitled_timeline"
	}
	
	return safe
}

// UpdateTimelineMarkdownFile updates an existing timeline markdown file
func UpdateTimelineMarkdownFile(vaultPath, timelineName, newMarkdown string) error {
	filename := generateSafeFilename(timelineName) + ".md"
	filePath := filepath.Join(vaultPath, "Arcs", filename)
	
	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return fmt.Errorf("timeline markdown file does not exist: %s", filePath)
	}
	
	// Write updated markdown
	if err := os.WriteFile(filePath, []byte(newMarkdown), 0644); err != nil {
		return fmt.Errorf("failed to update markdown file: %w", err)
	}
	
	return nil
}