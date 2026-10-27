// Aviso de "pasajero nuevo" — un tono corto generado con Web Audio (sin
// depender de ningún archivo de audio) más vibración si el dispositivo la
// soporta. No hace falta tener la app en primer plano mirando la pantalla
// para darse cuenta de que hay alguien esperando.
let audioCtx: AudioContext | null = null;

export function playNewPassengerAlert() {
  try {
    navigator.vibrate?.(200);
  } catch {
    /* no vibration API on this device */
  }

  try {
    audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = freq;
      oscillator.type = 'sine';
      const start = now + i * 0.14;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.13);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.14);
    });
  } catch {
    /* el navegador puede bloquear audio sin interacción previa del usuario — no es crítico */
  }
}
