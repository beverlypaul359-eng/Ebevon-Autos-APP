const passport        = require('passport');
const GoogleStrategy  = require('passport-google-oauth20').Strategy;
const FacebookStrategy= require('passport-facebook').Strategy;
const JwtStrategy     = require('passport-jwt').Strategy;
const ExtractJwt      = require('passport-jwt').ExtractJwt;
const config          = require('../config');
const { query, withTransaction } = require('../db/pool');
const logger          = require('../utils/logger');

/* ══════════════════════════════════════════════
   JWT Strategy (used by authenticate middleware)
══════════════════════════════════════════════ */
passport.use(new JwtStrategy(
  {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey:    config.jwt.secret,
  },
  async (payload, done) => {
    try {
      const { rows } = await query('SELECT * FROM users WHERE id=$1', [payload.sub]);
      if (!rows.length) return done(null, false);
      done(null, rows[0]);
    } catch (err) {
      done(err);
    }
  }
));

/* ══════════════════════════════════════════════
   Shared OAuth upsert logic
══════════════════════════════════════════════ */
const upsertOAuthUser = async (provider, profile, accessToken, refreshToken) => {
  const email      = profile.emails?.[0]?.value || null;
  const firstName  = profile.name?.givenName  || profile.displayName?.split(' ')[0] || 'User';
  const lastName   = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
  const avatarUrl  = profile.photos?.[0]?.value || null;
  const providerUid= profile.id;

  return withTransaction(async (client) => {
    // Check if OAuth account already linked
    const { rows: existing } = await client.query(
      `SELECT u.* FROM oauth_accounts oa
       JOIN users u ON u.id = oa.user_id
       WHERE oa.provider=$1 AND oa.provider_uid=$2`,
      [provider, providerUid]
    );
    if (existing.length) {
      // Update tokens
      await client.query(
        `UPDATE oauth_accounts SET access_token=$1, refresh_token=$2 WHERE provider=$3 AND provider_uid=$4`,
        [accessToken, refreshToken || null, provider, providerUid]
      );
      await client.query(`UPDATE users SET last_login_at=NOW() WHERE id=$1`, [existing[0].id]);
      return existing[0];
    }

    // Check if user exists by email
    let user;
    if (email) {
      const { rows } = await client.query(`SELECT * FROM users WHERE email=$1`, [email]);
      user = rows[0] || null;
    }

    // Create user if not found
    if (!user) {
      const { rows } = await client.query(
        `INSERT INTO users (email, first_name, last_name, avatar_url, role, status, email_verified)
         VALUES ($1,$2,$3,$4,'buyer','active',TRUE) RETURNING *`,
        [email, firstName, lastName, avatarUrl]
      );
      user = rows[0];
    }

    // Link OAuth account
    await client.query(
      `INSERT INTO oauth_accounts (user_id, provider, provider_uid, access_token, refresh_token, profile_data)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (provider, provider_uid) DO UPDATE
         SET access_token=$4, refresh_token=$5`,
      [user.id, provider, providerUid, accessToken, refreshToken || null, JSON.stringify(profile._json)]
    );

    await client.query(`UPDATE users SET last_login_at=NOW() WHERE id=$1`, [user.id]);
    return user;
  });
};

/* ══════════════════════════════════════════════
   GOOGLE STRATEGY
══════════════════════════════════════════════ */
if (config.google.clientId) {
  passport.use(new GoogleStrategy(
    {
      clientID:     config.google.clientId,
      clientSecret: config.google.clientSecret,
      callbackURL:  config.google.callbackUrl,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await upsertOAuthUser('google', profile, accessToken, refreshToken);
        done(null, user);
      } catch (err) {
        logger.error('Google OAuth error:', err);
        done(err);
      }
    }
  ));
}

/* ══════════════════════════════════════════════
   FACEBOOK STRATEGY
══════════════════════════════════════════════ */
if (config.facebook.appId) {
  passport.use(new FacebookStrategy(
    {
      clientID:     config.facebook.appId,
      clientSecret: config.facebook.appSecret,
      callbackURL:  config.facebook.callbackUrl,
      profileFields: ['id', 'emails', 'name', 'picture.type(large)'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await upsertOAuthUser('facebook', profile, accessToken, refreshToken);
        done(null, user);
      } catch (err) {
        logger.error('Facebook OAuth error:', err);
        done(err);
      }
    }
  ));
}

module.exports = passport;
