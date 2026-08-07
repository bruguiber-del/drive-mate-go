import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getDriverLocation from "./tools/get-driver-location";
import getDriverPositionHistory from "./tools/get-driver-position-history";
import calculateTripPrice from "./tools/calculate-trip-price";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "vimatch",
  title: "VIMATCH",
  version: "0.1.0",
  instructions:
    "Herramientas de VIMATCH, la app de viajes compartidos en trayectos diarios. Consulta la ubicación y el histórico GPS de un viaje y calcula la compensación por compartir gastos.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getDriverLocation, getDriverPositionHistory, calculateTripPrice],
});
