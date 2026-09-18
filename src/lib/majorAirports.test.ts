import { describe, it, expect } from 'vitest';
import { findMatchingAirport, MAJOR_AIRPORTS } from './majorAirports';

describe('findMatchingAirport', () => {
  it('returns null for queries unrelated to airports', () => {
    expect(findMatchingAirport('Restaurante Casa Pepe')).toBeNull();
    expect(findMatchingAirport('')).toBeNull();
    expect(findMatchingAirport('   ')).toBeNull();
  });

  it('matches a specific airport by city name, without the word "aeropuerto"', () => {
    const result = findMatchingAirport('ibiza');
    expect(result?.name).toBe('Aeropuerto de Ibiza');
  });

  it('matches a specific airport when both "aeropuerto" and a city are present', () => {
    const result = findMatchingAirport('aeropuerto de Barcelona');
    expect(result?.name).toContain('Barcelona');
  });

  it('is accent- and case-insensitive', () => {
    expect(findMatchingAirport('AEROPUERTO DE MÁLAGA')?.name).toContain('Málaga');
    expect(findMatchingAirport('malaga')?.name).toContain('Málaga');
  });

  it('matches alternate spellings via keywords (e.g. Eivissa for Ibiza)', () => {
    expect(findMatchingAirport('vuelo a eivissa')?.name).toBe('Aeropuerto de Ibiza');
  });

  it('picks the closest airport for a bare "aeropuerto" query when the user location is known', () => {
    // Ubicación cerca de Ibiza — debe ganar el aeropuerto de Ibiza, no Madrid.
    const ibizaLocation: [number, number] = [38.9067, 1.4198];
    const result = findMatchingAirport('aeropuerto', ibizaLocation);
    expect(result?.name).toBe('Aeropuerto de Ibiza');
  });

  it('falls back to the first airport in the list for a bare "aeropuerto" query with no known location', () => {
    const result = findMatchingAirport('aeropuerto', null);
    expect(result).toEqual(MAJOR_AIRPORTS[0]);
  });

  it('does not match a generic query that merely contains an unrelated substring', () => {
    // "aero" solo no debe disparar el match genérico de "aeropuerto".
    expect(findMatchingAirport('aeromodelismo')).toBeNull();
  });
});
