/** What a sample's error code means, in words a visitor can act on. */
const SAMPLE_ERRORS: Record<string, string> = {
  timeout: "No answer arrived in time",
  connection_refused: "The machine answered, but nothing accepts connections on that port",
  connection_reset: "The connection was reset",
  host_unreachable: "No route to the host",
  network_unreachable: "No route to the network",
  tls_error: "The TLS handshake failed",
  tls_certificate_invalid: "The server's certificate could not be trusted",
  protocol_error: "The server did not answer with valid HTTP",
  too_many_redirects: "The redirect limit was reached",
  redirect_blocked: "A redirect pointed somewhere that is not allowed",
  dns_failure: "A name could not be resolved",
  unsupported_family: "The node has no connectivity for this IP version",
  permission_denied: "The node is not allowed to run this probe",
  send_failed: "The probe could not be sent",
};

export function explainError(code: string | null | undefined): string {
  if (!code) return "Error";
  return SAMPLE_ERRORS[code] ?? code.replaceAll("_", " ");
}

const SHORT: Record<string, string> = {
  timeout: "Timed out",
  connection_refused: "Refused",
  connection_reset: "Reset",
  host_unreachable: "No route",
  network_unreachable: "No route",
  tls_error: "TLS error",
  tls_certificate_invalid: "Bad certificate",
  protocol_error: "Not HTTP",
  too_many_redirects: "Too many redirects",
  redirect_blocked: "Redirect blocked",
  dns_failure: "DNS failed",
  unsupported_family: "Wrong IP version",
};

/** A few words for a table cell; the full sentence is in the row's details. */
export function shortError(code: string | null | undefined): string {
  if (!code) return "Error";
  return SHORT[code] ?? code.replaceAll("_", " ");
}
