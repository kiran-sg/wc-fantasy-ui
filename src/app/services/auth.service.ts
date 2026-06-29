import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AuthResponse { token?: string; userId?: number; username?: string; isAdmin?: boolean; requiresPassword?: boolean; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private base = environment.apiBase + '/auth';

  isLoggedIn = signal(!!localStorage.getItem('token'));
  username = signal(localStorage.getItem('username') || '');
  isAdmin = signal(localStorage.getItem('isAdmin') === 'true');

  login(username: string, password?: string) {
    const body: any = { username };
    if (password) body['password'] = password;
    return this.http.post<AuthResponse>(`${this.base}/login`, body)
      .pipe(tap(r => {
        if (r.requiresPassword) return; // caller handles this case
        localStorage.setItem('token', r.token!);
        localStorage.setItem('userId', String(r.userId!));
        localStorage.setItem('username', r.username!);
        localStorage.setItem('isAdmin', String(r.isAdmin!));
        this.isLoggedIn.set(true);
        this.username.set(r.username!);
        this.isAdmin.set(r.isAdmin!);
      }));
  }

  logout() {
    localStorage.clear();
    this.isLoggedIn.set(false);
    this.username.set('');
    this.isAdmin.set(false);
  }

  getToken(): string | null { return localStorage.getItem('token'); }
  getUserId(): number { return +(localStorage.getItem('userId') || '0'); }
}
