import { TestBed } from '@angular/core/testing';
import { PhoneActionsComponent, phoneHref } from './phone-actions.component';

describe('phoneHref', () => {
  it('strips formatting', () => {
    expect(phoneHref('(555) 123-4567')).toBe('5551234567');
    expect(phoneHref('555.123.4567')).toBe('5551234567');
  });
  it('keeps a leading plus', () => {
    expect(phoneHref('+1 (555) 123-4567')).toBe('+15551234567');
  });
  it('rejects empty, short and too-long values', () => {
    expect(phoneHref('')).toBe('');
    expect(phoneHref(null)).toBe('');
    expect(phoneHref(undefined)).toBe('');
    expect(phoneHref('123')).toBe('');
    expect(phoneHref('1234567890123456')).toBe('');
    expect(phoneHref('n/a')).toBe('');
  });
});

describe('PhoneActionsComponent', () => {
  function create(phone: string) {
    const fixture = TestBed.configureTestingModule({ imports: [PhoneActionsComponent] })
      .createComponent(PhoneActionsComponent);
    fixture.componentRef.setInput('phone', phone);
    fixture.detectChanges();
    return fixture;
  }
  const el = (f: { nativeElement: HTMLElement }) => f.nativeElement;

  it('shows a dash and no menu for an unusable number', () => {
    const f = create('none');
    expect(el(f).querySelector('.phone-trigger')).toBeNull();
    expect(el(f).querySelector('.phone-none')).not.toBeNull();
  });

  it('opens a Call/Text menu with tel and sms links', () => {
    const f = create('(555) 123-4567');
    expect(el(f).querySelector('.phone-menu')).toBeNull();
    (el(f).querySelector('.phone-trigger') as HTMLButtonElement).click();
    f.detectChanges();
    expect(el(f).querySelector('.phone-call')?.getAttribute('href')).toBe('tel:5551234567');
    expect(el(f).querySelector('.phone-text')?.getAttribute('href')).toBe('sms:5551234567');
    expect(el(f).querySelector('.phone-trigger')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes on Escape', () => {
    const f = create('5551234567');
    f.componentInstance.open = true;
    f.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    f.detectChanges();
    expect(el(f).querySelector('.phone-menu')).toBeNull();
  });

  it('closes when clicking outside but not inside', () => {
    const f = create('5551234567');
    document.body.appendChild(el(f));
    (el(f).querySelector('.phone-trigger') as HTMLButtonElement).click();
    f.detectChanges();
    expect(f.componentInstance.open).toBe(true);
    document.body.click();
    f.detectChanges();
    expect(f.componentInstance.open).toBe(false);
    el(f).remove();
  });

  it('closes after choosing an option', () => {
    const f = create('5551234567');
    f.componentInstance.open = true;
    f.detectChanges();
    const call = el(f).querySelector('.phone-call') as HTMLAnchorElement;
    call.addEventListener('click', e => e.preventDefault());
    call.click();
    f.detectChanges();
    expect(f.componentInstance.open).toBe(false);
  });
});
