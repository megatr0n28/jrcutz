export interface AvailabilityBlock {
  id?: number;
  barberId?: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  lunchStart?: string | null;
  lunchEnd?: string | null;
}