package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

func main() {
	if err := initDB(); err != nil {
		log.Fatalf("initDB: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", handleHealth)
	mux.HandleFunc("GET /api/pods", handlePods)
	mux.HandleFunc("GET /api/state", handleState)
	mux.HandleFunc("POST /api/reconnect", handleReconnect)

	log.Println("listening on :8000")
	if err := http.ListenAndServe(":8000", corsMiddleware(mux)); err != nil {
		log.Fatal(err)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, HealthResponse{Status: "ok"})
}

func handlePods(w http.ResponseWriter, r *http.Request) {
	pods, err := listPods()
	if err != nil {
		recordFailure()
		writeJSON(w, http.StatusServiceUnavailable, ErrorResponse{Error: err.Error()})
		return
	}
	recordSuccess()
	writeJSON(w, http.StatusOK, PodListResponse{
		Pods:      pods,
		FetchedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

func handleState(w http.ResponseWriter, r *http.Request) {
	state, err := getState()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, state)
}

func handleReconnect(w http.ResponseWriter, r *http.Request) {
	resetState()
	pods, err := listPods()
	if err != nil {
		recordFailure()
		writeJSON(w, http.StatusServiceUnavailable, ErrorResponse{Error: err.Error()})
		return
	}
	recordSuccess()
	writeJSON(w, http.StatusOK, PodListResponse{
		Pods:      pods,
		FetchedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:4200")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func ctx() context.Context {
	c, _ := context.WithTimeout(context.Background(), 10*time.Second)
	return c
}
