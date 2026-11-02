import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiService, CatalogItem } from '../core/api.service';
import { CatalogAdminComponent } from './catalog-admin.component';

describe('CatalogAdminComponent', () => {
  const services: CatalogItem[] = [
    { id: 1, name: 'Precision Haircut', description: 'Cut', priceCents: 2500, durationMinutes: 30, active: true },
    { id: 2, name: 'Haircut & Beard', description: '', priceCents: 3000, durationMinutes: 45, active: true },
    { id: 3, name: 'Old Style', description: '', priceCents: 1000, durationMinutes: 20, active: false }
  ];
  const addOns: CatalogItem[] = [
    { id: 9, name: 'Enhancements', description: 'Extras', priceCents: 500, durationMinutes: 5, active: true, serviceIds: [1, 2] }
  ];

  let api: Record<string, ReturnType<typeof vi.fn>>;
  let comp: CatalogAdminComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<CatalogAdminComponent>>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    api = Object.fromEntries([
      'adminServices', 'adminAddOns', 'createService', 'updateService', 'createAddOn', 'updateAddOn'
    ].map(n => [n, vi.fn()]));
    api['adminServices'].mockReturnValue(of(services));
    api['adminAddOns'].mockReturnValue(of(addOns));
    for (const n of ['createService', 'updateService', 'createAddOn', 'updateAddOn']) {
      api[n].mockReturnValue(of({}));
    }
    TestBed.configureTestingModule({
      imports: [CatalogAdminComponent],
      providers: [{ provide: ApiService, useValue: api }]
    });
    fixture = TestBed.createComponent(CatalogAdminComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  const open = () => { comp.toggle(); fixture.detectChanges(); };

  it('loads nothing until opened, then lists services and add-ons', () => {
    expect(api['adminServices']).not.toHaveBeenCalled();
    open();
    expect(api['adminServices']).toHaveBeenCalledTimes(1);
    expect(el().querySelectorAll('.catalog-services tbody tr').length).toBe(3);
    const addOnRow = el().querySelector('.catalog-addons tbody tr')!.textContent!;
    expect(addOnRow).toContain('Enhancements');
    expect(addOnRow).toContain('+5 min');
    expect(addOnRow).toContain('+$5.00');
    expect(addOnRow).toContain('Precision Haircut, Haircut & Beard');
  });

  it('marks inactive services', () => {
    open();
    const rows = el().querySelectorAll('.catalog-services tbody tr');
    expect(rows[2].classList.contains('inactive-row')).toBe(true);
    expect(rows[2].textContent).toContain('Inactive');
    expect(rows[2].textContent).toContain('Activate');
  });

  it('creates a service, converting dollars to cents', () => {
    open();
    comp.startNew('service');
    comp.form = { name: ' Kids Cut ', description: ' Under 12 ', price: 19.99, duration: 25, serviceIds: [] };
    comp.save();
    expect(api['createService']).toHaveBeenCalledWith({
      name: 'Kids Cut', description: 'Under 12', priceCents: 1999, durationMinutes: 25
    });
    expect(comp.editing).toBeNull();
    expect(comp.message).toBe('Service saved.');
    expect(api['adminServices']).toHaveBeenCalledTimes(2);
  });

  it('edits a service with its current values prefilled', () => {
    open();
    comp.startEdit('service', services[0]);
    expect(comp.form.price).toBe(25);
    comp.form.price = 27.5;
    comp.save();
    expect(api['updateService']).toHaveBeenCalledWith(1, expect.objectContaining({ priceCents: 2750, durationMinutes: 30 }));
    expect(api['createService']).not.toHaveBeenCalled();
  });

  it('creates and edits add-ons with their eligible services', () => {
    open();
    comp.startNew('addon');
    comp.form = { name: 'Hot Towel', description: '', price: 3, duration: 5, serviceIds: [] };
    comp.toggleFormService(2);
    comp.toggleFormService(1);
    comp.toggleFormService(2);
    comp.save();
    expect(api['createAddOn']).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Hot Towel', priceCents: 300, serviceIds: [1]
    }));

    comp.startEdit('addon', addOns[0]);
    expect(comp.form.serviceIds).toEqual([1, 2]);
    comp.save();
    expect(api['updateAddOn']).toHaveBeenCalledWith(9, expect.objectContaining({ serviceIds: [1, 2] }));
  });

  it('shows service checkboxes only when editing an add-on', () => {
    open();
    comp.startNew('service');
    fixture.detectChanges();
    expect(el().querySelector('.catalog-form .addon-option')).toBeNull();
    comp.startNew('addon');
    fixture.detectChanges();
    expect(el().querySelectorAll('.catalog-form .addon-option').length).toBe(3);
  });

  it('rejects invalid input without calling the API', () => {
    open();
    comp.startNew('service');
    comp.form = { name: ' ', description: '', price: 5, duration: 10, serviceIds: [] };
    comp.save();
    expect(comp.error).toBe('Name is required.');
    comp.form.name = 'A'; comp.form.price = -1;
    comp.save();
    expect(comp.error).toContain('Price');
    comp.form.price = 5; comp.form.duration = 0;
    comp.save();
    expect(comp.error).toContain('Duration');
    comp.form.duration = 2.5;
    comp.save();
    expect(comp.error).toContain('Duration');
    expect(api['createService']).not.toHaveBeenCalled();
  });

  it('shows the server error and keeps the form open when saving fails', () => {
    open();
    api['createAddOn'].mockReturnValue(throwError(() => ({ error: { error: 'An add-on with that name already exists' } })));
    comp.startNew('addon');
    comp.form = { name: 'Enhancements', description: '', price: 5, duration: 5, serviceIds: [1] };
    comp.save();
    expect(comp.error).toBe('An add-on with that name already exists');
    expect(comp.editing).not.toBeNull();
    expect(comp.busy).toBe(false);
  });

  it('deactivates and activates after confirmation', () => {
    open();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    comp.toggleActive('service', services[0]);
    expect(api['updateService']).toHaveBeenCalledWith(1, { active: false });
    comp.toggleActive('service', services[2]);
    expect(api['updateService']).toHaveBeenCalledWith(3, { active: true });
    comp.toggleActive('addon', addOns[0]);
    expect(api['updateAddOn']).toHaveBeenCalledWith(9, { active: false });

    confirmSpy.mockReturnValue(false);
    api['updateService'].mockClear();
    comp.toggleActive('service', services[0]);
    expect(api['updateService']).not.toHaveBeenCalled();
  });
});
