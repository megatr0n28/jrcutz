export interface AvailabilityBlock {
  id?: number;
  barberId?: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}