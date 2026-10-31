import { Component, inject } from '@angular/core';
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

  logout(): void {
    this.api.logout();
    this.router.navigateByUrl('/');
  }
}