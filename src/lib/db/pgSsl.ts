/**
 * Full certificate verification (Node's default trusted CA store) for all
 * raw `pg` connections. Supabase's Postgres endpoints, both the direct
 * connection and the Supavisor pooler, present certificates that chain to
 * a public CA, so this works without extra configuration in the normal case.
 *
 * If you hit a "self-signed certificate" or "unable to verify the first
 * certificate" error, download the CA certificate from Supabase's dashboard
 * (Project Settings -> Database -> SSL Configuration) and set
 * SUPABASE_DB_CA_CERT to its full PEM contents.
 */
export function getPgSsl(): { rejectUnauthorized: true; ca?: string } {
  const ca = process.env.SUPABASE_DB_CA_CERT;
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}
