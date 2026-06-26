import { Component, HostListener, inject, signal, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { filter } from 'rxjs/operators';
import { AuthService } from './services/auth.service';
import { LoadingService } from './services/loading.service';

const INACTIVITY_MS  = 15 * 60 * 1000;
const WARNING_MS     =  2 * 60 * 1000;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatSnackBarModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnDestroy {
  auth    = inject(AuthService);
  loading = inject(LoadingService);
  private router   = inject(Router);
  private snackBar = inject(MatSnackBar);

  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private warningTimer:    ReturnType<typeof setTimeout> | null = null;

  isLoginPage = signal(false);
  isAdminPage = signal(false);
  drawerOpen  = false;

  private touchStartX = 0;
  private touchStartY = 0;

  constructor() {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.isLoginPage.set(e.urlAfterRedirects === '/login');
      this.isAdminPage.set(e.urlAfterRedirects === '/admin');
      this.resetIdleTimer();
    });
    this.resetIdleTimer();
  }

  ngOnDestroy(): void { this.clearIdleTimers(); }

  @HostListener('document:mousemove')
  @HostListener('document:keydown')
  @HostListener('document:click')
  @HostListener('document:touchstart')
  onUserActivity(): void { this.resetIdleTimer(); }

  private resetIdleTimer(): void {
    this.clearIdleTimers();
    if (!this.auth.isLoggedIn()) return;

    this.warningTimer = setTimeout(() => {
      const ref = this.snackBar.open(
        'You will be logged out in 2 minutes due to inactivity.',
        'Stay Logged In',
        { duration: WARNING_MS, panelClass: 'inactivity-snack' }
      );
      ref.onAction().subscribe(() => this.resetIdleTimer());
    }, INACTIVITY_MS - WARNING_MS);

    this.inactivityTimer = setTimeout(() => {
      this.snackBar.dismiss();
      this.auth.logout();
      this.router.navigate(['/login']);
    }, INACTIVITY_MS);
  }

  private clearIdleTimers(): void {
    if (this.inactivityTimer) { clearTimeout(this.inactivityTimer); this.inactivityTimer = null; }
    if (this.warningTimer)    { clearTimeout(this.warningTimer);    this.warningTimer    = null; }
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
