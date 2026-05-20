package main

import (
	"database/sql"
	"os"
	"time"

	_ "modernc.org/sqlite"
)

const (
	reachableInterval  = 10 * time.Second
	shortRetryInterval = 60 * time.Second
	longRetryInterval  = 3600 * time.Second
	longRetryThreshold = 5
)

var db *sql.DB

func initDB() error {
	dsn := os.Getenv("STATE_DB")
	if dsn == "" {
		dsn = ":memory:"
	}
	var err error
	db, err = sql.Open("sqlite", dsn)
	if err != nil {
		return err
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS poll_state (
		id                  INTEGER PRIMARY KEY CHECK (id = 1),
		consecutive_failures INTEGER NOT NULL DEFAULT 0,
		next_poll_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
	)`)
	if err != nil {
		return err
	}
	_, err = db.Exec(`INSERT OR IGNORE INTO poll_state (id) VALUES (1)`)
	return err
}

func getState() (StateResponse, error) {
	var failures int
	var nextPollAt string
	err := db.QueryRow(`SELECT consecutive_failures, next_poll_at FROM poll_state WHERE id = 1`).
		Scan(&failures, &nextPollAt)
	return StateResponse{ConsecutiveFailures: failures, NextPollAt: nextPollAt}, err
}

func recordSuccess() {
	next := time.Now().UTC().Add(reachableInterval).Format(time.RFC3339)
	db.Exec(`UPDATE poll_state SET consecutive_failures = 0, next_poll_at = ? WHERE id = 1`, next)
}

func recordFailure() {
	tx, err := db.Begin()
	if err != nil {
		return
	}
	defer tx.Rollback()

	var failures int
	tx.QueryRow(`SELECT consecutive_failures FROM poll_state WHERE id = 1`).Scan(&failures)
	failures++

	interval := shortRetryInterval
	if failures >= longRetryThreshold {
		interval = longRetryInterval
	}
	next := time.Now().UTC().Add(interval).Format(time.RFC3339)
	tx.Exec(`UPDATE poll_state SET consecutive_failures = ?, next_poll_at = ? WHERE id = 1`, failures, next)
	tx.Commit()
}

func resetState() {
	now := time.Now().UTC().Format(time.RFC3339)
	db.Exec(`UPDATE poll_state SET consecutive_failures = 0, next_poll_at = ? WHERE id = 1`, now)
}
