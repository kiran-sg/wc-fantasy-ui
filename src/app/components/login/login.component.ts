import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, MatCardModule, MatInputModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="login-page">
      <div class="login-bg">
        <div class="bg-overlay"></div>
      </div>
      <mat-card class="login-card">
        <div class="login-brand">
          <div class="brand-images">
            <img src="assets/fuel-up-logo.png" alt="Fuel Up" class="brand-logo">
            <img src="assets/mascot.png" alt="Mascot" class="brand-mascot">
          </div>
          <h1 class="brand-title">FUEL UP Fantasy League</h1>
          <p class="brand-sub">FIFA World Cup 2026</p>
        </div>

        <mat-card-content>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>User ID / Hash ID</mat-label>
            <mat-icon matPrefix>person</mat-icon>
            <input matInput [(ngModel)]="username" (keyup.enter)="submit()"
              placeholder="Enter your User ID or Hash ID" autocomplete="username">
          </mat-form-field>

          @if (error) {
            <div class="login-error">
              <mat-icon>error_outline</mat-icon>
              {{ error }}
            </div>
          }
        </mat-card-content>

        <mat-card-actions>
          <button mat-flat-button class="login-btn" (click)="submit()" [disabled]="!username.trim() || loading">
            @if (loading) {
              <mat-spinner diameter="18" style="display:inline-block;margin-right:8px"></mat-spinner>
            }
            Sign In
          </button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      position: relative;
      overflow: hidden;
    }

    .login-bg {
      position: absolute;
      inset: 0;
      background-image: url('https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=1600&q=80');
      background-size: cover;
      background-position: center top;
      z-index: 0;
    }

    .bg-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(10,20,80,0.82) 0%, rgba(26,35,126,0.70) 50%, rgba(0,0,0,0.65) 100%);
    }

    .login-card {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 400px;
      border-radius: 20px !important;
      padding: 8px 8px 16px;
      background: rgba(255,255,255,0.96) !important;
      box-shadow: 0 16px 48px rgba(0,0,0,0.35) !important;
      backdrop-filter: blur(8px);
    }

    .login-brand {
      text-align: center;
      padding: 28px 16px 8px;
    }

    .brand-images {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .brand-logo {
      height: 56px;
      object-fit: contain;
    }

    .brand-mascot {
      height: 64px;
      object-fit: contain;
    }

    .brand-title {
      font-size: 22px;
      font-weight: 800;
      color: #1a237e;
      margin: 0 0 4px;
    }

    .brand-sub {
      font-size: 13px;
      color: #888;
      margin: 0 0 20px;
    }

    .full-width { width: 100%; }

    .login-error {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #c62828;
      font-size: 13px;
      margin-top: -8px;
      margin-bottom: 8px;
    }
    .login-error mat-icon { font-size: 16px; width: 16px; height: 16px; }

    mat-card-actions {
      padding: 0 16px 8px !important;
    }

    .login-btn {
      width: 100%;
      height: 44px;
      font-size: 15px !important;
      font-weight: 700 !important;
      background: #1a237e !important;
      color: #fff !important;
      border-radius: 10px !important;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .login-btn:disabled {
      opacity: 0.6;
    }
  `]
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  username = '';
  loading = false;
  error = '';

  constructor() {
    if (this.auth.isLoggedIn()) {
      this.router.navigate([this.auth.isAdmin() ? '/admin' : '/my-team']);
    }
  }

  submit() {
    if (!this.username.trim()) return;
    this.loading = true;
    this.error = '';
    this.auth.login(this.username).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate([this.auth.isAdmin() ? '/admin' : '/my-team']);
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.error || 'Login failed. Please try again.';
      }
    });
  }
}
