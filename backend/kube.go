package main

import (
	"fmt"
	"os"
	"path/filepath"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

func listPods() ([]PodInfo, error) {
	cfg, err := clientcmd.BuildConfigFromFlags("", kubeConfigPath())
	if err != nil {
		return nil, fmt.Errorf("load kubeconfig: %w", err)
	}

	cs, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("create client: %w", err)
	}

	podList, err := cs.CoreV1().Pods("").List(ctx(), metav1.ListOptions{})
	if err != nil {
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
