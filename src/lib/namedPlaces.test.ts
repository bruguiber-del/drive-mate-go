import { describe, it, expect } from 'vitest';
import { findNamedPlace, NAMED_PLACES } from './namedPlaces';

describe('findNamedPlace', () => {
  it('returns null for queries unrelated to any known category', () => {
    expect(findNamedPlace('Restaurante Casa Pepe')).toBeNull();
    expect(findNamedPlace('')).toBeNull();
    expect(findNamedPlace('   ')).toBeNull();
  });

  it('matches a specific airport by city name, without the word "aeropuerto"', () => {
    const result = findNamedPlace('ibiza');
    expect(result?.name).toBe('Aeropuerto de Ibiza');
  });

  it('matches a specific airport when both "aeropuerto" and a city are present', () => {
    const result = findNamedPlace('aeropuerto de Barcelona');
    expect(result?.name).toContain('Barcelona');
  });

  it('is accent- and case-insensitive', () => {
    expect(findNamedPlace('AEROPUERTO DE MÁLAGA')?.name).toContain('Málaga');
    expect(findNamedPlace('malaga')?.name).toContain('Málaga');
  });

  it('matches alternate spellings via keywords (e.g. Eivissa for Ibiza)', () => {
    expect(findNamedPlace('vuelo a eivissa')?.name).toBe('Aeropuerto de Ibiza');
  });

  it('matches a place regardless of extra qualifier words like "salidas"/"llegadas"', () => {
    expect(findNamedPlace('salidas aeropuerto ibiza')?.name).toBe('Aeropuerto de Ibiza');
    expect(findNamedPlace('llegadas aeropuerto ibiza')?.name).toBe('Aeropuerto de Ibiza');
  });

  it('picks the closest airport for a bare "aeropuerto" query when the user location is known', () => {
    // Ubicación cerca de Ibiza — debe ganar el aeropuerto de Ibiza, no Madrid.
    const ibizaLocation: [number, number] = [38.9067, 1.4198];
    const result = findNamedPlace('aeropuerto', ibizaLocation);
    expect(result?.name).toBe('Aeropuerto de Ibiza');
  });

  it('falls back to the first airport in the list for a bare "aeropuerto" query with no known location', () => {
    const result = findNamedPlace('aeropuerto', null);
    expect(result).toEqual(NAMED_PLACES.find((p) => p.category === 'airport'));
  });

  it('does not match a generic query that merely contains an unrelated substring', () => {
    // "aero" solo no debe disparar el match genérico de "aeropuerto".
    expect(findNamedPlace('aeromodelismo')).toBeNull();
  });

  it('matches a venue missing from Mapbox by its own keywords, even with an extra generic word', () => {
    const result = findNamedPlace('blanca dona pabellón');
    expect(result?.name).toBe('Poliesportiu Sa Blanca Dona');
  });

  it('matches the same venue via its full "sa blanca dona" keyword', () => {
    expect(findNamedPlace('sa blanca dona')?.name).toBe('Poliesportiu Sa Blanca Dona');
  });
});
