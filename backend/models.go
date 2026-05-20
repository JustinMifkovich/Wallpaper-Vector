package main

type PodInfo struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Status    string `json:"status"`
	Ready     string `json:"ready"`
	Restarts  int    `json:"restarts"`
	Node      string `json:"node"`
}

type PodListResponse struct {
	Pods      []PodInfo `json:"pods"`
	FetchedAt string    `json:"fetched_at"`
}

type HealthResponse struct {
	Status string `json:"status"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}
