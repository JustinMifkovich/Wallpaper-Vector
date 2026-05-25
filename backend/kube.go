package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

var (
	kubeClientset *kubernetes.Clientset
	kubeMu        sync.Mutex
)

// getClientset returns the cached Kubernetes clientset, creating it on first call.
func getClientset() (*kubernetes.Clientset, error) {
	kubeMu.Lock()
	defer kubeMu.Unlock()
	if kubeClientset != nil {
		return kubeClientset, nil
	}
	cfg, err := clientcmd.BuildConfigFromFlags("", kubeConfigPath())
	if err != nil {
		return nil, fmt.Errorf("load kubeconfig: %w", err)
	}
	cs, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("create client: %w", err)
	}
	kubeClientset = cs
	return cs, nil
}

// invalidateClientset clears the cached clientset so the next call to getClientset
// will re-read the kubeconfig and create a fresh client.
func invalidateClientset() {
	kubeMu.Lock()
	kubeClientset = nil
	kubeMu.Unlock()
}

func listPods() ([]PodInfo, error) {
	cs, err := getClientset()
	if err != nil {
		return nil, err
	}

	podList, err := cs.CoreV1().Pods("").List(ctx(), metav1.ListOptions{})
	if err != nil {
		// Stale token or closed connection — force a fresh client next time.
		invalidateClientset()
		return nil, fmt.Errorf("list pods: %w", err)
	}

	pods := make([]PodInfo, 0, len(podList.Items))
	for _, p := range podList.Items {
		var readyCount, totalCount, restarts int
		for _, cs := range p.Status.ContainerStatuses {
			totalCount++
			if cs.Ready {
				readyCount++
			}
			restarts += int(cs.RestartCount)
		}

		status := "Unknown"
		if p.Status.Phase != "" {
			status = string(p.Status.Phase)
		}

		node := p.Spec.NodeName

		pods = append(pods, PodInfo{
			Name:      p.Name,
			Namespace: p.Namespace,
			Status:    status,
			Ready:     fmt.Sprintf("%d/%d", readyCount, totalCount),
			Restarts:  restarts,
			Node:      node,
		})
	}
	return pods, nil
}

func kubeConfigPath() string {
	if kc := os.Getenv("KUBECONFIG"); kc != "" {
		return kc
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".kube", "config")
}
