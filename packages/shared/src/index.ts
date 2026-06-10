export const HEALTHCHECK_PATH = "/health";

export interface HealthcheckResponse {
  status: "ok";
  service: "api";
}
