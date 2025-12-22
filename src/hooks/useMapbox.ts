import { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';

const MAPBOX_TOKEN_KEY = 'vimatch_mapbox_token';

export const useMapbox = () => {
  const [token, setToken] = useState<string>(() => {
    return localStorage.getItem(MAPBOX_TOKEN_KEY) || '';
  });
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const saveToken = useCallback((newToken: string) => {
    localStorage.setItem(MAPBOX_TOKEN_KEY, newToken);
    setToken(newToken);
  }, []);

  const validateToken = useCallback(async (tokenToValidate: string) => {
    if (!tokenToValidate) {
      setIsTokenValid(false);
      return false;
    }
    
    setIsLoading(true);
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/test.json?access_token=${tokenToValidate}`
      );
      const valid = response.ok;
      setIsTokenValid(valid);
      if (valid) {
        saveToken(tokenToValidate);
      }
      return valid;
    } catch {
      setIsTokenValid(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [saveToken]);

  const getUserLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [position.coords.longitude, position.coords.latitude];
        setUserLocation(coords);
      },
      (error) => {
        console.error('Error getting location:', error);
        // Default to Huesca, Spain
        setUserLocation([-0.4087, 42.1401]);
      },
      { enableHighAccuracy: true }
    );
  }, []);

  const watchUserLocation = useCallback(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const coords: [number, number] = [position.coords.longitude, position.coords.latitude];
        setUserLocation(coords);
        
        if (userMarkerRef.current) {
          userMarkerRef.current.setLngLat(coords);
        }
      },
      (error) => console.error('Location watch error:', error),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (token) {
      validateToken(token);
    }
  }, []);

  useEffect(() => {
    getUserLocation();
  }, [getUserLocation]);

  return {
    token,
    isTokenValid,
    isLoading,
    validateToken,
    saveToken,
    userLocation,
    getUserLocation,
    watchUserLocation,
    mapRef,
    userMarkerRef,
  };
};
