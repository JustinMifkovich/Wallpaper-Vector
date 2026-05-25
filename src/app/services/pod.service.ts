import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  Observable, Subject, of, concat, merge,
  switchMap, delay, map, catchError, timer, takeWhile, shareReplay, filter,
} from 'rxjs';

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

interface StateResponse {
  consecutiveFailures: number;
  nextPollAt: string;
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

  private readonly reconnectSubject$ = new Subject<void>();

  // null means "fetch in progress — show spinner"
  readonly pods$: Observable<PollFrame | null> = merge(
    of(false as const),
    this.reconnectSubject$.pipe(map(() => true as const))
  ).pipe(
    switchMap(isReconnect =>
      isReconnect ? this.doReconnectAndPoll() : this.initFromStateAndPoll()
    ),
    shareReplay(1)
  );

  readonly countdown$: Observable<number> = this.pods$.pipe(
    filter((frame): frame is PollFrame => frame !== null),
    switchMap(frame => {
      // When showing minutes, tick every 60 s instead of every 1 s — 60× fewer timer firings.
      const tickMs = frame.retryUnit === 'minutes' ? 60_000 : 1_000;
      return timer(0, tickMs).pipe(
        map(tick => Math.max(0, Math.round((frame.nextPollMs - tick * tickMs) / 1000))),
        takeWhile(s => s > 0, true)
      );
    })
  );

  reconnect(): void {
    this.consecutiveFailures = 0;
    this.reconnectSubject$.next();
  }

  private initFromStateAndPoll(): Observable<PollFrame | null> {
    return this.http.get<StateResponse>('/api/state').pipe(
      catchError(() => of({ consecutiveFailures: 0, nextPollAt: new Date().toISOString() } as StateResponse)),
      switchMap(state => {
        this.consecutiveFailures = state.consecutiveFailures;
        const remainingMs = Math.max(0, new Date(state.nextPollAt).getTime() - Date.now());

        if (state.consecutiveFailures > 0 && remainingMs > 1000) {
          const waitFrame: PollFrame = {
            pods: [],
            clusterStatus: 'unreachable',
            fetchedAt: null,
            nextPollMs: remainingMs,
            retryUnit: remainingMs > 120_000 ? 'minutes' : 'seconds',
          };
          return concat(
            of(waitFrame as PollFrame | null),
            timer(remainingMs).pipe(switchMap(() => this.pollLoop()))
          );
        }

        return timer(remainingMs).pipe(switchMap(() => this.pollLoop()));
      })
    );
  }

  // Reconnect: emits null immediately (spinner), then POST result, then normal poll loop.
  private doReconnectAndPoll(): Observable<PollFrame | null> {
    return concat(
      of(null as PollFrame | null),
      this.http.post<PodListResponse>('/api/reconnect', null).pipe(
        map(res => {
          this.consecutiveFailures = 0;
          return {
            pods: res.pods,
            clusterStatus: 'reachable' as ClusterStatus,
            fetchedAt: res.fetched_at,
            nextPollMs: REACHABLE_MS,
            retryUnit: 'seconds' as const,
          } satisfies PollFrame;
        }),
        catchError((_: HttpErrorResponse) => {
          this.consecutiveFailures = 1;
          return of({
            pods: [] as PodInfo[],
            clusterStatus: 'unreachable' as ClusterStatus,
            fetchedAt: null,
            nextPollMs: UNREACHABLE_SHORT_MS,
            retryUnit: 'seconds' as const,
          } satisfies PollFrame);
        }),
        switchMap(frame => this.afterFetch(frame))
      )
    );
  }

  private pollLoop(): Observable<PollFrame | null> {
    return this.fetchFrame().pipe(switchMap(frame => this.afterFetch(frame)));
  }

  // Emit the frame, wait nextPollMs, then start another pollLoop.
  private afterFetch(frame: PollFrame): Observable<PollFrame | null> {
    return concat(
      of(frame as PollFrame | null),
      timer(frame.nextPollMs).pipe(switchMap(() => this.pollLoop()))
    );
  }

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
