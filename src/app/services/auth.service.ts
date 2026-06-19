import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';

interface AuthResponse { token: string; userId: number; username: string; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private base = environment.apiBase + '/auth';

  isLoggedIn = signal(!!localStorage.getItem('token'));
  username = signal(localStorage.getItem('username') || '');

  login(username: string) {
    return this.http.post<AuthResponse>(`${this.base}/login`, { username })
      .pipe(tap(r => {
        localStorage.setItem('token', r.token);
        localStorage.setItem('userId', String(r.userId));
        localStorage.setItem('username', r.username);
        this.isLoggedIn.set(true);
        this.username.set(r.username);
      }));
  }

  logout() {
    localStorage.clear();
    this.isLoggedIn.set(false);
    this.username.set('');
  }

  getToken(): string | null { return localStorage.getItem('token'); }
  getUserId(): number { return +(localStorage.getItem('userId') || '0'); }
}
