import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private count = 0;
  readonly isLoading = signal(false);

  start() { if (++this.count > 0) this.isLoading.set(true); }
  stop()  { if (--this.count <= 0) { this.count = 0; this.isLoading.set(false); } }
}
