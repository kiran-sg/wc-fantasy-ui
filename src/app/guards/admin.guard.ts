import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { catchError, map, of } from 'rxjs';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    router.navigate(['/login']);
    return false;
  }

  // Verify isAdmin from DB — not from localStorage
  return auth.verifySession().pipe(
    map(r => {
      if (r.isAdmin) return true;
      router.navigate(['/matches']);
      return false;
    }),
    catchError(() => {
      // Network error or invalid token — kick to login
      auth.logout();
      router.navigate(['/login']);
      return of(false);
    })
  );
};
