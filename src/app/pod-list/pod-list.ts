import { Component, inject } from '@angular/core';
import { AsyncPipe, LowerCasePipe } from '@angular/common';
import { combineLatest, map } from 'rxjs';
import { PodService, PodInfo, PollFrame } from '../services/pod.service';

interface NamespaceRow {
  namespace: string;
  status: string;
  ready: string;
  restarts: number;
}

interface NamespaceFrame extends Omit<PollFrame, 'pods'> {
  namespaces: NamespaceRow[];
}

const STATUS_PRIORITY: Record<string, number> = {
  Failed: 4,
  Unknown: 3,
  Pending: 2,
  Running: 1,
  Succeeded: 0,
};

function groupByNamespace(pods: PodInfo[]): NamespaceRow[] {
  const map = new Map<string, { statuses: string[]; ready: number; total: number; restarts: number }>();

  for (const pod of pods) {
    if (!map.has(pod.namespace)) {
      map.set(pod.namespace, { statuses: [], ready: 0, total: 0, restarts: 0 });
    }
    const ns = map.get(pod.namespace)!;
    ns.statuses.push(pod.status);
    const [r, t] = pod.ready.split('/').map(Number);
    ns.ready += r || 0;
    ns.total += t || 0;
    ns.restarts += pod.restarts;
  }

  return Array.from(map.entries())
    .map(([namespace, ns]) => ({
      namespace,
      status: ns.statuses.reduce((worst, s) =>
        (STATUS_PRIORITY[s] ?? 0) > (STATUS_PRIORITY[worst] ?? 0) ? s : worst
      ),
      ready: `${ns.ready}/${ns.total}`,
      restarts: ns.restarts,
    }))
    .sort((a, b) => a.namespace.localeCompare(b.namespace));
}

@Component({
  selector: 'app-pod-list',
  imports: [AsyncPipe, LowerCasePipe],
  templateUrl: './pod-list.html',
  styleUrl: './pod-list.scss',
})
export class PodListComponent {
  private readonly podService = inject(PodService);

  readonly frame$ = this.podService.pods$.pipe(
    map((frame): NamespaceFrame => ({
      ...frame,
      namespaces: groupByNamespace(frame.pods),
    }))
  );

  readonly countdownDisplay$ = combineLatest([this.frame$, this.podService.countdown$]).pipe(
    map(([frame, seconds]) =>
      frame.retryUnit === 'minutes'
        ? `${Math.ceil(seconds / 60)}m`
        : `${seconds}s`
    )
  );
}
