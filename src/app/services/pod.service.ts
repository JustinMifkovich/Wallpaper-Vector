import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, expand, switchMap, delay, map, catchError, timer, takeWhile, shareReplay } from 'rxjs';

export interface PodInfo {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  restarts: number;
  node: string;
}

interface PodListResponse {
  pods: PodInfo[];
  fetched_at: string;
}

export type ClusterStatus = 'reachable' | 'unreachable';

export interface PollFrame {
  pods: PodInfo[];
  clusterStatus: ClusterStatus;
  fetchedAt: string | null;
  nextPollMs: number;
  retryUnit: 'seconds' | 'minutes';
}

const REACHABLE_MS = 10_000;
const UNREACHABLE_SHORT_MS = 60_000;
const UNREACHABLE_LONG_MS = 3_600_000;
const LONG_RETRY_THRESHOLD = 5;

@Injectable({ providedIn: 'root' })
export class PodService {
  private readonly http = inject(HttpClient);
  private consecutiveFailures = 0;

  readonly pods$: Observable<PollFrame> = this.fetchFrame().pipe(
    expand(frame =>
      of(frame).pipe(
        delay(frame.nextPollMs),
        switchMap(() => this.fetchFrame())
      )
    ),
    shareReplay(1)
  );

  readonly countdown$: Observable<number> = this.pods$.pipe(
    switchMap(frame =>
      timer(0, 1000).pipe(
        map(tick => Math.max(0, Math.round((frame.nextPollMs - tick * 1000) / 1000))),
        takeWhile(s => s > 0, true)
      )
    )
  );

  private fetchFrame(): Observable<PollFrame> {
    return this.http.get<PodListResponse>('/api/pods').pipe(
      map(res => {
        this.consecutiveFailures = 0;
        return {
          pods: res.pods,
          clusterStatus: 'reachable' as ClusterStatus,
          fetchedAt: res.fetched_at,
          nextPollMs: REACHABLE_MS,
          retryUnit: 'seconds' as const,
        };
      }),
      catchError((_: HttpErrorResponse) => {
        this.consecutiveFailures++;
        const longRetry = this.consecutiveFailures >= LONG_RETRY_THRESHOLD;
        return of({
          pods: [] as PodInfo[],
          clusterStatus: 'unreachable' as ClusterStatus,
          fetchedAt: null,
          nextPollMs: longRetry ? UNREACHABLE_LONG_MS : UNREACHABLE_SHORT_MS,
          retryUnit: longRetry ? 'minutes' as const : 'seconds' as const,
        });
      })
    );
  }
}
