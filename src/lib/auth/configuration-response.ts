export function authenticationConfigurationUnavailableResponse() {
  return Response.json(
    { error: "Layanan autentikasi sedang tidak tersedia." },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}
