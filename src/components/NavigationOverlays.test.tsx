import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Navigation } from 'lucide-react';
import NavigationOverlays from './NavigationOverlays';

const baseProps = {
  isNavigating: false,
  showActiveTrip: false,
  isDriverMode: false,
  activeTripRole: 'driver' as const,
  hasPassenger: false,
  hasStartedDriving: false,
  currentStep: null,
  ManeuverIcon: Navigation,
  currentLeg: 'to_destination' as const,
  currentTargetName: null,
  dynamicETA: null,
  detourMinutes: null,
  driverSeats: 3,
  driverMaxDetour: 5,
  activeVehiclePlate: undefined,
  isDoorToDoor: false,
  hasMeetingPoint: false,
  walkingRouteData: null,
};

const currentStep = {
  instruction: 'Gira a la derecha',
  distance: 250,
  duration: 30,
  maneuver: { type: 'turn', modifier: 'right', location: [0, 0] as [number, number] },
};

describe('NavigationOverlays', () => {
  it('shows only the logo when idle (no navigation, no trip)', () => {
    const { container } = render(<NavigationOverlays {...baseProps} />);
    const text = container.textContent ?? '';
    expect(text).toContain('MATCH');
    expect(text).not.toContain('Gira a la derecha');
    expect(text).not.toContain('Conductor activo');
  });

  it('shows the turn-by-turn banner while navigating without an active trip, and hides the logo', () => {
    const { container } = render(
      <NavigationOverlays {...baseProps} isNavigating hasStartedDriving currentStep={currentStep} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Gira a la derecha');
    expect(text).toContain('En 250m');
    expect(text).not.toContain('MATCH');
    // La versión "aviso unificado" (con la fase del viaje) no debe aparecer sin viaje activo.
    expect(text).not.toContain('Continúa a tu destino');
  });

  it('shows the compact phase chip for an active driver trip before turn-by-turn starts', () => {
    const { container } = render(
      <NavigationOverlays
        {...baseProps}
        showActiveTrip
        activeTripRole="driver"
        hasPassenger
        hasStartedDriving={false}
        currentLeg="to_pickup"
        currentTargetName="Calle Mayor"
        dynamicETA={{ minutes: 8 }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Ve a recoger al pasajero');
    expect(text).toContain('Calle Mayor');
    expect(text).toContain('8 min');
    // El banner de giro a giro no debe aparecer todavía (no hay currentStep).
    expect(text).not.toContain('Gira a la derecha');
  });

  it('shows the unified banner (maneuver + phase) once driving starts on an active trip, not the compact chip', () => {
    const { container } = render(
      <NavigationOverlays
        {...baseProps}
        showActiveTrip
        activeTripRole="driver"
        hasPassenger
        hasStartedDriving
        currentStep={currentStep}
        currentLeg="to_dropoff"
        dynamicETA={{ minutes: 5 }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Gira a la derecha');
    expect(text).toContain('Lleva al pasajero a su destino');
    // La instrucción de giro solo debe aparecer una vez (no coexisten el
    // banner "solo navegando" y el "aviso unificado" a la vez).
    const occurrences = text.split('Gira a la derecha').length - 1;
    expect(occurrences).toBe(1);
  });

  it('shows the driver status chip only outside an active trip', () => {
    const { container } = render(
      <NavigationOverlays {...baseProps} isDriverMode driverSeats={3} driverMaxDetour={5} activeVehiclePlate="1234ABC" />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Conductor activo');
    expect(text).toContain('1234ABC');
  });

  it('hides the driver status chip once a trip is active', () => {
    const { container } = render(<NavigationOverlays {...baseProps} isDriverMode showActiveTrip />);
    expect(container.textContent ?? '').not.toContain('Conductor activo');
  });

  it('shows the walking chip only for a passenger with a meeting point and no door-to-door', () => {
    const { container } = render(
      <NavigationOverlays
        {...baseProps}
        showActiveTrip
        activeTripRole="passenger"
        hasMeetingPoint
        isDoorToDoor={false}
        walkingRouteData={{ duration: 300, distance: 400 }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Camina al punto de encuentro');
    expect(text).toContain('5 min');
  });

  it('hides the walking chip when the trip is door-to-door', () => {
    const { container } = render(
      <NavigationOverlays
        {...baseProps}
        showActiveTrip
        activeTripRole="passenger"
        hasMeetingPoint
        isDoorToDoor
        walkingRouteData={{ duration: 300, distance: 400 }}
      />,
    );
    expect(container.textContent ?? '').not.toContain('Camina al punto de encuentro');
  });
});
