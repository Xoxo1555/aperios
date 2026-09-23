/* Réglages d'environnement du harnais verify-auth-limits — DOIT être le premier
 * import du script (l'ordre des imports statiques est préservé par le
 * transformateur) pour que lib/auth.ts voie JWT_SECRET à l'import. */
process.env.JWT_SECRET = "verify_auth_limits_jwt_secret";
process.env.APERIO_MAILER_SINK = "1";
delete process.env.SMTP_HOST;
delete process.env.TRUST_PROXY_HEADERS;