import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiService } from './api.service';

export const customerGuard: CanActivateFn = () => {
  const api = inject(ApiService);
  const router = inject(Router);
  if (!api.loggedIn) return router.createUrlTree(['/login']);
  return api.mustChangePassword ? router.createUrlTree(['/change-password']) : true;
};

export const adminGuard: CanActivateFn = () => {
  const api = inject(ApiService);
  const router = inject(Router);
  if (!api.isAdmin) return router.createUrlTree(['/login']);
  return api.mustChangePassword ? router.createUrlTree(['/change-password']) : true;
};

export const signedInGuard: CanActivateFn = () => {
  const api = inject(ApiService);
  const router = inject(Router);
  return api.loggedIn ? true : router.createUrlTree(['/login']);
};