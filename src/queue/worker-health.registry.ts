import { Injectable } from '@nestjs/common';

export interface WorkerHeartbeatSnapshot {
  workerName: string;
  lastHeartbeatAt: string;
  ageMs: number;
  healthy: boolean;
}

@Injectable()
export class WorkerHealthRegistry {
  private readonly workerHeartbeats = new Map<string, number>();

  heartbeat(workerName: string): void {
    this.workerHeartbeats.set(workerName, Date.now());
  }

  snapshot(staleAfterMs: number): WorkerHeartbeatSnapshot[] {
    const now = Date.now();

    return [...this.workerHeartbeats.entries()].map(([workerName, lastHeartbeat]) => ({
      workerName,
      lastHeartbeatAt: new Date(lastHeartbeat).toISOString(),
      ageMs: now - lastHeartbeat,
      healthy: now - lastHeartbeat <= staleAfterMs,
    }));
  }
}
