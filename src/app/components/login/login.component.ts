import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, MatCardModule, MatInputModule, MatButtonModule, MatFormFieldModule],
  template: `
    <mat-card class="login-card">
      <mat-card-header>
        <mat-card-title>Welcome to WC Fantasy League</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Username</mat-label>
          <input matInput [(ngModel)]="username" (keyup.enter)="submit()" placeholder="Enter your username">
        </mat-form-field>
      </mat-card-content>
      <mat-card-actions>
        <button mat-flat-button class="full-width" (click)="submit()" [disabled]="!username.trim()">
          Enter
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    :host { display: flex; justify-content: center; padding-top: 40px; }
    .login-card { max-width: 360px; width: 100%; padding: 24px; }
    .full-width { width: 100%; }
    mat-card-actions { padding: 0 !important; }
  `]
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  username = '';

  submit() {
    if (!this.username.trim()) return;
    this.auth.login(this.username).subscribe(() => this.router.navigate(['/matches']));
  }
}
