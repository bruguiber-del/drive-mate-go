import { useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

/** All section/modal names reachable from the settings menu */

export type AppSection = 'profile' | 'history' | 'wallet' | 'help' | 'security';

interface UseUIModalsReturn {

  // Visibility flags

  showSettingsMenu: boolean;

  showProfile: boolean;

  showHistory: boolean;

  showWallet: boolean;

  showHelp: boolean;

  showMatchPopup: boolean;

  showNavigationSearch: boolean;

  showPassengerSearch: boolean;

  showDriverSettings: boolean;

  showPassengerSettings: boolean;

  // Openers / closers

  openSettingsMenu: () => void;

  closeSettingsMenu: () => void;

  openProfile: () => void;

  closeProfile: () => void;

  openHistory: () => void;

  closeHistory: () => void;

  openWallet: () => void;

  closeWallet: () => void;

  openHelp: () => void;

  closeHelp: () => void;

  openMatchPopup: () => void;

  closeMatchPopup: () => void;

  openNavigationSearch: () => void;

  closeNavigationSearch: () => void;

  openPassengerSearch: () => void;

  closePassengerSearch: () => void;

  openDriverSettings: () => void;

  closeDriverSettings: () => void;

  openPassengerSettings: () => void;

  closePassengerSettings: () => void;

  /** Routes a section name (from SettingsMenu) to the correct open call */

  handleMenuNavigate: (section: AppSection | string) => void;

}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUIModals(): UseUIModalsReturn {

  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  const [showProfile, setShowProfile] = useState(false);

  const [showHistory, setShowHistory] = useState(false);

  const [showWallet, setShowWallet] = useState(false);

  const [showHelp, setShowHelp] = useState(false);

  const [showMatchPopup, setShowMatchPopup] = useState(false);

  const [showNavigationSearch, setShowNavigationSearch] = useState(false);

  const [showPassengerSearch, setShowPassengerSearch] = useState(false);

  const [showDriverSettings, setShowDriverSettings] = useState(false);

  const [showPassengerSettings, setShowPassengerSettings] = useState(false);

  // ── Stable toggle pairs ─────────────────────────────────────────────────────

  const openSettingsMenu = useCallback(() => setShowSettingsMenu(true), []);

  const closeSettingsMenu = useCallback(() => setShowSettingsMenu(false), []);

  const openProfile = useCallback(() => setShowProfile(true), []);

  const closeProfile = useCallback(() => setShowProfile(false), []);

  const openHistory = useCallback(() => setShowHistory(true), []);

  const closeHistory = useCallback(() => setShowHistory(false), []);

  const openWallet = useCallback(() => setShowWallet(true), []);

  const closeWallet = useCallback(() => setShowWallet(false), []);

  const openHelp = useCallback(() => setShowHelp(true), []);

  const closeHelp = useCallback(() => setShowHelp(false), []);

  const openMatchPopup = useCallback(() => setShowMatchPopup(true), []);

  const closeMatchPopup = useCallback(() => setShowMatchPopup(false), []);

  const openNavigationSearch = useCallback(() => setShowNavigationSearch(true), []);

  const closeNavigationSearch = useCallback(() => setShowNavigationSearch(false), []);

  const openPassengerSearch = useCallback(() => setShowPassengerSearch(true), []);

  const closePassengerSearch = useCallback(() => setShowPassengerSearch(false), []);

  const openDriverSettings = useCallback(() => setShowDriverSettings(true), []);

  const closeDriverSettings = useCallback(() => setShowDriverSettings(false), []);

  const openPassengerSettings = useCallback(() => setShowPassengerSettings(true), []);

  const closePassengerSettings = useCallback(() => setShowPassengerSettings(false), []);

  // ── Menu router ─────────────────────────────────────────────────────────────

  const handleMenuNavigate = useCallback(

    (section: AppSection | string) => {

      closeSettingsMenu();

      const map: Record<string, () => void> = {

        profile: openProfile,

        security: openProfile, // security shares the profile sheet

        history: openHistory,

        wallet: openWallet,

        help: openHelp,

      };

      map[section]?.();

    },

    [closeSettingsMenu, openProfile, openHistory, openWallet, openHelp],

  );

  return {

    showSettingsMenu,

    showProfile,

    showHistory,

    showWallet,

    showHelp,

    showMatchPopup,

    showNavigationSearch,

    showPassengerSearch,

    showDriverSettings,

    showPassengerSettings,

    openSettingsMenu,

    closeSettingsMenu,

    openProfile,

    closeProfile,

    openHistory,

    closeHistory,

    openWallet,

    closeWallet,

    openHelp,

    closeHelp,

    openMatchPopup,

    closeMatchPopup,

    openNavigationSearch,

    closeNavigationSearch,

    openPassengerSearch,

    closePassengerSearch,

    openDriverSettings,

    closeDriverSettings,

    openPassengerSettings,

    closePassengerSettings,

    handleMenuNavigate,

  };

}
