import { Component, HostListener, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { filter } from 'rxjs/operators';
import { AuthService } from './services/auth.service';
import { LoadingService } from './services/loading.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  auth    = inject(AuthService);
  loading = inject(LoadingService);
  private router = inject(Router);

  isLoginPage = signal(false);
  isAdminPage = signal(false);
  drawerOpen  = false;

  private touchStartX = 0;
  private touchStartY = 0;

  constructor() {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.isLoginPage.set(e.urlAfterRedirects === '/login');
      this.isAdminPage.set(e.urlAfterRedirects === '/admin');
    });
  }

  toggleDrawer(): void { this.drawerOpen = !this.drawerOpen; }
  closeDrawer(): void  { this.drawerOpen = false; }

  onTouchStart(e: TouchEvent): void {
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  onTouchEnd(e: TouchEvent): void {
    const dx = e.changedTouches[0].clientX - this.touchStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - this.touchStartY);
    if (dx > 60 && dy < 40) this.closeDrawer();
  }

  @HostListener('document:touchstart', ['$event'])
  onDocTouchStart(e: TouchEvent): void {
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  @HostListener('document:touchend', ['$event'])
  onDocTouchEnd(e: TouchEvent): void {
    if (this.drawerOpen) return;
    if (this.touchStartX < window.innerWidth - 30) return;
    const dx = e.changedTouches[0].clientX - this.touchStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - this.touchStartY);
    if (dx < -60 && dy < 40) this.drawerOpen = true;
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
