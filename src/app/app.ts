import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { signal } from '@angular/core';
import { filter } from 'rxjs/operators';
import { AuthService } from './services/auth.service';
import { LoadingService } from './services/loading.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, MatToolbarModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  auth    = inject(AuthService);
  loading = inject(LoadingService);
  private router = inject(Router);

  isLoginPage = signal(false);
  isAdminPage = signal(false);

  constructor() {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.isLoginPage.set(e.urlAfterRedirects === '/login');
      this.isAdminPage.set(e.urlAfterRedirects === '/admin');
    });
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
