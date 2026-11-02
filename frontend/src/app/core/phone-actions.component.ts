import { Component, ElementRef, HostListener, Input, inject } from '@angular/core';

/** Returns a tel/sms-safe number (digits with an optional leading +), or '' if unusable. */
export function phoneHref(phone: string | null | undefined): string {
  const raw = (phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return (raw.startsWith('+') ? '+' : '') + digits;
}

@Component({
  selector: 'app-phone-actions',
  standalone: true,
  template: `
    @if (href) {
      <span class="phone-actions">
        <button type="button" class="phone-trigger" [attr.aria-expanded]="open"
          aria-haspopup="menu" (click)="open = !open">{{ phone }}</button>
        @if (open) {
          <span class="phone-menu" role="menu">
            <a role="menuitem" class="phone-call" [href]="'tel:' + href" (click)="closeSoon()">Call</a>
            <a role="menuitem" class="phone-text" [href]="'sms:' + href" (click)="closeSoon()">Text</a>
          </span>
        }
      </span>
    } @else {
      <span class="phone-none">—</span>
    }
  `
})
export class PhoneActionsComponent {
  private host = inject(ElementRef<HTMLElement>);
  @Input() phone: string | null | undefined = '';
  open = false;

  get href(): string {
    return phoneHref(this.phone);
  }

  // Removing the link during its own click would cancel the tel:/sms: navigation.
  closeSoon(): void {
    setTimeout(() => (this.open = false), 0);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: Event): void {
    if (this.open && !this.host.nativeElement.contains(e.target)) this.open = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open = false;
  }
}
