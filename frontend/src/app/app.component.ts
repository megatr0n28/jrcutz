import { Component, HostListener, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { ApiService } from './core/api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.component.html'
})
export class AppComponent {
  api = inject(ApiService);
  router = inject(Router);
  showTop = false;

  @HostListener('window:scroll')
  onScroll(): void {
    this.showTop = window.scrollY > 300;
  }

  toTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  logout(): void {
    this.api.logout();
    this.router.navigateByUrl('/');
  }
}