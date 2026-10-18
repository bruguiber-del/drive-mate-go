import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRealRoute } from '@/lib/mapboxDirections';
import { usePassengerSimulation } from './usePassengerSimulation';

vi.mock('@/lib/mapboxDirections', () => ({ fetchRealRoute: vi.fn() }));

const route: [number, number][] = Array.from({ length: 30 }, (_, i) => [40 + i * 0.002, -3]);
const initial = { enabled: true, userLocation: [40, -3] as [number, number], driverRoute: route, maxDetourMinutes: 5 };

describe('espera de pasajeros simulados', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.mocked(fetchRealRoute).mockResolvedValue(null);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });

  it('intenta buscar al segundo y reintenta cada cinco segundos si no encuentra ruta', async () => {
    renderHook(() => usePassengerSimulation(initial));
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(fetchRealRoute).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchRealRoute).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fetchRealRoute).toHaveBeenCalledTimes(6);
  });

  it('los cambios GPS no reinician la espera', async () => {
    const { rerender } = renderHook((props) => usePassengerSimulation(props), { initialProps: initial });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    rerender({ ...initial, userLocation: [40.0001, -3] });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(fetchRealRoute).toHaveBeenCalledTimes(3);
    expect(vi.mocked(fetchRealRoute).mock.calls[0][0][0]).toEqual({ lat: 40.0001, lng: -3 });
  });

  it('cambiar el desvío permitido adelanta el siguiente intento a un segundo', async () => {
    const { rerender } = renderHook((props) => usePassengerSimulation(props), { initialProps: initial });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    vi.mocked(fetchRealRoute).mockClear();
    rerender({ ...initial, maxDetourMinutes: 10 });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(fetchRealRoute).toHaveBeenCalledTimes(3);
  });

  it('ofrece un pasajero en una ruta urbana menor de dos kilómetros con desvío cero', async () => {
    vi.mocked(fetchRealRoute).mockResolvedValue({ durationS: 120, distanceM: 700 });
    const shortRoute: [number, number][] = Array.from({ length: 30 }, (_, i) => [40 + i * 0.0003, -3]);
    const { result } = renderHook(() => usePassengerSimulation({ ...initial, driverRoute: shortRoute, maxDetourMinutes: 0 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.currentPassenger?.tripDistanceKm).toBe(0.7);
    expect(result.current.currentPassenger?.detourMinutes).toBe(0);
    const pickup = result.current.currentPassenger?.origin;
    expect(shortRoute.some(([lat, lng]) => lat === pickup?.lat && lng === pickup?.lng)).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fetchRealRoute).toHaveBeenCalledTimes(3);
  });
});